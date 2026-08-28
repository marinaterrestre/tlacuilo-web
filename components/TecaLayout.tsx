'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from './Header'

type Categoria = { categoria: string; libros_count: number }
type Decada = { decada: number; libros_count: number }
type Artista = { artista: string; libros_count: number }

const TECAS = [
  { slug: 'biblioteca', label: 'Biblioteca', href: '/biblioteca', enabled: true },
  { slug: 'artoteca', label: 'Artoteca', href: '/artoteca', enabled: true },
  { slug: 'fonoteca', label: 'Fonoteca', href: '#', enabled: false },
  { slug: 'videoteca', label: 'Videoteca', href: '/videoteca', enabled: true },
  { slug: 'editorial', label: 'Editorial', href: '#', enabled: false },
] as const

type Props = {
  children: React.ReactNode
  /** Categorías pre-fetched server-side (biblioteca). */
  initialCategorias?: Categoria[]
  /** Décadas pre-fetched server-side (videoteca). */
  initialDecadas?: Decada[]
  /** Artistas pre-fetched server-side (artoteca). */
  initialArtistas?: Artista[]
}

/**
 * Layout para páginas interiores (biblioteca, item detail, buscar, mi-tlacuilo, videoteca, artoteca, etc.)
 * - Header COMPLETO arriba (banda de tecas en Jost siempre visible;
 *   decisión Marina 2026-07-08: las tecas viven arriba, no en la sidebar)
 * - Sidebar izquierdo SOLO con filtros contextuales de la teca activa
 *     · biblioteca → categorías
 *     · videoteca → décadas
 *     · artoteca → artistas
 * - Sin teca activa (buscar, mi-tlacuilo, checkout) no hay sidebar
 * - Hamburguesa en mobile
 */
