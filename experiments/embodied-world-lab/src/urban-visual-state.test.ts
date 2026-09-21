import { describe, expect, it, vi } from 'vitest'
import type { Cesium3DTileset, Viewer } from 'cesium'
import { watchUrbanVisualState } from './urban-scene.js'

function event<T extends unknown[] = []>() {
  const listeners = new Set<(...args: T) => void>()
  return {
    addEventListener(listener: (...args: T) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    emit(...args: T) { for (const listener of listeners) listener(...args) },
  }
}

describe('urban visual loading state', () => {
  it('requires loaded and visible tile content rather than just tileset metadata', () => {
    const tiles = {
      tilesLoaded: true, tileLoad: event<[object]>(), tileUnload: event<[object]>(), tileVisible: event<[object]>(), tileFailed: event(),
      loadProgress: event<[number, number]>(),
      totalMemoryUsageInBytes: 16_000, cacheBytes: 32_000,
    }
    const postRender = event()
    const onState = vi.fn()
    const dispose = watchUrbanVisualState(tiles as unknown as Cesium3DTileset, {
      scene: { postRender },
    } as unknown as Viewer, onState)
    postRender.emit()
    expect(onState.mock.calls.at(-1)?.[0].status).toBe('loading')
    const firstTile = {}
    tiles.tileLoad.emit(firstTile)
    tiles.tileVisible.emit(firstTile)
    postRender.emit()
    expect(onState.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'ready', loadedTiles: 1, scope: 'current-view' })

    tiles.tilesLoaded = false
    tiles.loadProgress.emit(2, 1)
    tiles.tileVisible.emit(firstTile)
    postRender.emit()
    expect(onState.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'loading', pendingRequests: 2, processingTiles: 1 })
    tiles.tileFailed.emit()
    expect(onState.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'partial', failedTiles: 1 })

    const calls = onState.mock.calls.length
    dispose()
    tiles.tileFailed.emit()
    postRender.emit()
    expect(onState).toHaveBeenCalledTimes(calls)
  })

  it('distinguishes resident tiles from historical loads across eviction and revisits', () => {
    const tiles = {
      tilesLoaded: true, tileLoad: event<[object]>(), tileUnload: event<[object]>(), tileVisible: event<[object]>(), tileFailed: event(),
      loadProgress: event<[number, number]>(), totalMemoryUsageInBytes: 32_000, cacheBytes: 32_000,
    }
    const postRender = event()
    const onState = vi.fn()
    const dispose = watchUrbanVisualState(tiles as unknown as Cesium3DTileset, { scene: { postRender } } as unknown as Viewer, onState)
    const firstTile = {}
    const secondTile = {}
    tiles.tileLoad.emit(firstTile)
    tiles.tileLoad.emit(secondTile)
    tiles.tileVisible.emit(firstTile)
    tiles.tileVisible.emit(firstTile)
    postRender.emit()
    expect(onState.mock.calls.at(-1)?.[0]).toMatchObject({
      loadedTiles: 2, residentTiles: 2, unloadedTiles: 0, visibleTiles: 1, memoryUsageBytes: 32_000,
    })

    tiles.tileUnload.emit(firstTile)
    tiles.totalMemoryUsageInBytes = 16_000
    tiles.tileVisible.emit(secondTile)
    postRender.emit()
    expect(onState.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'ready', loadedTiles: 2, residentTiles: 1, unloadedTiles: 1, memoryUsageBytes: 16_000 })

    tiles.tileLoad.emit(firstTile)
    tiles.tileVisible.emit(firstTile)
    postRender.emit()
    expect(onState.mock.calls.at(-1)?.[0]).toMatchObject({ loadedTiles: 3, residentTiles: 2, unloadedTiles: 1, visibleTiles: 1 })
    const calls = onState.mock.calls.length
    dispose()
    tiles.tileUnload.emit(firstTile)
    postRender.emit()
    expect(onState).toHaveBeenCalledTimes(calls)
  })
})
