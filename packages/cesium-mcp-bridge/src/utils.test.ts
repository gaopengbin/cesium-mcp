import { describe, it, expect } from 'vitest'
import { parseColor, validateCoordinate, resolveMaterial } from './utils.js'

describe('parseColor', () => {
  it('should parse CSS hex string', () => {
    const c = parseColor('#FF0000')
    expect(c.red).toBeCloseTo(1)
    expect(c.green).toBeCloseTo(0)
    expect(c.blue).toBeCloseTo(0)
    expect(c.alpha).toBeCloseTo(1)
  })

  it('should parse CSS named color', () => {
    const c = parseColor('blue')
    expect(c.red).toBeCloseTo(0)
    expect(c.green).toBeCloseTo(0)
    expect(c.blue).toBeCloseTo(1)
  })

  it('should parse CSS rgba string', () => {
    const c = parseColor('rgba(255, 128, 0, 0.5)')
    expect(c.red).toBeCloseTo(1)
    expect(c.green).toBeCloseTo(128 / 255, 1)
    expect(c.blue).toBeCloseTo(0)
    expect(c.alpha).toBeCloseTo(0.5)
  })

  it('should parse RGBA object', () => {
    const c = parseColor({ red: 0.5, green: 0.3, blue: 0.8 })
    expect(c.red).toBeCloseTo(0.5)
    expect(c.green).toBeCloseTo(0.3)
    expect(c.blue).toBeCloseTo(0.8)
    expect(c.alpha).toBeCloseTo(1.0)
  })

  it('should parse RGBA object with alpha', () => {
    const c = parseColor({ red: 1, green: 0, blue: 0, alpha: 0.25 })
    expect(c.red).toBeCloseTo(1)
    expect(c.green).toBeCloseTo(0)
    expect(c.blue).toBeCloseTo(0)
    expect(c.alpha).toBeCloseTo(0.25)
  })
})

describe('validateCoordinate', () => {
  it('should accept valid coordinates', () => {
    expect(() => validateCoordinate(116.4, 39.9)).not.toThrow()
    expect(() => validateCoordinate(-180, -90)).not.toThrow()
    expect(() => validateCoordinate(180, 90)).not.toThrow()
    expect(() => validateCoordinate(0, 0, 10000)).not.toThrow()
  })

  it('should reject longitude out of range', () => {
    expect(() => validateCoordinate(181, 0)).toThrow(RangeError)
    expect(() => validateCoordinate(-181, 0)).toThrow(RangeError)
  })

  it('should reject latitude out of range', () => {
    expect(() => validateCoordinate(0, 91)).toThrow(RangeError)
    expect(() => validateCoordinate(0, -91)).toThrow(RangeError)
  })

  it('should reject extreme negative height', () => {
    expect(() => validateCoordinate(0, 0, -13000)).toThrow(RangeError)
  })

  it('should accept height above threshold', () => {
    expect(() => validateCoordinate(0, 0, -12000)).not.toThrow()
    expect(() => validateCoordinate(0, 0, 0)).not.toThrow()
  })
})

describe('resolveMaterial', () => {
  it('should return WHITE for undefined input', () => {
    const m = resolveMaterial(undefined)
    expect(m).toBeTruthy()
  })

  it('should resolve CSS string to Color', () => {
    const m = resolveMaterial('#FF0000')
    expect((m as any).red).toBeCloseTo(1)
  })

  it('should resolve RGBA object to Color', () => {
    const m = resolveMaterial({ red: 0, green: 1, blue: 0 })
    expect((m as any).green).toBeCloseTo(1)
  })

  it('should resolve color MaterialSpec', () => {
    const m = resolveMaterial({ type: 'color', color: '#00FF00' })
    expect((m as any).green).toBeCloseTo(1)
  })

  it('should resolve image MaterialSpec', () => {
    const m = resolveMaterial({ type: 'image', image: 'test.png' })
    expect(m).toBeTruthy()
  })

  it('should resolve checkerboard MaterialSpec', () => {
    const m = resolveMaterial({ type: 'checkerboard', evenColor: '#FF0000', oddColor: '#0000FF' })
    expect(m).toBeTruthy()
  })

  it('should resolve stripe MaterialSpec', () => {
    const m = resolveMaterial({ type: 'stripe', orientation: 'vertical' })
    expect(m).toBeTruthy()
  })

  it('should resolve grid MaterialSpec', () => {
    const m = resolveMaterial({ type: 'grid', color: '#FFFFFF', cellAlpha: 0.5 })
    expect(m).toBeTruthy()
  })

  it('should return WHITE for unknown MaterialSpec type', () => {
    const m = resolveMaterial({ type: 'unknown' as any })
    expect(m).toBeTruthy()
  })
})
