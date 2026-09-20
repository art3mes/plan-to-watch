/**
 * The site marks a visitor's MyAnimeList entries on the wall, which needs a
 * MAL id -> wall position lookup. Chunks carry the ids in position order, so
 * the index is just those ids flattened: position i holds ids[i], 0 for the
 * titles MAL does not cover. ~19.7k of 21.5k positions are filled.
 *
 * Written next to the chunks and stamped with the same fingerprint, because a
 * reordered wall invalidates it exactly like it invalidates the atlases.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const MAL_INDEX_FILE = 'mal-index.json'

export const writeMalIndex = (jsonDir, { fingerprint, ids }) => {
  const out = resolve(jsonDir, MAL_INDEX_FILE)
  writeFileSync(out, JSON.stringify({ fingerprint, ids }))
  return { out, filled: ids.filter(Boolean).length, total: ids.length }
}

/** Rebuild the index from chunks already on disk. */
export const buildMalIndexFromChunks = (jsonDir) => {
  const manifest = JSON.parse(readFileSync(resolve(jsonDir, 'manifest.json'), 'utf8'))
  const ids = []
  for (let chunk = 0; ; chunk++) {
    const file = resolve(jsonDir, `${chunk}.json`)
    if (!existsSync(file)) break
    for (const row of JSON.parse(readFileSync(file, 'utf8'))) ids.push(Number(row.mal) || 0)
  }
  if (ids.length !== manifest.count) {
    throw new Error(`chunks hold ${ids.length} titles, manifest says ${manifest.count}`)
  }
  return { fingerprint: manifest.fingerprint, ids }
}
