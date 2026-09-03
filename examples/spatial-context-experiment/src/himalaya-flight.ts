import {
  ArcGISTiledElevationTerrainProvider,
  ArcType,
  BoundingSphere,
  Camera,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ConstantPositionProperty,
  ConstantProperty,
  DebugCameraPrimitive,
  HeadingPitchRange,
  HeadingPitchRoll,
  ImageryLayer,
  IntersectionTests,
  LabelStyle,
  Matrix4,
  Math as CesiumMath,
  PerspectiveFrustum,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
  Ray,
  sampleTerrain,
  sampleTerrainMostDetailed,
  Transforms,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
} from 'cesium'
import type { Entity, TerrainProvider } from 'cesium'
import {
  buildTerrainAwareFlightPlan,
  densifyFlightRoute,
  WorldTaskRuntime,
  WorldWorkerExecutor,
} from 'cesium-mcp-spatial'
import type {
  FlightRouteCoordinate,
  ObservationReadiness,
  ObservationSensor,
  TerrainAwareFlightPlan,
  TerrainAwareFlightSample,
  WorldTaskContext,
} from 'cesium-mcp-spatial'
import {
  advanceFlightTimeline,
  aircraftModelHeadingRadians,
  cameraTrackingAlpha,
  cinematicFlightCameraIntent,
  interpolateCameraAngleRadians,
  shouldPublishFlightProgress,
} from './flight-animation.js'
import {
  createAvoidanceManeuver,
  evaluateNoFlyZoneClearanceOutcome,
  maneuverLateralOffsetMeters,
  offsetCoordinateLaterally,
  selectAvoidanceDecision,
  selectFlightAwarenessCycle,
} from './flight-awareness.js'
import type {
  FlightAvoidanceDecision,
  FlightAvoidanceDirection,
  FlightAvoidanceManeuver,
  FlightAwarenessCycleKind,
  FlightRayReading,
  NoFlyZoneClearanceOutcome,
} from './flight-awareness.js'
import {
  createHimalayaCorridorCertificate,
} from './himalaya-corridor-awareness.js'
import type {
  HimalayaTerrainWorkerInput,
  HimalayaTerrainWorkerOutput,
} from './himalaya-terrain-worker-protocol.js'
import type {
  HimalayaCorridorCertificate,
  HimalayaCorridorTrajectorySample,
} from './himalaya-corridor-awareness.js'

export const ARCGIS_WORLD_ELEVATION_URL = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'
export const ESRI_WORLD_IMAGERY_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const ESRI_WORLD_IMAGERY_CREDIT = 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community'
export const CESIUM_AI_OBSERVER_MODEL_URL = 'https://cesium.com/downloads/cesiumjs/releases/1.143/Apps/SampleData/models/CesiumAir/Cesium_Air.glb'

const INITIAL_READY_FRAME_COUNT = 3
const INITIAL_READINESS_TIMEOUT_MS = 6_000
const MAIN_FLIGHT_MAXIMUM_SCREEN_SPACE_ERROR = 3.5
const OBSERVER_FLIGHT_MAXIMUM_SCREEN_SPACE_ERROR = 5
const MAIN_FLIGHT_TILE_CACHE_SIZE = 400
const OBSERVER_FLIGHT_TILE_CACHE_SIZE = 240
const SENSOR_HEADING_OFFSETS_DEGREES = [-30, -16, 0, 16, 30] as const
const SENSOR_PITCH_DEGREES = -5
const SENSOR_RANGE_METERS = 15_000
const SENSOR_TRIGGER_DISTANCE_METERS = 12_000
const SENSOR_UPDATE_INTERVAL_MS = 250
const PROGRESS_PUBLICATION_INTERVAL_MS = 100
const VISUAL_CAPTURE_READY_FRAME_COUNT = 3
const VISUAL_CAPTURE_TIMEOUT_MS = 5_000
const VISUAL_CAPTURE_JPEG_QUALITY = 0.82
const LIVE_TRAJECTORY_REBASE_TIMEOUT_MS = 8_000
const MAX_LIVE_TRAJECTORY_HANDOFF_DISTANCE_METERS = 1_000
const MAX_VISUAL_AWARENESS_CYCLES = 3
const MIN_VISUAL_CYCLE_PROGRESS_DELTA = 0.025
const OBSTACLE_INJECTION_PROGRESS = 0.24
const OBSTACLE_ROUTE_PROGRESS = 0.42
const OBSTACLE_RADIUS_METERS = 3_800
const OBSTACLE_VERTICAL_RADIUS_METERS = 2_600
const AVOIDANCE_PROGRESS_SPAN = 0.72
const CORRIDOR_CANDIDATE_PROGRESS_SPAN = 0.72
const AVOIDANCE_OFFSET_METERS = 6_500
const NO_FLY_ZONE_SAFETY_MARGIN_METERS = 1_200
const EXECUTED_ROUTE_SAMPLE_DISTANCE_METERS = 180
const CORRIDOR_TRAJECTORY_RADIUS_METERS = 60
const REQUIRED_TERRAIN_CLEARANCE_METERS = 1_200
const CORRIDOR_TERRAIN_LONGITUDINAL_SPACING_METERS = 150
const CORRIDOR_TERRAIN_LATERAL_SPACING_METERS = 60
const CORRIDOR_TERRAIN_VERTICAL_UNCERTAINTY_METERS = 120
const CORRIDOR_TERRAIN_LEVEL = 12
const CORRIDOR_BUILD_YIELD_INTERVAL = 8
const CORRIDOR_TERRAIN_SAMPLE_CHUNK_SIZE = 16
const CAMERA_INTENT_TRANSITION_MS = 1_600
const CAMERA_TRANSITION_HALF_LIFE_MS = 360
const CAMERA_CRUISE_HALF_LIFE_MS = 110
const FOLLOW_CAMERA_DISTANCE_METERS = 3_200
const FOLLOW_CAMERA_HEIGHT_METERS = 1_150
const TERRAIN_PASS_CLEARANCE_METERS = 520
export const HIMALAYA_DYNAMIC_NO_FLY_ZONE_ID = 'himalaya-flight-dynamic-no-fly-zone'
const EXECUTED_ROUTE_ID = 'himalaya-flight-executed-route'
const SENSOR_RAY_ENTITY_IDS = SENSOR_HEADING_OFFSETS_DEGREES.map((_, index) =>
  `himalaya-flight-sensor-ray-${index + 1}`,
)

export const HIMALAYA_ROUTE_ANCHORS: readonly FlightRouteCoordinate[] = [
  { longitude: 86.7139, latitude: 27.8069, name: '南池市场' },
  { longitude: 86.8612, latitude: 27.8619, name: '阿玛达布朗峰' },
  { longitude: 86.9250, latitude: 27.9881, name: '珠穆朗玛峰' },
  { longitude: 87.0883, latitude: 27.8897, name: '马卡鲁峰' },
  { longitude: 87.2300, latitude: 27.7600, name: '阿润河谷' },
]

const ROUTE_ENTITY_IDS = [
  'himalaya-flight-naive-route',
  'himalaya-flight-planned-route',
  'himalaya-flight-aircraft',
  EXECUTED_ROUTE_ID,
  HIMALAYA_DYNAMIC_NO_FLY_ZONE_ID,
  ...SENSOR_RAY_ENTITY_IDS,
]

export type HimalayaFlightPhase = 'transition' | 'loading' | 'flying' | 'completed' | 'stopped'
export type HimalayaFlightViewMode = 'follow' | 'pov' | 'overview'
export type HimalayaFlightCameraIntent = HimalayaFlightViewMode | 'decision' | 'terrain-pass'

interface FlightCameraPose {
  destination: Cartesian3
  heading: number
  pitch: number
  roll: number
}

interface FlightCameraDirectorState {
  intent?: HimalayaFlightCameraIntent
  pose?: FlightCameraPose
  transitionUntilMs: number
}

export interface HimalayaFlightProgress {
  phase: HimalayaFlightPhase
  progress: number
  sample: TerrainAwareFlightSample
  sceneReady: boolean
  cameraIntent: HimalayaFlightCameraIntent
  sensor?: HimalayaFlightSensorFrame
  avoidance?: FlightAvoidanceManeuver
  noFlyZoneClearanceMeters?: number
  minimumNoFlyZoneClearanceMeters?: number
}

export interface HimalayaFlightSensorFrame {
  sampledAt: string
  rangeMeters: number
  readings: FlightRayReading[]
  nearestHitDistanceMeters?: number
  nearestHitType?: FlightRayReading['hitType']
}

export interface HimalayaFlightVisualFrame {
  dataUrl: string
  width: number
  height: number
  startedAt: string
  capturedAt: string
  completedAt: string
  readiness: ObservationReadiness
  changedDuringObservation: boolean
  sensor: ObservationSensor
}

export interface HimalayaFlightObstacleSnapshot {
  objectId: string
  longitude: number
  latitude: number
  height: number
  horizontalRadiusMeters: number
  verticalRadiusMeters: number
}

export interface HimalayaFlightObservationView {
  candidateId: string
  beliefRevision: number
  reason: string
  relativeHeadingDegrees: number
  pitchDegrees: number
  rangeMeters: number
  target?: readonly [number, number, number]
}

export interface HimalayaFlightCorridorCandidate {
  trajectoryId: string
  direction: FlightAvoidanceDirection
  maneuver: FlightAvoidanceManeuver
  certificate: HimalayaCorridorCertificate
  samples: readonly HimalayaFlightCorridorCandidateSample[]
}

export interface HimalayaFlightCorridorCandidateSample {
  progress: number
  sample: TerrainAwareFlightSample
  corridorTerrainHeightMeters?: number
}

export interface HimalayaFlightDecisionRequest {
  requestId: string
  runId: string
  cycle: number
  cycleKind: FlightAwarenessCycleKind
  planRevision: number
  requestedAt: string
  progress: number
  sceneReady: boolean
  routeHeadingDegrees: number
  activeObservationCount: number
  sample: TerrainAwareFlightSample
  sensor: HimalayaFlightSensorFrame
  safetySuggestion: FlightAvoidanceDecision
  obstacle: HimalayaFlightObstacleSnapshot
  corridorCandidates: readonly HimalayaFlightCorridorCandidate[]
  observationView?: HimalayaFlightObservationView
  visualFrame?: HimalayaFlightVisualFrame
}

export interface HimalayaFlightModelDecision {
  direction: FlightAvoidanceDirection
  reason: string
  model: string
  confidence?: number
}

export interface HimalayaFlightDecisionEvidence {
  source: 'model' | 'safety-fallback' | 'local-rule'
  direction: FlightAvoidanceDirection
  reason: string
  model?: string
  confidence?: number
}

export interface HimalayaFlightDecisionEvent {
  state: 'safety-committed' | 'requesting' | 'skipped' | 'observed' | 'accepted' | 'fallback'
  request: HimalayaFlightDecisionRequest
  evidence?: HimalayaFlightDecisionEvidence
  error?: string
}

export interface HimalayaFlightCameraEvent {
  mode: HimalayaFlightCameraIntent
  reason: string
  progress: number
  automatic: boolean
}

export interface HimalayaFlightDiagnostics {
  cameraIntent: HimalayaFlightCameraIntent
  safetyMarginMeters: number
  minimumNoFlyZoneClearanceMeters?: number
  unsafeSampleCount: number
  awarenessCycleCount: number
  planRevision: number
  perceptionPending: boolean
  noFlyZoneOutcome: NoFlyZoneClearanceOutcome
}

interface FlightSensorRaySegment {
  headingOffsetDegrees: number
  hitType: FlightRayReading['hitType']
  positions: readonly [Cartesian3, Cartesian3]
}

interface FlightCorridorSensingResult {
  frame: HimalayaFlightSensorFrame
  segments: FlightSensorRaySegment[]
}

export interface HimalayaFlightObservation {
  id: string
  kind: 'checkpoint' | 'avoidance'
  name: string
  observedAt: string
  progress: number
  longitude: number
  latitude: number
  terrainHeight: number
  flightHeight: number
  clearanceMeters: number
  sensor?: HimalayaFlightSensorFrame
  avoidance?: FlightAvoidanceManeuver
  decision?: HimalayaFlightDecisionEvidence
}

export interface HimalayaFlightCallbacks {
  onProgress?: (progress: HimalayaFlightProgress) => void
  onObservation?: (observation: HimalayaFlightObservation) => void
  requestAvoidanceDecision?: (
    request: HimalayaFlightDecisionRequest,
    signal: AbortSignal,
  ) => Promise<HimalayaFlightModelDecision | undefined>
  selectObservationView?: (
    request: HimalayaFlightDecisionRequest,
  ) => HimalayaFlightObservationView | undefined
  onDecision?: (event: HimalayaFlightDecisionEvent) => void
  onCameraChange?: (event: HimalayaFlightCameraEvent) => void
  observerContainer?: HTMLElement
}

export interface HimalayaFlightExperience {
  plan: TerrainAwareFlightPlan
  terrainProvider: TerrainProvider
  sampledAt: string
  sourceUrl: string
  awareness: {
    rayCount: number
    rangeMeters: number
    triggerDistanceMeters: number
    rollingReplan: true
    dynamicObstacle: true
  }
  play(options?: { durationSeconds?: number }): Promise<void>
  stop(): void
  showOverview(): Promise<void>
  setViewMode(mode: HimalayaFlightViewMode): void
  getViewMode(): HimalayaFlightViewMode
  getCameraIntent(): HimalayaFlightCameraIntent
  getDiagnostics(): HimalayaFlightDiagnostics
  dispose(): void
}

export function installHimalayaBasemap(viewer: Viewer): void {
  viewer.imageryLayers.removeAll()
  viewer.imageryLayers.addImageryProvider(createHimalayaImageryProvider())
}

