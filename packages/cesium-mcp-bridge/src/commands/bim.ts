import * as Cesium from 'cesium'
import type { LayerManager } from './layer.js'
import type { BimElement, BimLayerParams, QueryBimElementsParams, GetBimElementParams, GetBimTreeParams, AggregateBimElementsParams, SelectBimElementsParams, FilterBimElementsParams, FocusBimElementsParams, BimElementPage, BimAggregationResult, SnapBimElementParams } from '../types.js'
import { awaitOperation } from '../operation.js'
import { worldPosition, geographicPosition } from './advanced.js'

function context(manager: LayerManager, layerId: string) {
  const refs = manager.getCesiumRefs(layerId)
  if (!refs?.tileset || !Number.isSafeInteger(refs.ionAssetId) || refs.ionAssetId! <= 0) {
    throw new Error('BIM requires a managed 3D Tiles layer loaded with ionAssetId and an ion BIM/CAD database')
  }
  return refs as typeof refs & { tileset: Cesium.Cesium3DTileset; ionAssetId: number }
}

function unchanged(manager: LayerManager, layerId: string, refs: ReturnType<typeof context>, signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (manager.getCesiumRefs(layerId) !== refs) throw new Error('BIM layer was removed or replaced during the operation')
}

function elementId(value: unknown): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Element ID precision would be lost; use decimal string IDs')
  const id = String(value)
  if (!/^(0|[1-9]\d{0,19})$/.test(id)) throw new Error('Invalid BIM element ID: expected a decimal string')
  return id
}

function filterText(filter: QueryBimElementsParams['filter']): string | undefined {
  if (filter === undefined) return undefined
  const text = typeof filter === 'string' ? filter : JSON.stringify(filter)
  if (!text || text.length > 8192) throw new Error('BIM filter must contain at most 8192 characters')
  return text
}

/** Same ion Asset Elements REST endpoints used by IonAssetElementService 1.147. */
async function request(manager: LayerManager, layerId: string, path: string, query: Record<string, string | number | undefined>, signal?: AbortSignal, versioned = true): Promise<Record<string, any>> {
  const refs = context(manager, layerId)
  signal?.throwIfAborted()
  const server = Cesium.Ion.defaultServer
  const base = new URL(typeof server === 'string' ? server : server.url)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
  if (base.username || base.password || base.search || base.hash || !(base.protocol === 'https:' || base.protocol === 'http:' && loopback)) throw new Error('Invalid ion server URL')
  if (!base.pathname.endsWith('/')) base.pathname += '/'
  const url = new URL(`${versioned ? 'v1/' : ''}assets/${refs.ionAssetId}/${path}`, base)
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value))
  const token = Cesium.Ion.defaultAccessToken
  if (!token) throw new Error('Configure an ion access token with read permission before querying BIM elements')
  let response: Response
  try {
    response = await fetch(url.href, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    })
  } catch {
    signal?.throwIfAborted()
    throw new Error('ion BIM request failed or timed out; check network access and asset permissions')
  }
  unchanged(manager, layerId, refs, signal)
  if (!response.ok) throw new Error(`ion BIM request failed (HTTP ${response.status}); verify asset database support and token read permission`)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty ion BIM response')
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (length > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('ion BIM response exceeds 4 MiB; reduce page size') }
    chunks.push(value)
  }
  unchanged(manager, layerId, refs, signal)
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  let data
  try { data = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Error('Invalid JSON from ion BIM service') }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid ion BIM response')
  return data
}

export async function queryBimElements(manager: LayerManager, params: QueryBimElementsParams, signal?: AbortSignal): Promise<BimElementPage> {
  if (!Number.isSafeInteger(params.top ?? 100) || (params.top ?? 100) < 1 || (params.top ?? 100) > 1000) throw new Error('BIM page size must be 1–1000')
  const data = await request(manager, params.layerId, 'elements', { top: params.top ?? 100, continuationToken: params.continuationToken, filter: filterText(params.filter) }, signal)
  if (!Array.isArray(data.items) || data.items.length > (params.top ?? 100)) throw new Error('Invalid BIM element page')
  if (data.continuationToken !== undefined && typeof data.continuationToken !== 'string') throw new Error('Invalid BIM continuation token')
  if (data.total != null && (!Number.isSafeInteger(data.total) || data.total < 0)) throw new Error('Invalid BIM element total')
  return { layerId: params.layerId, items: data.items.map((item: BimElement) => ({ ...item, id: elementId(item.id) })), total: data.total ?? null, ...(data.continuationToken ? { continuationToken: data.continuationToken } : {}) }
}

