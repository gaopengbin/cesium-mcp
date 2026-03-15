import { describe, it, expect } from 'vitest'
import { parseColor, validateCoordinate } from './utils.js'

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
