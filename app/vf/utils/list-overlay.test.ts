import { describe, expect, it } from 'vitest'
import { LIST_STATUS, buildStatusBytes } from './list-overlay'

// Wall of 4 titles; MAL knows three of them, position 2 has no MAL id.
const malIdsByPosition = [100, 200, 0, 400]

describe('buildStatusBytes', () => {
  it('writes each status at the title position', () => {
    const { bytes, summary } = buildStatusBytes(
      { 100: LIST_STATUS.completed, 400: LIST_STATUS.dropped },
      malIdsByPosition,
      4,
    )

    expect(bytes[0]).toBe(LIST_STATUS.completed)
    expect(bytes[3]).toBe(LIST_STATUS.dropped)
    expect(bytes[1]).toBe(LIST_STATUS.none)
    expect(summary.matched).toBe(2)
    expect(summary.counts[LIST_STATUS.completed]).toBe(1)
  })

  it('counts entries the wall does not carry as missing', () => {
    const { summary } = buildStatusBytes(
      { 999: LIST_STATUS.completed },
      malIdsByPosition,
      4,
    )

    expect(summary.matched).toBe(0)
    expect(summary.missing).toBe(1)
    expect(summary.outside).toBe(0)
  })

  it('separates titles sitting past the cell limit', () => {
    const { bytes, summary } = buildStatusBytes(
      { 100: LIST_STATUS.watching, 400: LIST_STATUS.completed },
      malIdsByPosition,
      2, // only the first two positions are on this wall
    )

    expect(bytes[0]).toBe(LIST_STATUS.watching)
    expect(summary.matched).toBe(1)
    expect(summary.outside).toBe(1)
    expect(summary.missing).toBe(0)
  })

  it('sizes the buffer to cover every cell', () => {
    const { bytes } = buildStatusBytes({}, malIdsByPosition, 21474)
    expect(bytes.length).toBeGreaterThanOrEqual(21474)
  })
})
