import { NextRequest, NextResponse } from 'next/server'
import { requireUsuario, esErrorUsuario } from '@/lib/server/usuario'
import { aDiaHabil } from '@/lib/fechas'

/**
 * POST /api/prestamos/extender
 * El lector se extiende desde su perfil, sin esperar a que el equipo apruebe,
 * pero la acción ES el aviso: queda registrada y el equipo sabe dónde está el
 * libro. El único freno: si alguien más trae ese título en su morral, la
 * extensión es corta, porque hay gente esperándolo.
 *
 * Auth: Bearer <access_token> del propio lector.
 * Body: { dias: number }  1 a 30
 */
const TOPE_NORMAL = 30
const TOPE_CON_ESPERA = 7

export async function POST(req: NextRequest) {
  const ctx = await requireUsuario(req)
  if (esErrorUsuario(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { usuario, service } = ctx

  let dias: number
  try {
    const body = await req.json()
    dias = Math.floor(Number(body.dias))
    if (!Number.isFinite(dias) || dias < 1) throw new Error()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  const { data: prestamos, error } = await service
    .from('prestamos')
    .select('id, libro_id, due_at, extension_dias')
    .eq('user_id', usuario.id)
    .eq('status', 'recogido')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!prestamos || prestamos.length === 0) {
    return NextResponse.json({ error: 'no traes nada prestado' }, { status: 404 })
  }

  // ¿Alguien más tiene alguno de estos títulos en su morral? Eso es la señal
  // de que hay lectores esperando; no se infiere de ninguna lista aparte.
  const { data: esperando } = await service
    .from('prestamos')
    .select('libro_id')
    .eq('status', 'morral')
    .neq('user_id', usuario.id)
    .in('libro_id', prestamos.map((p) => p.libro_id))

  const conEspera = new Set((esperando ?? []).map((e) => e.libro_id))

  const resultados = []
  for (const p of prestamos) {
    const yaExtendido = p.extension_dias ?? 0
    const tope = conEspera.has(p.libro_id) ? TOPE_CON_ESPERA : TOPE_NORMAL
    const puede = Math.max(0, tope - yaExtendido)
    const otorgados = Math.min(dias, puede)
    if (otorgados === 0) {
      resultados.push({ id: p.id, otorgados: 0, motivo: 'ya usaste tu extensión de este título' })
      continue
    }

    const base = p.due_at ? new Date(p.due_at) : new Date()
    base.setDate(base.getDate() + otorgados)
    const nuevo = aDiaHabil(base)

    const { error: updErr } = await service
      .from('prestamos')
      .update({
        due_at: nuevo.toISOString(),
        extension_dias: yaExtendido + otorgados,
        // Fecha nueva, avisos nuevos: si no se limpian, la persona nunca
        // recibe recordatorio de la fecha que acaba de elegir.
        aviso_vencido_enviado_at: null,
        recordatorio_final_enviado_at: null,
      })
      .eq('id', p.id)
    if (updErr) {
      resultados.push({ id: p.id, otorgados: 0, motivo: updErr.message })
      continue
    }
    resultados.push({ id: p.id, otorgados, nuevoDueAt: nuevo.toISOString() })
  }

  const nuevaFecha = resultados.map((r) => r.nuevoDueAt).filter(Boolean).sort().pop() ?? null
  return NextResponse.json({ ok: true, nuevaFecha, resultados })
}
