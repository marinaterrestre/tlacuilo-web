import { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { emailReagendarReserva, type LibroEmail } from '@/lib/emails/templates'
import { REMITENTE } from '@/lib/server/editor'

/**
 * Una reserva que se pasó sin que la confirmáramos no se borra: los libros
 * regresan al morral de esa persona, tal cual los escogió, y le llega un
 * correo de disculpa con el botón para elegir nuevo día.
 *
 * Como el catálogo solo se bloquea al recoger, devolver a morral libera el
 * libro y conserva la selección al mismo tiempo. Una acción, dos cosas.
 */
export type ResultadoReagendar = {
  handle: string
  /** A quién se le escribió. No confundir con el resultado del envío. */
  destinatario: string
  correo?: string
  libros: number
  visitAt: string
  devueltosAlMorral?: number
  error?: string
}

export async function reagendarVisita(
  service: SupabaseClient,
  userId: string,
  visitAt: string,
  opts: { dry?: boolean } = {}
): Promise<ResultadoReagendar> {
  const { data: prestamos, error } = await service
    .from('prestamos')
    .select('id, libros (titulo, autor)')
    .eq('user_id', userId)
    .eq('status', 'apartado')
    .eq('visit_at', visitAt)

  const [{ data: perfil }, { data: lector }] = await Promise.all([
    service.from('perfiles').select('handle').eq('id', userId).single(),
    service.auth.admin.getUserById(userId),
  ])
  const handle = perfil?.handle ?? 'lector'
  const email = lector?.user?.email ?? ''
  const base: ResultadoReagendar = { handle, destinatario: email || 'sin correo', libros: prestamos?.length ?? 0, visitAt }

  if (error) return { ...base, error: error.message }
  if (!prestamos || prestamos.length === 0) return { ...base, error: 'sin préstamos para esa visita' }
  if (opts.dry) return base

  const ids = prestamos.map((p) => p.id)
  const { error: updErr } = await service
    .from('prestamos')
    .update({
      status: 'morral',
      visit_at: null,
      confirmado_at: null,
      asistencia: null,
      recordatorio_cita_enviado_at: null,
      reagendar_enviado_at: new Date().toISOString(),
    })
    .in('id', ids)
  if (updErr) return { ...base, error: updErr.message }

  if (!email) return { ...base, devueltosAlMorral: ids.length, error: 'lector sin correo' }

  const libros = prestamos.map((p) => p.libros) as unknown as LibroEmail[]
  const { subject, html, text } = emailReagendarReserva({ handle, libros, visitAt })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendErr } = await resend.emails.send({
    from: REMITENTE,
    to: email,
    subject,
    html,
    text,
  })

  return {
    ...base,
    devueltosAlMorral: ids.length,
    correo: sendErr ? sendErr.message : 'enviado',
    error: sendErr ? sendErr.message : undefined,
  }
}
