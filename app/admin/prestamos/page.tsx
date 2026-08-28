'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { CHECKOUT_STEPS, getMaxObjetosCheckout, setMaxObjetosCheckout } from '@/lib/config'
import TecaLayout from '@/components/TecaLayout'
import AdminNav from '@/components/AdminNav'
import { useEditorGate } from '@/components/useEditorGate'
import { fechaCorta, horarioDe, bloqueDe, esHoy, yaPaso, diasDesde, urlVisita } from '@/lib/visitas'

type Fila = {
  id: string
  status: 'apartado' | 'recogido' | 'devuelto'
  user_id: string
  visit_at: string | null
  picked_up_at: string | null
  due_at: string | null
  confirmado_at: string | null
  asistencia: string | null
  notes: string | null
  foto_registro_url: string | null
  libros: { id: string; titulo: string } | null
  perfiles: { handle: string | null; nombre_completo: string | null; telefono: string | null } | null
}

/** Una visita: una persona, un horario, todos sus objetos juntos. */
type Visita = {
  key: string
  userId: string
  /** Fecha que se muestra: la visita, o la salida si ya se los llevó. */
  fecha: string | null
  /** La llave real de la visita. Nunca cambia aunque ya se hayan recogido. */
  visitAt: string | null
  status: 'apartado' | 'recogido' | 'devuelto'
  nombre: string
  handle: string
  telefono: string | null
  objetos: number
  confirmada: boolean
  asistira: boolean
  dueAt: string | null
  recado: string | null
  fotosSalida: number
  titulos: string[]
}

function agrupar(filas: Fila[]): Visita[] {
  const mapa = new Map<string, Visita>()
  for (const f of filas) {
    // El ancla es SIEMPRE la visita: los préstamos viejos se registraron libro
    // por libro con su propio reloj, así que agrupar por picked_up_at los
    // partiría en una fila por libro.
    const ancla = f.visit_at ?? f.picked_up_at
    const key = `${f.user_id}|${f.status}|${ancla ?? 'sin-fecha'}`
    if (!mapa.has(key)) {
      mapa.set(key, {
        key,
        userId: f.user_id,
        fecha: ancla,
        visitAt: f.visit_at,
        status: f.status,
        nombre: f.perfiles?.nombre_completo?.trim() || `@${f.perfiles?.handle ?? 'sin alias'}`,
        handle: f.perfiles?.handle ?? 'sin-alias',
        telefono: f.perfiles?.telefono ?? null,
        objetos: 0,
        confirmada: false,
        asistira: false,
        dueAt: f.due_at,
        recado: null,
        fotosSalida: 0,
        titulos: [],
      })
    }
    const v = mapa.get(key)!
    v.objetos += 1
    if (f.confirmado_at) v.confirmada = true
    if (f.asistencia === 'asistire') v.asistira = true
    if (f.notes && !v.recado) v.recado = f.notes
    if (f.foto_registro_url) v.fotosSalida += 1
    if (f.libros?.titulo) v.titulos.push(f.libros.titulo)
    // La fecha de devolución que manda es la más próxima del grupo.
    if (f.due_at && (!v.dueAt || f.due_at < v.dueAt)) v.dueAt = f.due_at
  }
  return [...mapa.values()]
}