export async function getBimElement(manager: LayerManager, params: GetBimElementParams, signal?: AbortSignal): Promise<BimElement> {
  const id = elementId(params.elementId)
  const data = await request(manager, params.layerId, `elements/${id}`, {}, signal)
  if (elementId(data.id) !== id) throw new Error('ion returned a different BIM element')
  return { ...data, id } as BimElement
}

export async function getBimTree(manager: LayerManager, params: GetBimTreeParams, signal?: AbortSignal) {
  const data = await request(manager, params.layerId, 'tree/children', { nodeKey: params.nodeKey }, signal)
  if (!Array.isArray(data.nodes)) throw new Error('Invalid BIM tree response')
  const nodes = data.nodes.map((node: Record<string, unknown>) => {
    if (typeof node.key !== 'string' || typeof node.label !== 'string' || typeof node.hasChildren !== 'boolean' || !['subject', 'model', 'category', 'element'].includes(String(node.kind))) throw new Error('Invalid BIM tree node')
    return { key: node.key, label: node.label, hasChildren: node.hasChildren, kind: node.kind, ...(node.id != null ? { id: elementId(node.id) } : {}) }
  })
  return { layerId: params.layerId, nodes }
}

export async function getBimElementParents(manager: LayerManager, params: GetBimElementParams, signal?: AbortSignal) {
  const data = await request(manager, params.layerId, 'tree/parents', { elementId: elementId(params.elementId) }, signal)
  if (!Array.isArray(data.path)) throw new Error('Invalid BIM parent path')
  const path = data.path.map((node: Record<string, unknown>) => {
    if (!['subject', 'model', 'category', 'element'].includes(String(node.kind))) throw new Error('Invalid BIM parent kind')
    return { kind: node.kind, id: elementId(node.id) }
  })
  return { layerId: params.layerId, path }
}

export async function snapBimElement(viewer: Cesium.Viewer, manager: LayerManager, params: SnapBimElementParams, signal?: AbortSignal) {
  const refs = context(manager, params.layerId)
  const id = elementId(params.elementId)
  if (!Cesium.Matrix4.equals(refs.tileset.modelMatrix, Cesium.Matrix4.IDENTITY)) throw new Error('Server snapping requires untransformed ion geometry; reset heightOffset/modelMatrix')
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
  const data = await request(manager, params.layerId, 'ecef', {}, signal, false)
  const values = data.ecefTransform?.flat()
  if (!Array.isArray(values) || values.length !== 16 || !values.every(Number.isFinite)) throw new Error('BIM asset has no valid ECEF transform for precise snapping')
  const server = Cesium.Ion.defaultServer
  const base = typeof server === 'string' ? server : server.url
  const resource = new Cesium.Resource({ url: new URL(`assets/${refs.ionAssetId}/`, base.endsWith('/') ? base : base + '/').href, headers: { Authorization: `Bearer ${Cesium.Ion.defaultAccessToken}` } })
  const service = new Cesium.IonSnapService({ assetId: refs.ionAssetId, resource, ecefTransform: Cesium.Matrix4.fromRowMajorArray(values) })
  let hit
  try {
    hit = await awaitOperation(service.snap({ elementId: `0x${BigInt(id).toString(16)}`, testPoint: worldPosition(params.position), camera: viewer.camera, canvasWidth: viewer.scene.canvas.clientWidth, canvasHeight: viewer.scene.canvas.clientHeight, snapAperture: params.snapAperture }), signal)
  } catch {
    signal.throwIfAborted()
    throw new Error('ion precise snap failed; verify BIM geometry support and asset read permission')
  }
  unchanged(manager, params.layerId, refs, signal)
  return hit?.snapPoint ? { layerId: params.layerId, elementId: id, snapped: true, position: geographicPosition(hit.snapPoint), geometryType: hit.geometryType } : { layerId: params.layerId, elementId: id, snapped: false }
}

