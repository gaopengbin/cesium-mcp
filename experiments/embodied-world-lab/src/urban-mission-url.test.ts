import { describe, expect, it } from 'vitest'
import type { GeoPoint } from './world-sensor.js'
import { readUrbanMission, writeUrbanMission } from './urban-mission-url.js'

const start: GeoPoint = { longitude: 139.7644304867143, latitude: 35.6806899057563, height: 38 }
const goal: GeoPoint = { longitude: 139.765004905462, latitude: 35.68068990591043, height: 38 }

describe('readUrbanMission', () => {
  it('leaves the default mission available when both coordinates are absent', () => {
    expect(readUrbanMission(new URLSearchParams('scene=city&planner=jev'))).toBeUndefined()
  })

  it('reads longitude before latitude and fixes the mission height at 38 metres', () => {
    const mission = readUrbanMission(new URLSearchParams({ from: '139.7644305,35.6806899', to: ' 139.7650049 , 35.6806899 ' }))
    expect(mission).toEqual({
      start: { longitude: 139.7644305, latitude: 35.6806899, height: 38 },
      goal: { longitude: 139.7650049, latitude: 35.6806899, height: 38 },
    })
  })

  it.each([
    ['-180,-90', '180,90'],
    ['0,0', '-0,0'],
  ])('accepts valid WGS84 boundary coordinates: %s to %s', (from, to) => {
    const mission = readUrbanMission(new URLSearchParams({ from, to }))
    expect(mission?.start.height).toBe(38)
    expect(mission?.goal.height).toBe(38)
  })

  it.each([
    'from=139,35',
    'to=139,35',
    'from=&to=139,35',
    'from=139,35&to=',
    'from=139,35&from=140,36&to=139,35',
    'from=139,35&to=139,35&to=140,36',
  ])('rejects partial, empty or ambiguous missions atomically: %s', query => {
    expect(() => readUrbanMission(new URLSearchParams(query))).toThrow(/地图任务/)
  })

  it.each([
    '139',
    '139,35,38',
    '139;35',
    ',35',
    '139,',
    'NaN,35',
    'Infinity,35',
    '0x8b,35',
    '1e2,35',
    '139x,35',
    '180.0000001,0',
    '-180.0000001,0',
    '0,90.0000001',
    '0,-90.0000001',
  ])('rejects malformed or out-of-range coordinates on either side: %s', invalid => {
    expect(() => readUrbanMission(new URLSearchParams({ from: invalid, to: '139,35' }))).toThrow(/地图任务/)
    expect(() => readUrbanMission(new URLSearchParams({ from: '139,35', to: invalid }))).toThrow(/地图任务/)
  })
})

describe('writeUrbanMission', () => {
  it('round-trips a mission rounded to at most seven decimal places', () => {
    const result = writeUrbanMission(new URL('https://example.test/demo'), start, goal)
    expect(result.searchParams.get('from')).toBe('139.7644305,35.6806899')
    expect(result.searchParams.get('to')).toBe('139.7650049,35.6806899')
    expect(readUrbanMission(result.searchParams)).toEqual({
      start: { longitude: 139.7644305, latitude: 35.6806899, height: 38 },
      goal: { longitude: 139.7650049, latitude: 35.6806899, height: 38 },
    })
  })

  it('clones the URL, preserves unrelated query values and hash, and selects city Jev', () => {
    const original = new URL('https://example.test/demo?scene=inspection&planner=baseline&seed=17&tag=a&tag=b&from=1,2&to=3,4#map')
    const before = original.href
    const result = writeUrbanMission(original, start, goal)
    expect(result).not.toBe(original)
    expect(original.href).toBe(before)
    expect(result.pathname).toBe('/demo')
    expect(result.hash).toBe('#map')
    expect(result.searchParams.get('scene')).toBe('city')
    expect(result.searchParams.get('planner')).toBe('jev')
    expect(result.searchParams.get('seed')).toBe('17')
    expect(result.searchParams.getAll('tag')).toEqual(['a', 'b'])
    expect(result.searchParams.getAll('from')).toHaveLength(1)
    expect(result.searchParams.getAll('to')).toHaveLength(1)
    expect(start.height).toBe(38)
    expect(goal.height).toBe(38)
  })

  it('omits redundant trailing zeroes, normalizes negative zero, and discards source heights', () => {
    const result = writeUrbanMission(new URL('https://example.test'),
      { longitude: -0.00000001, latitude: 35.5, height: 125 },
      { longitude: 139, latitude: 0, height: -10 },
    )
    expect(result.searchParams.get('from')).toBe('0,35.5')
    expect(result.searchParams.get('to')).toBe('139,0')
    expect(readUrbanMission(result.searchParams)?.start.height).toBe(38)
  })

  it('keeps seven-decimal coordinates near zero in readable decimal notation', () => {
    const tinyPoint = { longitude: -0.0000001, latitude: 0.0000001, height: 38 }
    const result = writeUrbanMission(new URL('https://example.test'), tinyPoint, goal)
    expect(result.searchParams.get('from')).toBe('-0.0000001,0.0000001')
    expect(readUrbanMission(result.searchParams)?.start).toEqual(tinyPoint)
  })

  it.each([
    { longitude: Number.NaN, latitude: 35, height: 38 },
    { longitude: 139, latitude: Number.POSITIVE_INFINITY, height: 38 },
    { longitude: 181, latitude: 35, height: 38 },
    { longitude: 139, latitude: -91, height: 38 },
  ])('rejects invalid runtime points without changing the input URL', invalid => {
    const original = new URL('https://example.test/?scene=city&seed=4')
    const before = original.href
    expect(() => writeUrbanMission(original, invalid, goal)).toThrow(/地图任务/)
    expect(() => writeUrbanMission(original, start, invalid)).toThrow(/地图任务/)
    expect(original.href).toBe(before)
  })
})
