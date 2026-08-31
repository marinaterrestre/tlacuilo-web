'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/components/useEditorGate'

const TECAS = ['biblioteca', 'artoteca', 'videoteca'] as const

/**
 * Lo que va a leer la gente en la ficha del libro: "no disponible · <motivo> ·
 * vuelve pronto". Tiene que coincidir con la lista del servidor, que la usa
 * como llave para reactivar sin tocar lo dañado ni lo prestado.
 */
const MOTIVOS = ['no disponible por ahora', 'de vacaciones', 'no se presta este mes'] as const

type Categoria = { categoria: string; libros_count: number }

/**
 * Pausar una sección del catálogo.
 *
 * Para las vacaciones, o para cuando una parte del acervo no se puede prestar
 * un rato. Lo pausado SIGUE VISIBLE en el catálogo, con su ficha y su portada:
 * solo queda marcado como no disponible y no se puede apartar. El acervo se
 * sigue viendo completo, que es el punto de tenerlo público.
 *
 * Pausar solo apaga lo que estaba disponible, y reanudar solo enciende lo que
 * esta misma pausa apagó: los libros prestados, los dañados y los que no se
 * encontraron nunca se tocan, ni al apagar ni al prender.
 */
export default function PausarSeccion() {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'teca' | 'categoria'>('teca')
  const [valor, setValor] = useState<string>('biblioteca')
  const [motivo, setMotivo] = useState<string>(MOTIVOS[0])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [working, setWorking] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'mal'; txt: string } | null>(null)
  const [porConfirmar, setPorConfirmar] = useState<{ accion: 'pausar' | 'reanudar'; n: number } | null>(null)

  useEffect(() => {
    if (!abierto || categorias.length > 0) return
    supabase.rpc('distinct_categorias').then(({ data }) => {
      if (data) setCategorias(data as Categoria[])
    })
  }, [abierto, categorias.length])

  async function llamar(accion: 'pausar' | 'reanudar', dry: boolean) {
    setWorking(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/pausar-seccion', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ tipo, valor, accion, motivo, dry }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setWorking(false)
      return json as { afectados: number }
    } catch (e) {
      setMsg({ tipo: 'mal', txt: e instanceof Error ? e.message : String(e) })
      setWorking(false)
      return null
    }
  }

  async function preguntar(accion: 'pausar' | 'reanudar') {
    const r = await llamar(accion, true)
    if (!r) return
    if (r.afectados === 0) {
      setMsg({
        tipo: 'ok',
        txt: accion === 'pausar'
          ? 'no hay nada disponible que pausar en esa sección.'
          : 'esa sección no tiene nada pausado.',
      })
      return
    }
    setPorConfirmar({ accion, n: r.afectados })
  }

  async function ejecutar() {
    if (!porConfirmar) return
    const r = await llamar(porConfirmar.accion, false)
    if (r) {
      setMsg({
        tipo: 'ok',
        txt: porConfirmar.accion === 'pausar'
          ? `listo, ${r.afectados} objetos quedaron como no disponibles. se siguen viendo, pero nadie los puede apartar hasta que los reactives.`
          : `listo, ${r.afectados} objetos se pueden volver a apartar.`,
      })
    }
    setPorConfirmar(null)
  }

  return (
    <div className="border border-rule mb-6">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full text-left px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-text-dim hover:text-text-bright transition-colors"
      >
        {abierto ? '−' : '+'} pausar una sección del catálogo
      </button>

      {abierto && (
        <div className="px-4 pb-4 border-t border-rule pt-4">
          <p className="font-mono text-[12px] opacity-60 mb-4 max-w-[70ch] leading-relaxed">
            Para las vacaciones, o cuando una parte del acervo no se pueda prestar. Lo pausado
            se sigue viendo en el catálogo, con su ficha y su portada: solo queda marcado como
            no disponible y nadie lo puede apartar. Los libros que ya están prestados, los
            dañados y los que no se encontraron no se tocan.
          </p>

          <div className="flex flex-wrap gap-2 mb-3">
            {(['teca', 'categoria'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTipo(t)
                  setValor(t === 'teca' ? 'biblioteca' : (categorias[0]?.categoria ?? ''))
                  setPorConfirmar(null)
                  setMsg(null)
                }}
                className={`font-mono text-[11px] uppercase tracking-wider px-3 py-2 border transition-colors ${
                  tipo === t ? 'border-invert-bg bg-invert-bg text-invert-fg' : 'border-rule text-text-dim hover:border-rule-strong'
                }`}
              >
                {t === 'teca' ? 'una teca' : 'una categoría'}
              </button>
            ))}
          </div>

          <select
            value={valor}
            onChange={(e) => {
              setValor(e.target.value)
              setPorConfirmar(null)
              setMsg(null)
            }}
            className="bg-tinta text-bone border border-rule-strong px-3 py-2 font-mono text-xs cursor-pointer mb-4 max-w-full"
          >
            {tipo === 'teca'
              ? TECAS.map((t) => <option key={t} value={t}>{t}</option>)
              : categorias.map((c) => (
                  <option key={c.categoria} value={c.categoria}>
                    {c.categoria} ({c.libros_count})
                  </option>
                ))}
          </select>

          <div className="mb-4">
            <p className="font-mono text-[11px] uppercase tracking-wider opacity-50 mb-2">
              qué va a leer la gente en la ficha
            </p>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMotivo(m)
                    setPorConfirmar(null)
                    setMsg(null)
                  }}
                  className={`font-mono text-[11px] px-3 py-2 border transition-colors ${
                    motivo === m
                      ? 'border-invert-bg bg-invert-bg text-invert-fg'
                      : 'border-rule text-text-dim hover:border-rule-strong'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="font-mono text-[11px] opacity-40 mt-2">
              se va a ver así: no disponible · {motivo} · vuelve pronto
            </p>
          </div>

          {porConfirmar ? (
            <div className="flex flex-wrap items-center gap-3 border border-loan/50 p-3">
              <span className="font-mono text-[12px] text-loan">
                {porConfirmar.accion === 'pausar'
                  ? `vas a marcar ${porConfirmar.n} objetos como no disponibles. ¿segura?`
                  : `vas a volver a prestar ${porConfirmar.n} objetos. ¿segura?`}
              </span>
              <button
                onClick={ejecutar}
                disabled={working}
                className="font-mono text-[11px] uppercase tracking-wider px-3 py-2 bg-invert-bg text-invert-fg hover:opacity-90 disabled:opacity-40"
              >
                {working ? '> aplicando...' : 'sí, hazlo'}
              </button>
              <button
                onClick={() => setPorConfirmar(null)}
                className="font-mono text-[11px] uppercase tracking-wider opacity-60 hover:opacity-100 underline"
              >
                mejor no
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => preguntar('pausar')}
                disabled={working || !valor}
                className="font-mono text-[11px] uppercase tracking-wider px-3 py-2 border border-rule text-text-dim hover:border-loan hover:text-loan transition-colors disabled:opacity-30"
              >
                pausar esta sección
              </button>
              <button
                onClick={() => preguntar('reanudar')}
                disabled={working || !valor}
                className="font-mono text-[11px] uppercase tracking-wider px-3 py-2 border border-rule text-text-dim hover:border-available hover:text-available transition-colors disabled:opacity-30"
              >
                reactivarla
              </button>
            </div>
          )}

          {msg && (
            <p className={`font-mono text-[12px] mt-3 ${msg.tipo === 'ok' ? 'text-available' : 'text-loan'}`}>
              &gt; {msg.txt}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
