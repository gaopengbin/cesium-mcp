import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cartesian3, Cartographic, IntersectionTests, Math as CesiumMath, Matrix4, Transforms } from 'cesium'
import { createUrbanNavigation } from '../src/urban-navigation.ts'

// Offline audit only. It does not alter the scene, trajectory, or collision asset.
const inputPath = resolve(process.argv[2] ?? '../../artifacts/jev-detour-first-run.json')
const outputPath = resolve(process.argv[3] ?? '../../artifacts/jev-detour-first-run-mesh-audit.json')
const assetPath = fileURLToPath(new URL('../src/assets/tokyo-colliders.json', import.meta.url))
const [run, mesh] = await Promise.all([inputPath, assetPath].map(async path => JSON.parse(await readFile(path, 'utf8'))))
const usesDenseMotionSamples = Array.isArray(run.navigation.motionSamples) && run.navigation.motionSamples.length > 1
const frames = usesDenseMotionSamples
  ? run.navigation.motionSamples.map(sample => ({
    at: sample.at,
    position: Cartesian3.fromDegrees(sample.position.longitude, sample.position.latitude, sample.position.height),
  }))
  : run.replay.frames
const navigation = createUrbanNavigation(mesh)
const origin = Cartesian3.fromArray(mesh.originEcef)
const worldToLocal = Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(origin), new Matrix4())
const localToWorld = Matrix4.inverseTransformation(worldToLocal, new Matrix4())
const asCartesian = point => new Cartesian3(point.x, point.y, point.z)
const geographic = point => {
  const cartographic = Cartographic.fromCartesian(point)
  return { longitude: CesiumMath.toDegrees(cartographic.longitude), latitude: CesiumMath.toDegrees(cartographic.latitude), height: cartographic.height }
}
// Region tests for the closest point on a triangle (vertices, edges, then face).
function closestPointOnTriangle(point, { a, b, c }, output) {
  const ab = Cartesian3.subtract(b, a, new Cartesian3())
  const ac = Cartesian3.subtract(c, a, new Cartesian3())
  const ap = Cartesian3.subtract(point, a, new Cartesian3())
  const d1 = Cartesian3.dot(ab, ap)
  const d2 = Cartesian3.dot(ac, ap)
  if (d1 <= 0 && d2 <= 0) return Cartesian3.clone(a, output)
  const bp = Cartesian3.subtract(point, b, new Cartesian3())
  const d3 = Cartesian3.dot(ab, bp)
  const d4 = Cartesian3.dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return Cartesian3.clone(b, output)
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return Cartesian3.lerp(a, b, d1 / (d1 - d3), output)
  const cp = Cartesian3.subtract(point, c, new Cartesian3())
  const d5 = Cartesian3.dot(ab, cp)
  const d6 = Cartesian3.dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return Cartesian3.clone(c, output)
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return Cartesian3.lerp(a, c, d2 / (d2 - d6), output)
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return Cartesian3.lerp(b, c, (d4 - d3) / (d4 - d3 + d5 - d6), output)
  const denominator = 1 / (va + vb + vc)
  const v = vb * denominator
  const w = vc * denominator
  return Cartesian3.fromElements(a.x + ab.x * v + ac.x * w, a.y + ab.y * v + ac.y * w, a.z + ab.z * v + ac.z * w, output)
}
for (const [point, expected] of [[new Cartesian3(1, 1, 2), 2], [new Cartesian3(-1, -1, 0), Math.SQRT2], [new Cartesian3(2, 2, 0), Math.SQRT1_2]]) {
  const closest = closestPointOnTriangle(point, { a: new Cartesian3(0, 0, 0), b: new Cartesian3(3, 0, 0), c: new Cartesian3(0, 3, 0) }, new Cartesian3())
  if (Math.abs(Cartesian3.distance(point, closest) - expected) > 1e-10) throw new Error('Triangle closest-point fixture failed')
}
const vertices = []
for (let index = 0; index < mesh.positions.length; index += 3) {
  const world = new Cartesian3(origin.x + mesh.positions[index], origin.y + mesh.positions[index + 1], origin.z + mesh.positions[index + 2])
  const local = Matrix4.multiplyByPoint(worldToLocal, world, new Cartesian3())
  vertices.push(local)
}
const triangles = []
for (let index = 0; index < mesh.indices.length; index += 3) {
  const points = [0, 1, 2].map(corner => vertices[mesh.indices[index + corner]])
  triangles.push({
    index: index / 3,
    triangle: { a: points[0], b: points[1], c: points[2] },
    minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)),
    minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)),
  })
}
const componentDistance = (value, minimum, maximum) => value < minimum ? minimum - value : value > maximum ? value - maximum : 0
const squaredEdgeDistance = (point, a, b) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const denominator = dx * dx + dy * dy
  const t = denominator ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator)) : 0
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2
}
const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
const projectedSquaredDistance = (point, { a, b, c }) => {
  const signs = [cross(a, b, point), cross(b, c, point), cross(c, a, point)]
  if (Math.abs(cross(a, b, c)) > 1e-9 && (signs.every(v => v >= 0) || signs.every(v => v <= 0))) return 0
  return Math.min(squaredEdgeDistance(point, a, b), squaredEdgeDistance(point, b, c), squaredEdgeDistance(point, c, a))
}
const nearestToMesh = point => {
  let distance3dSquared = Infinity
  let projectionDistanceSquared = Infinity
  let triangleIndex = -1
  let projectedTriangleIndex = -1
  const closest = new Cartesian3()
  let closestPoint
  for (const item of triangles) {
    const dx = componentDistance(point.x, item.minX, item.maxX)
    const dy = componentDistance(point.y, item.minY, item.maxY)
    const dz = componentDistance(point.z, item.minZ, item.maxZ)
    if (dx * dx + dy * dy + dz * dz < distance3dSquared) {
      closestPointOnTriangle(point, item.triangle, closest)
      const value = Cartesian3.distanceSquared(closest, point)
      if (value < distance3dSquared) {
        distance3dSquared = value
        triangleIndex = item.index
        closestPoint = Cartesian3.clone(closest)
      }
    }
    if (dx * dx + dy * dy < projectionDistanceSquared) {
      const value = projectedSquaredDistance(point, item.triangle)
      if (value < projectionDistanceSquared) {
        projectionDistanceSquared = value
        projectedTriangleIndex = item.index
      }
    }
  }
  return { distance3dMeters: Math.sqrt(distance3dSquared), exactProjectionDistanceMeters: Math.sqrt(projectionDistanceSquared), triangleIndex, projectedTriangleIndex, closestPoint }
}

