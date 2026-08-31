import * as Cesium from 'cesium'
import type {
  SpatialBounds,
  SpatialContext,
  SpatialObject,
} from 'cesium-mcp-spatial'
import type { CesiumBridge } from './bridge.js'
import { getView } from './commands/view.js'
import { createBridgeSpatialSnapshot } from './spatial-context.js'
import type {
  CaptureObserverViewParams,
  CaptureObserverViewResult,
  ObserverTargetState,
} from './types.js'

const OBSERVER_LIMITATIONS = [
  'This experimental renderer mirrors managed Point, LineString, and Polygon geometry from the spatial snapshot.',
  'Managed imagery providers are reused when available; 3D Tiles, terrain, post-processing, and pixel-perfect application styling are not mirrored yet.',
]

const OBSERVER_SAMPLE_WIDTH = 64
const OBSERVER_SAMPLE_HEIGHT = 36
const OBSERVER_MIN_WARMUP_FRAMES = 4
const OBSERVER_REQUIRED_STABLE_FRAMES = 3
const OBSERVER_MAX_RENDER_FRAMES = 300
const OBSERVER_FRAME_DELAY_MS = 16

const OBSERVER_DEFAULT_VIEW = {
  range: 3500,
  heading: 225,
  pitch: -35,
}

const OBSERVER_VIEW_PRESETS = {
  overview: { range: 6500, heading: 225, pitch: -55 },
  detail: { range: 2200, heading: 225, pitch: -32 },
  'eye-level': { range: 700, heading: 225, pitch: -10 },
} as const

interface ObserverGeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id: string
    geometry: NonNullable<SpatialObject['geometry']>
    properties: Record<string, unknown>
  }>
}

export interface ObserverPixelAnalysis {
  blank: boolean
  opaquePixelCount: number
  colorBucketCount: number
  colorRange: number
}

export interface ObserverFrameReadiness {
  dataSourcesReady: boolean
  globeTilesLoaded: boolean
  frameHasContent: boolean
}

export interface ObserverRenderReadinessResult {
  state: 'ready'
  framesRendered: number
  stableFrameCount: number
  dataSourcesReady: true
  globeTilesLoaded: true
  frameHasContent: true
}

export interface ObserverImageryState {
  imageryProvider: Cesium.ImageryProvider
  show: boolean
  alpha: number
  brightness: number
  contrast: number
  hue: number
  saturation: number
  gamma: number
}

export interface CameraVectorSnapshot {
  position: Cesium.Cartesian3
  direction: Cesium.Cartesian3
  up: Cesium.Cartesian3
  right: Cesium.Cartesian3
  transform: Cesium.Matrix4
}

export interface ObserverCaptureRenderer {
  capture(
    params: CaptureObserverViewParams,
    signal?: AbortSignal,
  ): Promise<CaptureObserverViewResult>
  dispose(): void
}

export type ObserverRendererFactory = (bridge: CesiumBridge) => ObserverCaptureRenderer

export function captureCameraVectorSnapshot(camera: Cesium.Camera): CameraVectorSnapshot {
  return {
    position: Cesium.Cartesian3.clone(camera.positionWC),
    direction: Cesium.Cartesian3.clone(camera.directionWC),
    up: Cesium.Cartesian3.clone(camera.upWC),
    right: Cesium.Cartesian3.clone(camera.rightWC),
    transform: Cesium.Matrix4.clone(camera.transform),
  }
}

export function cameraVectorSnapshotsEqual(
  left: CameraVectorSnapshot,
  right: CameraVectorSnapshot,
): boolean {
  return Cesium.Cartesian3.equals(left.position, right.position)
    && Cesium.Cartesian3.equals(left.direction, right.direction)
    && Cesium.Cartesian3.equals(left.up, right.up)
    && Cesium.Cartesian3.equals(left.right, right.right)
    && Cesium.Matrix4.equals(left.transform, right.transform)
}

