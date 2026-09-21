import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Cesium3DTileset } from 'cesium'
import type { Viewer } from 'cesium'
import { loadUrbanBuildings } from './urban-scene.js'

// Exercise the installed Cesium request gate, rather than only asserting option values.
const cesiumRequire = createRequire(createRequire(import.meta.url).resolve('cesium'))
const traversalModule = pathToFileURL(cesiumRequire.resolve('@cesium/engine/Source/Scene/Cesium3DTilesetTraversal.js')).href
const traversal = (await import(traversalModule)).default

function requestsTile(tileset: Cesium3DTileset, moving: boolean, deferred: boolean): boolean {
  const state = tileset as unknown as { _cullRequestsWhileMoving: boolean, _requestedTiles: unknown[] }
  // Cesium3DTileset's frame update sets this flag for a stationary tileset.
  state._cullRequestsWhileMoving = tileset.cullRequestsWhileMoving
  const tile = {
    tileset, _requestedFrame: -1, hasUnloadedRenderableContent: true, contentExpired: false,
    priorityDeferred: deferred, boundingSphere: { radius: 10 },
  }
  traversal.loadTile(tile, { frameNumber: 1, camera: {
    positionWCDeltaMagnitude: moving ? 5 : 0, positionWCDeltaMagnitudeLastFrame: 0, timeSinceMoved: 0,
  } })
  return state._requestedTiles.includes(tile)
}

afterEach(() => vi.restoreAllMocks())

describe('urban building requests during map exploration', () => {
  it.each([
    { moving: true, deferred: false },
    { moving: false, deferred: true },
  ])('requests visible content instead of deferring it during $moving movement / $deferred peripheral loading', async ({ moving, deferred }) => {
    expect(requestsTile(new Cesium3DTileset({}), moving, deferred)).toBe(false)
    vi.spyOn(Cesium3DTileset, 'fromUrl').mockImplementation(async (_url, options) => new Cesium3DTileset(options ?? {}))
    const viewer = {
      scene: { primitives: { add: vi.fn() }, globe: {} }, clock: {},
      cesiumWidget: { creditDisplay: { addStaticCredit: vi.fn() } }, camera: { setView: vi.fn() },
    } as unknown as Viewer
    const buildings = await loadUrbanBuildings(viewer)
    expect(requestsTile(buildings, moving, deferred)).toBe(true)
  })
})
