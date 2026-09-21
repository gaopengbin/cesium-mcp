import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { Cartesian3, IntersectionTests } from 'cesium'
import { createUrbanNavigation } from '../src/urban-navigation.ts'

const mesh = JSON.parse(await readFile(new URL('../src/assets/tokyo-colliders.json', import.meta.url), 'utf8'))
const navigation = createUrbanNavigation(mesh)
const points = []
for (let x = 0; x < 18; x++) {
  for (let y = 0; y < 18; y++) {
    const point = { longitude: 139.76345 + x * 0.00015, latitude: 35.67945 + y * 0.0002, height: 38 }
    if (navigation.validatePoint(point).valid) points.push(point)
  }
}
let state = 260921
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0
  return state / 4294967296
}
const pairs = []
const seen = new Set()
for (let attempt = 0; attempt < 400; attempt++) {
  const a = Math.floor(random() * points.length)
  const b = Math.floor(random() * points.length)
  const key = [a, b].sort((x, y) => x - y).join('-')
  if (a === b || seen.has(key)) continue
  seen.add(key)
  const start = points[a]
  const goal = points[b]
  const directDistanceMeters = Cartesian3.distance(Cartesian3.fromDegrees(start.longitude, start.latitude, 38), Cartesian3.fromDegrees(goal.longitude, goal.latitude, 38))
  if (directDistanceMeters < 110 || directDistanceMeters > 320) continue
  const candidates = navigation.planCandidates(start, goal)
  if (!candidates.length || candidates.some(candidate => candidate.id === 'direct')) continue
  const shortest = Math.min(...candidates.map(candidate => candidate.lengthMeters))
  if (shortest < 170 || shortest > 400) continue
  pairs.push({ start, goal, directDistanceMeters, candidates })
}
pairs.sort((a, b) => {
  const score = pair => Math.min(...pair.candidates.map(candidate => candidate.waypoints.length)) * 50 - Math.min(...pair.candidates.map(candidate => candidate.lengthMeters)) / 8
  return score(b) - score(a)
})
const selected = []
for (const pair of pairs) {
  if (selected.some(previous => Math.abs(previous.start.longitude - pair.start.longitude) < 0.0003 && Math.abs(previous.start.latitude - pair.start.latitude) < 0.0003)) continue
  selected.push(pair)
  if (selected.length === 4) break
}
const trianglePoints = [new Cartesian3(), new Cartesian3(), new Cartesian3()]
function segmentHitDistances(from, to) {
  const start = Cartesian3.fromDegrees(from.longitude, from.latitude, 40)
  const end = Cartesian3.fromDegrees(to.longitude, to.latitude, 40)
  const distances = []
  for (let index = 0; index < mesh.indices.length; index += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const offset = mesh.indices[index + corner] * 3
      Cartesian3.fromElements(mesh.originEcef[0] + mesh.positions[offset], mesh.originEcef[1] + mesh.positions[offset + 1], mesh.originEcef[2] + mesh.positions[offset + 2], trianglePoints[corner])
    }
    const hit = IntersectionTests.lineSegmentTriangle(start, end, ...trianglePoints, false)
    if (hit) distances.push(Cartesian3.distance(start, hit))
  }
  return distances.sort((a, b) => a - b).filter((value, index, all) => index === 0 || value - all[index - 1] > 0.25)
}
for (const pair of selected) {
  pair.directMeshCrossingsMeters = segmentHitDistances(pair.start, pair.goal)
  pair.candidateMeshSegmentIntersections = 0
  for (const candidate of pair.candidates) {
    for (let index = 1; index < candidate.waypoints.length; index++) {
      pair.candidateMeshSegmentIntersections += segmentHitDistances(candidate.waypoints[index - 1], candidate.waypoints[index]).length
    }
  }
}
const output = {
  sourceAsset: fileURLToPath(new URL('../src/assets/tokyo-colliders.json', import.meta.url)),
  seed: 260921,
  validSamplePoints: points.length,
  evaluatedUniquePairs: seen.size,
  note: 'Real mesh geometric routes; no promise of legal pedestrian crossing, road classification, or unrecorded scene obstacles. Mesh crossings are distinct wall intersections, not a building count.',
  pairs: selected,
}
const outputPath = resolve(process.argv[2] ?? '../../artifacts/urban-free-route-candidates.json')
await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({ outputPath, ...output, pairs: selected.map(pair => ({ ...pair, candidates: pair.candidates.map(({ waypoints, ...candidate }) => ({ ...candidate, pointCount: waypoints.length })) })) }, null, 2))
