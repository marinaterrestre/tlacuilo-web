import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { emailDevolucionVencida, type LibroEmail } from '@/lib/emails/templates'
import { REMITENTE } from '@/lib/server/editor'

/**
 * GET /api/cron/recordatorio-devolucion
 * El único vigilante del ciclo. No avisa antes de tiempo ni renueva solo:
 * la persona ve su contador en el librero y decide.
 *
 * Manda DOS correos en toda la vida de un préstamo, nunca más:
 *   1. el día siguiente de que se venció, pidiendo los libros y recordando
 *      que puede extender desde su perfil
 *   2. a los 15 días de vencido, un último "¿todo bien?", sin regaño
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * ?dry=1 dice a quién le tocaría sin mandar ni marcar nada.
 */

const DIAS_SEGUNDO_AVISO = 15

type Row = {
  id: string
  user_id: string
  due_at: string
  aviso_vencido_enviado_at: string | null
  recordatorio_final_enviado_at: string | null
  libros: { titulo: string; autor: string | null } | null
}

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
  const ayer = new Date(ahora.getTime() - 24 * 60 * 60 * 1000)
  const campos =
    'id, user_id, due_at, aviso_vencido_enviado_at, recordatorio_final_enviado_at, libros (titulo, autor)'

  const { data, error } = await service
    .from('prestamos')
    .select(campos)
    .eq('status', 'recogido')
    .lt('due_at', ayer.toISOString())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (data ?? []) as unknown as Row[]

  // Primer aviso: se venció ayer y nunca se le ha escrito.
  // Segundo y último: ya pasaron 15 días desde el primero.
  const primerAviso = filas.filter((f) => !f.aviso_vencido_enviado_at)
  const segundoAviso = filas.filter((f) => {
    if (!f.aviso_vencido_enviado_at) return false
    if (f.recordatorio_final_enviado_at) return false
    const desde = new Date(f.aviso_vencido_enviado_at).getTime()
    return ahora.getTime() - desde >= DIAS_SEGUNDO_AVISO * 24 * 60 * 60 * 1000
  })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const reporte: Record<string, unknown>[] = []

  async function mandar(
    rows: Row[],
    tanda: 'primero' | 'ultimo',
    campoSello: 'aviso_vencido_enviado_at' | 'recordatorio_final_enviado_at'
  ) {
    // Una persona = un correo, aunque traiga cinco libros.
    const grupos = new Map<string, Row[]>()
    for (const r of rows) {
      if (!grupos.has(r.user_id)) grupos.set(r.user_id, [])
      grupos.get(r.user_id)!.push(r)
    }

    for (const grupo of grupos.values()) {
      const userId = grupo[0].user_id
      const dueAt = grupo.map((g) => g.due_at).sort()[0]
      const [{ data: userRes }, { data: perfil }] = await Promise.all([
        service.auth.admin.getUserById(userId),
        service.from('perfiles').select('handle').eq('id', userId).single(),
      ])
      const email = userRes?.user?.email
      const handle = perfil?.handle ?? 'lector'
      const libros = grupo.map((g) => g.libros).filter(Boolean) as LibroEmail[]

      if (dry) {
        reporte.push({ tanda, handle, correo: email ?? 'sin correo', libros: libros.length, dueAt })
        continue
      }
      if (!email) continue

      const contenido = emailDevolucionVencida({ handle, libros, dueAt, ultimo: tanda === 'ultimo' })
      const { error: sendErr } = await resend.emails.send({
        from: REMITENTE,
        to: email,
        subject: contenido.subject,
        html: contenido.html,
        text: contenido.text,
      })
      if (sendErr) {
        reporte.push({ tanda, handle, error: sendErr.message })
        continue
      }
      await service
        .from('prestamos')
        .update({ [campoSello]: new Date().toISOString() })
        .in('id', grupo.map((g) => g.id))
      reporte.push({ tanda, handle, libros: libros.length, correo: 'enviado' })
    }
  }

  await mandar(primerAviso, 'primero', 'aviso_vencido_enviado_at')
  await mandar(segundoAviso, 'ultimo', 'recordatorio_final_enviado_at')

  return NextResponse.json({ ok: true, dry, avisos: reporte.length, detalle: reporte })
}