export function analyzeObserverPixelBuffer(
  pixels: Uint8ClampedArray,
): ObserverPixelAnalysis {
  let opaquePixelCount = 0
  let minRed = 255
  let minGreen = 255
  let minBlue = 255
  let maxRed = 0
  let maxGreen = 0
  let maxBlue = 0
  const colorBuckets = new Set<number>()

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0
    if (alpha <= 8) continue

    const red = pixels[index] ?? 0
    const green = pixels[index + 1] ?? 0
    const blue = pixels[index + 2] ?? 0
    opaquePixelCount += 1
    minRed = Math.min(minRed, red)
    minGreen = Math.min(minGreen, green)
    minBlue = Math.min(minBlue, blue)
    maxRed = Math.max(maxRed, red)
    maxGreen = Math.max(maxGreen, green)
    maxBlue = Math.max(maxBlue, blue)
    colorBuckets.add((red >> 4) << 8 | (green >> 4) << 4 | (blue >> 4))
  }

  const colorRange = opaquePixelCount === 0
    ? 0
    : Math.max(maxRed - minRed, maxGreen - minGreen, maxBlue - minBlue)

  return {
    blank: opaquePixelCount === 0 || (colorRange < 8 && colorBuckets.size < 4),
    opaquePixelCount,
    colorBucketCount: colorBuckets.size,
    colorRange,
  }
}

export function advanceObserverStableFrameCount(
  previousCount: number,
  readiness: ObserverFrameReadiness,
): number {
  return readiness.dataSourcesReady
    && readiness.globeTilesLoaded
    && readiness.frameHasContent
    ? previousCount + 1
    : 0
}

export function buildObserverFeatureCollection(
  objects: readonly SpatialObject[],
): ObserverGeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: objects
      .filter((object): object is SpatialObject & { geometry: NonNullable<SpatialObject['geometry']> } =>
        Boolean(object.geometry),
      )
      .map(object => ({
        type: 'Feature' as const,
        id: object.objectId,
        geometry: object.geometry,
        properties: {
          objectId: object.objectId,
          semanticType: object.type,
          name: object.name ?? object.objectId,
          sourceType: object.sourceType,
          geometryQuality: object.geometryQuality,
          ...(object.layerId ? { layerId: object.layerId } : {}),
          ...(object.resourceId ? { resourceId: object.resourceId } : {}),
        },
      })),
  }
}

export function collectManagedObserverImagery(
  bridge: CesiumBridge,
): ObserverImageryState[] {
  const imagery: ObserverImageryState[] = []
  for (const layer of bridge.layerManager.layers) {
    const source = bridge.layerManager.getCesiumRefs(layer.id)?.imageryLayer
    if (!source) continue
    imagery.push({
      imageryProvider: source.imageryProvider,
      show: source.show,
      alpha: source.alpha,
      brightness: source.brightness,
      contrast: source.contrast,
      hue: source.hue,
      saturation: source.saturation,
      gamma: source.gamma,
    })
  }
  return imagery
}

export class ObserverRenderer implements ObserverCaptureRenderer {
  private readonly _bridge: CesiumBridge
  private _container?: HTMLDivElement
  private _viewer?: Cesium.Viewer
  private _disposed = false

  constructor(bridge: CesiumBridge) {
    this._bridge = bridge
  }

