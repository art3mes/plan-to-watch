/**
 * Block-compression encoders for the atlas step.
 *
 * The engine needs DXT1 inside a DDS container for desktop GPUs and ETC inside
 * a KTX container for phones. No usable encoder binary exists on this machine
 * (texture-compressor ships none and shells out to PVRTexToolCLI/crunch), so
 * both are implemented here. Both formats pack each 4x4 pixel block into 8
 * bytes, and the loader reads a single mip level, which keeps this small.
 *
 * Input is always tightly packed RGB (3 bytes per pixel), width and height
 * multiples of 4 - every atlas size in the app already satisfies that.
 */

// --- DXT1 -------------------------------------------------------------------

const to565 = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
const from565 = (c) => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31]

/**
 * One 4x4 block: take the RGB bounding box of the 16 texels as the two anchor
 * colors, then pick for each texel whichever of the four palette entries is
 * nearest. Bounding-box selection is the standard fast heuristic and is plenty
 * for poster thumbnails.
 */
const encodeDXT1Block = (block, out, outOffset) => {
  let minR = 255, minG = 255, minB = 255
  let maxR = 0, maxG = 0, maxB = 0
  for (let i = 0; i < 16; i++) {
    const r = block[i * 3], g = block[i * 3 + 1], b = block[i * 3 + 2]
    if (r < minR) minR = r
    if (g < minG) minG = g
    if (b < minB) minB = b
    if (r > maxR) maxR = r
    if (g > maxG) maxG = g
    if (b > maxB) maxB = b
  }

  // Inset the box slightly - it measurably reduces banding on flat areas.
  const insetR = (maxR - minR) >> 4, insetG = (maxG - minG) >> 4, insetB = (maxB - minB) >> 4
  minR = Math.min(255, minR + insetR); maxR = Math.max(0, maxR - insetR)
  minG = Math.min(255, minG + insetG); maxG = Math.max(0, maxG - insetG)
  minB = Math.min(255, minB + insetB); maxB = Math.max(0, maxB - insetB)

  let c0 = to565(maxR, maxG, maxB)
  let c1 = to565(minR, minG, minB)
  // c0 > c1 selects the opaque 4-color mode; equal colors are a flat block.
  if (c0 < c1) { const t = c0; c0 = c1; c1 = t }

  const [r0, g0, b0] = from565(c0)
  const [r1, g1, b1] = from565(c1)
  const palette = [
    [r0, g0, b0],
    [r1, g1, b1],
    [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3],
    [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3],
  ]

  let indices = 0
  for (let i = 0; i < 16; i++) {
    const r = block[i * 3], g = block[i * 3 + 1], b = block[i * 3 + 2]
    let best = 0
    let bestErr = Infinity
    for (let p = 0; p < 4; p++) {
      const dr = r - palette[p][0], dg = g - palette[p][1], db = b - palette[p][2]
      const err = dr * dr + dg * dg + db * db
      if (err < bestErr) { bestErr = err; best = p }
    }
    indices |= best << (i * 2)
  }

  out[outOffset] = c0 & 0xff
  out[outOffset + 1] = c0 >> 8
  out[outOffset + 2] = c1 & 0xff
  out[outOffset + 3] = c1 >> 8
  out[outOffset + 4] = indices & 0xff
  out[outOffset + 5] = (indices >> 8) & 0xff
  out[outOffset + 6] = (indices >> 16) & 0xff
  out[outOffset + 7] = (indices >> 24) & 0xff
}

// --- ETC1 (valid as ETC2 RGB8) ----------------------------------------------

// Per-table modifiers; the encoder picks one table per 2x4 sub-block.
const ETC1_TABLES = [
  [-8, -2, 2, 8], [-17, -5, 5, 17], [-29, -9, 9, 29], [-42, -13, 13, 42],
  [-60, -18, 18, 60], [-80, -24, 24, 80], [-106, -33, 33, 106], [-183, -47, 47, 183],
]

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)

/**
 * Individual mode only: each 2x4 half gets its own 4-bit-per-channel base
 * color. Individual mode never triggers ETC2's extended modes, so the output
 * decodes identically as ETC1 or ETC2 RGB8 - which is what the engine binds.
 */