const samples = []
let maximumRecordedStepMeters = 0
let maximumRecordedIntervalMs = 0
let maximumInterpolatedStepMeters = 0
for (let index = 1; index < frames.length; index++) {
  const a = asCartesian(frames[index - 1].position)
  const b = asCartesian(frames[index].position)
  const length = Cartesian3.distance(a, b)
  maximumRecordedStepMeters = Math.max(maximumRecordedStepMeters, length)
  maximumRecordedIntervalMs = Math.max(maximumRecordedIntervalMs, frames[index].at - frames[index - 1].at)
  const count = Math.max(1, Math.ceil(length / 0.25))
  maximumInterpolatedStepMeters = Math.max(maximumInterpolatedStepMeters, length / count)
  for (let step = index === 1 ? 0 : 1; step <= count; step++) {
    const fraction = step / count
    const world = Cartesian3.lerp(a, b, fraction, new Cartesian3())
    const local = Matrix4.multiplyByPoint(worldToLocal, world, new Cartesian3())
    const point = geographic(world)
    const result = nearestToMesh(local)
    samples.push({
      precedingFrameIndex: index - 1, followingFrameIndex: index, fraction,
      at: frames[index - 1].at + (frames[index].at - frames[index - 1].at) * fraction,
      ...point,
      gridClearanceMeters: navigation.clearanceAt(point),
      ...result,
      closestPoint: geographic(Matrix4.multiplyByPoint(localToWorld, asCartesian(result.closestPoint), new Cartesian3())),
    })
  }
}
const intersections = []
// Query actual recorded segments and a parallel waist/head/low-body trace.
for (const height of ['recorded', 38.7, 39.5, 40]) {
  for (let index = 1; index < frames.length; index++) {
    const points = [frames[index - 1], frames[index]].map(frame => {
      const world = asCartesian(frame.position)
      const geo = geographic(world)
      return Matrix4.multiplyByPoint(worldToLocal, height === 'recorded' ? world : Cartesian3.fromDegrees(geo.longitude, geo.latitude, height), new Cartesian3())
    })
    if (Cartesian3.distanceSquared(points[0], points[1]) < 1e-14) continue
    const segmentBounds = {
      minX: Math.min(points[0].x, points[1].x), maxX: Math.max(points[0].x, points[1].x),
      minY: Math.min(points[0].y, points[1].y), maxY: Math.max(points[0].y, points[1].y),
      minZ: Math.min(points[0].z, points[1].z), maxZ: Math.max(points[0].z, points[1].z),
    }
    for (const item of triangles) {
      if (item.maxX < segmentBounds.minX || item.minX > segmentBounds.maxX
        || item.maxY < segmentBounds.minY || item.minY > segmentBounds.maxY
        || item.maxZ < segmentBounds.minZ || item.minZ > segmentBounds.maxZ) continue
      const { a, b, c } = item.triangle
      const hit = IntersectionTests.lineSegmentTriangle(points[0], points[1], a, b, c, false)
      if (hit) intersections.push({ height, precedingFrameIndex: index - 1, followingFrameIndex: index, triangleIndex: item.index, position: geographic(Matrix4.multiplyByPoint(localToWorld, hit, new Cartesian3())) })
    }
  }
}
const minimum3d = samples.reduce((a, b) => a.distance3dMeters < b.distance3dMeters ? a : b)
const minimumProjection = samples.reduce((a, b) => a.exactProjectionDistanceMeters < b.exactProjectionDistanceMeters ? a : b)
const zeroGridSamples = samples.filter(sample => sample.gridClearanceMeters === 0)
const fullBodyRadiusMeters = 0.3
const fullBodyBottomHeight = 38
const fullBodyTopHeight = 39.8
// A ball about the recorded physics centre encloses a vertical 1.8 m cylinder
// with radius 0.3 m. This is stricter than the actual 1.4 m collision capsule.
const fullBodyBoundingRadiusMeters = Math.max(...samples.map(sample => Math.hypot(
  fullBodyRadiusMeters, Math.max(Math.abs(sample.height - fullBodyBottomHeight), Math.abs(sample.height - fullBodyTopHeight)),
)))
const samplingUncertaintyMeters = maximumInterpolatedStepMeters / 2
const polylineClearanceLowerBound = Math.max(0, minimum3d.distance3dMeters - samplingUncertaintyMeters)
const output = {
  inputPath, assetPath,
  method: 'Original PLATEAU ECEF triangles transformed to ENU; Cesium segment/triangle intersections independent of the navigation grid; triangle closest-point region tests sampled every <= 0.25 m on the recorded polyline; exact triangle XY projection distances without grid rasterization.',
  trajectorySource: usesDenseMotionSamples ? 'navigation.motionSamples (20 Hz control loop)' : 'replay.frames (sparse display history)',
  limitations: 'The audit proves facts about the interpolated recorded polyline. The 3D lower bound subtracts half the largest interpolation step for distance between audit samples; it cannot cover unrecorded curved excursions between source records.',
  closestPointFixturesPassed: true,
  capsuleBoundNote: 'Current controller defaults at scale 0.01: radius 0.3 m, cylindrical half-height 0.4 m; the entire capsule lies within a 0.7 m ball about its recorded centre.',
  frameCount: frames.length, interpolatedSampleCount: samples.length, maximumRecordedStepMeters, maximumRecordedIntervalMs, maximumInterpolatedStepMeters,
  originalReportedGridMinimumMeters: run.navigation.minimumBuildingClearanceMeters,
  minimumRecordedPolylineToMeshMeters: minimum3d.distance3dMeters,
  conservativePolylineToMeshLowerBoundMeters: polylineClearanceLowerBound,
  fullBody: {
    model: 'Conservative vertical cylinder, 1.8 m tall and 0.3 m radius, from ellipsoid height 38 m to 39.8 m; enclosed in a ball about each actual physics centre.',
    fullBodyBoundingRadiusMeters,
    minimumConservativeSurfaceClearanceMeters: polylineClearanceLowerBound - fullBodyBoundingRadiusMeters,
    intersectsAnyTriangleOnRecordedPolyline: polylineClearanceLowerBound <= fullBodyBoundingRadiusMeters ? 'Not excluded by this bound; inspect further' : false,
  },
  minimumRecordedPolylineProjectionDistanceMeters: minimumProjection.exactProjectionDistanceMeters,
  zeroGridSampleCount: zeroGridSamples.length,
  minimum3dSample: minimum3d,
  minimumProjectionSample: minimumProjection,
  zeroGridSamples,
  intersections,
}
await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({ outputPath, ...Object.fromEntries(Object.entries(output).filter(([key]) => !['zeroGridSamples', 'method', 'limitations', 'assetPath', 'inputPath'].includes(key))) }, null, 2))
