/**
 * Step 6 - download one poster per title, named by its position on the wall.
 *
 * Sources are Kitsu's image CDN and MyAnimeList's, whichever the merge picked.
 * Resumable: existing files are skipped, so an interrupted run just continues.
 *
 * in:  data/build/posters.json
 * out: data/raw/posters/<position>.jpg
 *      data/build/poster-failures.json
 */

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from './lib.mjs'

const IN = resolve(root, 'data/build/posters.json')
const OUT_DIR = resolve(root, 'data/raw/posters')
const OUT_FAILURES = resolve(root, 'data/build/poster-failures.json')
const CONCURRENCY = 32
const MIN_BYTES = 1024 // anything smaller is an error page, not a poster

const posters = JSON.parse(readFileSync(IN, 'utf8'))
mkdirSync(OUT_DIR, { recursive: true })

const download = (url, file) =>
  new Promise((done) => {
    execFile(
      'curl',
      ['-s', '-L', '--max-time', '60', '--retry', '2', '--retry-delay', '1', '-o', file, url],
      (error) => {
        if (error) return done({ ok: false, reason: String(error.message).slice(0, 80) })
        if (!existsSync(file)) return done({ ok: false, reason: 'no file written' })
        const { size } = statSync(file)
        if (size < MIN_BYTES) {
          // leave nothing behind: a truncated file would look 'already downloaded'
          // to the next run and become a permanently broken tile
          unlinkSync(file)
          return done({ ok: false, reason: `too small (${size}b)` })
        }
        done({ ok: true, size })
      },
    )
  })

// Keyed by stable provider id, so re-ordering the wall never re-downloads.
const todo = posters.filter((p) => p.url && p.key && !existsSync(resolve(OUT_DIR, `${p.key}.jpg`)))
const skipped = posters.length - todo.length
const noUrl = posters.filter((p) => !p.url || !p.key).length

console.log(`posters: ${posters.length} total | ${skipped} already on disk | ${todo.length} to fetch | ${noUrl} without a url`)

const failures = []
let done = 0
let bytes = 0
const startedAt = Date.now()

let cursor = 0
const worker = async () => {
  while (cursor < todo.length) {
    const item = todo[cursor++]
    const file = resolve(OUT_DIR, `${item.key}.jpg`)
    let result = await download(item.url, file)
    // primary dead (Kitsu 404s a few) - fall back to the other provider
    if (!result.ok && item.fallback && item.fallback !== item.url) {
      result = await download(item.fallback, file)
    }
    if (result.ok) bytes += result.size
    else failures.push({ ...item, reason: result.reason })

    done++
    if (done % 100 === 0 || done === todo.length) {
      const elapsed = (Date.now() - startedAt) / 1000
      const rate = done / Math.max(elapsed, 0.001)
      const etaMin = Math.round((todo.length - done) / Math.max(rate, 0.001) / 60)
      process.stdout.write(
        `\rdownloading: ${done}/${todo.length} | ${(bytes / 1048576).toFixed(0)} MB | ${rate.toFixed(1)}/s | ~${etaMin}m left | ${failures.length} failed    `,
      )
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker))

writeFileSync(OUT_FAILURES, JSON.stringify(failures, null, 1))
console.log(`\ndone: ${done - failures.length} posters, ${(bytes / 1048576).toFixed(0)} MB, ${failures.length} failed -> ${OUT_DIR}`)
if (failures.length) console.log(`failures listed in ${OUT_FAILURES} (rerun to retry them)`)
