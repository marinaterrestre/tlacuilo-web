import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { emailLanzamiento } from '@/lib/emails/lanzamiento'

const SITE_URL = 'https://www.tlacuilo.org'
const TANDA = 100
const TANDA_MAX = 100

export const maxDuration = 60

type Fila = { id: string; correo: string; token: string }

/**
 * GET /api/cron/lanzamiento
 *
 * Manda UNA tanda de 100 correos de lanzamiento y se va. Lo dispara pg_cron
 * cada hora, así que la lista de 564 se acaba en 6 corridas.
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Por qué no se puede mandar doble:
 *   1. Primero "aparta" las 100 filas poniéndolas en 'enviando' con un
 *      update que exige que sigan en 'pendiente'. Postgres resuelve el
 *      empate si dos corridas se cruzan: la segunda no ve nada que apartar.
 *   2. Solo las filas que ese update devolvió se mandan.
 *   3. Al final quedan en 'enviado' con su id de Resend, o en 'error' con
 *      el mensaje. Si algo queda atorado en 'enviando' es que la corrida se
 *      murió a media tanda: se ve en la tabla y se decide a mano.
 *
 * Se usa fetch contra /emails/batch en lugar del SDK porque el batch acepta
 * cabeceras distintas por destinatario, y cada persona necesita SU link de
 * baja en List-Unsubscribe.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'no' }, { status: 401 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'falta RESEND_API_KEY' }, { status: 500 })
  }

  // ?n=10 manda una tanda mas chica. Sirve para probar con poca gente y para
  // no pasarse del tope diario de Resend, que en el plan gratis son 100 al dia
  // contando los del resumen del equipo.
  const pedido = Number(req.nextUrl.searchParams.get('n'))
  const tanda =
    Number.isInteger(pedido) && pedido > 0 ? Math.min(pedido, TANDA_MAX) : TANDA

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // 1. ¿Quiénes siguen pendientes?
  const { data: candidatas, error: errSel } = await admin
    .from('lista_lanzamiento')
    .select('id')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })
    .limit(tanda)

  if (errSel) {
    return NextResponse.json({ error: errSel.message }, { status: 500 })
  }
  if (!candidatas || candidatas.length === 0) {
    const { count } = await admin
      .from('lista_lanzamiento')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'enviado')
    return NextResponse.json({ ok: true, terminado: true, enviados: 0, total_enviados: count ?? null })
  }

  // 2. Apartarlas. Solo se manda a las que este update alcanzó a cambiar.
  const { data: apartadas, error: errClaim } = await admin
    .from('lista_lanzamiento')
    .update({ estado: 'enviando' })
    .in('id', candidatas.map((c) => c.id))
    .eq('estado', 'pendiente')
    .select('id, correo, token')

  if (errClaim) {
    return NextResponse.json({ error: errClaim.message }, { status: 500 })
  }
  const filas = (apartadas ?? []) as Fila[]
  if (filas.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0, nota: 'otra corrida se las llevó' })
  }

  // 3. Armar la tanda. Cada quien con su link de baja.
  const payloads = filas.map((f) => {
    const bajaUrl = `${SITE_URL}/api/baja?token=${f.token}`
    const { subject, html, text } = emailLanzamiento({ bajaUrl })
    return {
      // tlacuilo@ y no hola@: hola@ no tiene buzon, no puede tener foto de
      // perfil en Gmail y nadie la lee. Resend confirmo entrega desde
      // tlacuilo@, asi que no hay razon para usar la otra.
      from: 'Tlacuilo <tlacuilo@tlacuilo.org>',
      to: [f.correo],
      reply_to: 'tlacuilo@tlacuilo.org',
      subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${bajaUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }
  })

  const marcarError = async (mensaje: string) => {
    await admin
      .from('lista_lanzamiento')
      .update({ estado: 'error', error: mensaje.slice(0, 500) })
      .in('id', filas.map((f) => f.id))
  }

  let ids: string[] = []
  try {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payloads),
    })
    const cuerpo = await res.text()
    if (!res.ok) {
      await marcarError(`resend ${res.status}: ${cuerpo}`)
      return NextResponse.json({ error: 'resend rechazó la tanda', status: res.status, cuerpo }, { status: 502 })
    }
    const json = JSON.parse(cuerpo) as { data?: { id: string }[] }
    ids = (json.data ?? []).map((d) => d.id)
  } catch (e) {
    await marcarError(e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'se cayó el envío' }, { status: 502 })
  }

  // 4. Cerrar cada fila con su id de Resend.
  const ahora = new Date().toISOString()
  await Promise.all(
    filas.map((f, i) =>
      admin
        .from('lista_lanzamiento')
        .update({ estado: 'enviado', enviado_at: ahora, resend_id: ids[i] ?? null })
        .eq('id', f.id)
    )
  )

  const { count: faltan } = await admin
    .from('lista_lanzamiento')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente')

  return NextResponse.json({ ok: true, enviados: filas.length, faltan: faltan ?? null })
}
