/**
 * Step 1 - build the catalog from the manami anime-offline-database dump.
 *
 * Pure local filtering, no network. Applies the agreed scope rules and writes
 * one compact record per title, keyed by the provider ids we later crawl.
 *
 * in:  data/raw/anime-offline-database-minified.json
 * out: data/build/catalog.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const IN = resolve(root, 'data/raw/anime-offline-database-minified.json')
const OUT = resolve(root, 'data/build/catalog.json')

const MAX_SYNONYMS = 12
const SHORT_SECONDS = 300 // <= 5 min per episode counts as a clip
const MIN_SITES_FOR_SPECIAL = 3

const sourceId = (sources, host) => {
  const url = sources.find((s) => s.includes(host))
  return url ? url.split('/').pop() : undefined
}

const hasSource = (anime, host) => anime.sources.some((s) => s.includes(host))
const isHentai = (anime) => anime.tags.includes('hentai')
const hasPicture = (anime) => !/no_pic/.test(anime.picture)
const hasAired = (anime) => anime.status === 'FINISHED' || anime.status === 'ONGOING'
const isShort = (anime) => Boolean(anime.duration) && anime.duration.value <= SHORT_SECONDS
const isPromo = (anime) =>
  anime.tags.some((t) => /^(promotional|commercials?|music video)$/.test(t)) ||
  /\b(PV|CM|Trailer|Teaser)\b/i.test(anime.title)

const isFeature = (anime) => ['TV', 'MOVIE', 'OVA', 'ONA'].includes(anime.type)
const eligible = (anime) => hasAired(anime) && !isHentai(anime) && hasPicture(anime)

// Ecchi, Chinese and Korean titles all stay in on purpose - the only content
// rule is "no hentai". Sequels stay as their own titles too.
const inScope = (anime) => {
  if (!eligible(anime)) return false

  // 1. the backbone: anything Kitsu knows about, so it gets a full detail panel
  if (isFeature(anime) && hasSource(anime, 'kitsu.app')) return 'kitsu'

  // 2. specials that stand on their own (not recaps, clips or promos)
  if (
    anime.type === 'SPECIAL' &&
    hasSource(anime, 'myanimelist.net') &&
    !isPromo(anime) &&
    !isShort(anime) &&
    anime.sources.length >= MIN_SITES_FOR_SPECIAL
  ) {
    return 'special'
  }

  // 3. titles Kitsu has not mapped yet - mostly recent seasons. Thin panel
  //    until MAL fills in the synopsis.
  if (
    isFeature(anime) &&
    !hasSource(anime, 'kitsu.app') &&
    (hasSource(anime, 'myanimelist.net') || hasSource(anime, 'anilist.co')) &&
    !isShort(anime) &&
    !isPromo(anime) &&
    anime.animeSeason.year
  ) {
    return 'mal-only'
  }

  return false
}

// Alternative titles are the fallback names for the detail panel. Scripts we
// cannot render usefully (Cyrillic, Thai, Arabic, ...) are dropped.
const usableScript = (s) =>
  /^[\p{Script=Latin}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}\p{N}\p{P}\p{S}\s]+$/u.test(s)

const pickSynonyms = (anime) => {
  const seen = new Set([anime.title.toLowerCase()])
  const out = []
  for (const s of anime.synonyms) {
    const key = s.toLowerCase()
    if (out.length >= MAX_SYNONYMS) break
    if (!usableScript(s) || seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

const db = JSON.parse(readFileSync(IN, 'utf8'))
const catalog = []
const origins = { kitsu: 0, special: 0, 'mal-only': 0 }

for (const anime of db.data) {
  const origin = inScope(anime)
  if (!origin) continue
  origins[origin]++

  catalog.push({
    origin,
    title: anime.title,
    synonyms: pickSynonyms(anime),
    type: anime.type,
    episodes: anime.episodes,
    status: anime.status,
    year: anime.animeSeason.year ?? null,
    season: anime.animeSeason.season === 'UNDEFINED' ? null : anime.animeSeason.season,
    durationSec: anime.duration?.value ?? null,
    picture: anime.picture,
    score: anime.score ? Number(anime.score.arithmeticMean.toFixed(2)) : null,
    studios: anime.studios,
    tags: anime.tags.slice(0, 20),
    ids: {
      mal: sourceId(anime.sources, 'myanimelist.net'),
      anilist: sourceId(anime.sources, 'anilist.co'),
      kitsu: sourceId(anime.sources, 'kitsu.app'),
    },
    // kept for franchise grouping later, resolved against other catalog entries
    related: anime.relatedAnime,
  })
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(catalog))

const count = (fn) => catalog.filter(fn).length
const byType = catalog.reduce((m, a) => ((m[a.type] = (m[a.type] || 0) + 1), m), {})

console.log(`dump ${db.lastUpdate}: ${db.data.length} entries -> catalog ${catalog.length}`)
console.log('  by rule:', origins)
console.log('  by type:', byType)
console.log('  ids: mal', count((a) => a.ids.mal), '| anilist', count((a) => a.ids.anilist), '| kitsu', count((a) => a.ids.kitsu))
console.log('  with score:', count((a) => a.score !== null), '| with year:', count((a) => a.year !== null))
console.log(`  wrote ${OUT}`)
