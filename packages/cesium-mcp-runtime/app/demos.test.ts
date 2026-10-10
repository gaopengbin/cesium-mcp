import { describe, expect, it, vi } from 'vitest'
import { createDemoPlan, executeDemoPlan, removeDemoResources } from './demos.js'

describe('map capability demos', () => {
  it('keeps every demo camera and geographic feature in the United States', () => {
    const check = (coordinates: unknown) => {
      if (!Array.isArray(coordinates)) return
      if (typeof coordinates[0] === 'number') {
        expect(coordinates[0]).toBeGreaterThan(-125)
        expect(coordinates[0]).toBeLessThan(-66)
        expect(coordinates[1]).toBeGreaterThan(24)
        expect(coordinates[1]).toBeLessThan(50)
      } else coordinates.forEach(check)
    }
    for (const id of ['choropleth', 'buildings', 'heatmap'] as const) {
      const plan = createDemoPlan(id, 'map-test', 0)
      const camera = plan.steps.find(step => step.name === 'flyTo')!.args
      check([camera.longitude, camera.latitude])
      for (const step of plan.steps) {
        const data = step.args.data as { features?: { geometry: { coordinates: unknown } }[] } | undefined
        data?.features?.forEach(feature => check(feature.geometry.coordinates))
        const entities = step.args.entities as { coordinates: unknown }[] | undefined
        entities?.forEach(entity => check(entity.coordinates))
      }
    }
  })
  it('uses inspectable sample properties and three real choropleth classes', () => {
    const plan = createDemoPlan('choropleth', 'map-test', 0)
    const step = plan.steps.find(step => step.name === 'addGeoJsonLayer')!
    const data = step.args.data as { features: { properties: Record<string, unknown> }[] }
    expect(data.features).toHaveLength(24)
    expect(data.features.every(feature => feature.properties.source === '内置演示数据')).toBe(true)
    expect(step.args.style).toMatchObject({ choropleth: { field: 'value', breaks: [0, 29, 59, 100], colors: expect.any(Array) } })
  })

  it('retains successful entities when a batch partially fails', async () => {
    const plan = createDemoPlan('buildings', 'map-test', 0)
    const owned = { layers: [], entities: [] } as { layers: string[]; entities: string[] }
    const invoke = vi.fn(async (name: string) => name === 'batchAddEntities'
      ? { entityIds: ['created-building'], errors: ['one building failed'] }
      : {})
    await expect(executeDemoPlan(plan, invoke, owned, () => {}, () => true)).rejects.toThrow('one building failed')
    expect(owned.entities).toEqual(['created-building'])
    expect(invoke.mock.calls.some(([name]) => name === 'flyTo')).toBe(false)
  })

  it('stops subsequent mutations when the map session changes', async () => {
    const plan = createDemoPlan('choropleth', 'map-test', 0)
    let current = true
    const invoke = vi.fn(async () => { current = false; return {} })
    await expect(executeDemoPlan(plan, invoke, { layers: [], entities: [] }, () => {}, () => current)).rejects.toThrow('地图会话已更换')
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('removes only owned demo IDs and preserves failed removals for retry', async () => {
    const owned = { layers: ['own-layer'], entities: ['own-entity'] }
    const invoke = vi.fn(async (name: string) => {
      if (name === 'removeEntity') throw new Error('disconnected')
      return {}
    })
    await expect(removeDemoResources(owned, invoke)).rejects.toThrow('disconnected')
    expect(invoke.mock.calls).toEqual([
      ['removeLayer', { id: 'own-layer' }],
      ['removeEntity', { entityId: 'own-entity' }],
    ])
    expect(owned).toEqual({ layers: [], entities: ['own-entity'] })
  })
})
