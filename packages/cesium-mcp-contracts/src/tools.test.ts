import { describe, expect, it } from 'vitest'
import {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsetDefinitions,
  cesiumBrowserToolsets,
  cesiumSharedToolNames,
  selectCesiumToolContracts,
} from './toolsets.js'
import { cesiumCoreToolContracts } from './tools.js'

describe('cesiumCoreToolContracts', () => {
  it('defines one complete contract for every browser-core tool', () => {
    expect(cesiumCoreToolContracts).toHaveLength(15)
    expect(new Set(cesiumCoreToolContracts.map(tool => tool.name)).size).toBe(15)
    expect(cesiumCoreToolContracts.every(tool => tool.inputSchema.type === 'object')).toBe(true)
    expect(cesiumCoreToolContracts.every(tool => tool.outputSchema.type === 'object')).toBe(true)
    expect(cesiumCoreToolContracts.every(tool => tool.description.includes('Returns {'))).toBe(true)
  })

  it('groups every browser-safe bridge action into selectable toolsets', () => {
    expect(cesiumBrowserToolContracts).toHaveLength(61)
    expect(new Set(cesiumBrowserToolContracts.map(tool => tool.name)).size).toBe(61)
    expect(cesiumBrowserToolContracts.some(tool => tool.name === 'setIonToken')).toBe(false)
    expect(cesiumBrowserToolContracts.every(tool => tool.inputSchema.type === 'object')).toBe(true)
    expect(cesiumBrowserToolContracts.every(tool => tool.outputSchema.type === 'object')).toBe(true)
    expect(cesiumBrowserToolsets.camera.tools.map(tool => tool.name)).toEqual([
      'lookAtTransform',
      'startOrbit',
      'stopOrbit',
      'setCameraOptions',
    ])
  })

  it('publishes one canonical shared inventory and toolset definition', () => {
    expect(cesiumSharedToolNames).toEqual(cesiumBrowserToolContracts.map(tool => tool.name))
    expect(new Set(cesiumSharedToolNames).size).toBe(cesiumSharedToolNames.length)

    for (const [name, definition] of Object.entries(cesiumBrowserToolsetDefinitions)) {
      expect(definition.names).toEqual(cesiumBrowserToolsets[name as keyof typeof cesiumBrowserToolsets].tools.map(tool => tool.name))
    }
  })

  it('selects core, all, one, or several deduplicated toolsets', () => {
    expect(selectCesiumToolContracts()).toBe(cesiumCoreToolContracts)
    expect(selectCesiumToolContracts('all')).toBe(cesiumBrowserToolContracts)
    expect(selectCesiumToolContracts('trajectory').map(tool => tool.name)).toEqual(['playTrajectory'])

    const selected = selectCesiumToolContracts(['view', 'interaction'])
    expect(selected).toHaveLength(11)
    expect(new Set(selected.map(tool => tool.name)).size).toBe(11)
  })

  it('keeps geographic and GeoJSON schemas precise', () => {
    const flyTo = cesiumCoreToolContracts.find(tool => tool.name === 'flyTo')!
    const flyToProperties = flyTo.inputSchema.properties as Record<string, Record<string, unknown>>
    expect(flyToProperties.longitude).toMatchObject({ minimum: -180, maximum: 180 })
    expect(flyToProperties.latitude).toMatchObject({ minimum: -90, maximum: 90 })

    const geoJson = cesiumCoreToolContracts.find(tool => tool.name === 'addGeoJsonLayer')!
    const geoJsonProperties = geoJson.inputSchema.properties as Record<string, any>
    expect(geoJsonProperties.data.properties.features.items.properties.geometry.oneOf).toHaveLength(3)
    expect(geoJsonProperties.style.properties).toHaveProperty('choropleth')
  })

  it('distinguishes animated navigation from immediate camera setup', () => {
    const flyTo = cesiumCoreToolContracts.find(tool => tool.name === 'flyTo')!
    const setView = cesiumCoreToolContracts.find(tool => tool.name === 'setView')!
    expect(flyTo.description).toContain('Animate the camera')
    expect(setView.description).toContain('immediately without animation')
  })
})
