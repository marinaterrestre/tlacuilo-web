'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { comprimirImagen } from '@/lib/imagen'
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
  isbn: string | null
  anio: number | null
  portada_url: string | null
}

/* ============================================================
   Página — bulk upload de portadas optimizado para Samm
   ============================================================ */

export default function AdminPortadasPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isEditor, setIsEditor] = useState(false)
  const [libros, setLibros] = useState<Libro[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchTitulo, setSearchTitulo] = useState('')

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
    let q = supabase
      .from('libros')
      .select('id, titulo, autor, isbn, anio, portada_url')
      .is('portada_url', null)
      .order('titulo', { ascending: true })
      .limit(60)

    if (searchTitulo.trim()) {
      const s = searchTitulo.trim().replace(/[%_]/g, '')
      q = q.or(`titulo.ilike.%${s}%,autor.ilike.%${s}%`)
    }

    const { data } = await q
    setLibros((data ?? []) as Libro[])
  }, [isEditor, searchTitulo, refreshKey])

  useEffect(() => {
    cargar()
  }, [cargar])

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
      <section className="px-10 pt-10 pb-16 max-w-6xl mx-auto max-md:px-5">
        <p className="font-micro uppercase tracking-[0.12em] text-[11px] text-acid mb-3">
          admin · portadas
        </p>
        <h1 className="font-sans font-light leading-none mb-3 text-[clamp(32px,3.8vw,52px)] tracking-[-0.01em] text-text">
          Subir portadas
        </h1>
        <p className="text-text-dim mb-8 text-[clamp(13px,1vw,15px)]">
          libros sin portada. pega URL o sube archivo. al guardar pasa al siguiente.
        </p>

        {/* Buscador */}
        <input
          value={searchTitulo}
          onChange={(e) => setSearchTitulo(e.target.value)}
          placeholder="Filtrar por título o autor..."
          className="w-full mb-8 bg-bone text-tinta border border-tinta px-4 py-2 font-micro text-[12px] tracking-[0.02em] placeholder:text-tinta/40 placeholder:italic outline-none focus:border-text-bright"
        />

        {libros.length === 0 ? (
          <p className="font-mono text-sm text-text-dim lowercase">
            no hay libros sin portada que coincidan. ✓
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {libros.map((libro) => (
              <PortadaRow
                key={libro.id}
                libro={libro}
                onSaved={() => setRefreshKey((k) => k + 1)}
              />
            ))}
          </div>
        )}
      </section>
    </TecaLayout>
  )
}

/* ============================================================
   PortadaRow — un libro con su slot para subir/pegar portada
   ============================================================ */

function PortadaRow({ libro, onSaved }: { libro: Libro; onSaved: () => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function guardarUrl() {
    if (!url.trim()) return
    setBusy(true)
    setErr(null)
    const { error } = await supabase
      .from('libros')
      .update({ portada_url: url.trim() })
      .eq('id', libro.id)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setUrl('')
    onSaved()
  }

  async function subirArchivo(file: File) {
    setBusy(true)
    setErr(null)
    const procesado = await comprimirImagen(file)
    const ext = (procesado.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${libro.id}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('portadas')
      .upload(path, procesado, { upsert: true, contentType: procesado.type })
    if (upErr) {
      setErr('upload: ' + upErr.message)
      setBusy(false)
      return
    }
    const { data: pub } = supabase.storage.from('portadas').getPublicUrl(path)
    const finalUrl = `${pub.publicUrl}?v=${Date.now()}`
    const { error: updErr } = await supabase
      .from('libros')
      .update({ portada_url: finalUrl })
      .eq('id', libro.id)
    setBusy(false)
    if (updErr) {
      setErr('db: ' + updErr.message)
      return
    }
    onSaved()
  }

  return (
    <div className="flex gap-4 border border-rule p-3">
      {/* Slot de portada */}
      <div className="w-[100px] flex-shrink-0">
        <div className="aspect-[2/3] bg-bg-card flex items-center justify-center text-[10px] text-text-dim text-center p-2 overflow-hidden">
          <Cover
            titulo={libro.titulo}
            portada_url={libro.portada_url}
            isbn={libro.isbn}
            autor={libro.autor}
          />
        </div>
      </div>

      {/* Info + controles */}
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div>
          <div className="font-mono text-[13px] text-text leading-tight">{libro.titulo}</div>
          <div className="font-mono text-[11px] text-text-dim mt-0.5">
            {libro.autor ?? '—'}
            {libro.anio && <span> · {libro.anio}</span>}
            {libro.isbn && <span> · isbn {libro.isbn}</span>}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mt-auto">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardarUrl()
            }}
            placeholder="pegar URL de la portada..."
            disabled={busy}
            className="bg-transparent border border-rule font-mono text-[11px] px-2 py-1.5 outline-none focus:border-text disabled:opacity-50"
          />

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={guardarUrl}
              disabled={busy || !url.trim()}
              className="inline-flex items-center bg-brillante text-bone border border-tinta rounded-sm px-3 py-1.5 font-micro text-[10px] uppercase tracking-[0.08em] disabled:opacity-30 hover:bg-tinta hover:text-acid transition-colors"
            >
              guardar url
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center bg-tinta text-bone border border-tinta rounded-sm px-3 py-1.5 font-micro text-[10px] uppercase tracking-[0.08em] disabled:opacity-30 hover:bg-brillante hover:text-bone transition-colors"
            >
              subir archivo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) subirArchivo(f)
                e.target.value = ''
              }}
            />
          </div>

          {busy && (
            <p className="font-mono text-[10px] text-text-dim lowercase">guardando...</p>
          )}
          {err && (
            <p className="font-mono text-[10px] text-loan lowercase">error: {err}</p>
          )}
        </div>
      </div>
    </div>
  )
}
