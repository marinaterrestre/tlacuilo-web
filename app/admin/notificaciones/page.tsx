'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TecaLayout from '@/components/TecaLayout'
import AdminNav from '@/components/AdminNav'
import { useEditorGate } from '@/components/useEditorGate'
import { fechaCorta, bloqueDe, esHoy, yaPaso, urlVisita } from '@/lib/visitas'

function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${fechaCorta(iso)} · ${hh}:${mm}`
}

type PerfilRef = { handle: string | null; nombre_completo: string | null } | null
type LibroRef = { titulo: string } | null

type Reserva = {
  id: string
  user_id: string
  added_at: string
  visit_at: string | null
  confirmado_at: string | null
  libros: LibroRef
  perfiles: PerfilRef
}
type Lector = { id: string; handle: string | null; created_at: string; rol: string }
type Vencido = {
  id: string
  user_id: string
  visit_at: string | null
  due_at: string | null
  libros: LibroRef
  perfiles: PerfilRef
}

export default function AdminNotificacionesPage() {
  const { loading, isEditor, editorId } = useEditorGate()
  const [prevVisto, setPrevVisto] = useState<number>(0)
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [lectores, setLectores] = useState<Lector[]>([])
  const [vencidos, setVencidos] = useState<Vencido[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isEditor || !editorId) return
    const ahora = new Date().toISOString()

    // El visto compartido: se lee ANTES de pisarlo, para saber qué es nuevo.
    const { data: visto } = await supabase
      .from('admin_visto')
      .select('visto_at')
      .eq('editor_id', editorId)
      .maybeSingle()
    setPrevVisto(visto?.visto_at ? new Date(visto.visto_at).getTime() : 0)

    const campos = 'id, user_id, added_at, visit_at, confirmado_at, libros (titulo), perfiles!prestamos_user_id_perfiles_fkey (handle, nombre_completo)'
    const [r1, r2, r3] = await Promise.all([
      supabase.from('prestamos').select(campos).eq('status', 'apartado').order('added_at', { ascending: false }),
      supabase.from('perfiles_publicos').select('id, handle, created_at, rol').order('created_at', { ascending: false }).limit(20),
      supabase
        .from('prestamos')
        .select('id, user_id, visit_at, due_at, libros (titulo), perfiles!prestamos_user_id_perfiles_fkey (handle, nombre_completo)')
        .eq('status', 'recogido')
        .lt('due_at', ahora)
        .order('due_at', { ascending: true }),
    ])

    const fallo = r1.error ?? r2.error ?? r3.error
    if (fallo) setErrorCarga(fallo.message)
    setReservas((r1.data ?? []) as unknown as Reserva[])
    setLectores((r2.data ?? []) as unknown as Lector[])
    setVencidos((r3.data ?? []) as unknown as Vencido[])
    setCargando(false)

    // Ya lo viste: se marca para ti, no para el navegador.
    await supabase.from('admin_visto').upsert({ editor_id: editorId, visto_at: ahora })
  }, [isEditor, editorId])

  useEffect(() => { load() }, [load])

  if (loading || !isEditor) {
    return (
      <TecaLayout>
        <section className="px-10 py-20 max-w-5xl mx-auto">
          <p className="opacity-70 font-mono">&gt; verificando permisos<span className="animate-pulse">_</span></p>
        </section>
      </TecaLayout>
    )
  }

  const esNuevo = (iso: string) => new Date(iso).getTime() > prevVisto

  // Una reserva cuya fecha ya pasó no es una novedad, es un pendiente.
  const vigentes = reservas.filter((r) => !yaPaso(r.visit_at) || esHoy(r.visit_at))
  const colgadas = reservas.filter((r) => yaPaso(r.visit_at) && !esHoy(r.visit_at))
  const hoy = reservas.filter((r) => esHoy(r.visit_at))
  const sinConfirmar = vigentes.filter((r) => !r.confirmado_at)

  return (
    <TecaLayout>
      <AdminNav />
      <section className="px-10 pt-8 pb-16 max-w-5xl mx-auto max-md:px-5 font-mono">
        <h1 className="leading-tight mb-2 text-[clamp(28px,3.5vw,52px)] uppercase tracking-wide text-text-bright">
          Notificaciones
        </h1>
        <p className="opacity-70 mb-10 text-[clamp(13px,1vw,17px)]">
          Lo que ha pasado en el acervo. Lo marcado como nuevo apareció desde tu última visita, y ahora sí es tuyo y no de este navegador.
        </p>

        {errorCarga && (
          <p className="text-loan text-[13px] mb-6 border border-loan/50 p-3">
            &gt; no pude leer las notificaciones: {errorCarga}
          </p>
        )}

        {cargando ? (
          <p className="opacity-70">&gt; cargando<span className="animate-pulse">_</span></p>
        ) : (
          <>
            <Categoria titulo="Visitas de hoy" total={hoy.length} vacio="hoy no viene nadie.">
              {hoy.map((r) => (
                <FilaReserva key={r.id} r={r} nuevo={false} texto="viene por" />
              ))}
            </Categoria>

            <Categoria
              titulo="Esperan que confirmes"
              total={sinConfirmar.length}
              nuevos={sinConfirmar.filter((r) => esNuevo(r.added_at)).length}
              vacio="ninguna reserva esperando respuesta."
              alerta={sinConfirmar.length > 0}
            >
              {sinConfirmar.map((r) => (
                <FilaReserva key={r.id} r={r} nuevo={esNuevo(r.added_at)} texto="apartó" conHora />
              ))}
            </Categoria>

            <Categoria
              titulo="Devoluciones vencidas"
              total={vencidos.length}
              vacio="nada vencido. todo en orden."
              alerta={vencidos.length > 0}
            >
              {vencidos.map((v) => (
                <Fila key={v.id} nuevo={false} alerta href={v.visit_at ? urlVisita(v.user_id, v.visit_at) : undefined}>
                  <span className="text-text-bright">{v.perfiles?.nombre_completo?.trim() || `@${v.perfiles?.handle ?? 'sin alias'}`}</span>
                  <span className="opacity-70"> no ha devuelto </span>
                  <span className="text-text-bright">{v.libros?.titulo ?? '—'}</span>
                  <span className="text-loan"> · venció {fechaCorta(v.due_at)}</span>
                </Fila>
              ))}
            </Categoria>

            <Categoria
              titulo="Reservas colgadas"
              total={colgadas.length}
              vacio="ninguna reserva se quedó atrás."
              alerta={colgadas.length > 0}
              nota="su fecha pasó y siguen apartadas. ábrelas para devolverles los libros al morral y ofrecerles reagendar."
            >
              {colgadas.map((r) => (
                <FilaReserva key={r.id} r={r} nuevo={false} texto="nunca vino por" alerta />
              ))}
            </Categoria>

            <Categoria
              titulo="Últimos lectores"
              total={lectores.length}
              nuevos={lectores.filter((l) => esNuevo(l.created_at)).length}
              vacio="aún no hay perfiles."
            >
              {lectores.map((l) => (
                <Fila key={l.id} nuevo={esNuevo(l.created_at)} href={`/admin/persona/${l.id}`}>
                  <span className="text-text-bright">@{l.handle ?? 'sin-alias'}</span>
                  <span className="opacity-70"> se unió</span>
                  {l.rol === 'editor' && <span className="text-acid"> · editor</span>}
                  <span className="opacity-40 block text-[11px] mt-0.5">{fechaCorta(l.created_at)}</span>
                </Fila>
              ))}
            </Categoria>
          </>
        )}

        <div className="mt-10 pt-6 border-t border-rule text-[clamp(11px,0.85vw,13px)] opacity-70">
          <Link href="/admin/prestamos" className="underline hover:no-underline">
            ir a gestionar préstamos →
          </Link>
        </div>
      </section>
    </TecaLayout>
  )
}

function FilaReserva({
  r,
  nuevo,
  texto,
  conHora = false,
  alerta = false,
}: {
  r: Reserva
  nuevo: boolean
  texto: string
  conHora?: boolean
  alerta?: boolean
}) {
  return (
    <Fila nuevo={nuevo} alerta={alerta} href={r.visit_at ? urlVisita(r.user_id, r.visit_at) : undefined}>
      <span className="text-text-bright">{r.perfiles?.nombre_completo?.trim() || `@${r.perfiles?.handle ?? 'sin alias'}`}</span>
      <span className="opacity-70"> {texto} </span>
      <span className="text-text-bright">{r.libros?.titulo ?? '—'}</span>
      <span className="opacity-50"> · {fechaCorta(r.visit_at)} ({bloqueDe(r.visit_at)})</span>
      {conHora && <span className="opacity-40 block text-[11px] mt-0.5">apartado {fechaHora(r.added_at)}</span>}
    </Fila>
  )
}

function Categoria({
  titulo,
  nuevos = 0,
  total,
  vacio,
  alerta = false,
  nota,
  children,
}: {
  titulo: string
  nuevos?: number
  total: number
  vacio: string
  alerta?: boolean
  nota?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-10 border-t border-rule pt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className={`uppercase tracking-wide text-[clamp(15px,1.5vw,20px)] ${alerta && total > 0 ? 'text-loan' : 'text-text-bright'}`}>
          {titulo}
        </h2>
        <span className="text-[11px] uppercase tracking-wider">
          {nuevos > 0 && <span className="text-acid">{nuevos} nuevo{nuevos === 1 ? '' : 's'} · </span>}
          <span className={alerta && total > 0 ? 'text-loan' : 'opacity-50'}>{total} total</span>
        </span>
      </div>
      {nota && <p className="opacity-50 text-[11px] mb-3">{nota}</p>}
      {total === 0 ? (
        <p className="opacity-50 text-[clamp(12px,0.95vw,14px)]">&gt; {vacio}</p>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </div>
  )
}

function Fila({
  nuevo,
  alerta = false,
  href,
  children,
}: {
  nuevo: boolean
  alerta?: boolean
  href?: string
  children: React.ReactNode
}) {
  const clase = `border p-3 text-[clamp(12px,0.95vw,14px)] ${alerta ? 'border-loan/50' : 'border-rule'} bg-bg-soft ${nuevo ? 'border-l-2 border-l-acid' : ''} ${href ? 'block hover:border-rule-strong transition-colors' : ''}`
  const contenido = (
    <>
      {nuevo && <span className="text-acid text-[10px] uppercase tracking-wider mr-2">· nuevo</span>}
      {children}
    </>
  )
  if (href) return <Link href={href} className={clase}>{contenido}</Link>
  return <div className={clase}>{contenido}</div>
}
