import { type OGLRenderingContext, Texture } from 'ogl'
import type { VoroforceInstance } from '../types'

/**
 * Marks a visitor's MyAnimeList entries on the wall.
 *
 * The statuses arrive keyed by MAL id; `public/json/mal-index.json` maps those
 * to wall positions. The result is one byte per position, uploaded as a data
 * texture the main shader reads per cell (see `listOverlayColor` in
 * app/vf/config/display/main.frag). Codes must match STATUS_CODE in
 * functions/api/mal-list.js and the shader's colour table.
 */

export const LIST_STATUS = {
  none: 0,
  completed: 1,
  watching: 2,
  onHold: 3,
  dropped: 4,
  planToWatch: 5,
} as const

export type ListStatusCode = (typeof LIST_STATUS)[keyof typeof LIST_STATUS]

export type ListStatusMeta = {
  code: Exclude<ListStatusCode, 0>
  label: string
  color: string
}

// Colours mirror listStatusColor() in the shader.
export const LIST_STATUS_META: ListStatusMeta[] = [
  { code: LIST_STATUS.completed, label: 'Completed', color: '#ffab1c' },
  { code: LIST_STATUS.watching, label: 'Watching', color: '#4ac0ff' },
  { code: LIST_STATUS.onHold, label: 'On hold', color: '#d9ff59' },
  { code: LIST_STATUS.dropped, label: 'Dropped', color: '#f54f4f' },
  { code: LIST_STATUS.planToWatch, label: 'Plan to watch', color: '#ae8ffa' },
]

export type MalStatuses = Record<string, number>

export type ListSummary = {
  matched: number
  /** On the wall, but past the cell limit the visitor picked. */
  outside: number
  /** Not on the wall at all - hentai, or no MAL id in the data. */
  missing: number
  counts: Record<number, number>
}

const TEXTURE_WIDTH = 256

/**
 * Turns MAL ids into one status byte per wall position. Entries the wall does
 * not carry - hentai, titles without a MAL id, anything past the cell limit -
 * are counted as missing rather than dropped silently.
 */
export const buildStatusBytes = (
  statuses: MalStatuses,
  malIdsByPosition: number[],
  cellCount: number,
): { bytes: Uint8Array; summary: ListSummary } => {
  const positionsByMalId = new Map<number, number>()
  malIdsByPosition.forEach((malId, position) => {
    if (malId) positionsByMalId.set(malId, position)
  })

  const height = Math.max(1, Math.ceil(cellCount / TEXTURE_WIDTH))
  const bytes = new Uint8Array(TEXTURE_WIDTH * height)
  const counts: Record<number, number> = {}
  let matched = 0
  let outside = 0
  let missing = 0

  for (const [malId, code] of Object.entries(statuses)) {
    const position = positionsByMalId.get(Number(malId))
    if (position === undefined) {
      missing++
      continue
    }
    if (position >= cellCount) {
      outside++
      continue
    }
    bytes[position] = code
    counts[code] = (counts[code] ?? 0) + 1
    matched++
  }

  return { bytes, summary: { matched, outside, missing, counts } }
}

export type ListOverlay = {
  setStatusBytes: (bytes?: Uint8Array) => void
  setStrength: (tint: number, dim: number) => void
  cellCount: number
}

/**
 * Attaches the overlay uniforms to the running shader. The program is built
 * inside the voroforce constructor, so this runs straight after init and
 * before the first frame - the uniforms exist by the time anything draws.
 */
export const createListOverlay = (
  instance: VoroforceInstance,
): ListOverlay | undefined => {
  const scene = instance.display?.scene as
    | {
        gl?: OGLRenderingContext
        mainProgram?: { uniforms: Record<string, { value: unknown }> }
      }
    | undefined
  const gl = scene?.gl
  const uniforms = scene?.mainProgram?.uniforms
  if (!gl || !uniforms) return

  // OGL types its context as WebGL1; the engine runs WebGL2, where the
  // integer texture formats live.
  const gl2 = gl as unknown as WebGL2RenderingContext
  const cellCount = instance.cells.length
  const height = Math.max(1, Math.ceil(cellCount / TEXTURE_WIDTH))
  const empty = new Uint8Array(TEXTURE_WIDTH * height)

  const texture = new Texture(gl, {
    image: empty,
    width: TEXTURE_WIDTH,
    height,
    format: gl2.RED_INTEGER,
    internalFormat: gl2.R8UI,
    type: gl2.UNSIGNED_BYTE,
    wrapS: gl2.CLAMP_TO_EDGE,
    wrapT: gl2.CLAMP_TO_EDGE,
    minFilter: gl2.NEAREST,
    magFilter: gl2.NEAREST,
    generateMipmaps: false,
    flipY: false,
  })

  uniforms.uCellListStatusTexture = { value: texture }
  uniforms.fListTintStrength = { value: 0 }
  uniforms.fListDimStrength = { value: 0 }

  return {
    cellCount,
    setStatusBytes: (bytes?: Uint8Array) => {
      texture.image = bytes ?? empty
      texture.needsUpdate = true
    },
    setStrength: (tint: number, dim: number) => {
      uniforms.fListTintStrength.value = tint
      uniforms.fListDimStrength.value = dim
    },
  }
}