export async function prepareHimalayaFlight(
  viewer: Viewer,
  callbacks: HimalayaFlightCallbacks = {},
): Promise<HimalayaFlightExperience> {
  removeFlightEntities(viewer)

  const terrainProvider = await ArcGISTiledElevationTerrainProvider.fromUrl(
    ARCGIS_WORLD_ELEVATION_URL,
  )
  viewer.scene.terrainProvider = terrainProvider
  viewer.scene.globe.depthTestAgainstTerrain = true

  const routeCoordinates = densifyFlightRoute(HIMALAYA_ROUTE_ANCHORS, 1_200)
  const cartographics = routeCoordinates.map(point =>
    Cartographic.fromDegrees(point.longitude, point.latitude),
  )
  const sampledPositions = await sampleTerrainMostDetailed(terrainProvider, cartographics, true)
  const terrainSamples = sampledPositions.map((position, index) => {
    if (!Number.isFinite(position.height)) {
      throw new Error(`ArcGIS World Elevation returned no height for route sample ${index + 1}`)
    }
    return {
      ...routeCoordinates[index]!,
      terrainHeight: position.height,
    }
  })
  const plan = buildTerrainAwareFlightPlan(terrainSamples, {
    clearanceMeters: REQUIRED_TERRAIN_CLEARANCE_METERS
      + CORRIDOR_TERRAIN_VERTICAL_UNCERTAINTY_METERS,
    maxClimbAngleDegrees: 9,
    maxDescentAngleDegrees: 10,
  })

  const plannedRoute = viewer.entities.add({
    id: ROUTE_ENTITY_IDS[1],
    name: '地形感知飞行基准路线',
    polyline: {
      positions: routePositions(plan.samples, sample => sample.flightHeight),
      width: 5,
      arcType: ArcType.NONE,
      material: new PolylineGlowMaterialProperty({
        glowPower: 0.18,
        taperPower: 0.72,
        color: Color.fromCssColorString('#4de5ba'),
      }),
    },
    properties: {
      semanticType: 'terrain-aware-flight-route',
      source: ARCGIS_WORLD_ELEVATION_URL,
      minimumClearanceMeters: plan.metrics.minimumClearanceMeters,
    },
  })
  const naiveRoute = viewer.entities.add({
    id: ROUTE_ENTITY_IDS[0],
    name: '未感知地形的朴素路线',
    polyline: {
      positions: routePositions(plan.samples, sample => sample.naiveFlightHeight),
      width: 3,
      arcType: ArcType.NONE,
      material: new PolylineDashMaterialProperty({
        color: Color.fromCssColorString('#ff665f').withAlpha(0.92),
        dashLength: 18,
      }),
    },
    properties: {
      semanticType: 'naive-flight-route',
      violationCount: plan.metrics.naiveViolationCount,
      minimumClearanceMeters: plan.metrics.naiveMinimumClearanceMeters,
    },
  })
  const aircraft = viewer.entities.add({
    id: ROUTE_ENTITY_IDS[2],
    name: '飞行感知载体',
    position: Cartesian3.fromDegrees(
      plan.samples[0]!.longitude,
      plan.samples[0]!.latitude,
      plan.samples[0]!.flightHeight,
    ),
    point: {
      pixelSize: 10,
      color: Color.fromCssColorString('#f5c768'),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    model: {
      uri: CESIUM_AI_OBSERVER_MODEL_URL,
      minimumPixelSize: 46,
      maximumScale: 220,
      silhouetteColor: Color.fromCssColorString('#4de5ba'),
      silhouetteSize: 1.4,
      runAnimations: true,
    },
    label: {
      text: 'AI AIRCRAFT · LIVE',
      font: '600 12px Inter, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString('#06131a'),
      outlineWidth: 4,
      style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cartesian2(0, -24),
      verticalOrigin: VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    properties: {
      semanticType: 'flight-observer',
    },
  })
  const executedRoutePositions = [samplePosition(plan.samples[0]!)]
  const executedRoute = viewer.entities.add({
    id: EXECUTED_ROUTE_ID,
    name: 'AI 实际执行轨迹',
    polyline: {
      positions: new CallbackProperty(() => executedRoutePositions, false),
      width: 4,
      arcType: ArcType.NONE,
      material: new PolylineGlowMaterialProperty({
        glowPower: 0.2,
        taperPower: 0.8,
        color: Color.fromCssColorString('#53a8ff'),
      }),
    },
    properties: {
      semanticType: 'closed-loop-flight-route',
      planner: 'rolling-ray-awareness',
    },
  })
  const sensorRayEntities = SENSOR_RAY_ENTITY_IDS.map((id, index) => viewer.entities.add({
    id,
    name: `AI 有限视域射线 ${index + 1}`,
    show: false,
    polyline: {
      positions: [samplePosition(plan.samples[0]!), samplePosition(plan.samples[0]!)],
      width: index === Math.floor(SENSOR_RAY_ENTITY_IDS.length / 2) ? 2.5 : 1.5,
      arcType: ArcType.NONE,
      material: new ColorMaterialProperty(Color.fromCssColorString('#5cd9ff').withAlpha(0.62)),
    },
    properties: {
      semanticType: 'flight-awareness-ray',
      headingOffsetDegrees: SENSOR_HEADING_OFFSETS_DEGREES[index],
    },
  }))
  updateObserverEntity(aircraft, plan.samples[0]!, plan.samples[1]!)
  const anchorEntities = addAnchorLabels(viewer, plan)
  const routeOverviewSphere = BoundingSphere.fromPoints(
    routePositions(plan.samples, sample => sample.flightHeight),
  )
  const observerRenderHost = callbacks.observerContainer
    ? createObserverRenderHost()
    : undefined
  const observerViewer = observerRenderHost
    ? createObserverViewer(observerRenderHost, terrainProvider)
    : undefined
  const observerCamera = createObserverCamera(viewer, plan.samples[0]!, plan.samples[1]!)
  const raySensorCamera = createObserverCamera(viewer, plan.samples[0]!, plan.samples[1]!)
  if (observerViewer) {
    setObserverCamera(observerViewer.camera, plan.samples[0]!, plan.samples[1]!)
    observerViewer.resize()
    observerViewer.scene.requestRender()
  }
  const observerFrustum = viewer.scene.primitives.add(new DebugCameraPrimitive({
    camera: observerCamera,
    color: Color.fromCssColorString('#f5c768').withAlpha(0.72),
    updateOnChange: true,
  }))

  let animationFrame: number | undefined
  let resolveAnimation: (() => void) | undefined
  let activeRun = 0
  let viewMode: HimalayaFlightViewMode = 'follow'
  let cameraIntent: HimalayaFlightCameraIntent = 'overview'
  const cameraDirectorCamera = new Camera(viewer.scene)
  const cameraDirectorState: FlightCameraDirectorState = {
    transitionUntilMs: 0,
  }
  let decisionCameraActive = false
  let observerRenderCount = 0
  let currentProgress = 0
  let currentSample = plan.samples[0]!
  let noFlyZone: Entity | undefined
  let observerNoFlyZone: Entity | undefined
  let noFlyZoneSphere: BoundingSphere | undefined
  let avoidance: FlightAvoidanceManeuver | undefined
  let activeCorridorCandidate: HimalayaFlightCorridorCandidate | undefined
  let decisionPending = false
  let trajectoryCommitPending = false
  let perceptionAbortController: AbortController | undefined
  let awarenessCycleCount = 0
  let activeObservationCount = 0
  let lastAwarenessProgress: number | undefined
  let planRevision = 0
  let minimumNoFlyZoneClearanceMeters = Number.POSITIVE_INFINITY
  let unsafeSampleCount = 0
  let latestSensorFrame: HimalayaFlightSensorFrame | undefined
  let latestSensorSegments: FlightSensorRaySegment[] = []
  const worldTaskRuntime = new WorldTaskRuntime({ frameBudgetMs: 8 })
  const terrainWorkerExecutor = createHimalayaTerrainWorkerExecutor()
  const terrainHeightSampler: FlightTerrainHeightSampler = (
    provider,
    cartographics,
    signal,
    checkpoint,
  ) => terrainWorkerExecutor
    ? sampleCorridorTerrainHeightsInWorker(terrainWorkerExecutor, cartographics, signal)
    : sampleCorridorTerrainHeights(provider, cartographics, signal, checkpoint)
  const removeObserverPostRender = observerViewer?.scene.postRender.addEventListener(() => {
    observerRenderCount += 1
  })

  const isObserverSceneReady = (): boolean => observerViewer
    ? observerRenderCount >= 2 && observerViewer.scene.globe.tilesLoaded
    : viewer.scene.globe.tilesLoaded
  const isExecutionSceneReady = (): boolean => (
    viewer.scene.globe.tilesLoaded && viewer.dataSourceDisplay.ready
  )
  const setRouteOverlayVisibility = (show: boolean): void => {
    plannedRoute.show = show
    naiveRoute.show = show
    executedRoute.show = show
    anchorEntities.forEach(entity => {
      entity.show = show
    })
  }

  const stop = (): void => {
    activeRun += 1
    worldTaskRuntime.clear(new Error('Flight run stopped'))
    perceptionAbortController?.abort(new Error('Flight run stopped'))
    perceptionAbortController = undefined
    decisionPending = false
    viewer.camera.cancelFlight()
    cameraDirectorState.intent = undefined
    cameraDirectorState.pose = undefined
    cameraDirectorState.transitionUntilMs = 0
    setRouteOverlayVisibility(true)
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
    animationFrame = undefined
    const resolve = resolveAnimation
    resolveAnimation = undefined
    resolve?.()
    callbacks.onProgress?.({
      phase: 'stopped',
      progress: currentProgress,
      sample: currentSample,
      sceneReady: false,
      cameraIntent,
      ...(Number.isFinite(minimumNoFlyZoneClearanceMeters)
        ? { minimumNoFlyZoneClearanceMeters }
        : {}),
    })
  }

  const setCameraIntent = (
    mode: HimalayaFlightCameraIntent,
    reason: string,
    progress: number,
    automatic: boolean,
  ): void => {
    if (cameraIntent === mode) return
    cameraIntent = mode
    callbacks.onCameraChange?.({ mode, reason, progress, automatic })
  }

  const showOverview = (): Promise<void> => {
    setCameraIntent('overview', '展示完整飞行任务范围。', currentProgress, false)
    return flyCameraToOverview(viewer, routeOverviewSphere)
  }

  const play = async (options: { durationSeconds?: number } = {}): Promise<void> => {
    stop()
    const run = activeRun
    const durationSeconds = options.durationSeconds ?? 75
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('Flight duration must be a positive finite number')
    }

    const first = plan.samples[0]!
    currentProgress = 0
    currentSample = first
    decisionCameraActive = false
    minimumNoFlyZoneClearanceMeters = Number.POSITIVE_INFINITY
    unsafeSampleCount = 0
    setCameraIntent(viewMode, '飞行开始，自动进入当前任务观察偏好。', 0, true)
    if (noFlyZone) viewer.entities.remove(noFlyZone)
    if (observerNoFlyZone) observerViewer?.entities.remove(observerNoFlyZone)
    noFlyZone = undefined
    observerNoFlyZone = undefined
    noFlyZoneSphere = undefined
    plannedRoute.name = '地形感知飞行基准路线'
    if (plannedRoute.polyline) {
      plannedRoute.polyline.material = new PolylineGlowMaterialProperty({
        glowPower: 0.18,
        taperPower: 0.72,
        color: Color.fromCssColorString('#4de5ba'),
      })
    }
    avoidance = undefined
    activeCorridorCandidate = undefined
    decisionPending = false
    trajectoryCommitPending = false
    perceptionAbortController = undefined
    awarenessCycleCount = 0
    activeObservationCount = 0
    lastAwarenessProgress = undefined
    planRevision = 0
    latestSensorFrame = undefined
    latestSensorSegments = []
    sensorRayEntities.forEach(entity => {
      entity.show = false
    })
    executedRoutePositions.splice(0, executedRoutePositions.length, samplePosition(first))
    const observedCheckpoints = new Set<string>()
    const rayExclusions: object[] = [
      aircraft,
      plannedRoute,
      naiveRoute,
      executedRoute,
      observerFrustum,
      ...anchorEntities,
    ]
    const restoreStreamingProfile = applyFlightStreamingProfile(viewer, observerViewer)
    callbacks.onProgress?.({
      phase: 'transition',
      progress: 0,
      sample: first,
      sceneReady: false,
      cameraIntent,
    })
    try {
      await transitionToFlightView(viewer, first, plan.samples[1]!, viewMode)
      if (run !== activeRun) return
      callbacks.onProgress?.({
        phase: 'loading',
        progress: 0,
        sample: first,
        sceneReady: false,
        cameraIntent,
      })
      await waitForInitialSceneReadiness(
        isObserverSceneReady,
        () => {
          viewer.scene.requestRender()
          observerViewer?.scene.requestRender()
        },
        () => run !== activeRun,
      )
      if (run !== activeRun) return
      emitPassedObservations(plan, 0, observedCheckpoints, callbacks.onObservation)

      await new Promise<void>(resolve => {
        resolveAnimation = resolve
        let previousAt = performance.now()
        let activeElapsedMs = 0
        let lastSensorUpdateAt = Number.NEGATIVE_INFINITY
        let lastProgressPublicationAt = Number.NEGATIVE_INFINITY
        const finish = (): void => {
          worldTaskRuntime.clear(new Error('Flight run completed'))
          perceptionAbortController?.abort(new Error('Flight run completed'))
          perceptionAbortController = undefined
          decisionPending = false
          setRouteOverlayVisibility(true)
          animationFrame = undefined
          resolveAnimation = undefined
          resolve()
        }
        const commitAvoidance = (
          request: HimalayaFlightDecisionRequest,
          evidence: HimalayaFlightDecisionEvidence,
          candidate?: HimalayaFlightCorridorCandidate,
        ): void => {
          planRevision = request.planRevision
          if (candidate && candidate.direction === evidence.direction) {
            avoidance = candidate.maneuver
            activeCorridorCandidate = candidate
          } else {
            const decision: FlightAvoidanceDecision = {
              ...request.safetySuggestion,
              direction: evidence.direction,
            }
            avoidance = createAvoidanceManeuver(decision, request.progress, {
              progressSpan: AVOIDANCE_PROGRESS_SPAN,
              peakProgress: OBSTACLE_ROUTE_PROGRESS,
              maximumOffsetMeters: AVOIDANCE_OFFSET_METERS,
            })
            activeCorridorCandidate = undefined
          }
          callbacks.onObservation?.({
            id: `himalaya-avoidance-${Date.now()}`,
            kind: 'avoidance',
            name: `${evidence.source === 'model' ? '模型' : '安全控制器'}决定向${avoidance.direction === 'left' ? '左' : '右'}重规划`,
            observedAt: request.sensor.sampledAt,
            progress: request.progress,
            longitude: request.sample.longitude,
            latitude: request.sample.latitude,
            terrainHeight: request.sample.terrainHeight,
            flightHeight: request.sample.flightHeight,
            clearanceMeters: request.sample.clearanceMeters,
            sensor: request.sensor,
            avoidance,
            decision: evidence,
          })
        }
        const launchAwarenessCycle = (
          cycleKind: FlightAwarenessCycleKind,
          safetySuggestion: FlightAvoidanceDecision,
          sensor: HimalayaFlightSensorFrame,
          sample: TerrainAwareFlightSample,
          lookAhead: TerrainAwareFlightSample,
          progress: number,
        ): void => {
          const cycle = awarenessCycleCount + 1
          const startOffsetMeters = maneuverLateralOffsetMeters(avoidance, progress)
          const baseRequest: HimalayaFlightDecisionRequest = {
            requestId: `flight-run-${run}:awareness-${cycle}`,
            runId: `flight-run-${run}`,
            cycle,
            cycleKind,
            planRevision: cycleKind === 'detect' && !avoidance
              ? planRevision + 1
              : planRevision,
            requestedAt: new Date().toISOString(),
            progress,
            sceneReady: isExecutionSceneReady(),
            routeHeadingDegrees: CesiumMath.toDegrees(bearingRadians(sample, lookAhead)),
            activeObservationCount,
            sample: { ...sample },
            sensor,
            safetySuggestion,
            obstacle: createObstacleSnapshot(plan),
            corridorCandidates: [],
          }
          lastAwarenessProgress = progress

          if (cycleKind === 'detect' && !avoidance) {
            const evidence: HimalayaFlightDecisionEvidence = {
              source: 'local-rule',
              direction: safetySuggestion.direction,
              reason: 'The fast ray-safety loop committed a conservative adaptive maneuver while the fixed terrain provider sampled both candidate grids asynchronously.',
            }
            commitAvoidance(baseRequest, evidence)
            callbacks.onDecision?.({
              state: 'safety-committed',
              request: baseRequest,
              evidence,
            })
            decisionCameraActive = true
            setCameraIntent(
              'decision',
              '前向射线发现临时禁飞区，本地安全环立即绕行，同时启动独立视觉复核。',
              progress,
              true,
            )
          }

          if (!callbacks.requestAvoidanceDecision || !observerViewer) return
          awarenessCycleCount = cycle
          decisionPending = true
          const controller = new AbortController()
          perceptionAbortController = controller
          const corridorCandidatesPromise = worldTaskRuntime.run({
            taskKey: `flight-run-${run}:corridor-candidates`,
            revision: baseRequest.planRevision,
            signal: controller.signal,
            execute: async (task) => {
              const candidates: HimalayaFlightCorridorCandidate[] = []
              for (const direction of ['left', 'right'] as const) {
                candidates.push(await createFlightCorridorCandidate({
                  viewer,
                  terrainProvider,
                  plan,
                  safetySuggestion,
                  direction,
                  progress,
                  startSample: sample,
                  startOffsetMeters,
                  progressSpan: CORRIDOR_CANDIDATE_PROGRESS_SPAN,
                  noFlyZoneSphere,
                  sceneVolumeExclusions: rayExclusions,
                  trajectoryId: `flight-run-${run}:plan-${baseRequest.planRevision}:${direction}:candidate`,
                  signal: task.signal,
                  checkpoint: task.checkpoint,
                  terrainHeightSampler,
                }))
                await task.checkpoint(true)
              }
              return candidates
            },
          })
          let activeRequest = baseRequest
          let observationRequested = false
          void corridorCandidatesPromise
            .then((corridorCandidates) => {
              if (run !== activeRun || controller.signal.aborted) return undefined
              const candidateRequest: HimalayaFlightDecisionRequest = {
                ...baseRequest,
                corridorCandidates,
              }
              const observationView = callbacks.selectObservationView
                ? callbacks.selectObservationView(candidateRequest)
                : defaultObservationView(candidateRequest)
              if (!observationView) {
                callbacks.onDecision?.({ state: 'skipped', request: candidateRequest })
                return undefined
              }
              activeRequest = {
                ...candidateRequest,
                observationView,
              }
              observationRequested = true
              activeObservationCount += 1
              callbacks.onDecision?.({ state: 'requesting', request: activeRequest })
              setObservationCamera(observerViewer.camera, activeRequest)
              observerViewer.scene.requestRender()
              return captureFlightVisualFrame(
                observerViewer,
                observerRenderCount,
                () => observerRenderCount,
                () => run !== activeRun || controller.signal.aborted,
                `himalaya-independent-camera:${observationView.candidateId}`,
              )
            })
            .then((visualFrame) => {
              if (run !== activeRun || controller.signal.aborted) return undefined
              if (!visualFrame || !observationRequested) return undefined
              activeRequest = { ...activeRequest, visualFrame }
              return callbacks.requestAvoidanceDecision!(activeRequest, controller.signal)
            })
            .then(async (modelDecision) => {
              if (
                run !== activeRun
                || controller.signal.aborted
                || activeRequest.planRevision !== planRevision
              ) return
              if (!modelDecision) {
                if (observationRequested) {
                  callbacks.onDecision?.({ state: 'observed', request: activeRequest })
                }
                return
              }
              const effectiveProgress = easeInOut(currentProgress)
              const sourceCandidate = activeRequest.corridorCandidates.find(candidate => (
                candidate.direction === modelDecision.direction
              ))
              const routeStillActionable = sourceCandidate !== undefined
                && effectiveProgress < sourceCandidate.maneuver.endProgress - 0.005
              let replannedCandidate: HimalayaFlightCorridorCandidate | undefined
              if (sourceCandidate) {
                trajectoryCommitPending = true
                try {
                  replannedCandidate = await waitForLiveTrajectoryRebase(
                    rebaseFlightCorridorCandidate({
                      candidate: sourceCandidate,
                      viewer,
                      terrainProvider,
                      progress: effectiveProgress,
                      startSample: { ...currentSample },
                      requiredTerrainClearanceMeters: REQUIRED_TERRAIN_CLEARANCE_METERS,
                      noFlyZoneSphere,
                      sceneVolumeExclusions: rayExclusions,
                      trajectoryId: `${activeRequest.requestId}:plan-${planRevision + 1}:${modelDecision.direction}`,
                      signal: controller.signal,
                      terrainHeightSampler,
                    }),
                    controller.signal,
                    LIVE_TRAJECTORY_REBASE_TIMEOUT_MS,
                  )
                } finally {
                  trajectoryCommitPending = false
                }
              }
              if (
                run !== activeRun
                || controller.signal.aborted
                || activeRequest.planRevision !== planRevision
              ) return
              const certificateSafe = replannedCandidate?.certificate.complete === true
                && replannedCandidate.certificate.status === 'free'
              const accepted = certificateSafe && routeStillActionable
              const evidence: HimalayaFlightDecisionEvidence = accepted
                ? {
                    source: 'model',
                    direction: modelDecision.direction,
                    reason: modelDecision.reason,
                    model: modelDecision.model,
                    ...(modelDecision.confidence !== undefined
                      ? { confidence: modelDecision.confidence }
                      : {}),
                  }
                : {
                    source: 'safety-fallback',
                    direction: avoidance?.direction ?? safetySuggestion.direction,
                    reason: !routeStillActionable
                      ? 'The slow plan arrived after the directional maneuver handoff window; the completed fast-safety trajectory was preserved.'
                      : `The proposed executable trajectory did not receive a complete free certificate: ${replannedCandidate?.certificate.reasons.join(' ') ?? 'No matching sampled corridor candidate was available.'}`,
                    model: modelDecision.model,
                  }
              let eventRequest = activeRequest
              if (accepted && evidence.source === 'model' && replannedCandidate) {
                eventRequest = {
                  ...activeRequest,
                  planRevision: planRevision + 1,
                  progress: effectiveProgress,
                  sample: { ...currentSample },
                  corridorCandidates: [replannedCandidate],
                }
                commitAvoidance(eventRequest, evidence, replannedCandidate)
              }
              callbacks.onDecision?.({
                state: accepted ? 'accepted' : 'fallback',
                request: eventRequest,
                evidence,
              })
            })
            .catch(error => {
              if (run !== activeRun || controller.signal.aborted) return
              const message = error instanceof Error ? error.message : String(error)
              callbacks.onDecision?.({
                state: 'fallback',
                request: activeRequest,
                evidence: {
                  source: 'safety-fallback',
                  direction: avoidance?.direction ?? safetySuggestion.direction,
                  reason: 'The slow visual loop failed; the independent ray-safety maneuver remains active.',
                },
                error: message,
              })
            })
            .finally(() => {
              if (perceptionAbortController === controller) {
                perceptionAbortController = undefined
                decisionPending = false
              }
            })
        }
        const tick = (now: number): void => {
          if (run !== activeRun) {
            finish()
            return
          }

          const frameDeltaMs = now - previousAt
          const timeline = advanceFlightTimeline(
            activeElapsedMs,
            trajectoryCommitPending ? 0 : frameDeltaMs,
            durationSeconds * 1_000,
          )
          previousAt = now
          activeElapsedMs = timeline.elapsedMs
          const progress = timeline.progress
          const easedProgress = easeInOut(progress)
          const lookAheadProgress = Math.min(1, easedProgress + 0.012)
          const baseSample = interpolatePlanSample(plan, easedProgress)
          const baseLookAhead = interpolatePlanSample(plan, lookAheadProgress)
          if (!noFlyZone && easedProgress >= OBSTACLE_INJECTION_PROGRESS) {
            const injected = addDynamicNoFlyZone(viewer, plan)
            noFlyZone = injected.entity
            noFlyZoneSphere = injected.boundingSphere
            if (observerViewer) {
              observerNoFlyZone = addDynamicNoFlyZone(observerViewer, plan).entity
              observerViewer.scene.requestRender()
            }
            if (plannedRoute.polyline) {
              plannedRoute.name = '原始基准路线（临时禁飞区出现后已作废）'
              plannedRoute.polyline.material = new PolylineDashMaterialProperty({
                color: Color.fromCssColorString('#8aa7ae').withAlpha(0.5),
                dashLength: 14,
              })
            }
            viewer.scene.requestRender()
          }

          const sample = applyCommittedCorridorCandidate(
            activeCorridorCandidate,
            easedProgress,
          ) ?? applyAvoidanceToSample(
            viewer,
            baseSample,
            baseLookAhead,
            avoidance,
            easedProgress,
            plan.options.clearanceMeters,
            noFlyZoneSphere,
          )
          const lookAhead = applyCommittedCorridorCandidate(
            activeCorridorCandidate,
            lookAheadProgress,
          ) ?? applyAvoidanceToSample(
            viewer,
            baseLookAhead,
            interpolatePlanSample(plan, Math.min(1, lookAheadProgress + 0.012)),
            avoidance,
            lookAheadProgress,
            plan.options.clearanceMeters,
            noFlyZoneSphere,
          )
          const noFlyZoneClearanceMeters = noFlyZoneSphere
            ? Cartesian3.distance(samplePosition(sample), noFlyZoneSphere.center)
              - noFlyZoneSphere.radius
            : undefined
          if (noFlyZoneClearanceMeters !== undefined) {
            minimumNoFlyZoneClearanceMeters = Math.min(
              minimumNoFlyZoneClearanceMeters,
              noFlyZoneClearanceMeters,
            )
            if (noFlyZoneClearanceMeters < 0) unsafeSampleCount += 1
          }
          if (now - lastSensorUpdateAt >= SENSOR_UPDATE_INTERVAL_MS || progress >= 1) {
            const sensing = senseFlightCorridor(
              viewer,
              raySensorCamera,
              sample,
              lookAhead,
              rayExclusions,
              noFlyZoneSphere,
            )
            latestSensorFrame = sensing.frame
            latestSensorSegments = sensing.segments
            updateRaySensorEntities(
              sensorRayEntities,
              latestSensorSegments,
              showsFlightDebugSensors(cameraIntent),
            )
            lastSensorUpdateAt = now
            const safetySuggestion = selectAvoidanceDecision(
              latestSensorFrame.readings,
              SENSOR_RANGE_METERS,
              SENSOR_TRIGGER_DISTANCE_METERS,
            )
            const cycleKind = selectFlightAwarenessCycle({
              decisionPending,
              cyclesStarted: awarenessCycleCount,
              maxCycles: MAX_VISUAL_AWARENESS_CYCLES,
              progress: easedProgress,
              ...(lastAwarenessProgress !== undefined
                ? { lastCycleProgress: lastAwarenessProgress }
                : {}),
              minimumProgressDelta: MIN_VISUAL_CYCLE_PROGRESS_DELTA,
              maximumVerificationProgress: 0.98,
              hasBlockingSuggestion: safetySuggestion !== undefined,
              ...(avoidance ? { avoidance } : {}),
            })
            const cycleSuggestion = safetySuggestion ?? avoidance
            if (cycleKind && cycleSuggestion) {
              launchAwarenessCycle(
                cycleKind,
                cycleSuggestion,
                latestSensorFrame,
                sample,
                lookAhead,
                easedProgress,
              )
            }
          }
          currentProgress = progress
          currentSample = sample
          if (
            decisionCameraActive
            && avoidance
            && (
              easedProgress >= avoidance.endProgress
              || (
                easedProgress >= avoidance.peakProgress
                && noFlyZoneClearanceMeters !== undefined
                && noFlyZoneClearanceMeters >= NO_FLY_ZONE_SAFETY_MARGIN_METERS
              )
            )
          ) {
            decisionCameraActive = false
            setCameraIntent(
              viewMode,
              '飞行器已离开禁飞区安全包络，恢复先前的任务观察偏好。',
              easedProgress,
              true,
            )
          }
          if (!decisionCameraActive) {
            const directedIntent = cinematicFlightCameraIntent(
              viewMode,
              easedProgress,
              false,
            )
            if (directedIntent !== cameraIntent) {
              setCameraIntent(
                directedIntent,
                directedIntent === 'terrain-pass'
                  ? '进入贴近真实地形的山谷穿梭段，场景导演平滑接管观察视角。'
                  : '离开山谷穿梭段，场景导演平滑恢复任务观察偏好。',
                easedProgress,
                true,
              )
            }
          }
          setRouteOverlayVisibility(cameraIntent !== 'terrain-pass')
          appendExecutedRoutePosition(executedRoutePositions, sample)
          updateObserverEntity(aircraft, sample, lookAhead)
          setObserverCamera(observerCamera, sample, lookAhead)
          observerFrustum.show = showsFlightDebugSensors(cameraIntent)
          applyFlightView(
            viewer,
            cameraDirectorCamera,
            cameraDirectorState,
            sample,
            lookAhead,
            cameraIntent,
            routeOverviewSphere,
            now,
            frameDeltaMs,
            noFlyZoneSphere,
          )
          emitPassedObservations(
            plan,
            easedProgress,
            observedCheckpoints,
            callbacks.onObservation,
          )
          if (shouldPublishFlightProgress(
            now,
            lastProgressPublicationAt,
            PROGRESS_PUBLICATION_INTERVAL_MS,
            progress >= 1,
          )) {
            callbacks.onProgress?.({
              phase: progress >= 1 ? 'completed' : 'flying',
              progress,
              sample,
              sceneReady: isObserverSceneReady(),
              cameraIntent,
              ...(latestSensorFrame ? { sensor: latestSensorFrame } : {}),
              ...(avoidance && easedProgress < avoidance.endProgress ? { avoidance } : {}),
              ...(noFlyZoneClearanceMeters !== undefined ? { noFlyZoneClearanceMeters } : {}),
              ...(Number.isFinite(minimumNoFlyZoneClearanceMeters)
                ? { minimumNoFlyZoneClearanceMeters }
                : {}),
            })
            lastProgressPublicationAt = now
          }

          if (progress >= 1) {
            finish()
            return
          }
          animationFrame = requestAnimationFrame(tick)
        }
        animationFrame = requestAnimationFrame(tick)
      })
    } finally {
      restoreStreamingProfile()
    }
  }

  return {
    plan,
    terrainProvider,
    sampledAt: new Date().toISOString(),
    sourceUrl: ARCGIS_WORLD_ELEVATION_URL,
    awareness: {
      rayCount: SENSOR_HEADING_OFFSETS_DEGREES.length,
      rangeMeters: SENSOR_RANGE_METERS,
      triggerDistanceMeters: SENSOR_TRIGGER_DISTANCE_METERS,
      rollingReplan: true,
      dynamicObstacle: true,
    },
    play,
    stop,
    showOverview,
    setViewMode: mode => {
      viewMode = mode
      if (!decisionCameraActive) {
        setCameraIntent(mode, '用户或 Agent 更新了任务观察偏好。', currentProgress, false)
      }
      observerFrustum.show = showsFlightDebugSensors(cameraIntent)
      sensorRayEntities.forEach(entity => {
        entity.show = showsFlightDebugSensors(cameraIntent) && latestSensorSegments.length > 0
      })
      if (mode === 'overview' && !decisionCameraActive && animationFrame === undefined) {
        void flyCameraToOverview(viewer, routeOverviewSphere)
      }
    },
    getViewMode: () => viewMode,
    getCameraIntent: () => cameraIntent,
    getDiagnostics: () => ({
      cameraIntent,
      safetyMarginMeters: NO_FLY_ZONE_SAFETY_MARGIN_METERS,
      awarenessCycleCount,
      planRevision,
      perceptionPending: decisionPending,
      noFlyZoneOutcome: evaluateNoFlyZoneClearanceOutcome({
        completed: currentProgress >= 1,
        ...(Number.isFinite(minimumNoFlyZoneClearanceMeters)
          ? { minimumBoundaryClearanceMeters: minimumNoFlyZoneClearanceMeters }
          : {}),
        requiredSafetyMarginMeters: NO_FLY_ZONE_SAFETY_MARGIN_METERS,
        unsafeSampleCount,
      }),
      ...(Number.isFinite(minimumNoFlyZoneClearanceMeters)
        ? { minimumNoFlyZoneClearanceMeters }
        : {}),
      unsafeSampleCount,
    }),
    dispose: () => {
      stop()
      terrainWorkerExecutor?.dispose()
      viewer.entities.remove(plannedRoute)
      viewer.entities.remove(naiveRoute)
      viewer.entities.remove(aircraft)
      viewer.entities.remove(executedRoute)
      sensorRayEntities.forEach(entity => viewer.entities.remove(entity))
      if (noFlyZone) viewer.entities.remove(noFlyZone)
      if (observerNoFlyZone) observerViewer?.entities.remove(observerNoFlyZone)
      anchorEntities.forEach(entity => viewer.entities.remove(entity))
      viewer.scene.primitives.remove(observerFrustum)
      removeObserverPostRender?.()
      observerViewer?.destroy()
      observerRenderHost?.remove()
    },
  }
}

function createHimalayaImageryProvider(): UrlTemplateImageryProvider {
  return new UrlTemplateImageryProvider({
    url: ESRI_WORLD_IMAGERY_TILE_URL,
    maximumLevel: 19,
    credit: ESRI_WORLD_IMAGERY_CREDIT,
  })
}

function createObserverRenderHost(): HTMLDivElement {
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  Object.assign(container.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '768px',
    height: '432px',
    overflow: 'hidden',
    pointerEvents: 'none',
    opacity: '0.001',
    zIndex: '-2147483647',
  })
  document.body.append(container)
  return container
}

