import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { insideUrbanCoverage, URBAN_COLLISION_BOUNDS, URBAN_GOAL, URBAN_START } from './urban-scene.js'

describe('urban collision coverage', () => {
  it('keeps the observed road endpoints and the 32m sensor fan inside prepared geometry', () => {
    expect(insideUrbanCoverage(URBAN_START, 34)).toBe(true)
    expect(insideUrbanCoverage(URBAN_GOAL, 34)).toBe(true)
  })

  it('does not permit navigation into unprepared parts of the visible city', () => {
    const [west, south, east, north] = URBAN_COLLISION_BOUNDS
    const longitude = (west + east) / 2
    const latitude = (south + north) / 2
    for (const point of [
      { longitude: west - 0.0001, latitude, height: 38 },
      { longitude: east + 0.0001, latitude, height: 38 },
      { longitude, latitude: south - 0.0001, height: 38 },
      { longitude, latitude: north + 0.0001, height: 38 },
    ]) expect(insideUrbanCoverage(point)).toBe(false)
    const latitudeMargin = 34 / 111_320
    const longitudeMargin = latitudeMargin / Math.cos(latitude * Math.PI / 180)
    for (const point of [
      { longitude: west + longitudeMargin / 2, latitude, height: 38 },
      { longitude: east - longitudeMargin / 2, latitude, height: 38 },
      { longitude, latitude: south + latitudeMargin / 2, height: 38 },
      { longitude, latitude: north - latitudeMargin / 2, height: 38 },
    ]) {
      expect(insideUrbanCoverage(point)).toBe(true)
      expect(insideUrbanCoverage(point, 34)).toBe(false)
    }
    expect(insideUrbanCoverage({ longitude: NaN, latitude: 35.681, height: 38 })).toBe(false)
  })

  it('accepts the newly prepared northern district and matches the collision asset bounds', () => {
    expect(insideUrbanCoverage({ longitude: 139.7644, latitude: 35.69, height: 38 }, 34)).toBe(true)
    const mesh = JSON.parse(readFileSync(new URL('./assets/tokyo-colliders.json', import.meta.url), 'utf8'))
    expect(mesh.coverageBbox).toEqual([...URBAN_COLLISION_BOUNDS])
  })
})