const encodeETC1Block = (block, out, outOffset) => {
  // sub-block 0 = left 2 columns, sub-block 1 = right 2 columns (flip = 0)
  const halves = [[], []]
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 3
      halves[x < 2 ? 0 : 1].push([block[i], block[i + 1], block[i + 2]])
    }
  }

  const encoded = halves.map((texels) => {
    let sr = 0, sg = 0, sb = 0
    for (const [r, g, b] of texels) { sr += r; sg += g; sb += b }
    const avgR = sr / 8, avgG = sg / 8, avgB = sb / 8

    // 4 bits per channel, expanded by replication the way hardware does
    const q = (v) => Math.min(15, Math.max(0, Math.round(v / 17)))
    const qr = q(avgR), qg = q(avgG), qb = q(avgB)
    const baseR = qr * 17, baseG = qg * 17, baseB = qb * 17

    let bestTable = 0
    let bestErr = Infinity
    let bestSelectors = null

    for (let t = 0; t < 8; t++) {
      const mods = ETC1_TABLES[t]
      let err = 0
      const selectors = []
      for (const [r, g, b] of texels) {
        let bestSel = 0
        let selErr = Infinity
        for (let m = 0; m < 4; m++) {
          const dr = r - clamp255(baseR + mods[m])
          const dg = g - clamp255(baseG + mods[m])
          const db = b - clamp255(baseB + mods[m])
          const e = dr * dr + dg * dg + db * db
          if (e < selErr) { selErr = e; bestSel = m }
        }
        err += selErr
        selectors.push(bestSel)
      }
      if (err < bestErr) { bestErr = err; bestTable = t; bestSelectors = selectors }
    }

    return { qr, qg, qb, table: bestTable, selectors: bestSelectors }
  })

  const [a, b] = encoded

  // bytes 0-2: two 4-bit base colors per channel; byte 3: table indices,
  // diff bit = 0 (individual mode), flip bit = 0
  out[outOffset] = (a.qr << 4) | b.qr
  out[outOffset + 1] = (a.qg << 4) | b.qg
  out[outOffset + 2] = (a.qb << 4) | b.qb
  out[outOffset + 3] = (a.table << 5) | (b.table << 2)

  // Bytes 4-7 hold two bit planes, bit index x*4+y. The mapping below was
  // recovered by decoding upstream's own low/ktx/0.ktx against its low/dds/0.dds
  // twin and scoring every permutation: (msb,lsb) -> modifier is
  // (0,0)->+small (1,1)->-large, i.e. msb is the sign bit and lsb picks the
  // large magnitude. Inverting msb costs ~4x the error, so this is not a guess.
  const SELECTOR_MSB = [1, 1, 0, 0] // table order is [-large, -small, +small, +large]
  const SELECTOR_LSB = [1, 0, 0, 1]
  let msb = 0
  let lsb = 0
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 4; y++) {
      const half = x < 2 ? a : b
      // halves were filled y-outer/x-inner above, so index the same way here
      const idx = y * 2 + (x % 2)
      const sel = half.selectors[idx]
      const bit = x * 4 + y
      msb |= SELECTOR_MSB[sel] << bit
      lsb |= SELECTOR_LSB[sel] << bit
    }
  }
  out[outOffset + 4] = (msb >> 8) & 0xff
  out[outOffset + 5] = msb & 0xff
  out[outOffset + 6] = (lsb >> 8) & 0xff
  out[outOffset + 7] = lsb & 0xff
}

// --- image level ------------------------------------------------------------

const encodeBlocks = (rgb, width, height, blockEncoder) => {
  if (width % 4 || height % 4) throw new Error(`size ${width}x${height} must be a multiple of 4`)
  const out = new Uint8Array((width / 4) * (height / 4) * 8)
  const block = new Uint8Array(48)
  let offset = 0

  for (let by = 0; by < height; by += 4) {
    for (let bx = 0; bx < width; bx += 4) {
      for (let y = 0; y < 4; y++) {
        const row = ((by + y) * width + bx) * 3
        for (let x = 0; x < 4; x++) {
          const src = row + x * 3
          const dst = (y * 4 + x) * 3
          block[dst] = rgb[src]
          block[dst + 1] = rgb[src + 1]
          block[dst + 2] = rgb[src + 2]
        }
      }
      blockEncoder(block, out, offset)
      offset += 8
    }
  }
  return out
}

export const encodeDXT1 = (rgb, width, height) => encodeBlocks(rgb, width, height, encodeDXT1Block)
export const encodeETC = (rgb, width, height) => encodeBlocks(rgb, width, height, encodeETC1Block)

// --- containers -------------------------------------------------------------

/** 128-byte DDS header + DXT1 payload, exactly what the loader parses. */
export const writeDDS = (width, height, payload) => {
  const header = Buffer.alloc(128)
  header.writeUInt32LE(0x20534444, 0) // "DDS "
  header.writeUInt32LE(124, 4) // header size
  header.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x1000 | 0x80000, 8) // caps|height|width|pixelformat|linearsize
  header.writeUInt32LE(height, 12)
  header.writeUInt32LE(width, 16)
  header.writeUInt32LE(payload.length, 20) // linear size
  header.writeUInt32LE(0, 24) // depth
  header.writeUInt32LE(1, 28) // mip count
  header.writeUInt32LE(32, 76) // pixel format size
  header.writeUInt32LE(0x4, 80) // DDPF_FOURCC
  header.writeUInt32LE(0x31545844, 84) // "DXT1"
  header.writeUInt32LE(0x1000, 108) // DDSCAPS_TEXTURE
  return Buffer.concat([header, Buffer.from(payload)])
}

const KTX_IDENTIFIER = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a])
const GL_COMPRESSED_RGB8_ETC2 = 0x9274
const GL_RGB = 0x1907

/** KTX 1.1 with a single compressed level, matching the loader's expectations. */
export const writeKTX = (width, height, payload) => {
  const header = Buffer.alloc(52)
  header.writeUInt32LE(0x04030201, 0) // endianness
  header.writeUInt32LE(0, 4) // glType - 0 means compressed
  header.writeUInt32LE(1, 8) // glTypeSize
  header.writeUInt32LE(0, 12) // glFormat - 0 for compressed
  header.writeUInt32LE(GL_COMPRESSED_RGB8_ETC2, 16)
  header.writeUInt32LE(GL_RGB, 20) // glBaseInternalFormat
  header.writeUInt32LE(width, 24)
  header.writeUInt32LE(height, 28)
  header.writeUInt32LE(0, 32) // pixelDepth
  header.writeUInt32LE(0, 36) // array elements
  header.writeUInt32LE(1, 40) // faces
  header.writeUInt32LE(1, 44) // mip levels
  header.writeUInt32LE(0, 48) // bytes of key/value data

  const size = Buffer.alloc(4)
  size.writeUInt32LE(payload.length, 0)
  return Buffer.concat([KTX_IDENTIFIER, header, size, Buffer.from(payload)])
}
