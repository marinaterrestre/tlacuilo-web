'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import MiniCalendario from '@/components/MiniCalendario'
import { comprimirImagen } from '@/lib/imagen'
import TecaLayout from '@/components/TecaLayout'
import Cover from '@/components/Cover'

type Perfil = {
  id: string
  handle: string | null
  bio: string | null
  rol: string
  created_at: string
  avatar_url: string | null
}

type AliasStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

type Libro = {
  id: string
  titulo: string
  autor: string | null
  anio: number | null
  portada_url: string | null
  isbn: string | null
}

type Prestamo = {
  id: string
  status: 'morral' | 'apartado' | 'recogido' | 'devuelto'
  added_at: string
  visit_at: string | null
  picked_up_at: string | null
  returned_at: string | null
  due_at: string | null
  confirmado_at: string | null
  libros: Libro
}

function formatFechaCorta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatVisita(iso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
  const bloque = d.getHours() < 14 ? 'mañana' : 'tarde'
  return `${dia} · ${bloque}`
}

export default function MiTlacuiloPage() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [correo, setCorreo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [morral, setMorral] = useState<Prestamo[]>([])
  const [visitas, setVisitas] = useState<Prestamo[]>([])
  const [prestados, setPrestados] = useState<Prestamo[]>([])
  const [historial, setHistorial] = useState<Prestamo[]>([])
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'mal'; txt: string } | null>(null)

  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [fotoMsg, setFotoMsg] = useState<string | null>(null)

  const [aliasDraft, setAliasDraft] = useState('')
  const [aliasStatus, setAliasStatus] = useState<AliasStatus>('idle')
  const [savingAlias, setSavingAlias] = useState(false)
  const [aliasMsg, setAliasMsg] = useState<string | null>(null)

  const handleFotoPerfil = async (file: File | null) => {
    if (!file || !perfil) return
    setSubiendoFoto(true)
    setFotoMsg(null)
    try {
      const comprimida = await comprimirImagen(file, { maxDim: 512, quality: 0.82 })
      const path = `${perfil.id}.webp`
      const { error: upErr } = await supabase.storage
        .from('avatares')
        .upload(path, comprimida, { upsert: true, contentType: comprimida.type })
      if (upErr) throw new Error(upErr.message)
      const { data: pub } = supabase.storage.from('avatares').getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}`
      const { error: updErr } = await supabase
        .from('perfiles')
        .update({ avatar_url: url })
        .eq('id', perfil.id)
      if (updErr) throw new Error(updErr.message)
      setPerfil({ ...perfil, avatar_url: url })
      setFotoMsg('> foto actualizada ✓')
      setTimeout(() => setFotoMsg(null), 2500)
    } catch (e) {
      setFotoMsg(`> error: ${e instanceof Error ? e.message : 'no se pudo subir'}`)
    }
    setSubiendoFoto(false)
  }

  useEffect(() => {
    let mounted = true

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      if (!user) {
        router.push('/login')
        return
      }
      setCorreo(user.email ?? null)

      const [{ data: perfilData }, { data: prestamosData }] = await Promise.all([
        supabase
          .from('perfiles')
          .select('id, handle, bio, rol, created_at, avatar_url')
          .eq('id', user.id)
          .single<Perfil>(),
        supabase
          .from('prestamos')
          .select('id, status, added_at, visit_at, picked_up_at, returned_at, due_at, confirmado_at, libros (id, titulo, autor, anio, portada_url, isbn)')
          .eq('user_id', user.id)
          .in('status', ['morral', 'apartado', 'recogido', 'devuelto'])
          .order('added_at', { ascending: false }),
      ])

      if (!mounted) return

      if (perfilData) {
        setPerfil(perfilData)
      }

      if (prestamosData) {
        const all = prestamosData as unknown as Prestamo[]
        setMorral(all.filter((p) => p.status === 'morral'))
        setVisitas(all.filter((p) => p.status === 'apartado'))
        setPrestados(all.filter((p) => p.status === 'recogido'))
        setHistorial(all.filter((p) => p.status === 'devuelto'))
      }

      setLoading(false)
    }

    load()
    return () => { mounted = false }
  }, [router])

  // Validación de formato + disponibilidad del alias (debounced).
  useEffect(() => {
    const actual = perfil?.handle ?? ''
    if (!aliasDraft || aliasDraft === actual) {
      setAliasStatus('idle')
      return
    }
    const valido = /^[a-z0-9_-]{3,20}$/.test(aliasDraft)
    if (!valido) {
      setAliasStatus('invalid')
      return
    }
    setAliasStatus('checking')
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('perfiles_publicos')
        .select('handle')
        .eq('handle', aliasDraft)
        .maybeSingle()
      setAliasStatus(data ? 'taken' : 'available')
    }, 400)
    return () => clearTimeout(timer)
  }, [aliasDraft, perfil?.handle])

  const handleSaveAlias = async () => {
    if (!perfil || aliasStatus !== 'available') return
    setSavingAlias(true)
    setAliasMsg(null)
    const { error } = await supabase
      .from('perfiles')
      .update({ handle: aliasDraft })
      .eq('id', perfil.id)
    setSavingAlias(false)
    if (error) {
      setAliasMsg('> error al guardar el alias')
    } else {
      setPerfil({ ...perfil, handle: aliasDraft })
      setAliasDraft('')
      setAliasStatus('idle')
      setAliasMsg('> alias guardado ✓')
      setTimeout(() => setAliasMsg(null), 2500)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleRemoveFromMorral = async (prestamoId: string) => {
    const { error } = await supabase.from('prestamos').delete().eq('id', prestamoId)
    if (!error) setMorral((m) => m.filter((p) => p.id !== prestamoId))
  }

  if (loading) {
    return (
      <TecaLayout>
        <section className="px-10 py-20 max-w-7xl mx-auto">
          <p className="opacity-70 font-mono text-[clamp(13px,1vw,16px)]">
            &gt; cargando tu tlacuilo<span className="animate-pulse">_</span>
          </p>
        </section>
      </TecaLayout>
    )
  }

  const alias = perfil?.handle ?? 'sin-alias'
  const rentas = prestados.length + historial.length

  const aliasInfo = (() => {
    switch (aliasStatus) {
      case 'checking':
        return { txt: '> verificando...', cls: 'opacity-60' }
      case 'available':
        return { txt: '> disponible ✓', cls: 'text-available' }
      case 'taken':
        return { txt: '> ya está tomado', cls: 'text-loan' }
      case 'invalid':
        return { txt: '> 3-20 caracteres: a-z, 0-9, _ o -', cls: 'text-loan' }
      default:
        return { txt: '', cls: 'opacity-60' }
    }
  })()

  // Días que le quedan al préstamo más próximo. Negativo si ya se pasó.
  const fechaLimite = prestados.map((p) => p.due_at).filter(Boolean).sort()[0] ?? null
  const diasRestantes = fechaLimite
    ? Math.ceil((new Date(fechaLimite).getTime() - Date.now()) / 864e5)
    : null
  const vencido = diasRestantes !== null && diasRestantes < 0

  async function extender(dias: number) {
    setTrabajando('extender')
    setAviso(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('sin sesión')
      const res = await fetch('/api/prestamos/extender', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dias }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setAviso({
        tipo: 'ok',
        txt: json.nuevaFecha
          ? `gracias por avisar. ahora los tienes hasta el ${formatFechaCorta(json.nuevaFecha)}.`
          : 'ya no queda extensión para estos títulos, alguien los está esperando.',
      })
      window.location.reload()
    } catch (e) {
      setAviso({ tipo: 'mal', txt: e instanceof Error ? e.message : String(e) })
    }
    setTrabajando(null)
  }

  async function cancelarVisita(visitAt: string | null) {
    if (!visitAt) return
    setTrabajando('cancelar')
    setAviso(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('prestamos')
      .update({ status: 'morral', visit_at: null, confirmado_at: null, asistencia: null })
      .eq('user_id', user.id)
      .eq('visit_at', visitAt)
      .eq('status', 'apartado')
    setTrabajando(null)
    if (error) {
      setAviso({ tipo: 'mal', txt: error.message })
      return
    }
    window.dispatchEvent(new Event('tl:morral'))
    window.location.reload()
  }

  return (
    <TecaLayout>
      <section className="px-10 pt-10 pb-12 max-w-7xl mx-auto max-md:px-5">
        <p className="font-micro uppercase tracking-[0.12em] text-[11px] text-text-dim mb-3">
          mi tlacuilo
        </p>

        <div className="flex items-center gap-5 mb-3">
          {/* FOTO DE PERFIL */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-[72px] h-[72px] rounded-full overflow-hidden bg-bg-card border border-rule-strong flex items-center justify-center shrink-0">
              {perfil?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={perfil.avatar_url} alt={`foto de ${alias}`} className="w-full h-full object-cover" />
              ) : (
                <span className="font-mono text-[20px] text-text-dim uppercase">
                  {alias.slice(0, 2)}
                </span>
              )}
            </div>
            <label className="font-micro text-[9px] uppercase tracking-[0.08em] text-text-dim cursor-pointer hover:text-text-bright transition-colors">
              {subiendoFoto ? 'subiendo...' : perfil?.avatar_url ? 'cambiar' : '+ foto'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={subiendoFoto}
                onChange={(e) => handleFotoPerfil(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <h1 className="font-sans font-light leading-none text-[clamp(34px,4vw,56px)] tracking-[-0.01em] text-text">
            Hola, {alias}.
          </h1>
        </div>
        {fotoMsg && (
          <p className="font-mono text-xs text-text-dim mb-3">{fotoMsg}</p>
        )}
        {perfil?.handle ? (
          <p className="text-[clamp(13px,1vw,15px)] text-text-dim mb-10">
            tu perfil público está en{' '}
            <Link href={`/u/${alias}`} className="text-text underline hover:text-text-bright transition-colors">
              tlacuilo.org/u/{alias}
            </Link>
          </p>
        ) : (
          <p className="text-[clamp(13px,1vw,15px)] text-text-dim mb-10">
            elige un alias para tener tu perfil público.
          </p>
        )}

        {/* ELEGIR / CAMBIAR ALIAS */}
        <div className={`mb-12 border p-5 ${perfil?.handle ? 'border-rule bg-bg-soft' : 'border-acid bg-bg-soft'}`}>
          <h2 className={`font-micro uppercase tracking-[0.12em] text-[11px] mb-2 ${perfil?.handle ? 'text-text-dim' : 'text-acid'}`}>
            {perfil?.handle ? 'cambiar alias' : '· elige tu alias'}
          </h2>
          <p className="opacity-60 text-[10px] mb-4 font-mono">
            {perfil?.handle
              ? '> con esto te encuentran y firmas en el acervo.'
              : '> entraste con google. aún no tienes alias: elígelo para identificarte.'}
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[clamp(12px,0.95vw,15px)] opacity-50 shrink-0">/u/</span>
            <input
              type="text"
              value={aliasDraft}
              onChange={(e) => setAliasDraft(e.target.value.toLowerCase().trim())}
              autoComplete="username"
              placeholder={perfil?.handle ?? 'tu_alias'}
              className="flex-1 min-w-0 bg-transparent border-b border-rule focus:border-rule-strong focus:outline-none py-1 font-mono text-text-bright placeholder:opacity-30"
            />
            <button
              onClick={handleSaveAlias}
              disabled={savingAlias || aliasStatus !== 'available'}
              className="shrink-0 font-mono text-[clamp(11px,0.9vw,14px)] uppercase tracking-wide hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingAlias ? <>&gt; guardando<span className="animate-pulse">_</span></> : <>&gt; guardar</>}
            </button>
          </div>
          {aliasInfo.txt && (
            <p className={`mt-2 font-mono text-[10px] uppercase tracking-wider ${aliasInfo.cls}`}>
              {aliasInfo.txt}
            </p>
          )}
          {aliasMsg && (
            <p className={`mt-2 font-mono text-[10px] uppercase tracking-wider ${aliasMsg.includes('✓') ? 'text-available' : 'text-loan'}`}>
              {aliasMsg}
            </p>
          )}
        </div>


        <div className="mb-14 border-t border-rule pt-8">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-sans font-light text-[clamp(22px,2.4vw,34px)] tracking-[-0.005em] text-text">
              Mi morral
            </h2>
            <span className="font-micro text-[10px] uppercase tracking-[0.12em] text-acid">
              {morral.length} {morral.length === 1 ? 'libro' : 'libros'}
            </span>
          </div>

          {morral.length === 0 ? (
            <div className="border border-rule p-6 bg-bg-soft">
              <p className="font-mono text-sm opacity-70 mb-3">
                &gt; tu morral está vacío.
              </p>
              <Link href="/biblioteca" className="font-mono text-xs uppercase tracking-wider underline hover:text-text-bright">
                explorar la biblioteca →
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                {morral.map((p) => (
                  <div key={p.id} className="flex flex-col gap-2">
                    <Link href={`/biblioteca/${p.libros.id}`} className="block group">
                      <div className="aspect-[2/3] bg-bg-soft flex items-center justify-center text-text-dim p-2 text-center overflow-hidden text-[10px] mb-2 group-hover:opacity-90 transition-opacity">
                        <Cover titulo={p.libros.titulo} portada_url={p.libros.portada_url} isbn={p.libros.isbn} autor={p.libros.autor} />
                      </div>
                      <p className="font-medium leading-tight text-[clamp(11px,0.9vw,14px)] line-clamp-2">{p.libros.titulo}</p>
                      <p className="opacity-70 text-[10px] line-clamp-1">{p.libros.autor ?? '—'}</p>
                    </Link>
                    <button
                      onClick={() => handleRemoveFromMorral(p.id)}
                      className="font-mono text-[10px] uppercase tracking-wider opacity-60 hover:opacity-100 hover:text-loan text-left transition-colors"
                    >
                      × quitar
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-center gap-4">
                <Link
                  href="/checkout"
                  className="font-mono text-sm lowercase tracking-wider bg-invert-bg text-invert-fg px-6 py-3 hover:opacity-90 transition-opacity inline-block"
                >
                  agendar visita →
                </Link>
                <span className="font-mono text-xs opacity-50 uppercase tracking-wider">
                  lun-vie · mín. 1 día de anticipación
                </span>
              </div>
            </>
          )}
        </div>

        {/* ============ MIS VISITAS · lo que aparté, todavía no lo tengo ============ */}
        <div className="mb-14 border-t border-rule pt-8">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-sans font-light text-[clamp(22px,2.4vw,34px)] tracking-[-0.005em] text-text">
              Mis visitas
            </h2>
            <span className="font-micro text-[10px] uppercase tracking-[0.12em] text-acid">
              {visitas.length} {visitas.length === 1 ? 'libro' : 'libros'}
            </span>
          </div>

          {aviso && (
            <p className={`font-mono text-[13px] mb-5 border p-3 ${aviso.tipo === 'ok' ? 'text-available border-available/50' : 'text-loan border-loan/50'}`}>
              &gt; {aviso.txt}
            </p>
          )}

          {visitas.length === 0 ? (
            <div className="border border-rule p-6 bg-bg-soft">
              <p className="font-mono text-sm opacity-70">
                &gt; aún no tienes visitas agendadas.
              </p>
            </div>
          ) : (
            <>
              {/* Mientras no la confirmen, la persona no se queda a ciegas. */}
              {visitas.some((p) => !p.confirmado_at) && (
                <div className="border border-rule p-4 bg-bg-soft mb-5">
                  <p className="font-mono text-[13px] text-text">
                    &gt; tu reserva está esperando confirmación.
                  </p>
                  <p className="font-mono text-[12px] opacity-60 mt-1.5 leading-relaxed">
                    vamos por tus libros y te escribimos en cuanto estén listos. algunos viven en bodega, por eso tarda un poco.
                  </p>
                </div>
              )}
              {visitas.some((p) => p.confirmado_at) && (
                <div className="border border-available/50 p-4 bg-bg-soft mb-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-[13px] text-available">
                    &gt; tus libros ya están apartados y te esperamos.
                  </p>
                  <button
                    onClick={() => cancelarVisita(visitas.find((p) => p.confirmado_at)?.visit_at ?? null)}
                    disabled={trabajando === 'cancelar'}
                    className="font-mono text-[11px] uppercase tracking-wider opacity-60 hover:opacity-100 underline disabled:opacity-30"
                  >
                    no voy a poder ir
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                {visitas.map((p) => (
                  <Link key={p.id} href={`/biblioteca/${p.libros.id}`} className="block opacity-95 hover:opacity-100">
                    <div className="aspect-[2/3] bg-bg-soft flex items-center justify-center text-text-dim p-2 text-center overflow-hidden text-[10px] mb-2">
                      <Cover titulo={p.libros.titulo} portada_url={p.libros.portada_url} isbn={p.libros.isbn} autor={p.libros.autor} />
                    </div>
                    <p className="font-medium leading-tight text-[clamp(11px,0.9vw,14px)] line-clamp-2">{p.libros.titulo}</p>
                    <p className="opacity-70 text-[10px] line-clamp-1">{p.libros.autor ?? '—'}</p>
                    <p className="font-mono text-[10px] uppercase tracking-wider mt-1 opacity-70">
                      {p.visit_at ? <>· {formatVisita(p.visit_at)}</> : null}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider opacity-50">
                      · {p.confirmado_at ? 'confirmada' : 'en espera'}
                    </p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ============ MIS PRÉSTAMOS · lo que ya tengo en mis manos ============ */}
        {prestados.length > 0 && (
          <div className="mb-14 border-t border-rule pt-8">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="font-sans font-light text-[clamp(22px,2.4vw,34px)] tracking-[-0.005em] text-text">
                Mis préstamos
              </h2>
              <span className="font-micro text-[10px] uppercase tracking-[0.12em] text-acid">
                {prestados.length} {prestados.length === 1 ? 'libro' : 'libros'}
              </span>
            </div>

            {/* El contador. Cuando se pasa, se vuelve la barra de opciones. */}
            <div className={`border p-4 mb-5 ${vencido ? 'border-loan' : 'border-rule'} bg-bg-soft`}>
              {vencido ? (
                <>
                  <p className="font-mono text-[clamp(13px,1.2vw,16px)] text-loan">
                    &gt; se te acabó el tiempo. {fechaLimite && <>vencieron el {formatFechaCorta(fechaLimite)}.</>}
                  </p>
                  <p className="font-mono text-[12px] opacity-70 mt-2 leading-relaxed">
                    puedes traerlos en horario, sin cita, o darte más tiempo aquí mismo. lo que no queremos es que se queden perdidos.
                  </p>
                </>
              ) : (
                <p className="font-mono text-[clamp(13px,1.2vw,16px)] text-text">
                  &gt; te {diasRestantes === 1 ? 'queda' : 'quedan'}{' '}
                  <span className="text-text-bright">{diasRestantes} {diasRestantes === 1 ? 'día' : 'días'}</span>
                  {fechaLimite && <span className="opacity-60"> · hasta el {formatFechaCorta(fechaLimite)}</span>}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mt-4">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => extender(d)}
                    disabled={trabajando === 'extender'}
                    className="font-mono text-[12px] px-3 py-2 border border-rule text-text-dim hover:border-rule-strong hover:text-text transition-colors disabled:opacity-30"
                  >
                    +{d} días
                  </button>
                ))}
              </div>
              <p className="font-mono text-[11px] opacity-50 mt-3 leading-relaxed">
                extiende si te falta tiempo, pero avísanos así. si alguien más trae ese título en su morral, la extensión es más corta porque te lo está esperando.
              </p>
              <p className="font-mono text-[11px] opacity-50 mt-2">
                para devolver no necesitas cita: lunes a viernes, de 10:30 a 14:30 y de 16:00 a 18:30, en Europa 13, Coyoacán.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {prestados.map((p) => (
                <Link key={p.id} href={`/biblioteca/${p.libros.id}`} className="block opacity-95 hover:opacity-100">
                  <div className="aspect-[2/3] bg-bg-soft flex items-center justify-center text-text-dim p-2 text-center overflow-hidden text-[10px] mb-2">
                    <Cover titulo={p.libros.titulo} portada_url={p.libros.portada_url} isbn={p.libros.isbn} autor={p.libros.autor} />
                  </div>
                  <p className="font-medium leading-tight text-[clamp(11px,0.9vw,14px)] line-clamp-2">{p.libros.titulo}</p>
                  <p className="opacity-70 text-[10px] line-clamp-1">{p.libros.autor ?? '—'}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider mt-1 opacity-70">
                    {p.due_at ? <>· vuelve el {formatFechaCorta(p.due_at)}</> : null}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ============ HISTORIAL · préstamos devueltos ============ */}
        {historial.length > 0 && (
          <div className="mb-14 border-t border-rule pt-8">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="font-sans font-light text-[clamp(22px,2.4vw,34px)] tracking-[-0.005em] text-text">
                Historial
              </h2>
              <span className="font-micro text-[10px] uppercase tracking-[0.12em] text-acid">
                {historial.length} {historial.length === 1 ? 'préstamo' : 'préstamos'}
              </span>
            </div>
            <div className="flex flex-col divide-y divide-rule border-y border-rule">
              {historial.map((p) => (
                <Link
                  key={p.id}
                  href={`/biblioteca/${p.libros.id}`}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 opacity-85 hover:opacity-100 transition-opacity"
                >
                  <span className="font-sans text-[clamp(13px,1vw,15px)] text-text">{p.libros.titulo}</span>
                  <span className="font-sans font-light text-[12px] text-text-dim">{p.libros.autor ?? ''}</span>
                  <span className="ml-auto font-micro text-[10px] uppercase tracking-[0.08em] text-text-dim">
                    {formatFechaCorta(p.picked_up_at)} → {formatFechaCorta(p.returned_at)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

       <div className="border-t border-rule pt-8 mt-4">
          <h2 className="font-micro uppercase tracking-[0.12em] text-[11px] text-text-dim mb-4">
            tu calendario
          </h2>
          <MiniCalendario />
        </div>

        {rentas > 0 && (
          <div className="border-t border-rule pt-8 mt-4">
            <h2 className="font-micro uppercase tracking-[0.12em] text-[11px] text-text-dim mb-2">
              libros rentados
            </h2>
            <p className="font-mono text-[clamp(22px,2.2vw,34px)] text-text-bright">{rentas}</p>
          </div>
        )}

        <div className="border-t border-rule pt-8 mt-12">
          <h2 className="font-micro uppercase tracking-[0.12em] text-[11px] text-text-dim mb-4">
            tu identidad · solo tú la ves
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-8 text-[clamp(12px,0.95vw,15px)] mb-8">
            <div>
              <dt className="opacity-50 uppercase tracking-wide text-[10px]">alias .......:</dt>
              <dd className="text-text-bright">{alias}</dd>
            </div>
            <div>
              <dt className="opacity-50 uppercase tracking-wide text-[10px]">correo .....:</dt>
              <dd>{correo ?? '—'}</dd>
            </div>
            <div>
              <dt className="opacity-50 uppercase tracking-wide text-[10px]">rol ........:</dt>
              <dd>{perfil?.rol ?? 'lector'}</dd>
            </div>
            <div>
              <dt className="opacity-50 uppercase tracking-wide text-[10px]">desde ......:</dt>
              <dd>
                {perfil?.created_at
                  ? new Date(perfil.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })
                  : '—'}
              </dd>
            </div>
          </dl>
          <button onClick={handleLogout} className="uppercase tracking-wide hover:underline text-[clamp(11px,0.9vw,14px)]">
            &gt; salir
          </button>
        </div>
      </section>
    </TecaLayout>
  )
}