function createObserverViewer(container: HTMLElement, terrainProvider: TerrainProvider): Viewer {
  container.replaceChildren()
  const observerViewer = new Viewer(container, {
    baseLayer: new ImageryLayer(createHimalayaImageryProvider()),
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
    requestRenderMode: true,
    maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    contextOptions: {
      webgl: {
        preserveDrawingBuffer: true,
        antialias: true,
      },
    },
  })
  observerViewer.scene.terrainProvider = terrainProvider
  observerViewer.scene.globe.depthTestAgainstTerrain = true
  observerViewer.scene.globe.baseColor = Color.fromCssColorString('#102d3b')
  observerViewer.scene.backgroundColor = Color.fromCssColorString('#040b10')
  observerViewer.scene.screenSpaceCameraController.enableInputs = false
  observerViewer.resolutionScale = Math.min(1, 1 / Math.max(1, window.devicePixelRatio))
  return observerViewer
}

function addAnchorLabels(viewer: Viewer, plan: TerrainAwareFlightPlan): Entity[] {
  return HIMALAYA_ROUTE_ANCHORS.map((anchor, index) => {
    const sample = nearestSample(plan.samples, anchor)
    return viewer.entities.add({
      id: `himalaya-flight-anchor-${index + 1}`,
      name: anchor.name,
      position: Cartesian3.fromDegrees(
        anchor.longitude,
        anchor.latitude,
        sample.terrainHeight + 180,
      ),
      point: {
        pixelSize: 7,
        color: Color.WHITE,
        outlineColor: Color.fromCssColorString('#0d6958'),
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: anchor.name,
        font: '600 12px Inter, sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.fromCssColorString('#06131a'),
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cartesian2(0, -18),
        verticalOrigin: VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: {
        semanticType: 'flight-route-anchor',
        anchorOrder: index + 1,
      },
    })
  })
}

function routePositions(
  samples: readonly TerrainAwareFlightSample[],
  height: (sample: TerrainAwareFlightSample) => number,
): Cartesian3[] {
  return samples.map(sample =>
    Cartesian3.fromDegrees(sample.longitude, sample.latitude, height(sample)),
  )
}

function interpolatePlanSample(
  plan: TerrainAwareFlightPlan,
  progress: number,
): TerrainAwareFlightSample {
  const targetDistance = plan.metrics.distanceMeters * Math.max(0, Math.min(1, progress))
  const samples = plan.samples
  let upperIndex = samples.findIndex(sample => sample.distanceMeters >= targetDistance)
  if (upperIndex <= 0) return { ...samples[0]! }
  if (upperIndex < 0) upperIndex = samples.length - 1

  const start = samples[upperIndex - 1]!
  const end = samples[upperIndex]!
  const segmentDistance = end.distanceMeters - start.distanceMeters
  const fraction = segmentDistance > 0
    ? (targetDistance - start.distanceMeters) / segmentDistance
    : 0

  return {
    longitude: interpolate(start.longitude, end.longitude, fraction),
    latitude: interpolate(start.latitude, end.latitude, fraction),
    terrainHeight: interpolate(start.terrainHeight, end.terrainHeight, fraction),
    distanceMeters: targetDistance,
    flightHeight: interpolate(start.flightHeight, end.flightHeight, fraction),
    clearanceMeters: interpolate(start.clearanceMeters, end.clearanceMeters, fraction),
    naiveFlightHeight: interpolate(start.naiveFlightHeight, end.naiveFlightHeight, fraction),
    naiveClearanceMeters: interpolate(start.naiveClearanceMeters, end.naiveClearanceMeters, fraction),
  }
}

function createObserverCamera(
  viewer: Viewer,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
): Camera {
  const camera = new Camera(viewer.scene)
  camera.frustum = new PerspectiveFrustum({
    fov: CesiumMath.toRadians(54),
    aspectRatio: 16 / 9,
    near: 20,
    far: 9_000,
  })
  setObserverCamera(camera, sample, lookAhead)
  return camera
}

function setObserverCamera(
  camera: Camera,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
): void {
  camera.setView({
    destination: samplePosition(sample),
    orientation: {
      heading: bearingRadians(sample, lookAhead),
      pitch: observerPitchRadians(sample, lookAhead),
      roll: 0,
    },
  })
}

function defaultObservationView(
  request: HimalayaFlightDecisionRequest,
): HimalayaFlightObservationView {
  return {
    candidateId: 'forward-confirmation',
    beliefRevision: 0,
    reason: 'No active-perception adapter was provided, so the independent camera uses its conservative forward confirmation view.',
    relativeHeadingDegrees: 180,
    pitchDegrees: -32,
    rangeMeters: Math.max(16_000, request.obstacle.horizontalRadiusMeters * 4.2),
  }
}

function setObservationCamera(
  camera: Camera,
  request: HimalayaFlightDecisionRequest,
): void {
  const view = request.observationView ?? defaultObservationView(request)
  const target = view.target ?? [
    request.obstacle.longitude,
    request.obstacle.latitude,
    request.obstacle.height,
  ]
  const center = Cartesian3.fromDegrees(
    target[0],
    target[1],
    target[2],
  )
  const frame = new BoundingSphere(
    center,
    Math.max(
      request.obstacle.horizontalRadiusMeters,
      request.obstacle.verticalRadiusMeters,
    ),
  )
  camera.viewBoundingSphere(frame, new HeadingPitchRange(
    CesiumMath.toRadians(
      request.routeHeadingDegrees + view.relativeHeadingDegrees,
    ),
    CesiumMath.toRadians(view.pitchDegrees),
    view.rangeMeters,
  ))
  camera.lookAtTransform(Matrix4.IDENTITY)
}

function applyFlightView(
  viewer: Viewer,
  directorCamera: Camera,
  directorState: FlightCameraDirectorState,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
  cameraIntent: HimalayaFlightCameraIntent,
  routeOverviewSphere: BoundingSphere,
  now: number,
  frameDeltaMs: number,
  noFlyZoneSphere?: BoundingSphere,
): void {
  const target = flightCameraTargetPose(
    directorCamera,
    sample,
    lookAhead,
    cameraIntent,
    routeOverviewSphere,
    noFlyZoneSphere,
  )
  if (!directorState.pose) {
    directorState.pose = captureCameraPose(viewer.camera)
  }
  if (directorState.intent !== cameraIntent) {
    directorState.intent = cameraIntent
    directorState.pose = captureCameraPose(viewer.camera)
    directorState.transitionUntilMs = now + CAMERA_INTENT_TRANSITION_MS
  }
  const halfLifeMs = now < directorState.transitionUntilMs
    ? CAMERA_TRANSITION_HALF_LIFE_MS
    : CAMERA_CRUISE_HALF_LIFE_MS
  const alpha = cameraTrackingAlpha(Math.min(50, Math.max(0, frameDeltaMs)), halfLifeMs)
  const pose = interpolateFlightCameraPose(directorState.pose, target, alpha)
  directorState.pose = pose
  viewer.camera.setView({
    destination: pose.destination,
    orientation: {
      heading: pose.heading,
      pitch: pose.pitch,
      roll: pose.roll,
    },
  })
  viewer.scene.requestRender()
}

function showsFlightDebugSensors(cameraIntent: HimalayaFlightCameraIntent): boolean {
  return cameraIntent !== 'pov' && cameraIntent !== 'terrain-pass'
}

function flightCameraTargetPose(
  directorCamera: Camera,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
  cameraIntent: HimalayaFlightCameraIntent,
  routeOverviewSphere: BoundingSphere,
  noFlyZoneSphere?: BoundingSphere,
): FlightCameraPose {
  if (cameraIntent === 'decision' && noFlyZoneSphere) {
    const frame = BoundingSphere.fromPoints([
      samplePosition(sample),
      samplePosition(lookAhead),
      noFlyZoneSphere.center,
    ])
    frame.radius = Math.max(frame.radius, noFlyZoneSphere.radius * 1.35)
    return boundingSphereCameraPose(
      directorCamera,
      frame,
      new HeadingPitchRange(
        bearingRadians(sample, lookAhead) + CesiumMath.toRadians(105),
        CesiumMath.toRadians(-48),
        Math.max(25_000, frame.radius * 3.8),
      ),
    )
  }
  if (cameraIntent === 'overview') {
    return boundingSphereCameraPose(
      directorCamera,
      routeOverviewSphere,
      new HeadingPitchRange(
        CesiumMath.toRadians(18),
        CesiumMath.toRadians(-48),
        Math.max(82_000, routeOverviewSphere.radius * 2.8),
      ),
    )
  }
  if (cameraIntent === 'follow' || cameraIntent === 'decision') {
    const heading = bearingRadians(sample, lookAhead)
    return {
      destination: followCameraPosition(sample, heading),
      heading,
      pitch: CesiumMath.toRadians(-14),
      roll: 0,
    }
  }
  if (cameraIntent === 'terrain-pass') {
    const heading = bearingRadians(sample, lookAhead)
    return {
      destination: cinematicTerrainPassCameraPosition(sample, heading),
      heading,
      pitch: CesiumMath.toRadians(-6),
      roll: 0,
    }
  }
  const horizontalDistance = Math.max(1, lookAhead.distanceMeters - sample.distanceMeters)
  const heading = bearingRadians(sample, lookAhead)
  return {
    destination: aircraftPovCameraPosition(sample, heading),
    heading,
    pitch: CesiumMath.clamp(
      Math.atan2(lookAhead.flightHeight - sample.flightHeight, horizontalDistance)
        - CesiumMath.toRadians(14),
      CesiumMath.toRadians(-22),
      CesiumMath.toRadians(-5),
    ),
    roll: 0,
  }
}

function boundingSphereCameraPose(
  camera: Camera,
  sphere: BoundingSphere,
  offset: HeadingPitchRange,
): FlightCameraPose {
  camera.viewBoundingSphere(sphere, offset)
  camera.lookAtTransform(Matrix4.IDENTITY)
  return captureCameraPose(camera)
}

function captureCameraPose(camera: Camera): FlightCameraPose {
  return {
    destination: Cartesian3.clone(camera.positionWC),
    heading: camera.heading,
    pitch: camera.pitch,
    roll: camera.roll,
  }
}

function interpolateFlightCameraPose(
  from: FlightCameraPose,
  to: FlightCameraPose,
  alpha: number,
): FlightCameraPose {
  return {
    destination: Cartesian3.lerp(
      from.destination,
      to.destination,
      alpha,
      new Cartesian3(),
    ),
    heading: interpolateCameraAngleRadians(from.heading, to.heading, alpha),
    pitch: interpolateCameraAngleRadians(from.pitch, to.pitch, alpha),
    roll: interpolateCameraAngleRadians(from.roll, to.roll, alpha),
  }
}

function updateObserverEntity(
  aircraft: Entity,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
): void {
  const position = samplePosition(sample)
  const heading = bearingRadians(sample, lookAhead)
  const pitch = flightPathPitchRadians(sample, lookAhead)
  aircraft.position = new ConstantPositionProperty(position)
  aircraft.orientation = new ConstantProperty(
    Transforms.headingPitchRollQuaternion(
      position,
      new HeadingPitchRoll(aircraftModelHeadingRadians(heading), pitch, 0),
    ),
  )
}

function addDynamicNoFlyZone(
  viewer: Viewer,
  plan: TerrainAwareFlightPlan,
): { entity: Entity; boundingSphere: BoundingSphere } {
  const obstacleSample = interpolatePlanSample(plan, OBSTACLE_ROUTE_PROGRESS)
  const center = samplePosition(obstacleSample)
  const entity = viewer.entities.add({
    id: HIMALAYA_DYNAMIC_NO_FLY_ZONE_ID,
    name: '动态出现的临时禁飞区',
    position: center,
    ellipsoid: {
      radii: new Cartesian3(
        OBSTACLE_RADIUS_METERS,
        OBSTACLE_RADIUS_METERS,
        OBSTACLE_VERTICAL_RADIUS_METERS,
      ),
      material: Color.fromCssColorString('#ff4f64').withAlpha(0.28),
      outline: true,
      outlineColor: Color.fromCssColorString('#ff6b76'),
    },
    label: {
      text: 'UNEXPECTED NO-FLY ZONE',
      font: '700 12px Inter, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString('#5b1019'),
      outlineWidth: 4,
      style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cartesian2(0, -32),
      verticalOrigin: VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    properties: {
      semanticType: 'unexpected-no-fly-zone',
      knownBeforeFlight: false,
      injectedAtProgress: OBSTACLE_INJECTION_PROGRESS,
    },
  })
  return {
    entity,
    boundingSphere: new BoundingSphere(center, OBSTACLE_RADIUS_METERS),
  }
}

function createObstacleSnapshot(plan: TerrainAwareFlightPlan): HimalayaFlightObstacleSnapshot {
  const sample = interpolatePlanSample(plan, OBSTACLE_ROUTE_PROGRESS)
  return {
    objectId: HIMALAYA_DYNAMIC_NO_FLY_ZONE_ID,
    longitude: sample.longitude,
    latitude: sample.latitude,
    height: sample.flightHeight,
    horizontalRadiusMeters: OBSTACLE_RADIUS_METERS,
    verticalRadiusMeters: OBSTACLE_VERTICAL_RADIUS_METERS,
  }
}

async function captureFlightVisualFrame(
  viewer: Viewer,
  initialRenderCount: number,
  getRenderCount: () => number,
  isCancelled: () => boolean,
  sensorId = 'himalaya-independent-camera',
): Promise<HimalayaFlightVisualFrame> {
  const startedAt = new Date().toISOString()
  const ready = await waitForVisualCaptureReadiness(
    viewer,
    initialRenderCount,
    getRenderCount,
    isCancelled,
  )
  if (isCancelled()) throw new Error('Independent camera capture cancelled')

  viewer.resize()
  viewer.scene.requestRender()
  await waitForAnimationFrame()
  const canvas = viewer.scene.canvas
  if (canvas.width < 1 || canvas.height < 1) {
    throw new Error('Independent camera canvas has no renderable size')
  }
  const capturedAt = new Date().toISOString()
  const dataUrl = canvas.toDataURL('image/jpeg', VISUAL_CAPTURE_JPEG_QUALITY)
  if (!dataUrl.startsWith('data:image/jpeg;base64,')) {
    throw new Error('Independent camera did not produce a JPEG frame')
  }
  const cartographic = Cartographic.fromCartesian(viewer.camera.positionWC)
  const frustum = viewer.camera.frustum
  const horizontalFovDegrees = frustum instanceof PerspectiveFrustum
    && frustum.fov !== undefined
    ? CesiumMath.toDegrees(frustum.fov)
    : undefined
  const verticalFovDegrees = frustum instanceof PerspectiveFrustum
    && frustum.fovy !== undefined
    ? CesiumMath.toDegrees(frustum.fovy)
    : undefined
  const sensor: ObservationSensor = {
    sensorId,
    kind: 'camera',
    pose: {
      position: [
        CesiumMath.toDegrees(cartographic.longitude),
        CesiumMath.toDegrees(cartographic.latitude),
        cartographic.height,
      ],
      headingDegrees: CesiumMath.toDegrees(viewer.camera.heading),
      pitchDegrees: CesiumMath.toDegrees(viewer.camera.pitch),
      rollDegrees: CesiumMath.toDegrees(viewer.camera.roll),
    },
    rangeMeters: SENSOR_RANGE_METERS,
    ...(horizontalFovDegrees !== undefined
      ? { horizontalFieldOfViewDegrees: horizontalFovDegrees }
      : {}),
    ...(verticalFovDegrees !== undefined
      ? { verticalFieldOfViewDegrees: verticalFovDegrees }
      : {}),
  }
  return {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    startedAt,
    capturedAt,
    completedAt: new Date().toISOString(),
    readiness: ready ? 'ready' : 'partial',
    changedDuringObservation: false,
    sensor,
  }
}

async function waitForVisualCaptureReadiness(
  viewer: Viewer,
  initialRenderCount: number,
  getRenderCount: () => number,
  isCancelled: () => boolean,
): Promise<boolean> {
  const startedAt = performance.now()
  let stableFrames = 0
  while (performance.now() - startedAt < VISUAL_CAPTURE_TIMEOUT_MS) {
    if (isCancelled()) return false
    viewer.resize()
    viewer.scene.requestRender()
    await waitForAnimationFrame()
    const renderedAfterCameraUpdate = getRenderCount() > initialRenderCount
    const ready = renderedAfterCameraUpdate
      && viewer.scene.globe.tilesLoaded
      && viewer.dataSourceDisplay.ready
    stableFrames = ready ? stableFrames + 1 : 0
    if (stableFrames >= VISUAL_CAPTURE_READY_FRAME_COUNT) return true
  }
  return false
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

function senseFlightCorridor(
  viewer: Viewer,
  sensorCamera: Camera,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
  exclusions: object[],
  noFlyZoneSphere?: BoundingSphere,
): FlightCorridorSensingResult {
  const origin = samplePosition(sample)
  const routeHeading = bearingRadians(sample, lookAhead)
  const routePitch = flightPathPitchRadians(sample, lookAhead)
  const sceneVolumes = collectSceneRayVolumes(viewer, exclusions)
  const segments: FlightSensorRaySegment[] = []
  const readings = SENSOR_HEADING_OFFSETS_DEGREES.map((headingOffsetDegrees) => {
    sensorCamera.setView({
      destination: origin,
      orientation: {
        heading: routeHeading + CesiumMath.toRadians(headingOffsetDegrees),
        pitch: CesiumMath.clamp(
          routePitch + CesiumMath.toRadians(SENSOR_PITCH_DEGREES),
          CesiumMath.toRadians(-18),
          CesiumMath.toRadians(8),
        ),
        roll: 0,
      },
    })
    const direction = Cartesian3.normalize(sensorCamera.directionWC, new Cartesian3())
    const ray = new Ray(origin, direction)
    const candidates: Array<{
      hitType: Exclude<FlightRayReading['hitType'], 'none'>
      distanceMeters: number
      objectId?: string
    }> = []

    if (noFlyZoneSphere) {
      const interval = IntersectionTests.raySphere(ray, noFlyZoneSphere)
      const distanceMeters = interval
        ? interval.start >= 0 ? interval.start : interval.stop >= 0 ? interval.stop : undefined
        : undefined
      if (distanceMeters !== undefined && distanceMeters <= SENSOR_RANGE_METERS) {
        candidates.push({
          hitType: 'no-fly-zone',
          distanceMeters,
          objectId: HIMALAYA_DYNAMIC_NO_FLY_ZONE_ID,
        })
      }
    }

    for (const volume of sceneVolumes) {
      const interval = IntersectionTests.raySphere(ray, volume.boundingSphere)
      const distanceMeters = interval
        ? interval.start >= 0 ? interval.start : interval.stop >= 0 ? interval.stop : undefined
        : undefined
      if (distanceMeters !== undefined && distanceMeters <= SENSOR_RANGE_METERS) {
        candidates.push({
          hitType: 'scene',
          distanceMeters,
          objectId: volume.objectId,
        })
      }
    }

    const terrainHit = viewer.scene.globe.pick(ray, viewer.scene)
    if (terrainHit) {
      const distanceMeters = Cartesian3.distance(origin, terrainHit)
      if (distanceMeters <= SENSOR_RANGE_METERS) {
        candidates.push({ hitType: 'terrain', distanceMeters })
      }
    }

    const nearest = candidates
      .filter(candidate => candidate.distanceMeters > 1)
      .sort((left, right) => left.distanceMeters - right.distanceMeters)[0]
    const reading = {
      headingOffsetDegrees,
      pitchDegrees: CesiumMath.toDegrees(routePitch) + SENSOR_PITCH_DEGREES,
      hitType: nearest?.hitType ?? 'none',
      ...(nearest ? { hitDistanceMeters: nearest.distanceMeters } : {}),
      ...(nearest?.objectId ? { objectId: nearest.objectId } : {}),
    } satisfies FlightRayReading
    segments.push({
      headingOffsetDegrees,
      hitType: reading.hitType,
      positions: [
        Cartesian3.clone(origin),
        Ray.getPoint(ray, nearest?.distanceMeters ?? SENSOR_RANGE_METERS, new Cartesian3()),
      ],
    })
    return reading
  })
  const nearest = readings
    .filter(reading => reading.hitDistanceMeters !== undefined)
    .sort((left, right) => left.hitDistanceMeters! - right.hitDistanceMeters!)[0]
  return {
    frame: {
      sampledAt: new Date().toISOString(),
      rangeMeters: SENSOR_RANGE_METERS,
      readings,
      ...(nearest?.hitDistanceMeters !== undefined
        ? {
            nearestHitDistanceMeters: nearest.hitDistanceMeters,
            nearestHitType: nearest.hitType,
          }
        : {}),
    },
    segments,
  }
}

function updateRaySensorEntities(
  entities: Entity[],
  segments: FlightSensorRaySegment[],
  visible: boolean,
): void {
  entities.forEach((entity, index) => {
    const segment = segments[index]
    if (!segment || !entity.polyline) {
      entity.show = false
      return
    }
    entity.polyline.positions = new ConstantProperty(segment.positions)
    entity.polyline.material = new ColorMaterialProperty(sensorRayColor(segment.hitType))
    entity.show = visible
  })
}

function sensorRayColor(hitType: FlightRayReading['hitType']): Color {
  if (hitType === 'no-fly-zone') return Color.fromCssColorString('#ff4f64').withAlpha(0.94)
  if (hitType === 'scene') return Color.fromCssColorString('#ff9b4a').withAlpha(0.88)
  if (hitType === 'terrain') return Color.fromCssColorString('#f5c768').withAlpha(0.8)
  return Color.fromCssColorString('#5cd9ff').withAlpha(0.62)
}

type FlightTerrainHeightSampler = (
  terrainProvider: TerrainProvider,
  cartographics: readonly Cartographic[],
  signal?: AbortSignal,
  checkpoint?: WorldTaskContext['checkpoint'],
) => Promise<Array<number | undefined>>

interface CreateFlightCorridorCandidateInput {
  viewer: Viewer
  terrainProvider: TerrainProvider
  plan: TerrainAwareFlightPlan
  safetySuggestion: FlightAvoidanceDecision
  direction: FlightAvoidanceDirection
  progress: number
  startSample: TerrainAwareFlightSample
  startOffsetMeters: number
  noFlyZoneSphere?: BoundingSphere
  sceneVolumeExclusions: readonly object[]
  trajectoryId: string
  progressSpan?: number
  peakProgress?: number
  maximumOffsetMeters?: number
  signal?: AbortSignal
  checkpoint?: WorldTaskContext['checkpoint']
  terrainHeightSampler?: FlightTerrainHeightSampler
}

async function createFlightCorridorCandidate(
  input: CreateFlightCorridorCandidateInput,
): Promise<HimalayaFlightCorridorCandidate> {
  input.signal?.throwIfAborted()
  await checkpointCorridorTask(input, true)
  const decision: FlightAvoidanceDecision = {
    ...input.safetySuggestion,
    direction: input.direction,
  }
  const maneuver = createAvoidanceManeuver(decision, input.progress, {
    progressSpan: input.progressSpan ?? AVOIDANCE_PROGRESS_SPAN,
    peakProgress: input.peakProgress ?? OBSTACLE_ROUTE_PROGRESS,
    maximumOffsetMeters: input.maximumOffsetMeters ?? AVOIDANCE_OFFSET_METERS,
    startOffsetMeters: input.startOffsetMeters,
  })
  const candidateEndProgress = 1
  const estimatedDistanceMeters = input.plan.metrics.distanceMeters
    * Math.max(Number.EPSILON, candidateEndProgress - maneuver.startProgress)
  const segmentCount = Math.max(1, Math.ceil(
    estimatedDistanceMeters / CORRIDOR_TERRAIN_LONGITUDINAL_SPACING_METERS,
  ))
  const sceneVolumes = collectSceneRayVolumes(input.viewer, input.sceneVolumeExclusions)
  const trajectoryRadiusMeters = CORRIDOR_TRAJECTORY_RADIUS_METERS
  const targetSampleSpacingMeters = CORRIDOR_TERRAIN_LONGITUDINAL_SPACING_METERS
  const terrainCrossSectionSampleCount = Math.floor(
    trajectoryRadiusMeters * 2 / CORRIDOR_TERRAIN_LATERAL_SPACING_METERS,
  ) + 1
  const samples: HimalayaFlightCorridorCandidateSample[] = []
  const certificateSamples: HimalayaCorridorTrajectorySample[] = []
  const buildSample = (progress: number): {
    progress: number
    sample: TerrainAwareFlightSample
    position: Cartesian3
    maximumTerrainHeight?: number
  } => {
    const isStartSample = Math.abs(progress - maneuver.startProgress) <= Number.EPSILON * 16
    const lookAheadProgress = Math.min(1, progress + 0.004)
    const baseSample = interpolatePlanSample(input.plan, progress)
    const baseLookAhead = interpolatePlanSample(input.plan, lookAheadProgress)
    const sample = isStartSample
      ? { ...input.startSample }
      : progress > maneuver.endProgress
        ? { ...baseSample }
        : applyAvoidanceToSample(
          input.viewer,
          baseSample,
          baseLookAhead,
          maneuver,
          progress,
          input.plan.options.clearanceMeters,
          input.noFlyZoneSphere,
        )
    return {
      progress,
      sample,
      position: samplePosition(sample),
    }
  }
  const progressValues = Array.from({ length: segmentCount + 1 }, (_, index) => (
    maneuver.startProgress
      + (candidateEndProgress - maneuver.startProgress) * (index / segmentCount)
  ))
  progressValues.push(maneuver.peakProgress, maneuver.endProgress)
  const uniqueProgressValues = [...new Set(progressValues)]
    .sort((left, right) => left - right)
  let builtSamples: ReturnType<typeof buildSample>[] = []
  for (let index = 0; index < uniqueProgressValues.length; index++) {
    builtSamples.push(buildSample(uniqueProgressValues[index]!))
    if ((index + 1) % CORRIDOR_BUILD_YIELD_INTERVAL === 0) {
      await checkpointCorridorTask(input)
    }
  }
  for (let pass = 0; pass < 10; pass++) {
    const refined = [builtSamples[0]!]
    let inserted = false
    for (let index = 1; index < builtSamples.length; index++) {
      const previous = builtSamples[index - 1]!
      const current = builtSamples[index]!
      if (
        Cartesian3.distance(previous.position, current.position) > targetSampleSpacingMeters
        && current.progress - previous.progress > Number.EPSILON * 16
      ) {
        refined.push(buildSample((previous.progress + current.progress) / 2))
        inserted = true
      }
      refined.push(current)
      if (index % CORRIDOR_BUILD_YIELD_INTERVAL === 0) {
        await checkpointCorridorTask(input)
      }
    }
    builtSamples = refined
    if (!inserted) break
  }

  const terrainCartographics: Cartographic[] = []
  for (let index = 0; index < builtSamples.length; index++) {
    const built = builtSamples[index]!
    const previous = builtSamples[Math.max(0, index - 1)]!.sample
    const next = builtSamples[Math.min(builtSamples.length - 1, index + 1)]!.sample
    const heading = bearingRadians(previous, next)
    for (
      let lateralOffsetMeters = -trajectoryRadiusMeters;
      lateralOffsetMeters <= trajectoryRadiusMeters;
      lateralOffsetMeters += CORRIDOR_TERRAIN_LATERAL_SPACING_METERS
    ) {
      const coordinate = offsetCoordinateLaterally(
        built.sample,
        heading,
        lateralOffsetMeters,
      )
      terrainCartographics.push(
        Cartographic.fromDegrees(coordinate.longitude, coordinate.latitude),
      )
    }
    if ((index + 1) % CORRIDOR_BUILD_YIELD_INTERVAL === 0) {
      await checkpointCorridorTask(input)
    }
  }
  const sampledTerrainHeights = await (
    input.terrainHeightSampler ?? sampleCorridorTerrainHeights
  )(
    input.terrainProvider,
    terrainCartographics,
    input.signal,
    input.checkpoint,
  )
  input.signal?.throwIfAborted()
  const terrainSampledBuilds: typeof builtSamples = []
  for (let index = 0; index < builtSamples.length; index++) {
    const built = builtSamples[index]!
    const startIndex = index * terrainCrossSectionSampleCount
    const terrainHeights = sampledTerrainHeights
      .slice(startIndex, startIndex + terrainCrossSectionSampleCount)
    const terrainComplete = terrainHeights.length === terrainCrossSectionSampleCount
      && terrainHeights.every((height): height is number => (
        height !== undefined && Number.isFinite(height)
      ))
    terrainSampledBuilds.push({
      ...built,
      ...(terrainComplete ? { maximumTerrainHeight: Math.max(...terrainHeights) } : {}),
    })
    if ((index + 1) % CORRIDOR_BUILD_YIELD_INTERVAL === 0) {
      await checkpointCorridorTask(input)
    }
  }
  builtSamples = terrainSampledBuilds

  const terrainEnvelopedBuilds: typeof builtSamples = []
  for (let index = 0; index < builtSamples.length; index++) {
    const built = builtSamples[index]!
    if (index === 0 || built.maximumTerrainHeight === undefined) {
      terrainEnvelopedBuilds.push(built)
      continue
    }
    const nearbyTerrainHeights = [
      builtSamples[index - 1]?.maximumTerrainHeight,
      built.maximumTerrainHeight,
      builtSamples[index + 1]?.maximumTerrainHeight,
    ].filter((height): height is number => height !== undefined)
    const terrainEnvelopeHeight = Math.max(...nearbyTerrainHeights)
    const flightHeight = Math.max(
      built.sample.flightHeight,
      terrainEnvelopeHeight + input.plan.options.clearanceMeters,
    )
    const sample = {
      ...built.sample,
      flightHeight,
      clearanceMeters: flightHeight - built.maximumTerrainHeight,
    }
    terrainEnvelopedBuilds.push({
      ...built,
      sample,
      position: samplePosition(sample),
    })
    if ((index + 1) % CORRIDOR_BUILD_YIELD_INTERVAL === 0) {
      await checkpointCorridorTask(input)
    }
  }
  builtSamples = terrainEnvelopedBuilds

  let previousPosition: Cartesian3 | undefined
  for (const built of builtSamples) {
    const { progress, sample, position, maximumTerrainHeight } = built
    const distanceFromPreviousMeters = previousPosition
      ? Cartesian3.distance(previousPosition, position)
      : undefined
    const noFlyZoneBoundaryClearanceMeters = input.noFlyZoneSphere
      ? distanceFromPointToSegment(
          input.noFlyZoneSphere.center,
          previousPosition ?? position,
          position,
        ) - input.noFlyZoneSphere.radius - trajectoryRadiusMeters
      : undefined
    const sceneBlocked = sceneVolumes.some(volume => (
      distanceFromPointToSegment(
        volume.boundingSphere.center,
        previousPosition ?? position,
        position,
      ) <= volume.boundingSphere.radius + trajectoryRadiusMeters
    ))
    samples.push({
      progress,
      sample: { ...sample },
      ...(maximumTerrainHeight !== undefined
        ? { corridorTerrainHeightMeters: maximumTerrainHeight }
        : {}),
    })
    certificateSamples.push({
      progress,
      longitude: sample.longitude,
      latitude: sample.latitude,
      flightHeight: sample.flightHeight,
      ...(maximumTerrainHeight !== undefined ? { terrainHeight: maximumTerrainHeight } : {}),
      ...(noFlyZoneBoundaryClearanceMeters !== undefined
        ? { noFlyZoneBoundaryClearanceMeters }
        : {}),
      ...(distanceFromPreviousMeters !== undefined ? { distanceFromPreviousMeters } : {}),
      sceneBlocked,
    })
    previousPosition = position
    if (samples.length % CORRIDOR_BUILD_YIELD_INTERVAL === 0) {
      await checkpointCorridorTask(input)
    }
  }

  const certificate = createHimalayaCorridorCertificate({
    trajectoryId: input.trajectoryId,
    direction: input.direction,
    sampledAt: new Date().toISOString(),
    sceneReady: input.viewer.dataSourceDisplay.ready,
    samples: certificateSamples,
    requiredTerrainClearanceMeters: REQUIRED_TERRAIN_CLEARANCE_METERS,
    requiredNoFlyZoneMarginMeters: NO_FLY_ZONE_SAFETY_MARGIN_METERS,
    maximumSampleSpacingMeters: EXECUTED_ROUTE_SAMPLE_DISTANCE_METERS,
    trajectoryRadiusMeters,
    terrainSampling: {
      source: `terrain-provider-level-${CORRIDOR_TERRAIN_LEVEL}:${ARCGIS_WORLD_ELEVATION_URL}`,
      longitudinalSpacingMeters: CORRIDOR_TERRAIN_LONGITUDINAL_SPACING_METERS,
      lateralSpacingMeters: CORRIDOR_TERRAIN_LATERAL_SPACING_METERS,
      verticalUncertaintyMeters: CORRIDOR_TERRAIN_VERTICAL_UNCERTAINTY_METERS,
    },
  })
  return {
    trajectoryId: input.trajectoryId,
    direction: input.direction,
    maneuver,
    certificate,
    samples,
  }
}

async function sampleCorridorTerrainHeights(
  terrainProvider: TerrainProvider,
  cartographics: readonly Cartographic[],
  signal?: AbortSignal,
  checkpoint?: WorldTaskContext['checkpoint'],
): Promise<Array<number | undefined>> {
  const heights: Array<number | undefined> = []
  for (let start = 0; start < cartographics.length; start += CORRIDOR_TERRAIN_SAMPLE_CHUNK_SIZE) {
    signal?.throwIfAborted()
    const chunk = cartographics.slice(
      start,
      start + CORRIDOR_TERRAIN_SAMPLE_CHUNK_SIZE,
    )
    try {
      const sampled = await sampleTerrain(
        terrainProvider,
        CORRIDOR_TERRAIN_LEVEL,
        [...chunk],
        true,
      )
      heights.push(...sampled.map(position => (
        Number.isFinite(position.height) ? position.height : undefined
      )))
    } catch {
      heights.push(...chunk.map(() => undefined))
    }
    if (checkpoint) await checkpoint(true)
    else await yieldToBrowserTask()
    signal?.throwIfAborted()
  }
  return heights
}

function createHimalayaTerrainWorkerExecutor(): WorldWorkerExecutor<
  HimalayaTerrainWorkerInput,
  HimalayaTerrainWorkerOutput
> | undefined {
  if (typeof Worker === 'undefined') return undefined
  return new WorldWorkerExecutor({
    createWorker: () => new Worker(
      new URL('./himalaya-terrain-worker.ts', import.meta.url),
      { type: 'module', name: 'himalaya-terrain-sampler' },
    ),
  })
}

async function sampleCorridorTerrainHeightsInWorker(
  executor: WorldWorkerExecutor<HimalayaTerrainWorkerInput, HimalayaTerrainWorkerOutput>,
  cartographics: readonly Cartographic[],
  signal?: AbortSignal,
): Promise<Array<number | undefined>> {
  const cartographicRadians = new Float64Array(cartographics.length * 2)
  cartographics.forEach((position, index) => {
    cartographicRadians[index * 2] = position.longitude
    cartographicRadians[index * 2 + 1] = position.latitude
  })
  const result = await executor.run({
    terrainUrl: ARCGIS_WORLD_ELEVATION_URL,
    level: CORRIDOR_TERRAIN_LEVEL,
    cartographicRadians,
  }, {
    ...(signal ? { signal } : {}),
    transfer: [cartographicRadians.buffer],
  })
  if (result.heights.length !== cartographics.length) {
    throw new Error('Terrain Worker returned an unexpected height count')
  }
  return Array.from(result.heights, height => (
    Number.isFinite(height) ? height : undefined
  ))
}

async function checkpointCorridorTask(
  input: Pick<CreateFlightCorridorCandidateInput, 'checkpoint' | 'signal'>,
  force = false,
): Promise<void> {
  if (input.checkpoint) await input.checkpoint(force)
  else await yieldToBrowserTask()
  input.signal?.throwIfAborted()
}

export function waitForLiveTrajectoryRebase<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      callback()
    }
    const abort = (): void => settle(() => reject(
      signal.reason instanceof Error
        ? signal.reason
        : new Error('Live trajectory rebase was aborted'),
    ))
    const timeout = setTimeout(() => settle(() => reject(
      new Error(`Live trajectory rebase exceeded ${timeoutMs} ms`),
    )), timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      value => settle(() => resolve(value)),
      error => settle(() => reject(error)),
    )
    if (signal.aborted) abort()
  })
}

