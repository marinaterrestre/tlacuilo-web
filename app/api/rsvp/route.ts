import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/rsvp?token=<rsvp_token>&r=si|no
 * Botones del correo de recordatorio. Sin sesión: el token es la llave.
 * - si: marca asistencia confirmada en todos los préstamos de esa visita.
 * - no: cancela la visita, los objetos vuelven al morral del usuario.
 * Devuelve una página mínima en la estética del sitio.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const r = req.nextUrl.searchParams.get('r') ?? ''

  const pagina = (titulo: string, cuerpo: string) =>
    new NextResponse(
      `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo} · tlacuilo</title></head>
<body style="margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#15151D;color:#ECEAF0;font-family:'Courier New',Courier,monospace;padding:32px;text-align:center;">
<p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#888;margin:0;">&gt; tlacuilo · biblioteca pública</p>
<h1 style="font-size:22px;font-weight:500;margin:0;">${titulo}</h1>
<p style="font-size:14px;color:#c5c5e8;max-width:42ch;margin:0;">${cuerpo}</p>
<a href="https://www.tlacuilo.org" style="color:#B8F200;font-size:13px;">→ tlacuilo.org</a>
</body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )

  if (!token || !['si', 'no'].includes(r) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return pagina('algo se rompió', 'este enlace no es válido. escríbenos a tlacuilo@tlacuilo.org.')
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: ancla } = await admin
    .from('prestamos')
    .select('id, user_id, visit_at, status')
    .eq('rsvp_token', token)
    .maybeSingle()

  if (!ancla || ancla.status !== 'apartado' || !ancla.visit_at) {
    return pagina(
      'este enlace ya no aplica',
      'la visita ya pasó, ya se confirmó en la biblioteca, o fue cancelada. si algo no cuadra: tlacuilo@tlacuilo.org.'
    )
  }

  if (r === 'si') {
    await admin
      .from('prestamos')
      .update({ asistencia: 'asistire' })
      .eq('user_id', ancla.user_id)
      .eq('visit_at', ancla.visit_at)
      .eq('status', 'apartado')
    return pagina('nos vemos.', 'tu visita queda confirmada. la dirección va en el correo de tu reserva confirmada.')
  }

  await admin
    .from('prestamos')
    .update({ status: 'morral', visit_at: null, asistencia: null, recordatorio_cita_enviado_at: null })
    .eq('user_id', ancla.user_id)
    .eq('visit_at', ancla.visit_at)
    .eq('status', 'apartado')
  return pagina(
    'visita cancelada.',
    'no pasa nada. tus objetos siguen en tu morral y puedes agendar otra visita cuando quieras desde mi tlacuilo.'
  )
}
