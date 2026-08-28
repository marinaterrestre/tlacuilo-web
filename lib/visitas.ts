/**
 * Formato y agrupación de visitas para el panel.
 * La unidad de trabajo de la biblioteca NO es el libro, es la visita de una
 * persona: alguien viene un día a un horario y se lleva lo que apartó.
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function bloqueDe(iso: string | null): 'mañana' | 'tarde' | '' {
  if (!iso) return ''
  return new Date(iso).getHours() < 14 ? 'mañana' : 'tarde'
}

export function horarioDe(iso: string | null): string {
  if (!iso) return ''
  return bloqueDe(iso) === 'mañana' ? '10:30 a 14:30' : '16:00 a 18:30'
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return 'sin fecha'
  const d = new Date(iso)
  return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()]}`
}

export function fechaLarga(iso: string | null): string {
  if (!iso) return 'sin fecha'
  const d = new Date(iso)
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

export function esHoy(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

export function yaPaso(iso: string | null): boolean {
  if (!iso) return false
  return new Date(iso) < new Date()
}

export function diasDesde(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

/** Enlace a la página de una visita. */
export function urlVisita(userId: string, visitAt: string): string {
  return `/admin/visita/${userId}/${encodeURIComponent(visitAt)}`
}