export default function AdminPrestamosPage() {
  const { loading, isEditor } = useEditorGate()
  const [filas, setFilas] = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [maxObjetos, setMaxObjetosLocal] = useState<number | null>(null)
  const [savingLimite, setSavingLimite] = useState(false)
  const [limiteMsg, setLimiteMsg] = useState<string | null>(null)
  const [verAjustes, setVerAjustes] = useState(false)

  const cargar = useCallback(async () => {
    if (!isEditor) return
    const { data, error } = await supabase
      .from('prestamos')
      .select(`
        id, status, user_id, visit_at, picked_up_at, due_at, confirmado_at,
        asistencia, notes, foto_registro_url,
        libros (id, titulo),
        perfiles!prestamos_user_id_perfiles_fkey (handle, nombre_completo, telefono)
      `)
      .in('status', ['apartado', 'recogido'])
      .order('visit_at', { ascending: true, nullsFirst: false })
    if (error) {
      console.error('error cargando préstamos:', error)
      setErrorCarga(error.message)
      setCargando(false)
      return
    }
    setFilas((data ?? []) as unknown as Fila[])
    setCargando(false)
  }, [isEditor])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!isEditor) return
    getMaxObjetosCheckout().then(setMaxObjetosLocal)
  }, [isEditor])

  async function guardarLimite(n: number) {
    setSavingLimite(true)
    setLimiteMsg(null)
    const err = await setMaxObjetosCheckout(n)
    if (err) {
      console.error('error guardando límite:', err)
      setLimiteMsg('no se pudo guardar')
    } else {
      setMaxObjetosLocal(n)
      setLimiteMsg('✓ guardado')
      setTimeout(() => setLimiteMsg(null), 2500)
    }
    setSavingLimite(false)
  }

  if (loading || !isEditor) {
    return (
      <TecaLayout>
        <section className="px-10 py-20 max-w-6xl mx-auto">
          <p className="opacity-70 font-mono text-[clamp(13px,1vw,16px)]">
            &gt; verificando permisos<span className="animate-pulse">_</span>
          </p>
        </section>
      </TecaLayout>
    )
  }

  const visitas = agrupar(filas)

  const hoy = visitas.filter((v) => v.status === 'apartado' && esHoy(v.fecha))
  const porConfirmar = visitas.filter(
    (v) => v.status === 'apartado' && !v.confirmada && !esHoy(v.fecha) && !yaPaso(v.fecha)
  )
  const proximas = visitas.filter(
    (v) => v.status === 'apartado' && v.confirmada && !esHoy(v.fecha) && !yaPaso(v.fecha)
  )
  const noLlegaron = visitas.filter(
    (v) => v.status === 'apartado' && !esHoy(v.fecha) && yaPaso(v.fecha)
  )
  const enPrestamo = visitas.filter(
    (v) => v.status === 'recogido' && !(v.dueAt && yaPaso(v.dueAt))
  )
  const vencidos = visitas.filter((v) => v.status === 'recogido' && v.dueAt && yaPaso(v.dueAt))

  return (
    <TecaLayout>
      <AdminNav />
      <section className="px-10 max-md:px-5 pt-8 pb-16 max-w-6xl mx-auto">
        <h1 className="font-mono leading-tight mb-2 text-[clamp(28px,3.5vw,52px)] uppercase tracking-wide text-text-bright">
          Préstamos
        </h1>
        <p className="opacity-70 mb-10 text-[clamp(13px,1vw,17px)]">
          Cada línea es una visita completa, no un libro suelto. Ábrela para recibir a la persona.
        </p>

        {errorCarga && (
          <p className="font-mono text-loan text-[13px] mb-6 border border-loan/50 p-3">
            &gt; no pude leer los préstamos: {errorCarga}
          </p>
        )}

        {cargando ? (
          <p className="font-mono opacity-70">&gt; cargando<span className="animate-pulse">_</span></p>
        ) : (
          <>
            <Bloque titulo="Hoy" visitas={hoy} vacio="hoy no viene nadie." destacado />
            <Bloque
              titulo="Sin confirmar"
              visitas={porConfirmar}
              vacio="ninguna. las reservas se confirman solas."
              alerta={porConfirmar.length > 0}
              nota="normalmente está vacío: si algo cae aquí es que el correo de confirmación no salió, no que falte tu aprobación."
            />
            <Bloque titulo="Próximas visitas" visitas={proximas} vacio="no hay visitas confirmadas por delante." />
            <Bloque
              titulo="En préstamo"
              visitas={enPrestamo}
              vacio="no hay nada fuera de la biblioteca."
              nota="se renuevan solos mientras nadie más los espere. devolver es venir en horario, sin cita."
            />
            <Bloque
              titulo="Vencidos"
              visitas={vencidos}
              vacio="nada vencido. todo en orden."
              alerta={vencidos.length > 0}
            />
            <Bloque
              titulo="No llegaron"
              visitas={noLlegaron}
              vacio="ninguna reserva se quedó colgada."
              alerta={noLlegaron.length > 0}
              nota="pasó su fecha y nadie vino. ábrelas para devolverles sus libros al morral y ofrecerles reagendar."
            />
          </>
        )}

        {/* AJUSTES · configuración, no operación. Por eso vive hasta abajo. */}
        <div className="mt-14 border-t border-rule pt-6 font-mono text-xs">
          <button
            onClick={() => setVerAjustes((v) => !v)}
            className="uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity"
          >
            {verAjustes ? '− ajustes' : '+ ajustes'}
          </button>
          {verAjustes && (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="uppercase tracking-wider opacity-70">
                límite de objetos por checkout:
              </span>
              <select
                value={maxObjetos ?? ''}
                onChange={(e) => guardarLimite(Number(e.target.value))}
                disabled={savingLimite || maxObjetos === null}
                className="bg-tinta text-bone border border-rule-strong px-3 py-2 font-mono text-xs cursor-pointer disabled:opacity-50"
              >
                {CHECKOUT_STEPS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {savingLimite && <span className="opacity-60">&gt; guardando...</span>}
              {limiteMsg && <span className="text-available">{limiteMsg}</span>}
            </div>
          )}
        </div>
      </section>
    </TecaLayout>
  )
}

