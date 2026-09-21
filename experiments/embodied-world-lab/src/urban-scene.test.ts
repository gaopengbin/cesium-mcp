import { describe, expect, it } from 'vitest'
import { insideUrbanCoverage, URBAN_GOAL, URBAN_START } from './urban-scene.js'

describe('urban collision coverage', () => {
  it('keeps the observed road endpoints and the 32m sensor fan inside prepared geometry', () => {
    expect(insideUrbanCoverage(URBAN_START, 34)).toBe(true)
    expect(insideUrbanCoverage(URBAN_GOAL, 34)).toBe(true)
  })

  it('does not permit navigation into unprepared parts of the visible city', () => {
    expect(insideUrbanCoverage({ longitude: 139.7629, latitude: 35.681, height: 38 })).toBe(false)
    expect(insideUrbanCoverage({ longitude: 139.7664, latitude: 35.681, height: 38 }, 34)).toBe(false)
    expect(insideUrbanCoverage({ longitude: NaN, latitude: 35.681, height: 38 })).toBe(false)
  })
})
