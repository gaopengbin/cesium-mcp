import { describe, expect, it } from 'vitest'
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

  it('advances the tracking point at a corner without changing the selected route', () => {
    const follower = new UrbanRouteFollower([origin, corner, goal], () => false)
    const guidance = follower.update(offsetGeoPoint(origin, 0, 29))
    expect(guidance.target).toEqual(goal)
    expect(guidance.remainingMeters).toBeGreaterThan(29)
    expect(guidance.waypointIndex).toBe(2)
  })

  it('shortens only a checked visible segment of the selected corridor', () => {
    const follower = new UrbanRouteFollower([origin, corner, goal], (from, to) => from === corner && to === goal)
    expect(follower.update(corner).target).toEqual(goal)
    expect(follower.update(goal).remainingMeters).toBe(0)
  })
})
