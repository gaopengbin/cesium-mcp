import { Cartesian3, Cartographic, Math as CesiumMath, Matrix4, Transforms } from 'cesium'
import type { GeoPoint } from './world-sensor.js'

export interface UrbanNavigationMesh {
  originEcef: [number, number, number]
  positions: ArrayLike<number>
  indices: ArrayLike<number>
  coverageBbox: [number, number, number, number]
}

export interface UrbanRouteCandidate {
  id: 'left' | 'right' | 'direct' | 'detour'
  feasible: true
  waypoints: GeoPoint[]
  lengthMeters: number
  minimumClearanceMeters: number
}

export interface UrbanPointValidation {
  valid: boolean
  reason: 'valid' | 'invalid-coordinate' | 'outside-coverage' | 'boundary-margin' | 'near-building'
  /** Lower bound from the conservative raster, not exact distance to a wall. */
  clearanceMeters: number
  coverageClearanceMeters: number
  /** Suggestion only: callers must explicitly offer it, never silently move a click. */
  nearestValidPoint?: GeoPoint
  nearestDistanceMeters?: number
}

export interface UrbanNavigationChallenge {
  start: GeoPoint
  goal: GeoPoint
  directDistanceMeters: number
  directMeshHitDistanceMeters: number
  candidates: UrbanRouteCandidate[]
}

export interface UrbanNavigation {
  defaultChallenge: UrbanNavigationChallenge
  coverageBbox: [number, number, number, number]
  grid: { cellSizeMeters: number, width: number, height: number, occupiedCells: number }
  planCandidates(start: GeoPoint, goal: GeoPoint): UrbanRouteCandidate[]
  validatePoint(point: GeoPoint): UrbanPointValidation
  clearanceAt(point: GeoPoint): number
  coverageClearanceAt(point: GeoPoint): number
  isSegmentWalkable(from: GeoPoint, to: GeoPoint): boolean
}

interface Point { x: number, y: number }
interface Component { minX: number, minY: number, maxX: number, maxY: number, cells: number }

