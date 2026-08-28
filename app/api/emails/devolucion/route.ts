import { NextRequest, NextResponse } from 'next/server'
import { requireEditor, esError } from '@/lib/server/editor'

/**
 * POST /api/emails/devolucion
 * Regresan libros a la biblioteca. Puede ser parcial: alguien que se llevó
 * cinco puede traer dos. Se marcan devueltos y vuelven al catálogo.
 *
 * La foto SOLO se pide al salir, nunca al volver: al salir hay que dejar
 * constancia de qué edición exacta se fue, porque la portada del catálogo no
 * siempre es la del ejemplar que está en la casa. Al volver el libro ya está
 * aquí y se puede ver. Pedir foto de regreso era puro trámite.
 *
 * Auth: Bearer <access_token> de un editor.
 * Body: { ids: string[] }  (préstamos en status recogido, de una sola persona)
 */
export async function POST(req: NextRequest) {
  const ctx = await requireEditor(req)
  if (esError(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { editor, service } = ctx

  let ids: string[]
  try {
    const body = await req.json()
    ids = (body.ids as unknown[]).map(String)
    if (!Array.isArray(ids) || ids.length === 0) throw new Error()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  const { data: prestamos, error: readErr } = await service
    .from('prestamos')
    .select('id, user_id, libro_id, libros (titulo, autor)')
    .in('id', ids)
    .eq('status', 'recogido')
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!prestamos || prestamos.length === 0) {
    return NextResponse.json({ error: 'no hay préstamos en circulación con esos ids' }, { status: 404 })
  }

  const usuarios = new Set(prestamos.map((p) => p.user_id))
  if (usuarios.size > 1) {
    return NextResponse.json({ error: 'los préstamos deben ser de una sola persona' }, { status: 400 })
  }
  const { error: updErr } = await service
    .from('prestamos')
    .update({
      status: 'devuelto',
      returned_at: new Date().toISOString(),
      regreso_por: editor.id,
    })
    .in('id', prestamos.map((p) => p.id))
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Vuelve al catálogo, pero NO se republica un ejemplar que un editor retiró
  // por su cuenta (dañado, en restauración): eso lo dice la columna motivo.
  await service
    .from('libros')
    .update({ disponible: true })
    .in('id', prestamos.map((p) => p.libro_id))
    .is('motivo', null)

  // Tampoco sale correo al devolver: la persona acaba de estar aquí. Su
  // librero queda vacío y su historial guarda el préstamo cerrado.

  return NextResponse.json({ ok: true, devueltos: prestamos.length })
}