export interface RebaseFlightCorridorCandidateInput {
  candidate: HimalayaFlightCorridorCandidate
  viewer: Viewer
  terrainProvider: TerrainProvider
  progress: number
  startSample: TerrainAwareFlightSample
  requiredTerrainClearanceMeters: number
  noFlyZoneSphere?: BoundingSphere
  sceneVolumeExclusions: readonly object[]
  trajectoryId: string
  signal?: AbortSignal
  terrainHeightSampler?: FlightTerrainHeightSampler
}

export async function rebaseFlightCorridorCandidate(
  input: RebaseFlightCorridorCandidateInput,
): Promise<HimalayaFlightCorridorCandidate> {
  const progressEpsilon = Number.EPSILON * 32
  const remainingSamples = input.candidate.samples
    .filter(item => item.progress > input.progress + progressEpsilon)
    .map(item => ({
      ...item,
      sample: { ...item.sample },
    }))
  const nextSample = remainingSamples[0]
  const samples: HimalayaFlightCorridorCandidateSample[] = []
  let handoffDistanceMeters: number | undefined

  if (nextSample) {
    const startPosition = samplePosition(input.startSample)
    const nextPosition = samplePosition(nextSample.sample)
    handoffDistanceMeters = Cartesian3.distance(startPosition, nextPosition)
    const connectionSegmentCount = Math.max(1, Math.ceil(
      handoffDistanceMeters
        / CORRIDOR_TERRAIN_LONGITUDINAL_SPACING_METERS,
    ))
    const connectionSamples: HimalayaFlightCorridorCandidateSample[] = []
    for (let index = 0; index < connectionSegmentCount; index++) {
      const phase = index / connectionSegmentCount
      const progress = input.progress
        + (nextSample.progress - input.progress) * phase
      const interpolated = index === 0
        ? { ...input.startSample }
        : interpolateTerrainAwareSample(input.startSample, nextSample.sample, phase)
      connectionSamples.push({ progress, sample: interpolated })
    }
    const terrainCartographics: Cartographic[] = []
    for (let index = 0; index < connectionSamples.length; index++) {
      const item = connectionSamples[index]!
      const previous = connectionSamples[Math.max(0, index - 1)]!.sample
      const next = connectionSamples[index + 1]?.sample ?? nextSample.sample
      const heading = bearingRadians(previous, next)
      for (
        let lateralOffsetMeters = -CORRIDOR_TRAJECTORY_RADIUS_METERS;
        lateralOffsetMeters <= CORRIDOR_TRAJECTORY_RADIUS_METERS;
        lateralOffsetMeters += CORRIDOR_TERRAIN_LATERAL_SPACING_METERS
      ) {
        const coordinate = offsetCoordinateLaterally(
          item.sample,
          heading,
          lateralOffsetMeters,
        )
        terrainCartographics.push(
          Cartographic.fromDegrees(coordinate.longitude, coordinate.latitude),
        )
      }
    }
    const terrainHeights = await (
      input.terrainHeightSampler ?? sampleCorridorTerrainHeights
    )(
      input.terrainProvider,
      terrainCartographics,
      input.signal,
    )
    const crossSectionSampleCount = Math.floor(
      CORRIDOR_TRAJECTORY_RADIUS_METERS * 2
        / CORRIDOR_TERRAIN_LATERAL_SPACING_METERS,
    ) + 1
    for (let index = 0; index < connectionSamples.length; index++) {
      const item = connectionSamples[index]!
      const crossSectionHeights = terrainHeights.slice(
        index * crossSectionSampleCount,
        (index + 1) * crossSectionSampleCount,
      )
      const terrainComplete = crossSectionHeights.length === crossSectionSampleCount
        && crossSectionHeights.every((height): height is number => (
          height !== undefined && Number.isFinite(height)
        ))
      const maximumTerrainHeight = terrainComplete
        ? Math.max(...crossSectionHeights)
        : undefined
      const sample = index === 0 || maximumTerrainHeight === undefined
        ? item.sample
        : elevateCorridorSample(
            item.sample,
            maximumTerrainHeight,
            input.requiredTerrainClearanceMeters,
          )
      samples.push({
        progress: item.progress,
        sample,
        ...(maximumTerrainHeight !== undefined
          ? { corridorTerrainHeightMeters: maximumTerrainHeight }
          : {}),
      })
    }
  } else {
    samples.push({
      progress: input.progress,
      sample: { ...input.startSample },
    })
  }
  samples.push(...remainingSamples)

  const sceneVolumes = collectSceneRayVolumes(
    input.viewer,
    input.sceneVolumeExclusions,
  )
  const certificateSamples: HimalayaCorridorTrajectorySample[] = []
  let previousPosition: Cartesian3 | undefined
  for (const item of samples) {
    const position = samplePosition(item.sample)
    const segmentStart = previousPosition ?? position
    const distanceFromPreviousMeters = previousPosition
      ? Cartesian3.distance(previousPosition, position)
      : undefined
    const noFlyZoneBoundaryClearanceMeters = input.noFlyZoneSphere
      ? distanceFromPointToSegment(
          input.noFlyZoneSphere.center,
          segmentStart,
          position,
        ) - input.noFlyZoneSphere.radius - CORRIDOR_TRAJECTORY_RADIUS_METERS
      : undefined
    const sceneBlocked = sceneVolumes.some(volume => (
      distanceFromPointToSegment(
        volume.boundingSphere.center,
        segmentStart,
        position,
      ) <= volume.boundingSphere.radius + CORRIDOR_TRAJECTORY_RADIUS_METERS
    ))
    certificateSamples.push({
      progress: item.progress,
      longitude: item.sample.longitude,
      latitude: item.sample.latitude,
      flightHeight: item.sample.flightHeight,
      ...(item.corridorTerrainHeightMeters !== undefined
        ? { terrainHeight: item.corridorTerrainHeightMeters }
        : {}),
      ...(noFlyZoneBoundaryClearanceMeters !== undefined
        ? { noFlyZoneBoundaryClearanceMeters }
        : {}),
      ...(distanceFromPreviousMeters !== undefined ? { distanceFromPreviousMeters } : {}),
      sceneBlocked,
    })
    previousPosition = position
  }

  const certificate = createHimalayaCorridorCertificate({
    trajectoryId: input.trajectoryId,
    direction: input.candidate.direction,
    sampledAt: new Date().toISOString(),
    sceneReady: input.viewer.dataSourceDisplay.ready,
    samples: certificateSamples,
    requiredTerrainClearanceMeters: input.requiredTerrainClearanceMeters,
    requiredNoFlyZoneMarginMeters: NO_FLY_ZONE_SAFETY_MARGIN_METERS,
    maximumSampleSpacingMeters: EXECUTED_ROUTE_SAMPLE_DISTANCE_METERS,
    trajectoryRadiusMeters: CORRIDOR_TRAJECTORY_RADIUS_METERS,
    terrainSampling: {
      source: `terrain-provider-level-${CORRIDOR_TERRAIN_LEVEL}:${ARCGIS_WORLD_ELEVATION_URL}`,
      longitudinalSpacingMeters: CORRIDOR_TERRAIN_LONGITUDINAL_SPACING_METERS,
      lateralSpacingMeters: CORRIDOR_TERRAIN_LATERAL_SPACING_METERS,
      verticalUncertaintyMeters: CORRIDOR_TERRAIN_VERTICAL_UNCERTAINTY_METERS,
    },
    ...(handoffDistanceMeters !== undefined ? {
      kinematicHandoff: {
        distanceMeters: handoffDistanceMeters,
        maximumDistanceMeters: MAX_LIVE_TRAJECTORY_HANDOFF_DISTANCE_METERS,
      },
    } : {}),
  })
  return {
    ...input.candidate,
    trajectoryId: input.trajectoryId,
    certificate,
    samples,
  }
}