export default function TecaLayout({ children, initialCategorias, initialDecadas, initialArtistas }: Props) {
  const pathname = usePathname()
  const [categorias, setCategorias] = useState<Categoria[]>(initialCategorias ?? [])
  const [decadas, setDecadas] = useState<Decada[]>(initialDecadas ?? [])
  const [artistas, setArtistas] = useState<Artista[]>(initialArtistas ?? [])
  const [navOpen, setNavOpen] = useState(false)

  // Fallback cliente solo si NO vienen pre-cargadas
  useEffect(() => {
    if (initialCategorias && initialCategorias.length > 0) return
    supabase.rpc('distinct_categorias').then(({ data }) => {
      if (data) setCategorias(data as Categoria[])
    })
  }, [initialCategorias])

  useEffect(() => {
    if (initialDecadas && initialDecadas.length > 0) return
    supabase.rpc('distinct_decadas_videoteca').then(({ data }) => {
      if (data) setDecadas(data as Decada[])
    })
  }, [initialDecadas])

  useEffect(() => {
    if (initialArtistas && initialArtistas.length > 0) return
    supabase.rpc('distinct_artistas_artoteca').then(({ data }) => {
      if (data) setArtistas(data as Artista[])
    })
  }, [initialArtistas])

  const activeTeca = TECAS.find((t) => pathname?.startsWith(t.href) && t.enabled)?.slug ?? null
  const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const activeCategoria = sp?.get('categoria') ?? null
  const activeDecada = sp?.get('decada') ?? null
  const activeArtista = sp?.get('artista') ?? null

  const hasSidebar = activeTeca !== null

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* ============ HEADER completo · tecas siempre arriba ============ */}
      <Header />

      {/* ============ LAYOUT GRID: sidebar de filtros + main ============ */}
      <div className="flex">
        {/* SIDEBAR DESKTOP — solo filtros de la teca activa */}
        {hasSidebar && (
          <aside className="hidden md:block w-[260px] lg:w-[280px] shrink-0 border-r border-rule p-6 sticky top-0 self-start max-h-screen overflow-y-auto">
            <SidebarContent
              categorias={categorias}
              decadas={decadas}
              artistas={artistas}
              activeTeca={activeTeca}
              activeCategoria={activeCategoria}
              activeDecada={activeDecada}
              activeArtista={activeArtista}
            />
          </aside>
        )}

        {/* HAMBURGER mobile · fuera del nav drawer para abrirlo */}
        {hasSidebar && (
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Abrir menú de categorías"
            className="md:hidden fixed bottom-5 right-5 z-40 bg-tinta text-bone border border-tinta rounded-full p-3 shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
        )}

        {/* MAIN */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1">{children}</div>

          {/* Pie mínimo de las páginas interiores. El landing tiene el suyo,
              completo; aquí solo lo que alguien puede necesitar a media
              navegación: cómo funciona esto y a quién escribirle. */}
          <footer className="border-t border-rule px-10 max-md:px-5 py-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-text-dim">
            <Link href="/preguntas" className="hover:text-text-bright transition-colors">
              → cómo funciona
            </Link>
            <Link href="/manifesto" className="hover:text-text-bright transition-colors">
              → manifiesto
            </Link>
            <a href="mailto:tlacuilo@tlacuilo.org" className="hover:text-text-bright transition-colors">
              → tlacuilo@tlacuilo.org
            </a>
            <span className="opacity-50">lun–vie · 10:30–14:30 · 16:00–18:30</span>
          </footer>
        </main>
      </div>

      {/* ============ MOBILE DRAWER ============ */}
      {hasSidebar && navOpen && (
        <>
          <div
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 bg-black/60 z-[90] md:hidden"
            aria-hidden="true"
          />
          <div className="fixed top-0 left-0 bottom-0 w-full bg-bg z-[100] flex flex-col overflow-y-auto md:hidden">
            <div className="flex items-center justify-between p-5 border-b border-rule">
              <span className="font-micro text-[11px] uppercase tracking-[0.12em] opacity-60">
                Categorías
              </span>
              <button
                onClick={() => setNavOpen(false)}
                aria-label="Cerrar menú"
                className="text-text p-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-7 h-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 p-6">
              <SidebarContent
                categorias={categorias}
                decadas={decadas}
                artistas={artistas}
                activeTeca={activeTeca}
                activeCategoria={activeCategoria}
                activeDecada={activeDecada}
                activeArtista={activeArtista}
                onLinkClick={() => setNavOpen(false)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ============================================================
   SIDEBAR CONTENT (reusado en desktop y mobile)
   Solo filtros de la teca activa, en sus botoncitos de siempre.
   Las tecas viven arriba en la banda del Header (Jost).
   ============================================================ */

function SidebarContent({
  categorias,
  decadas,
  artistas,
  activeTeca,
  activeCategoria,
  activeDecada,
  activeArtista,
  onLinkClick,
}: {
  categorias: Categoria[]
  decadas: Decada[]
  artistas: Artista[]
  activeTeca: string | null
  activeCategoria: string | null
  activeDecada: string | null
  activeArtista: string | null
  onLinkClick?: () => void
}) {
  const chipClass = (isActive: boolean) =>
    `inline-flex items-baseline gap-1.5 border border-tinta rounded-sm px-2 py-1 font-micro text-[10px] uppercase tracking-[0.06em] transition-colors ${
      isActive
        ? 'bg-brillante text-bone'
        : 'bg-tinta text-bone hover:bg-brillante hover:text-bone'
    }`

  const labelClass =
    'font-acacia uppercase tracking-[0.06em] text-[14px] text-text block mb-4'

  if (activeTeca === 'biblioteca' && categorias.length > 0) {
    return (
      <nav>
        <span className={labelClass}>Categorías</span>
        <div className="flex flex-col items-start gap-1.5">
          <Link href="/biblioteca" onClick={onLinkClick} className={chipClass(!activeCategoria)}>
            todo
          </Link>
          {categorias.map((c) => (
            <Link
              key={c.categoria}
              href={`/biblioteca?categoria=${encodeURIComponent(c.categoria)}`}
              onClick={onLinkClick}
              className={chipClass(activeCategoria === c.categoria)}
            >
              <span>{c.categoria}</span>
              <span className="opacity-50 text-[9px]">{c.libros_count}</span>
            </Link>
          ))}
        </div>
      </nav>
    )
  }

  if (activeTeca === 'videoteca' && decadas.length > 0) {
    return (
      <nav>
        <span className={labelClass}>Décadas</span>
        <div className="flex flex-col items-start gap-1.5">
          <Link href="/videoteca" onClick={onLinkClick} className={chipClass(!activeDecada)}>
            todo
          </Link>
          {decadas.map((d) => (
            <Link
              key={d.decada}
              href={`/videoteca?decada=${d.decada}`}
              onClick={onLinkClick}
              className={chipClass(activeDecada === String(d.decada))}
            >
              <span>{d.decada}s</span>
              <span className="opacity-50 text-[9px]">{d.libros_count}</span>
            </Link>
          ))}
        </div>
      </nav>
    )
  }

  if (activeTeca === 'artoteca' && artistas.length > 0) {
    return (
      <nav>
        <span className={labelClass}>Artistas</span>
        <div className="flex flex-col items-start gap-1.5">
          <Link href="/artoteca" onClick={onLinkClick} className={chipClass(!activeArtista)}>
            todo
          </Link>
          {artistas.map((a) => (
            <Link
              key={a.artista}
              href={`/artoteca?artista=${encodeURIComponent(a.artista)}`}
              onClick={onLinkClick}
              className={chipClass(activeArtista === a.artista)}
            >
              <span>{a.artista}</span>
              <span className="opacity-50 text-[9px]">{a.libros_count}</span>
            </Link>
          ))}
        </div>
      </nav>
    )
  }

  return null
}
