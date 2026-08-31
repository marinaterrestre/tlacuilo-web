import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { requireEditor, esError } from '@/lib/server/editor'

/**
 * POST /api/admin/pausar-seccion
 * Apaga o vuelve a encender el préstamo de una sección entera: una teca
 * completa o una categoría. Para las vacaciones, o para cuando una parte del
 * acervo no se puede prestar por un rato.
 *
 * OJO: pausar NO esconde nada. El catálogo no filtra por disponibilidad, así
 * que los libros pausados se siguen viendo con su ficha y su portada; lo único
 * que cambia es que quedan marcados como no disponibles y desaparece su botón
 * de apartar. El acervo sigue siendo público completo.
 *
 * La regla que hace esto seguro: al pausar SOLO se tocan los libros que
 * estaban disponibles, y se marcan con el motivo "en pausa". Al reanudar SOLO
 * se encienden los que tengan exactamente ese motivo.
 *
 * Así nunca se revive por accidente un libro que está prestado ahorita, uno
 * dañado, ni uno que no se encontró: esos tienen otro motivo o ninguno, y
 * quedan fuera de la operación en las dos direcciones.
 *
 * Auth: Bearer <access_token> de un editor.
 * Body: { tipo: 'teca' | 'categoria', valor: string,
 *         accion: 'pausar' | 'reanudar', motivo?: string, dry?: boolean }
 */
/**
 * Los motivos que puede tener una PAUSA. Son también la llave para levantarla:
 * al reactivar solo se encienden los libros que traigan uno de estos.
 *
 * Es importante que no se crucen con los motivos que se ponen a mano libro por
 * libro (reparación, solo consulta, estudio, archivado, no lo encontramos):
 * esos nunca se deben encender solos, y los libros prestados no traen motivo.
 */
export const MOTIVOS_PAUSA = [
  'no disponible por ahora',
  'de vacaciones',
  'no se presta este mes',
] as const

type MotivoPausa = typeof MOTIVOS_PAUSA[number]
type Tipo = 'teca' | 'categoria'

/** Cuántos libros de esa sección están en el estado que nos importa. */
async function contar(
  service: SupabaseClient,
  tipo: Tipo,
  valor: string,
  filtro: 'disponibles' | 'pausados'
) {
  let q = service.from('libros').select('id', { count: 'exact', head: true })
  q = tipo === 'teca' ? q.eq('teca', valor) : q.contains('categorias', [valor])
  q = filtro === 'disponibles' ? q.eq('disponible', true) : q.in('motivo', [...MOTIVOS_PAUSA])
  const { count, error } = await q
  return { count: count ?? 0, error }
}

async function aplicar(
  service: SupabaseClient,
  tipo: Tipo,
  valor: string,
  accion: 'pausar' | 'reanudar',
  motivo: MotivoPausa
) {
  const cambio =
    accion === 'pausar'
      ? { disponible: false, motivo }
      : { disponible: true, motivo: null }

  let q = service.from('libros').update(cambio)
  q = tipo === 'teca' ? q.eq('teca', valor) : q.contains('categorias', [valor])
  q = accion === 'pausar' ? q.eq('disponible', true) : q.in('motivo', [...MOTIVOS_PAUSA])
  const { error } = await q
  return error
}

export async function POST(req: NextRequest) {
  const ctx = await requireEditor(req)
  if (esError(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { service } = ctx

  let tipo: Tipo
  let valor: string
  let accion: 'pausar' | 'reanudar'
  let motivo: MotivoPausa = MOTIVOS_PAUSA[0]
  let dry = false
  try {
    const body = await req.json()
    tipo = body.tipo === 'categoria' ? 'categoria' : 'teca'
    valor = String(body.valor ?? '').trim()
    accion = body.accion === 'reanudar' ? 'reanudar' : 'pausar'
    // Solo motivos de la lista: un motivo libre rompería la reactivación.
    const pedido = String(body.motivo ?? '')
    if ((MOTIVOS_PAUSA as readonly string[]).includes(pedido)) motivo = pedido as MotivoPausa
    dry = body.dry === true
    if (!valor) throw new Error()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  const { count, error: contarErr } = await contar(
    service,
    tipo,
    valor,
    accion === 'pausar' ? 'disponibles' : 'pausados'
  )
  if (contarErr) return NextResponse.json({ error: contarErr.message }, { status: 500 })

  if (dry) return NextResponse.json({ ok: true, dry, accion, tipo, valor, motivo, afectados: count })

  const error = await aplicar(service, tipo, valor, accion, motivo)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, accion, tipo, valor, motivo, afectados: count })
}
