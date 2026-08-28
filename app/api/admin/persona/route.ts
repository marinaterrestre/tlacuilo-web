import { NextRequest, NextResponse } from 'next/server'
import { requireEditor, esError } from '@/lib/server/editor'

/**
 * GET /api/admin/persona?userId=...
 * Lo único de una persona que el panel no puede leer solo: su correo, que
 * vive en auth y nunca sale al cliente por otro lado. De paso devuelve su
 * historial resumido para el expediente.
 *
 * Auth: Bearer <access_token> de un editor.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireEditor(req)
  if (esError(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { service } = ctx

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'falta userId' }, { status: 400 })

  const [{ data: lector }, { data: prestamos }] = await Promise.all([
    service.auth.admin.getUserById(userId),
    service
      .from('prestamos')
      .select('id, status, due_at, returned_at')
      .eq('user_id', userId)
      .in('status', ['recogido', 'devuelto']),
  ])

  const devueltos = (prestamos ?? []).filter((p) => p.status === 'devuelto')
  const aTiempo = devueltos.filter(
    (p) => p.returned_at && p.due_at && new Date(p.returned_at) <= new Date(p.due_at)
  ).length
  const activos = (prestamos ?? []).filter((p) => p.status === 'recogido').length

  return NextResponse.json({
    ok: true,
    correo: lector?.user?.email ?? null,
    desde: lector?.user?.created_at ?? null,
    ultimaVisita: lector?.user?.last_sign_in_at ?? null,
    historial: {
      total: (prestamos ?? []).length,
      devueltos: devueltos.length,
      aTiempo,
      tarde: devueltos.length - aTiempo,
      activos,
    },
  })
}
