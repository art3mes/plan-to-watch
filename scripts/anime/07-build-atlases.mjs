/**
 * Step 7 - turn the downloaded posters into the texture atlases the wall reads.
 *
 * Each media version is a grid of poster tiles packed into one image per layer,
 * compressed to DXT1 (DDS, desktop GPUs) and ETC (KTX, phones). Grid sizes come
 * straight from app/vf/config/media/media.ts and must stay in step with it.
 *
 * Single streaming pass: every poster is decoded once and its pixels are copied
 * into all three atlas canvases plus the panel-sized jpeg. Handing sharp a
 * composite of 21k inputs (the obvious approach) never finishes.
 *
 * in:  data/build/ordered.json, data/raw/posters/<key>.jpg
 * out: public/media/{low,mid,high}/{dds,ktx}/<layer>.{dds,ktx}
 *      public/media/single/<position>.jpg
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { encodeDXT1, encodeETC, writeDDS, writeKTX } from './encode.mjs'
import { root } from './lib.mjs'

const POSTER_DIR = resolve(root, 'data/raw/posters')
const MEDIA_DIR = resolve(root, 'public/media')

// Mirrored from app/vf/config/media/media.ts. Every canvas dimension divides
// by 4, which both block formats require.
const VERSIONS = [
  { name: 'low', cols: 512, rows: 104, width: 2048, height: 624 },
  { name: 'mid', cols: 90, rows: 60, width: 1980, height: 1980 },
  { name: 'high', cols: 18, rows: 12, width: 1980, height: 1980 },
]
const SINGLE = { width: 220, height: 330, quality: 82 }

const ordered = JSON.parse(readFileSync(resolve(root, 'data/build/ordered.json'), 'utf8'))
const total = ordered.length

const clearDir = (dir, pattern) => {
  mkdirSync(dir, { recursive: true })
  for (const file of readdirSync(dir)) if (pattern.test(file)) unlinkSync(resolve(dir, file))
}

for (const v of VERSIONS) {
  clearDir(resolve(MEDIA_DIR, v.name, 'dds'), /\.dds$/)
  clearDir(resolve(MEDIA_DIR, v.name, 'ktx'), /\.ktx$/)
  v.tileWidth = Math.floor(v.width / v.cols)
  v.tileHeight = Math.floor(v.height / v.rows)
  v.perLayer = v.cols * v.rows
  v.layers = Math.ceil(total / v.perLayer)
  v.canvas = Buffer.alloc(v.width * v.height * 3) // current layer, black
  v.current = 0
}
clearDir(resolve(MEDIA_DIR, 'single'), /\.jpg$/)

const writeLayer = (v, layer) => {
  const dds = writeDDS(v.width, v.height, encodeDXT1(v.canvas, v.width, v.height))
  const ktx = writeKTX(v.width, v.height, encodeETC(v.canvas, v.width, v.height))
  for (const [dir, ext, data] of [['dds', 'dds', dds], ['ktx', 'ktx', ktx]]) {
    for (let i = 0; i < 6; i++) {
      try {
        writeFileSync(resolve(MEDIA_DIR, v.name, dir, `${layer}.${ext}`), data)
        break
      } catch (error) {
        if (i === 5) throw error
        const wait = 150 * 2 ** i
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait)
      }
    }
  }
  v.canvas.fill(0)
  return dds.length + ktx.length
}

/** Copy a decoded tile into its slot in the layer canvas. */
const blit = (canvas, canvasWidth, tile, tileWidth, tileHeight, slot, cols) => {
  const left = (slot % cols) * tileWidth
  const top = Math.floor(slot / cols) * tileHeight
  for (let y = 0; y < tileHeight; y++) {
    tile.copy(canvas, ((top + y) * canvasWidth + left) * 3, y * tileWidth * 3, (y + 1) * tileWidth * 3)
  }
}

/**
 * Windows hands out transient EPERM/EBUSY while thousands of small files are
 * rewritten (dev server reading them, antivirus scanning them). A single one
 * of those should never kill a nine minute build.
 */
const withRetry = async (label, fn, attempts = 6) => {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      const transient = ['EPERM', 'EBUSY', 'EACCES', 'ENOENT'].some((c) => String(error.message).includes(c)) ||
        /Permission denied|unable to write/i.test(String(error.message))
      if (!transient || i === attempts - 1) {
        console.warn('  giving up on ' + label + ': ' + String(error.message).slice(0, 90))
        return null
      }
      await new Promise((r) => setTimeout(r, 150 * 2 ** i))
    }
  }
}

const startedAt = Date.now()
let missing = 0
let bytes = 0

for (let position = 0; position < total; position++) {
  const key = ordered[position].key
  const file = key ? resolve(POSTER_DIR, `${key}.jpg`) : null

  // Decode the jpeg exactly once into a small raw buffer, then derive every
  // size from that. Re-running the decoder per size (sharp .clone() does)
  // quadruples the work for no gain.
  let base = null
  if (file && existsSync(file)) {
    try {
      base = await sharp(file).removeAlpha().resize(SINGLE.width, SINGLE.height, { fit: 'fill' }).raw().toBuffer()
    } catch {
      base = null // unreadable download; the tile stays black
    }
  }
  if (!base) missing++
  const fromBase = () => sharp(base, { raw: { width: SINGLE.width, height: SINGLE.height, channels: 3 } })

  for (const v of VERSIONS) {
    if (base) {
      const tile = await fromBase().resize(v.tileWidth, v.tileHeight, { fit: 'fill' }).raw().toBuffer()
      blit(v.canvas, v.width, tile, v.tileWidth, v.tileHeight, position % v.perLayer, v.cols)
    }
    // layer complete (or this is the very last poster) - encode and flush
    if (position % v.perLayer === v.perLayer - 1 || position === total - 1) {
      bytes += writeLayer(v, Math.floor(position / v.perLayer))
    }
  }

  if (base) {
    await withRetry(`single/${position}.jpg`, () =>
      fromBase()
        .jpeg({ quality: SINGLE.quality, progressive: true })
        .toFile(resolve(MEDIA_DIR, 'single', `${position}.jpg`)),
    )
  }

  if (position % 250 === 0 || position === total - 1) {
    const done = position + 1
    const elapsed = (Date.now() - startedAt) / 1000
    const eta = Math.round(((total - done) / Math.max(done / elapsed, 0.01)) / 60)
    process.stdout.write(`\rpacking: ${done}/${total} | ${(bytes / 1048576).toFixed(0)} MB written | ~${eta}m left | ${missing} missing    `)
  }
}

console.log(`\ndone: ${total - missing} posters packed, ${missing} missing, ${(bytes / 1048576).toFixed(0)} MB of atlases`)
writeFileSync(
  resolve(MEDIA_DIR, 'manifest.json'),
  JSON.stringify({
    fingerprint: readFileSync(resolve(root, 'data/build/order-fingerprint.txt'), 'utf8').trim(),
    count: total,
    layers: Object.fromEntries(VERSIONS.map((v) => [v.name, v.layers])),
  }),
)

console.log('layer counts for .env.local:')
VERSIONS.forEach((v, i) => console.log(`  VITE_MEDIA_VERSION_${i}_LAYERS=${v.layers}`))
