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
      tilesLoaded: true, tileLoad: event(), tileVisible: event(), tileFailed: event(),
      loadProgress: event<[number, number]>(),
    }
    const postRender = event()
    const onState = vi.fn()
    const dispose = watchUrbanVisualState(tiles as unknown as Cesium3DTileset, {
      scene: { postRender },
    } as unknown as Viewer, onState)
    postRender.emit()
    expect(onState.mock.calls.at(-1)?.[0].status).toBe('loading')
    tiles.tileLoad.emit()
    tiles.tileVisible.emit()
    postRender.emit()
    expect(onState.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'ready', loadedTiles: 1, scope: 'current-view' })

    tiles.tilesLoaded = false
    tiles.loadProgress.emit(2, 1)
    tiles.tileVisible.emit()
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
})
