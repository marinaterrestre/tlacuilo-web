import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/cancelar?token=<rsvp_token>
 * El enlace del correo de confirmación. Sin sesión: el token es la llave.
 *
 * Cancelar no borra nada: los objetos vuelven al morral de la persona, tal
 * cual los escogió, y el libro se libera para quien lo esté esperando. La
 * biblioteca deja de esperarla ese día, que es todo lo que necesitamos saber.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''

  const pagina = (titulo: string, cuerpo: string) =>
    new NextResponse(
      `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo} · tlacuilo</title></head>
<body style="margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#15151D;color:#ECEAF0;font-family:'Courier New',Courier,monospace;padding:32px;text-align:center;">
<p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#888;margin:0;">&gt; tlacuilo · biblioteca pública</p>
<h1 style="font-size:22px;font-weight:500;margin:0;">${titulo}</h1>
<p style="font-size:14px;color:#c5c5e8;max-width:44ch;margin:0;line-height:1.6;">${cuerpo}</p>
<a href="https://www.tlacuilo.org/mi-tlacuilo" style="color:#B8F200;font-size:13px;">→ mi tlacuilo</a>
</body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )

  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return pagina('algo se rompió', 'este enlace no es válido. escríbenos a tlacuilo@tlacuilo.org.')
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: ancla } = await admin
    .from('prestamos')
    .select('user_id, visit_at, status')
    .eq('rsvp_token', token)
    .maybeSingle()

  if (!ancla || ancla.status !== 'apartado' || !ancla.visit_at) {
    return pagina(
      'este enlace ya no aplica',
      'esa visita ya pasó, ya se entregó en la biblioteca, o ya estaba cancelada. si algo no cuadra escríbenos a tlacuilo@tlacuilo.org.'
    )
  }

  const { error } = await admin
    .from('prestamos')
    .update({
      status: 'morral',
      visit_at: null,
      confirmado_at: null,
      asistencia: null,
      recordatorio_cita_enviado_at: null,
    })
    .eq('user_id', ancla.user_id)
    .eq('visit_at', ancla.visit_at)
    .eq('status', 'apartado')

  if (error) {
    return pagina('no pudimos cancelarla', 'inténtalo otra vez o escríbenos a tlacuilo@tlacuilo.org.')
  }

  return pagina(
    'listo, ya no te esperamos.',
    'gracias por avisar, en serio. tus objetos siguen en tu morral, tal cual los escogiste, y puedes agendar otro día cuando quieras.'
  )
}
