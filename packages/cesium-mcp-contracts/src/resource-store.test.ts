import { describe, expect, it } from 'vitest'
import {
  createCesiumResourceStore,
  resolveCesiumResourceInput,
} from './resource-store.js'

describe('Cesium resource store', () => {
  it('registers metadata without returning the stored payload', () => {
    const store = createCesiumResourceStore({ createId: () => 'resource_a' })
    const result = store.register({
      kind: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })

    expect(result).toMatchObject({ resourceId: 'resource_a', kind: 'geojson' })
    expect(result).not.toHaveProperty('data')
    expect(store.resolve('resource_a', 'geojson')).toEqual({
      type: 'FeatureCollection',
      features: [],
    })
  })

  it('expires entries and enforces session-local capacity', () => {
    let time = 1_000
    const store = createCesiumResourceStore({
      now: () => time,
      createId: () => `resource_${time}`,
      defaultTtlMs: 100,
      maxEntries: 1,
    })
    store.register({ kind: 'json', data: { value: 1 } })
    expect(() => store.register({ kind: 'json', data: { value: 2 } }))
      .toThrow('Resource limit reached')

    time = 1_101
    expect(store.sweep()).toBe(1)
    expect(store.list()).toEqual([])
  })

  it('resolves resourceId into the bridge data field', () => {
    const store = createCesiumResourceStore({ createId: () => 'geojson_1' })
    const data = { type: 'FeatureCollection', features: [] }
    store.register({ kind: 'geojson', data })

    expect(resolveCesiumResourceInput('addGeoJsonLayer', {
      resourceId: 'geojson_1',
      name: 'Boundaries',
    }, store)).toEqual({ name: 'Boundaries', data })
  })

  it('rejects kind mismatches and ambiguous inputs', () => {
    const store = createCesiumResourceStore({ createId: () => 'czml_1' })
    store.register({ kind: 'czml', data: [{ id: 'document', version: '1.0' }] })

    expect(() => resolveCesiumResourceInput('addGeoJsonLayer', {
      resourceId: 'czml_1',
    }, store)).toThrow('expected geojson')
    expect(() => resolveCesiumResourceInput('loadCzml', {
      resourceId: 'czml_1',
      url: 'https://example.com/data.czml',
    }, store)).toThrow('cannot be combined')
    expect(() => store.register({
      kind: 'binary' as 'json',
      data: {},
    })).toThrow('Unsupported resource kind')
  })
})
