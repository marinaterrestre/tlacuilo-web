'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TecaLayout from '@/components/TecaLayout'
import AdminNav from '@/components/AdminNav'
import { useEditorGate } from '@/components/useEditorGate'
import { BLOQUES, type BloqueId } from '@/lib/horarios'
import { urlVisita } from '@/lib/visitas'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

type Cierre = { id: string; fecha: string; bloque: BloqueId | null; motivo: string | null }
type Reserva = { id: string; user_id: string; visit_at: string }
type Turno = { perfil_id: string; dia_semana: number }
type Editora = { id: string; handle: string | null; nombre_completo: string | null }

/** Los próximos días hábiles, en formato AAAA-MM-DD local. */
function proximosHabiles(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  while (out.length < n) {
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    }
    d.setDate(d.getDate() + 1)
  }
  return out
}

function etiqueta(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const x = new Date(a, m - 1, d)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const dif = Math.round((x.getTime() - hoy.getTime()) / 864e5)
  const base = `${DIAS[x.getDay()]} ${x.getDate()} ${MESES[x.getMonth()]}`
  if (dif === 0) return `${base} · hoy`
  if (dif === 1) return `${base} · mañana`
  return base
}

/**
 * /admin/disponibilidad
 * Ustedes están aquí todos los días hábiles, así que esto no sirve para abrir
 * horarios sino para cerrar los que no. Lo que se cierra deja de aparecer en
 * el checkout, y por eso las reservas ya no necesitan que nadie las apruebe:
 * si el bloque se puede escoger, es porque hay quien entregue.
 */
