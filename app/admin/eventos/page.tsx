'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TecaLayout from '@/components/TecaLayout'
import AdminNav from '@/components/AdminNav'

/* ============================================================
   Tipos
   ============================================================ */

type Evento = {
  id: string
  titulo: string
  descripcion: string | null
  fecha_inicio: string
  fecha_fin: string | null
  ubicacion: string | null
  url: string | null
  created_at: string
}

/* ============================================================
   Helpers
   ============================================================ */

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  // YYYY-MM-DDTHH:mm para input type=datetime-local
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  )
}

function fromDatetimeLocalValue(v: string): string | null {
  if (!v) return null
  return new Date(v).toISOString()
}

/* ============================================================
   Página
   ============================================================ */

export default function AdminEventosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isEditor, setIsEditor] = useState(false)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Form para nuevo evento
  const [newTitulo, setNewTitulo] = useState('')
  const [newDescripcion, setNewDescripcion] = useState('')
  const [newFechaInicio, setNewFechaInicio] = useState('')
  const [newFechaFin, setNewFechaFin] = useState('')
  const [newUbicacion, setNewUbicacion] = useState('')
  const [newUrl, setNewUrl] = useState('')

  // Auth check
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()
      if (perfil?.rol !== 'editor') {
        router.push('/mi-tlacuilo')
        return
      }
      setIsEditor(true)
      setLoading(false)
    }
    check()
  }, [router])

  const cargar = useCallback(async () => {
    if (!isEditor) return
    const { data } = await supabase
      .from('eventos')
      .select('id, titulo, descripcion, fecha_inicio, fecha_fin, ubicacion, url, created_at')
      .order('fecha_inicio', { ascending: true })
    setEventos((data ?? []) as Evento[])
  }, [isEditor, refreshKey])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function crearEvento() {
    if (!newTitulo.trim() || !newFechaInicio) {
      alert('título y fecha de inicio son obligatorios')
      return
    }
    const payload: Record<string, unknown> = {
      titulo: newTitulo.trim(),
      fecha_inicio: fromDatetimeLocalValue(newFechaInicio),
    }
    if (newDescripcion.trim()) payload.descripcion = newDescripcion.trim()
    if (newFechaFin) payload.fecha_fin = fromDatetimeLocalValue(newFechaFin)
    if (newUbicacion.trim()) payload.ubicacion = newUbicacion.trim()
    if (newUrl.trim()) payload.url = newUrl.trim()

    const { error } = await supabase.from('eventos').insert(payload)
    if (error) {
      alert('error: ' + error.message)
      return
    }
    setNewTitulo('')
    setNewDescripcion('')
    setNewFechaInicio('')
    setNewFechaFin('')
    setNewUbicacion('')
    setNewUrl('')
    setRefreshKey((k) => k + 1)
  }

  async function eliminarEvento(id: string) {
    if (!confirm('¿Eliminar este evento?')) return
    await supabase.from('eventos').delete().eq('id', id)
    setRefreshKey((k) => k + 1)
  }

  async function actualizarCampo(id: string, campo: keyof Evento, valor: string | null) {
    await supabase.from('eventos').update({ [campo]: valor }).eq('id', id)
    setRefreshKey((k) => k + 1)
  }

  if (loading) {
    return (
      <TecaLayout>
        <p className="px-8 pt-6 font-mono text-sm text-text-dim">cargando...</p>
      </TecaLayout>
    )
  }

  return (
    <TecaLayout>
      <AdminNav />
      <section className="px-10 pt-10 pb-16 max-w-4xl mx-auto max-md:px-5">
        <p className="font-micro uppercase tracking-[0.12em] text-[11px] text-acid mb-3">
          admin · eventos
        </p>
        <h1 className="font-sans font-light leading-none mb-3 text-[clamp(32px,3.8vw,52px)] tracking-[-0.01em] text-text">
          Eventos del calendario
        </h1>
        <p className="text-text-dim mb-10 text-[clamp(13px,1vw,15px)]">
          eventos que se muestran en /calendario · <span className="font-mono">{eventos.length}</span> registrados
        </p>

        {/* ============ NUEVO EVENTO ============ */}
        <div className="border border-rule-strong bg-bg-soft p-5 mb-10 flex flex-col gap-3">
          <h2 className="font-micro uppercase tracking-[0.12em] text-[11px] text-acid mb-1">
            nuevo evento
          </h2>

          <input
            value={newTitulo}
            onChange={(e) => setNewTitulo(e.target.value)}
            placeholder="título *"
            className="bg-transparent border-b border-rule font-mono text-sm py-2 outline-none focus:border-text"
          />
          <textarea
            value={newDescripcion}
            onChange={(e) => setNewDescripcion(e.target.value)}
            placeholder="descripción"
            rows={3}
            className="bg-transparent border border-rule font-mono text-sm p-2 outline-none focus:border-text resize-y"
          />
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                fecha inicio *
              </span>
              <input
                type="datetime-local"
                value={newFechaInicio}
                onChange={(e) => setNewFechaInicio(e.target.value)}
                className="bg-transparent border border-rule font-mono text-sm px-2 py-1.5 outline-none focus:border-text"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                fecha fin (opcional)
              </span>
              <input
                type="datetime-local"
                value={newFechaFin}
                onChange={(e) => setNewFechaFin(e.target.value)}
                className="bg-transparent border border-rule font-mono text-sm px-2 py-1.5 outline-none focus:border-text"
              />
            </label>
          </div>
          <input
            value={newUbicacion}
            onChange={(e) => setNewUbicacion(e.target.value)}
            placeholder="ubicación"
            className="bg-transparent border-b border-rule font-mono text-sm py-2 outline-none focus:border-text"
          />
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="url (opcional)"
            className="bg-transparent border-b border-rule font-mono text-sm py-2 outline-none focus:border-text"
          />
          <button
            onClick={crearEvento}
            disabled={!newTitulo.trim() || !newFechaInicio}
            className="self-start inline-flex items-center bg-brillante text-bone border border-tinta rounded-sm px-4 py-2 font-micro text-[11px] uppercase tracking-[0.08em] disabled:opacity-30 hover:bg-tinta hover:text-acid transition-colors"
          >
            crear evento
          </button>
        </div>

        {/* ============ LISTA EXISTENTES ============ */}
        <h2 className="font-micro uppercase tracking-[0.12em] text-[11px] text-text-dim mb-4">
          eventos existentes
        </h2>
        {eventos.length === 0 ? (
          <p className="font-mono text-sm text-text-dim lowercase">
            sin eventos.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {eventos.map((e) => (
              <div key={e.id} className="border border-rule p-4 flex flex-col gap-3">
                <input
                  defaultValue={e.titulo}
                  onBlur={(ev) => actualizarCampo(e.id, 'titulo', ev.target.value)}
                  className="bg-transparent border-b border-rule font-mono text-sm py-1 outline-none focus:border-text uppercase tracking-[0.06em]"
                />
                <textarea
                  defaultValue={e.descripcion ?? ''}
                  onBlur={(ev) => actualizarCampo(e.id, 'descripcion', ev.target.value || null)}
                  rows={2}
                  className="bg-transparent border border-rule font-mono text-xs p-2 outline-none focus:border-text resize-y"
                />
                <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                  <label className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                      inicio
                    </span>
                    <input
                      type="datetime-local"
                      defaultValue={toDatetimeLocalValue(e.fecha_inicio)}
                      onBlur={(ev) =>
                        actualizarCampo(e.id, 'fecha_inicio', fromDatetimeLocalValue(ev.target.value))
                      }
                      className="bg-transparent border border-rule font-mono text-xs px-2 py-1 outline-none focus:border-text"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                      fin
                    </span>
                    <input
                      type="datetime-local"
                      defaultValue={toDatetimeLocalValue(e.fecha_fin)}
                      onBlur={(ev) =>
                        actualizarCampo(e.id, 'fecha_fin', fromDatetimeLocalValue(ev.target.value))
                      }
                      className="bg-transparent border border-rule font-mono text-xs px-2 py-1 outline-none focus:border-text"
                    />
                  </label>
                </div>
                <input
                  defaultValue={e.ubicacion ?? ''}
                  onBlur={(ev) => actualizarCampo(e.id, 'ubicacion', ev.target.value || null)}
                  placeholder="ubicación"
                  className="bg-transparent border-b border-rule font-mono text-xs py-1 outline-none focus:border-text"
                />
                <input
                  defaultValue={e.url ?? ''}
                  onBlur={(ev) => actualizarCampo(e.id, 'url', ev.target.value || null)}
                  placeholder="url"
                  className="bg-transparent border-b border-rule font-mono text-xs py-1 outline-none focus:border-text"
                />
                <button
                  onClick={() => eliminarEvento(e.id)}
                  className="self-start inline-flex items-center border border-rule rounded-sm px-3 py-1.5 font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim hover:bg-loan hover:text-bg hover:border-loan transition-colors"
                >
                  × eliminar evento
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </TecaLayout>
  )
}