/** Conservative building projection for candidate generation, not Jev's own route planner. */
export function createUrbanNavigation(
  mesh: UrbanNavigationMesh,
  options: { cellSizeMeters?: number, vehicleRadiusMeters?: number, coverageMarginMeters?: number } = {},
): UrbanNavigation {
  // Two-metre cells over-inflate narrow street connections even when a route
  // satisfies the unchanged two-metre clearance. Keep finer geometry here,
  // rather than lowering the safety radius or permitting diagonal corner cuts.
  const cell = options.cellSizeMeters ?? 1
  const radius = options.vehicleRadiusMeters ?? 2
  const margin = options.coverageMarginMeters ?? 34
  if (!Number.isFinite(cell) || cell < 1 || cell > 5 || !Number.isFinite(radius) || radius < 0
    || !Number.isFinite(margin) || margin < 0 || mesh.positions.length % 3 || mesh.indices.length % 3) {
    throw new Error('Invalid urban navigation geometry or grid settings')
  }
  const origin = Cartesian3.fromArray(mesh.originEcef)
  const toWorld = Transforms.eastNorthUpToFixedFrame(origin)
  const toLocal = Matrix4.inverseTransformation(toWorld, new Matrix4())
  const halfDiagonal = cell / Math.SQRT2
  const groundHeight = 38
  const hasValidCoordinates = (point: GeoPoint) => [point.longitude, point.latitude, point.height].every(Number.isFinite)
    && Math.abs(point.longitude) <= 180 && Math.abs(point.latitude) <= 90
  const [west, south, east, north] = mesh.coverageBbox
  const localPoint = (point: GeoPoint): Point => {
    const p = Matrix4.multiplyByPoint(toLocal, Cartesian3.fromDegrees(point.longitude, point.latitude, point.height), new Cartesian3())
    return { x: p.x, y: p.y }
  }
  const geographicPoint = (point: Point): GeoPoint => {
    const p = Cartographic.fromCartesian(Matrix4.multiplyByPoint(toWorld, new Cartesian3(point.x, point.y, 0), new Cartesian3()))
    return { longitude: CesiumMath.toDegrees(p.longitude), latitude: CesiumMath.toDegrees(p.latitude), height: groundHeight }
  }
  const corners = [[west, south], [east, south], [west, north], [east, north]]
    .map(([longitude, latitude]) => localPoint({ longitude, latitude, height: groundHeight }))
  const minX = Math.min(...corners.map(p => p.x)) + margin + 0.5
  const minY = Math.min(...corners.map(p => p.y)) + margin + 0.5
  const width = Math.floor((Math.max(...corners.map(p => p.x)) - margin - 0.5 - minX) / cell)
  const height = Math.floor((Math.max(...corners.map(p => p.y)) - margin - 0.5 - minY) / cell)
  if (width < 8 || height < 8 || width * height > 2_000_000) throw new Error('Navigation coverage is too small or too large')
  const count = width * height
  const occupied = new Uint8Array(count)
  const center = (index: number): Point => ({ x: minX + (index % width + 0.5) * cell, y: minY + (Math.floor(index / width) + 0.5) * cell })
  const indexAt = (point: Point): number => {
    const x = Math.floor((point.x - minX) / cell)
    const y = Math.floor((point.y - minY) / cell)
    return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x
  }
  const vertices = new Float64Array(mesh.positions.length)
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] + origin.x
    const y = mesh.positions[i + 1] + origin.y
    const z = mesh.positions[i + 2] + origin.z
    vertices[i] = toLocal[0] * x + toLocal[4] * y + toLocal[8] * z + toLocal[12]
    vertices[i + 1] = toLocal[1] * x + toLocal[5] * y + toLocal[9] * z + toLocal[13]
    vertices[i + 2] = toLocal[2] * x + toLocal[6] * y + toLocal[10] * z + toLocal[14]
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = [0, 1, 2].map(offset => {
      const index = mesh.indices[i + offset] * 3
      if (index < 0 || index + 2 >= vertices.length) throw new Error('Invalid mesh index')
      return { x: vertices[index], y: vertices[index + 1] }
    })
    const x0 = Math.max(0, Math.floor((Math.min(...triangle.map(p => p.x)) - minX) / cell))
    const x1 = Math.min(width - 1, Math.floor((Math.max(...triangle.map(p => p.x)) - minX) / cell))
    const y0 = Math.max(0, Math.floor((Math.min(...triangle.map(p => p.y)) - minY) / cell))
    const y1 = Math.min(height - 1, Math.floor((Math.max(...triangle.map(p => p.y)) - minY) / cell))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const index = y * width + x
        if (!occupied[index] && triangleIntersectsCell(triangle, minX + x * cell, minY + y * cell, cell)) occupied[index] = 1
      }
    }
  }
  const components = findComponents(occupied, width, height)
  // Coverage is an obstacle boundary too: do not route into unprepared geometry.
  for (let x = 0; x < width; x++) occupied[x] = occupied[(height - 1) * width + x] = 1
  for (let y = 0; y < height; y++) occupied[y * width] = occupied[y * width + width - 1] = 1
  const squaredDistance = distanceTransform(occupied, width, height)
  const walkable = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    // All points in a free cell have >= radius clearance from occupied cell squares.
    walkable[i] = Math.sqrt(squaredDistance[i]) * cell >= radius + 2 * halfDiagonal + 0.05 ? 1 : 0
  }
  // Connectivity is fixed for this prepared district. Reject disconnected clicks
  // before running multiple full-grid searches in a kilometre-scale scene.
  const freeRegions = labelFreeRegions(walkable, width, height)
  const localClearance = (point: Point): number => {
    const index = indexAt(point)
    if (index < 0 || occupied[index]) return 0
    return Math.max(0, Math.sqrt(squaredDistance[index]) * cell - halfDiagonal - distance(point, center(index)))
  }
  const lineClearance = (from: Point, to: Point): number => {
    const steps = Math.max(1, Math.ceil(distance(from, to) / (cell / 4)))
    let clearance = Infinity
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
      const index = indexAt(p)
      if (index < 0 || !walkable[index]) return 0
      clearance = Math.min(clearance, localClearance(p))
    }
    // Lower bound between samples using the 1-Lipschitz distance-to-obstacle property.
    return Math.max(0, clearance - cell / 8)
  }
  const coverageClearanceAt = (point: GeoPoint): number => {
    if (!hasValidCoordinates(point)) return 0
    const metrePerDegree = Math.PI * 6_378_137 / 180
    return Math.max(0, Math.min(
      (point.longitude - west) * metrePerDegree * Math.cos(point.latitude * Math.PI / 180),
      (east - point.longitude) * metrePerDegree * Math.cos(point.latitude * Math.PI / 180),
      (point.latitude - south) * metrePerDegree,
      (north - point.latitude) * metrePerDegree,
    ))
  }
  const pointStatus = (point: GeoPoint): UrbanPointValidation => {
    if (!hasValidCoordinates(point)) return { valid: false, reason: 'invalid-coordinate', clearanceMeters: 0, coverageClearanceMeters: 0 }
    const coverageClearanceMeters = coverageClearanceAt(point)
    if (point.longitude < west || point.longitude > east || point.latitude < south || point.latitude > north) {
      return { valid: false, reason: 'outside-coverage', clearanceMeters: 0, coverageClearanceMeters }
    }
    const local = localPoint(point)
    const index = indexAt(local)
    const clearanceMeters = localClearance(local)
    if (coverageClearanceMeters < margin + cell * 2 || index < 0
      || index % width < 2 || index % width >= width - 2 || Math.floor(index / width) < 2 || Math.floor(index / width) >= height - 2) {
      return { valid: false, reason: 'boundary-margin', clearanceMeters, coverageClearanceMeters }
    }
    const valid = Boolean(walkable[index]) && lineClearance(local, center(index)) >= radius
    return { valid, reason: valid ? 'valid' : 'near-building', clearanceMeters, coverageClearanceMeters }
  }
  const validatePoint = (point: GeoPoint): UrbanPointValidation => {
    const result = pointStatus(point)
    if (result.valid || result.reason === 'invalid-coordinate') return result
    const local = localPoint(point)
    let best = 50
    let nearest: GeoPoint | undefined
    for (let index = 0; index < count; index++) {
      if (!walkable[index]) continue
      const delta = distance(local, center(index))
      if (delta >= best) continue
      const candidate = geographicPoint(center(index))
      if (pointStatus(candidate).valid) {
        best = delta
        nearest = candidate
      }
    }
    return nearest ? { ...result, nearestValidPoint: nearest, nearestDistanceMeters: best } : result
  }
  const routeThroughGrid = (from: Point, to: Point, id: 'left' | 'right' | 'detour'): UrbanRouteCandidate | undefined => {
    const startIndex = indexAt(from)
    const goalIndex = indexAt(to)
    if (startIndex < 0 || goalIndex < 0 || !walkable[startIndex] || !walkable[goalIndex]
      || freeRegions[startIndex] !== freeRegions[goalIndex]
      || lineClearance(from, center(startIndex)) < radius || lineClearance(center(goalIndex), to) < radius) return
    const sign = id === 'left' ? 1 : -1
    const span = distance(from, to)
    if (span < cell) return
    const sideAllowed = (point: Point) => id === 'detour'
      || sign * ((to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x)) / span >= -cell * 0.6
    const route = aStar(startIndex, goalIndex, width, height, walkable, center, sideAllowed)
    if (!route) return
    const raw = [from, ...route.map(center), to]
    const simplified = [from]
    let cursor = 0
    while (cursor < raw.length - 1) {
      let next = raw.length - 1
      while (next > cursor + 1 && lineClearance(raw[cursor], raw[next]) < radius) next--
      if (lineClearance(raw[cursor], raw[next]) < radius) return
      if (distance(simplified[simplified.length - 1], raw[next]) > 0.05) simplified.push(raw[next])
      cursor = next
    }
    let lengthMeters = 0
    let minimumClearanceMeters = Infinity
    for (let i = 1; i < simplified.length; i++) {
      lengthMeters += distance(simplified[i - 1], simplified[i])
      minimumClearanceMeters = Math.min(minimumClearanceMeters, lineClearance(simplified[i - 1], simplified[i]))
    }
    return { id, feasible: true, waypoints: simplified.map(geographicPoint), lengthMeters, minimumClearanceMeters }
  }
  const planCandidates = (start: GeoPoint, goal: GeoPoint): UrbanRouteCandidate[] => {
    if (!pointStatus(start).valid || !pointStatus(goal).valid) return []
    const from = localPoint(start)
    const to = localPoint(goal)
    const directClearance = lineClearance(from, to)
    if (directClearance >= radius) {
      return [{ id: 'direct', feasible: true, waypoints: [{ ...start }, { ...goal }], lengthMeters: distance(from, to), minimumClearanceMeters: directClearance }]
    }
    const candidates = (['left', 'right'] as const).map(id => routeThroughGrid(from, to, id)).filter((value): value is UrbanRouteCandidate => Boolean(value))
    // A connected city route can have to cross both sides of the start-goal line.
    // Do not mistake failure of both half-plane searches for a disconnected world.
    if (!candidates.length) {
      const detour = routeThroughGrid(from, to, 'detour')
      if (detour) candidates.push(detour)
    }
    for (const candidate of candidates) {
      candidate.waypoints[0] = { ...start }
      candidate.waypoints[candidate.waypoints.length - 1] = { ...goal }
    }
    return candidates
  }
  const nearestFree = (point: Point): Point | undefined => {
    let nearest: Point | undefined
    let best = 12
    const cx = Math.floor((point.x - minX) / cell)
    const cy = Math.floor((point.y - minY) / cell)
    const range = Math.ceil(best / cell)
    for (let y = Math.max(0, cy - range); y <= Math.min(height - 1, cy + range); y++) {
      for (let x = Math.max(0, cx - range); x <= Math.min(width - 1, cx + range); x++) {
        const index = y * width + x
        const p = center(index)
        const delta = distance(point, p)
        if (walkable[index] && delta < best) { nearest = p; best = delta }
      }
    }
    return nearest
  }
  let defaultChallenge: UrbanNavigationChallenge | undefined
  const preferredCenter = localPoint({ longitude: 139.7642, latitude: 35.6816, height: 38 })
  const eligible = components.filter(component => component.cells * cell * cell >= 60
    && component.minX > 3 && component.minY > 3 && component.maxX < width - 4 && component.maxY < height - 4
    && (component.maxX - component.minX) * cell < 110 && (component.maxY - component.minY) * cell < 110)
  eligible.sort((a, b) => {
    const p = (component: Component) => ({ x: minX + (component.minX + component.maxX + 1) * cell / 2, y: minY + (component.minY + component.maxY + 1) * cell / 2 })
    return distance(p(a), preferredCenter) - distance(p(b), preferredCenter)
  })
  for (const component of eligible) {
    const lo = center(component.minY * width + component.minX)
    const hi = center(component.maxY * width + component.maxX)
    const mid = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 }
    const pairs = [
      [{ x: mid.x, y: lo.y - 12 }, { x: mid.x, y: hi.y + 12 }],
      [{ x: lo.x - 12, y: mid.y }, { x: hi.x + 12, y: mid.y }],
    ]
    for (const pair of pairs) {
      const from = nearestFree(pair[0])
      const to = nearestFree(pair[1])
      if (!from || !to || distance(from, to) < 20) continue
      const start = geographicPoint(from)
      const goal = geographicPoint(to)
      const fromEcef = Cartesian3.fromDegrees(start.longitude, start.latitude, 40)
      const toEcef = Cartesian3.fromDegrees(goal.longitude, goal.latitude, 40)
      const from3 = Matrix4.multiplyByPoint(toLocal, fromEcef, new Cartesian3())
      const to3 = Matrix4.multiplyByPoint(toLocal, toEcef, new Cartesian3())
      const directHit = meshSegmentHit(vertices, mesh.indices, from3, to3)
      if (directHit === null) continue
      const candidates = planCandidates(start, goal)
      if (candidates.length !== 2 || candidates.some(candidate => candidate.lengthMeters < 60 || candidate.lengthMeters > 190)) continue
      const challenge = { start, goal, directDistanceMeters: distance(from, to), directMeshHitDistanceMeters: directHit, candidates }
      if (!defaultChallenge || Math.max(...candidates.map(candidate => candidate.lengthMeters)) < Math.max(...defaultChallenge.candidates.map(candidate => candidate.lengthMeters))) defaultChallenge = challenge
    }
    if (defaultChallenge && defaultChallenge.candidates.every(candidate => candidate.lengthMeters <= 180)) break
  }
  if (!defaultChallenge) throw new Error(`No short bilateral building detour found (${eligible.length} eligible mesh components)`)
  return {
    defaultChallenge,
    coverageBbox: [...mesh.coverageBbox],
    grid: { cellSizeMeters: cell, width, height, occupiedCells: occupied.reduce((sum, value) => sum + value, 0) },
    planCandidates,
    validatePoint,
    clearanceAt: point => hasValidCoordinates(point) ? localClearance(localPoint(point)) : 0,
    coverageClearanceAt,
    isSegmentWalkable: (from, to) => hasValidCoordinates(from) && hasValidCoordinates(to) && lineClearance(localPoint(from), localPoint(to)) >= radius,
  }
}

