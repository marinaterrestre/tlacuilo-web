/**
 * Correo de lanzamiento del sitio, una sola vez, a la lista vieja del
 * formulario de Google (tabla `lista_lanzamiento`).
 *
 * `bajaUrl` es distinta para cada persona: lleva su token. Va en el pie del
 * correo y también en las cabeceras List-Unsubscribe, que es lo que hace que
 * Gmail y Outlook pinten el botón nativo de "Cancelar suscripción" arriba.
 */

export const ASUNTO_LANZAMIENTO = 'Te invitamos a conocer la nueva pagina de Tlacuilo'

export function emailLanzamiento({ bajaUrl }: { bajaUrl: string }): {
  subject: string
  html: string
  text: string
} {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>La nueva página de Tlacuilo</title>
</head>
<body style="margin: 0; padding: 0; background: #15151d; font-family: 'Courier New', Courier, monospace; color: #e8e8f0; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #15151d;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px;">

          <tr>
            <td style="padding-bottom: 28px;">
              <p style="margin: 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #888;">
                &gt; tlacuilo &middot; biblioteca p&uacute;blica
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 0 24px 0;">

              <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #e8e8f0; font-weight: 500;">
                Hola, Tlacuilx:
              </h1>

              <p style="margin: 0 0 18px 0; font-size: 15px; color: #c5c5e8;">
                Nos emociona invitarte a conocer nuestro nuevo sitio. Hace un tiempo llenaste el
                formulario para pedir libros prestados en Tlacuilo, y con esas solicitudes empez&oacute;
                todo esto.
              </p>

              <p style="margin: 0 0 18px 0; font-size: 15px; color: #c5c5e8;">
                Ya puedes entrar a <a href="https://www.tlacuilo.org" style="color: #B8F200; text-decoration: none;">tlacuilo.org</a>
                y ver el cat&aacute;logo completo en l&iacute;nea. Lo hicimos para que pedir prestado sea mucho
                m&aacute;s f&aacute;cil: creas tu cuenta, guardas en tu morral los libros que te interesan y
                eliges t&uacute; el d&iacute;a y la hora en que vienes por ellos. Ya no hay que llenar
                formularios ni esperar a que contestemos un correo.
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding: 0 0 28px 0;">
              <a href="https://www.tlacuilo.org/biblioteca" style="display: inline-block; background: #9091c4; color: #15151d; padding: 14px 22px; text-decoration: none; font-size: 14px; letter-spacing: 0.05em;">
                Conocer el cat&aacute;logo &rarr;
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 0 24px 0;">

              <p style="margin: 0 0 18px 0; font-size: 15px; color: #c5c5e8;">
                El morral tambi&eacute;n funciona como tu lista de deseos: si un t&iacute;tulo est&aacute; prestado
                en ese momento, lo guardas ah&iacute; y te esperas a que regrese.
              </p>

              <p style="margin: 0 0 18px 0; font-size: 15px; color: #c5c5e8;">
                Te esperamos en Coyoac&aacute;n.
              </p>

              <p style="margin: 0; font-size: 15px; color: #c5c5e8;">
                Si tienes cualquier duda escr&iacute;benos a
                <a href="mailto:hola@tlacuilo.org" style="color: #B8F200; text-decoration: none;">hola@tlacuilo.org</a>,
                ese correo s&iacute; lo leemos.
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding-top: 24px; border-top: 1px solid #2a2a3a; font-size: 11px; color: #666; letter-spacing: 0.05em;">
              <p style="margin: 0;">tlacuilo. biblioteca p&uacute;blica en coyoac&aacute;n.</p>
              <p style="margin: 4px 0 0 0;">coyoac&aacute;n &middot; cdmx</p>
              <p style="margin: 12px 0 0 0; font-size: 10px; color: #666;">
                Recibes este correo porque dejaste tu correo en el formulario de pr&eacute;stamos de Tlacuilo.
                Si prefieres no recibir m&aacute;s correos nuestros,
                <a href="${bajaUrl}" style="color: #9091c4; text-decoration: underline;">da de baja tu correo aqu&iacute;</a>.
                Es un clic y no tienes que escribirnos nada.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `Hola, Tlacuilx:

Nos emociona invitarte a conocer nuestro nuevo sitio. Hace un tiempo llenaste el formulario para pedir libros prestados en Tlacuilo, y con esas solicitudes empezo todo esto.

Ya puedes entrar a tlacuilo.org y ver el catalogo completo en linea. Lo hicimos para que pedir prestado sea mucho mas facil: creas tu cuenta, guardas en tu morral los libros que te interesan y eliges tu el dia y la hora en que vienes por ellos. Ya no hay que llenar formularios ni esperar a que contestemos un correo.

Conocer el catalogo: https://www.tlacuilo.org/biblioteca

El morral tambien funciona como tu lista de deseos: si un titulo esta prestado en ese momento, lo guardas ahi y te esperas a que regrese.

Te esperamos en Coyoacan.

Si tienes cualquier duda escribenos a hola@tlacuilo.org, ese correo si lo leemos.

Recibes este correo porque dejaste tu correo en el formulario de prestamos de Tlacuilo. Si prefieres no recibir mas correos nuestros, da de baja tu correo aqui: ${bajaUrl}`

  return { subject: ASUNTO_LANZAMIENTO, html, text }
}
