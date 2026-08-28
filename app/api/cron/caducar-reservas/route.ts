import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reagendarVisita } from '@/lib/server/reagendar'

/**
 * GET /api/cron/caducar-reservas
 * Si pasaron 2 días hábiles de la fecha de visita y nadie llegó, la reserva
 * no se queda pudriéndose en la bandeja: los libros vuelven al morral de esa
 * persona y le llega el correo de disculpa para reagendar.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * ?dry=1 devuelve a quién le tocaría sin tocar nada.
 */

// Dos días HÁBILES. Una visita del viernes no puede caducar el domingo,
// cuando la biblioteca ni siquiera abrió.
const DIAS_GRACIA_HABILES = 2

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'no' }, { status: 401 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  const dry = req.nextUrl.searchParams.get('dry') === '1'

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const corte = new Date()
  let habiles = 0
  while (habiles < DIAS_GRACIA_HABILES) {
    corte.setDate(corte.getDate() - 1)
    const dow = corte.getDay()
    if (dow !== 0 && dow !== 6) habiles += 1
  }

  const { data, error } = await service
    .from('prestamos')
    .select('user_id, visit_at')
    .eq('status', 'apartado')
    .is('reagendar_enviado_at', null)
    .not('visit_at', 'is', null)
    .lt('visit_at', corte.toISOString())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Una visita = una entrada, aunque traiga varios libros.
  const visitas = new Map<string, { userId: string; visitAt: string }>()
  for (const r of data ?? []) {
    const key = `${r.user_id}|${r.visit_at}`
    if (!visitas.has(key)) visitas.set(key, { userId: r.user_id, visitAt: r.visit_at as string })
  }

  const detalle = []
  for (const { userId, visitAt } of visitas.values()) {
    detalle.push(await reagendarVisita(service, userId, visitAt, { dry }))
  }

  return NextResponse.json({ ok: true, dry, visitas: detalle.length, detalle })
}
