/**
 * Step 4 - one popularity scale for the whole wall.
 *
 * MAL's popularity ranking returns 500 titles per page, so every MAL-listed
 * title is covered in ~60 requests. This decides what sits in the middle of the
 * wall: the most popular entry of each franchise first.
 *
 * Requires MAL_CLIENT_ID in .env.local (never printed).
 *
 * out: data/build/mal-popularity.json  { malId: { rank, members } }
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { httpJson, progress, readCatalog, readEnv, root, sleep } from './lib.mjs'

const OUT = resolve(root, 'data/build/mal-popularity.json')
const PAGE = 500
const MAX_PAGES = 80
const DELAY_MS = 1000

const clientId = readEnv('MAL_CLIENT_ID')
if (!clientId) {
  console.error('MAL_CLIENT_ID missing from .env.local - see the MAL API setup steps')
  process.exit(1)
}

const catalog = readCatalog()
const needed = new Set(catalog.map((a) => a.ids.mal).filter(Boolean))

const popularity = {}
const startedAt = Date.now()
let covered = 0

for (let page = 0; page < MAX_PAGES; page++) {
  const url =
    'https://api.myanimelist.net/v2/anime/ranking' +
    `?ranking_type=bypopularity&limit=${PAGE}&offset=${page * PAGE}` +
    '&fields=num_list_users'

  const { status, body } = httpJson(url, { headers: { 'X-MAL-CLIENT-ID': clientId } })
  if (!body?.data?.length) {
    console.log(`\n  page ${page} returned status ${status} with no rows - stopping`)
    break
  }

  for (const row of body.data) {
    const id = String(row.node.id)
    popularity[id] = {
      rank: row.ranking?.rank ?? page * PAGE + 1,
      members: row.node.num_list_users ?? 0,
    }
    if (needed.has(id)) covered++
  }

  progress('mal popularity', covered, needed.size, startedAt)
  if (covered >= needed.size) break
  if (!body.paging?.next) break
  sleep(DELAY_MS)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(popularity))

console.log(`\nranked ${Object.keys(popularity).length} titles | covers ${covered}/${needed.size} of our MAL ids -> ${OUT}`)