  async capture(
    params: CaptureObserverViewParams,
    signal?: AbortSignal,
  ): Promise<CaptureObserverViewResult> {
    if (this._disposed) throw new Error('ObserverRenderer has been disposed')
    if (signal?.aborted) throw new Error('Observer capture cancelled')

    const imageWidth = params.imageWidth ?? 1024
    const imageHeight = params.imageHeight ?? 576
    const userCameraBefore = captureCameraVectorSnapshot(this._bridge.viewer.camera)
    const snapshot = createBridgeSpatialSnapshot(this._bridge)
    const target = resolveObserverTarget(params, snapshot.context)
    const sourceObjects = snapshot.context.list()
    const observer = this._ensureViewer(imageWidth, imageHeight)

    syncObserverImagery(observer, collectManagedObserverImagery(this._bridge))
    observer.dataSources.removeAll(true)
    const dataSource = await Cesium.GeoJsonDataSource.load(
      buildObserverFeatureCollection(sourceObjects) as any,
      {
        clampToGround: false,
        stroke: Cesium.Color.fromCssColorString('#78d6ef'),
        fill: Cesium.Color.fromCssColorString('#ef6a5b').withAlpha(0.34),
        strokeWidth: 3,
        markerColor: Cesium.Color.fromCssColorString('#48d9b0'),
        markerSize: 18,
      },
    )
    if (signal?.aborted) throw new Error('Observer capture cancelled')
    await observer.dataSources.add(dataSource)
    styleObserverEntities(dataSource)

    observer.camera.lookAt(
      Cesium.Cartesian3.fromDegrees(target.longitude, target.latitude, target.height),
      new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(target.heading),
        Cesium.Math.toRadians(target.pitch),
        target.range,
      ),
    )
    const readiness = await renderObserverUntilReady(observer, signal)
    const image = captureObserverCanvas(observer)
    const bounds = observerViewBounds(observer)
    const visibleObjectIds = bounds
      ? snapshot.context.query({ bbox: bounds, limit: 500 })
        .filter(object => Boolean(object.geometry))
        .map(object => object.objectId)
      : []
    const userCameraAfter = captureCameraVectorSnapshot(this._bridge.viewer.camera)
    const userCameraUnchanged = cameraVectorSnapshotsEqual(userCameraBefore, userCameraAfter)

    return {
      ...image,
      camera: getView(observer),
      target,
      observedAt: new Date().toISOString(),
      ...(bounds ? { bounds } : {}),
      visibleObjectIds,
      objectCount: visibleObjectIds.length,
      quality: 'derived',
      basis: 'observer-viewer-spatial-snapshot',
      readiness,
      userCameraUnchanged,
      limitations: [...OBSERVER_LIMITATIONS],
    }
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    if (this._viewer && !this._viewer.isDestroyed()) this._viewer.destroy()
    this._viewer = undefined
    this._container?.remove()
    this._container = undefined
  }

  private _ensureViewer(width: number, height: number): Cesium.Viewer {
    if (!this._viewer) {
      if (typeof document === 'undefined') {
        throw new Error('Observer capture requires a browser DOM')
      }
      this._container = document.createElement('div')
      this._container.setAttribute('aria-hidden', 'true')
      Object.assign(this._container.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        zIndex: '-2147483647',
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: '0.001',
      })
      document.body.append(this._container)
      this._viewer = new Cesium.Viewer(this._container, {
        baseLayer: false,
        baseLayerPicker: false,
        geocoder: false,
        timeline: false,
        animation: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        homeButton: false,
        fullscreenButton: false,
        selectionIndicator: false,
        infoBox: false,
        skyBox: false,
        skyAtmosphere: false,
        useDefaultRenderLoop: false,
        requestRenderMode: false,
        showRenderLoopErrors: false,
        contextOptions: {
          webgl: {
            preserveDrawingBuffer: true,
            antialias: true,
          },
        },
      })
      this._viewer.scene.globe.depthTestAgainstTerrain = false
      this._viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#102d3b')
      this._viewer.scene.globe.showGroundAtmosphere = false
      this._viewer.scene.fog.enabled = false
      this._viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#040b10')
    }

    this._container!.style.width = `${width}px`
    this._container!.style.height = `${height}px`
    this._viewer.resize()
    return this._viewer
  }
}

function syncObserverImagery(
  viewer: Cesium.Viewer,
  sourceLayers: readonly ObserverImageryState[],
): void {
  viewer.imageryLayers.removeAll()
  for (const source of sourceLayers) {
    const layer = viewer.imageryLayers.addImageryProvider(source.imageryProvider)
    layer.show = source.show
    layer.alpha = source.alpha
    layer.brightness = source.brightness
    layer.contrast = source.contrast
    layer.hue = source.hue
    layer.saturation = source.saturation
    layer.gamma = source.gamma
  }
}

