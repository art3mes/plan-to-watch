/**
 * Step 3 - fill the gaps from MyAnimeList.
 *
 * Only titles with no Kitsu record need this: MAL supplies their synopsis,
 * English title, score and relations. One request per title, so it is the slow
 * step (~1/second, roughly an hour). Resumable.
 *
 * Requires MAL_CLIENT_ID in .env.local (never printed).
 *
 * in:  data/build/catalog.json
 * out: data/build/mal.ndjson
 */

import { resolve } from 'node:path'
import { httpJson, ndjsonAppend, ndjsonRead, progress, readCatalog, readEnv, root, sleep } from './lib.mjs'

const OUT = resolve(root, 'data/build/mal.ndjson')
const DELAY_MS = 1000 // MAL publishes no rate limit, so stay gentle

const FIELDS = [
  'id',
  'title',
  'alternative_titles',
  'synopsis',
  'mean',
  'rank',
  'popularity',
  'num_list_users',
  'num_scoring_users',
  'media_type',
  'status',
  'num_episodes',
  'average_episode_duration',
  'start_season',
  'start_date',
  'genres',
  'studios',
  'source',
  'rating',
  'main_picture',
  'related_anime',
].join(',')

const clientId = readEnv('MAL_CLIENT_ID')
if (!clientId) {
  console.error('MAL_CLIENT_ID missing from .env.local - see the MAL API setup steps')
  process.exit(1)
}

const catalog = readCatalog()
const wanted = [...new Set(catalog.filter((a) => !a.ids.kitsu && a.ids.mal).map((a) => a.ids.mal))]
const done = new Set(ndjsonRead(OUT).map((r) => String(r.id)))
const todo = wanted.filter((id) => !done.has(String(id)))

console.log(`mal: ${wanted.length} ids, ${done.size} already fetched, ${todo.length} to go`)

const startedAt = Date.now()
let fetched = 0
let missing = 0

for (let i = 0; i < todo.length; i++) {
  const id = todo[i]
  const url = `https://api.myanimelist.net/v2/anime/${id}?fields=${encodeURIComponent(FIELDS)}`
  const { status, body } = httpJson(url, { headers: { 'X-MAL-CLIENT-ID': clientId } })

  if (body?.id) {
    ndjsonAppend(OUT, body)
    fetched++
  } else {
    ndjsonAppend(OUT, { id, missing: true, status })
    missing++
  }

  if (i % 25 === 0 || i === todo.length - 1) progress('mal', i + 1, todo.length, startedAt)
  sleep(DELAY_MS)
}

console.log(`mal done: ${fetched} records, ${missing} missing -> ${OUT}`)
