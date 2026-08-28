/**
 * Templates de los 3 emails del ciclo de préstamo en Tlacuilo.
 *
 * Cada función devuelve { subject, html, text } listo para mandar via Resend.
 *
 * Voz: manifiesto Tlacuilo. Terminal style en mono. Lowercase intencional.
 * Sin em-dashes, sin guiones decorativos, sin emojis (excepto · y →).
 *
 * Cuando llegue tlacuilo.org y conectemos Resend:
 *   import { Resend } from 'resend'
 *   import { emailPrestamoConfirmado } from '@/lib/emails/templates'
 *   const { subject, html, text } = emailPrestamoConfirmado({...})
 *   await resend.emails.send({
 *     from: 'tlacuilo@tlacuilo.org',
 *     to: userEmail,
 *     subject, html, text
 *   })
 */

export type LibroEmail = {
  titulo: string
  autor: string | null
}

export type EmailContent = {
  subject: string
  html: string
  text: string
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const DIAS = [
  'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado',
]

function formatFecha(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

function librosToHtml(libros: LibroEmail[]): string {
  return libros
    .map(
      (l) => `
        <li style="margin: 0 0 8px 0; padding: 0;">
          <span style="color: #c5c5e8; font-weight: 500;">${escapeHtml(l.titulo)}</span>
          ${l.autor ? `<br><span style="color: #888; font-size: 13px;">${escapeHtml(l.autor)}</span>` : ''}
        </li>`
    )
    .join('')
}

function librosToText(libros: LibroEmail[]): string {
  return libros.map((l) => `  · ${l.titulo}${l.autor ? ` · ${l.autor}` : ''}`).join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Estructura base del HTML. Dark theme matching el sitio.
 * Tipografías web safe (fallback de Courier para mono).
 */
function shell(title: string, body: string, cta?: { label: string; href: string }): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background: #15151d; font-family: 'Courier New', Courier, monospace; color: #e8e8f0; line-height: 1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #15151d;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px;">
          <tr>
            <td style="padding-bottom: 24px;">
              <p style="margin: 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #888;">
                &gt; tlacuilo · biblioteca pública
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 24px 0;">
              ${body}
            </td>
          </tr>
          ${
            cta
              ? `<tr>
            <td style="padding: 8px 0 24px 0;">
              <a href="${escapeHtml(cta.href)}" style="display: inline-block; background: #9091c4; color: #15151d; padding: 12px 20px; text-decoration: none; font-size: 13px; text-transform: lowercase; letter-spacing: 0.05em;">
                ${escapeHtml(cta.label)} →
              </a>
            </td>
          </tr>`
              : ''
          }
          <tr>
            <td style="padding-top: 24px; border-top: 1px solid #2a2a3a; font-size: 11px; color: #666; letter-spacing: 0.05em;">
              <p style="margin: 0;">tlacuilo. biblioteca pública en coyoacán.</p>
              <p style="margin: 4px 0 0 0;">cdmx · 2026</p>
              <p style="margin: 12px 0 0 0; font-size: 10px;">
                este correo es parte del ciclo de préstamo. <br>
                escríbenos a <a href="mailto:tlacuilo@tlacuilo.org" style="color: #9091c4;">tlacuilo@tlacuilo.org</a> si algo se rompió.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ============================================
// EMAIL 1: PRÉSTAMO CONFIRMADO
// dispara cuando editor marca status: apartado → recogido
// ============================================
export function emailPrestamoConfirmado(params: {
  handle: string
  libros: LibroEmail[]
  dueAt: string | Date
}): EmailContent {
  const { handle, libros, dueAt } = params
  const fechaTexto = formatFecha(dueAt)
  const cuantos = libros.length === 1 ? 'un libro' : `${libros.length} libros`

  const subject = `tu morral salió de la biblioteca. vuelve antes del ${formatFecha(dueAt).split(' de ')[0]} ${formatFecha(dueAt).split(' de ')[1]}`

  const text = `
hola ${handle},

te llevaste ${cuantos} del acervo de tlacuilo:

${librosToText(libros)}

vuelven antes del ${fechaTexto}.

son 30 días. son tuyos hasta entonces.

cuídalos. léelos. devuélvelos.

tlacuilo. biblioteca pública en coyoacán.
tlacuilo@tlacuilo.org
`.trim()

  const body = `
    <h1 style="margin: 0 0 8px 0; font-size: 24px; color: #e8e8f0; font-weight: 500;">
      hola ${escapeHtml(handle)},
    </h1>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #c5c5e8;">
      te llevaste ${cuantos} del acervo de tlacuilo:
    </p>
    <ul style="margin: 0 0 24px 0; padding-left: 20px; list-style: '· ';">
      ${librosToHtml(libros)}
    </ul>
    <p style="margin: 0 0 12px 0; font-size: 14px;">
      <span style="color: #888;">vuelven antes del</span><br>
      <span style="color: #9091c4; font-weight: 500; font-size: 16px;">${escapeHtml(fechaTexto)}</span>
    </p>
    <p style="margin: 16px 0 0 0; font-size: 13px; color: #888;">
      son 30 días. son tuyos hasta entonces.
    </p>
    <p style="margin: 12px 0 0 0; font-size: 13px; color: #c5c5e8;">
      cuídalos. léelos. devuélvelos.
    </p>
  `

  return {
    subject,
    html: shell('préstamo confirmado', body, {
      label: 'agendar mi devolución',
      href: 'https://www.tlacuilo.org/mi-tlacuilo',
    }),
    text,
  }
}

// ============================================
// EMAIL 2: RECORDATORIO DE DEVOLUCIÓN
// dispara 3 días antes de due_at (cron job)
// ============================================
export function emailRecordatorioDevolucion(params: {
  handle: string
  libros: LibroEmail[]
  dueAt: string | Date
  diasFaltantes?: number
}): EmailContent {
  const { handle, libros, dueAt, diasFaltantes = 3 } = params
  const fechaTexto = formatFecha(dueAt)
  const diasTxt = diasFaltantes === 1 ? '1 día' : `${diasFaltantes} días`

  const subject = `te quedan ${diasTxt} con tu morral`

  const text = `
${handle},

faltan ${diasTxt} para devolver:

${librosToText(libros)}

fecha límite: ${fechaTexto}

este no lo pudimos extender solo: alguien más lo está esperando.

tráelo sin cita, de lunes a viernes, de 10:30 a 14:30 y de 16:00 a 18:30,
en Europa 13, Coyoacán.

tlacuilo. biblioteca pública en coyoacán.
`.trim()

  const body = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; color: #e8e8f0; font-weight: 500;">
      ${escapeHtml(handle)},
    </h1>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #c5c5e8;">
      faltan <strong style="color: #9091c4;">${escapeHtml(diasTxt)}</strong> para devolver:
    </p>
    <ul style="margin: 0 0 24px 0; padding-left: 20px; list-style: '· ';">
      ${librosToHtml(libros)}
    </ul>
    <p style="margin: 0 0 16px 0; font-size: 14px;">
      <span style="color: #888;">fecha límite</span><br>
      <span style="color: #9091c4; font-size: 16px;">${escapeHtml(fechaTexto)}</span>
    </p>
    <p style="margin: 20px 0 0 0; font-size: 13px; color: #888;">
      este no lo pudimos extender solo: alguien más lo está esperando.
      tráelo sin cita, de lunes a viernes, de 10:30 a 14:30 y de 16:00 a 18:30.
    </p>
  `

  return {
    subject,
    html: shell('te quedan días con tu morral', body, {
      label: 'ver lo que traigo',
      href: 'https://www.tlacuilo.org/mi-tlacuilo',
    }),
    text,
  }
}

// ============================================
// EMAIL 3: DEVOLUCIÓN CONFIRMADA
// dispara cuando editor marca status: recogido → devuelto
// ============================================
export function emailDevolucionConfirmada(params: {
  handle: string
  libros: LibroEmail[]
}): EmailContent {
  const { handle, libros } = params

  const subject = 'gracias. tu morral volvió a tlacuilo.'

  const text = `
${handle},

recibimos:

${librosToText(libros)}

quedan libres para el próximo lector. tu morral está vacío.

el catálogo entero está abierto en tlacuilo.org/biblioteca.

tlacuilo. biblioteca pública en coyoacán.
`.trim()

  const body = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; color: #e8e8f0; font-weight: 500;">
      gracias, ${escapeHtml(handle)}.
    </h1>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #c5c5e8;">
      recibimos:
    </p>
    <ul style="margin: 0 0 24px 0; padding-left: 20px; list-style: '· ';">
      ${librosToHtml(libros)}
    </ul>
    <p style="margin: 0 0 12px 0; font-size: 14px; color: #c5c5e8;">
      quedan libres para el próximo lector. tu morral está vacío.
    </p>
    <p style="margin: 16px 0 0 0; font-size: 13px; color: #888;">
      el catálogo entero está abierto, listo para tu siguiente viaje.
    </p>
  `

  return {
    subject,
    html: shell('gracias por devolver', body, {
      label: 'explorar la biblioteca',
      href: 'https://www.tlacuilo.org/biblioteca',
    }),
    text,
  }
}

// ============================================
// EMAIL 0: CITA AGENDADA
// dispara cuando el usuario confirma checkout (status: morral → apartado)
// ============================================
export const DIRECCION_BIBLIOTECA = 'Europa 13, Coyoacán'

function bloqueDeVisita(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.getHours() < 14 ? 'mañana · 10:30 a 14:30' : 'tarde · 16:00 a 18:30'
}

export function emailCitaAgendada(params: {
  handle: string
  libros: LibroEmail[]
  visitAt: string | Date
}): EmailContent {
  const { handle, libros, visitAt } = params
  const fechaTexto = formatFecha(visitAt)
  const bloque = bloqueDeVisita(visitAt)
  const cuantos = libros.length === 1 ? 'un objeto' : `${libros.length} objetos`

  const subject = `recibimos tu solicitud de préstamo · ${fechaTexto}`

  const text = `
hola ${handle},

recibimos tu solicitud de ${cuantos}:

${librosToText(libros)}

visita propuesta: ${fechaTexto}
bloque: ${bloque}

la biblioteca va a preparar tus objetos y te mandamos OTRO correo
con la dirección y tu horario cuando tu reserva quede confirmada.
12 horas antes de tu visita te llega además un recordatorio.

tlacuilo. biblioteca pública en coyoacán.
tlacuilo@tlacuilo.org
`.trim()

  const body = `
    <h1 style="margin: 0 0 8px 0; font-size: 24px; color: #e8e8f0; font-weight: 500;">
      hola ${escapeHtml(handle)},
    </h1>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #c5c5e8;">
      recibimos tu solicitud de ${cuantos}:
    </p>
    <ul style="margin: 0 0 24px 0; padding-left: 20px; list-style: '· ';">
      ${librosToHtml(libros)}
    </ul>
    <p style="margin: 0 0 6px 0; font-size: 14px;">
      <span style="color: #888;">visita propuesta</span><br>
      <span style="color: #9091c4; font-weight: 500; font-size: 16px;">${escapeHtml(fechaTexto)}</span>
    </p>
    <p style="margin: 0 0 6px 0; font-size: 14px;">
      <span style="color: #888;">bloque</span><br>
      <span style="color: #e8e8f0;">${escapeHtml(bloque)}</span>
    </p>
    <p style="margin: 16px 0 0 0; font-size: 13px; color: #888;">
      la biblioteca va a preparar tus objetos y te mandamos otro correo
      con la dirección y tu horario cuando tu reserva quede confirmada.
      12 horas antes de tu visita te llega además un recordatorio.
    </p>
  `

  return {
    subject,
    html: shell('recibimos tu solicitud', body),
    text,
  }
}

// ============================================
// AVISO INTERNO: NUEVA RESERVA (al equipo)
// dispara cuando un lector confirma checkout (status: morral → apartado)
// va a la biblioteca, no al lector
// ============================================
export const EMAILS_EQUIPO = [
  'tlacuilo@tlacuilo.org',
  'sammantha@tlacuilo.org',
  'marina@tlacuilo.org',
]

export function emailNuevaReservaEquipo(params: {
  handle: string
  correoLector: string
  libros: LibroEmail[]
  visitAt: string | Date
}): EmailContent {
  const { handle, correoLector, libros, visitAt } = params
  const fechaTexto = formatFecha(visitAt)
  const bloque = bloqueDeVisita(visitAt)
  const cuantos = libros.length === 1 ? '1 objeto' : `${libros.length} objetos`

  const subject = `nueva reserva · @${handle} · ${fechaTexto}`

  const text = `
nueva reserva en tlacuilo.

lector: @${handle} (${correoLector})
${cuantos}:

${librosToText(libros)}

viene: ${fechaTexto}
bloque: ${bloque}

revisa y gestiona en tlacuilo.org/admin/prestamos
`.trim()

  const body = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; color: #e8e8f0; font-weight: 500;">
      nueva reserva
    </h1>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #c5c5e8;">
      <span style="color: #9091c4; font-weight: 500;">@${escapeHtml(handle)}</span>
      <span style="color: #888;"> · ${escapeHtml(correoLector)}</span><br>
      apartó ${cuantos}:
    </p>
    <ul style="margin: 0 0 24px 0; padding-left: 20px; list-style: '· ';">
      ${librosToHtml(libros)}
    </ul>
    <p style="margin: 0 0 6px 0; font-size: 14px;">
      <span style="color: #888;">viene</span><br>
      <span style="color: #9091c4; font-weight: 500; font-size: 16px;">${escapeHtml(fechaTexto)}</span>
    </p>
    <p style="margin: 0 0 12px 0; font-size: 14px;">
      <span style="color: #888;">bloque</span><br>
      <span style="color: #e8e8f0;">${escapeHtml(bloque)}</span>
    </p>
  `

  return {
    subject,
    html: shell('nueva reserva', body, {
      label: 'ver en el panel',
      href: 'https://www.tlacuilo.org/admin/prestamos',
    }),
    text,
  }
}

// ============================================
// EMAIL 0.5: RECORDATORIO DE CITA (12 horas antes)
// dispara via cron · botones asistiré / no asistiré (sin reply)
// ============================================
export function emailRecordatorioCita(params: {
  handle: string
  libros: LibroEmail[]
  visitAt: string | Date
  urlSi: string
  urlNo: string
}): EmailContent {
  const { handle, libros, visitAt, urlSi, urlNo } = params
  const fechaTexto = formatFecha(visitAt)
  const bloque = bloqueDeVisita(visitAt)

  const subject = `mañana nos vemos · ${fechaTexto} · confirma tu visita`

  const text = `
hola ${handle},

tu visita a la biblioteca es en menos de 12 horas:

cuándo: ${fechaTexto}
bloque: ${bloque}

tu morral apartado:

${librosToText(libros)}

confirma aquí:

  asistiré → ${urlSi}
  no asistiré → ${urlNo}

si no puedes venir no pasa nada, tus objetos vuelven a tu morral
y agendas otra visita cuando quieras.

tlacuilo. biblioteca pública en coyoacán.
`.trim()

  const body = `
    <h1 style="margin: 0 0 8px 0; font-size: 24px; color: #e8e8f0; font-weight: 500;">
      hola ${escapeHtml(handle)},
    </h1>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #c5c5e8;">
      tu visita a la biblioteca es en menos de 12 horas.
    </p>
    <p style="margin: 0 0 6px 0; font-size: 14px;">
      <span style="color: #888;">cuándo</span><br>
      <span style="color: #9091c4; font-weight: 500; font-size: 16px;">${escapeHtml(fechaTexto)}</span>
    </p>
    <p style="margin: 0 0 20px 0; font-size: 14px;">
      <span style="color: #888;">bloque</span><br>
      <span style="color: #e8e8f0;">${escapeHtml(bloque)}</span>
    </p>
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #c5c5e8;">tu morral apartado:</p>
    <ul style="margin: 0 0 28px 0; padding-left: 20px; list-style: '· ';">
      ${librosToHtml(libros)}
    </ul>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding-right: 12px;">
          <a href="${escapeHtml(urlSi)}" style="display: inline-block; background: #B8F200; color: #15151d; padding: 12px 22px; text-decoration: none; font-size: 13px; text-transform: lowercase; letter-spacing: 0.05em; font-weight: bold;">
            asistiré →
          </a>
        </td>
        <td>
          <a href="${escapeHtml(urlNo)}" style="display: inline-block; background: transparent; color: #e8e8f0; border: 1px solid #555; padding: 11px 22px; text-decoration: none; font-size: 13px; text-transform: lowercase; letter-spacing: 0.05em;">
            no asistiré
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 24px 0 0 0; font-size: 12px; color: #888;">
      si no puedes venir no pasa nada: tus objetos vuelven a tu morral y agendas otra visita cuando quieras.
    </p>
  `

  return {
    subject,
    html: shell('confirma tu visita', body),
    text,
  }
}

/* ============================================================
   RESERVA CONFIRMADA (equipo → lector) · 2026-07-08
   Se manda cuando un editor confirma la reserva desde el panel.
   Incluye link para que el lector agregue la visita a su
   Google Calendar en un click.
   ============================================================ */

function gcalFechas(visitAt: string): string {
  const ini = new Date(visitAt)
  const fin = new Date(ini)
  fin.setMinutes(fin.getMinutes() + (ini.getHours() < 14 ? 270 : 180))
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `${f(ini)}/${f(fin)}`
}

export function linkGoogleCalendar(visitAt: string, libros: LibroEmail[]): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'tlacuilo · recoger préstamo',
    dates: gcalFechas(visitAt),
    details: `recoges:\n${librosToText(libros)}\n\ntlacuilo · biblioteca pública · ${DIRECCION_BIBLIOTECA}`,
    location: `${DIRECCION_BIBLIOTECA}, CDMX`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function emailReservaConfirmada(params: {
  handle: string
  libros: LibroEmail[]
  visitAt: string
  /** Recado que el equipo escribe en el panel al confirmar. Opcional. */
  nota?: string | null
  /** Enlace de un clic para soltar la visita si no va a poder venir. */
  cancelUrl?: string
}): EmailContent {
  const { handle, libros, visitAt, nota, cancelUrl } = params
  const fecha = formatFecha(visitAt)
  const bloque = bloqueDeVisita(visitAt)
  const gcal = linkGoogleCalendar(visitAt, libros)
  const n = libros.length

  const subject = `tu reserva está confirmada · ${fecha}`

  const body = `
    <h1 style="margin: 0 0 16px 0; font-size: 26px; font-weight: 400; color: #e8e8f0; letter-spacing: 0.02em;">
      tu reserva está confirmada
    </h1>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #c5c5e8;">
      @${escapeHtml(handle)}, ya apartamos ${n === 1 ? 'tu objeto' : `tus ${n} objetos`}. te ${n === 1 ? 'lo' : 'los'} tenemos listos:
    </p>
    <ul style="margin: 0 0 24px 0; padding: 0 0 0 18px; font-size: 14px;">
      ${librosToHtml(libros)}
    </ul>
    <p style="margin: 0 0 4px 0; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.1em;">cuándo</p>
    <p style="margin: 0 0 14px 0; font-size: 15px; color: #c5c5e8;">${escapeHtml(fecha)} · ${escapeHtml(bloque)}</p>
    <p style="margin: 0 0 4px 0; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.1em;">dónde</p>
    <p style="margin: 0 0 8px 0; font-size: 15px; color: #c5c5e8;">${escapeHtml(DIRECCION_BIBLIOTECA)}</p>
    ${
      nota && nota.trim()
        ? `<div style="margin: 20px 0 0 0; padding: 14px 16px; border-left: 2px solid #9091c4; background: #1c1c26;">
      <p style="margin: 0 0 6px 0; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.1em;">de nosotros para ti</p>
      <p style="margin: 0; font-size: 14px; color: #c5c5e8; white-space: pre-line;">${escapeHtml(nota.trim())}</p>
    </div>`
        : ''
    }
    <p style="margin: 24px 0 0 0; font-size: 13px; color: #c5c5e8;">
      ya fuimos por ${n === 1 ? 'tu libro' : 'tus libros'} y ${n === 1 ? 'te está esperando' : 'te están esperando'}.
      si ese día no vas a poder venir, avísanos y lo soltamos:
      ${
        cancelUrl
          ? `<a href="${escapeHtml(cancelUrl)}" style="color: #9091c4;">no voy a poder ir</a>`
          : 'escríbenos a tlacuilo@tlacuilo.org'
      }.
    </p>
    <p style="margin: 10px 0 0 0; font-size: 12px; color: #888;">
      cuando te los lleves son tuyos 30 días. el contador vive en tu perfil.
    </p>
  `

  const text = `tu reserva está confirmada

@${handle}, ya apartamos ${n === 1 ? 'tu objeto' : `tus ${n} objetos`}:

${librosToText(libros)}

cuándo: ${fecha} · ${bloque}
dónde: ${DIRECCION_BIBLIOTECA}
${nota && nota.trim() ? `\nde nosotros para ti:\n${nota.trim()}\n` : ''}
ya fuimos por ${n === 1 ? 'tu libro' : 'tus libros'} y ${n === 1 ? 'te está esperando' : 'te están esperando'}.
si ese día no vas a poder venir, avísanos y lo soltamos:
${cancelUrl ?? 'escríbenos a tlacuilo@tlacuilo.org'}

cuando te los lleves son tuyos 30 días. el contador vive en tu perfil.

agrégalo a tu google calendar:
${gcal}

tlacuilo · biblioteca pública · cdmx
`

  return {
    subject,
    html: shell('tu reserva está confirmada', body, {
      label: 'agregar a mi google calendar →',
      href: gcal,
    }),
    text,
  }
}


// ============================================
// EMAIL 4: DEVOLUCIÓN VENCIDA
// dispara una sola vez cuando due_at ya pasó (cron job)
// tono: cero culpa. la extensión siempre se ofrece aquí.
// ============================================
export function emailDevolucionVencida(params: {
  handle: string
  libros: LibroEmail[]
  dueAt: string | Date
  /** true = segundo y último aviso, a los 15 días. Tono más de "¿todo bien?". */
  ultimo?: boolean
}): EmailContent {
  const { handle, libros, dueAt, ultimo = false } = params
  const fechaTexto = formatFecha(dueAt)
  const n = libros.length
  const cuantos = n === 1 ? 'tu libro' : `tus ${n} libros`

  const subject = ultimo
    ? `${handle}, ¿todo bien?`
    : n === 1
      ? 'tu libro ya cumplió su mes'
      : 'tus libros ya cumplieron su mes'

  const intro = ultimo
    ? `pasaron dos semanas desde que te escribimos por ${cuantos} y siguen contigo. ¿todo bien por allá?`
    : `el mes de ${cuantos} terminó el ${fechaTexto}.`

  const text = `
${handle},

${intro}

si ya acabaste, tráelos cuando puedas, sin cita: estamos de lunes a viernes,
de 10:30 a 14:30 y de 16:00 a 18:30, en Europa 13, Coyoacán.

si te falta tiempo, extiende tu préstamo desde tu perfil. es un botón, pero
avísanos: estos libros son de todos y hay quien los está esperando.

https://www.tlacuilo.org/mi-tlacuilo

tlacuilo. biblioteca pública en coyoacán.
tlacuilo@tlacuilo.org
`.trim()

  const body = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; color: #e8e8f0; font-weight: 500;">
      ${escapeHtml(handle)},
    </h1>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #c5c5e8;">
      ${escapeHtml(intro)}
    </p>
    <p style="margin: 0 0 12px 0; font-size: 14px; color: #c5c5e8;">
      si ya acabaste, tráelos cuando puedas, sin cita. estamos de lunes a viernes,
      de 10:30 a 14:30 y de 16:00 a 18:30, en Europa 13, Coyoacán.
    </p>
    <p style="margin: 12px 0 0 0; font-size: 14px; color: #c5c5e8;">
      si te falta tiempo, extiende tu préstamo desde tu perfil. es un botón, pero avísanos.
    </p>
    <p style="margin: 16px 0 0 0; font-size: 13px; color: #888;">
      estos libros son de todos, y que circulen es todo lo que nos importa.
    </p>
  `

  return {
    subject,
    html: shell(ultimo ? '¿todo bien?' : 'ya cumplió su mes', body, {
      label: 'ver mis préstamos',
      href: 'https://www.tlacuilo.org/mi-tlacuilo',
    }),
    text,
  }
}

// ============================================
// EMAIL 5: RESERVA SIN CONFIRMAR · DISCULPA + REAGENDAR
// se manda cuando una visita se pasó sin que la confirmáramos.
// los libros vuelven al morral del lector, tal cual los escogió.
// ============================================
export function emailReagendarReserva(params: {
  handle: string
  libros: LibroEmail[]
  visitAt: string | Date
}): EmailContent {
  const { handle, libros, visitAt } = params
  const fechaTexto = formatFecha(visitAt)

  const subject = 'no te confirmamos. tus libros siguen aquí.'

  const text = `
${handle},

apartaste estos libros para el ${fechaTexto} y nunca te confirmamos la visita.
eso fue nuestro, no tuyo.

${librosToText(libros)}

te los guardamos de vuelta en tu morral, tal cual los escogiste.
elige el día que quieras venir y esta vez sí te contestamos.

tlacuilo. biblioteca pública en coyoacán.
tlacuilo@tlacuilo.org
`.trim()

  const body = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; color: #e8e8f0; font-weight: 500;">
      ${escapeHtml(handle)},
    </h1>
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #c5c5e8;">
      apartaste estos libros para el
      <span style="color: #9091c4;">${escapeHtml(fechaTexto)}</span>
      y nunca te confirmamos la visita.
    </p>
    <p style="margin: 0 0 20px 0; font-size: 13px; color: #888;">
      eso fue nuestro, no tuyo.
    </p>
    <ul style="margin: 0 0 24px 0; padding-left: 20px; list-style: '· ';">
      ${librosToHtml(libros)}
    </ul>
    <p style="margin: 0 0 12px 0; font-size: 14px; color: #c5c5e8;">
      te los guardamos de vuelta en tu morral, tal cual los escogiste.
    </p>
    <p style="margin: 12px 0 0 0; font-size: 13px; color: #888;">
      elige el día que quieras venir y esta vez sí te contestamos.
    </p>
  `

  return {
    subject,
    html: shell('tus libros siguen aquí', body, {
      label: 'reagendar mi visita',
      href: 'https://www.tlacuilo.org/checkout',
    }),
    text,
  }
}


// ============================================
// EMAIL 6: RESUMEN DE LA MAÑANA (al equipo)
// un solo correo al día en vez de uno por reserva
// ============================================
export type VisitaResumen = {
  quien: string
  bloque: string
  objetos: number
  titulos: string[]
  telefono: string | null
  url: string
}

export type PendienteResumen = {
  quien: string
  titulo: string
  dias: number
  url: string
}

export function emailResumenDiario(params: {
  fecha: string
  visitas: VisitaResumen[]
  vencidos: PendienteResumen[]
  nuevasReservas: number
}): EmailContent {
  const { fecha, visitas, vencidos, nuevasReservas } = params

  const subject =
    visitas.length === 0
      ? `hoy no viene nadie · ${fecha}`
      : `hoy vienen ${visitas.length} · ${fecha}`

  const lineaVisita = (v: VisitaResumen) =>
    `  · ${v.quien} · ${v.bloque} · ${v.objetos} objeto${v.objetos === 1 ? '' : 's'}${v.telefono ? ` · tel ${v.telefono}` : ''}\n    ${v.titulos.join('\n    ')}`

  const text = `
${fecha}

QUIÉN VIENE HOY
${visitas.length === 0 ? '  nadie.' : visitas.map(lineaVisita).join('\n\n')}

DEBEN TRAER LIBROS
${vencidos.length === 0 ? '  nadie, todo en orden.' : vencidos.map((v) => `  · ${v.quien} · ${v.titulo} · ${v.dias} días`).join('\n')}
${nuevasReservas > 0 ? `\nreservas nuevas desde ayer: ${nuevasReservas}` : ''}

el panel: https://www.tlacuilo.org/admin/prestamos
`.trim()

  const body = `
    <p style="margin: 0 0 24px 0; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.1em;">
      ${escapeHtml(fecha)}
    </p>

    <p style="margin: 0 0 10px 0; font-size: 12px; color: #9091c4; text-transform: uppercase; letter-spacing: 0.1em;">
      quién viene hoy
    </p>
    ${
      visitas.length === 0
        ? '<p style="margin: 0 0 28px 0; font-size: 14px; color: #888;">nadie.</p>'
        : visitas
            .map(
              (v) => `
    <div style="margin: 0 0 16px 0; padding: 12px 14px; background: #1c1c26; border-left: 2px solid #9091c4;">
      <p style="margin: 0 0 4px 0; font-size: 15px; color: #e8e8f0;">
        <a href="${escapeHtml(v.url)}" style="color: #e8e8f0; text-decoration: none;">${escapeHtml(v.quien)}</a>
      </p>
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #888;">
        ${escapeHtml(v.bloque)} · ${v.objetos} objeto${v.objetos === 1 ? '' : 's'}${v.telefono ? ` · tel ${escapeHtml(v.telefono)}` : ''}
      </p>
      <p style="margin: 0; font-size: 13px; color: #c5c5e8;">
        ${v.titulos.map((t) => escapeHtml(t)).join('<br>')}
      </p>
    </div>`
            )
            .join('') + '<div style="height: 12px;"></div>'
    }

    <p style="margin: 24px 0 10px 0; font-size: 12px; color: #9091c4; text-transform: uppercase; letter-spacing: 0.1em;">
      deben traer libros
    </p>
    ${
      vencidos.length === 0
        ? '<p style="margin: 0; font-size: 14px; color: #888;">nadie, todo en orden.</p>'
        : `<ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #c5c5e8;">${vencidos
            .map(
              (v) =>
                `<li style="margin-bottom: 6px;"><a href="${escapeHtml(v.url)}" style="color: #c5c5e8;">${escapeHtml(v.quien)}</a> · ${escapeHtml(v.titulo)} · <span style="color: #d9705f;">${v.dias} días</span></li>`
            )
            .join('')}</ul>`
    }
    ${
      nuevasReservas > 0
        ? `<p style="margin: 24px 0 0 0; font-size: 13px; color: #888;">${nuevasReservas} reserva${nuevasReservas === 1 ? '' : 's'} nueva${nuevasReservas === 1 ? '' : 's'} desde ayer.</p>`
        : ''
    }
  `

  return {
    subject,
    html: shell('resumen de hoy', body, {
      label: 'abrir el panel',
      href: 'https://www.tlacuilo.org/admin/prestamos',
    }),
    text,
  }
}
