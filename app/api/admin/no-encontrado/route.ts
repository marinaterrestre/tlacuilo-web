import { NextRequest, NextResponse } from 'next/server'
import { requireEditor, esError } from '@/lib/server/editor'

/**
 * POST /api/admin/no-encontrado
 * Un libro de la visita no apareció a la hora de juntar.
 *
 * Pasó de verdad: alguien salió con 3 de los 4 que había apartado. La
 * reserva tiene que quedar contando 3, no 4, y el libro no puede seguir
 * ofreciéndose en el catálogo como si estuviera en su lugar.
 *
 * Se hacen dos cosas a la vez:
 *   1. ese objeto vuelve al MORRAL de la persona, no se pierde su elección
 *   2. el libro se marca no disponible con motivo "no lo encontramos", para
 *      que nadie más lo aparte hasta que aparezca
 *
 * La visita sigue su curso con el resto. No sale ningún correo: la persona
 * está enfrente y se le dice de frente.
 *
 * Auth: Bearer <access_token> de un editor.
 * Body: { prestamoId: string }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireEditor(req)
  if (esError(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { service } = ctx

  let prestamoId: string
  try {
    const body = await req.json()
    prestamoId = String(body.prestamoId)
    if (!prestamoId) throw new Error()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  const { data: prestamo, error: readErr } = await service
    .from('prestamos')
    .select('id, libro_id, status')
    .eq('id', prestamoId)
    .single()
  if (readErr || !prestamo) {
    return NextResponse.json({ error: 'no encontré ese préstamo' }, { status: 404 })
  }
  if (prestamo.status !== 'apartado') {
    return NextResponse.json(
      { error: 'esto solo aplica a objetos apartados que todavía no salen' },
      { status: 400 }
    )
  }

  const { error: updErr } = await service
    .from('prestamos')
    .update({
      status: 'morral',
      visit_at: null,
      confirmado_at: null,
      asistencia: null,
      recordatorio_cita_enviado_at: null,
      reagendar_enviado_at: null,
    })
    .eq('id', prestamo.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const { error: libroErr } = await service
    .from('libros')
    .update({ disponible: false, motivo: 'no lo encontramos' })
    .eq('id', prestamo.libro_id)

  return NextResponse.json({
    ok: true,
    devueltoAlMorral: true,
    catalogo: libroErr ? libroErr.message : 'marcado como no encontrado',
  })
}
