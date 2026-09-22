import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeUrbanBuildingMesh } from './urban-building-mesh.js'
import { createUrbanNavigation } from './urban-navigation.js'
import { UrbanRouteFollower } from './urban-route-follower.js'
import { offsetGeoPoint } from './world-sensor.js'

const origin = { longitude: 139.764, latitude: 35.681, height: 38 }
const corner = offsetGeoPoint(origin, 0, 30)
const goal = offsetGeoPoint(origin, 30, 30)

describe('selected urban route tracking', () => {
  it('keeps the mission distance beyond the current corner and rejects a blocked shortcut', () => {
    const follower = new UrbanRouteFollower([origin, corner, goal], () => false)
    const guidance = follower.update(offsetGeoPoint(origin, 0, 26))
    expect(guidance.target).toEqual(corner)
    expect(guidance.remainingMeters).toBeGreaterThan(33)
    expect(guidance.waypointIndex).toBe(1)
  })

  it('finishes approaching a nearby corner until the next segment is clear', () => {
    const follower = new UrbanRouteFollower([origin, corner, goal], (from, to) => from === corner && to === goal)
    const guidance = follower.update(offsetGeoPoint(origin, 0, 29))
    expect(guidance.target).toEqual(corner)
    expect(guidance.remainingMeters).toBeGreaterThan(30)
    expect(guidance.waypointIndex).toBe(1)
    expect(follower.update(corner).target).toEqual(goal)
  })

  it('shortens only a checked visible segment of the selected corridor', () => {
    const follower = new UrbanRouteFollower([origin, corner, goal], (_from, to) => to === goal)
    expect(follower.update(origin).target).toEqual(goal)
    expect(follower.update(goal).remainingMeters).toBe(0)
  })

  it('retains the reachable Tokyo corner when the following leg would cut into building clearance', () => {
    const mesh = decodeUrbanBuildingMesh(Uint8Array.from(readFileSync(new URL('./assets/tokyo-buildings.bin', import.meta.url))).buffer)
    const navigation = createUrbanNavigation(mesh, { allowUnmappedTravel: true })
    const prior = { longitude: 139.76163919484128, latitude: 35.67617649171508, height: 38 }
    const corner = { longitude: 139.76163919589072, latitude: 35.67614945340336, height: 38 }
    const next = { longitude: 139.76168338047955, latitude: 35.676122416224956, height: 38 }
    // Recorded 80 m/s run stopped here while the model kept requesting advance.
    const position = { longitude: 139.76164470595648, latitude: 35.67615802319669, height: 38 }
    expect(navigation.validatePoint(position).valid).toBe(true)
    expect(navigation.isSegmentWalkable(position, corner)).toBe(true)
    expect(navigation.isSegmentWalkable(position, next)).toBe(false)
    const follower = new UrbanRouteFollower([prior, corner, next], navigation.isSegmentWalkable)
    expect(follower.update(position).target).toEqual(corner)
    expect(follower.update(corner).target).toEqual(next)
  })
})
