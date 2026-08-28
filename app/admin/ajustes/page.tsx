'use client'

import Link from 'next/link'
import TecaLayout from '@/components/TecaLayout'
import AdminNav from '@/components/AdminNav'
import { useEditorGate } from '@/components/useEditorGate'

/**
 * /admin/ajustes
 * Lo que se toca de vez en cuando. Vive aquí para que la línea de arriba se
 * quede en cuatro entradas y el día a día no compita con la configuración.
 */
const COSAS = [
  {
    href: '/admin/disponibilidad',
    titulo: 'Disponibilidad',
    texto: 'cerrar los días o bloques sin quien entregue, y quién viene cada día',
  },
  {
    href: '/admin/portadas',
    titulo: 'Portadas',
    texto: 'subir portadas al catálogo en tanda',
  },
  {
    href: '/admin/selecciones',
    titulo: 'Selecciones del landing',
    texto: 'las curadurías que se ven en la portada del sitio',
  },
  {
    href: '/admin/eventos',
    titulo: 'Eventos',
    texto: 'lo que aparece en el calendario',
  },
] as const

export default function AdminAjustesPage() {
  const { loading, isEditor } = useEditorGate()

  if (loading || !isEditor) {
    return (
      <TecaLayout>
        <section className="px-10 py-20 max-w-4xl mx-auto">
          <p className="opacity-70 font-mono">&gt; verificando permisos<span className="animate-pulse">_</span></p>
        </section>
      </TecaLayout>
    )
  }

  return (
    <TecaLayout>
      <AdminNav />
      <section className="px-10 max-md:px-5 pt-8 pb-16 max-w-3xl mx-auto font-mono">
        <h1 className="leading-tight mb-2 text-[clamp(28px,3.5vw,52px)] uppercase tracking-wide text-text-bright">
          Ajustes
        </h1>
        <p className="opacity-70 mb-10 text-[clamp(13px,1vw,17px)]">
          Lo que se toca de vez en cuando.
        </p>
        <div className="flex flex-col gap-2">
          {COSAS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="border border-rule bg-bg-soft p-4 hover:border-rule-strong transition-colors flex items-baseline justify-between gap-4"
            >
              <span>
                <span className="text-text-bright text-[14px] uppercase tracking-wide">{c.titulo}</span>
                <span className="block text-[12px] opacity-50 mt-1">{c.texto}</span>
              </span>
              <span className="opacity-40 text-[13px]">→</span>
            </Link>
          ))}
        </div>
      </section>
    </TecaLayout>
  )
}
