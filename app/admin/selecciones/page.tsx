'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TecaLayout from '@/components/TecaLayout'
import AdminNav from '@/components/AdminNav'
import Cover from '@/components/Cover'

/* ============================================================
   Tipos
   ============================================================ */

type Libro = {
  id: string
  titulo: string
  autor: string | null
  portada_url: string | null
  isbn: string | null
}

type SeleccionItem = {
  libro_id: string
  orden: number
  libro: Libro
}

type Seleccion = {
  id: string
  nombre: string
  orden: number
  items: SeleccionItem[]
}

/* ============================================================
   Página
   ============================================================ */

export default function AdminSeleccionesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isEditor, setIsEditor] = useState(false)
  const [selecciones, setSelecciones] = useState<Seleccion[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Libro[]>([])
  const [newNombre, setNewNombre] = useState('')

  // Auth check — patrón consistente con /admin/libros
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

  // Cargar selecciones + libros relacionados
  const loadSelecciones = useCallback(async () => {
    if (!isEditor) return
    const { data, error } = await supabase
      .from('selecciones')
      .select(`
        id, nombre, orden,
        items:seleccion_libros(
          libro_id, orden,
          libro:libros(id, titulo, autor, portada_url, isbn)
        )
      `)
      .order('orden', { ascending: true })

    if (error) return
    setSelecciones((data ?? []) as unknown as Seleccion[])
  }, [isEditor, refreshKey])

  useEffect(() => {
    loadSelecciones()
  }, [loadSelecciones])

  // Buscar libros debounced
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      const s = search.trim().replace(/[%_]/g, '')
      const { data } = await supabase
        .from('libros')
        .select('id, titulo, autor, portada_url, isbn')
        .or(`titulo.ilike.%${s}%,autor.ilike.%${s}%`)
        .limit(25)
      setSearchResults((data ?? []) as Libro[])
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  async function crearSeleccion() {
    if (!newNombre.trim()) return
    const maxOrden = selecciones.reduce((max, s) => Math.max(max, s.orden), 0)
    const { error } = await supabase
      .from('selecciones')
      .insert({ nombre: newNombre.trim(), orden: maxOrden + 1 })
    if (error) {
      alert('error: ' + error.message)
      return
    }
    setNewNombre('')
    setRefreshKey((k) => k + 1)
  }

  async function eliminarSeleccion(id: string) {
    if (!confirm('¿Eliminar esta selección? Los libros no se borran, solo se quitan de la selección.')) return
    const { error } = await supabase.from('selecciones').delete().eq('id', id)
    if (error) {
      alert('error: ' + error.message)
      return
    }
    if (expanded === id) setExpanded(null)
    setRefreshKey((k) => k + 1)
  }

  async function guardarNombre(id: string, nombre: string) {
    if (!nombre.trim()) return
    await supabase.from('selecciones').update({ nombre: nombre.trim() }).eq('id', id)
    setRefreshKey((k) => k + 1)
  }

  async function guardarOrden(id: string, orden: number) {
    await supabase.from('selecciones').update({ orden }).eq('id', id)
    setRefreshKey((k) => k + 1)
  }

  async function agregarLibro(seleccionId: string, libroId: string) {
    const sel = selecciones.find((s) => s.id === seleccionId)
    if (!sel) return
    const maxOrden = sel.items.reduce((max, it) => Math.max(max, it.orden), 0)
    const { error } = await supabase
      .from('seleccion_libros')
      .insert({ seleccion_id: seleccionId, libro_id: libroId, orden: maxOrden + 1 })
    if (error) {
      alert('error: ' + error.message)
      return
    }
    setRefreshKey((k) => k + 1)
  }

  async function quitarLibro(seleccionId: string, libroId: string) {
    const { error } = await supabase
      .from('seleccion_libros')
      .delete()
      .eq('seleccion_id', seleccionId)
      .eq('libro_id', libroId)
    if (error) {
      alert('error: ' + error.message)
      return
    }
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
      <section className="px-8 pt-6 pb-16 max-w-5xl mx-auto">
        <h1 className="font-mono uppercase tracking-[0.18em] text-text text-[11px] mb-2">
          admin / selecciones
        </h1>
        <p className="font-mono text-[11px] text-text-dim mb-8 lowercase">
          las filas del landing. cada selección se muestra como una hilera de libros.
        </p>

        {/* ============ NUEVA SELECCIÓN ============ */}
        <div className="border border-rule-strong p-4 mb-10 flex gap-3 flex-wrap">
          <input
            value={newNombre}
            onChange={(e) => setNewNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') crearSeleccion()
            }}
            placeholder="nombre de la nueva selección"
            className="flex-1 min-w-[200px] bg-transparent border-b border-rule font-mono text-sm py-2 outline-none focus:border-text"
          />
          <button
            onClick={crearSeleccion}
            disabled={!newNombre.trim()}
            className="font-mono text-xs uppercase tracking-[0.12em] px-4 py-2 bg-text text-bg disabled:opacity-30 hover:opacity-90 transition-opacity"
          >
            agregar selección
          </button>
        </div>

        {/* ============ LISTA DE SELECCIONES ============ */}
        <div className="flex flex-col gap-4">
          {selecciones.map((sel) => {
            const isOpen = expanded === sel.id
            const sortedItems = [...sel.items].sort((a, b) => a.orden - b.orden)
            return (
              <div key={sel.id} className="border border-rule">
                {/* Header row */}
                <div className="flex items-center gap-3 p-4 flex-wrap">
                  <input
                    type="number"
                    defaultValue={sel.orden}
                    onBlur={(e) => guardarOrden(sel.id, parseInt(e.target.value, 10) || 0)}
                    className="w-14 bg-transparent border border-rule font-mono text-xs px-2 py-1 outline-none focus:border-text text-center"
                    title="orden en el landing"
                  />
                  <input
                    defaultValue={sel.nombre}
                    onBlur={(e) => guardarNombre(sel.id, e.target.value)}
                    className="flex-1 min-w-[200px] bg-transparent border-b border-rule font-mono text-sm py-1 outline-none focus:border-text uppercase tracking-[0.08em]"
                  />
                  <span className="font-mono text-[11px] text-text-dim lowercase">
                    {sortedItems.length} {sortedItems.length === 1 ? 'libro' : 'libros'}
                  </span>
                  <button
                    onClick={() => {
                      setExpanded(isOpen ? null : sel.id)
                      setSearch('')
                      setSearchResults([])
                    }}
                    className="font-mono text-xs uppercase tracking-[0.12em] text-text hover:text-text-bright"
                  >
                    {isOpen ? 'cerrar' : 'editar libros'}
                  </button>
                  <button
                    onClick={() => eliminarSeleccion(sel.id)}
                    className="font-mono text-xs uppercase tracking-[0.12em] text-text-dim hover:text-text-bright"
                  >
                    eliminar
                  </button>
                </div>

                {/* Expanded panel */}
                {isOpen && (
                  <div className="border-t border-rule p-4 bg-bg-soft">
                    {/* Libros actuales */}
                    {sortedItems.length > 0 ? (
                      <div className="flex gap-3 overflow-x-auto pb-3 mb-6">
                        {sortedItems.map((it) => (
                          <div key={it.libro_id} className="flex-shrink-0 w-[110px]">
                            <div className="aspect-[2/3] bg-bg-card flex items-center justify-center p-1 text-[10px] text-text-dim text-center overflow-hidden">
                              <Cover
                                titulo={it.libro.titulo}
                                portada_url={it.libro.portada_url}
                                isbn={it.libro.isbn}
                                autor={it.libro.autor}
                              />
                            </div>
                            <div className="mt-2 font-mono text-[10px] text-text-dim line-clamp-2 leading-tight">
                              {it.libro.titulo}
                            </div>
                            <button
                              onClick={() => quitarLibro(sel.id, it.libro_id)}
                              className="mt-1 font-mono text-[10px] uppercase tracking-wide text-text-dim hover:text-text-bright"
                            >
                              quitar
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="font-mono text-xs text-text-dim mb-6 lowercase">
                        sin libros en esta selección todavía. busca y agrega abajo.
                      </p>
                    )}

                    {/* Buscador */}
                    <div>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="buscar libro por título o autor..."
                        className="w-full bg-transparent border border-rule font-mono text-sm px-3 py-2 outline-none focus:border-text"
                      />
                      {searchResults.length > 0 && (
                        <div className="mt-3 max-h-72 overflow-y-auto border border-rule">
                          {searchResults.map((libro) => {
                            const yaIncluido = sortedItems.some((it) => it.libro_id === libro.id)
                            return (
                              <div
                                key={libro.id}
                                className="flex items-center gap-3 p-2 border-b border-rule last:border-b-0"
                              >
                                <div className="w-10 h-14 bg-bg-card flex-shrink-0 flex items-center justify-center overflow-hidden text-[8px] text-text-dim text-center">
                                  <Cover
                                    titulo={libro.titulo}
                                    portada_url={libro.portada_url}
                                    isbn={libro.isbn}
                                    autor={libro.autor}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-mono text-xs truncate">{libro.titulo}</div>
                                  <div className="font-mono text-[10px] text-text-dim truncate">
                                    {libro.autor ?? '—'}
                                  </div>
                                </div>
                                {yaIncluido ? (
                                  <span className="font-mono text-[10px] text-text-dim uppercase tracking-wide">
                                    incluido
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => agregarLibro(sel.id, libro.id)}
                                    className="font-mono text-[10px] uppercase tracking-wide px-3 py-1 bg-text text-bg hover:opacity-90 transition-opacity"
                                  >
                                    agregar
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {search.trim() && searchResults.length === 0 && (
                        <p className="mt-3 font-mono text-xs text-text-dim lowercase">
                          sin resultados.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </TecaLayout>
  )
}