function elevateCorridorSample(
  sample: TerrainAwareFlightSample,
  maximumTerrainHeight: number,
  requiredTerrainClearanceMeters: number,
): TerrainAwareFlightSample {
  const flightHeight = Math.max(
    sample.flightHeight,
    maximumTerrainHeight
      + requiredTerrainClearanceMeters
      + CORRIDOR_TERRAIN_VERTICAL_UNCERTAINTY_METERS,
  )
  return {
    ...sample,
    flightHeight,
    clearanceMeters: flightHeight - maximumTerrainHeight,
  }
}

function applyCommittedCorridorCandidate(
  candidate: HimalayaFlightCorridorCandidate | undefined,
  progress: number,
): TerrainAwareFlightSample | undefined {
  if (!candidate || candidate.samples.length === 0) return undefined
  const first = candidate.samples[0]!
  const last = candidate.samples.at(-1)!
  if (progress < first.progress || progress > last.progress) return undefined
  const upperIndex = candidate.samples.findIndex(item => item.progress >= progress)
  if (upperIndex < 0) return undefined
  if (upperIndex === 0) return { ...first.sample }
  const lower = candidate.samples[upperIndex - 1]!
  const upper = candidate.samples[upperIndex]!
  const phase = (progress - lower.progress)
    / Math.max(Number.EPSILON, upper.progress - lower.progress)
  return interpolateTerrainAwareSample(lower.sample, upper.sample, phase)
}

