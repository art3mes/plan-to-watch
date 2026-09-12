/**
 * Step 2 - crawl Kitsu for every catalog title Kitsu knows.
 *
 * Kitsu is the main source: names in three languages, synopsis, poster, banner,
 * rating, popularity, age rating, and the sequel/prequel links used to group
 * franchises. 20 titles per request, resumable.
 *
 * in:  data/build/catalog.json
 * out: data/build/kitsu.ndjson
 */

import { resolve } from 'node:path'
import { httpJson, ndjsonAppend, ndjsonRead, progress, readCatalog, root, sleep } from './lib.mjs'

const OUT = resolve(root, 'data/build/kitsu.ndjson')
const BATCH = 20
const DELAY_MS = 350 // ~3 requests/second

const FIELDS = [
  'canonicalTitle',
  'titles',
  'abbreviatedTitles',
  'synopsis',
  'subtype',
  'status',
  'startDate',
  'endDate',
  'episodeCount',
  'episodeLength',
  'averageRating',
  'userCount',
  'favoritesCount',
  'popularityRank',
  'ratingRank',
  'ageRating',
  'ageRatingGuide',
  'nsfw',
  'posterImage',
  'coverImage',
].join(',')

const catalog = readCatalog()
const wanted = [...new Set(catalog.map((a) => a.ids.kitsu).filter(Boolean))]
const done = new Set(ndjsonRead(OUT).map((r) => String(r.id)))
const todo = wanted.filter((id) => !done.has(String(id)))

console.log(`kitsu: ${wanted.length} ids, ${done.size} already fetched, ${todo.length} to go`)

const startedAt = Date.now()
let fetched = 0
let missing = 0

for (let i = 0; i < todo.length; i += BATCH) {
  const ids = todo.slice(i, i + BATCH)
  // Two Kitsu quirks, both discovered the hard way:
  //  - `mediaRelationships` must be named in fields[anime], or the record comes
  //    back with no link list and relationships cannot be traced to their title
  //  - the include must be `mediaRelationships.destination`; asking for plain
  //    `mediaRelationships` returns the role but never the destination id
  const url =
    'https://kitsu.app/api/edge/anime' +
    `?filter%5Bid%5D=${ids.join(',')}` +
    `&page%5Blimit%5D=${BATCH}` +
    `&fields%5Banime%5D=${encodeURIComponent(`${FIELDS},mediaRelationships`)}` +
    '&include=mediaRelationships.destination' +
    '&fields%5BmediaRelationships%5D=role,destination' +
    '&fields%5Bmanga%5D=canonicalTitle'

  const { status, body } = httpJson(url, { headers: { Accept: 'application/vnd.api+json' } })
  if (!body?.data) {
    console.warn(`\n  batch at ${i} returned status ${status}, skipping`)
    sleep(DELAY_MS)
    continue
  }

  // relationship records arrive in `included`, keyed by their own id
  const relById = new Map()
  for (const inc of body.included ?? []) {
    if (inc.type !== 'mediaRelationships') continue
    const dest = inc.relationships?.destination?.data
    if (dest) relById.set(inc.id, { role: inc.attributes?.role, destType: dest.type, destId: dest.id })
  }

  const returned = new Set()
  for (const record of body.data) {
    returned.add(String(record.id))
    const rels = (record.relationships?.mediaRelationships?.data ?? [])
      .map((r) => relById.get(r.id))
      .filter(Boolean)
    ndjsonAppend(OUT, { id: record.id, ...record.attributes, relations: rels })
    fetched++
  }

  // ids Kitsu no longer serves: record them so a resume does not retry forever
  for (const id of ids) {
    if (!returned.has(String(id))) {
      ndjsonAppend(OUT, { id, missing: true })
      missing++
    }
  }

  progress('kitsu', Math.min(i + BATCH, todo.length), todo.length, startedAt)
  sleep(DELAY_MS)
}

console.log(`kitsu done: ${fetched} records, ${missing} missing -> ${OUT}`)
