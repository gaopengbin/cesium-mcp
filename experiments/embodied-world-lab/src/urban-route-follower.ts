import { distanceMeters } from './world-sensor.js'
import type { GeoPoint } from './world-sensor.js'

/** Tracks only the corridor already selected by Jev, never chooses its side. */
export class UrbanRouteFollower {
  private index = 1

  constructor(
    readonly waypoints: GeoPoint[],
    private readonly segmentIsClear: (from: GeoPoint, to: GeoPoint) => boolean,
  ) {
    if (waypoints.length < 2) throw new Error('A navigation corridor needs at least two points')
  }

  update(position: GeoPoint) {
    const last = this.waypoints.length - 1
    // Being close to a corner does not make the following leg visible: every
    // skipped waypoint must preserve the same building clearance as the route.
    for (let candidate = last; candidate > this.index; candidate -= 1) {
      if (this.segmentIsClear(position, this.waypoints[candidate])) {
        this.index = candidate
        break
      }
    }
    let remainingMeters = distanceMeters(position, this.waypoints[this.index])
    for (let i = this.index; i < last; i += 1) {
      remainingMeters += distanceMeters(this.waypoints[i], this.waypoints[i + 1])
    }
    return { target: this.waypoints[this.index], waypointIndex: this.index, remainingMeters }
  }
}