async function renderObserverUntilReady(
  viewer: Cesium.Viewer,
  signal?: AbortSignal,
): Promise<ObserverRenderReadinessResult> {
  let lastAnalysis: ObserverPixelAnalysis | undefined
  let lastReadiness: ObserverFrameReadiness | undefined
  let stableFrameCount = 0

  for (let frame = 1; frame <= OBSERVER_MAX_RENDER_FRAMES; frame += 1) {
    if (signal?.aborted) throw new Error('Observer capture cancelled')

    viewer.resize()
    viewer.scene.requestRender()
    viewer.render()

    if (frame >= OBSERVER_MIN_WARMUP_FRAMES) {
      lastAnalysis = analyzeObserverCanvas(viewer.scene.canvas)
      lastReadiness = {
        dataSourcesReady: viewer.dataSourceDisplay.ready,
        globeTilesLoaded: viewer.scene.globe.tilesLoaded,
        frameHasContent: lastAnalysis ? !lastAnalysis.blank : true,
      }
      stableFrameCount = advanceObserverStableFrameCount(stableFrameCount, lastReadiness)
      if (stableFrameCount >= OBSERVER_REQUIRED_STABLE_FRAMES) {
        return {
          state: 'ready',
          framesRendered: frame,
          stableFrameCount,
          dataSourcesReady: true,
          globeTilesLoaded: true,
          frameHasContent: true,
        }
      }
    }

    await waitForObserverFrame(signal)
  }

  const pixelDetails = lastAnalysis
    ? `opaque=${lastAnalysis.opaquePixelCount}, colors=${lastAnalysis.colorBucketCount}, range=${lastAnalysis.colorRange}`
    : 'pixel-analysis=unavailable'
  const readinessDetails = lastReadiness
    ? `dataSourcesReady=${lastReadiness.dataSourcesReady}, globeTilesLoaded=${lastReadiness.globeTilesLoaded}, frameHasContent=${lastReadiness.frameHasContent}`
    : 'readiness=unavailable'
  throw new Error(`Observer Viewer did not become ready (${readinessDetails}, ${pixelDetails})`)
}

function analyzeObserverCanvas(canvas: HTMLCanvasElement): ObserverPixelAnalysis | undefined {
  try {
    const sample = document.createElement('canvas')
    sample.width = OBSERVER_SAMPLE_WIDTH
    sample.height = OBSERVER_SAMPLE_HEIGHT
    const context = sample.getContext('2d', { willReadFrequently: true })
    if (!context) return undefined

    context.drawImage(canvas, 0, 0, sample.width, sample.height)
    return analyzeObserverPixelBuffer(
      context.getImageData(0, 0, sample.width, sample.height).data,
    )
  } catch {
    return undefined
  }
}

function captureObserverCanvas(viewer: Cesium.Viewer): {
  dataUrl: string
  width: number
  height: number
} {
  const canvas = viewer.scene.canvas
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  }
}

