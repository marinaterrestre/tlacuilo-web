import { NextRequest, NextResponse } from 'next/server'
import { requireEditor, esError } from '@/lib/server/editor'
import { calcularDueAt } from '@/lib/fechas'

/**
 * POST /api/emails/salida
 * Una VISITA completa sale de la biblioteca: todos los libros que esa persona
 * apartó para ese horario pasan a recogido, se les pone fecha de devolución y
 * dejan de estar disponibles en el catálogo.
 *
 * NO manda correo. La persona está enfrente cuando esto se aprieta; contarle
 * por correo lo que acaba de pasar en sus manos es ruido. Los libros aparecen
 * en su librero, en mi tlacuilo, con el contador de los 30 días.
 *
 * Auth: Bearer <access_token> de un editor.
 * Body: { userId: string, visitAt: string (ISO) }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireEditor(req)
  if (esError(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { editor, service } = ctx

  let userId: string
  let visitAt: string
  try {
    const body = await req.json()
    userId = String(body.userId)
    visitAt = String(body.visitAt)
    if (!userId || Number.isNaN(Date.parse(visitAt))) throw new Error()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  const { data: prestamos, error: readErr } = await service
    .from('prestamos')
    .select('id, libro_id, foto_registro_url')
    .eq('user_id', userId)
    .eq('status', 'apartado')
    .eq('visit_at', visitAt)
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!prestamos || prestamos.length === 0) {
    return NextResponse.json({ error: 'sin préstamos para esa visita' }, { status: 404 })
  }

  // Ficha de salida: sin foto del ejemplar no hay salida. La portada del
  // catálogo no siempre es la edición que está en la casa, y hay que poder
  // saber exactamente cuál se fue.
  const sinFoto = prestamos.filter((p) => !p.foto_registro_url)
  if (sinFoto.length > 0) {
    return NextResponse.json(
      {
        error: `faltan ${sinFoto.length} foto${sinFoto.length === 1 ? '' : 's'} de salida`,
        sinFoto: sinFoto.map((p) => p.id),
      },
      { status: 400 }
    )
  }

  const ahora = new Date()
  const dueAt = calcularDueAt(ahora)
  const ids = prestamos.map((p) => p.id)

  const { error: updErr } = await service
    .from('prestamos')
    .update({
      status: 'recogido',
      picked_up_at: ahora.toISOString(),
      due_at: dueAt.toISOString(),
      salida_por: editor.id,
    })
    .in('id', ids)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  await service
    .from('libros')
    .update({ disponible: false })
    .in('id', prestamos.map((p) => p.libro_id))

  return NextResponse.json({
    ok: true,
    salidas: ids.length,
    dueAt: dueAt.toISOString(),
  })
}
