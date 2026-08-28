import { NextRequest, NextResponse } from 'next/server'
import { requireEditor, esError } from '@/lib/server/editor'
import { reagendarVisita } from '@/lib/server/reagendar'

/**
 * POST /api/admin/reagendar
 * Un editor suelta una reserva a mano: los libros vuelven al morral de esa
 * persona y le llega el correo de disculpa con el botón de reagendar.
 *
 * Auth: Bearer <access_token> de un editor.
 * Body: { userId, visitAt, dry? }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireEditor(req)
  if (esError(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  let userId: string
  let visitAt: string
  let dry = false
  try {
    const body = await req.json()
    userId = String(body.userId)
    visitAt = String(body.visitAt)
    dry = body.dry === true
    if (!userId || Number.isNaN(Date.parse(visitAt))) throw new Error()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  const r = await reagendarVisita(ctx.service, userId, visitAt, { dry })
  if (r.error && !r.devueltosAlMorral) {
    return NextResponse.json({ error: r.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, ...r })
}