export async function aggregateBimElements(manager: LayerManager, params: AggregateBimElementsParams, signal?: AbortSignal): Promise<BimAggregationResult> {
  if (!Array.isArray(params.propertyKeys) || !params.propertyKeys.length || params.propertyKeys.length > 20 || params.propertyKeys.some(key => typeof key !== 'string' || !key || key.length > 500) || new Set(params.propertyKeys).size !== params.propertyKeys.length) throw new Error('Supply 1–20 unique numeric property keys')
  const data = await request(manager, params.layerId, 'elements/aggregate', { aggregations: JSON.stringify(params.propertyKeys), filter: filterText(params.filter) }, signal)
  if (!Array.isArray(data.aggregations) || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error('Invalid BIM aggregation response')
  const aggregations = data.aggregations.map((row: Record<string, unknown>) => {
    const propertyKey = row.key ?? row.propertyKey
    if (typeof propertyKey !== 'string' || !params.propertyKeys.includes(propertyKey) || !Number.isSafeInteger(row.count) || Number(row.count) < 0 || !Number.isFinite(row.sum)
      || ['min', 'max', 'avg'].some(key => row[key] !== null && !Number.isFinite(row[key]))) throw new Error('Invalid BIM aggregation values')
    return { propertyKey, count: row.count, min: row.min, max: row.max, avg: row.avg, sum: row.sum }
  })
  if (new Set(aggregations.map((row: { propertyKey: string }) => row.propertyKey)).size !== params.propertyKeys.length) throw new Error('Incomplete BIM aggregations')
  return { layerId: params.layerId, total: data.total, aggregations, scope: 'all-matching-elements', units: 'Source property units; no conversion or mixed-unit normalization is performed' } as BimAggregationResult
}

export function clearBimSelection(viewer: Cesium.Viewer, manager: LayerManager, params: BimLayerParams) {
  const refs = context(manager, params.layerId)
  refs.bimRevision = (refs.bimRevision ?? 0) + 1
  refs.bimFocusRevision = (refs.bimFocusRevision ?? 0) + 1
  if (refs.bimSelectionStyle && refs.tileset.style === refs.bimSelectionStyle) refs.tileset.style = refs.bimBaseStyle!
  refs.bimSelectionStyle = undefined
  refs.bimBaseStyle = undefined
  viewer.scene.requestRender()
  return { layerId: params.layerId, cleared: true }
}

/** Expressions are evaluated again for newly streamed features, not just loaded tiles. */
export function selectBimElements(viewer: Cesium.Viewer, manager: LayerManager, params: SelectBimElementsParams) {
  const refs = context(manager, params.layerId)
  if (!Array.isArray(params.elementIds) || params.elementIds.length > 10000) throw new Error('BIM selection limit is 10000 elements')
  const ids = new Set(params.elementIds.map(elementId))
  const color = Cesium.Color.fromCssColorString(params.color ?? '#ffff00')
  if (!color) throw new Error('Invalid BIM highlight color')
  const base = refs.bimSelectionStyle && refs.tileset.style === refs.bimSelectionStyle ? refs.bimBaseStyle : refs.tileset.style
  const style = new Cesium.Cesium3DTileStyle(base?.style)
  const matches = (feature: Cesium.Cesium3DTileFeature) => {
    try { return ids.has(elementId(feature.getProperty('element'))) } catch { return false }
  }
  style.show = { evaluate: (feature: Cesium.Cesium3DTileFeature) => Boolean(base?.show?.evaluate(feature) ?? true) && (!params.isolate || matches(feature)), evaluateColor: () => Cesium.Color.WHITE }
  const evaluateColor = (feature: Cesium.Cesium3DTileFeature, result: Cesium.Color) => matches(feature) ? Cesium.Color.clone(color, result) : base?.color?.evaluateColor(feature, result) ?? Cesium.Color.clone(Cesium.Color.WHITE, result)
  style.color = { evaluateColor, evaluate: (feature: Cesium.Cesium3DTileFeature) => evaluateColor(feature, new Cesium.Color()) }
  refs.bimBaseStyle = base
  refs.bimRevision = (refs.bimRevision ?? 0) + 1
  refs.bimSelectionStyle = style
  refs.tileset.style = style
  viewer.scene.requestRender()
  return { layerId: params.layerId, selected: ids.size, isolate: params.isolate ?? false, scope: 'element-ids', renderedCount: 'Depends on visible streamed tiles' }
}

export async function filterBimElements(viewer: Cesium.Viewer, manager: LayerManager, params: FilterBimElementsParams, signal?: AbortSignal) {
  const refs = context(manager, params.layerId)
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000)
  const revision = refs.bimRevision = (refs.bimRevision ?? 0) + 1
  const bound = params.maxElements ?? 5000
  if (!Number.isSafeInteger(bound) || bound < 1 || bound > 10000) throw new Error('Visual BIM filter limit must be 1–10000')
  const ids = new Set<string>()
  const cursors = new Set<string>()
  let continuationToken: string | undefined
  do {
    const page = await queryBimElements(manager, { layerId: params.layerId, filter: params.filter, top: Math.min(1000, bound - ids.size + 1), continuationToken }, signal)
    for (const item of page.items) ids.add(item.id)
    if (ids.size > bound || page.total !== null && page.total > bound || ids.size === bound && page.continuationToken) throw new Error('Visual filter exceeds element limit; narrow the filter. Previous selection is unchanged')
    continuationToken = page.continuationToken
    if (!continuationToken && page.total !== null && ids.size !== page.total) throw new Error('Incomplete BIM filter response; previous selection is unchanged')
    if (continuationToken && (cursors.has(continuationToken) || cursors.size >= 100)) throw new Error('Cannot complete BIM pagination; previous selection is unchanged')
    if (continuationToken) cursors.add(continuationToken)
  } while (continuationToken)
  unchanged(manager, params.layerId, refs, signal)
  if (refs.bimRevision !== revision) throw new Error('BIM selection changed while filtering; stale filter discarded')
  return selectBimElements(viewer, manager, { layerId: params.layerId, elementIds: [...ids], isolate: true, color: params.color })
}

