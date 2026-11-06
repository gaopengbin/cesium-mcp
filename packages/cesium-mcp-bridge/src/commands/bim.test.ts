import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Cesium from 'cesium'
import { queryBimElements, getBimElement, aggregateBimElements, focusBimElements, selectBimElements, filterBimElements, clearBimSelection, snapBimElement } from './bim.js'
import { LayerManager } from './layer.js'

const savedToken = Cesium.Ion.defaultAccessToken
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); Cesium.Ion.defaultAccessToken = savedToken })
function setup() {
  Cesium.Ion.defaultAccessToken = 'private-test-token'
  const viewer = { scene: { requestRender: vi.fn(), canvas: { clientWidth: 1000, clientHeight: 750 } }, camera: { flyToBoundingSphere: vi.fn(), viewBoundingSphere: vi.fn(), lookAtTransform: vi.fn() } } as unknown as Cesium.Viewer
  const manager = new LayerManager(viewer)
  const base = new Cesium.Cesium3DTileStyle({ color: "color('blue')", show: '${visible} === true' })
  const tileset = { style: base, modelMatrix: Cesium.Matrix4.IDENTITY } as Cesium.Cesium3DTileset
  manager.setCesiumRefs('bim', { tileset, ionAssetId: 42 })
  const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [{ id: '9007199254740993' }], total: 2, continuationToken: 'opaque+cursor' }))
  vi.stubGlobal('fetch', fetcher)
  return { viewer, manager, base, tileset, fetcher }
}
const feature = (id: string, visible = true) => ({ getProperty: (name: string) => name === 'element' ? BigInt(id) : visible, getPropertyInherited: () => visible }) as unknown as Cesium.Cesium3DTileFeature