function waitForObserverFrame(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, OBSERVER_FRAME_DELAY_MS)
    const onAbort = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      reject(new Error('Observer capture cancelled'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

export function resolveObserverTarget(
  params: CaptureObserverViewParams,
  context: SpatialContext,
): ObserverTargetState {
  const targetObjectId = params.targetObjectId?.trim()
  const hasCoordinates = params.targetLongitude !== undefined
    || params.targetLatitude !== undefined

  if (targetObjectId && hasCoordinates) {
    throw new Error('Observer target must use either targetObjectId or coordinates, not both')
  }

  let longitude: number
  let latitude: number
  let inferredHeight = 0

  if (targetObjectId) {
    const object = context.get(targetObjectId)
    if (!object) throw new Error(`Spatial object not found: ${targetObjectId}`)
    if (!object.centroid) throw new Error(`Spatial object has no centroid: ${targetObjectId}`)
    longitude = object.centroid[0]
    latitude = object.centroid[1]
    inferredHeight = Number.isFinite(object.centroid[2]) ? object.centroid[2] ?? 0 : 0
  } else {
    if (!Number.isFinite(params.targetLongitude) || !Number.isFinite(params.targetLatitude)) {
      throw new Error('Observer target requires targetObjectId or targetLongitude and targetLatitude')
    }
    longitude = params.targetLongitude as number
    latitude = params.targetLatitude as number
  }

  const view = params.preset
    ? OBSERVER_VIEW_PRESETS[params.preset]
    : OBSERVER_DEFAULT_VIEW

  return {
    ...(targetObjectId ? { targetObjectId } : {}),
    ...(params.preset ? { preset: params.preset } : {}),
    longitude,
    latitude,
    height: params.targetHeight ?? inferredHeight,
    range: params.range ?? view.range,
    heading: params.heading ?? view.heading,
    pitch: params.pitch ?? view.pitch,
  }
}

function observerViewBounds(viewer: Cesium.Viewer): SpatialBounds | undefined {
  try {
    const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid)
    if (!rectangle) return undefined
    const west = Cesium.Math.toDegrees(rectangle.west)
    const south = Cesium.Math.toDegrees(rectangle.south)
    const east = Cesium.Math.toDegrees(rectangle.east)
    const north = Cesium.Math.toDegrees(rectangle.north)
    if (east < west) return undefined
    return [west, south, east, north]
  } catch {
    return undefined
  }
}

function styleObserverEntities(dataSource: Cesium.GeoJsonDataSource): void {
  const now = Cesium.JulianDate.now()
  const pointColors: Record<string, string> = {
    school: '#48d9b0',
    hospital: '#53a8ff',
    shelter: '#67e8d0',
    'fire-station': '#ff9f43',
    'pump-station': '#b28dff',
    'water-gauge': '#36c5f0',
    bridge: '#ffd166',
  }

  for (const entity of dataSource.entities.values) {
    const semanticType = String(entity.properties?.semanticType?.getValue(now) ?? '')
    const name = String(entity.properties?.name?.getValue(now) ?? entity.name ?? entity.id)
    const color = Cesium.Color.fromCssColorString(pointColors[semanticType] ?? '#d6e3e3')

    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(color)
      entity.point.outlineColor = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString('#061018'))
      entity.point.outlineWidth = new Cesium.ConstantProperty(3)
      entity.point.pixelSize = new Cesium.ConstantProperty(16)
    }
    if (entity.billboard) {
      entity.billboard.color = new Cesium.ConstantProperty(color)
      entity.billboard.scale = new Cesium.ConstantProperty(0.82)
    }
    if (entity.point || entity.billboard) {
      entity.label = new Cesium.LabelGraphics({
        text: name,
        font: '600 13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#061018').withAlpha(0.84),
        backgroundPadding: new Cesium.Cartesian2(8, 5),
        pixelOffset: new Cesium.Cartesian2(0, -27),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 100000),
      })
    }

    if (entity.polygon) {
      const fill = semanticType === 'risk-zone' ? '#ff6259' : '#4d92b8'
      const alpha = semanticType === 'risk-zone' ? 0.38 : 0.18
      entity.polygon.material = new Cesium.ColorMaterialProperty(
        Cesium.Color.fromCssColorString(fill).withAlpha(alpha),
      )
      entity.polygon.outline = new Cesium.ConstantProperty(true)
      entity.polygon.outlineColor = new Cesium.ConstantProperty(
        Cesium.Color.fromCssColorString(fill).withAlpha(0.92),
      )
    }

    if (entity.polyline) {
      const isRiver = semanticType === 'river'
      const lineColor = isRiver ? '#2f9ed8' : '#ffd166'
      entity.polyline.material = new Cesium.ColorMaterialProperty(
        Cesium.Color.fromCssColorString(lineColor).withAlpha(0.9),
      )
      entity.polyline.width = new Cesium.ConstantProperty(isRiver ? 10 : 6)
    }
  }
}
