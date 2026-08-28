'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TecaLayout from '@/components/TecaLayout'
import AdminNav from '@/components/AdminNav'
import { useEditorGate } from '@/components/useEditorGate'
import { esHoy, yaPaso } from '@/lib/visitas'

/**
 * /admin
 * La entrada de la zona de trabajo. No repite el panel: dice cómo está el día
 * en tres números y manda a donde toca. El perfil de cada quien vive aparte,
 * en /mi-tlacuilo, y aquí no se mezcla.
 */
export default function AdminHome() {
  const { loading, isEditor } = useEditorGate()
  const [hoy, setHoy] = useState(0)
  const [porPreparar, setPorPreparar] = useState(0)
  const [vencidos, setVencidos] = useState(0)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    if (!isEditor) return
    const ahora = new Date()
    const { data: apartados } = await supabase
      .from('prestamos')
      .select('visit_at, confirmado_at')
      .eq('status', 'apartado')
    const { count: vencidosCount } = await supabase
      .from('prestamos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'recogido')
      .lt('due_at', ahora.toISOString())

    const filas = apartados ?? []
    setHoy(filas.filter((p) => esHoy(p.visit_at as string)).length)
    setPorPreparar(
      filas.filter((p) => !p.confirmado_at && !yaPaso(p.visit_at as string)).length
    )
    setVencidos(vencidosCount ?? 0)
    setCargando(false)
  }, [isEditor])

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

  return (
    <TecaLayout>
      <AdminNav />
      <section className="px-10 max-md:px-5 pt-10 pb-16 max-w-4xl mx-auto font-mono">
        <h1 className="leading-tight mb-2 text-[clamp(28px,3.5vw,52px)] uppercase tracking-wide text-text-bright">
          Admin
        </h1>
        <p className="opacity-70 mb-10 text-[clamp(13px,1vw,17px)]">
          La biblioteca por dentro. Tus cosas siguen en mi tlacuilo.
        </p>

        {cargando ? (
          <p className="opacity-70">&gt; cargando<span className="animate-pulse">_</span></p>
        ) : (
          <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-3 mb-12">
            <Numero n={hoy} label="vienen hoy" href="/admin/prestamos" />
            <Numero n={porPreparar} label="por juntar" href="/admin/prestamos" alerta={porPreparar > 0} />
            <Numero n={vencidos} label="vencidos" href="/admin/prestamos" alerta={vencidos > 0} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Entrada
            href="/admin/prestamos"
            titulo="Préstamos"
            texto="quién viene, qué hay que juntar, entregar y recibir"
          />
          <Entrada
            href="/admin/libros"
            titulo="Catálogo"
            texto="agregar y editar libros, subir portadas"
          />
          <Entrada
            href="/admin/ajustes"
            titulo="Ajustes"
            texto="disponibilidad, selecciones del landing, eventos"
          />
        </div>
      </section>
    </TecaLayout>
  )
}

function Numero({ n, label, href, alerta = false }: { n: number; label: string; href: string; alerta?: boolean }) {
  return (
    <Link href={href} className="border border-rule bg-bg-soft p-4 hover:border-rule-strong transition-colors">
      <p className={`text-[34px] leading-none ${alerta && n > 0 ? 'text-loan' : 'text-text-bright'}`}>{n}</p>
      <p className="text-[10px] uppercase tracking-[0.12em] opacity-50 mt-2">{label}</p>
    </Link>
  )
}

function Entrada({ href, titulo, texto }: { href: string; titulo: string; texto: string }) {
  return (
    <Link
      href={href}
      className="border border-rule bg-bg-soft p-4 hover:border-rule-strong transition-colors flex items-baseline justify-between gap-4"
    >
      <span>
        <span className="text-text-bright text-[14px] uppercase tracking-wide">{titulo}</span>
        <span className="block text-[12px] opacity-50 mt-1">{texto}</span>
      </span>
      <span className="opacity-40 text-[13px]">→</span>
    </Link>
  )
}
