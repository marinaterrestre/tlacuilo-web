import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { requireEditor, esError } from '@/lib/server/editor'

/**
 * POST /api/admin/pausar-seccion
 * Apaga o vuelve a encender una sección entera del catálogo: una teca
 * completa o una categoría. Para las vacaciones, o para cuando una parte del
 * acervo no se puede prestar por un rato.
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
 *         accion: 'pausar' | 'reanudar', dry?: boolean }
 */
const MOTIVO_PAUSA = 'en pausa'

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
  q = filtro === 'disponibles' ? q.eq('disponible', true) : q.eq('motivo', MOTIVO_PAUSA)
  const { count, error } = await q
  return { count: count ?? 0, error }
}

async function aplicar(
  service: SupabaseClient,
  tipo: Tipo,
  valor: string,
  accion: 'pausar' | 'reanudar'
) {
  const cambio =
    accion === 'pausar'
      ? { disponible: false, motivo: MOTIVO_PAUSA }
      : { disponible: true, motivo: null }

  let q = service.from('libros').update(cambio)
  q = tipo === 'teca' ? q.eq('teca', valor) : q.contains('categorias', [valor])
  q = accion === 'pausar' ? q.eq('disponible', true) : q.eq('motivo', MOTIVO_PAUSA)
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
  let dry = false
  try {
    const body = await req.json()
    tipo = body.tipo === 'categoria' ? 'categoria' : 'teca'
    valor = String(body.valor ?? '').trim()
    accion = body.accion === 'reanudar' ? 'reanudar' : 'pausar'
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

  if (dry) return NextResponse.json({ ok: true, dry, accion, tipo, valor, afectados: count })

  const error = await aplicar(service, tipo, valor, accion)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, accion, tipo, valor, afectados: count })
}
