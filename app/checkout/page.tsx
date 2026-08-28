'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getMaxObjetosCheckout } from '@/lib/config'
import TecaLayout from '@/components/TecaLayout'
import Cover from '@/components/Cover'

type Libro = {
  id: string
  titulo: string
  autor: string | null
  portada_url: string | null
  isbn: string | null
}

type Prestamo = {
  id: string
  libros: Libro
}

import { BLOQUES, type BloqueId } from '@/lib/horarios'

const BLOCKS = BLOQUES
type BlockId = BloqueId

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function getNextWeekdays(count: number): Date[] {
  const days: Date[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(today)
  d.setDate(d.getDate() + 1) // mínimo mañana
  while (days.length < count) {
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function dayShort(d: Date): string {
  return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`
}

function dayFull(d: Date): string {
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
}

/**
 * Checkout con selección (2026-07-17).
 *
 * El morral es también la wishlist: aquí escoges CUÁLES objetos te llevas
 * en esta visita (hasta el límite de tu escala de confianza) y el resto se
 * queda tranquilo en tu morral para la próxima. Antes el checkout se
 * llevaba todo el morral y te obligaba a borrar si traías de más.
 */
export default function CheckoutPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [morral, setMorral] = useState<Prestamo[]>([])
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedBlock, setSelectedBlock] = useState<BlockId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [maxObjetos, setMaxObjetos] = useState(5)
  const [recado, setRecado] = useState('')
  // Días o bloques sin quien entregue: si no hay quien te dé los libros, no
  // tiene caso que puedas escoger ese horario.
  const [cierres, setCierres] = useState<{ fecha: string; bloque: string | null }[]>([])

  const days = getNextWeekdays(10)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      if (!user) {
        router.push('/login')
        return
      }
      const hoyISO = new Date().toISOString().slice(0, 10)
      const [{ data, error: err }, max, { data: cerrados }] = await Promise.all([
        supabase
          .from('prestamos')
          .select('id, libros (id, titulo, autor, portada_url, isbn)')
          .eq('user_id', user.id)
          .eq('status', 'morral')
          .order('added_at', { ascending: false }),
        getMaxObjetosCheckout(),
        supabase.from('cierres').select('fecha, bloque').gte('fecha', hoyISO),
      ])
      if (!mounted) return
      if (err) setError(err.message)
      else if (data) {
        const items = data as unknown as Prestamo[]
        setMorral(items)
        // Si caben todos, vienen preseleccionados; si no, escoges tú.
        if (items.length <= max) setSeleccion(new Set(items.map((p) => p.id)))
      }
      setMaxObjetos(max)
      setCierres(cerrados ?? [])
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [router])

  const claveFecha = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const diaCerrado = (d: Date) =>
    cierres.some((c) => c.fecha === claveFecha(d) && c.bloque === null)

  const bloqueCerrado = (d: Date | null, bloque: string) =>
    !!d && cierres.some((c) => c.fecha === claveFecha(d) && (c.bloque === null || c.bloque === bloque))

  const toggle = (id: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < maxObjetos) next.add(id)
      return next
    })
  }

  const enLimite = seleccion.size >= maxObjetos
  const quedanEnMorral = morral.length - seleccion.size

  async function handleConfirm() {
    if (!selectedDate || !selectedBlock || seleccion.size === 0 || seleccion.size > maxObjetos) return
    setSubmitting(true)
    setError(null)
    const block = BLOCKS.find((b) => b.id === selectedBlock)
    if (!block) return
    const visitAt = new Date(selectedDate)
    visitAt.setHours(block.hora, block.minuto, 0, 0)
    const ids = [...seleccion]
    const { error: upErr } = await supabase
      .from('prestamos')
      .update({
        status: 'apartado',
        visit_at: visitAt.toISOString(),
        notes: recado.trim() || null,
        // La fila se reusa: si esta reserva ya se había caducado o confirmado
        // antes, esos sellos tienen que morir o el ciclo nuevo nace viejo.
        reagendar_enviado_at: null,
        confirmado_at: null,
        asistencia: null,
        recordatorio_cita_enviado_at: null,
      })
      .in('id', ids)
    if (upErr) {
      setError(upErr.message)
      setSubmitting(false)
      return
    }

    // El contador del header baja: los seleccionados dejaron el morral
    window.dispatchEvent(new Event('tl:morral'))

    // A propósito NO sale ningún correo aquí. La reserva queda en espera:
    // el correo se manda cuando el equipo ya fue por los libros y la confirma.
    // Mientras tanto, quien reservó no se queda a ciegas: su perfil se lo dice.

    router.push('/mi-tlacuilo')
  }

  if (loading) {
    return (
      <TecaLayout>
        <section className="px-10 py-20 max-w-7xl mx-auto">
          <p className="opacity-70 font-mono text-[clamp(13px,1vw,16px)]">
            &gt; preparando tu checkout<span className="animate-pulse">_</span>
          </p>
        </section>
      </TecaLayout>
    )
  }

  if (morral.length === 0) {
    return (
      <TecaLayout>
        <section className="px-10 pt-8 pb-12 max-w-7xl mx-auto">
          <p className="font-mono uppercase tracking-[0.2em] text-[clamp(10px,0.8vw,13px)] opacity-60 mb-2">
            &gt; checkout
          </p>
          <h1 className="font-mono leading-tight mb-6 text-[clamp(28px,3.5vw,52px)] uppercase tracking-wide text-text-bright">
            Tu morral está vacío
          </h1>
          <p className="opacity-70 mb-6 text-[clamp(13px,1vw,17px)]">
            Necesitas agregar libros antes de agendar una visita.
          </p>
          <Link href="/biblioteca" className="font-mono text-sm uppercase tracking-wider underline hover:text-text-bright">
            explorar la biblioteca →
          </Link>
        </section>
      </TecaLayout>
    )
  }

  return (
    <TecaLayout>
      <section className="px-10 pt-8 pb-16 max-w-7xl mx-auto">
        <p className="font-mono uppercase tracking-[0.2em] text-[clamp(10px,0.8vw,13px)] opacity-60 mb-2">
          &gt; checkout
        </p>
        <h1 className="font-mono leading-tight mb-2 text-[clamp(28px,3.5vw,52px)] uppercase tracking-wide text-text-bright">
          Agenda tu visita
        </h1>
        <p className="opacity-70 mb-12 text-[clamp(13px,1vw,17px)]">
          Te esperamos en la biblioteca, en Coyoacán, para entregarte tus libros.
        </p>

        <div className="mb-12">
          <h2 className="font-mono uppercase tracking-wide text-[clamp(16px,1.6vw,22px)] text-text-bright mb-2">
            Escoge qué te llevas · {seleccion.size} de {maxObjetos}
          </h2>
          <p className="opacity-70 font-mono text-xs lowercase tracking-wider mb-4">
            {morral.length > maxObjetos
              ? `> tu morral trae ${morral.length}; pica las portadas para escoger hasta ${maxObjetos} de esta visita`
              : '> pica una portada para quitarla de esta visita'}
            {quedanEnMorral > 0 && seleccion.size > 0 && (
              <> · {quedanEnMorral} se {quedanEnMorral === 1 ? 'queda' : 'quedan'} en tu morral para la próxima</>
            )}
          </p>
          {enLimite && morral.length > maxObjetos && (
            <p className="font-mono text-xs lowercase tracking-wider mb-4 accent-detail">
              &gt; ya tienes tus {maxObjetos}; deselecciona uno si quieres cambiar
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {morral.map((p) => {
              const activo = seleccion.has(p.id)
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  aria-pressed={activo}
                  className={`relative flex flex-col gap-2 text-left cursor-pointer transition-opacity ${
                    activo ? '' : 'opacity-40 hover:opacity-70'
                  }`}
                >
                  <div className={`aspect-[2/3] bg-bg-soft flex items-center justify-center text-text-dim p-2 text-center overflow-hidden text-[10px] mb-2 border ${
                    activo ? 'border-invert-bg' : 'border-transparent'
                  }`}>
                    <Cover titulo={p.libros.titulo} portada_url={p.libros.portada_url} isbn={p.libros.isbn} autor={p.libros.autor} />
                  </div>
                  {activo && (
                    <span className="absolute top-2 right-2 w-5 h-5 bg-invert-bg text-invert-fg font-mono text-[11px] leading-5 text-center">
                      ✓
                    </span>
                  )}
                  <p className="font-medium leading-tight text-[clamp(11px,0.9vw,14px)] line-clamp-2">{p.libros.titulo}</p>
                  <p className="opacity-70 text-[10px] line-clamp-1">{p.libros.autor ?? '—'}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mb-10">
          <h2 className="font-mono uppercase tracking-wide mb-3 opacity-70 text-[clamp(11px,0.9vw,14px)]">
            // qué día
          </h2>
          <p className="opacity-50 text-[10px] mb-4 font-mono">
            &gt; lun-vie · mín. 1 día de anticipación
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {days.map((d) => {
              const selected = selectedDate?.toDateString() === d.toDateString()
              const cerrado = diaCerrado(d)
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => {
                    if (cerrado) return
                    setSelectedDate(d)
                    // Si el bloque elegido no existe ese día, se limpia.
                    if (selectedBlock && bloqueCerrado(d, selectedBlock)) setSelectedBlock(null)
                  }}
                  disabled={cerrado}
                  title={cerrado ? 'ese día no hay quien te entregue' : undefined}
                  className={`font-mono text-xs uppercase tracking-wider p-3 border transition-colors ${
                    cerrado
                      ? 'border-rule opacity-25 line-through cursor-not-allowed'
                      : selected
                        ? 'border-invert-bg bg-invert-bg text-invert-fg'
                        : 'border-rule hover:border-rule-strong'
                  }`}
                >
                  {dayShort(d)}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mb-10">
          <h2 className="font-mono uppercase tracking-wide mb-3 opacity-70 text-[clamp(11px,0.9vw,14px)]">
            // qué bloque
          </h2>
          <p className="opacity-50 text-[10px] mb-4 font-mono">
            &gt; cerramos 14:30-16:00 (comida)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BLOCKS.map((b) => {
              const selected = selectedBlock === b.id
              const cerrado = bloqueCerrado(selectedDate, b.id)
              return (
                <button
                  key={b.id}
                  onClick={() => { if (!cerrado) setSelectedBlock(b.id) }}
                  disabled={cerrado}
                  title={cerrado ? 'ese bloque no hay quien te entregue' : undefined}
                  className={`font-mono text-sm lowercase tracking-wider p-4 border text-left transition-colors ${
                    cerrado
                      ? 'border-rule opacity-25 line-through cursor-not-allowed'
                      : selected
                        ? 'border-invert-bg bg-invert-bg text-invert-fg'
                        : 'border-rule hover:border-rule-strong'
                  }`}
                >
                  <span className="block">{b.label}</span>
                  <span className="block text-[11px] opacity-70 mt-1">{b.rango}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="border-t border-rule pt-8 font-mono">
          {selectedDate && selectedBlock && seleccion.size > 0 ? (
            <p className="text-[clamp(12px,0.95vw,15px)] mb-4 opacity-90">
              &gt; vienes el <span className="text-text-bright">{dayFull(selectedDate)}</span>,{' '}
              bloque <span className="text-text-bright">{BLOCKS.find((b) => b.id === selectedBlock)?.label}</span>{' '}
              ({BLOCKS.find((b) => b.id === selectedBlock)?.rango}) por{' '}
              <span className="text-text-bright">{seleccion.size} {seleccion.size === 1 ? 'objeto' : 'objetos'}</span>
            </p>
          ) : (
            <p className="text-[clamp(12px,0.95vw,15px)] mb-4 opacity-60">
              {seleccion.size === 0 ? '> escoge al menos un objeto, y día y bloque' : '> escoge día y bloque'}
            </p>
          )}

          {/* Recado opcional: llega al panel cuando el equipo abre la visita. */}
          <div className="mb-5">
            <label
              htmlFor="recado"
              className="block font-mono text-[11px] uppercase tracking-wider opacity-60 mb-2"
            >
              ¿nos quieres decir algo? (opcional)
            </label>
            <textarea
              id="recado"
              value={recado}
              onChange={(e) => setRecado(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="llego un poco tarde, vengo por trabajo, busco algo parecido..."
              className="w-full max-w-xl bg-bg border border-rule p-3 font-mono text-[13px] text-text placeholder:opacity-30 focus:border-rule-strong outline-none"
            />
          </div>

          {error && (
            <p className="text-loan text-xs uppercase tracking-wider mb-4">
              &gt; error: {error}
            </p>
          )}

          <div className="flex items-center gap-4">
            <button
              onClick={handleConfirm}
              disabled={!selectedDate || !selectedBlock || submitting || seleccion.size === 0}
              className="font-mono text-sm lowercase tracking-wider bg-invert-bg text-invert-fg px-6 py-3 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? <>confirmando<span className="animate-pulse">_</span></> : <>confirmar visita →</>}
            </button>
            <Link href="/mi-tlacuilo" className="font-mono text-xs uppercase tracking-wider opacity-60 hover:opacity-100 hover:text-text-bright transition-opacity">
              × cancelar
            </Link>
          </div>
        </div>
      </section>
    </TecaLayout>
  )
}
