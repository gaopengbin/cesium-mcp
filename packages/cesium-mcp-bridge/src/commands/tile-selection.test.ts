import { describe, expect, it } from 'vitest'
import type { Cesium3DTileset } from 'cesium'
import { readTileFeature } from './tile-selection.js'

describe('readTileFeature', () => {
  it('returns attributes with their managed layer for a picked river', () => {
    const tileset = {} as Cesium3DTileset
    const picked = { tileset, getPropertyIds: () => ['name', 'discharge'], getProperty: (key: string) => key === 'name' ? 'River' : 42 }
    expect(readTileFeature(picked, [['rivers', tileset]])).toEqual({ layerId: 'rivers', properties: { name: 'River', discharge: 42 } })
  })
  it('rejects unrelated tilesets and ordinary entities', () => {
    expect(readTileFeature({ id: 'marker' }, [])).toBeNull()
    expect(readTileFeature({ tileset: {}, getPropertyIds: () => [] }, [])).toBeNull()
  })
  it('preserves large integer IDs and tolerates custom circular metadata', () => {
    const tileset = {} as Cesium3DTileset
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const picked = { tileset, getPropertyIds: () => ['id', 'custom'], getProperty: (key: string) => key === 'id' ? 9007199254740993n : circular }
    expect(readTileFeature(picked, [['rivers', tileset]])?.properties).toEqual({ id: '9007199254740993' })
  })
})