function interpolateTerrainAwareSample(
  start: TerrainAwareFlightSample,
  end: TerrainAwareFlightSample,
  phase: number,
): TerrainAwareFlightSample {
  const mix = (left: number, right: number): number => left + (right - left) * phase
  return {
    longitude: mix(start.longitude, end.longitude),
    latitude: mix(start.latitude, end.latitude),
    terrainHeight: mix(start.terrainHeight, end.terrainHeight),
    flightHeight: mix(start.flightHeight, end.flightHeight),
    clearanceMeters: mix(start.clearanceMeters, end.clearanceMeters),
    distanceMeters: mix(start.distanceMeters, end.distanceMeters),
    naiveFlightHeight: mix(start.naiveFlightHeight, end.naiveFlightHeight),
    naiveClearanceMeters: mix(start.naiveClearanceMeters, end.naiveClearanceMeters),
  }
}

function distanceFromPointToSegment(
  point: Cartesian3,
  start: Cartesian3,
  end: Cartesian3,
): number {
  const segment = Cartesian3.subtract(end, start, new Cartesian3())
  const segmentLengthSquared = Cartesian3.magnitudeSquared(segment)
  if (segmentLengthSquared <= Number.EPSILON) return Cartesian3.distance(point, start)
  const pointOffset = Cartesian3.subtract(point, start, new Cartesian3())
  const phase = CesiumMath.clamp(
    Cartesian3.dot(pointOffset, segment) / segmentLengthSquared,
    0,
    1,
  )
  const nearest = Cartesian3.add(
    start,
    Cartesian3.multiplyByScalar(segment, phase, new Cartesian3()),
    new Cartesian3(),
  )
  return Cartesian3.distance(point, nearest)
}

