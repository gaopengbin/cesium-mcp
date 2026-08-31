import type {
  SpatialBounds,
  SpatialCoordinate,
  SpatialGeometry,
} from './types.js'

const EARTH_RADIUS_METERS = 6371008.8

export function geometryCoordinates(geometry: SpatialGeometry): SpatialCoordinate[] {
  if (geometry.type === 'Point') return [geometry.coordinates]
  if (geometry.type === 'LineString') return geometry.coordinates
  return geometry.coordinates.flat()
}

export function geometryBounds(geometry: SpatialGeometry): SpatialBounds | undefined {
  return coordinatesBounds(geometryCoordinates(geometry))
}

export function coordinatesBounds(
  coordinates: readonly SpatialCoordinate[],
): SpatialBounds | undefined {
  if (coordinates.length === 0) return undefined
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY
  for (const coordinate of coordinates) {
    west = Math.min(west, coordinate[0])
    south = Math.min(south, coordinate[1])
    east = Math.max(east, coordinate[0])
    north = Math.max(north, coordinate[1])
  }
  return [west, south, east, north]
}

export function geometryCentroid(geometry: SpatialGeometry): SpatialCoordinate | undefined {
  if (geometry.type === 'Point') return [...geometry.coordinates] as SpatialCoordinate
  const coordinates = geometryCoordinates(geometry)
  if (coordinates.length === 0) return undefined
  let longitude = 0
  let latitude = 0
  let height = 0
  let heightCount = 0
  for (const coordinate of coordinates) {
    longitude += coordinate[0]
    latitude += coordinate[1]
    if (coordinate[2] !== undefined) {
      height += coordinate[2]
      heightCount += 1
    }
  }
  const centroid: SpatialCoordinate = [
    longitude / coordinates.length,
    latitude / coordinates.length,
  ]
  if (heightCount > 0) centroid.push(height / heightCount)
  return centroid
}

export function mergeBounds(
  left: SpatialBounds | undefined,
  right: SpatialBounds | undefined,
): SpatialBounds | undefined {
  if (!left) return right ? [...right] : undefined
  if (!right) return [...left]
  return [
    Math.min(left[0], right[0]),
    Math.min(left[1], right[1]),
    Math.max(left[2], right[2]),
    Math.max(left[3], right[3]),
  ]
}

export function boundsIntersect(left: SpatialBounds, right: SpatialBounds): boolean {
  return !(left[2] < right[0] || left[0] > right[2] ||
    left[3] < right[1] || left[1] > right[3])
}

export function boundsContain(container: SpatialBounds, candidate: SpatialBounds): boolean {
  return container[0] <= candidate[0] && container[1] <= candidate[1] &&
    container[2] >= candidate[2] && container[3] >= candidate[3]
}

export function pointInPolygon(
  point: SpatialCoordinate,
  polygon: Extract<SpatialGeometry, { type: 'Polygon' }>,
): boolean {
  const outer = polygon.coordinates[0]
  if (!outer || !pointInRing(point, outer)) return false
  for (let index = 1; index < polygon.coordinates.length; index++) {
    const hole = polygon.coordinates[index]
    if (hole && pointInRing(point, hole)) return false
  }
  return true
}

function pointInRing(point: SpatialCoordinate, ring: readonly SpatialCoordinate[]): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index]
    const previousPoint = ring[previous]
    if (!currentPoint || !previousPoint) continue
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1])) &&
      point[0] < (previousPoint[0] - currentPoint[0]) *
      (point[1] - currentPoint[1]) /
      (previousPoint[1] - currentPoint[1]) + currentPoint[0]
    if (intersects) inside = !inside
  }
  return inside
}

export function haversineDistanceMeters(
  left: SpatialCoordinate,
  right: SpatialCoordinate,
): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const deltaLatitude = toRadians(right[1] - left[1])
  const deltaLongitude = toRadians(right[0] - left[0])
  const leftLatitude = toRadians(left[1])
  const rightLatitude = toRadians(right[1])
  const a = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) *
    Math.sin(deltaLongitude / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