function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y) }

function labelFreeRegions(walkable: Uint8Array, width: number, height: number): Int32Array {
  const labels = new Int32Array(walkable.length).fill(-1)
  const queue = new Int32Array(walkable.length)
  let label = 0
  for (let start = 0; start < walkable.length; start++) {
    if (!walkable[start] || labels[start] !== -1) continue
    let tail = 1
    queue[0] = start
    labels[start] = label
    for (let head = 0; head < tail; head++) {
      const index = queue[head]
      const x = index % width
      const y = Math.floor(index / width)
      for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (next >= 0 && walkable[next] && labels[next] === -1) {
          labels[next] = label
          queue[tail++] = next
        }
      }
    }
    label++
  }
  return labels
}

function triangleIntersectsCell(t: Point[], x: number, y: number, size: number): boolean {
  if (t.some(p => p.x >= x && p.x <= x + size && p.y >= y && p.y <= y + size)) return true
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const area = cross(t[0], t[1], t[2])
  if (Math.abs(area) > 1e-8) {
    for (const p of [{ x, y }, { x: x + size, y }, { x, y: y + size }, { x: x + size, y: y + size }]) {
      const signs = [cross(t[0], t[1], p), cross(t[1], t[2], p), cross(t[2], t[0], p)]
      if (signs.every(value => value >= -1e-8) || signs.every(value => value <= 1e-8)) return true
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = t[i]
    const b = t[(i + 1) % 3]
    let low = 0
    let high = 1
    for (const [start, delta, minimum, maximum] of [[a.x, b.x - a.x, x, x + size], [a.y, b.y - a.y, y, y + size]]) {
      if (Math.abs(delta) < 1e-12) { if (start < minimum || start > maximum) high = -1; continue }
      const t0 = (minimum - start) / delta
      const t1 = (maximum - start) / delta
      low = Math.max(low, Math.min(t0, t1))
      high = Math.min(high, Math.max(t0, t1))
    }
    if (low <= high) return true
  }
  return false
}

function findComponents(occupied: Uint8Array, width: number, height: number): Component[] {
  const visited = new Uint8Array(occupied.length)
  const components: Component[] = []
  for (let index = 0; index < occupied.length; index++) {
    if (!occupied[index] || visited[index]) continue
    const queue = [index]
    visited[index] = 1
    const component = { minX: width, minY: height, maxX: 0, maxY: 0, cells: 0 }
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor]
      const x = current % width
      const y = Math.floor(current / width)
      component.minX = Math.min(component.minX, x)
      component.maxX = Math.max(component.maxX, x)
      component.minY = Math.min(component.minY, y)
      component.maxY = Math.max(component.maxY, y)
      component.cells++
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        const next = ny * width + nx
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || visited[next] || !occupied[next]) continue
        visited[next] = 1
        queue.push(next)
      }
    }
    components.push(component)
  }
  return components
}

