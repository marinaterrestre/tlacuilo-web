import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { emailResumenDiario, EMAILS_EQUIPO, type VisitaResumen, type PendienteResumen } from '@/lib/emails/templates'
import { REMITENTE, SITE_URL } from '@/lib/server/editor'
import { bloqueDeFecha } from '@/lib/horarios'

/**
 * GET /api/cron/resumen-diario
 * Un solo correo al equipo cada mañana: quién viene hoy y quién debe traer
 * libros. Reemplaza el correo por cada reserva, que llenaba la bandeja de
 * avisos sueltos que nadie leía completos.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * ?dry=1 devuelve el contenido sin mandarlo.
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

type Fila = {
  id: string
  user_id: string
  visit_at: string | null
  due_at: string | null
  libros: { titulo: string } | null
  perfiles: { handle: string | null; nombre_completo: string | null; telefono: string | null } | null
}

const quienEs = (p: Fila['perfiles']) =>
  p?.nombre_completo?.trim() || `@${p?.handle ?? 'sin alias'}`

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'no' }, { status: 401 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  const dry = req.nextUrl.searchParams.get('dry') === '1'

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const ahora = new Date()
  const inicio = new Date(ahora); inicio.setHours(0, 0, 0, 0)
  const fin = new Date(inicio); fin.setDate(fin.getDate() + 1)
  const ayer = new Date(inicio); ayer.setDate(ayer.getDate() - 1)
  const campos =
    'id, user_id, visit_at, due_at, libros (titulo), perfiles!prestamos_user_id_perfiles_fkey (handle, nombre_completo, telefono)'

  const [hoy, atrasados, nuevas] = await Promise.all([
    service
      .from('prestamos')
      .select(campos)
      .eq('status', 'apartado')
      .gte('visit_at', inicio.toISOString())
      .lt('visit_at', fin.toISOString()),
    service
      .from('prestamos')
      .select(campos)
      .eq('status', 'recogido')
      .lt('due_at', ahora.toISOString())
      .order('due_at'),
    service
      .from('prestamos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'apartado')
      .gte('added_at', ayer.toISOString()),
  ])

  const errores = hoy.error ?? atrasados.error
  if (errores) return NextResponse.json({ error: errores.message }, { status: 500 })

  // Una persona y un horario = una visita, aunque traiga cinco libros.
  const porVisita = new Map<string, VisitaResumen>()
  for (const f of (hoy.data ?? []) as unknown as Fila[]) {
    if (!f.visit_at) continue
    const key = `${f.user_id}|${f.visit_at}`
    if (!porVisita.has(key)) {
      porVisita.set(key, {
        quien: quienEs(f.perfiles),
        bloque: `${bloqueDeFecha(f.visit_at).label} ${bloqueDeFecha(f.visit_at).rango}`,
        objetos: 0,
        titulos: [],
        telefono: f.perfiles?.telefono ?? null,
        url: `${SITE_URL}/admin/visita/${f.user_id}/${encodeURIComponent(f.visit_at)}`,
      })
    }
    const v = porVisita.get(key)!
    v.objetos += 1
    if (f.libros?.titulo) v.titulos.push(f.libros.titulo)
  }

  const vencidos: PendienteResumen[] = ((atrasados.data ?? []) as unknown as Fila[]).map((f) => ({
    quien: quienEs(f.perfiles),
    titulo: f.libros?.titulo ?? '(sin título)',
    dias: f.due_at ? Math.floor((ahora.getTime() - new Date(f.due_at).getTime()) / 864e5) : 0,
    url: f.visit_at
      ? `${SITE_URL}/admin/visita/${f.user_id}/${encodeURIComponent(f.visit_at)}`
      : `${SITE_URL}/admin/persona/${f.user_id}`,
  }))

  const fecha = `${DIAS[ahora.getDay()]} ${ahora.getDate()} de ${MESES[ahora.getMonth()]}`
  const contenido = emailResumenDiario({
    fecha,
    visitas: [...porVisita.values()],
    vencidos,
    nuevasReservas: nuevas.count ?? 0,
  })

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry,
      para: EMAILS_EQUIPO,
      asunto: contenido.subject,
      texto: contenido.text,
    })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendErr } = await resend.emails.send({
    from: REMITENTE,
    to: EMAILS_EQUIPO,
    subject: contenido.subject,
    html: contenido.html,
    text: contenido.text,
  })

  return NextResponse.json({
    ok: !sendErr,
    visitas: porVisita.size,
    vencidos: vencidos.length,
    correo: sendErr ? sendErr.message : 'enviado',
  })
}