export async function focusBimElements(viewer: Cesium.Viewer, manager: LayerManager, params: FocusBimElementsParams, signal?: AbortSignal) {
  const refs = context(manager, params.layerId)
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000)
  const revision = refs.bimFocusRevision = (refs.bimFocusRevision ?? 0) + 1
  if (!Array.isArray(params.elementIds) || !params.elementIds.length || params.elementIds.length > 50) throw new Error('Focus requires 1–50 BIM element IDs')
  const ids = [...new Set(params.elementIds.map(elementId))]
  const spheres: Cesium.BoundingSphere[] = []
  const unlocatedIds: string[] = []
  // Small batches bound concurrent network traffic. No camera changes until all reads succeed.
  for (let offset = 0; offset < ids.length; offset += 5) {
    const elements = await Promise.all(ids.slice(offset, offset + 5).map(id => getBimElement(manager, { layerId: params.layerId, elementId: id }, signal)))
    for (const element of elements) {
      const center = element.location?.center
      const radius = element.location?.radius ?? 0
      if (!center || !Number.isFinite(center.longitude) || Math.abs(center.longitude) > 180 || !Number.isFinite(center.latitude) || Math.abs(center.latitude) > 90 || !Number.isFinite(center.height ?? 0) || !Number.isFinite(radius) || radius < 0) { unlocatedIds.push(element.id); continue }
      spheres.push(Cesium.BoundingSphere.transform(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(center.longitude, center.latitude, center.height ?? 0), radius), refs.tileset.modelMatrix))
    }
  }
  unchanged(manager, params.layerId, refs, signal)
  if (refs.bimFocusRevision !== revision) throw new Error('A newer BIM focus operation superseded this request')
  if (!spheres.length) throw new Error('No queried BIM elements have valid geolocation; camera unchanged')
  const sphere = Cesium.BoundingSphere.fromBoundingSpheres(spheres)
  const offset = new Cesium.HeadingPitchRange(0, -Math.PI / 4, Math.max(sphere.radius * 3, 10))
  if (params.duration === 0) {
    viewer.camera.viewBoundingSphere(sphere, offset)
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  } else viewer.camera.flyToBoundingSphere(sphere, { duration: params.duration ?? 1.5, offset })
  viewer.scene.requestRender()
  return { layerId: params.layerId, focused: spheres.length, unlocatedIds, radius: sphere.radius }
}
