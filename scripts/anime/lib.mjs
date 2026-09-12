/**
 * Shared helpers for the anime data pipeline.
 *
 * HTTP goes through curl rather than fetch: curl uses the OS certificate store,
 * which is what works reliably on this machine.
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Synchronous sleep - the pipeline is deliberately sequential and rate limited. */
export const sleep = (ms) => {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Read a single key out of .env.local without printing it. */
export const readEnv = (key) => {
  const file = resolve(root, '.env.local')
  if (!existsSync(file)) return undefined
  const match = readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))
  const value = match?.[1]?.trim()
  return value || undefined
}

/**
 * GET json with retries. Returns { status, body } - body is undefined when the
 * response was not json.
 */
export const httpJson = (url, { headers = {}, timeout = 45, retries = 4, backoffMs = 2000 } = {}) => {
  const args = ['-s', '--max-time', String(timeout), '-w', '\n%{http_code}']
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`)
  args.push(url)

  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) sleep(backoffMs * 2 ** (attempt - 1))
    try {
      const raw = execFileSync('curl', args, { maxBuffer: 64 * 1024 * 1024 }).toString()
      const cut = raw.lastIndexOf('\n')
      const status = Number(raw.slice(cut + 1).trim())
      const text = raw.slice(0, cut)

      // 404 is a real answer: the title is gone from that provider.
      if (status === 404) return { status, body: undefined }
      if (status === 429 || status >= 500) {
        lastError = new Error(`HTTP ${status}`)
        continue
      }
      if (status !== 200) return { status, body: undefined }

      return { status, body: JSON.parse(text) }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`request failed after ${retries + 1} attempts: ${url}\n  ${lastError?.message}`)
}

/** Append one record per line so a crawl can resume where it stopped. */
export const ndjsonAppend = (file, record) => {
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(record)}\n`)
}

export const ndjsonRead = (file) => {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null // tolerate a half-written final line from an interrupted run
      }
    })
    .filter(Boolean)
}

export const readCatalog = () => JSON.parse(readFileSync(resolve(root, 'data/build/catalog.json'), 'utf8'))

/** Progress line that overwrites itself, with an ETA. */
export const progress = (label, done, total, startedAt) => {
  const elapsed = (Date.now() - startedAt) / 1000
  const rate = done / Math.max(elapsed, 0.001)
  const etaMin = rate > 0 ? Math.round((total - done) / rate / 60) : 0
  const pct = ((done / total) * 100).toFixed(1)
  process.stdout.write(`\r${label}: ${done}/${total} (${pct}%) ~${etaMin}m left    `)
  if (done === total) process.stdout.write('\n')
}
