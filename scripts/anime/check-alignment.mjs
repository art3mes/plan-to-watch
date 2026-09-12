/**
 * Are the json chunks and the texture atlases from the same build?
 *
 * Both are indexed by wall position, so a merge without a matching atlas
 * rebuild silently shows every poster under the wrong title.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from './lib.mjs'

const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null)
const json = read(resolve(root, 'public/json/manifest.json'))
const media = read(resolve(root, 'public/media/manifest.json'))

if (!json || !media) {
  console.error(`missing manifest - json: ${Boolean(json)}, media: ${Boolean(media)}. Run anime:order then anime:atlases.`)
  process.exit(1)
}

if (json.fingerprint !== media.fingerprint) {
  console.error(`MISALIGNED: chunks ${json.fingerprint} vs media ${media.fingerprint}`)
  console.error('Posters will appear under the wrong titles. Run: pnpm anime:atlases')
  process.exit(1)
}

console.log(`aligned: ${json.fingerprint} | ${json.count} titles | layers ${JSON.stringify(media.layers)}`)