function applyAvoidanceToSample(
  viewer: Viewer,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
  maneuver: FlightAvoidanceManeuver | undefined,
  progress: number,
  requiredClearanceMeters: number,
  noFlyZoneSphere?: BoundingSphere,
): TerrainAwareFlightSample {
  const profileOffsetMeters = maneuverLateralOffsetMeters(maneuver, progress)
  if (!maneuver) return { ...sample }
  const offsetSign = maneuver.direction === 'left' ? -1 : 1
  let lateralOffsetMeters = profileOffsetMeters
  if (noFlyZoneSphere) {
    const safetyRadius = noFlyZoneSphere.radius + NO_FLY_ZONE_SAFETY_MARGIN_METERS
    const baselineDistance = Cartesian3.distance(samplePosition(sample), noFlyZoneSphere.center)
    if (Math.abs(profileOffsetMeters) < Number.EPSILON && baselineDistance >= safetyRadius) {
      return { ...sample }
    }
    const minimumOrthogonalOffset = Math.sqrt(Math.max(
      0,
      safetyRadius * safetyRadius - baselineDistance * baselineDistance,
    ))
    lateralOffsetMeters = offsetSign * Math.max(
      Math.abs(lateralOffsetMeters),
      minimumOrthogonalOffset + 120,
    )
  } else if (Math.abs(profileOffsetMeters) < Number.EPSILON) {
    return { ...sample }
  }

  let candidate = createOffsetFlightSample(
    viewer,
    sample,
    lookAhead,
    lateralOffsetMeters,
    requiredClearanceMeters,
  )
  if (noFlyZoneSphere) {
    const safetyRadius = noFlyZoneSphere.radius + NO_FLY_ZONE_SAFETY_MARGIN_METERS
    for (let attempt = 0; attempt < 32; attempt++) {
      const distance = Cartesian3.distance(samplePosition(candidate), noFlyZoneSphere.center)
      if (distance >= safetyRadius) break
      lateralOffsetMeters = offsetSign * (
        Math.abs(lateralOffsetMeters)
        + Math.max(250, (safetyRadius - distance) * 1.35)
      )
      candidate = createOffsetFlightSample(
        viewer,
        sample,
        lookAhead,
        lateralOffsetMeters,
        requiredClearanceMeters,
      )
    }
  }
  return candidate
}

