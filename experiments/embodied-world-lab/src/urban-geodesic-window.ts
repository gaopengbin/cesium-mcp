import { distanceMeters } from './world-sensor.js'
import type { GeoPoint } from './world-sensor.js'

const toRadians = (degrees: number) => degrees * Math.PI / 180

/** Stable great-circle interpolation, including a deterministic antipodal arc. */
export function interpolateUrbanGeodesic(from: GeoPoint, to: GeoPoint, fraction: number): GeoPoint {
  if (fraction <= 0) return { ...from }
  if (fraction >= 1) return { ...to }
  const unit = (point: GeoPoint) => {
    const latitude = toRadians(point.latitude)
    const longitude = toRadians(point.longitude)
    return [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)]
  }
  const a = unit(from)
  const b = unit(to)
  const dot = Math.max(-1, Math.min(1, a.reduce((sum, value, i) => sum + value * b[i], 0)))
  let tangent = b.map((value, i) => value - dot * a[i])
  let magnitude = Math.hypot(...tangent)
  // acos(dot) rounds very short routes to zero. atan2 retains the small
  // perpendicular component while still selecting the shorter global arc.
  const angle = Math.atan2(magnitude, dot)
  if (angle < 1e-12) return { ...from, height: from.height + (to.height - from.height) * fraction }
  if (magnitude < 1e-10) {
    // Exact antipodes have no unique shortest arc. Pick one, without NaN poles.
    const axis = Math.abs(a[2]) < 0.8 ? [0, 0, 1] : [1, 0, 0]
    const projection = axis.reduce((sum, value, i) => sum + value * a[i], 0)
    tangent = axis.map((value, i) => value - projection * a[i])
    magnitude = Math.hypot(...tangent)
  }
  const point = a.map((value, i) => value * Math.cos(angle * fraction) + tangent[i] / magnitude * Math.sin(angle * fraction))
  return {
    longitude: Math.atan2(point[1], point[0]) * 180 / Math.PI,
    latitude: Math.atan2(point[2], Math.hypot(point[0], point[1])) * 180 / Math.PI,
    height: from.height + (to.height - from.height) * fraction,
  }
}

/** Only these bounded windows need local building tests; never sample a global route metre by metre. */
export function urbanGeodesicWindows(from: GeoPoint, to: GeoPoint, center: GeoPoint, radiusMeters: number): Array<{ from: GeoPoint, to: GeoPoint }> {
  const total = distanceMeters(from, to)
  const steps = Math.max(1, Math.ceil(total / 25_000))
  const stepMeters = total / steps
  const windows: Array<{ from: GeoPoint, to: GeoPoint }> = []
  let openStart: number | undefined
  for (let index = 0; index < steps; index++) {
    const midpoint = interpolateUrbanGeodesic(from, to, (index + 0.5) / steps)
    const nearby = distanceMeters(midpoint, center) <= radiusMeters + stepMeters / 2 + 1
    if (nearby && openStart === undefined) openStart = index
    if (!nearby && openStart !== undefined) {
      windows.push({ from: interpolateUrbanGeodesic(from, to, openStart / steps), to: interpolateUrbanGeodesic(from, to, index / steps) })
      openStart = undefined
    }
  }
  if (openStart !== undefined) windows.push({ from: interpolateUrbanGeodesic(from, to, openStart / steps), to: { ...to } })
  return windows
}
