import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { emailReservaConfirmada, type LibroEmail } from '@/lib/emails/templates'

/**
 * POST /api/emails/confirmacion
 * Un EDITOR confirma una reserva desde el panel: marca confirmado_at en
 * todos los préstamos de esa visita y manda al lector el correo
 * "tu reserva está confirmada" con link de agregar a Google Calendar.
 *
 * Auth: Bearer <access_token> de un usuario con rol editor.
 * Body: { userId: string, visitAt: string (ISO) }
 */
export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'sin token' }, { status: 401 })

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ¿Quién llama? Debe ser editor. Se verifica con la sesión del propio
  // usuario (mismo patrón que /api/emails/cita y el gate del panel).
  const authed = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user: editor }, error: editorErr } = await authed.auth.getUser(token)
  if (editorErr || !editor) {
    return NextResponse.json({ error: 'sesión inválida' }, { status: 401 })
  }
  const { data: perfilEditor, error: perfilErr } = await authed
    .from('perfiles')
    .select('rol')
    .eq('id', editor.id)
    .single()
  if (perfilErr) {
    return NextResponse.json({ error: 'no pude leer tu perfil: ' + perfilErr.message }, { status: 500 })
  }
  if (perfilEditor?.rol !== 'editor') {
    return NextResponse.json({ error: `solo editores (tu rol: ${perfilEditor?.rol ?? 'sin perfil'})` }, { status: 403 })
  }

  let userId: string
  let visitAt: string
  let nota: string | null = null
  try {
    const body = await req.json()
    userId = String(body.userId)
    visitAt = String(body.visitAt)
    nota = body.nota ? String(body.nota).slice(0, 1000) : null
    if (!userId || Number.isNaN(Date.parse(visitAt))) throw new Error()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  // Préstamos de esa visita + datos del lector
  const [{ data: prestamos }, { data: perfil }, { data: lector }] = await Promise.all([
    service
      .from('prestamos')
      .select('id, rsvp_token, libros (titulo, autor)')
      .eq('user_id', userId)
      .eq('status', 'apartado')
      .eq('visit_at', visitAt),
    service.from('perfiles').select('handle').eq('id', userId).single(),
    service.auth.admin.getUserById(userId),
  ])

  if (!prestamos || prestamos.length === 0) {
    return NextResponse.json({ error: 'sin préstamos para esa visita' }, { status: 404 })
  }
  const email = lector?.user?.email
  if (!email) {
    return NextResponse.json({ error: 'lector sin correo' }, { status: 404 })
  }

  // Marcar confirmado
  const ids = prestamos.map((p) => p.id)
  const { error: updErr } = await service
    .from('prestamos')
    .update({ confirmado_at: new Date().toISOString() })
    .in('id', ids)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Correo al lector con link de Google Calendar
  const libros = prestamos.map((p) => p.libros) as unknown as LibroEmail[]
  // El token de un préstamo de la visita es la llave para soltarla completa.
  const tokenCancelar = prestamos.find((p) => p.rsvp_token)?.rsvp_token
  const { subject, html, text } = emailReservaConfirmada({
    handle: perfil?.handle ?? 'lector',
    libros,
    visitAt,
    nota,
    cancelUrl: tokenCancelar
      ? `https://www.tlacuilo.org/api/cancelar?token=${tokenCancelar}`
      : undefined,
  })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendErr } = await resend.emails.send({
    from: 'Tlacuilo <tlacuilo@tlacuilo.org>',
    to: email,
    subject,
    html,
    text,
  })

  return NextResponse.json({
    ok: !sendErr,
    confirmados: ids.length,
    correo: sendErr ? sendErr.message : 'enviado',
  })
}
