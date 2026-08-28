/**
 * Reglas de fechas de Tlacuilo.
 * La biblioteca no abre fines de semana: cualquier fecha que caiga en
 * sábado o domingo se recorre al siguiente día hábil.
 */

export const DIAS_PRESTAMO = 30

/** Recorre sábados y domingos al lunes siguiente. */
export function aDiaHabil(d: Date): Date {
  const out = new Date(d)
  const dow = out.getDay()
  if (dow === 6) out.setDate(out.getDate() + 2)
  if (dow === 0) out.setDate(out.getDate() + 1)
  return out
}

/** Fecha de devolución a partir de la salida: 30 días, en día hábil. */
export function calcularDueAt(desde: Date = new Date(), dias: number = DIAS_PRESTAMO): Date {
  const d = new Date(desde)
  d.setDate(d.getDate() + dias)
  return aDiaHabil(d)
}

/** Días entre hoy y una fecha, redondeado hacia arriba. Negativo si ya pasó. */
export function diasFaltantes(hasta: string | Date, desde: Date = new Date()): number {
  const fin = typeof hasta === 'string' ? new Date(hasta) : hasta
  const ms = fin.getTime() - desde.getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}
