'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { comprimirImagen } from '@/lib/imagen'
import TecaLayout from '@/components/TecaLayout'
import AdminNav from '@/components/AdminNav'
import { useEditorGate, authHeaders } from '@/components/useEditorGate'
import { fechaLarga, bloqueDe, horarioDe, yaPaso, fechaCorta, diasDesde } from '@/lib/visitas'

type Prestamo = {
  id: string
  status: 'morral' | 'apartado' | 'recogido' | 'devuelto'
  notes: string | null
  confirmado_at: string | null
  asistencia: string | null
  due_at: string | null
  returned_at: string | null
  foto_registro_url: string | null
  foto_regreso_url: string | null
  libros: { id: string; titulo: string; autor: string | null; portada_url: string | null } | null
}

type Persona = {
  handle: string | null
  nombre_completo: string | null
  telefono: string | null
}

type Extra = {
  correo: string | null
  desde: string | null
  historial: { total: number; devueltos: number; aTiempo: number; tarde: number; activos: number }
}

export default function AdminVisitaPage({
  params,
}: {
  params: Promise<{ userId: string; visitAt: string }>
}) {
  const { userId, visitAt: visitAtRaw } = use(params)
  // Next ya entrega el param decodificado; el decode extra es por si acaso y
  // nunca debe tumbar la página si viene un % suelto.
  let visitAt = visitAtRaw
  try { visitAt = decodeURIComponent(visitAtRaw) } catch { visitAt = visitAtRaw }
  const router = useRouter()
  const { loading, isEditor } = useEditorGate()

  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [persona, setPersona] = useState<Persona | null>(null)
  const [extra, setExtra] = useState<Extra | null>(null)
  const [cargando, setCargando] = useState(true)
  const [nota, setNota] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'mal'; txt: string } | null>(null)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [confirmarSoltar, setConfirmarSoltar] = useState(false)
  const [noEncontrado, setNoEncontrado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!isEditor) return
    const [{ data: pres, error: errPres }, { data: perf, error: errPerf }] = await Promise.all([
      supabase
        .from('prestamos')
        .select('id, status, notes, confirmado_at, asistencia, due_at, returned_at, foto_registro_url, foto_regreso_url, libros (id, titulo, autor, portada_url)')
        .eq('user_id', userId)
        .eq('visit_at', visitAt)
        .order('added_at', { ascending: true }),
      supabase
        .from('perfiles')
        .select('handle, nombre_completo, telefono')
        .eq('id', userId)
        .single(),
    ])
    if (errPres || errPerf) {
      setMsg({ tipo: 'mal', txt: 'no pude leer esta visita: ' + (errPres?.message ?? errPerf?.message) })
    }
    setPrestamos((pres ?? []) as unknown as Prestamo[])
    setPersona((perf ?? null) as Persona | null)
    setCargando(false)

    try {
      const res = await fetch(`/api/admin/persona?userId=${userId}`, { headers: await authHeaders() })
      if (res.ok) setExtra(await res.json())
    } catch {
      // el correo es un extra; si falla, la página sigue sirviendo
    }
  }, [isEditor, userId, visitAt])

  useEffect(() => { cargar() }, [cargar])

  async function subirFoto(p: Prestamo, file: File | null, momento: 'salida' | 'regreso') {
    if (!file) return
    setSubiendo(p.id + momento)
    try {
      const comprimida = await comprimirImagen(file, { maxDim: 1200, quality: 0.8 })
      const path = momento === 'salida' ? `${p.id}.webp` : `${p.id}-regreso.webp`
      const campo = momento === 'salida' ? 'foto_registro_url' : 'foto_regreso_url'
      const { error: upErr } = await supabase.storage
        .from('registro')
        .upload(path, comprimida, { upsert: true, contentType: comprimida.type })
      if (upErr) throw new Error(upErr.message)
      const { data: pub } = supabase.storage.from('registro').getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}`
      const { error: updErr } = await supabase.from('prestamos').update({ [campo]: url }).eq('id', p.id)
      if (updErr) throw new Error(updErr.message)
      setPrestamos((prev) => prev.map((x) => (x.id === p.id ? { ...x, [campo]: url } : x)))
    } catch (e) {
      setMsg({ tipo: 'mal', txt: 'no se pudo subir la foto: ' + (e instanceof Error ? e.message : String(e)) })
    }
    setSubiendo(null)
  }

  async function llamar(url: string, body: unknown, etiqueta: string) {
    setWorking(etiqueta)
    setMsg(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'algo falló')
      const correo = json.correo && json.correo !== 'enviado' ? ` (el correo no salió: ${json.correo})` : ''
      setMsg({ tipo: correo ? 'mal' : 'ok', txt: `listo${correo}` })
      return json
    } catch (e) {
      setMsg({ tipo: 'mal', txt: e instanceof Error ? e.message : String(e) })
      return null
    } finally {
      setWorking(null)
    }
  }

  if (loading || !isEditor) {
    return (
      <TecaLayout>
        <section className="px-10 py-20 max-w-4xl mx-auto">
          <p className="opacity-70 font-mono">&gt; verificando permisos<span className="animate-pulse">_</span></p>
        </section>
      </TecaLayout>
    )
  }

  const activos = prestamos.filter((p) => p.status !== 'morral')
  const apartados = activos.filter((p) => p.status === 'apartado')
  const recogidos = activos.filter((p) => p.status === 'recogido')
  const devueltos = activos.filter((p) => p.status === 'devuelto')
  const confirmada = activos.some((p) => p.confirmado_at)
  const recado = activos.find((p) => p.notes)?.notes ?? null
  const fotosSalidaListas = apartados.length > 0 && apartados.every((p) => p.foto_registro_url)
  // Al volver no se pide foto: el libro ya está aquí, se ve. La foto solo
  // importa al salir, para dejar claro qué edición se fue.
  const fotosRegresoListas = recogidos.length > 0
  const nombre = persona?.nombre_completo?.trim() || `@${persona?.handle ?? 'sin alias'}`
  const dueAt = recogidos.map((p) => p.due_at).filter(Boolean).sort()[0] ?? null

  return (
    <TecaLayout>
      <AdminNav />
      <section className="px-10 max-md:px-5 pt-8 pb-16 max-w-4xl mx-auto font-mono">
        <Link href="/admin/prestamos" className="text-[11px] uppercase tracking-wider opacity-60 hover:opacity-100">
          ← préstamos
        </Link>

        {cargando ? (
          <p className="mt-8 opacity-70">&gt; cargando<span className="animate-pulse">_</span></p>
        ) : activos.length === 0 ? (
          <p className="mt-8 opacity-70">&gt; esta visita ya no tiene objetos. quizá se reagendó.</p>
        ) : (
          <>
            {/* ============ QUIÉN VIENE ============ */}
            <h1 className="mt-4 leading-tight text-[clamp(24px,3vw,42px)] uppercase tracking-wide text-text-bright">
              {nombre}
            </h1>
            <p className="opacity-60 text-[13px] mt-1">
              @{persona?.handle ?? 'sin alias'}
              {extra?.historial && extra.historial.total > 0 && (
                <>
                  {' · '}
                  {extra.historial.total} préstamo{extra.historial.total === 1 ? '' : 's'} en total
                  {extra.historial.tarde > 0 && <span className="text-loan"> · {extra.historial.tarde} tarde</span>}
                </>
              )}
            </p>

            <div className="mt-4 border border-rule bg-bg-soft p-4 flex flex-wrap gap-x-8 gap-y-2 text-[12px]">
              <Dato label="teléfono" valor={persona?.telefono} copiable />
              <Dato label="correo" valor={extra?.correo} copiable />
              <Dato label="cuándo viene" valor={`${fechaLarga(visitAt)} · ${bloqueDe(visitAt)} ${horarioDe(visitAt)}`} />
              <Link href={`/admin/persona/${userId}`} className="text-[11px] uppercase tracking-wider text-text-dim hover:text-text-bright self-end underline">
                ver su expediente →
              </Link>
            </div>

            {recado && (
              <div className="mt-3 border-l-2 border-l-acid bg-bg-soft p-4">
                <p className="text-[10px] uppercase tracking-[0.12em] opacity-50 mb-1">recado de {nombre.split(' ')[0]}</p>
                <p className="text-[13px] text-text-bright whitespace-pre-line">{recado}</p>
              </div>
            )}

            {msg && (
              <p className={`mt-4 text-[12px] uppercase tracking-wider ${msg.tipo === 'ok' ? 'text-available' : 'text-loan'}`}>
                {msg.txt}
              </p>
            )}

            {/* ============ PASO 1 · CONFIRMAR LA RESERVA ============ */}
            {apartados.length > 0 && !confirmada && (
              <div className="mt-8 border border-rule-strong p-5">
                <p className="text-[11px] uppercase tracking-[0.12em] text-acid mb-3">paso 1 · confírmale la visita</p>
                <p className="text-[13px] opacity-70 mb-3">
                  Le llega el correo con horario, dirección y botón de calendario. Si le quieres decir algo, va dentro del mismo correo.
                </p>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="nota para esta persona (opcional). va en el correo de confirmación."
                  rows={3}
                  maxLength={1000}
                  className="w-full bg-bg border border-rule p-3 text-[13px] text-text placeholder:opacity-40 focus:border-rule-strong outline-none"
                />
                <button
                  onClick={async () => {
                    const r = await llamar('/api/emails/confirmacion', { userId, visitAt, nota }, 'confirmar')
                    if (r) { setNota(''); cargar() }
                  }}
                  disabled={working === 'confirmar'}
                  className="mt-3 px-4 py-2.5 bg-invert-bg text-invert-fg text-xs uppercase tracking-wider hover:opacity-90 disabled:opacity-40"
                >
                  {working === 'confirmar' ? '> mandando...' : '✉ confirmar y mandar correo'}
                </button>
              </div>
            )}

            {/* ============ LOS OBJETOS ============ */}
            <div className="mt-8">
              <h2 className="text-[11px] uppercase tracking-[0.12em] opacity-50 mb-3 border-b border-rule pb-2">
                {activos.length} objeto{activos.length === 1 ? '' : 's'}
                {confirmada && <span className="text-available ml-2">· reserva confirmada</span>}
              </h2>
              <div className="flex flex-col gap-2">
                {activos.map((p) => (
                  <div key={p.id} className="border border-rule bg-bg-soft p-3 flex gap-3 items-start">
                    {p.libros?.portada_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.libros.portada_url} alt="" className="w-10 h-14 object-cover border border-rule shrink-0" />
                    ) : (
                      <div className="w-10 h-14 border border-rule shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-text-bright text-[13px] leading-tight">{p.libros?.titulo ?? '(sin título)'}</p>
                      <p className="opacity-50 text-[11px]">{p.libros?.autor ?? '—'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <FotoSlot
                          url={p.foto_registro_url}
                          label="salida"
                          activo={p.status === 'apartado'}
                          subiendo={subiendo === p.id + 'salida'}
                          onFile={(f) => subirFoto(p, f, 'salida')}
                        />
                        {/* La foto de regreso ya no se pide; si un préstamo viejo
                            la trae, se sigue viendo. */}
                        <FotoSlot
                          url={p.foto_regreso_url}
                          label="regreso"
                          activo={false}
                          subiendo={false}
                          onFile={() => {}}
                        />
                        <span className={`text-[10px] uppercase tracking-wider ${p.status === 'devuelto' ? 'text-available' : 'opacity-50'}`}>
                          {p.status}
                        </span>
                        {/* Pasa: el libro no aparece a la hora de juntar. La
                            visita sigue con el resto y este vuelve a su morral. */}
                        {p.status === 'apartado' && (
                          noEncontrado === p.id ? (
                            <span className="flex items-center gap-2">
                              <span className="text-[10px] uppercase tracking-wider text-loan">¿no apareció?</span>
                              <button
                                onClick={async () => {
                                  const r = await llamar('/api/admin/no-encontrado', { prestamoId: p.id }, 'no-encontrado')
                                  setNoEncontrado(null)
                                  if (r) cargar()
                                }}
                                disabled={working === 'no-encontrado'}
                                className="text-[10px] uppercase tracking-wider border border-loan text-loan px-2 py-1 hover:bg-loan hover:text-bg disabled:opacity-40"
                              >
                                sí, quitarlo
                              </button>
                              <button
                                onClick={() => setNoEncontrado(null)}
                                className="text-[10px] uppercase tracking-wider opacity-50 hover:opacity-100 underline"
                              >
                                no
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setNoEncontrado(p.id)}
                              className="text-[10px] uppercase tracking-[0.08em] text-text-dim border border-rule px-2 py-1.5 hover:text-loan hover:border-loan transition-colors"
                              title="no lo encontramos: vuelve a su morral y se marca en el catálogo"
                            >
                              no lo encontramos
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ============ PASO 2 · SALIDA ============ */}
            {apartados.length > 0 && (
              <div className="mt-6 border border-rule p-5">
                <p className="text-[11px] uppercase tracking-[0.12em] text-acid mb-2">paso 2 · ya está aquí, se los lleva</p>
                <p className="text-[13px] opacity-70 mb-3">
                  {fotosSalidaListas
                    ? 'Todas las fotos están. Al confirmar se les pone fecha de devolución a 30 días y aparecen en sus préstamos.'
                    : `Faltan ${apartados.filter((p) => !p.foto_registro_url).length} foto(s) de salida. Sin foto no sale nada.`}
                  {' '}Si alguno no apareció, quítalo con "no lo encontramos" y la visita sale con el resto.
                </p>
                <button
                  onClick={async () => {
                    const r = await llamar('/api/emails/salida', { userId, visitAt }, 'salida')
                    if (r) cargar()
                  }}
                  disabled={!fotosSalidaListas || working === 'salida'}
                  className="px-4 py-2.5 bg-invert-bg text-invert-fg text-xs uppercase tracking-wider hover:opacity-90 disabled:opacity-40"
                >
                  {working === 'salida' ? '> registrando...' : '✓ confirmar salida de los ' + apartados.length}
                </button>
              </div>
            )}

            {/* ============ PASO 3 · REGRESO ============ */}
            {recogidos.length > 0 && (
              <div className="mt-6 border border-rule p-5">
                <p className="text-[11px] uppercase tracking-[0.12em] text-acid mb-2">paso 3 · los trae de vuelta</p>
                <p className="text-[13px] opacity-70 mb-3">
                  {dueAt && yaPaso(dueAt) ? (
                    <span className="text-loan">Venció el {fechaCorta(dueAt)}, hace {diasDesde(dueAt)} días. </span>
                  ) : dueAt ? (
                    <>Tienen hasta el {fechaCorta(dueAt)}. </>
                  ) : null}
                  Al confirmar vuelven al catálogo y le llega el correo de gracias. Sin foto: al volver el libro ya está aquí.
                </p>
                <button
                  onClick={async () => {
                    const r = await llamar('/api/emails/devolucion', { ids: recogidos.map((p) => p.id) }, 'regreso')
                    if (r) cargar()
                  }}
                  disabled={!fotosRegresoListas || working === 'regreso'}
                  className="px-4 py-2.5 bg-invert-bg text-invert-fg text-xs uppercase tracking-wider hover:opacity-90 disabled:opacity-40"
                >
                  {working === 'regreso' ? '> registrando...' : `↩ marcar devuelto${recogidos.length > 1 ? ` (${recogidos.length})` : ''}`}
                </button>
              </div>
            )}

            {devueltos.length === activos.length && (
              <p className="mt-6 text-available text-[13px]">&gt; visita cerrada. todo volvió.</p>
            )}

            {/* ============ SOLTAR LA RESERVA ============ */}
            {apartados.length > 0 && (
              <div className="mt-10 border-t border-rule pt-5">
                <p className="text-[11px] uppercase tracking-[0.12em] opacity-50 mb-2">no llegó, o quiere otro día</p>
                <p className="text-[12px] opacity-60 mb-3">
                  Los objetos regresan a su morral tal cual los escogió y le llega un correo pidiendo disculpas por no confirmarle, con el botón para elegir nuevo día.
                </p>
                {confirmarSoltar ? (
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[12px] text-loan uppercase tracking-wider">¿segura?</span>
                    <button
                      onClick={async () => {
                        const r = await llamar('/api/admin/reagendar', { userId, visitAt }, 'soltar')
                        if (r) router.push('/admin/prestamos')
                      }}
                      disabled={working === 'soltar'}
                      className="px-3 py-2 border border-loan text-loan text-xs uppercase tracking-wider hover:bg-loan hover:text-bg disabled:opacity-40"
                    >
                      {working === 'soltar' ? '> soltando...' : 'sí, devolver a su morral'}
                    </button>
                    <button onClick={() => setConfirmarSoltar(false)} className="text-[12px] opacity-60 hover:opacity-100 underline">
                      mejor no
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmarSoltar(true)}
                    className="px-3 py-2 border border-rule text-text-dim text-xs uppercase tracking-wider hover:border-rule-strong hover:text-text-bright transition-colors"
                  >
                    soltar reserva y ofrecer reagendar
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </TecaLayout>
  )
}

function Dato({ label, valor, copiable = false }: { label: string; valor?: string | null; copiable?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  if (!valor) {
    return (
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] opacity-40">{label}</p>
        <p className="opacity-40">no lo tenemos</p>
      </div>
    )
  }
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] opacity-40">{label}</p>
      {copiable ? (
        <button
          onClick={() => {
            navigator.clipboard?.writeText(valor)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 1500)
          }}
          className="text-text-bright hover:underline"
          title="copiar"
        >
          {copiado ? '✓ copiado' : valor}
        </button>
      ) : (
        <p className="text-text-bright">{valor}</p>
      )}
    </div>
  )
}

function FotoSlot({
  url,
  label,
  activo,
  subiendo,
  onFile,
}: {
  url: string | null
  label: 'salida' | 'regreso'
  activo: boolean
  subiendo: boolean
  onFile: (f: File | null) => void
}) {
  if (!url && !activo) return null
  return (
    <div className="flex items-center gap-2">
      {url && (
        <a href={url} target="_blank" rel="noreferrer" title={`foto de ${label}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`foto de ${label}`}
            className={`w-9 h-12 object-cover border ${label === 'regreso' ? 'border-available' : 'border-rule'}`}
          />
        </a>
      )}
      {activo && (
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-dim cursor-pointer border border-rule px-2 py-1.5 hover:text-text-bright hover:border-rule-strong transition-colors">
          {subiendo ? '> subiendo...' : url ? `cambiar foto de ${label}` : `+ foto de ${label}`}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={subiendo}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  )
}
