// Agrega / actualiza la tabla "libros" desde un export de LibraryThing. NUNCA BORRA.
// Pensado para exports parciales o por-fecha: en LT sacas solo lo nuevo y lo corres aqui.
// Por default es DRY RUN (solo muestra que pasaria). Con --aplicar ejecuta de verdad.
//
// Que hace:
//   DEDUP  si el libro ya esta en el catalogo (match por librarything_id, luego isbn13,
//          luego titulo+autor normalizados) NO lo duplica: solo le AGREGA la(s) categoria(s)
//          y rellena campos que esten vacios. Nunca pisa datos que ya tenga.
//   INSERTA los libros que de verdad son nuevos, en teca=biblioteca, disponible=true.
//   NUNCA borra, ni toca disponible / teca / prestamos / portada de lo que ya existe.
//   IGNORA colecciones BLOQUEADAS (arte/vinilos/dvds/obras) y todos sus libros.
//
// Correr desde la raiz del repo tlacuilo-web (usa .env.local):
//   node scripts/sincronizar-catalogo.mjs "<ruta al export json>"            -> dry run
//   node scripts/sincronizar-catalogo.mjs "<ruta al export json>" --aplicar  -> aplica

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---- leer .env.local sin dependencias ----
const env = {}
try {
  for (const linea of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
    if (m) env[m[1]] = m[2]
  }
} catch {
  console.error('No encontre .env.local — corre este script desde la raiz del repo tlacuilo-web')
  process.exit(1)
}

const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_SB || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const rutaJson = process.argv[2]
const APLICAR = process.argv.includes('--aplicar')
if (!rutaJson) {
  console.error('Uso: node scripts/sincronizar-catalogo.mjs "<ruta al export json>" [--aplicar]')
  process.exit(1)
}

const sb = createClient(URL_SB, SERVICE_KEY)

// ---- colecciones sistema de LT (no son categorias tematicas) ----
const COLS_DEFAULT = new Set([
  'Your library', 'Wishlist', 'Currently reading', 'To read', 'Read but unowned', 'Favorites',
])

// ---- colecciones BLOQUEADAS: NUNCA entran a la web (arte/vinilos/dvds/obras por artista/galeria) ----
// regla marina 2026-07-21: estas categorias y TODOS los libros que las contengan quedan fuera del
// catalogo. no aparecen en la sidebar, sus libros tampoco, y no se sincronizan. blocklist permanente.
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const BLOQUEADAS = new Set([
  'Psicología Social', 'Biblioteca de las Naciones', 'ARTE', 'SOMA', 'IMBA',
  'VOZ VIVA', 'VINILES -', 'CARRILLO-GIL', 'DVDs Ciencia Ficción', 'SUSANISIMA',
  'RAMIRO CHAVES', 'JULIETA GONZÁLEZ', 'Fundacion M', 'TEZONTLE Lucas Cantú',
  'CIRCA Fernando Delmar', "O'GORMAN NANCARROW",
].map(norm))
const estaBloqueada = c => BLOQUEADAS.has(norm(c))
const libroBloqueado = b => (b.collections || []).some(estaBloqueada)

// ---- decodificar entidades HTML que LT deja en titulos/autores ----
const ENT = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', auml: 'ä', ouml: 'ö', ccedil: 'ç', Ccedil: 'Ç', agrave: 'à', egrave: 'è' }
const decodificar = s => s
  ? s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-zA-Z]+);/g, (m, e) => ENT[e] ?? m)
  : s

// ---- mapear una entrada del export LT a una fila de libros ----
function mapear(ltId, b) {
  let autor = b.authors?.[0]?.fl || null
  if (!autor && b.primaryauthor) {
    const partes = b.primaryauthor.split(',')
    autor = partes.length === 2 ? `${partes[1].trim()} ${partes[0].trim()}` : b.primaryauthor
  }
  let isbn = null
  const candidatos = []
  if (b.isbn && typeof b.isbn === 'object') candidatos.push(...Object.values(b.isbn))
  if (b.originalisbn) candidatos.push(b.originalisbn)
  const limpios = candidatos.map(x => String(x).replace(/[^0-9Xx]/g, '')).filter(x => x.length === 10 || x.length === 13)
  isbn = limpios.find(x => x.length === 13) || limpios[0] || null

  const anio = (b.date || '').match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]
  const categorias = (b.collections || []).filter(c => !COLS_DEFAULT.has(c) && !estaBloqueada(c))

  return {
    librarything_id: String(ltId),
    titulo: decodificar((b.title || '').trim()),
    autor: decodificar(autor),
    isbn,
    anio: anio ? parseInt(anio, 10) : null,
    categorias: categorias.sort(),
  }
}

const union = (a, b) => [...new Set([...(a || []), ...(b || [])])].sort()
const mismasCats = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort())
const claveTA = (t, a) => `${norm(t)}|${norm(a)}`

