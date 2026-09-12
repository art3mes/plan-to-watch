/**
 * Step 5 - merge the sources, group franchises, order the wall, cut the chunks.
 *
 * Order (decided with the user): each franchise's most popular entry first, in
 * popularity order, then every remaining sequel/movie/OVA after them. Position 0
 * lands in the middle of the wall, so the centre screen shows 216 different
 * shows rather than six seasons of the same one.
 *
 * in:  data/build/catalog.json, kitsu.ndjson, mal.ndjson, mal-popularity.json
 * out: data/build/ordered.json      full records in final order
 *      data/build/posters.json      poster source url per position (step 6)
 *      public/json/<n>.json         216 titles per chunk, as the app loads them
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { ndjsonRead, readCatalog, root } from './lib.mjs'

const CHUNK_SIZE = 216 // one high-res atlas page, and one json chunk
const OUT_ORDERED = resolve(root, 'data/build/ordered.json')
const OUT_POSTERS = resolve(root, 'data/build/posters.json')
const OUT_JSON_DIR = resolve(root, 'public/json')

// Links that mean "same franchise". Deliberately excludes `adaptation` (points
// at manga), `character`, `other` and `alternative_setting` - those chain
// unrelated shows together through crossovers and shared universes.
const FRANCHISE_ROLES = new Set([
  'sequel',
  'prequel',
  'parent_story',
  'side_story',
  'full_story',
  'summary',
  'alternative_version',
])
const FRANCHISE_MAL_RELATIONS = new Set([
  'sequel',
  'prequel',
  'parent_story',
  'side_story',
  'full_story',
  'summary',
  'alternative_version',
])

const catalog = readCatalog()
const kitsuById = new Map()
for (const r of ndjsonRead(resolve(root, 'data/build/kitsu.ndjson'))) {
  if (!r.missing) kitsuById.set(String(r.id), r)
}
const malById = new Map()
for (const r of ndjsonRead(resolve(root, 'data/build/mal.ndjson'))) {
  if (!r.missing) malById.set(String(r.id), r)
}
const popularityByMal = JSON.parse(readFileSync(resolve(root, 'data/build/mal-popularity.json'), 'utf8'))

// manami tags are a noisy grab bag ('19th century', 'amputation', 'americas'),
// so when MAL has no genre list only tags that are genuinely genres survive.
const GENRE_VOCAB = new Set([
  'action','adventure','comedy','drama','fantasy','horror','mecha','romance','sci fi','science fiction',
  'slice of life','sports','supernatural','thriller','mystery','psychological','isekai','shounen','shoujo',
  'seinen','josei','music','historical','military','school','magic','ecchi','harem','iyashikei','martial arts',
  'super power','vampire','demons','space','police','samurai','parody','game','crime','detective','idol',
  'cooking','medical','workplace','survival','time travel','post-apocalyptic','cyberpunk','gore','war',
  'kids','family','educational','boys love','girls love','reverse harem','mahou shoujo','magical girl',
  'shounen ai','shoujo ai','dementia','tragedy','superhero','racing','yuri','yaoi','gag humor',
])
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const stripHtml = (v) => text(v)?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

// --- merge ------------------------------------------------------------------

const records = catalog.map((entry) => {
  const kitsu = entry.ids.kitsu ? kitsuById.get(String(entry.ids.kitsu)) : undefined
  const mal = entry.ids.mal ? malById.get(String(entry.ids.mal)) : undefined
  const pop = entry.ids.mal ? popularityByMal[String(entry.ids.mal)] : undefined

  const english = text(kitsu?.titles?.en) ?? text(kitsu?.titles?.en_us) ?? text(mal?.alternative_titles?.en)
  const romaji = text(kitsu?.titles?.en_jp) ?? text(mal?.title) ?? text(entry.title)
  const native = text(kitsu?.titles?.ja_jp) ?? text(mal?.alternative_titles?.ja)

  // MAL's "english title" is often just the romaji one repeated - only keep it
  // as a second line when it actually differs.
  const title = english ?? romaji ?? entry.title
  const altParts = [romaji && romaji !== title ? romaji : undefined, native].filter(Boolean)

  const ratingMal = mal?.mean ? mal.mean * 10 : undefined
  const ratingKitsu = kitsu?.averageRating ? Number(kitsu.averageRating) : undefined
  const ratingManami = entry.score ? entry.score * 10 : undefined

  const poster =
    text(kitsu?.posterImage?.small) ??
    text(kitsu?.posterImage?.medium) ??
    text(mal?.main_picture?.large) ??
    text(mal?.main_picture?.medium) ??
    entry.picture

  const malGenres = mal?.genres?.map((g) => g.name) ?? []
  const tagGenres = entry.tags.filter((t) => GENRE_VOCAB.has(t))
  const genres = malGenres.length ? malGenres : tagGenres

  return {
    title,
    alt: altParts.join(' · ') || undefined,
    year: entry.year ?? (mal?.start_season?.year ?? null),
    season: entry.season ?? mal?.start_season?.season ?? null,
    type: entry.type,
    episodes: entry.episodes || mal?.num_episodes || null,
    studios: entry.studios?.length ? entry.studios : mal?.studios?.map((s) => s.name) ?? [],
    genres: genres.slice(0, 6),
    synopsis: stripHtml(kitsu?.synopsis) ?? stripHtml(mal?.synopsis) ?? undefined,
    rating: Math.round(ratingMal ?? ratingKitsu ?? ratingManami ?? 0) || null,
    ageRating: kitsu?.ageRating ?? undefined,
    nsfw: kitsu?.nsfw === true || undefined,
    ids: entry.ids,
    poster,
    // providers go stale independently; keep a second source so a dead
    // poster url does not cost us the tile
    fallbackPoster: entry.picture !== poster ? entry.picture : undefined,
    members: pop?.members ?? null,
    kitsuUsers: kitsu?.userCount ?? null,
    relations: kitsu?.relations ?? [],
    malRelated: mal?.related_anime ?? [],
  }
})

// --- one popularity scale ---------------------------------------------------
// MAL member counts cover most titles. Kitsu-only titles get their user count
// rescaled by the median members/users ratio of titles that have both.
const ratios = records
  .filter((r) => r.members && r.kitsuUsers)
  .map((r) => r.members / r.kitsuUsers)
  .sort((a, b) => a - b)
const medianRatio = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1

for (const r of records) {
  r.popularity = r.members ?? (r.kitsuUsers ? Math.round(r.kitsuUsers * medianRatio) : 0)
}

// --- franchise grouping -----------------------------------------------------

const byKitsu = new Map()
const byMal = new Map()
records.forEach((r, i) => {
  if (r.ids.kitsu) byKitsu.set(String(r.ids.kitsu), i)
  if (r.ids.mal) byMal.set(String(r.ids.mal), i)
})

const parent = records.map((_, i) => i)
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
const union = (a, b) => {
  const ra = find(a)
  const rb = find(b)
  if (ra !== rb) parent[ra] = rb
}

records.forEach((r, i) => {
  for (const rel of r.relations) {
    if (rel.destType !== 'anime' || !FRANCHISE_ROLES.has(rel.role)) continue
    const j = byKitsu.get(String(rel.destId))
    if (j !== undefined) union(i, j)
  }
  for (const rel of r.malRelated) {
    if (!FRANCHISE_MAL_RELATIONS.has(rel.relation_type)) continue
    const j = byMal.get(String(rel.node?.id))
    if (j !== undefined) union(i, j)
  }
})

const groups = new Map()
records.forEach((_, i) => {
  const key = find(i)
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(i)
})

// --- order ------------------------------------------------------------------

const flagships = []
const rest = []
for (const members of groups.values()) {
  const sorted = [...members].sort((a, b) => records[b].popularity - records[a].popularity)
  flagships.push(sorted[0])
  rest.push(...sorted.slice(1))
}
flagships.sort((a, b) => records[b].popularity - records[a].popularity)
rest.sort((a, b) => records[b].popularity - records[a].popularity)

const order = [...flagships, ...rest]

// --- write ------------------------------------------------------------------

// Poster files are keyed by a stable provider id, never by wall position:
// re-running this step (say, once the MAL crawl fills in more synopses)
// reshuffles positions, and downloads must survive that untouched.
const posterKey = (ids) =>
  ids.kitsu ? `k${ids.kitsu}` : ids.mal ? `m${ids.mal}` : ids.anilist ? `a${ids.anilist}` : null

const ordered = order.map((i, position) => ({ position, key: posterKey(records[i].ids), ...records[i] }))
writeFileSync(OUT_ORDERED, JSON.stringify(ordered))
writeFileSync(
  OUT_POSTERS,
  JSON.stringify(
    ordered.map((r) => ({ key: r.key, url: r.poster, fallback: r.fallbackPoster, title: r.title })),
  ),
)

mkdirSync(OUT_JSON_DIR, { recursive: true })
for (const file of readdirSync(OUT_JSON_DIR)) {
  if (/^\d+\.json$/.test(file)) unlinkSync(resolve(OUT_JSON_DIR, file))
}

const chunkCount = Math.ceil(ordered.length / CHUNK_SIZE)
for (let c = 0; c < chunkCount; c++) {
  const rows = ordered.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE).map((r) => ({
    title: r.title,
    alt: r.alt,
    year: r.year,
    type: r.type,
    episodes: r.episodes,
    studios: r.studios.slice(0, 3),
    genres: r.genres?.slice(0, 6) ?? [],
    synopsis: r.synopsis,
    rating: r.rating,
    ageRating: r.ageRating,
    mal: r.ids.mal ?? null,
    anilist: r.ids.anilist ?? null,
    kitsu: r.ids.kitsu ?? null,
  }))
  writeFileSync(resolve(OUT_JSON_DIR, `${c}.json`), JSON.stringify(rows))
}

// The atlases are indexed by wall position, so chunks and media are only
// valid together. Both sides stamp this fingerprint; scripts/anime/check-alignment.mjs
// compares them.
const fingerprint = createHash('sha1').update(ordered.map((r) => r.key).join(',')).digest('hex').slice(0, 16)
writeFileSync(resolve(root, 'data/build/order-fingerprint.txt'), fingerprint)
writeFileSync(
  resolve(OUT_JSON_DIR, 'manifest.json'),
  JSON.stringify({ fingerprint, count: ordered.length, chunkSize: CHUNK_SIZE }),
)

// --- report -----------------------------------------------------------------

const sizes = [...groups.values()].map((g) => g.length).sort((a, b) => b - a)
const biggest = [...groups.values()].sort((a, b) => b.length - a.length).slice(0, 5)
const fill = (fn) => ordered.filter(fn).length

console.log(`ordered ${ordered.length} titles into ${chunkCount} chunks of ${CHUNK_SIZE}`)
console.log(`franchises: ${groups.size} | singles: ${sizes.filter((s) => s === 1).length} | largest: ${sizes.slice(0, 8).join(',')}`)
for (const g of biggest) {
  const names = g.sort((a, b) => records[b].popularity - records[a].popularity).slice(0, 4).map((i) => records[i].title)
  console.log(`   ${g.length}x ${names.join(' | ')}`)
}
console.log(`median members/kitsuUsers ratio: ${medianRatio.toFixed(2)}`)
console.log(`coverage: synopsis ${fill((r) => r.synopsis)} | rating ${fill((r) => r.rating)} | alt title ${fill((r) => r.alt)} | poster ${fill((r) => r.poster)}`)
console.log('first screen (first 24):')
console.log('   ' + ordered.slice(0, 24).map((r) => r.title).join(' | '))
console.log(`order fingerprint ${fingerprint}`)
console.log(`wrote ${OUT_ORDERED}, ${OUT_POSTERS}, ${chunkCount} chunks in public/json/`)
