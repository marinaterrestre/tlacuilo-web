'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { comprimirImagen } from '@/lib/imagen'
import TecaLayout from '@/components/TecaLayout'
import AdminNav from '@/components/AdminNav'
import PausarSeccion from '@/components/PausarSeccion'
import Cover from '@/components/Cover'

type Libro = {
  id: string
  titulo: string
  autor: string | null
  anio: number | null
  isbn: string | null
  portada_url: string | null
  categorias: string[] | null
  descripcion: string | null
  edicion_especial: boolean
  disponible: boolean
  motivo: string | null
}

const PAGE_SIZE = 25

const MOTIVOS_PRESET = ['solo consulta', 'reparación', 'estudio', 'archivado', 'no lo encontramos']

export default function AdminLibrosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isEditor, setIsEditor] = useState(false)
  const [libros, setLibros] = useState<Libro[]>([])
  const [search, setSearch] = useState('')
  const [filtroSinPortada, setFiltroSinPortada] = useState(false)
  const [filtroJoyas, setFiltroJoyas] = useState(false)
  const [filtroNoDisponibles, setFiltroNoDisponibles] = useState(false)
  const [estadoMenuOpen, setEstadoMenuOpen] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [wishlist, setWishlist] = useState<Record<string, number>>({})

  const [editingLibro, setEditingLibro] = useState<Libro | null>(null)
  const [uploadUrl, setUploadUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [draggingOver, setDraggingOver] = useState(false)

  // Form state del modal de edición (se inicializa cuando se abre editingLibro)
  const [editTitulo, setEditTitulo] = useState('')
  const [editAutor, setEditAutor] = useState('')
  const [editAnio, setEditAnio] = useState('')
  const [editIsbn, setEditIsbn] = useState('')
  const [editCategorias, setEditCategorias] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)

  // Cuando se abre un libro, hidratar el form de edit con sus valores
  useEffect(() => {
    if (editingLibro) {
      setEditTitulo(editingLibro.titulo)
      setEditAutor(editingLibro.autor ?? '')
      setEditAnio(editingLibro.anio ? String(editingLibro.anio) : '')
      setEditIsbn(editingLibro.isbn ?? '')
      setEditCategorias((editingLibro.categorias ?? []).join(', '))
      setEditDescripcion(editingLibro.descripcion ?? '')
      setUploadUrl('')
      setEditMsg(null)
    }
  }, [editingLibro])

  const [showAdd, setShowAdd] = useState(false)
  const [newTeca, setNewTeca] = useState<'biblioteca' | 'artoteca' | 'fonoteca' | 'videoteca' | 'editorial'>('biblioteca')
  const [newFormato, setNewFormato] = useState('')
  const [newTitulo, setNewTitulo] = useState('')
  const [newAutor, setNewAutor] = useState('')
  const [newAnio, setNewAnio] = useState<string>('')
  const [newIsbn, setNewIsbn] = useState('')
  const [newCategorias, setNewCategorias] = useState('')
  const [newDescripcion, setNewDescripcion] = useState('')
  const [newPortadaUrl, setNewPortadaUrl] = useState('')
  const [newEspecial, setNewEspecial] = useState(false)
  const [searchingApi, setSearchingApi] = useState(false)
  const [apiMsg, setApiMsg] = useState<string | null>(null)
  const [savingNew, setSavingNew] = useState(false)

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

  const loadLibros = useCallback(async () => {
    if (!isEditor) return
    let q = supabase
      .from('libros')
      .select(
        'id, titulo, autor, anio, isbn, portada_url, categorias, descripcion, edicion_especial, disponible, motivo',
        { count: 'estimated' }
      )
    if (search.trim()) {
      const s = search.trim().replace(/[%_]/g, '')
      q = q.or(`titulo.ilike.%${s}%,autor.ilike.%${s}%`)
    }
    if (filtroSinPortada) q = q.is('portada_url', null)
    if (filtroJoyas) q = q.eq('edicion_especial', true)
    if (filtroNoDisponibles) q = q.eq('disponible', false)
    q = q.order('titulo').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    const { data, count } = await q
    const rows = (data ?? []) as Libro[]
    setLibros(rows)
    setTotal(count ?? 0)

    // Conteo de wishlist (morral) para los libros visibles.
    const ids = rows.map((l) => l.id)
    if (ids.length > 0) {
      const { data: wl } = await supabase.rpc('wishlist_counts', { libro_ids: ids })
      const map: Record<string, number> = {}
      ;(wl ?? []).forEach((r: { libro_id: string; n: number }) => {
        map[r.libro_id] = r.n
      })
      setWishlist(map)
    } else {
      setWishlist({})
    }
  }, [isEditor, search, filtroSinPortada, filtroJoyas, filtroNoDisponibles, page, refreshKey])

  useEffect(() => {
    loadLibros()
  }, [loadLibros])

  useEffect(() => {
    setPage(0)
  }, [search, filtroSinPortada, filtroJoyas, filtroNoDisponibles])

  async function buscarEnApi() {
    if (!newTitulo.trim()) {
      setApiMsg('> escribe al menos un título primero')
      return
    }
    setSearchingApi(true)
    setApiMsg(null)
    try {
      const params = new URLSearchParams({ title: newTitulo, limit: '1' })
      if (newAutor.trim()) params.set('author', newAutor)
      const res = await fetch(`https://openlibrary.org/search.json?${params}`)
      const data = await res.json()
      if (data.docs && data.docs.length > 0) {
        const d = data.docs[0]
        // Solo llena campos vacíos · NUNCA sobreescribe lo que ya pusiste manualmente
        if (!newAutor.trim() && d.author_name?.[0]) setNewAutor(d.author_name[0])
        if (!newAnio.trim() && d.first_publish_year) setNewAnio(String(d.first_publish_year))
        if (!newIsbn.trim() && d.isbn?.[0]) setNewIsbn(d.isbn[0])
        if (!newPortadaUrl.trim() && d.cover_i) {
          setNewPortadaUrl(`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`)
        }
        setApiMsg('> campos vacíos rellenados desde open library ✓')
      } else {
        setApiMsg('> sin resultados en open library')
      }
    } catch (e) {
      setApiMsg('> error consultando api')
    }
    setSearchingApi(false)
  }

  /* TMDB para movies (VHS, DVD, Blu-ray). API key v3, read-only.
     Configura NEXT_PUBLIC_TMDB_API_KEY en .env.local y en Vercel env vars.
     Atribución requerida: el logo aparece en el footer de /videoteca.

     Comportamiento:
     - Si ya pusiste año, lo usa como FILTRO (devuelve la versión correcta).
     - Solo llena campos VACÍOS. NO sobreescribe lo que ya escribiste.
     - El título lo respeta siempre. Si quieres el título de TMDB, lo borras y le das de nuevo. */
  async function buscarEnTmdb() {
    if (!newTitulo.trim()) {
      setApiMsg('> escribe al menos un título primero')
      return
    }
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
    if (!apiKey) {
      setApiMsg('> falta configurar NEXT_PUBLIC_TMDB_API_KEY en env vars')
      return
    }
    setSearchingApi(true)
    setApiMsg(null)
    try {
      const params = new URLSearchParams({
        api_key: apiKey,
        query: newTitulo,
        language: 'es-MX',
        include_adult: 'false',
      })
      // Si ya escribió el año, lo usa como filtro de búsqueda
      // (así no te devuelve el remake del 2002 cuando quieres el original de 1939)
      if (newAnio.trim()) {
        params.set('primary_release_year', newAnio.trim())
      }
      const res = await fetch(`https://api.themoviedb.org/3/search/movie?${params}`)
      const data = await res.json()
      if (data.results && data.results.length > 0) {
        const m = data.results[0]
        // Solo llena campos vacíos · NUNCA sobreescribe lo que ya pusiste
        if (!newAnio.trim() && m.release_date) {
          setNewAnio(m.release_date.substring(0, 4))
        }
        if (!newPortadaUrl.trim() && m.poster_path) {
          setNewPortadaUrl(`https://image.tmdb.org/t/p/w500${m.poster_path}`)
        }
        if (!newDescripcion.trim() && m.overview) {
          setNewDescripcion(m.overview)
        }
        const yearShown = m.release_date?.substring(0, 4) ?? 's/f'
        if (data.results.length > 1) {
          setApiMsg(`> ${data.results.length} resultados · usé "${m.title}" (${yearShown}) · tip: pon el año exacto y vuelve a buscar para más precisión`)
        } else {
          setApiMsg(`> "${m.title}" (${yearShown}) ✓ campos vacíos rellenados`)
        }
      } else {
        const yearHint = newAnio.trim() ? ` (filtrando por año ${newAnio})` : ''
        setApiMsg(`> sin resultados en tmdb${yearHint} · prueba quitar el año o cambiar el título`)
      }
    } catch (e) {
      setApiMsg('> error consultando tmdb · revisa la api key')
    }
    setSearchingApi(false)
  }

  function resetNewForm() {
    setNewTeca('biblioteca')
    setNewFormato('')
    setNewTitulo('')
    setNewAutor('')
    setNewAnio('')
    setNewIsbn('')
    setNewCategorias('')
    setNewDescripcion('')
    setNewPortadaUrl('')
    setNewEspecial(false)
    setApiMsg(null)
  }

  async function agregarLibro() {
    if (!newTitulo.trim() || !newAutor.trim()) {
      alert('título y autor son obligatorios')
      return
    }
    setSavingNew(true)
    const payload: Record<string, unknown> = {
      titulo: newTitulo.trim(),
      autor: newAutor.trim(),
      edicion_especial: newEspecial,
      teca: newTeca,
    }
    if (newFormato.trim()) payload.formato = newFormato.trim()
    if (newAnio) payload.anio = parseInt(newAnio, 10)
    if (newIsbn.trim()) payload.isbn = newIsbn.trim()
    if (newCategorias.trim()) {
      payload.categorias = newCategorias.split(',').map((s) => s.trim()).filter(Boolean)
    }
    if (newDescripcion.trim()) payload.descripcion = newDescripcion.trim()
    if (newPortadaUrl.trim()) payload.portada_url = newPortadaUrl.trim()
    const { error } = await supabase.from('libros').insert(payload)
    setSavingNew(false)
    if (error) {
      alert('error al guardar: ' + error.message)
      return
    }
    resetNewForm()
    setShowAdd(false)
    setRefreshKey((k) => k + 1)
  }

  async function uploadPortadaFile(file: File) {
    if (!editingLibro) return
    setUploading(true)
    const procesado = await comprimirImagen(file)
    const ext = (procesado.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${editingLibro.id}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('portadas')
      .upload(path, procesado, { upsert: true, contentType: procesado.type })
    if (upErr) {
      alert('error subiendo: ' + upErr.message)
      setUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from('portadas').getPublicUrl(path)
    const finalUrl = `${pub.publicUrl}?v=${Date.now()}`
    const { error: updErr } = await supabase
      .from('libros')
      .update({ portada_url: finalUrl })
      .eq('id', editingLibro.id)
    setUploading(false)
    if (updErr) {
      alert('error actualizando libro: ' + updErr.message)
      return
    }
    setEditingLibro(null)
    setUploadUrl('')
    setRefreshKey((k) => k + 1)
  }

  async function setPortadaFromUrl() {
    if (!editingLibro || !uploadUrl.trim()) return
    setUploading(true)
    const { error } = await supabase
      .from('libros')
      .update({ portada_url: uploadUrl.trim() })
      .eq('id', editingLibro.id)
    setUploading(false)
    if (error) {
      alert('error: ' + error.message)
      return
    }
    setUploadUrl('')
    setEditingLibro(null)
    setRefreshKey((k) => k + 1)
  }

  async function setEstadoLibro(libro: Libro, motivo: string | null) {
    // motivo === null → vuelve a disponible
    // motivo presente → disponible=false con esa razón
    const payload = motivo
      ? { disponible: false, motivo }
      : { disponible: true, motivo: null }
    const { error } = await supabase
      .from('libros')
      .update(payload)
      .eq('id', libro.id)
    if (error) {
      alert('error: ' + error.message)
      return
    }
    setLibros((ls) =>
      ls.map((l) => (l.id === libro.id ? { ...l, ...payload } : l))
    )
    setEstadoMenuOpen(null)
  }

  async function toggleEspecial(libro: Libro) {
    const { error } = await supabase
      .from('libros')
      .update({ edicion_especial: !libro.edicion_especial })
      .eq('id', libro.id)
    if (error) {
      alert('error: ' + error.message)
      return
    }
    setLibros((ls) =>
      ls.map((l) => (l.id === libro.id ? { ...l, edicion_especial: !libro.edicion_especial } : l))
    )
    if (editingLibro?.id === libro.id) {
      setEditingLibro({ ...editingLibro, edicion_especial: !libro.edicion_especial })
    }
  }

  /* Guarda título / autor / año / isbn / categorías / descripción del libro abierto */
  async function guardarEdiciones() {
    if (!editingLibro) return
    if (!editTitulo.trim() || !editAutor.trim()) {
      setEditMsg('título y autor son obligatorios')
      return
    }
    setSavingEdit(true)
    setEditMsg(null)

    const cats = editCategorias
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const payload = {
      titulo: editTitulo.trim(),
      autor: editAutor.trim() || null,
      anio: editAnio ? parseInt(editAnio, 10) : null,
      isbn: editIsbn.trim() || null,
      categorias: cats.length > 0 ? cats : null,
      descripcion: editDescripcion.trim() || null,
    }

    const { error } = await supabase
      .from('libros')
      .update(payload)
      .eq('id', editingLibro.id)
    setSavingEdit(false)
    if (error) {
      setEditMsg('error: ' + error.message)
      return
    }

    setLibros((ls) =>
      ls.map((l) => (l.id === editingLibro.id ? { ...l, ...payload } : l))
    )
    setEditingLibro({ ...editingLibro, ...payload })
    setEditMsg('guardado ✓')
    setTimeout(() => setEditMsg(null), 2200)
  }

  async function eliminarLibro() {
    if (!editingLibro) return
    if (!confirm(`Eliminar permanentemente "${editingLibro.titulo}"? Esta acción NO se puede deshacer.`)) return
    const { error } = await supabase.from('libros').delete().eq('id', editingLibro.id)
    if (error) {
      alert('error: ' + error.message)
      return
    }
    setLibros((ls) => ls.filter((l) => l.id !== editingLibro.id))
    setEditingLibro(null)
    setRefreshKey((k) => k + 1)
  }

  if (loading) {
    return (
      <TecaLayout>
        <section className="px-10 py-20 max-w-7xl mx-auto">
          <p className="opacity-70 font-mono text-[clamp(13px,1vw,16px)]">
            &gt; verificando permisos<span className="animate-pulse">_</span>
          </p>
        </section>
      </TecaLayout>
    )
  }

  if (!isEditor) return null

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <TecaLayout>
      <AdminNav />
      <section className="px-10 pt-10 pb-16 max-w-7xl mx-auto max-md:px-5">
        <p className="font-micro uppercase tracking-[0.12em] text-[11px] text-acid mb-3">
          admin · libros
        </p>
        <h1 className="font-sans font-light leading-none mb-3 text-[clamp(32px,3.8vw,52px)] tracking-[-0.01em] text-text">
          Catálogo
        </h1>
        <p className="text-text-dim mb-8 text-[clamp(13px,1vw,15px)]">
          subir portadas, agregar libros, marcar joyas, controlar disponibilidad · <span className="font-mono">{total.toLocaleString('es-MX')}</span> libros aprox.
        </p>

        <PausarSeccion />

        {/* TOOLBAR · search + chip filters + CTA agregar */}
        <div className="border-t border-rule pt-5 mb-6 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar título o autor..."
            className="flex-1 min-w-[220px] bg-bone text-tinta border border-tinta px-4 py-2 font-micro text-[12px] tracking-[0.02em] placeholder:text-tinta/40 placeholder:italic outline-none focus:border-text-bright"
          />

          <button
            onClick={() => setFiltroSinPortada(!filtroSinPortada)}
            className={`inline-flex items-center border border-tinta rounded-sm px-3 py-2 font-micro text-[10px] uppercase tracking-[0.08em] transition-colors ${filtroSinPortada ? 'bg-brillante text-bone' : 'bg-tinta text-bone hover:bg-brillante hover:text-bone'}`}
          >
            sin portada
          </button>

          <button
            onClick={() => setFiltroJoyas(!filtroJoyas)}
            className={`inline-flex items-center border border-tinta rounded-sm px-3 py-2 font-micro text-[10px] uppercase tracking-[0.08em] transition-colors ${filtroJoyas ? 'bg-brillante text-bone' : 'bg-tinta text-bone hover:bg-brillante hover:text-bone'}`}
          >
            ★ joyas
          </button>

          <button
            onClick={() => setFiltroNoDisponibles(!filtroNoDisponibles)}
            className={`inline-flex items-center border border-tinta rounded-sm px-3 py-2 font-micro text-[10px] uppercase tracking-[0.08em] transition-colors ${filtroNoDisponibles ? 'bg-brillante text-bone' : 'bg-tinta text-bone hover:bg-brillante hover:text-bone'}`}
          >
            no disponibles
          </button>

          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center bg-brillante text-bone border border-tinta rounded-sm px-4 py-2 font-micro text-[11px] uppercase tracking-[0.08em] hover:bg-tinta hover:text-acid transition-colors"
          >
            + agregar libro
          </button>
        </div>

        {libros.length === 0 ? (
          <div className="border border-rule p-8 bg-bg-soft text-center">
            <p className="font-mono opacity-70">&gt; no se encontraron libros con esos filtros</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {libros.map((l) => {
              const noDisponible = !l.disponible
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setEditingLibro(l)}
                  className="flex flex-col gap-1 group relative text-left hover:opacity-90 transition-opacity"
                  title="Click para editar"
                >
                  {l.edicion_especial && (
                    <span
                      title="Edición especial"
                      className="absolute top-1 right-1 z-10 bg-brillante text-bone font-mono text-[10px] px-1.5 py-0.5"
                    >
                      ★
                    </span>
                  )}
                  {noDisponible && (
                    <span
                      title={l.motivo ?? 'no disponible'}
                      className="absolute top-1 left-1 z-10 bg-loan text-bg font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5"
                    >
                      {l.motivo ?? 'no disp.'}
                    </span>
                  )}
                  <div className={`aspect-[2/3] bg-bg-soft flex items-center justify-center text-text-dim p-2 text-center overflow-hidden text-[10px] mb-1 group-hover:ring-2 group-hover:ring-brillante ${noDisponible ? 'opacity-50' : ''}`}>
                    <Cover
                      titulo={l.titulo}
                      portada_url={l.portada_url}
                      isbn={l.isbn}
                      autor={l.autor}
                    />
                  </div>
                  <p className="font-medium leading-tight text-[11px] line-clamp-2">{l.titulo}</p>
                  <p className="opacity-60 text-[10px] line-clamp-1">{l.autor ?? '—'}</p>
                  {wishlist[l.id] ? (
                    <span className="mt-0.5 font-micro text-[9px] uppercase tracking-[0.08em] text-acid">
                      ♡ en {wishlist[l.id]} {wishlist[l.id] === 1 ? 'morral' : 'morrales'}
                    </span>
                  ) : null}
                  <span className="mt-1 font-micro text-[9px] uppercase tracking-[0.08em] text-acid opacity-0 group-hover:opacity-100 transition-opacity">
                    · editar →
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-4 font-mono text-sm">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 border border-rule hover:border-rule-strong disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← anterior
            </button>
            <span className="opacity-70 text-xs">
              página {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 border border-rule hover:border-rule-strong disabled:opacity-30 disabled:cursor-not-allowed"
            >
              siguiente →
            </button>
          </div>
        )}

        {editingLibro && (
          <div
            className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto"
            onClick={() => !uploading && !savingEdit && setEditingLibro(null)}
          >
            <div
              className="bg-bg-card border border-tinta max-w-3xl w-full p-6 my-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="font-micro text-[11px] uppercase tracking-[0.12em] text-acid mb-1">
                    editando libro
                  </p>
                  <h2 className="font-sans font-light text-[clamp(20px,2.2vw,28px)] tracking-[-0.005em] text-text leading-tight">
                    {editingLibro.titulo}
                  </h2>
                </div>
                <button
                  onClick={() => !uploading && !savingEdit && setEditingLibro(null)}
                  disabled={uploading || savingEdit}
                  className="font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim hover:text-text-bright"
                >
                  × cerrar
                </button>
              </div>

              <div className="grid grid-cols-[180px_1fr] gap-6 max-md:grid-cols-1">
                {/* === PORTADA · drop zone + upload + paste URL === */}
                <div className="flex flex-col gap-3">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDraggingOver(true)
                    }}
                    onDragLeave={() => setDraggingOver(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDraggingOver(false)
                      const f = e.dataTransfer.files?.[0]
                      if (f && f.type.startsWith('image/')) uploadPortadaFile(f)
                    }}
                    className={`aspect-[2/3] bg-bg-soft flex items-center justify-center text-text-dim p-2 text-center text-[10px] border-2 border-dashed transition-colors ${
                      draggingOver ? 'border-brillante bg-brillante/10' : 'border-rule'
                    }`}
                  >
                    {editingLibro.portada_url ? (
                      <img
                        src={editingLibro.portada_url}
                        alt={editingLibro.titulo}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-micro uppercase tracking-[0.08em] text-text-dim">
                        {draggingOver ? '↓ soltar imagen ↓' : 'arrastra una imagen aquí'}
                      </span>
                    )}
                  </div>

                  <label className="font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim cursor-pointer text-center border border-tinta px-2 py-1.5 hover:bg-brillante hover:text-bone transition-colors">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadPortadaFile(f)
                        e.target.value = ''
                      }}
                      className="hidden"
                    />
                    + subir archivo
                  </label>

                  <div className="flex flex-col gap-1.5">
                    <input
                      type="url"
                      value={uploadUrl}
                      onChange={(e) => setUploadUrl(e.target.value)}
                      placeholder="o pega URL..."
                      className="w-full bg-bone text-tinta border border-tinta px-2 py-1.5 font-micro text-[10px] placeholder:text-tinta/40 outline-none focus:border-text-bright"
                    />
                    <button
                      onClick={setPortadaFromUrl}
                      disabled={uploading || !uploadUrl.trim()}
                      className="font-micro text-[10px] uppercase tracking-[0.08em] border border-tinta px-2 py-1.5 hover:bg-brillante hover:text-bone disabled:opacity-30 transition-colors"
                    >
                      guardar URL
                    </button>
                  </div>

                  {uploading && (
                    <p className="font-micro text-[10px] text-text-dim lowercase">subiendo...</p>
                  )}
                </div>

                {/* === CAMPOS EDITABLES === */}
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim">título *</span>
                    <input
                      value={editTitulo}
                      onChange={(e) => setEditTitulo(e.target.value)}
                      className="bg-bone text-tinta border border-tinta px-3 py-2 font-mono text-[13px] outline-none focus:border-text-bright"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim">autor *</span>
                    <input
                      value={editAutor}
                      onChange={(e) => setEditAutor(e.target.value)}
                      className="bg-bone text-tinta border border-tinta px-3 py-2 font-mono text-[13px] outline-none focus:border-text-bright"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim">año</span>
                      <input
                        type="number"
                        value={editAnio}
                        onChange={(e) => setEditAnio(e.target.value)}
                        className="bg-bone text-tinta border border-tinta px-3 py-2 font-mono text-[13px] outline-none focus:border-text-bright"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim">ISBN</span>
                      <input
                        value={editIsbn}
                        onChange={(e) => setEditIsbn(e.target.value)}
                        className="bg-bone text-tinta border border-tinta px-3 py-2 font-mono text-[13px] outline-none focus:border-text-bright"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim">categorías (separadas por comas)</span>
                    <input
                      value={editCategorias}
                      onChange={(e) => setEditCategorias(e.target.value)}
                      className="bg-bone text-tinta border border-tinta px-3 py-2 font-mono text-[13px] outline-none focus:border-text-bright"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim">descripción</span>
                    <textarea
                      value={editDescripcion}
                      onChange={(e) => setEditDescripcion(e.target.value)}
                      rows={3}
                      className="bg-bone text-tinta border border-tinta px-3 py-2 font-mono text-[13px] outline-none focus:border-text-bright resize-y"
                    />
                  </label>

                  {/* === TOGGLES rápidos === */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-rule">
                    <button
                      type="button"
                      onClick={() => toggleEspecial(editingLibro)}
                      className={`inline-flex items-center border border-tinta rounded-sm px-3 py-1.5 font-micro text-[10px] uppercase tracking-[0.08em] transition-colors ${
                        editingLibro.edicion_especial ? 'bg-brillante text-bone' : 'bg-tinta text-bone hover:bg-brillante hover:text-bone'
                      }`}
                    >
                      {editingLibro.edicion_especial ? '★ joya' : '☆ marcar joya'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setEstadoLibro(editingLibro, null)}
                      className={`inline-flex items-center border border-tinta rounded-sm px-3 py-1.5 font-micro text-[10px] uppercase tracking-[0.08em] transition-colors ${
                        editingLibro.disponible && !editingLibro.motivo
                          ? 'bg-available text-tinta border-available'
                          : 'bg-tinta text-bone hover:bg-available hover:text-tinta hover:border-available'
                      }`}
                    >
                      ● disponible
                    </button>

                    {MOTIVOS_PRESET.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEstadoLibro(editingLibro, m)}
                        className={`inline-flex items-center border border-tinta rounded-sm px-3 py-1.5 font-micro text-[10px] uppercase tracking-[0.08em] transition-colors ${
                          editingLibro.motivo === m
                            ? 'bg-loan text-tinta border-loan'
                            : 'bg-tinta text-bone hover:bg-loan hover:text-tinta hover:border-loan'
                        }`}
                      >
                        ○ {m}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        const custom = window.prompt('Motivo personalizado:')
                        if (custom?.trim()) setEstadoLibro(editingLibro, custom.trim())
                      }}
                      className="inline-flex items-center border border-rule rounded-sm px-3 py-1.5 font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim hover:bg-tinta hover:text-bone hover:border-tinta transition-colors"
                    >
                      + otro motivo
                    </button>
                  </div>

                  {/* === ACTIONS === */}
                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-rule mt-2">
                    <button
                      type="button"
                      onClick={guardarEdiciones}
                      disabled={savingEdit}
                      className="inline-flex items-center bg-brillante text-bone border border-tinta rounded-sm px-4 py-2 font-micro text-[11px] uppercase tracking-[0.08em] disabled:opacity-30 hover:bg-tinta hover:text-acid transition-colors"
                    >
                      {savingEdit ? 'guardando...' : '✓ guardar cambios'}
                    </button>

                    {editMsg && (
                      <span className={`font-micro text-[10px] uppercase tracking-[0.08em] ${editMsg.includes('✓') ? 'text-available' : 'text-loan'}`}>
                        {editMsg}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={eliminarLibro}
                      disabled={savingEdit}
                      className="ml-auto inline-flex items-center border border-loan rounded-sm px-3 py-1.5 font-micro text-[10px] uppercase tracking-[0.08em] text-loan hover:bg-loan hover:text-bg disabled:opacity-30 transition-colors"
                    >
                      × eliminar libro
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showAdd && (
          <div
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => !savingNew && setShowAdd(false)}
          >
            <div
              className="bg-bg-card border border-tinta max-w-xl w-full p-6 font-mono my-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-micro text-[11px] uppercase tracking-[0.12em] text-acid mb-1">
                nuevo item
              </p>
              <h2 className="font-sans font-light text-[clamp(20px,2.2vw,28px)] tracking-[-0.005em] text-text mb-5">
                Agregar al catálogo
              </h2>

              <div className="flex flex-col gap-3 text-xs">
                {/* SELECTOR DE TECA · obligatorio antes que nada */}
                <div className="flex flex-col gap-2 pb-3 border-b border-rule">
                  <span className="font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim">¿a qué teca va este item? *</span>
                  <div className="flex flex-wrap gap-2">
                    {(['biblioteca', 'artoteca', 'fonoteca', 'videoteca', 'editorial'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewTeca(t)}
                        className={`inline-flex items-center border border-tinta rounded-sm px-3 py-1.5 font-micro text-[10px] uppercase tracking-[0.08em] transition-colors ${
                          newTeca === t
                            ? 'bg-brillante text-bone'
                            : 'bg-tinta text-bone hover:bg-brillante hover:text-bone'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {newTeca === 'videoteca' && (
                    <p className="font-micro text-[10px] text-text-dim mt-1 lowercase">
                      tip: para videoteca puedes poner el formato (vhs, dvd, bluray, 16mm) en el campo de abajo.
                    </p>
                  )}
                </div>

                <label className="flex flex-col gap-1">
                  <span className="opacity-70 uppercase tracking-wider">título *</span>
                  <input
                    value={newTitulo}
                    onChange={(e) => setNewTitulo(e.target.value)}
                    className="bg-bg-soft border border-rule focus:border-rule-strong focus:outline-none px-3 py-2 text-text-bright"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="opacity-70 uppercase tracking-wider">formato (vhs, dvd, lp, cassette, etc.)</span>
                  <input
                    value={newFormato}
                    onChange={(e) => setNewFormato(e.target.value)}
                    placeholder={newTeca === 'videoteca' ? 'vhs, dvd, bluray, 16mm...' : newTeca === 'fonoteca' ? 'lp, ep, cassette, cd...' : 'opcional'}
                    className="bg-bg-soft border border-rule focus:border-rule-strong focus:outline-none px-3 py-2 text-text-bright"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="opacity-70 uppercase tracking-wider">autor *</span>
                  <input
                    value={newAutor}
                    onChange={(e) => setNewAutor(e.target.value)}
                    className="bg-bg-soft border border-rule focus:border-rule-strong focus:outline-none px-3 py-2 text-text-bright"
                  />
                </label>

                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {newTeca === 'videoteca' ? (
                    <button
                      type="button"
                      onClick={buscarEnTmdb}
                      disabled={searchingApi || !newTitulo.trim()}
                      className="px-3 py-2 border border-rule hover:border-rule-strong disabled:opacity-40 uppercase tracking-wider"
                    >
                      {searchingApi ? 'buscando...' : '⌕ autorrellenar con tmdb'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={buscarEnApi}
                      disabled={searchingApi || !newTitulo.trim()}
                      className="px-3 py-2 border border-rule hover:border-rule-strong disabled:opacity-40 uppercase tracking-wider"
                    >
                      {searchingApi ? 'buscando...' : '⌕ autorrellenar con open library'}
                    </button>
                  )}
                  {apiMsg && <span className="opacity-70">{apiMsg}</span>}
                </div>

                <div className="border-t border-rule pt-3 mt-2">
                  <p className="opacity-60 text-[10px] uppercase tracking-wider mb-2">
                    // opcionales
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="opacity-70 uppercase tracking-wider">año</span>
                      <input
                        type="number"
                        value={newAnio}
                        onChange={(e) => setNewAnio(e.target.value)}
                        className="bg-bg-soft border border-rule focus:border-rule-strong focus:outline-none px-3 py-2 text-text-bright"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="opacity-70 uppercase tracking-wider">isbn</span>
                      <input
                        value={newIsbn}
                        onChange={(e) => setNewIsbn(e.target.value)}
                        className="bg-bg-soft border border-rule focus:border-rule-strong focus:outline-none px-3 py-2 text-text-bright"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1 mt-3">
                    <span className="opacity-70 uppercase tracking-wider">
                      categorías (separadas por coma)
                    </span>
                    <input
                      value={newCategorias}
                      onChange={(e) => setNewCategorias(e.target.value)}
                      placeholder="ej: ANARQUISMO, FILOSOFIA"
                      className="bg-bg-soft border border-rule focus:border-rule-strong focus:outline-none px-3 py-2 text-text-bright placeholder:opacity-30"
                    />
                  </label>

                  <label className="flex flex-col gap-1 mt-3">
                    <span className="opacity-70 uppercase tracking-wider">descripción</span>
                    <textarea
                      value={newDescripcion}
                      onChange={(e) => setNewDescripcion(e.target.value)}
                      rows={3}
                      className="bg-bg-soft border border-rule focus:border-rule-strong focus:outline-none px-3 py-2 text-text-bright resize-none"
                    />
                  </label>

                  <label className="flex flex-col gap-1 mt-3">
                    <span className="opacity-70 uppercase tracking-wider">
                      portada url (open library / google)
                    </span>
                    <input
                      type="url"
                      value={newPortadaUrl}
                      onChange={(e) => setNewPortadaUrl(e.target.value)}
                      placeholder="https://..."
                      className="bg-bg-soft border border-rule focus:border-rule-strong focus:outline-none px-3 py-2 text-text-bright placeholder:opacity-30"
                    />
                  </label>

                  <label className="flex items-center gap-2 mt-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEspecial}
                      onChange={(e) => setNewEspecial(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="uppercase tracking-wider">
                      ★ edición especial / joya
                    </span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-between items-center">
                <button
                  onClick={() => {
                    resetNewForm()
                    setShowAdd(false)
                  }}
                  disabled={savingNew}
                  className="text-xs uppercase tracking-wider opacity-60 hover:opacity-100"
                >
                  × cancelar
                </button>
                <button
                  onClick={agregarLibro}
                  disabled={savingNew || !newTitulo.trim() || !newAutor.trim()}
                  className="px-4 py-2 bg-invert-bg text-invert-fg text-xs uppercase tracking-wider hover:opacity-90 disabled:opacity-40"
                >
                  {savingNew ? 'guardando...' : 'guardar libro →'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </TecaLayout>
  )
}
