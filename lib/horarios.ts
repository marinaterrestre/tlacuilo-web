/**
 * Los horarios de Tlacuilo, en un solo lugar.
 *
 * El equipo está en Europa 13 de 10:00 a 14:30 y de 16:00 a 19:00, pero las
 * visitas se reciben un poco más adentro, con media hora de colchón de cada
 * lado. Marina lo dijo así: que no lleguen antes que nosotros, y que si se les
 * hace media hora tarde nosotros sigamos aquí.
 */
export const BLOQUES = [
  { id: 'manana', label: 'mañana', rango: '10:30 a 14:30', hora: 10, minuto: 30 },
  { id: 'tarde', label: 'tarde', rango: '16:00 a 18:30', hora: 16, minuto: 0 },
] as const

export type BloqueId = typeof BLOQUES[number]['id']

/** Todo lo que empieza antes de las 14:00 es del bloque de la mañana. */
export function bloqueDeFecha(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.getHours() < 14 ? BLOQUES[0] : BLOQUES[1]
}

/** Una línea con el horario completo, para correos y pies de página. */
export const HORARIO_TEXTO = 'de lunes a viernes, de 10:30 a 14:30 y de 16:00 a 18:30'
export const DIRECCION = 'Europa 13, Coyoacán'