// ---- cargar export y colapsar por libro (mismo libro 2x en LT => unir categorias) ----
const catalogo = JSON.parse(readFileSync(rutaJson, 'utf8'))
const deseado = []
let bloqueados = 0
const vistos = new Map() // clave dedup dentro del export -> indice en deseado
for (const [k, b] of Object.entries(catalogo)) {
  if (libroBloqueado(b)) { bloqueados++; continue }
  const m = mapear(String(b.books_id || k), b)
  const clave = m.isbn || `lt:${m.librarything_id}` || claveTA(m.titulo, m.autor)
  if (vistos.has(clave)) {
    const prev = deseado[vistos.get(clave)]
    prev.categorias = union(prev.categorias, m.categorias)
  } else {
    vistos.set(clave, deseado.length)
    deseado.push(m)
  }
}
console.log(`Export: ${deseado.length} libros unicos (${bloqueados} ignorados por coleccion bloqueada)`)

// ---- bajar toda la tabla libros (paginado) ----
const filas = []
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await sb.from('libros').select('*').range(desde, desde + 999)
  if (error) { console.error('Error leyendo libros:', error.message); process.exit(1) }
  filas.push(...data)
  if (data.length < 1000) break
}
console.log(`DB actual: ${filas.length} filas`)

// ---- indices para dedup: por lt_id, por isbn, por titulo+autor ----
const porLt = new Map(), porIsbn = new Map(), porTA = new Map()
for (const f of filas) {
  if (f.librarything_id) porLt.set(String(f.librarything_id), f)
  if (f.isbn) { (porIsbn.get(f.isbn) || porIsbn.set(f.isbn, []).get(f.isbn)).push(f) }
  const kta = claveTA(f.titulo, f.autor)
  ;(porTA.get(kta) || porTA.set(kta, []).get(kta)).push(f)
}
const encontrar = m => {
  if (m.librarything_id && porLt.has(m.librarything_id)) return [porLt.get(m.librarything_id)]
  if (m.isbn && porIsbn.has(m.isbn)) return porIsbn.get(m.isbn)
  const kta = claveTA(m.titulo, m.autor)
  if (m.titulo && porTA.has(kta)) return porTA.get(kta)
  return []
}

// ---- calcular diff (solo insertar y actualizar; jamas borrar) ----
const aInsertar = []
const aActualizar = []
for (const m of deseado) {
  const existentes = encontrar(m)
  if (!existentes.length) { aInsertar.push(m); continue }
  for (const f of existentes) {
    const cats = union(f.categorias, m.categorias)
    const patch = {}
    if (!mismasCats(cats, f.categorias)) patch.categorias = cats
    // rellenar solo lo que este vacio, nunca pisar
    if (!f.autor && m.autor) patch.autor = m.autor
    if (!f.isbn && m.isbn) patch.isbn = m.isbn
    if (!f.anio && m.anio) patch.anio = m.anio
    if (Object.keys(patch).length) aActualizar.push({ id: f.id, titulo: f.titulo, patch })
  }
}

console.log('\n================ DIFF (nunca borra) ================')
console.log(`INSERTAR:   ${aInsertar.length} libros nuevos`)
console.log(`ACTUALIZAR: ${aActualizar.length} filas ya existentes (se les agrega categoria / se rellenan vacios)`)
console.log('====================================================\n')

const muestra = (arr, fmt, n = 12) => arr.slice(0, n).forEach(x => console.log('  ' + fmt(x)))
if (aInsertar.length) { console.log('Ejemplos a insertar:'); muestra(aInsertar, m => `${m.titulo} — ${m.autor || 's/a'} [${m.categorias.join(', ')}]`) }
if (aActualizar.length) { console.log('\nEjemplos a actualizar:'); muestra(aActualizar, u => `${u.titulo}: ${Object.keys(u.patch).join(', ')}${u.patch.categorias ? ' -> ' + u.patch.categorias.join('/') : ''}`) }

const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
writeFileSync(`sync-reporte-${fecha}.json`, JSON.stringify({ aInsertar, aActualizar }, null, 1))
console.log(`\nReporte del diff: sync-reporte-${fecha}.json`)

if (!APLICAR) {
  console.log('\nDRY RUN — no se toco nada. Revisa y vuelve a correr con --aplicar')
  process.exit(0)
}

// ---- backup completo antes de tocar ----
writeFileSync(`backup-libros-${fecha}.json`, JSON.stringify(filas, null, 1))
console.log(`\nBackup completo de libros: backup-libros-${fecha}.json`)

// ---- insertar en lotes ----
let insertados = 0
for (let i = 0; i < aInsertar.length; i += 500) {
  const lote = aInsertar.slice(i, i + 500).map(m => ({
    librarything_id: m.librarything_id, titulo: m.titulo, autor: m.autor, isbn: m.isbn,
    anio: m.anio, categorias: m.categorias.length ? m.categorias : null, teca: 'biblioteca', disponible: true,
  }))
  const { error } = await sb.from('libros').insert(lote)
  if (error) { console.error(`Error insertando lote ${i}: ${error.message}`); process.exit(1) }
  insertados += lote.length
  console.log(`Insertados ${insertados}/${aInsertar.length}`)
}

// ---- actualizar (en tandas de 20 en paralelo) ----
let actualizados = 0, fallos = 0
for (let i = 0; i < aActualizar.length; i += 20) {
  const tanda = aActualizar.slice(i, i + 20)
  const res = await Promise.all(tanda.map(u => sb.from('libros').update(u.patch).eq('id', u.id)))
  for (const r of res) r.error ? fallos++ : actualizados++
}
console.log(`Actualizados: ${actualizados}, fallos: ${fallos}`)

console.log('\nListo. Se agrego lo nuevo sin borrar nada.')
