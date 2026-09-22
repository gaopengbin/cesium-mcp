import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeUrbanBuildingMesh, loadUrbanBuildingMesh } from './urban-building-mesh.js'
import { createUrbanNavigation } from './urban-navigation.js'

const assetUrl = new URL('./assets/tokyo-buildings.bin', import.meta.url)
const sourceUrl = new URL('./assets/tokyo-colliders.json', import.meta.url)

function readAsset(): ArrayBuffer {
  return Uint8Array.from(readFileSync(assetUrl)).buffer
}

afterEach(() => vi.unstubAllGlobals())

describe('shared compact urban building mesh', () => {
  it('preserves every source triangle in order, with less than one millimetre of coordinate rounding', () => {
    const source = JSON.parse(readFileSync(sourceUrl, 'utf8'))
    const buffer = readAsset()
    const mesh = decodeUrbanBuildingMesh(buffer)
    expect(mesh.counts.sourceVertexCount).toBe(source.counts.vertexCount)
    expect(mesh.counts.vertexCount).toBeLessThan(source.counts.vertexCount / 4)
    expect(mesh.counts.triangleCount).toBe(source.counts.triangleCount)
    expect(mesh.originEcef).toEqual(source.originEcef)
    expect(mesh.coverageBbox).toEqual(source.coverageBbox)
    expect(buffer.byteLength).toBeLessThan(6_000_000)
    let maxError = 0
    for (let i = 0; i < source.indices.length; i++) {
      const original = source.indices[i] * 3
      const compact = mesh.indices[i] * 3
      for (let axis = 0; axis < 3; axis++) {
        maxError = Math.max(maxError, Math.abs(source.positions[original + axis] - mesh.positions[compact + axis]))
      }
    }
    expect(maxError).toBeLessThan(0.001)
    expect(mesh.source.originalJsonSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects truncated files and incorrect format markers', () => {
    expect(() => decodeUrbanBuildingMesh(new ArrayBuffer(4))).toThrow(/建筑数据/)
    const buffer = readAsset()
    expect(() => decodeUrbanBuildingMesh(buffer.slice(0, buffer.byteLength - 4))).toThrow(/建筑数据/)
    new Uint8Array(buffer)[0] = 0
    expect(() => decodeUrbanBuildingMesh(buffer)).toThrow(/建筑数据/)
  })

  it('keeps the reported cross-district route open with two metre clearance against the original geometry grid', () => {
    const mesh = decodeUrbanBuildingMesh(readAsset())
    const original = createUrbanNavigation(JSON.parse(readFileSync(sourceUrl, 'utf8')))
    const compact = createUrbanNavigation(mesh)
    const start = { longitude: 139.761788, latitude: 35.676708, height: 38 }
    const goal = { longitude: 139.766056, latitude: 35.683870, height: 38 }
    const candidates = compact.planCandidates(start, goal)
    expect(compact.grid.cellSizeMeters).toBe(1)
    expect(compact.validatePoint(start).valid).toBe(true)
    expect(compact.validatePoint(goal).valid).toBe(true)
    expect(candidates.length).toBeGreaterThan(0)
    for (const route of candidates) {
      expect(route.waypoints[0]).toEqual(start)
      expect(route.waypoints.at(-1)).toEqual(goal)
      expect(route.minimumClearanceMeters).toBeGreaterThanOrEqual(2)
      for (let index = 1; index < route.waypoints.length; index++) {
        expect(original.isSegmentWalkable(route.waypoints[index - 1], route.waypoints[index])).toBe(true)
      }
    }
  }, 30_000)

  it('rejects coordinates and indices that cannot form the declared geometry', () => {
    const invalidIndex = readAsset()
    const indexMesh = decodeUrbanBuildingMesh(invalidIndex)
    indexMesh.indices[0] = indexMesh.counts.vertexCount
    expect(() => decodeUrbanBuildingMesh(invalidIndex)).toThrow(/建筑数据/)
    const invalidPosition = readAsset()
    const positionMesh = decodeUrbanBuildingMesh(invalidPosition)
    positionMesh.positions[0] = Number.NaN
    expect(() => decodeUrbanBuildingMesh(invalidPosition)).toThrow(/建筑数据/)
  })

  it('shares a single fetch between rendering, physics and navigation', async () => {
    const fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => readAsset() }))
    vi.stubGlobal('fetch', fetch)
    const [render, physics, navigation] = await Promise.all([
      loadUrbanBuildingMesh(), loadUrbanBuildingMesh(), loadUrbanBuildingMesh(),
    ])
    expect(fetch).toHaveBeenCalledOnce()
    expect(render).toBe(physics)
    expect(navigation).toBe(physics)
  })
})
