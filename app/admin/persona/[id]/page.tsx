'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TecaLayout from '@/components/TecaLayout'
import AdminNav from '@/components/AdminNav'
import { useEditorGate, authHeaders } from '@/components/useEditorGate'
import { fechaCorta, urlVisita, yaPaso } from '@/lib/visitas'

type Fila = {
  id: string
  status: 'morral' | 'apartado' | 'recogido' | 'devuelto'
  visit_at: string | null
  picked_up_at: string | null
  returned_at: string | null
  due_at: string | null
  foto_registro_url: string | null
  foto_regreso_url: string | null
  libros: { titulo: string; autor: string | null } | null
}

type Persona = { handle: string | null; nombre_completo: string | null; telefono: string | null; created_at: string | null }
type Extra = {
  correo: string | null
  desde: string | null
  historial: { total: number; devueltos: number; aTiempo: number; tarde: number; activos: number }
}

export default function AdminPersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { loading, isEditor } = useEditorGate()
  const [filas, setFilas] = useState<Fila[]>([])
  const [persona, setPersona] = useState<Persona | null>(null)
  const [extra, setExtra] = useState<Extra | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    if (!isEditor) return
    const [{ data: pres }, { data: perf }] = await Promise.all([
      supabase
        .from('prestamos')
        .select('id, status, visit_at, picked_up_at, returned_at, due_at, foto_registro_url, foto_regreso_url, libros (titulo, autor)')
        .eq('user_id', id)
        .neq('status', 'morral')
        .order('visit_at', { ascending: false, nullsFirst: false }),
      supabase.from('perfiles').select('handle, nombre_completo, telefono, created_at').eq('id', id).single(),
    ])
    setFilas((pres ?? []) as unknown as Fila[])
    setPersona((perf ?? null) as Persona | null)
    setCargando(false)
    try {
      const res = await fetch(`/api/admin/persona?userId=${id}`, { headers: await authHeaders() })
      if (res.ok) setExtra(await res.json())
    } catch {
      // el correo es un extra
    }
  }, [isEditor, id])

  useEffect(() => { cargar() }, [cargar])

  if (loading || !isEditor) {
    return (
      <TecaLayout>
        <section className="px-10 py-20 max-w-4xl mx-auto">
          <p className="opacity-70 font-mono">&gt; verificando permisos<span className="animate-pulse">_</span></p>
        </section>
      </TecaLayout>
    )
  }

  const nombre = persona?.nombre_completo?.trim() || `@${persona?.handle ?? 'sin alias'}`
  const h = extra?.historial

  // Cada visita junta: una fila por día, con todo lo que se llevó ese día.
  const visitas = new Map<string, Fila[]>()
  for (const f of filas) {
    // Se agrupa por la visita. Solo si nunca hubo visita se cae a la salida.
    const key = f.visit_at ?? f.picked_up_at ?? 'sin-fecha'
    if (!visitas.has(key)) visitas.set(key, [])
    visitas.get(key)!.push(f)
  }

  return (
    <TecaLayout>
      <AdminNav />
      <section className="px-10 max-md:px-5 pt-8 pb-16 max-w-4xl mx-auto font-mono">
        <Link href="/admin/prestamos" className="text-[11px] uppercase tracking-wider opacity-60 hover:opacity-100">
          ← préstamos
        </Link>

        <h1 className="mt-4 leading-tight text-[clamp(24px,3vw,42px)] uppercase tracking-wide text-text-bright">
          {nombre}
        </h1>
        <p className="opacity-60 text-[13px] mt-1">
          @{persona?.handle ?? 'sin alias'}
          {persona?.telefono && <> · tel {persona.telefono}</>}
          {extra?.correo && <> · {extra.correo}</>}
        </p>

        {h && (
          <div className="mt-6 border border-rule bg-bg-soft p-4 flex flex-wrap gap-x-10 gap-y-3 text-[13px]">
            <Cifra n={h.total} label="préstamos" />
            <Cifra n={h.activos} label="fuera ahora" alerta={h.activos > 0} />
            <Cifra n={h.aTiempo} label="a tiempo" bien />
            <Cifra n={h.tarde} label="tarde" alerta={h.tarde > 0} />
          </div>
        )}

        {cargando ? (
          <p className="mt-8 opacity-70">&gt; cargando<span className="animate-pulse">_</span></p>
        ) : visitas.size === 0 ? (
          <p className="mt-8 opacity-50">&gt; todavía no se ha llevado nada.</p>
        ) : (
          <div className="mt-10">
            <h2 className="text-[11px] uppercase tracking-[0.12em] opacity-50 mb-3 border-b border-rule pb-2">
              Historial
            </h2>
            <div className="flex flex-col gap-3">
              {[...visitas.entries()].map(([fecha, grupo]) => {
                const abierta = grupo.some((f) => f.status === 'apartado' || f.status === 'recogido')
                const vencida = grupo.some((f) => f.status === 'recogido' && f.due_at && yaPaso(f.due_at))
                return (
                  <div key={fecha} className={`border p-4 ${vencida ? 'border-loan/50' : 'border-rule'} bg-bg-soft`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                      <span className="text-[12px] uppercase tracking-wider text-text-bright">
                        {fecha === 'sin-fecha' ? 'sin fecha' : fechaCorta(fecha)}
                      </span>
                      <span className="text-[11px] uppercase tracking-wider opacity-50">
                        {grupo.length} objeto{grupo.length === 1 ? '' : 's'}
                        {abierta && grupo[0]?.visit_at && (
                          <>
                            {' · '}
                            <Link href={urlVisita(id, grupo[0].visit_at as string)} className="underline hover:no-underline text-text-bright">
                              abrir visita
                            </Link>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {grupo.map((f) => {
                        const tarde =
                          f.returned_at && f.due_at && new Date(f.returned_at) > new Date(f.due_at)
                        return (
                          <div key={f.id} className="flex items-center gap-3">
                            <Miniatura url={f.foto_registro_url} titulo="salida" />
                            <Miniatura url={f.foto_regreso_url} titulo="regreso" verde />
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] text-text-bright truncate">{f.libros?.titulo ?? '—'}</p>
                              <p className="text-[10px] uppercase tracking-wider opacity-50">
                                {f.status}
                                {f.returned_at && (
                                  <span className={tarde ? 'text-loan' : 'text-available'}>
                                    {' · '}
                                    {tarde ? 'devuelto tarde' : 'a tiempo'}
                                  </span>
                                )}
                                {f.status === 'recogido' && f.due_at && yaPaso(f.due_at) && (
                                  <span className="text-loan"> · vencido</span>
                                )}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </TecaLayout>
  )
}

function Cifra({ n, label, alerta = false, bien = false }: { n: number; label: string; alerta?: boolean; bien?: boolean }) {
  return (
    <div>
      <p className={`text-[22px] leading-none ${alerta && n > 0 ? 'text-loan' : bien && n > 0 ? 'text-available' : 'text-text-bright'}`}>
        {n}
      </p>
      <p className="text-[10px] uppercase tracking-[0.12em] opacity-50 mt-1">{label}</p>
    </div>
  )
}

function Miniatura({ url, titulo, verde = false }: { url: string | null; titulo: string; verde?: boolean }) {
  if (!url) {
    return <div className="w-8 h-11 border border-dashed border-rule shrink-0" title={`sin foto de ${titulo}`} />
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title={`foto de ${titulo}`} className="shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`foto de ${titulo}`} className={`w-8 h-11 object-cover border ${verde ? 'border-available' : 'border-rule'}`} />
    </a>
  )
}