function distanceTransform(occupied: Uint8Array, width: number, height: number): Float64Array {
  const transform = (values: Float64Array): Float64Array => {
    const length = values.length
    const sites = new Int32Array(length)
    const edges = new Float64Array(length + 1)
    const output = new Float64Array(length)
    let k = 0
    edges[0] = -Infinity
    edges[1] = Infinity
    for (let q = 1; q < length; q++) {
      let crossing = 0
      while (true) {
        const v = sites[k]
        crossing = ((values[q] + q * q) - (values[v] + v * v)) / (2 * (q - v))
        if (crossing > edges[k] || k === 0) break
        k--
      }
      k++
      sites[k] = q
      edges[k] = crossing
      edges[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < length; q++) {
      while (edges[k + 1] < q) k++
      output[q] = (q - sites[k]) ** 2 + values[sites[k]]
    }
    return output
  }
  const horizontal = new Float64Array(occupied.length)
  const result = new Float64Array(occupied.length)
  for (let y = 0; y < height; y++) {
    const row = Float64Array.from({ length: width }, (_, x) => occupied[y * width + x] ? 0 : 1e12)
    horizontal.set(transform(row), y * width)
  }
  for (let x = 0; x < width; x++) {
    const column = transform(Float64Array.from({ length: height }, (_, y) => horizontal[y * width + x]))
    for (let y = 0; y < height; y++) result[y * width + x] = column[y]
  }
  return result
}

function aStar(start: number, goal: number, width: number, height: number, walkable: Uint8Array, center: (index: number) => Point, allowed: (point: Point) => boolean): number[] | undefined {
  const goalPoint = center(goal)
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  const heap: Array<{ index: number, score: number }> = []
  const push = (entry: { index: number, score: number }) => {
    heap.push(entry)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent].score <= entry.score) break
      heap[i] = heap[parent]
      i = parent
    }
    heap[i] = entry
  }
  const pop = (): number => {
    const result = heap[0].index
    const last = heap.pop()!
    if (heap.length) {
      let i = 0
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++
        if (heap[child].score >= last.score) break
        heap[i] = heap[child]
        i = child
      }
      heap[i] = last
    }
    return result
  }
  const cost = new Float64Array(walkable.length).fill(Infinity)
  const previous = new Int32Array(walkable.length).fill(-1)
  const closed = new Uint8Array(walkable.length)
  cost[start] = 0
  push({ index: start, score: distance(center(start), goalPoint) })
  while (heap.length) {
    const current = pop()
    if (closed[current]) continue
    if (current === goal) {
      const path = [goal]
      while (path[path.length - 1] !== start) path.push(previous[path[path.length - 1]])
      return path.reverse()
    }
    closed[current] = 1
    const x = current % width
    const y = Math.floor(current / width)
    const currentPoint = center(current)
    for (const [dx, dy] of neighbors) {
      const nx = x + dx
      const ny = y + dy
      const next = ny * width + nx
      const nextPoint = center(next)
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !walkable[next] || closed[next]
        || !allowed(nextPoint) || (dx && dy && (!walkable[y * width + nx] || !walkable[ny * width + x]))) continue
      const newCost = cost[current] + distance(currentPoint, nextPoint)
      if (newCost >= cost[next]) continue
      cost[next] = newCost
      previous[next] = current
      push({ index: next, score: newCost + distance(nextPoint, goalPoint) })
    }
  }
  return undefined
}

