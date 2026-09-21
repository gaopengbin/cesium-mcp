import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Cartesian3, IntersectionTests } from 'cesium'
import { createUrbanNavigation } from '../src/urban-navigation.ts'

const started = performance.now()
const mesh = JSON.parse(await readFile(new URL('../src/assets/tokyo-colliders.json', import.meta.url), 'utf8'))
const parsedAt = performance.now()
const navigation = createUrbanNavigation(mesh)
const readyAt = performance.now()
const endpoints = (latitudes) => latitudes.flatMap(latitude => [139.7634, 139.7644, 139.7654, 139.7664].map(longitude => ({ longitude, latitude, height: 38 })))
  .map(point => {
    const validation = navigation.validatePoint(point)
    // Offline preset exploration only. User clicks never snap automatically.
    return validation.valid ? point : validation.nearestValidPoint
  }).filter(Boolean)
const southPoints = endpoints([35.677, 35.678])
const northPoints = endpoints([35.690, 35.691])
const routes = []
const searchTimingsMs = []
for (let index = 0; index < Math.min(12, southPoints.length * northPoints.length); index++) {
  const start = southPoints[index % southPoints.length]
  const goal = northPoints[(index * 3 + Math.floor(index / southPoints.length) + 1) % northPoints.length]
  const searchAt = performance.now()
  const candidates = navigation.planCandidates(start, goal)
  searchTimingsMs.push(performance.now() - searchAt)
  if (candidates.length) routes.push({ start, goal, candidates, searchMs: searchTimingsMs.at(-1) })
}
routes.sort((a, b) => Math.min(...a.candidates.map(candidate => candidate.lengthMeters)) - Math.min(...b.candidates.map(candidate => candidate.lengthMeters)))
const selected = routes.filter(route => Math.min(...route.candidates.map(candidate => candidate.lengthMeters)) >= 1_000).slice(0, 3)
const vertices = Array.from({ length: mesh.positions.length / 3 }, (_, index) => new Cartesian3(
  mesh.originEcef[0] + mesh.positions[index * 3], mesh.originEcef[1] + mesh.positions[index * 3 + 1], mesh.originEcef[2] + mesh.positions[index * 3 + 2],
))
const trianglePoints = []
for (let index = 0; index < mesh.indices.length; index += 3) trianglePoints.push([vertices[mesh.indices[index]], vertices[mesh.indices[index + 1]], vertices[mesh.indices[index + 2]]])
for (const route of selected) {
  let intersections = 0
  for (const candidate of route.candidates) {
    for (let index = 1; index < candidate.waypoints.length; index++) {
      const points = [candidate.waypoints[index - 1], candidate.waypoints[index]].map(point => Cartesian3.fromDegrees(point.longitude, point.latitude, 40))
      for (const triangle of trianglePoints) if (IntersectionTests.lineSegmentTriangle(...points, ...triangle, false)) intersections++
    }
  }
  route.actualMeshSegmentIntersections = intersections
}
const output = {
  coverageBbox: mesh.coverageBbox,
  sourceCounts: mesh.counts,
  grid: navigation.grid,
  performance: {
    readAndParseMs: parsedAt - started,
    createNavigationMs: readyAt - parsedAt,
    routeSearchCount: searchTimingsMs.length,
    routeSearchMeanMs: searchTimingsMs.reduce((sum, value) => sum + value, 0) / searchTimingsMs.length,
    routeSearchMaximumMs: Math.max(...searchTimingsMs),
    processRssBytes: process.memoryUsage().rss,
  },
  routes: selected,
}
const outputPath = resolve(process.argv[2] ?? '../../artifacts/urban-long-route-candidates.json')
await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({ ...output, routes: selected.map(route => ({ ...route, candidates: route.candidates.map(({ waypoints, ...candidate }) => ({ ...candidate, waypointCount: waypoints.length })) })) }, null, 2))
if (!selected.length || selected.some(route => route.actualMeshSegmentIntersections)) throw new Error('No verified kilometre-scale route')