function Bloque({
  titulo,
  visitas,
  vacio,
  alerta = false,
  destacado = false,
  nota,
}: {
  titulo: string
  visitas: Visita[]
  vacio: string
  alerta?: boolean
  destacado?: boolean
  nota?: string
}) {
  return (
    <div className="mb-10">
      <div className="flex items-baseline justify-between mb-3 border-b border-rule pb-2">
        <h2 className={`font-mono uppercase tracking-wide text-[clamp(14px,1.4vw,19px)] ${alerta ? 'text-loan' : 'text-text-bright'}`}>
          {titulo}
        </h2>
        <span className={`font-mono text-[11px] uppercase tracking-wider ${alerta && visitas.length > 0 ? 'text-loan' : 'opacity-50'}`}>
          {visitas.length}
        </span>
      </div>
      {nota && <p className="font-mono text-[11px] opacity-50 mb-3">{nota}</p>}
      {visitas.length === 0 ? (
        <p className="font-mono opacity-50 text-[clamp(12px,0.95vw,14px)]">&gt; {vacio}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visitas.map((v) => (
            <FilaVisita key={v.key} v={v} destacado={destacado} alerta={alerta} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilaVisita({ v, destacado, alerta }: { v: Visita; destacado: boolean; alerta: boolean }) {
  const objetos = `${v.objetos} objeto${v.objetos === 1 ? '' : 's'}`
  const faltanFotos = v.status === 'apartado' && v.fotosSalida < v.objetos
  const clase = `block border p-4 font-mono transition-colors ${
    alerta ? 'border-loan/50' : destacado ? 'border-rule-strong' : 'border-rule'
  } bg-bg-soft`

  // Sin visita no hay página que abrir (préstamos importados a mano).
  const cuerpo = (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-text-bright text-sm">
          {v.nombre}
          <span className="opacity-40 text-[11px] ml-2">@{v.handle}</span>
        </span>
        <span className="text-[11px] uppercase tracking-wider opacity-70">
          {v.status === 'apartado' ? (
            <>
              {fechaCorta(v.fecha)} · {bloqueDe(v.fecha)} {horarioDe(v.fecha)}
            </>
          ) : (
            <>
              devolver antes del{' '}
              <span className={v.dueAt && yaPaso(v.dueAt) ? 'text-loan' : 'text-text-bright'}>
                {fechaCorta(v.dueAt)}
              </span>
              {v.dueAt && yaPaso(v.dueAt) && (
                <span className="text-loan"> · {diasDesde(v.dueAt)} días</span>
              )}
            </>
          )}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-wider">
        <span className="opacity-50">{objetos}</span>
        {v.telefono && <span className="opacity-50">tel {v.telefono}</span>}
        {v.status === 'apartado' && !v.confirmada && <span className="text-acid">sin confirmar</span>}
        {v.status === 'apartado' && v.confirmada && <span className="text-available">confirmada</span>}
        {v.asistira && <span className="text-available">✓ dijo que viene</span>}
        {faltanFotos && (
          <span className="opacity-50">
            {v.fotosSalida}/{v.objetos} fotos
          </span>
        )}
        {v.recado && <span className="text-text-bright">· dejó recado</span>}
      </div>
      {v.titulos.length > 0 && (
        <p className="mt-2 text-[11px] opacity-50 truncate">
          {v.titulos.slice(0, 3).join(' · ')}
          {v.titulos.length > 3 ? ` · y ${v.titulos.length - 3} más` : ''}
        </p>
      )}
    </>
  )

  if (!v.visitAt) return <div className={clase}>{cuerpo}</div>
  return (
    <Link href={urlVisita(v.userId, v.visitAt)} className={`${clase} hover:border-rule-strong`}>
      {cuerpo}
    </Link>
  )
}