describe('BIM elements workflow', () => {
  it('uses the real unversioned ECEF/snap route family without putting credentials in the SDK URL', async () => {
    const { manager, viewer, fetcher } = setup()
    fetcher.mockResolvedValueOnce(Response.json({ ecefTransform: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]] }))
    vi.spyOn(Cesium.IonSnapService.prototype, 'snap').mockImplementation(async function(this: Cesium.IonSnapService, options) {
      const resource = (this as unknown as { _resource: Cesium.Resource })._resource
      expect(new URL(resource.url).pathname).toBe('/assets/42/')
      expect(new URL(resource.url).search).toBe('')
      expect(resource.headers.Authorization).toBe('Bearer private-test-token')
      expect(options.elementId).toBe('0x20000000000001')
      return undefined
    })
    const result = await snapBimElement(viewer, manager, { layerId: 'bim', elementId: '9007199254740993', position: [10, 20, 30] })
    expect(new URL(fetcher.mock.calls[0]![0]).pathname).toBe('/assets/42/ecef')
    expect(result.snapped).toBe(false)
  })
  it('uses official cursor/filter parameters and never sends credentials in a URL', async () => {
    const { manager, fetcher } = setup()
    const filter = { 'IFC Class Name': 'ifcwall' }
    const result = await queryBimElements(manager, { layerId: 'bim', filter, top: 2, continuationToken: 'a+b' })
    const [url, init] = fetcher.mock.calls[0]!
    expect(new URL(url).pathname).toBe('/v1/assets/42/elements')
    expect(new URL(url).searchParams.get('filter')).toBe(JSON.stringify(filter))
    expect(new URL(url).searchParams.get('continuationToken')).toBe('a+b')
    expect(init.headers.Authorization).toBe('Bearer private-test-token')
    expect(String(url)).not.toContain('private-test-token')
    expect(result.items[0]!.id).toBe('9007199254740993')
    expect(result.continuationToken).toBe('opaque+cursor')
  })
  it('aggregates on the server across all matches, preserves nulls, and rejects lossy IDs', async () => {
    const { manager, fetcher } = setup()
    fetcher.mockResolvedValueOnce(Response.json({ aggregations: [{ key: 'Volume.Net', count: 0, min: null, max: null, avg: null, sum: 0 }], total: 5120 }))
    const result = await aggregateBimElements(manager, { layerId: 'bim', propertyKeys: ['Volume.Net'] })
    expect(result.total).toBe(5120)
    expect(result.aggregations[0]).toMatchObject({ propertyKey: 'Volume.Net', min: null, count: 0 })
    expect(new URL(fetcher.mock.calls[0]![0]).searchParams.get('aggregations')).toBe('["Volume.Net"]')
    fetcher.mockResolvedValueOnce(Response.json({ id: 9007199254740992 }))
    await expect(getBimElement(manager, { layerId: 'bim', elementId: '1' })).rejects.toThrow(/precision/i)
  })
  it('highlights and isolates exact bigint IDs, respects base visibility and restores the original style', () => {
    const { manager, viewer, tileset, base } = setup()
    selectBimElements(viewer, manager, { layerId: 'bim', elementIds: ['9007199254740993'], isolate: true, color: '#ff0000' })
    expect(tileset.style!.show.evaluate(feature('9007199254740993'))).toBe(true)
    expect(tileset.style!.show.evaluate(feature('9007199254740992'))).toBe(false)
    expect(tileset.style!.show.evaluate(feature('9007199254740993', false))).toBe(false)
    expect(tileset.style!.color.evaluateColor(feature('9007199254740993'), new Cesium.Color())).toEqual(Cesium.Color.RED)
    clearBimSelection(viewer, manager, { layerId: 'bim' })
    expect(tileset.style).toBe(base)
  })
  it('never applies a partial visual filter and preserves existing selection on failures', async () => {
    const { manager, viewer, tileset } = setup()
    selectBimElements(viewer, manager, { layerId: 'bim', elementIds: ['1'] })
    const previous = tileset.style
    await expect(filterBimElements(viewer, manager, { layerId: 'bim', filter: {}, maxElements: 1 })).rejects.toThrow(/limit|complete/i)
    expect(tileset.style).toBe(previous)
  })
  it('follows every page and isolates empty results correctly', async () => {
    const { manager, viewer, fetcher, tileset } = setup()
    fetcher.mockResolvedValueOnce(Response.json({ items: [{ id: '1' }], total: 2, continuationToken: 'next' }))
    fetcher.mockResolvedValueOnce(Response.json({ items: [{ id: '2' }], total: 2 }))
    expect(await filterBimElements(viewer, manager, { layerId: 'bim', filter: {} })).toMatchObject({ selected: 2, isolate: true })
    expect(tileset.style!.show.evaluate(feature('2'))).toBe(true)
    fetcher.mockResolvedValueOnce(Response.json({ items: [], total: 0 }))
    await filterBimElements(viewer, manager, { layerId: 'bim', filter: {} })
    expect(tileset.style!.show.evaluate(feature('2'))).toBe(false)
  })
  it('frames geolocated bounds without confusing radius and camera altitude', async () => {
    const { manager, viewer, fetcher } = setup()
    fetcher.mockResolvedValueOnce(Response.json({ id: '1', location: { center: { longitude: 10, latitude: 20, height: 30 }, radius: 5 } }))
    await focusBimElements(viewer, manager, { layerId: 'bim', elementIds: ['1'], duration: 0 })
    expect(viewer.camera.viewBoundingSphere).toHaveBeenCalledWith(expect.objectContaining({ radius: 5 }), expect.anything())
  })
  it('redacts upstream errors and does not apply results after layer replacement or cancellation', async () => {
    const { manager, viewer, fetcher } = setup()
    fetcher.mockResolvedValueOnce(new Response('private-test-token', { status: 403 }))
    await expect(queryBimElements(manager, { layerId: 'bim' })).rejects.toThrow('HTTP 403')
    const controller = new AbortController()
    controller.abort()
    await expect(focusBimElements(viewer, manager, { layerId: 'bim', elementIds: ['1'] }, controller.signal)).rejects.toThrow()
    fetcher.mockImplementationOnce(async () => {
      manager.setCesiumRefs('bim', { tileset: {} as Cesium.Cesium3DTileset, ionAssetId: 42 })
      return Response.json({ items: [], total: 0 })
    })
    await expect(filterBimElements(viewer, manager, { layerId: 'bim', filter: {} })).rejects.toThrow(/replaced|removed/i)
  })
  it('discard stale async filters after a newer selection and restore styles on disposal', async () => {
    const { manager, viewer, fetcher, tileset, base } = setup()
    let release!: (value: Response) => void
    fetcher.mockImplementationOnce(() => new Promise<Response>(done => { release = done }))
    const pending = filterBimElements(viewer, manager, { layerId: 'bim', filter: {} })
    selectBimElements(viewer, manager, { layerId: 'bim', elementIds: ['2'] })
    const selected = tileset.style
    release(Response.json({ items: [{ id: '1' }], total: 1 }))
    await expect(pending).rejects.toThrow(/stale/i)
    expect(tileset.style).toBe(selected)
    manager.dispose()
    expect(tileset.style).toBe(base)
  })
  it('does not turn an unlocated element into an origin camera jump', async () => {
    const { manager, viewer, fetcher } = setup()
    fetcher.mockResolvedValueOnce(Response.json({ id: '1' }))
    await expect(focusBimElements(viewer, manager, { layerId: 'bim', elementIds: ['1'] })).rejects.toThrow(/geolocation/i)
    expect(viewer.camera.flyToBoundingSphere).not.toHaveBeenCalled()
  })
  it('requires ion provenance and does not overwrite an application-owned newer style on clear', async () => {
    const { manager, viewer, tileset } = setup()
    manager.setCesiumRefs('local', { tileset })
    await expect(queryBimElements(manager, { layerId: 'local' })).rejects.toThrow(/ionAssetId/i)
    selectBimElements(viewer, manager, { layerId: 'bim', elementIds: ['1'] })
    const newer = new Cesium.Cesium3DTileStyle({ color: "color('green')" })
    tileset.style = newer
    clearBimSelection(viewer, manager, { layerId: 'bim' })
    expect(tileset.style).toBe(newer)
  })
})
