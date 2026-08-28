import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * GET /api/calendario?token=<CRON_SECRET>
 * Feed ICS con las visitas agendadas: quién pasa, cuándo y por qué libros.
 * El equipo se suscribe UNA vez en Google/Apple Calendar y las visitas
 * aparecen solas en su calendario (sin depender de correos):
 *   Google Calendar → Otros calendarios → + → Desde URL
 *   https://www.tlacuilo.org/api/calendario?token=...
 *
 * Incluye visitas de 30 días atrás en adelante (apartado y recogido).
 * Bloques: mañana 10:30-14:30 · tarde 16:00-18:30.
 */

type Row = {
  id: string
  user_id: string
  status: string
  visit_at: string
  libros: { titulo: string; autor: string | null } | null
  perfiles: { handle: string | null } | null
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const secret = process.env.CALENDARIO_SECRET ?? process.env.CRON_SECRET
  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const desde = new Date()
  desde.setDate(desde.getDate() - 30)

  const { data, error } = await supabase
    .from('prestamos')
    .select('id, user_id, status, visit_at, libros (titulo, autor), perfiles (handle)')
    .in('status', ['apartado', 'recogido'])
    .not('visit_at', 'is', null)
    .gte('visit_at', desde.toISOString())
    .order('visit_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Una visita = un evento (agrupar por lector + fecha/hora de visita)
  const visitas = new Map<string, Row[]>()
  for (const row of (data ?? []) as unknown as Row[]) {
    const key = `${row.user_id}·${row.visit_at}`
    if (!visitas.has(key)) visitas.set(key, [])
    visitas.get(key)!.push(row)
  }

  const eventos: string[] = []
  for (const [key, rows] of visitas) {
    const inicio = new Date(rows[0].visit_at)
    const fin = new Date(inicio)
    if (inicio.getUTCHours() < 20 && new Date(rows[0].visit_at).getHours() < 14) {
      fin.setMinutes(fin.getMinutes() + 240) // bloque mañana 10:30-14:30
    } else {
      fin.setMinutes(fin.getMinutes() + 150) // bloque tarde 16:00-18:30
    }
    const handle = rows[0].perfiles?.handle ?? 'lector'
    const n = rows.length
    const titulos = rows
      .map((r) => `· ${r.libros?.titulo ?? '?'}${r.libros?.autor ? ` — ${r.libros.autor}` : ''}`)
      .join('\n')
    const recogido = rows[0].status === 'recogido' ? ' (ya recogido)' : ''

    eventos.push(
      [
        'BEGIN:VEVENT',
        `UID:visita-${key.replace(/[^a-z0-9]/gi, '')}@tlacuilo.org`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART:${icsDate(inicio)}`,
        `DTEND:${icsDate(fin)}`,
        `SUMMARY:${icsEscape(`tlacuilo · @${handle} · ${n} ${n === 1 ? 'libro' : 'libros'}${recogido}`)}`,
        `DESCRIPTION:${icsEscape(`@${handle} pasa por:\n${titulos}`)}`,
        'LOCATION:Biblioteca Tlacuilo · Coyoacán',
        'END:VEVENT',
      ].join('\r\n')
    )
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//tlacuilo//visitas//ES',
    'X-WR-CALNAME:Tlacuilo · visitas',
    'X-WR-TIMEZONE:America/Mexico_City',
    ...eventos,
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="tlacuilo-visitas.ics"',
    },
  })
}