function createOffsetFlightSample(
  viewer: Viewer,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
  lateralOffsetMeters: number,
  requiredClearanceMeters: number,
): TerrainAwareFlightSample {
  const coordinate = offsetCoordinateLaterally(
    sample,
    bearingRadians(sample, lookAhead),
    lateralOffsetMeters,
  )
  const loadedTerrainHeight = viewer.scene.globe.getHeight(
    Cartographic.fromDegrees(coordinate.longitude, coordinate.latitude),
  )
  const terrainHeight = loadedTerrainHeight !== undefined && Number.isFinite(loadedTerrainHeight)
    ? loadedTerrainHeight
    : sample.terrainHeight
  const flightHeight = Math.max(
    sample.flightHeight,
    terrainHeight + requiredClearanceMeters,
  )
  return {
    ...sample,
    ...coordinate,
    terrainHeight,
    flightHeight,
    clearanceMeters: flightHeight - terrainHeight,
  }
}

function appendExecutedRoutePosition(
  positions: Cartesian3[],
  sample: TerrainAwareFlightSample,
): void {
  const position = samplePosition(sample)
  const previous = positions.at(-1)
  if (!previous || Cartesian3.distance(previous, position) >= EXECUTED_ROUTE_SAMPLE_DISTANCE_METERS) {
    positions.push(position)
  }
}

function collectSceneRayVolumes(
  viewer: Viewer,
  exclusions: readonly object[],
): Array<{ objectId: string; boundingSphere: BoundingSphere }> {
  const excluded = new Set(exclusions)
  const volumes: Array<{ objectId: string; boundingSphere: BoundingSphere }> = []
  for (let index = 0; index < viewer.scene.primitives.length; index++) {
    const primitive = viewer.scene.primitives.get(index) as unknown as {
      id?: unknown
      boundingSphere?: BoundingSphere
      constructor?: { name?: string }
    }
    const constructorName = primitive.constructor?.name ?? ''
    if (
      excluded.has(primitive)
      || (primitive.id !== undefined && excluded.has(primitive.id as object))
      || !primitive.boundingSphere
      || (!constructorName.includes('Tileset') && !constructorName.includes('Model'))
    ) continue
    volumes.push({
      objectId: primitiveObjectId(primitive.id, index),
      boundingSphere: BoundingSphere.clone(primitive.boundingSphere),
    })
  }
  return volumes
}

function primitiveObjectId(value: unknown, index: number): string {
  if (typeof value === 'string' && value.trim()) return value
  if (
    typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof value.id === 'string'
    && value.id.trim()
  ) return value.id
  return `primitive:${index}`
}

async function waitForInitialSceneReadiness(
  isReady: () => boolean,
  requestRender: () => void,
  isCancelled: () => boolean,
): Promise<boolean> {
  const startedAt = performance.now()
  let readyFrameCount = 0
  while (performance.now() - startedAt < INITIAL_READINESS_TIMEOUT_MS) {
    if (isCancelled()) return false
    requestRender()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    readyFrameCount = isReady() ? readyFrameCount + 1 : 0
    if (readyFrameCount >= INITIAL_READY_FRAME_COUNT) return true
  }
  return false
}

function applyFlightStreamingProfile(
  viewer: Viewer,
  observerViewer?: Viewer,
): () => void {
  const profiles = [
    {
      viewer,
      maximumScreenSpaceError: MAIN_FLIGHT_MAXIMUM_SCREEN_SPACE_ERROR,
      tileCacheSize: MAIN_FLIGHT_TILE_CACHE_SIZE,
    },
    ...(observerViewer ? [{
      viewer: observerViewer,
      maximumScreenSpaceError: OBSERVER_FLIGHT_MAXIMUM_SCREEN_SPACE_ERROR,
      tileCacheSize: OBSERVER_FLIGHT_TILE_CACHE_SIZE,
    }] : []),
  ].map((profile) => {
    const globe = profile.viewer.scene.globe
    const previousMaximumScreenSpaceError = globe.maximumScreenSpaceError
    const previousTileCacheSize = globe.tileCacheSize
    globe.maximumScreenSpaceError = Math.max(
      previousMaximumScreenSpaceError,
      profile.maximumScreenSpaceError,
    )
    globe.tileCacheSize = Math.max(previousTileCacheSize, profile.tileCacheSize)
    return { globe, previousMaximumScreenSpaceError, previousTileCacheSize }
  })

  return () => {
    for (const profile of profiles) {
      profile.globe.maximumScreenSpaceError = profile.previousMaximumScreenSpaceError
      profile.globe.tileCacheSize = profile.previousTileCacheSize
    }
  }
}

function transitionToFlightView(
  viewer: Viewer,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
  viewMode: HimalayaFlightViewMode,
): Promise<void> {
  if (viewMode === 'overview') {
    return flyCameraToOverview(
      viewer,
      BoundingSphere.fromPoints([samplePosition(sample), samplePosition(lookAhead)]),
    )
  }
  if (viewMode === 'follow') return flyCameraToFollow(viewer, sample, lookAhead)
  return flyCameraToSample(viewer, sample, lookAhead, 2.2)
}

function flyCameraToFollow(
  viewer: Viewer,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
): Promise<void> {
  const heading = bearingRadians(sample, lookAhead)
  return new Promise(resolve => {
    viewer.camera.flyTo({
      destination: followCameraPosition(sample, heading),
      orientation: {
        heading,
        pitch: CesiumMath.toRadians(-14),
        roll: 0,
      },
      duration: 2.2,
      complete: resolve,
      cancel: resolve,
    })
  })
}

function flyCameraToSample(
  viewer: Viewer,
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
  duration: number,
): Promise<void> {
  const heading = bearingRadians(sample, lookAhead)
  return new Promise(resolve => {
    viewer.camera.flyTo({
      destination: aircraftPovCameraPosition(sample, heading),
      orientation: {
        heading,
        pitch: CesiumMath.toRadians(-4),
        roll: 0,
      },
      duration,
      complete: resolve,
      cancel: resolve,
    })
  })
}

function flyCameraToOverview(viewer: Viewer, routeSphere: BoundingSphere): Promise<void> {
  return new Promise(resolve => {
    viewer.camera.flyToBoundingSphere(routeSphere, {
      offset: new HeadingPitchRange(
        CesiumMath.toRadians(18),
        CesiumMath.toRadians(-48),
        Math.max(82_000, routeSphere.radius * 2.8),
      ),
      duration: 2.2,
      complete: resolve,
      cancel: resolve,
    })
  })
}

function samplePosition(sample: TerrainAwareFlightSample): Cartesian3 {
  return Cartesian3.fromDegrees(sample.longitude, sample.latitude, sample.flightHeight)
}

function followCameraPosition(
  sample: TerrainAwareFlightSample,
  heading: number,
): Cartesian3 {
  const transform = Transforms.eastNorthUpToFixedFrame(samplePosition(sample))
  const offset = new Cartesian3(
    -Math.sin(heading) * FOLLOW_CAMERA_DISTANCE_METERS,
    -Math.cos(heading) * FOLLOW_CAMERA_DISTANCE_METERS,
    FOLLOW_CAMERA_HEIGHT_METERS,
  )
  return Matrix4.multiplyByPoint(transform, offset, new Cartesian3())
}

function aircraftPovCameraPosition(
  sample: TerrainAwareFlightSample,
  heading: number,
): Cartesian3 {
  const transform = Transforms.eastNorthUpToFixedFrame(samplePosition(sample))
  const offset = new Cartesian3(
    Math.sin(heading) * 140,
    Math.cos(heading) * 140,
    28,
  )
  return Matrix4.multiplyByPoint(transform, offset, new Cartesian3())
}

function cinematicTerrainPassCameraPosition(
  sample: TerrainAwareFlightSample,
  heading: number,
): Cartesian3 {
  const terrainPosition = Cartesian3.fromDegrees(
    sample.longitude,
    sample.latitude,
    sample.terrainHeight + TERRAIN_PASS_CLEARANCE_METERS,
  )
  const transform = Transforms.eastNorthUpToFixedFrame(terrainPosition)
  const offset = new Cartesian3(
    Math.sin(heading) * 180,
    Math.cos(heading) * 180,
    35,
  )
  return Matrix4.multiplyByPoint(transform, offset, new Cartesian3())
}

function observerPitchRadians(
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
): number {
  return CesiumMath.clamp(
    flightPathPitchRadians(sample, lookAhead) - CesiumMath.toRadians(18),
    CesiumMath.toRadians(-32),
    CesiumMath.toRadians(-6),
  )
}

function flightPathPitchRadians(
  sample: TerrainAwareFlightSample,
  lookAhead: TerrainAwareFlightSample,
): number {
  const horizontalDistance = Math.max(1, lookAhead.distanceMeters - sample.distanceMeters)
  return Math.atan2(lookAhead.flightHeight - sample.flightHeight, horizontalDistance)
}

function emitPassedObservations(
  plan: TerrainAwareFlightPlan,
  routeProgress: number,
  observedCheckpoints: Set<string>,
  onObservation?: (observation: HimalayaFlightObservation) => void,
): void {
  if (!onObservation) return
  HIMALAYA_ROUTE_ANCHORS.forEach((anchor, index) => {
    const id = `himalaya-observation-${index + 1}`
    if (observedCheckpoints.has(id)) return
    const sample = nearestSample(plan.samples, anchor)
    const checkpointProgress = sample.distanceMeters / plan.metrics.distanceMeters
    if (routeProgress + 1e-6 < checkpointProgress) return

    observedCheckpoints.add(id)
    onObservation({
      id,
      kind: 'checkpoint',
      name: anchor.name ?? `观察点 ${index + 1}`,
      observedAt: new Date().toISOString(),
      progress: checkpointProgress,
      longitude: sample.longitude,
      latitude: sample.latitude,
      terrainHeight: sample.terrainHeight,
      flightHeight: sample.flightHeight,
      clearanceMeters: sample.clearanceMeters,
    })
  })
}

function bearingRadians(
  start: FlightRouteCoordinate,
  end: FlightRouteCoordinate,
): number {
  const startLatitude = CesiumMath.toRadians(start.latitude)
  const endLatitude = CesiumMath.toRadians(end.latitude)
  const longitudeDelta = CesiumMath.toRadians(end.longitude - start.longitude)
  const y = Math.sin(longitudeDelta) * Math.cos(endLatitude)
  const x = Math.cos(startLatitude) * Math.sin(endLatitude)
    - Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta)
  return Math.atan2(y, x)
}

function nearestSample(
  samples: readonly TerrainAwareFlightSample[],
  coordinate: FlightRouteCoordinate,
): TerrainAwareFlightSample {
  return samples.reduce((nearest, sample) => {
    const nearestDistance = coordinateDistanceSquared(nearest, coordinate)
    const sampleDistance = coordinateDistanceSquared(sample, coordinate)
    return sampleDistance < nearestDistance ? sample : nearest
  })
}

function coordinateDistanceSquared(
  start: FlightRouteCoordinate,
  end: FlightRouteCoordinate,
): number {
  const longitude = start.longitude - end.longitude
  const latitude = start.latitude - end.latitude
  return longitude * longitude + latitude * latitude
}

function removeFlightEntities(viewer: Viewer): void {
  ROUTE_ENTITY_IDS.forEach(id => viewer.entities.removeById(id))
  for (let index = 0; index < HIMALAYA_ROUTE_ANCHORS.length; index++) {
    viewer.entities.removeById(`himalaya-flight-anchor-${index + 1}`)
  }
}

function easeInOut(value: number): number {
  return value < 0.5
    ? 2 * value * value
    : 1 - Math.pow(-2 * value + 2, 2) / 2
}

function interpolate(start: number, end: number, fraction: number): number {
  return start + (end - start) * fraction
}

function yieldToBrowserTask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}