export default function AdminDisponibilidadPage() {
  const { loading, isEditor, editorId } = useEditorGate()
  const [cierres, setCierres] = useState<Cierre[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [editoras, setEditoras] = useState<Editora[]>([])
  const [cargando, setCargando] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dias = proximosHabiles(15)

  const cargar = useCallback(async () => {
    if (!isEditor) return
    const desde = dias[0]
    const [c, r, t, e] = await Promise.all([
      supabase.from('cierres').select('id, fecha, bloque, motivo').gte('fecha', desde).order('fecha'),
      supabase
        .from('prestamos')
        .select('id, user_id, visit_at')
        .eq('status', 'apartado')
        .gte('visit_at', new Date().toISOString()),
      supabase.from('turnos').select('perfil_id, dia_semana'),
      supabase.from('perfiles').select('id, handle, nombre_completo').eq('rol', 'editor'),
    ])
    if (c.error) setError(c.error.message)
    setCierres((c.data ?? []) as Cierre[])
    setReservas((r.data ?? []) as Reserva[])
    setTurnos((t.data ?? []) as Turno[])
    setEditoras((e.data ?? []) as Editora[])
    setCargando(false)
    // dias se recalcula en cada render pero su primer elemento solo cambia de día a día
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditor])

  useEffect(() => { cargar() }, [cargar])

  const cerrado = (fecha: string, bloque: BloqueId) =>
    cierres.find((c) => c.fecha === fecha && (c.bloque === null || c.bloque === bloque))

  /** Reservas que ya existen en ese bloque, para no dejar a nadie plantado. */
  const reservasEn = (fecha: string, bloque: BloqueId) =>
    reservas.filter((r) => {
      const d = new Date(r.visit_at)
      const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const b: BloqueId = d.getHours() < 14 ? 'manana' : 'tarde'
      return f === fecha && b === bloque
    })

  async function alternar(fecha: string, bloque: BloqueId) {
    const yaCerrado = cerrado(fecha, bloque)
    setWorking(fecha + bloque)
    setError(null)
    if (yaCerrado) {
      // Si estaba cerrado el día entero, abrir un bloque significa cerrar el otro.
      if (yaCerrado.bloque === null) {
        const otro: BloqueId = bloque === 'manana' ? 'tarde' : 'manana'
        const { error: e1 } = await supabase.from('cierres').delete().eq('id', yaCerrado.id)
        if (!e1) {
          await supabase.from('cierres').insert({ fecha, bloque: otro, creado_por: editorId })
        }
        if (e1) setError(e1.message)
      } else {
        const { error: e1 } = await supabase.from('cierres').delete().eq('id', yaCerrado.id)
        if (e1) setError(e1.message)
      }
    } else {
      const { error: e1 } = await supabase.from('cierres').insert({ fecha, bloque, creado_por: editorId })
      if (e1) setError(e1.message)
    }
    setWorking(null)
    cargar()
  }

  async function alternarTurno(perfilId: string, dia: number) {
    const tiene = turnos.some((t) => t.perfil_id === perfilId && t.dia_semana === dia)
    setWorking(`turno-${perfilId}-${dia}`)
    setError(null)
    const { error: e1 } = tiene
      ? await supabase.from('turnos').delete().eq('perfil_id', perfilId).eq('dia_semana', dia)
      : await supabase.from('turnos').insert({ perfil_id: perfilId, dia_semana: dia })
    if (e1) setError(e1.message)
    setWorking(null)
    cargar()
  }

  const nombreDe = (id: string) => {
    const e = editoras.find((x) => x.id === id)
    return e?.nombre_completo?.trim() || `@${e?.handle ?? 'alguien'}`
  }

  const quienEse = (fecha: string) => {
    const [a, m, d] = fecha.split('-').map(Number)
    const dia = new Date(a, m - 1, d).getDay()
    return turnos.filter((t) => t.dia_semana === dia).map((t) => nombreDe(t.perfil_id))
  }

  if (loading || !isEditor) {
    return (
      <TecaLayout>
        <section className="px-10 py-20 max-w-4xl mx-auto">
          <p className="opacity-70 font-mono">&gt; verificando permisos<span className="animate-pulse">_</span></p>
        </section>
      </TecaLayout>
    )
  }

  return (
    <TecaLayout>
      <AdminNav />
      <section className="px-10 max-md:px-5 pt-8 pb-16 max-w-3xl mx-auto font-mono">
        <h1 className="leading-tight mb-2 text-[clamp(28px,3.5vw,52px)] uppercase tracking-wide text-text-bright">
          Disponibilidad
        </h1>
        <p className="opacity-70 mb-3 text-[clamp(13px,1vw,17px)]">
          Están aquí todos los días hábiles, así que todo está abierto por default.
          Cierra el bloque en el que no haya quien entregue y deja de aparecer en el checkout.
        </p>
        <p className="opacity-50 mb-10 text-[12px]">
          mañana {BLOQUES[0].rango} · tarde {BLOQUES[1].rango}
        </p>

        {error && (
          <p className="text-loan text-[13px] mb-6 border border-loan/50 p-3">&gt; {error}</p>
        )}

        {cargando ? (
          <p className="opacity-70">&gt; cargando<span className="animate-pulse">_</span></p>
        ) : (
          <div className="flex flex-col gap-2">
            {dias.map((fecha) => (
              <div key={fecha} className="border border-rule bg-bg-soft p-3 flex flex-wrap items-center gap-3">
                <span className="text-[12px] uppercase tracking-wider text-text-bright w-[190px] shrink-0">
                  {etiqueta(fecha)}
                  <span className="block text-[10px] normal-case tracking-normal opacity-50 mt-0.5">
                    {quienEse(fecha).length > 0 ? quienEse(fecha).join(' y ') : 'nadie de turno'}
                  </span>
                </span>
                <div className="flex gap-2 flex-wrap">
                  {BLOQUES.map((b) => {
                    const c = cerrado(fecha, b.id)
                    const conGente = reservasEn(fecha, b.id)
                    return (
                      <button
                        key={b.id}
                        onClick={() => alternar(fecha, b.id)}
                        disabled={working === fecha + b.id}
                        className={`px-3 py-2 border text-[11px] uppercase tracking-wider transition-colors disabled:opacity-40 ${
                          c
                            ? 'border-loan/60 text-loan line-through'
                            : 'border-rule text-text-dim hover:border-rule-strong hover:text-text-bright'
                        }`}
                        title={c ? 'cerrado, clic para abrir' : 'abierto, clic para cerrar'}
                      >
                        {b.label}
                        {conGente.length > 0 && (
                          <span className={c ? 'text-loan' : 'text-available'}> · {conGente.length}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {/* Cerrar un bloque donde ya hay gente no la cancela: hay que hablarles. */}
                {BLOQUES.some((b) => cerrado(fecha, b.id) && reservasEn(fecha, b.id).length > 0) && (
                  <span className="text-[11px] text-loan">
                    ojo, aquí ya hay gente citada:{' '}
                    {BLOQUES.flatMap((b) =>
                      cerrado(fecha, b.id) ? reservasEn(fecha, b.id) : []
                    ).map((r) => (
                      <Link key={r.id} href={urlVisita(r.user_id, r.visit_at)} className="underline mr-2">
                        ver visita
                      </Link>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-10 text-[11px] opacity-50 leading-relaxed">
          cerrar un bloque no cancela las reservas que ya estaban: si alguien ya venía,
          ábrele la visita y suéltale la reserva para que reagende.
        </p>

        {/* ============ QUIÉN VIENE CADA DÍA ============ */}
        <div className="mt-14 border-t border-rule pt-8">
          <h2 className="uppercase tracking-wide text-[clamp(14px,1.4vw,19px)] text-text-bright mb-2">
            Quién viene cada día
          </h2>
          <p className="opacity-60 text-[12px] mb-5">
            El patrón de siempre. Sirve para saber de quién es el día, no para abrir ni cerrar horarios.
          </p>
          <div className="flex flex-col gap-2">
            {editoras.map((e) => (
              <div key={e.id} className="border border-rule bg-bg-soft p-3 flex flex-wrap items-center gap-3">
                <span className="text-[12px] text-text-bright w-[150px] shrink-0 truncate">
                  {e.nombre_completo?.trim() || `@${e.handle}`}
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  {[1, 2, 3, 4, 5].map((d) => {
                    const activo = turnos.some((t) => t.perfil_id === e.id && t.dia_semana === d)
                    return (
                      <button
                        key={d}
                        onClick={() => alternarTurno(e.id, d)}
                        disabled={working === `turno-${e.id}-${d}`}
                        className={`px-2.5 py-1.5 border text-[11px] uppercase tracking-wider transition-colors disabled:opacity-40 ${
                          activo
                            ? 'border-invert-bg bg-invert-bg text-invert-fg'
                            : 'border-rule text-text-dim hover:border-rule-strong hover:text-text-bright'
                        }`}
                      >
                        {DIAS[d].slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </TecaLayout>
  )
}
