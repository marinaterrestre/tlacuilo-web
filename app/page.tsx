import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import CategoryRow from '@/components/CategoryRow'
import CategoryRail from '@/components/CategoryRail'

/** slug estable para anclas: sin acentos, sin símbolos */
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function fmtEvento(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export const dynamic = 'force-dynamic'

/* ============================================================
   Landing v3 · filas streaming (2026-07-08)
   Hero en Acacia + todas las categorías como filas con scroll
   horizontal, lazy, jalando siempre de Supabase.
   ============================================================ */

type CategoriaConteo = { categoria: string; libros_count: number }

async function getCategorias(): Promise<CategoriaConteo[]> {
  // MISMA fuente que biblioteca sidebar (RPC distinct_categorias) para que
  // estén siempre sincronizadas.
  const { data, error } = await supabase.rpc('distinct_categorias')
  if (error || !data) return []
  // Categorías por tamaño (mayor a menor); los LIBROS dentro van por autor
  return (data as CategoriaConteo[]).sort((a, b) => b.libros_count - a.libros_count)
}

async function getTotalLibros(): Promise<number> {
  try {
    const { count } = await supabase
      .from('libros')
      .select('id', { count: 'exact', head: true })
    return count ?? 0
  } catch {
    return 0
  }
}

async function getTotalPrestamos(): Promise<number> {
  // RPC total_prestamos() = concretados en el sistema (recogido/devuelto)
  // + históricos importados (google form pre-sistema, luego carrillo gil).
  try {
    const { data, error } = await supabase.rpc('total_prestamos')
    if (error) return 0
    return Number(data) || 0
  } catch {
    return 0
  }
}

export default async function Home() {
  // Próximos eventos · vitrina pública (2026-07-17, /calendario se retiró)
  const { data: eventosData } = await supabase
    .from('eventos')
    .select('id, titulo, fecha_inicio, ubicacion')
    .gte('fecha_inicio', new Date().toISOString())
    .order('fecha_inicio', { ascending: true })
    .limit(3)
  const eventos = eventosData ?? []

  const [categorias, totalLibros, totalPrestamos] = await Promise.all([
    getCategorias(),
    getTotalLibros(),
    getTotalPrestamos(),
  ])

  const cats = categorias.map((c) => ({ ...c, slug: slugify(c.categoria) }))

  return (
    <>
      {/* el sticky se lo cede al riel de categorías */}
      <Header sticky={false} />

      {/* ============ HERO · Acacia grande + counters + manifiesto ============ */}
      <section className="px-10 pt-16 pb-16 border-b border-rule max-md:px-5 max-md:pt-12 max-md:pb-12">
        <h1 className="font-acacia uppercase text-[clamp(34px,5.2vw,78px)] leading-[1.04] tracking-[0.01em] max-w-[16ch] text-text">
          Préstamo gratis de libros, vinilos, arte y objetos físicos.
        </h1>

        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-4 mt-9">
          {totalLibros > 0 && (
            <div>
              <span className="font-sans font-light text-[clamp(26px,2.6vw,40px)] tabular-nums text-text">
                {totalLibros.toLocaleString('es-MX')}
              </span>
              <span className="block font-micro text-[10px] uppercase tracking-[0.1em] accent-detail mt-0.5">
                objetos catalogados
              </span>
            </div>
          )}
          <div>
            <span className="font-sans font-light text-[clamp(26px,2.6vw,40px)] tabular-nums text-text">
              {totalPrestamos.toLocaleString('es-MX')}
            </span>
            <span className="block font-micro text-[10px] uppercase tracking-[0.1em] accent-detail mt-0.5">
              préstamos
            </span>
          </div>
          <Link
            href="/manifesto"
            className="ml-auto font-micro uppercase tracking-[0.12em] text-[12px] bg-invert-bg text-invert-fg px-7 py-3.5 hover:opacity-90 transition-opacity max-md:ml-0"
          >
            manifiesto →
          </Link>
        </div>
      </section>

      {/* ============ RIEL DE CATEGORÍAS · sticky, navega sin recargar ============ */}
      {cats.length > 0 && <CategoryRail categorias={cats} />}

      {/* ============ TODAS LAS CATEGORÍAS · filas streaming lazy ============ */}
      <main className="pt-1 pb-12">
        {cats.length === 0 ? (
          <p className="font-mono text-sm text-text-dim lowercase py-20 text-center">
            sin categorías en el catálogo todavía.
          </p>
        ) : (
          cats.map((cat) => (
            <CategoryRow
              key={cat.categoria}
              categoria={cat.categoria}
              count={cat.libros_count}
              anchorId={`cat-${cat.slug}`}
            />
          ))
        )}
      </main>

      {/* ============ PRÓXIMOS EVENTOS · vitrina pública ============ */}
      {eventos.length > 0 && (
        <section className="border-t border-rule px-10 py-8 max-md:px-5">
          <h2 className="font-micro uppercase tracking-[0.18em] text-[11px] text-text-dim mb-4">&gt; próximos eventos</h2>
          <div className="flex flex-wrap gap-x-12 gap-y-4">
            {eventos.map((ev) => (
              <div key={ev.id} className="font-mono text-[clamp(12px,1vw,15px)]">
                <span className="accent-detail">{fmtEvento(ev.fecha_inicio)}</span>{' '}
                <span className="uppercase tracking-[0.06em] text-text-bright">{ev.titulo}</span>
                {ev.ubicacion && <span className="text-text-dim lowercase"> · {ev.ubicacion}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============ FOOTER full width · estilo colofón ============ */}
      <footer className="border-t border-rule bg-footer mt-6 px-10 py-8 max-md:px-5 font-micro text-[10px] uppercase tracking-[0.08em] leading-relaxed text-text">
        <div className="flex flex-wrap justify-between items-start gap-x-10 gap-y-6">

          {/* Columna 1 · Identidad y lugar */}
          <div className="flex flex-col gap-1 min-w-[180px]">
            <div className="flex gap-3"><span>// tlacuilo</span><span className="text-text-dim">2026</span></div>
            <div>cdmx · coyoacán</div>
            <div className="text-text-dim">los comunes</div>
            <div className="text-text-dim mt-2">
              estudio pedro reyes<br />
              lun–vie · 10:00–14:30 · 16:00–19:00
            </div>
          </div>

          {/* Columna 2 · Enlaces */}
          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <a
              href="https://instagram.com/tlacuilobiblioteca"
              target="_blank"
              rel="noreferrer"
              className="hover:text-text-bright transition-colors"
            >
              → @tlacuilobiblioteca
            </a>
            <Link href="/manifesto" className="hover:text-text-bright transition-colors">
              → manifiesto
            </Link>
            <Link href="/proximamente" className="hover:text-text-bright transition-colors">
              → newsletter
            </Link>
            <Link href="/manifesto" className="hover:text-text-bright transition-colors">
              → booklet
            </Link>
            <a
              href="mailto:tlacuilo@tlacuilo.org"
              className="hover:text-text-bright transition-colors"
            >
              → tlacuilo@tlacuilo.org
            </a>
          </div>

          {/* Columna 3 · Créditos */}
          <div className="flex flex-col gap-1 min-w-[180px] text-text-dim">
            <div>
              <span className="text-text">mi cosa es tu cosa.</span>
            </div>
          </div>

        </div>
      </footer>
    </>
  )
}
