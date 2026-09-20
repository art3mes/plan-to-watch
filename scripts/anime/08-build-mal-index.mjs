/**
 * Step 8 - MAL id -> wall position lookup for the list overlay.
 *
 * Reads the chunks in public/json, so it is safe to run on its own after a
 * deploy; step 5 writes the same file directly when it cuts the chunks.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMalIndexFromChunks, writeMalIndex } from './mal-index.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const jsonDir = resolve(root, 'public/json')

const index = buildMalIndexFromChunks(jsonDir)
const { out, filled, total } = writeMalIndex(jsonDir, index)
console.log(`wrote ${out}`)
console.log(`${filled} of ${total} positions carry a MAL id (fingerprint ${index.fingerprint})`)
