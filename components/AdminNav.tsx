'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * La línea de la zona de admin.
 *
 * Admin es su propia área, separada del perfil: /mi-tlacuilo es TUYO (tu
 * morral, tus visitas, tus libros) y /admin es donde se opera la biblioteca.
 * Antes los botones de admin colgaban dentro del perfil y las dos cosas se
 * confundían.
 *
 * Cuatro entradas y ya. Lo que se toca de vez en cuando vive dentro de
 * Ajustes, no en la línea.
 */
const PAGINAS = [
  { href: '/admin/prestamos', label: 'Préstamos' },
  { href: '/admin/notificaciones', label: 'Notificaciones' },
  { href: '/admin/libros', label: 'Catálogo' },
  { href: '/admin/ajustes', label: 'Ajustes' },
] as const

export default function AdminNav() {
  const pathname = usePathname() ?? ''
  const [avisos, setAvisos] = useState(0)

  useEffect(() => {
    let vivo = true
    const contar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: visto } = await supabase
        .from('admin_visto')
        .select('visto_at')
        .eq('editor_id', user.id)
        .maybeSingle()
      if (!visto?.visto_at) return
      const [r1, r2] = await Promise.all([
        supabase
          .from('prestamos')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'apartado')
          .gt('added_at', visto.visto_at),
        supabase
          .from('perfiles_publicos')
          .select('id', { count: 'exact', head: true })
          .gt('created_at', visto.visto_at),
      ])
      if (vivo) setAvisos((r1.count ?? 0) + (r2.count ?? 0))
    }
    contar()
    return () => { vivo = false }
  }, [pathname])

  return (
    <nav className="border-b border-rule px-10 max-md:px-5 py-3 flex flex-wrap items-center gap-x-1 gap-y-2">
      <Link
        href="/admin"
        className="font-micro text-[10px] uppercase tracking-[0.12em] text-acid mr-3 hover:text-text-bright transition-colors"
      >
        · tlacuilo admin
      </Link>
      {PAGINAS.map((p) => {
        const activa = pathname.startsWith(p.href)
        const esNotif = p.href === '/admin/notificaciones'
        return (
          <Link
            key={p.href}
            href={p.href}
            className={`font-micro text-[11px] uppercase tracking-[0.08em] px-3 py-1.5 border transition-colors ${
              activa
                ? 'border-rule-strong text-text-bright'
                : 'border-transparent text-text-dim hover:text-text-bright hover:border-rule'
            }`}
          >
            {p.label}
            {esNotif && avisos > 0 && <span className="text-acid ml-1.5">[{avisos}]</span>}
          </Link>
        )
      })}
    </nav>
  )
}