function meshSegmentHit(vertices: Float64Array, indices: ArrayLike<number>, from: Cartesian3, to: Cartesian3): number | null {
  const vertexAt = (index: number) => new Cartesian3(vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2])
  const direction = Cartesian3.normalize(Cartesian3.subtract(to, from, new Cartesian3()), new Cartesian3())
  const maximum = Cartesian3.distance(from, to)
  let nearest = Infinity
  for (let index = 0; index < indices.length; index += 3) {
    const a = vertexAt(indices[index])
    const edge1 = Cartesian3.subtract(vertexAt(indices[index + 1]), a, new Cartesian3())
    const edge2 = Cartesian3.subtract(vertexAt(indices[index + 2]), a, new Cartesian3())
    const p = Cartesian3.cross(direction, edge2, new Cartesian3())
    const det = Cartesian3.dot(edge1, p)
    if (Math.abs(det) < 1e-10) continue
    const displacement = Cartesian3.subtract(from, a, new Cartesian3())
    const u = Cartesian3.dot(displacement, p) / det
    if (u < 0 || u > 1) continue
    const q = Cartesian3.cross(displacement, edge1, new Cartesian3())
    const v = Cartesian3.dot(direction, q) / det
    if (v < 0 || u + v > 1) continue
    const hit = Cartesian3.dot(edge2, q) / det
    if (hit >= 0 && hit <= maximum && hit < nearest) nearest = hit
  }
  return Number.isFinite(nearest) ? nearest : null
}
