import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * /api/baja?token=<token>
 *
 * Baja de un clic para el correo de lanzamiento.
 *
 * GET  → la persona hizo clic en el pie del correo. Marca la baja y le
 *        devuelve una página que se lo confirma.
 * POST → lo llama Gmail / Outlook / Apple Mail solos cuando la persona
 *        aprieta el botón nativo de "Cancelar suscripción" (RFC 8058).
 *        Marca la baja sin pedir confirmación y contesta 200 en seco.
 *
 * No hay sesión: el token ES la llave, y solo sirve para darse de baja.
 * Marcar `estado = 'baja'` saca a esa persona del envío por tandas, porque
 * el cron solo agarra filas en 'pendiente'.
 */

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

async function darDeBaja(token: string): Promise<'ok' | 'sin-token' | 'error'> {
  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY) return 'sin-token'

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data, error } = await admin
    .from('lista_lanzamiento')
    .update({ estado: 'baja', baja_at: new Date().toISOString() })
    .eq('token', token)
    .select('id')

  if (error) return 'error'
  if (!data || data.length === 0) return 'sin-token'
  return 'ok'
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const r = await darDeBaja(token)

  if (r === 'ok') {
    return pagina(
      'listo, te sacamos de la lista.',
      'no te vamos a volver a escribir. si algún día quieres pedir prestado, el catálogo sigue abierto y no necesitas este correo para entrar.'
    )
  }
  if (r === 'sin-token') {
    return pagina(
      'este enlace no es válido',
      'puede que ya te hayamos dado de baja antes. si sigues recibiendo correos nuestros, respóndenos con la palabra baja y lo arreglamos a mano.'
    )
  }
  return pagina(
    'algo se rompió de nuestro lado',
    'no pudimos guardar tu baja. respóndenos con la palabra baja y lo hacemos a mano.'
  )
}

/**
 * RFC 8058: el cliente de correo manda POST con el cuerpo
 * `List-Unsubscribe=One-Click`. No se le contesta html, solo un 200.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const r = await darDeBaja(token)
  if (r === 'error') {
    return new NextResponse('error', { status: 500 })
  }
  return new NextResponse('ok', { status: 200 })
}
