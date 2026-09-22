import { describe, expect, it } from 'vitest'
import { resolveUrbanBuildingSource } from './urban-building-source.js'

describe('urban building source and navigation compatibility', () => {
  it('defaults to lightweight local geometry without a credential', () => {
    expect(resolveUrbanBuildingSource(null, {})).toMatchObject({ source: 'white', googleAvailable: false, navigationAvailable: true })
    expect(resolveUrbanBuildingSource('unknown', {}).source).toBe('white')
    expect(resolveUrbanBuildingSource('plateau', {}).source).toBe('plateau')
  })

  it('does not silently use Cesium example credentials for Google', () => {
    const result = resolveUrbanBuildingSource('google', { googleMapsApiKey: '  ', cesiumIonToken: '' })
    expect(result.source).toBe('white')
    expect(result.googleAvailable).toBe(false)
    expect(result.notice).toContain('未配置')
  })

  it.each([{ googleMapsApiKey: 'configured-test-value' }, { cesiumIonToken: 'configured-test-value' }])('does not treat local collision geometry as Google collision coverage', credentials => {
    expect(resolveUrbanBuildingSource('google', credentials)).toMatchObject({ source: 'google', googleAvailable: true, navigationAvailable: false })
  })
})
