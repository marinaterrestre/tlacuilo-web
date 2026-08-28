'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import MorralHeader from './MorralHeader'

type HeaderProps = {
  /** Si true, oculta la banda de 6 categorías. Útil para páginas interiores
      (biblioteca, buscar, etc.) que ya tienen sidebar propia. */
  slim?: boolean
  /** Si false, el header scrollea con la página (el landing lo usa para
      cederle el sticky al riel de categorías). */
  sticky?: boolean
}

/**
 * Header de Tlacuilo · 2 bandas (sticky)
 *
 * BANDA 1 (top): logo + search bar input + morral + MI TLACUILO
 *   (2026-07-17: se retiraron el ThemeToggle —Tlacuilo es dark-only por
 *    diseño; el light mode morado queda dormido en globals.css— y el icono
 *    de calendario, que ahora vive como link en la banda de tecas)
 * BANDA 2 (nav): categorías centradas
 *   BIBLIOTECA / ARTOTECA / FONOTECA / VIDEOTECA / MANIFIESTO / EDITORIAL
 *
 * Con slim=true solo se muestra BANDA 1.
 */
export default function Header({ slim = false, sticky = true }: HeaderProps) {
  const [user, setUser] = useState<User | null>(null)
  // Hasta que el primer getUser() responda, no mostramos ni ENTRAR ni
  // MI TLACUILO. Evita el flash de "ENTRAR" al navegar entre pages
  // cuando el componente se remonta y user parte como null antes del fetch.
  const [authChecked, setAuthChecked] = useState(false)
  const [q, setQ] = useState('')
  const [avisos, setAvisos] = useState<number>(0)
  const [esEditor, setEsEditor] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setAuthChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthChecked(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Badge de avisos para editores: reservas apartadas con visita de hoy en adelante.
  // In-app, no depende de correos: si trabajas en tlacuilo, lo ves en todas las páginas.
  useEffect(() => {
    if (!user) {
      setAvisos(0)
      setEsEditor(false)
      return
    }
    let mounted = true
    const load = async () => {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()
      if (!mounted) return
      if (perfil?.rol !== 'editor') {
        setEsEditor(false)
        return
      }
      setEsEditor(true)
      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('prestamos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'apartado')
        .gte('visit_at', hoy.toISOString())
      if (mounted) setAvisos(count ?? 0)
    }
    load()
    return () => { mounted = false }
  }, [user])

  const miTlacuiloHref = user ? '/mi-tlacuilo' : '/login'

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = q.trim()
    if (trimmed) router.push(`/buscar?q=${encodeURIComponent(trimmed)}`)
  }

  /* Tecas en Jost (2026-07-08, antes Costa) · color por modo via .teca-link */
  const tecaLinkClass =
    'font-sans font-normal teca-link text-[clamp(12px,1.1vw,15px)] tracking-[0.14em] uppercase hover:opacity-60 transition-opacity'

  return (
    <header className={`${sticky ? 'sticky top-0 z-50' : ''} bg-bg`}>
      {/* ============ BANDA 1 · LOGO + SEARCH + MORRAL + PERFIL ============ */}
      <div className="flex items-center justify-between gap-6 px-10 py-5 max-md:flex-col max-md:items-start max-md:gap-4 max-md:px-5">
        <Link href="/" className="block shrink-0" aria-label="Inicio">
          <span
            role="img"
            aria-label="tlacuilo"
            className="logo-wordmark h-[clamp(26px,2.8vw,40px)]"
          />
        </Link>

        <form
          onSubmit={handleSearch}
          className="flex-1 max-w-[420px] mx-auto max-md:w-full max-md:max-w-none"
          role="search"
        >
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar títulos, autores…"
            className="w-full bg-bone text-tinta border border-tinta px-4 py-2 font-micro text-[13px] tracking-[0.02em] placeholder:text-tinta/40 placeholder:italic outline-none focus:border-text-bright"
            autoComplete="off"
            aria-label="Buscar en el acervo"
          />
        </form>

        <div className="flex items-center gap-5 shrink-0">
          <MorralHeader />
          {/* La puerta a la zona de trabajo. Separada de MI TLACUILO a
              propósito: el perfil es tuyo, admin es la biblioteca. */}
          {esEditor && (
            <Link
              href="/admin"
              className="font-mono text-[clamp(11px,1.05vw,14px)] tracking-[0.12em] uppercase text-text hover:text-text-bright transition-colors"
            >
              ADMIN{avisos > 0 && <span className="accent-detail"> [{avisos}]</span>}
            </Link>
          )}
          <Link
            href={miTlacuiloHref}
            className={`font-mono text-[clamp(11px,1.05vw,14px)] tracking-[0.12em] uppercase text-text hover:text-text-bright transition-opacity duration-150 ${
              authChecked ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-hidden={!authChecked}
          >
            {user ? 'MI TLACUILO' : 'ENTRAR'}
          </Link>
        </div>
      </div>

      {/* ============ BANDA 2 · TECAS ============ */}
      {!slim && (
        <nav className="tecas-band py-3 px-10 max-md:px-5">
          <div className="flex flex-wrap items-center justify-center gap-x-[clamp(20px,3.5vw,56px)] gap-y-2">
            <Link href="/biblioteca" className={tecaLinkClass}>BIBLIOTECA</Link>
            <Link href="/artoteca" className={tecaLinkClass}>ARTOTECA</Link>
            <Link href="/proximamente" className={tecaLinkClass}>FONOTECA</Link>
            <Link href="/videoteca" className={tecaLinkClass}>VIDEOTECA</Link>
            <Link href="/manifesto" className={tecaLinkClass}>MANIFIESTO</Link>
            <Link href="/proximamente" className={tecaLinkClass}>EDITORIAL</Link>
          </div>
        </nav>
      )}
    </header>
  )
}
