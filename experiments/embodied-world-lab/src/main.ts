import './ui-components.js'
import type { UiButton, UiDetails, UiDialog, UiInput, UiOption, UiSelect, UiSlider, UiTextarea } from './ui-components.js'
import {
  ArcGISTiledElevationTerrainProvider,
  CallbackProperty,
  CallbackPositionProperty,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ConstantPositionProperty,
  DistanceDisplayCondition,
  Ellipsoid,
  EllipsoidTerrainProvider,
  HeightReference,
  HorizontalOrigin,
  ImageryLayer,
  LabelStyle,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  PolylineDashMaterialProperty,
  ConstantProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  sampleTerrainMostDetailed,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
} from 'cesium'
import type { Entity, TerrainProvider } from 'cesium'
import { playerController } from 'cesium-player-controller'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './style.css'

import {
  WorldTaskRuntime,
  WorldTaskSupersededError,
} from '../../../packages/cesium-mcp-spatial/src/index.js'
import { CesiumPlayerEmbodiment } from './cesium-player-embodiment.js'
import type { ActorRayFan, ActorRayHitFan } from './cesium-player-embodiment.js'
import { CameraPresetTransition } from './camera-transition.js'
import { UrbanFollowCamera } from './urban-follow-camera.js'
import { urbanTravelSpeed } from './urban-travel-speed.js'
import { urbanMotionSpeedLimit } from './urban-motion-speed-limit.js'
import { LabWorldInquiry } from './world-inquiry.js'
import { EmbodiedAgentLoop } from './embodied-agent-loop.js'
import { requestJevMotionPlan } from './jev-planner.js'
import { createBridgeAgentChannel } from './bridge-agent-channel.js'
import type { BridgeAgentTrace } from './bridge-agent-channel.js'
import type {
  EmbodiedTickResult,
  EmbodiedWorldSnapshot,
} from './embodied-agent-loop.js'
import {
  createFallbackPlan,
  requestHostedMotionPlan,
} from './hosted-planner.js'
import {
  ARCGIS_WORLD_ELEVATION_URL,
  ESRI_WORLD_IMAGERY_URL,
  createScenario,
  SCENARIO_PRESETS,
} from './scenario.js'
import type { ScenarioPreset } from './scenario.js'
import { addUrbanBuildingColliders, createUrbanGround, createUrbanScenario, insideUrbanCoverage, URBAN_COLLISION_BOUNDS, URBAN_GROUND_HEIGHT, URBAN_METADATA } from './urban-scene.js'
import type { UrbanVisualState } from './urban-scene.js'
import { createUrbanStreamingGround } from './urban-streaming-ground.js'
import type { UrbanStreamingGround } from './urban-streaming-ground.js'
import { loadUrbanBuildingMesh } from './urban-building-mesh.js'
import { GRAY_BASEMAP_CREDIT, GRAY_BASEMAP_URL, loadUrbanBuildingLayer, resolveUrbanBuildingSource, URBAN_SOURCE_LABELS } from './urban-building-source.js'
import { URBAN_WHITE_BUILDINGS_ID } from './urban-white-buildings.js'
import { createMovementContinuity } from './movement-continuity.js'
import { createUrbanNavigation } from './urban-navigation.js'
import type { UrbanRouteCandidate } from './urban-navigation.js'
import { UrbanRouteFollower } from './urban-route-follower.js'
import { readUrbanMission, writeUrbanMission } from './urban-mission-url.js'
import { requestJevRoute } from './jev-route-planner.js'
import type { NavigationRouteObservation, NavigationRouteId } from './jev-route-planner.js'
import {
  distanceMeters,
  initialBearingRadians,
  isGroundSupportHit,
  offsetGeoPoint,
  senseEmbodiedWorld,
} from './world-sensor.js'
import type { CircularHazard, GeoPoint } from './world-sensor.js'

const SENSOR_DISTANCE_METERS = 32
const HAZARD_PADDING_METERS = 6
const FAST_LOOP_INTERVAL_MS = 50
const MODEL_RETRY_COOLDOWN_MS = 30_000
const MODEL_TIMEOUT_MS = 15_000
const sceneQuery = new URLSearchParams(location.search)
const displayScenarios = [URBAN_METADATA, ...SCENARIO_PRESETS]
const selectedPreset = displayScenarios.some(item => item.id === sceneQuery.get('scene'))
  ? sceneQuery.get('scene') as ScenarioPreset | 'city' : 'city'
const isUrban = selectedPreset === 'city'
const buildingCredentials = {
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  cesiumIonToken: import.meta.env.VITE_CESIUM_ION_TOKEN,
}
const buildingChoice = resolveUrbanBuildingSource(sceneQuery.get('buildings'), buildingCredentials)
const useJev = isUrban || sceneQuery.get('planner') !== 'hosted'
const selectedSeed = Math.max(1, Math.min(999999, Number(sceneQuery.get('seed')) || 260921)) | 0
const scenario = isUrban ? createUrbanScenario(selectedSeed) : createScenario(selectedPreset as ScenarioPreset, selectedSeed)
const NAMCHE_START = scenario.start
const NAMCHE_GOAL = scenario.goal
const CITY_LONG_MISSION = {
  start: { longitude: 139.7632081060892, latitude: 35.67707705479974, height: URBAN_GROUND_HEIGHT },
  goal: { longitude: 139.76537322496728, latitude: 35.68989320722705, height: URBAN_GROUND_HEIGHT },
}
const LANDSLIDE_HAZARD = scenario.hazard
const decisionTrace: Array<Record<string, unknown>> = []
const bridgeTrace: BridgeAgentTrace[] = []
const movementContinuity = createMovementContinuity()
const continuity = movementContinuity.stats
const TERRAIN_GRID_HALF_SIZE = 6
const TERRAIN_GRID_STEP_METERS = 35
const TERRAIN_RECTANGLE_DEGREES = 0.0032
const FOX_NOTICE_URL = new URL('../public/THIRD_PARTY_NOTICES.md', import.meta.url).href

const worldStatus = element<HTMLElement>('worldStatus')
const phaseLabel = element<HTMLElement>('phaseLabel')
const phaseTitle = element<HTMLElement>('phaseTitle')
const phaseDetail = element<HTMLElement>('phaseDetail')
const distanceMetric = element<HTMLElement>('distanceMetric')
const modelStatus = element<HTMLElement>('modelStatus')
const chatMessages = element<HTMLElement>('chatMessages')
const chatForm = element<HTMLFormElement>('chatForm')
const chatInput = element<UiTextarea>('chatInput')
const loopStatus = element<HTMLElement>('loopStatus')
const revisionStatus = element<HTMLElement>('revisionStatus')
const foxCredits = element<HTMLAnchorElement>('foxCredits')
foxCredits.href = FOX_NOTICE_URL
if (useJev) {
  modelStatus.textContent = 'JEV · 等待开始'
  const intro = chatMessages.querySelector('p')
  if (intro) intro.textContent = isUrban
    ? '你可以自己选择起点和终点。先预览建筑间的可行路线，再让 Jev 选择路线并控制人物行动。'
    : 'Jev 在后台持续更新下一段动作，角色沿当前有效计划连续前进。建筑和地形碰撞由本地控制器实时处理；此实验使用结构化观测。'
}
element('urbanRoutePanel').hidden = !isUrban
element('urbanMissionEditor').hidden = !isUrban
element<UiDetails>('otherScenarios').open = !isUrban

let viewer: Viewer | undefined
let player: playerController | undefined
let urbanStreamingGround: UrbanStreamingGround | undefined
let embodiment: CesiumPlayerEmbodiment | undefined
let agentLoop: EmbodiedAgentLoop | undefined
let agentChannel: ReturnType<typeof createBridgeAgentChannel> | undefined
let removePreUpdate: (() => void) | undefined
let hazardEntity: Entity | undefined
let terrainField: TerrainField | undefined
let active = false
let ready = false
let disposed = false
let hazardVisible = false
let terrainWasReady = false
let worldRevision = 0
let taskGeneration = 0
let lastFastLoopAt = 0
let lastTrailPosition: Cartesian3 | undefined
let latestSnapshot: EmbodiedWorldSnapshot | undefined
let latestTick: EmbodiedTickResult | undefined
const announcedSafetyEvidence = new Set<string>()
let completionAnnounced = false
let modelRetryNotBefore = 0
let overviewView = false
type CameraPose = { position: Cartesian3, direction: Cartesian3, up: Cartesian3 }
let controllerCameraPose: CameraPose | undefined
let mapCameraPose: CameraPose | undefined
let mapPoseChanged = false
const urbanFollowCamera = new UrbanFollowCamera()
let citySpeedMetersPerSecond = readNumericSetting('speed', 30, 0.1, 1_000)
let cityCameraHeightMeters = readNumericSetting('height', 300, 25, 10_000_000)
let mapPickMode: 'start' | 'goal' | undefined
let pickPair = false
let mapPickHandler: ScreenSpaceEventHandler | undefined
let missionError = ''
let missionUrlError = ''
const urbanMotionSamples: Array<{ position: GeoPoint, at: number }> = []
let minimumHazardBoundaryDistanceMeters = Number.POSITIVE_INFINITY
const trailPositions: Cartesian3[] = []
const plannerRuntime = new WorldTaskRuntime({ frameBudgetMs: 5 })
const cameraTransition = new CameraPresetTransition({
  presets: {
    follow: { minDistance: isUrban ? 1_100 : 800, maxDistance: isUrban ? 1_800 : 2_200, pitchOffset: 0 },
    overview: { minDistance: isUrban ? 7_000 : 50_000, maxDistance: isUrban ? 10_000 : 60_000, pitchOffset: isUrban ? 20 : 45 },
  },
})
const worldInquiry = new LabWorldInquiry(new Date().toISOString())
const replayFrames: Array<{ position: Cartesian3, snapshot: EmbodiedWorldSnapshot, at: number }> = []
let replayEntity: Entity | undefined
let replaying = false
let urbanCollisionCounts: Awaited<ReturnType<typeof addUrbanBuildingColliders>> | undefined
let urbanVisualState: UrbanVisualState | undefined
let removeUrbanVisualWatcher: (() => void) | undefined
let cameraTransitionFrame: number | undefined
let chatScrollFrame: number | undefined
let urbanNavigation: ReturnType<typeof createUrbanNavigation> | undefined
let urbanCandidates: UrbanRouteCandidate[] = []
let routeFollower: UrbanRouteFollower | undefined
let routeOffer: NavigationRouteObservation | undefined
let routeAbort: AbortController | undefined
let routeRequestId = 0
let selectedRouteId: NavigationRouteId | undefined
let minimumBuildingClearanceMeters = Infinity
const routeEntities: Partial<Record<UrbanRouteCandidate['id'], Entity>> = {}
const ROUTE_LABELS = { left: '左侧绕行', right: '右侧绕行', direct: '直达路线', detour: '街区绕行' }
installScenarioControls()

void bootstrap().catch((error: unknown) => {
  const message = errorMessage(error)
  setWorldStatus('error', '初始化失败')
  setPhase('ERROR', '具身执行器未能启动', message)
  appendMessage('event safety', `初始化失败：${message}`)
  console.error('[Embodied world lab]', error)
})

async function bootstrap(): Promise<void> {
  setPhase('BOOT', '正在准备场景', '加载完成后即可选择路线。')
  const baseLayer = new ImageryLayer(new UrlTemplateImageryProvider({
    url: isUrban && buildingChoice.source === 'white' ? GRAY_BASEMAP_URL : ESRI_WORLD_IMAGERY_URL,
    maximumLevel: isUrban && buildingChoice.source === 'white' ? 16 : 18,
    credit: isUrban && buildingChoice.source === 'white' ? GRAY_BASEMAP_CREDIT : 'Esri World Imagery',
  }))
  viewer = new Viewer('cesiumContainer', {
    baseLayer,
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
  })
  viewer.scene.globe.baseColor = Color.fromCssColorString('#e8eaed')
  viewer.scene.backgroundColor = Color.fromCssColorString('#f1f3f4')
  viewer.scene.globe.depthTestAgainstTerrain = true
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = true

  let terrainProvider: TerrainProvider
  let terrainDegraded = false
  if (isUrban) {
    terrainProvider = buildingChoice.source === 'google' ? new EllipsoidTerrainProvider() : createUrbanGround()
    viewer.scene.terrainProvider = terrainProvider
    terrainField = { heightAt: () => URBAN_GROUND_HEIGHT }
    setPhase('CITY', `正在加载${URBAN_SOURCE_LABELS[buildingChoice.source]}`, '建筑与路线准备中。')
    const mesh = await loadUrbanBuildingMesh()
    removeUrbanVisualWatcher = await loadUrbanBuildingLayer(viewer, mesh, buildingChoice.source, buildingCredentials, recordUrbanVisualState)
    if (buildingChoice.source === 'google') viewer.scene.globe.show = false
    setPhase('BUILDING MAP', '正在准备可行走区域', '首次进入需要几秒钟。')
    urbanNavigation = createUrbanNavigation(mesh, { allowUnmappedTravel: true })
    Object.assign(NAMCHE_START, CITY_LONG_MISSION.start)
    Object.assign(NAMCHE_GOAL, CITY_LONG_MISSION.goal)
    try {
      const mission = readUrbanMission(sceneQuery)
      if (mission) {
        for (const point of [mission.start, mission.goal]) {
          if (!urbanNavigation.validatePoint(point).valid) throw new Error('链接中的起终点不在可通行范围，请重新选点。')
        }
        Object.assign(NAMCHE_START, mission.start)
        Object.assign(NAMCHE_GOAL, mission.goal)
      }
    } catch (error) { missionUrlError = errorMessage(error) }
    urbanCandidates = urbanNavigation.planCandidates(NAMCHE_START, NAMCHE_GOAL)
  } else try {
    terrainProvider = await ArcGISTiledElevationTerrainProvider.fromUrl(
      ARCGIS_WORLD_ELEVATION_URL,
    )
    viewer.scene.terrainProvider = terrainProvider
    terrainField = await buildTerrainField(terrainProvider)
  } catch (error) {
    terrainDegraded = true
    terrainProvider = new EllipsoidTerrainProvider()
    viewer.scene.terrainProvider = terrainProvider
    terrainField = flatTerrainField()
    appendMessage(
      'event safety',
      `真实高程服务不可用，已明确降级到椭球地面：${errorMessage(error)}`,
    )
  }

  const start = terrainPoint(NAMCHE_START)
  const goal = terrainPoint(NAMCHE_GOAL)
  const hazard: CircularHazard = {
    ...LANDSLIDE_HAZARD,
    center: terrainPoint(LANDSLIDE_HAZARD.center),
  }
  addSceneEvidence(goal, hazard)
  if (isUrban) drawUrbanRoutes()

  const initialHeading = initialBearingRadians(start, goal)
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(
      start.longitude,
      start.latitude,
      start.height + 260,
    ),
    orientation: {
      heading: initialHeading,
      pitch: CesiumMath.toRadians(-42),
      roll: 0,
    },
  })

  setPhase('PHYSICS', '正在建立本地地形碰撞体', '角色物理与远程 AI 分离，控制帧不会等待模型。')
  player = new playerController()
  const modelUrl = isUrban
    ? new URL('./assets/RobotExpressive.glb', import.meta.url).href
    : new URL('./assets/Fox.glb', import.meta.url).href
  await player.init({
    viewer,
    initPos: Cartesian3.fromDegrees(
      start.longitude,
      start.latitude,
      start.height + 1.15,
    ),
    playerModelConfig: {
      url: modelUrl,
      scale: 0.01,
      idleAnim: isUrban ? 'Idle' : 'Survey',
      walkAnim: isUrban ? 'Walking' : 'Walk',
      runAnim: isUrban ? 'Running' : 'Run',
      jumpAnim: isUrban ? 'Jump' : 'Survey',
      gravity: -980,
      jumpHeight: 0,
      speed: isUrban ? citySpeedMetersPerSecond * 100 : 300,
      acceleration: 18,
      deceleration: 24,
      rotateY: initialHeading,
      facingOffset: CesiumMath.toRadians(90),
    },
    ...(!isUrban ? { staticCollider: {
      type: 'terrain',
      rectangle: [
        CesiumMath.toRadians(start.longitude - TERRAIN_RECTANGLE_DEGREES),
        CesiumMath.toRadians(start.latitude - TERRAIN_RECTANGLE_DEGREES),
        CesiumMath.toRadians(start.longitude + TERRAIN_RECTANGLE_DEGREES),
        CesiumMath.toRadians(start.latitude + TERRAIN_RECTANGLE_DEGREES),
      ] as [number, number, number, number],
      resolution: 24,
    } } : {}),
    keyMap: {
      forward: null,
      backward: null,
      left: null,
      right: null,
      sprint: null,
      jump: null,
      toggleView: null,
      toggleFly: null,
      toggleVehicle: null,
    },
    thirdMouseMode: 4,
    isShowMobileControls: false,
    enableOverShoulderView: false,
    enableSpringCamera: true,
    springCameraTime: 0.08,
    minCamDistance: isUrban ? 1_100 : 800,
    maxCamDistance: isUrban ? 1_800 : 2_200,
    enableZoom: false,
  })
  if (isUrban) {
    // Keep the physics loop and programmatic AI input, release mouse control to
    // Cesium's map camera while the user explores or chooses a mission.
    player.offAllEvent()
    player.isupdate = true
    player.registerLocomotionSet('city-walk', { idle: 'Idle', walking: 'Walking' })
    player.registerLocomotionSet('city-run', { idle: 'Idle', walking: 'Running' })
    player.switchLocomotionSet('city-walk')
    urbanStreamingGround = createUrbanStreamingGround(player)
    urbanStreamingGround.reset(player.getPosition(), citySpeedMetersPerSecond)
    setPhase('BUILDING COLLISIONS', '正在建立真实楼体碰撞', '完成后才开放导航，避免把未加载的建筑当作空地。')
    urbanCollisionCounts = await addUrbanBuildingColliders(player)
    const actorModel = player.getPlayerModel()
    if (actorModel) {
      actorModel.show = buildingChoice.navigationAvailable
      actorModel.scale = 2
      actorModel.minimumPixelSize = 110
      actorModel.maximumScale = 5
      actorModel.silhouetteColor = Color.fromCssColorString('#ffe5a3')
      actorModel.silhouetteSize = 1
    }
  }
  player.setOverShoulderView(false)
  player.setInput({
    moveX: 0,
    moveY: 0,
    lookDeltaX: 0,
    lookDeltaY: isUrban ? 12 : 34,
    jump: false,
    shift: false,
    toggleView: false,
    toggleFly: false,
    toggleVehicle: false,
  })

  embodiment = new CesiumPlayerEmbodiment(player, { lookDeltaScale: isUrban ? 8 : 0.8, allowSprint: !isUrban, includeCameraRay: !isUrban })
  agentLoop = new EmbodiedAgentLoop(embodiment, {
    arrivalDistanceMeters: isUrban ? 2.5 : 8,
    emergencyClearanceMeters: isUrban ? 2 : 12,
    retryDelayMs: 2_000,
    planningLeadTimeMs: 3_000,
  })
  if (isUrban) agentLoop.setPlanningSpeedMetersPerSecond(citySpeedMetersPerSecond)
  agentChannel = createBridgeAgentChannel(viewer, {
    observeWorld: () => {
      if (!latestSnapshot) throw new Error('场景还没有可用观测')
      return structuredClone(latestSnapshot)
    },
    commitMotionIntent: ({ requestId, revision, plan }) =>
      agentLoop?.commitPlan(requestId, revision, plan, performance.now()) ?? false,
    stopEmbodied: () => { agentLoop?.stop() },
    onTrace: recordBridgeCall,
    readNavigationOptions: () => {
      if (!routeOffer) throw new Error('没有当前绕行候选')
      return { ...structuredClone(routeOffer), capturedAt: new Date().toISOString() }
    },
    commitNavigationRoute: ({ requestId, revision, offerId, routeId }) => {
      if (!active || requestId !== routeRequestId || revision !== worldRevision || offerId !== routeOffer?.offerId) return false
      if (routeId === 'hold') { stopTask(); return true }
      const candidate = urbanCandidates.find(item => item.id === routeId)
      if (!candidate || !urbanNavigation) return false
      routeFollower = new UrbanRouteFollower(candidate.waypoints, urbanNavigation.isSegmentWalkable)
      selectedRouteId = routeId
      showRouteSelection(routeId)
      element('missionStatus').textContent = `人物正在执行${ROUTE_LABELS[routeId]}，可切换视角观察。`
      setOverviewView(false, false)
      return true
    },
  })
  removePreUpdate = viewer.scene.preUpdate.addEventListener(() => {
    // The controller derives walking direction from the camera. Restore its own
    // pose before simulation so the presentation camera cannot steer the person.
    if (viewer && controllerCameraPose) {
      if (overviewView && !mapPoseChanged) mapCameraPose = captureCameraPose()
      viewer.camera.setView({
        destination: controllerCameraPose.position,
        orientation: { direction: controllerCameraPose.direction, up: controllerCameraPose.up },
      })
      controllerCameraPose = undefined
    }
    if (player && urbanStreamingGround) urbanStreamingGround.update(player.getPosition(), citySpeedMetersPerSecond)
    player?.update()
    if (isUrban && viewer && player) {
      controllerCameraPose = captureCameraPose()
      if (overviewView && mapCameraPose) restoreCameraPose(mapCameraPose)
      else if (!overviewView) restoreCameraPose(urbanFollowCamera.update(player.getPosition(), player.getYaw(), cityCameraHeightMeters, performance.now(), urbanCameraSightlineClear))
      mapPoseChanged = false
    }
    if (!active || !ready || disposed) return
    const now = performance.now()
    if (now - lastFastLoopAt < FAST_LOOP_INTERVAL_MS) return
    lastFastLoopAt = now
    runFastLoop(now, isUrban ? terrainPoint(NAMCHE_GOAL) : goal, hazard)
  })

  installInteractions()
  terrainWasReady = true
  ready = true
  distanceMetric.textContent = `目标距离 ${Math.round(distanceMeters(NAMCHE_START, NAMCHE_GOAL))} m`
  setOverviewView(true, false)
  if (isUrban) {
    installUrbanMissionEditor()
    frameUrbanMap(false)
    setNativeMapControl(true)
    updateMissionPreview()
  }
  if (isUrban) foxCredits.textContent = '人物及地图来源'
  element('bridgeStatus').textContent = 'Bridge 已连接'
  if (urbanCollisionCounts) appendMessage('event', `建筑碰撞已加载：${urbanCollisionCounts.tileCount} 个源数据块，${urbanCollisionCounts.triangleCount.toLocaleString()} 个三角面。${buildingChoice.source === 'white' ? '白模与碰撞共用同一份本地几何，不请求远程纹理瓦片。' : ''}`)
  setWorldStatus(terrainDegraded ? 'degraded' : 'ready', terrainDegraded
    ? '椭球地面 · 可演示'
    : isUrban ? '场景已就绪' : '真实地形 · 已就绪')
  setPhase(
    missionError ? 'CHECK ROUTE' : 'READY',
    missionError ? '起终点已保留，路线尚未确认' : `${scenario.title} · 已就绪`,
    missionError || (isUrban ? '自由选起点、终点；白框仅标示已有建筑数据。' : `${scenario.description} 点击“开始导航”，观察 Jev 决策与本地安全接管。`),
  )
  appendMessage(
    'event',
    '执行器已就绪：Cesium 每帧更新角色；20Hz 本地感知/安全循环；托管模型在当前动作有效期内异步更新下一段。',
  )
  appendMessage(
    'event',
    isUrban ? buildingChoice.source === 'google'
      ? 'Google 实景为独立浏览源；未将 PLATEAU 碰撞当作 Google 建筑的碰撞，当前不开放导航。'
      : `场景来源：PLATEAU 2025 东京千代田区${buildingChoice.source === 'white' ? '本地无纹理白模' : '实景纹理建筑'}。街道路面使用 38m 椭球高近似，未模拟交通流与其他行人。`
      : '实验边界：落石区是可重复评测 fixture；地形高度与角色坐标系 Rapier 扇形射线来自正在运行的场景。',
  )
  if (isUrban && buildingChoice.notice) appendMessage('event', buildingChoice.notice)
  exposeDebugApi()
}

function runFastLoop(nowMs: number, goal: GeoPoint, hazard: CircularHazard): void {
  if (!viewer || !embodiment || !agentLoop || !terrainField) return
  const observation = embodiment.observe()
  const cartographic = Cartographic.fromCartesian(
    new Cartesian3(
      observation.positionEcef.x,
      observation.positionEcef.y,
      observation.positionEcef.z,
    ),
  )
  const position: GeoPoint = {
    longitude: CesiumMath.toDegrees(cartographic.longitude),
    latitude: CesiumMath.toDegrees(cartographic.latitude),
    height: cartographic.height,
  }
  const guidance = isUrban ? routeFollower?.update(position) : undefined
  if (isUrban && player) {
    // The controller normalizes movement input, so speed is adjusted explicitly.
    // Slow before a corner or the goal instead of overshooting it at travel speed.
    const approachDistance = distanceMeters(position, guidance?.target ?? goal)
    const bearingError = initialBearingRadians(position, guidance?.target ?? goal) - observation.headingRadians
    const proposedSpeed = urbanTravelSpeed(citySpeedMetersPerSecond, approachDistance, bearingError)
    const safeSpeed = urbanNavigation ? urbanMotionSpeedLimit({
      position, headingRadians: observation.headingRadians, proposedSpeedMetersPerSecond: proposedSpeed,
      segmentIsWalkable: urbanNavigation.isSegmentWalkable,
    }) : 0
    if (safeSpeed + 0.001 < proposedSpeed
      && Math.hypot(observation.velocityEnu.east, observation.velocityEnu.north) > safeSpeed) player.resetVelocity()
    player.setPlayerSpeed(safeSpeed * 100)
    const actualSpeed = Math.hypot(observation.velocityEnu.east, observation.velocityEnu.north)
    const currentAnimationSet = player.getCurrentLocomotionSet()
    const nextAnimationSet = actualSpeed > 4 ? 'city-run' : actualSpeed < 3.5 ? 'city-walk' : currentAnimationSet
    if (nextAnimationSet && nextAnimationSet !== currentAnimationSet) player.switchLocomotionSet(nextAnimationSet)
  }
  if (isUrban) {
    urbanMotionSamples.push({ position, at: nowMs })
    if (urbanMotionSamples.length > 20_000) urbanMotionSamples.shift()
  }
  const navigationTarget = guidance?.target ?? goal
  const sensorDistance = isUrban
    ? Math.max(SENSOR_DISTANCE_METERS, agentLoop.getRequiredClearanceMeters(citySpeedMetersPerSecond) + 4)
    : SENSOR_DISTANCE_METERS
  if (isUrban && urbanNavigation) minimumBuildingClearanceMeters = Math.min(
    minimumBuildingClearanceMeters, urbanNavigation.clearanceAt(position),
  )
  if (!isUrban) minimumHazardBoundaryDistanceMeters = Math.min(
    minimumHazardBoundaryDistanceMeters,
    distanceMeters(position, hazard.center) - hazard.radiusMeters,
  )
  let sensed = senseEmbodiedWorld({
    revision: worldRevision,
    position,
    target: navigationTarget,
    embodiment: observation,
    hazard,
    hazardVisible,
    terrainHeightAt: terrainField.heightAt,
    candidateDistanceMeters: sensorDistance,
    hazardPaddingMeters: HAZARD_PADDING_METERS,
    minimumTraversableClearanceMeters: isUrban ? 2 : 10,
  })
  const terrainSlopes = Object.fromEntries(
    sensed.snapshot.candidates.map(candidate => [candidate.id, candidate.slopeDegrees]),
  )
  const rayHits = embodiment.senseActorRayHitFan(sensorDistance, terrainSlopes)
  const rayFan = classifyActorRayHits(rayHits, terrainField, sensorDistance)
  sensed = senseEmbodiedWorld({
    revision: worldRevision,
    position,
    target: navigationTarget,
    embodiment: observation,
    hazard,
    hazardVisible,
    terrainHeightAt: terrainField.heightAt,
    candidateDistanceMeters: sensorDistance,
    hazardPaddingMeters: HAZARD_PADDING_METERS,
    minimumTraversableClearanceMeters: isUrban ? 2 : 10,
    ...(rayFan ? { actorRayClearanceMeters: rayFan } : {}),
  })

  const allTerrainReady = sensed.snapshot.candidates.every(candidate => candidate.terrainReady)
  if (allTerrainReady && !terrainWasReady) {
    terrainWasReady = true
    worldRevision += 1
    sensed = senseEmbodiedWorld({
      revision: worldRevision,
      position,
      target: navigationTarget,
      embodiment: observation,
      hazard,
      hazardVisible,
      terrainHeightAt: terrainField.heightAt,
      candidateDistanceMeters: sensorDistance,
      hazardPaddingMeters: HAZARD_PADDING_METERS,
      minimumTraversableClearanceMeters: isUrban ? 2 : 10,
      ...(rayFan ? { actorRayClearanceMeters: rayFan } : {}),
    })
  }

  if (sensed.hazardDetected && !hazardVisible) {
    hazardVisible = true
    worldRevision += 1
    if (hazardEntity) hazardEntity.show = true
    setOverviewView(true)
    appendMessage(
      'event safety',
      `新世界证据：${LANDSLIDE_HAZARD.name}进入有限前向感知窗口，WORLD 升级为 r${worldRevision}，旧模型计划立即作废。`,
    )
    sensed = senseEmbodiedWorld({
      revision: worldRevision,
      position,
      target: navigationTarget,
      embodiment: observation,
      hazard,
      hazardVisible: true,
      terrainHeightAt: terrainField.heightAt,
      candidateDistanceMeters: sensorDistance,
      hazardPaddingMeters: HAZARD_PADDING_METERS,
      minimumTraversableClearanceMeters: isUrban ? 2 : 10,
      ...(rayFan ? { actorRayClearanceMeters: rayFan } : {}),
    })
  }

  // The controller steers at the next route point, but only the final mission may complete.
  if (guidance) sensed.snapshot.distanceToGoalMeters = guidance.remainingMeters
  if (isUrban && urbanNavigation) sensed.snapshot.dataCoverage = urbanNavigation.dataCoverageAt(position)
  latestSnapshot = sensed.snapshot
  if (isUrban && !routeFollower) {
    embodiment.stop()
    updateTrail(observation.positionEcef)
    return
  }
  latestTick = agentLoop.tick(sensed.snapshot, nowMs)
  updateTrail(observation.positionEcef)
  updateLiveUi(sensed.snapshot, latestTick)

  if (latestTick.safetyReason) {
    const evidenceKey = `${worldRevision}:${safetyEvidenceKey(latestTick.safetyReason)}`
    if (!announcedSafetyEvidence.has(evidenceKey)) {
      announcedSafetyEvidence.add(evidenceKey)
      appendMessage('event safety', `LOCAL SAFETY：${formatSafetyEvidence(latestTick.safetyReason)}`)
    }
  }
  if (latestTick.needsPlanning) requestModelPlan(sensed.snapshot)
  movementContinuity.observe({
    nowMs,
    positionEcef: observation.positionEcef,
    translationInput: Math.abs(latestTick.input.moveY) > 0 || Math.abs(latestTick.input.moveX) > 0,
    planning: agentLoop.getState().planner === 'pending',
    safetyClear: latestTick.state.safety === 'clear',
  })

  if (latestTick.state.lifecycle === 'completed' && !completionAnnounced) {
    completionAnnounced = true
    active = false
    taskGeneration += 1
    updateTrail(observation.positionEcef, true)
    refreshReplayControls()
    setAutonomousCameraLock(false)
    plannerRuntime.clear(new Error('Task completed'))
    modelStatus.textContent = useJev ? 'JEV · 任务完成' : 'TASK COMPLETE'
    setOverviewView(true, false)
    const rawBoundaryClearance = minimumHazardBoundaryDistanceMeters
    const boundaryClearance = Math.round(Math.abs(rawBoundaryClearance))
    const safetySummary = isUrban ? '已完成本次模拟路线，执行器停止。' : rawBoundaryClearance >= 0
      ? `轨迹未进入风险区，距其边界最近 ${boundaryClearance} 米。`
      : `轨迹曾进入风险区 ${boundaryClearance} 米，需要继续调优。`
    setPhase('ARRIVED', isUrban ? '已到达你设置的终点' : '观察点已到达', `角色已停止；${safetySummary}`)
    if (isUrban) element('missionStatus').textContent = '已到达 B 终点。可以回到起点重试，或重新选择一条路线。'
    appendMessage('assistant', isUrban ? '已经到达街区目标。Jev 在有效动作执行期间更新下一段，角色已停止。' : `已经到达观察点。${safetySummary}移动过程中持续使用地形样本和角色前向物理射线，并在发现隐藏落石区后废弃了旧计划。`)
  }
}

function requestModelPlan(snapshot: EmbodiedWorldSnapshot): void {
  if (!agentLoop) return
  const generation = taskGeneration
  const requestId = agentLoop.beginPlanning(snapshot)
  if (requestId === undefined) return

  if (performance.now() < modelRetryNotBefore) {
    const fallback = createFallbackPlan(snapshot)
    agentLoop.commitPlan(
      requestId,
      snapshot.revision,
      { ...fallback, durationMs: 8_000 },
      performance.now(),
    )
    modelStatus.textContent = 'LOCAL FALLBACK · COOLDOWN'
    return
  }

  if (!agentLoop.getState().activeIntent) agentLoop.setProvisionalPlan(
    requestId,
    snapshot.revision,
    { ...createFallbackPlan(snapshot), ...(useJev ? { intent: 'hold' as const, reason: 'Waiting for Jev decision' } : {}), durationMs: MODEL_TIMEOUT_MS + 1_000 },
    performance.now(),
  )
  modelStatus.textContent = useJev ? 'JEV · 后台更新' : 'LOCAL PROVISIONAL · HOSTED THINKING'
  let modelObservation = snapshot
  plannerRuntime.run({
    taskKey: 'embodied-motion-plan',
    revision: requestId,
    execute: context => withTimeout(
      context.signal,
      MODEL_TIMEOUT_MS,
      async signal => {
        if (!agentChannel) throw new Error('Cesium MCP Bridge 尚未就绪')
        modelObservation = await agentChannel.readObservation()
        if (signal.aborted) throw new Error('Task stopped')
        return useJev ? requestJevMotionPlan(modelObservation, { signal }) : requestHostedMotionPlan(modelObservation, { signal })
      },
    ),
  }).then(async (result) => {
    if (generation !== taskGeneration || !active) return
    const entry = { revision: modelObservation.revision, capturedAt: modelObservation.capturedAt, observation: modelObservation, ...result, accepted: false }
    decisionTrace.push(entry)
    if (decisionTrace.length > 1_000) decisionTrace.shift()
    if (!await agentChannel?.commitIntent(
      requestId,
      modelObservation.revision,
      result.plan,
    )) {
      if (agentLoop?.getState().lifecycle === 'running') {
        modelStatus.textContent = 'LOCAL PROVISIONAL · STALE MODEL DROPPED'
      }
      return
    }
    modelStatus.textContent = `${result.model} · ${result.usageState ?? 'ACTIVE'}`
    entry.accepted = true
    movementContinuity.acceptedPlan()
    element('decisionCount').textContent = String(decisionTrace.filter(item => item.accepted).length)
    appendMessage(
      'event model',
      useJev
        ? `${result.model} · ${intentLabel(result.plan.intent)} · 置信度 ${Math.round(result.plan.confidence * 100)}% · ${result.usageState}`
        : `MODEL PLAN · ${intentLabel(result.plan.intent)} · ${Math.round(result.plan.confidence * 100)}% · ${result.plan.reason}`,
    )
  }).catch((error: unknown) => {
    if (generation !== taskGeneration || !active) return
    if (error instanceof WorldTaskSupersededError || isAbortError(error)) return
    if (!agentLoop) return
    if (agentLoop.getState().lifecycle !== 'running') return
    if (useJev) {
      stopTask()
      modelStatus.textContent = 'JEV · 请求失败，任务已停止'
      appendMessage('event safety', `Jev 决策失败：${errorMessage(error)}。可重新开始任务。`)
      return
    }
    const fallback = createFallbackPlan(snapshot)
    const committed = agentLoop.commitPlan(
      requestId,
      snapshot.revision,
      { ...fallback, durationMs: 8_000 },
      performance.now(),
    )
    modelRetryNotBefore = performance.now() + MODEL_RETRY_COOLDOWN_MS
    modelStatus.textContent = 'LOCAL FALLBACK · MODEL UNAVAILABLE'
    appendMessage(
      'event safety',
      `托管模型未直接执行，已由本地策略明确接管：${errorMessage(error)}`,
    )
    if (!committed) {
      agentLoop.failPlanning(requestId, performance.now())
      return
    }
  })
}

function startTask(): void {
  if (active) return
  if (!ready || !agentLoop) {
    appendMessage('assistant', '场景仍在初始化，请等状态变为“已就绪”。')
    return
  }
  if (isUrban && (mapPickMode || missionError)) {
    appendMessage('event', missionError || '请完成起终点选择，或取消选点后再开始。')
    return
  }
  if (isUrban && agentLoop.getState().lifecycle === 'completed') applyUrbanMission(NAMCHE_START, NAMCHE_GOAL)
  worldRevision += 1
  taskGeneration += 1
  exitReplay()
  movementContinuity.beginRun()
  agentLoop.start(worldRevision)
  active = true
  refreshReplayControls()
  setAutonomousCameraLock(true)
  completionAnnounced = false
  announcedSafetyEvidence.clear()
  lastFastLoopAt = 0
  if (isUrban) {
    routeFollower = undefined
    selectedRouteId = undefined
    urbanMotionSamples.length = 0
    minimumBuildingClearanceMeters = Number.POSITIVE_INFINITY
    element('missionStatus').textContent = '任务已开始，正在让 Jev 评估路线。可停止后重新选点。'
    void chooseUrbanRoute()
    return
  }
  setPhase('SENSE', '正在读取角色周边世界', '下一步模型规划在后台运行，角色控制帧不会等待网络。')
  appendMessage('assistant', '任务开始。我会先依据当前地形和前向扇形射线形成短时动作计划；发现新风险时，本地安全循环会先制动，再废弃旧计划。')
}

async function chooseUrbanRoute(): Promise<void> {
  if (!urbanNavigation || !embodiment || !agentChannel) return
  const generation = taskGeneration
  const requestId = ++routeRequestId
  routeAbort?.abort()
  const abort = new AbortController()
  routeAbort = abort
  try {
    const ecef = embodiment.observe().positionEcef
    const geo = Cartographic.fromCartesian(new Cartesian3(ecef.x, ecef.y, ecef.z))
    const position = { longitude: CesiumMath.toDegrees(geo.longitude), latitude: CesiumMath.toDegrees(geo.latitude), height: URBAN_GROUND_HEIGHT }
    urbanCandidates = urbanNavigation.planCandidates(position, NAMCHE_GOAL)
    if (urbanCandidates.length === 0) throw new Error('本地寻路暂未找到通过净距校验的路线，尚未请求 Jev 选择')
    routeOffer = {
      offerId: `city-${generation}-${requestId}`, revision: worldRevision, capturedAt: new Date().toISOString(),
      straightLineBlocked: !urbanNavigation.isSegmentWalkable(position, NAMCHE_GOAL),
      distanceToGoalMeters: distanceMeters(position, NAMCHE_GOAL),
      candidates: urbanCandidates.map(candidate => ({
        id: candidate.id, feasible: true, lengthMeters: candidate.lengthMeters,
        minimumClearanceMeters: candidate.minimumClearanceMeters,
        turnCount: Math.max(0, candidate.waypoints.length - 2),
        dataCoverage: candidate.dataCoverage,
      })),
    }
    drawUrbanRoutes(position)
    element('routeDecision').textContent = 'Jev 正在评估本次任务的候选路线'
    modelStatus.textContent = 'JEV · 选择路线'
    setPhase('ROUTE DECISION', routeOffer.straightLineBlocked ? '直达受阻，Jev 正在选择绕行' : 'Jev 正在评估直达路线', '人物保持原位，选择完成后才开始行动。')
    const observation = await agentChannel.readNavigationOptions()
    const decision = await requestJevRoute(observation, { signal: abort.signal })
    if (generation !== taskGeneration || !active || abort.signal.aborted) return
    const accepted = await agentChannel.commitNavigationRoute(requestId, worldRevision, observation.offerId, decision.routeId)
    if (!accepted) throw new Error('路线选择已过期或不在当前候选中')
    decisionTrace.push({ kind: 'route', observation, ...decision, accepted: true })
    element('decisionCount').textContent = String(decisionTrace.filter(item => item.accepted).length)
    const side = decision.routeId === 'hold' ? '保持停止' : ROUTE_LABELS[decision.routeId]
    appendMessage('event model', `${decision.model} 选择${side} · 置信度 ${Math.round(decision.confidence * 100)}% · ${decision.latencyMs} ms`)
    element('routeDecision').textContent = `Jev 选择${side} · ${Math.round(decision.confidence * 100)}%`
  } catch (error) {
    if (abort.signal.aborted || generation !== taskGeneration) return
    stopTask()
    element('routeDecision').textContent = '路线选择失败，人物已停止'
    appendMessage('event safety', `绕行选择失败：${errorMessage(error)}`)
  }
}

function drawUrbanRoutes(start = NAMCHE_START): void {
  if (!viewer || !isUrban) return
  for (const id of ['left', 'right', 'direct', 'detour'] as const) {
    viewer.entities.removeById(`route-${id}`)
    delete routeEntities[id]
  }
  viewer.entities.removeById('blocked-direct-route')
  if (!buildingChoice.navigationAvailable) return
  viewer.entities.add({
    id: 'blocked-direct-route',
    polyline: {
      positions: [start, NAMCHE_GOAL].map(point => Cartesian3.fromDegrees(point.longitude, point.latitude, URBAN_GROUND_HEIGHT + 0.3)),
      width: 3,
      material: new PolylineDashMaterialProperty({ color: Color.fromCssColorString(urbanNavigation?.isSegmentWalkable(start, NAMCHE_GOAL) ? '#829e98' : '#ff736c'), dashLength: 12 }),
    },
  })
  const descriptions: string[] = []
  for (const candidate of urbanCandidates) {
    const color = { left: '#ffc46a', right: '#9fafff', direct: '#7bcbd5', detour: '#ffc46a' }[candidate.id]
    routeEntities[candidate.id] = viewer.entities.add({
      id: `route-${candidate.id}`,
      polyline: {
        positions: candidate.waypoints.map(point => Cartesian3.fromDegrees(point.longitude, point.latitude, URBAN_GROUND_HEIGHT + 0.4)),
        width: 3,
        material: Color.fromCssColorString(color).withAlpha(0.85),
      },
    })
    descriptions.push(`${ROUTE_LABELS[candidate.id]} ${Math.round(candidate.lengthMeters)}m · ${Math.max(0, candidate.waypoints.length - 2)} 个拐点`)
  }
  element('routeOptions').textContent = descriptions.join(' ｜ ')
}

function showRouteSelection(routeId: UrbanRouteCandidate['id']): void {
  for (const id of ['left', 'right', 'direct', 'detour'] as const) {
    const line = routeEntities[id]?.polyline
    if (!line) continue
    line.width = new ConstantProperty(id === routeId ? 5 : 2)
    line.material = new PolylineGlowMaterialProperty({
      color: Color.fromCssColorString(id === routeId ? '#55dfb9' : '#7d8893').withAlpha(id === routeId ? 0.9 : 0.25),
      glowPower: id === routeId ? 0.1 : 0,
    })
  }
}

function stopTask(): void {
  if (agentLoop?.getState().lifecycle === 'completed') return
  taskGeneration += 1
  active = false
  routeAbort?.abort()
  routeAbort = undefined
  if (isUrban && !routeFollower) element('routeDecision').textContent = '路线选择已停止'
  setAutonomousCameraLock(false)
  if (agentChannel) void agentChannel.stop().catch(error => appendMessage('event safety', errorMessage(error)))
  else agentLoop?.stop()
  plannerRuntime.clear(new Error('Task stopped by user'))
  modelStatus.textContent = 'TASK STOPPED'
  if (isUrban) element('missionStatus').textContent = '任务已停止。可以继续导航，或重新设置起终点。'
  loopStatus.textContent = 'STOPPED · IDLE · 20HZ'
  setPhase('STOPPED', '任务已停止', '角色输入已归零，地图和证据仍保留。')
  appendMessage('assistant', '已停止任务，角色执行器已经收到中性输入。')
  refreshReplayControls()
}

function toggleView(): void {
  setOverviewView(!overviewView)
}

function setAutonomousCameraLock(locked: boolean): void {
  if (viewer) viewer.canvas.style.pointerEvents = locked && !(isUrban && overviewView) ? 'none' : 'auto'
}

function setOverviewView(enabled: boolean, announce = true): void {
  if (!player || !ready || overviewView === enabled) return
  overviewView = enabled
  if (isUrban) {
    setNativeMapControl(enabled)
    if (enabled) frameUrbanMap(false)
    else urbanFollowCamera.reset()
    setAutonomousCameraLock(active)
  } else {
    cameraTransition.begin(enabled ? 'overview' : 'follow', performance.now())
    scheduleCameraTransition()
  }
  if (announce) appendMessage('event', overviewView
    ? '地图全景 · 拖动平移、滚轮缩放'
    : isUrban ? `高位跟随 · ${cityCameraHeightMeters} 米` : '近距第三人称跟随视角')
}

function captureCameraPose(): CameraPose {
  const camera = viewer!.camera
  return { position: Cartesian3.clone(camera.positionWC), direction: Cartesian3.clone(camera.directionWC), up: Cartesian3.clone(camera.upWC) }
}

function restoreCameraPose(pose: CameraPose): void {
  viewer?.camera.setView({ destination: pose.position, orientation: { direction: pose.direction, up: pose.up } })
}

function urbanCameraSightlineClear(from: Cartesian3, to: Cartesian3): boolean {
  if (!player) return false
  const direction = Cartesian3.subtract(to, from, new Cartesian3())
  const distance = Cartesian3.magnitude(direction)
  if (distance < 0.1) return false
  Cartesian3.divideByScalar(direction, distance, direction)
  return player.physics.raycastEcef(from, direction, distance, player.physics.charBody) >= distance - 0.2
}

function setNativeMapControl(enabled: boolean): void {
  if (!viewer) return
  const control = viewer.scene.screenSpaceCameraController
  control.enableInputs = enabled
  control.enableRotate = enabled
  control.enableTranslate = enabled
  control.enableZoom = enabled
  control.enableTilt = enabled
  control.enableLook = enabled
  control.minimumZoomDistance = 45
  control.maximumZoomDistance = 40_000_000
}

function frameUrbanMap(district: boolean): void {
  if (!viewer) return
  const [west, south, east, north] = district ? URBAN_COLLISION_BOUNDS : [
    Math.min(NAMCHE_START.longitude, NAMCHE_GOAL.longitude), Math.min(NAMCHE_START.latitude, NAMCHE_GOAL.latitude),
    Math.max(NAMCHE_START.longitude, NAMCHE_GOAL.longitude), Math.max(NAMCHE_START.latitude, NAMCHE_GOAL.latitude),
  ]
  const latitude = (south + north) / 2
  const longitudeSpan = east - west > 180 ? 360 - (east - west) : east - west
  const centerLongitude = east - west > 180 ? ((east + west) / 2 + 360) % 360 - 180 : (west + east) / 2
  const width = longitudeSpan * 111_320 * Math.cos(CesiumMath.toRadians(latitude)) + 60
  const height = (north - south) * 111_320 + 80
  const aspect = viewer.canvas.clientWidth / viewer.canvas.clientHeight
  const altitude = Math.max(150, height * 1.25, width / aspect * 1.25)
  const current = captureCameraPose()
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(centerLongitude, latitude, URBAN_GROUND_HEIGHT + altitude),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  })
  mapCameraPose = captureCameraPose()
  mapPoseChanged = true
  restoreCameraPose(current)
}

function showDistrictView(): void {
  if (!isUrban || !ready) return
  setOverviewView(true, false)
  frameUrbanMap(true)
  setNativeMapControl(true)
}

function readNumericSetting(key: string, fallback: number, min: number, max: number): number {
  const raw = sceneQuery.get(key)
  const value = raw === null ? NaN : Number(raw)
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

function installNumericSetting(id: string, key: string, initial: number, apply: (value: number) => void): void {
  const input = element<UiInput>(id)
  input.value = String(initial)
  const commit = (): void => {
    if (!input.value?.trim() || !input.reportValidity()) return
    const value = Number(input.value)
    if (!Number.isFinite(value)) return
    apply(value)
    const url = new URL(location.href)
    url.searchParams.set(key, String(value))
    history.replaceState(null, '', url)
  }
  input.addEventListener('change', commit)
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault()
      commit()
    }
  })
}

function updatePickUi(): void {
  element('mapPickHint').hidden = !mapPickMode
  element('mapPickText').textContent = mapPickMode === 'start' ? '点击地面设置 A 起点 · 拖动平移，滚轮缩放' : '点击地面设置 B 终点'
  element('pickStart').setAttribute('aria-pressed', String(mapPickMode === 'start'))
  element('pickGoal').setAttribute('aria-pressed', String(mapPickMode === 'goal'))
  const pendingPair = !!mapPickMode && pickPair
  const status = element('missionStatus')
  status.textContent = pendingPair
    ? mapPickMode === 'start' ? '请依次选择起点和终点，选完后检查路线。' : '起点已设置，请选择终点，选完后检查路线。'
    : missionError || `直线 ${Math.round(distanceMeters(NAMCHE_START, NAMCHE_GOAL))} m · 路线已就绪`
  status.dataset.error = String(!pendingPair && !!missionError)
  if (viewer) viewer.canvas.style.cursor = mapPickMode ? 'crosshair' : ''
  document.querySelectorAll<UiButton>('[data-command="start"]').forEach(button => { button.disabled = !!mapPickMode || !!missionError || !ready })
  for (const id of ['pickStart', 'pickGoal', 'pickMission', 'swapMission', 'resetMission', 'restoreMission', 'crossDistrictMission', 'longMission', 'citySpeed', 'cityCameraHeight']) {
    element<UiButton | UiInput>(id).disabled = !buildingChoice.navigationAvailable || !ready
  }
}

function beginMapPick(mode: 'start' | 'goal', pair = false): void {
  if (!ready || !isUrban || !buildingChoice.navigationAvailable) return
  if (active) stopTask()
  mapPickMode = mode
  pickPair = pair
  setOverviewView(true, false)
  setNativeMapControl(true)
  updatePickUi()
  setPhase('SET MISSION', mode === 'start' ? '在地图上点选起点' : '在地图上点选终点', '可缩放、拖动地图，不限白框。选完后点击“开始导航”。')
}

function applyUrbanMission(start: GeoPoint, goal: GeoPoint): void {
  if (!viewer || !player || !urbanNavigation) return
  // Invalidate even a completed run; neither a late route nor an old motion may
  // survive an edit. Teleport uses the public controller API, not just the mesh.
  active = false
  taskGeneration += 1
  worldRevision += 1
  routeAbort?.abort()
  routeAbort = undefined
  plannerRuntime.clear(new Error('Mission endpoints changed'))
  agentLoop?.stop()
  if (agentChannel) void agentChannel.stop().catch(error => appendMessage('event', errorMessage(error)))
  embodiment?.stop()
  Object.assign(NAMCHE_START, { ...start })
  Object.assign(NAMCHE_GOAL, { ...goal })
  const startPosition = Cartesian3.fromDegrees(start.longitude, start.latitude, URBAN_GROUND_HEIGHT + player.getCapsuleGroundHeight() + 0.05)
  urbanStreamingGround?.reset(startPosition, citySpeedMetersPerSecond)
  player.reset(startPosition)
  player.setOnGround(false)
  urbanFollowCamera.reset()
  routeFollower = undefined
  routeOffer = undefined
  selectedRouteId = undefined
  latestSnapshot = undefined
  latestTick = undefined
  completionAnnounced = false
  lastTrailPosition = undefined
  trailPositions.length = 0
  replayFrames.length = 0
  urbanMotionSamples.length = 0
  decisionTrace.length = 0
  bridgeTrace.length = 0
  movementContinuity.reset()
  minimumBuildingClearanceMeters = Infinity
  missionUrlError = ''
  exitReplay()
  element('decisionCount').textContent = '0'
  modelStatus.textContent = 'JEV · 等待开始'
  loopStatus.textContent = '任务已更新'
  revisionStatus.textContent = `WORLD r${worldRevision}`
  element('missionLinkField').hidden = true
  element('shareMission').textContent = '生成任务链接'
  setAutonomousCameraLock(false)
  updateMissionPreview()
  history.replaceState(null, '', writeUrbanMission(new URL(location.href), NAMCHE_START, NAMCHE_GOAL))
}

function updateMissionPreview(): void {
  if (!viewer || !urbanNavigation) return
  urbanCandidates = urbanNavigation.planCandidates(NAMCHE_START, NAMCHE_GOAL)
  const directDistance = distanceMeters(NAMCHE_START, NAMCHE_GOAL)
  missionError = !buildingChoice.navigationAvailable ? 'Google 实景仅供浏览，切回轻量白模即可导航。' : missionUrlError || (urbanCandidates.length === 0 ? '当前导航网格未找到连接路线，不代表实际无路。起终点已保留，尚未调用 Jev。' : '')
  const usesUnmappedGround = urbanCandidates.some(candidate => candidate.dataCoverage !== 'surveyed')
    || !insideUrbanCoverage(NAMCHE_START) || !insideUrbanCoverage(NAMCHE_GOAL)
  const coverageNote = element('missionCoverageNote')
  coverageNote.hidden = !usesUnmappedGround
  coverageNote.textContent = '这条路线包含建筑数据覆盖外区域，按简化地面探索。'
  element('startCoordinates').textContent = `${NAMCHE_START.longitude.toFixed(6)}, ${NAMCHE_START.latitude.toFixed(6)}`
  element('goalCoordinates').textContent = `${NAMCHE_GOAL.longitude.toFixed(6)}, ${NAMCHE_GOAL.latitude.toFixed(6)}`
  element('routeDecision').textContent = missionError ? '路线尚未确认' : urbanNavigation.isSegmentWalkable(NAMCHE_START, NAMCHE_GOAL)
    ? '可直达目标' : '将绕过建筑前往目标'
  distanceMetric.textContent = `直线距离 ${Math.round(directDistance)} m`
  const goal = viewer.entities.getById('embodied-goal')
  if (goal) goal.position = new ConstantPositionProperty(Cartesian3.fromDegrees(NAMCHE_GOAL.longitude, NAMCHE_GOAL.latitude, URBAN_GROUND_HEIGHT + 1))
  const start = viewer.entities.getById('mission-start')
  if (start) start.position = new ConstantPositionProperty(Cartesian3.fromDegrees(NAMCHE_START.longitude, NAMCHE_START.latitude, URBAN_GROUND_HEIGHT + 1))
  drawUrbanRoutes()
  if (!urbanCandidates.length) element('routeOptions').textContent = '未找到可执行路线'
  updatePickUi()
}

function installUrbanMissionEditor(): void {
  if (!viewer || !urbanNavigation) return
  // This outline describes data coverage, not an editable mission boundary.
  const [west, south, east, north] = URBAN_COLLISION_BOUNDS
  const coverageHeight = (north - south) * 111_320 / 1_000
  const coverageWidth = (east - west) * 111_320 * Math.cos(CesiumMath.toRadians((north + south) / 2)) / 1_000
  element('cityCoverage').textContent = `白框内约 ${(coverageHeight * coverageWidth).toFixed(1)} km² 有建筑数据。起终点不限白框；框外按简化地面探索，未加载真实建筑或道路。`
  viewer.entities.add({ id: 'mission-coverage', polyline: {
    positions: [[west, south], [east, south], [east, north], [west, north], [west, south]]
      .map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, URBAN_GROUND_HEIGHT + 0.5)),
    width: 2, material: new PolylineDashMaterialProperty({ color: Color.WHITE.withAlpha(0.6), dashLength: 14 }),
  } })
  viewer.entities.add({ id: 'mission-start', position: Cartesian3.fromDegrees(NAMCHE_START.longitude, NAMCHE_START.latitude, URBAN_GROUND_HEIGHT + 1),
    point: { pixelSize: 12, color: Color.fromCssColorString('#ffc46a'), outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Infinity },
    label: { text: 'A · 起点', font: '600 13px sans-serif', pixelOffset: new Cartesian2(0, -25), outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: Infinity },
  })
  const goal = viewer.entities.getById('embodied-goal')
  if (goal?.label) goal.label.text = new ConstantProperty('B · 终点')
  if (!buildingChoice.navigationAvailable) {
    for (const id of ['mission-coverage', 'mission-start', 'embodied-goal']) {
      const entity = viewer.entities.getById(id)
      if (entity) entity.show = false
    }
    element('cityCoverage').textContent = '当前为 Google 实景浏览；导航需要与所选区域对应的碰撞数据。'
  }
  element('pickMission').addEventListener('click', () => beginMapPick('start', true))
  element('pickStart').addEventListener('click', () => beginMapPick('start'))
  element('pickGoal').addEventListener('click', () => beginMapPick('goal'))
  const cancelPick = (): void => {
    mapPickMode = undefined
    pickPair = false
    updateMissionPreview()
    setPhase(missionError ? 'CHECK ROUTE' : 'READY', '任务位置已保留', missionError || '可继续修改，或开始导航。')
  }
  element('cancelMapPick').addEventListener('click', cancelPick)
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && mapPickMode) cancelPick() })
  element('districtView').addEventListener('click', showDistrictView)
  installNumericSetting('citySpeed', 'speed', citySpeedMetersPerSecond, value => {
    citySpeedMetersPerSecond = value
    agentLoop?.setPlanningSpeedMetersPerSecond(value)
  })
  installNumericSetting('cityCameraHeight', 'height', cityCameraHeightMeters, value => {
    cityCameraHeightMeters = value
    setOverviewView(false, false)
  })
  element('swapMission').addEventListener('click', () => { applyUrbanMission({ ...NAMCHE_GOAL }, { ...NAMCHE_START }); cancelPick() })
  element('resetMission').addEventListener('click', () => { applyUrbanMission(NAMCHE_START, NAMCHE_GOAL); cancelPick() })
  element('restoreMission').addEventListener('click', () => {
    applyUrbanMission(urbanNavigation!.defaultChallenge.start, urbanNavigation!.defaultChallenge.goal)
    cancelPick()
    setOverviewView(true, false)
    frameUrbanMap(false)
  })
  element('crossDistrictMission').hidden = false
  element('crossDistrictMission').addEventListener('click', () => {
    applyUrbanMission(
      { longitude: 139.76375, latitude: 35.68045, height: URBAN_GROUND_HEIGHT },
      { longitude: 139.76375, latitude: 35.68245, height: URBAN_GROUND_HEIGHT },
    )
    cancelPick()
    showDistrictView()
  })
  element('shareMission').addEventListener('click', () => { void shareCurrentMission('shareMission') })
  element('longMission').addEventListener('click', () => {
    applyUrbanMission(CITY_LONG_MISSION.start, CITY_LONG_MISSION.goal)
    cancelPick()
    setOverviewView(true, false)
    frameUrbanMap(false)
  })
  mapPickHandler = new ScreenSpaceEventHandler(viewer.canvas)
  mapPickHandler.setInputAction((event: { position: Cartesian2 }) => {
    if (!mapPickMode || !viewer || !urbanNavigation) return
    const reject = (message: string): void => {
      element('mapPickText').textContent = message
      element('missionStatus').textContent = message
      element('missionStatus').dataset.error = 'true'
    }
    if (buildingChoice.source === 'white' && viewer.scene.pick(event.position)?.id === URBAN_WHITE_BUILDINGS_ID) {
      reject('这里是建筑表面，请点击街道或空地。')
      return
    }
    const surface = viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(event.position) : undefined
    if (surface && Cartographic.fromCartesian(surface).height > URBAN_GROUND_HEIGHT + 3) {
      reject('这里是建筑表面，请点击街道或空地。')
      return
    }
    const ray = viewer.camera.getPickRay(event.position)
    const picked = ray && viewer.scene.globe.pick(ray, viewer.scene)
    if (!picked) { reject('没有选到地面，请点击地图上的地面。'); return }
    const geo = Cartographic.fromCartesian(picked)
    const point = { longitude: CesiumMath.toDegrees(geo.longitude), latitude: CesiumMath.toDegrees(geo.latitude), height: URBAN_GROUND_HEIGHT }
    const validation = urbanNavigation.validatePoint(point)
    if (!validation.valid) {
      reject(validation.reason === 'near-building' ? '这个位置太靠近建筑，请选更开阔的地面。' : '这个坐标无效，请重新选择地图上的地面。')
      return
    }
    const choosingStart = mapPickMode === 'start'
    applyUrbanMission(choosingStart ? point : NAMCHE_START, choosingStart ? NAMCHE_GOAL : point)
    if (choosingStart && pickPair) mapPickMode = 'goal'
    else { mapPickMode = undefined; pickPair = false }
    updatePickUi()
    if (mapPickMode === 'goal') setPhase('SET MISSION', '起点已设置，请再选终点', '点击地图上的地面，可缩放和平移到其他区域。')
    if (!mapPickMode) setPhase(missionError ? 'CHECK ROUTE' : 'READY', '起终点已设置', missionError || '候选路线已更新。点击“开始导航”，让 Jev 执行本次任务。')
  }, ScreenSpaceEventType.LEFT_CLICK)
}

async function shareCurrentMission(buttonId: string): Promise<void> {
  const url = isUrban ? writeUrbanMission(new URL(location.href), NAMCHE_START, NAMCHE_GOAL) : new URL(location.href)
  if (isUrban) {
    const input = element<UiInput>('missionLink')
    input.value = url.href
    element('missionLinkField').hidden = false
    await input.updateComplete
    input.focus({ preventScroll: true })
    input.select()
    element(buttonId).textContent = '任务链接已生成'
    return
  }
  try { await navigator.clipboard.writeText(url.href); element(buttonId).textContent = '已复制任务链接' }
  catch { appendMessage('event', `当前任务链接：${url.href}`) }
}

function scheduleCameraTransition(): void {
  if (cameraTransitionFrame !== undefined) cancelAnimationFrame(cameraTransitionFrame)
  cameraTransitionFrame = requestAnimationFrame(applyCameraTransitionFrame)
}

function applyCameraTransitionFrame(nowMs: number): void {
  if (!player || disposed) {
    cameraTransitionFrame = undefined
    return
  }
  const frame = cameraTransition.step(nowMs)
  player.setMinCamDistance(frame.minDistance)
  player.setMaxCamDistance(frame.maxDistance)
  if (frame.pitchDelta !== 0) player.setInput({
    lookDeltaX: 0,
    lookDeltaY: frame.pitchDelta,
  })
  cameraTransitionFrame = frame.active
    ? requestAnimationFrame(applyCameraTransitionFrame)
    : undefined
}

function installInteractions(): void {
  chatForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const command = (chatInput.value ?? '').trim()
    if (!command) return
    chatInput.value = ''
    handleCommand(command)
  })
  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      chatForm.requestSubmit()
    }
  })
  document.querySelectorAll<UiButton>('[data-command]').forEach((button) => {
    button.addEventListener('click', () => {
      const command = button.dataset.command
      if (command === 'view') {
        appendMessage('user', '切换观察视角')
        toggleView()
      } else if (command === 'stop') {
        appendMessage('user', '停止任务')
        stopTask()
      } else {
        appendMessage('user', isUrban ? '从当前起点前往设置的终点' : '自主前往观察点')
        startTask()
      }
    })
  })
}

function handleCommand(command: string): void {
  appendMessage('user', command)
  if (worldInquiry.accepts(command)) {
    if (!embodiment) {
      appendMessage('event', '场景尚未就绪，请等待角色加载后再查询。')
      return
    }
    try {
      const pose = embodiment.observe()
      const position = Cartographic.fromCartesian(new Cartesian3(
        pose.positionEcef.x, pose.positionEcef.y, pose.positionEcef.z,
      ))
      const at = new Date().toISOString()
      worldInquiry.observe(at,
        [CesiumMath.toDegrees(position.longitude), CesiumMath.toDegrees(position.latitude), position.height],
        [NAMCHE_GOAL.longitude, NAMCHE_GOAL.latitude],
        hazardVisible ? [LANDSLIDE_HAZARD.center.longitude, LANDSLIDE_HAZARD.center.latitude] : undefined,
      )
      appendMessage('event', worldInquiry.answer(command, at))
    } catch (error) {
      appendMessage('event', `查询失败：${errorMessage(error)}`)
    }
    return
  }
  if (/停止|暂停|stop/i.test(command)) {
    stopTask()
    return
  }
  if (/视角|第一人称|第三人称|view/i.test(command)) {
    toggleView()
    return
  }
  if (/前往|出发|开始|导航|start|go to/i.test(command)) {
    startTask()
    return
  }
  appendMessage('event', '当前支持：查看场景、查找角色、查找观察点、记录现场、比较变化、前往观察点、停止、切换视角。开放式语义任务尚未接入。')
}

function addSceneEvidence(goal: GeoPoint, hazard: CircularHazard): void {
  if (!viewer) return
  viewer.entities.add({
    id: 'live-actor-marker',
    position: new CallbackPositionProperty(() => {
      const position = player?.getPosition()
      return position ? new Cartesian3(position.x, position.y, position.z) : undefined
    }, false),
    ...(!isUrban ? { point: { pixelSize: 9, color: Color.fromCssColorString('#ffbf69'), outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } } : {}),
    label: { text: isUrban ? 'Jev 导航员' : 'Jev 角色', font: '12px sans-serif', pixelOffset: new Cartesian2(0, isUrban ? -72 : -19), outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: Number.POSITIVE_INFINITY },
  })
  viewer.entities.add({
    id: 'embodied-goal',
    position: Cartesian3.fromDegrees(goal.longitude, goal.latitude, goal.height + 1),
    point: {
      pixelSize: 11,
      color: Color.fromCssColorString('#55dfb9'),
      outlineColor: Color.fromCssColorString('#061015'),
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: isUrban ? '楼后目的地' : 'AI 观察点',
      font: '600 13px sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString('#061015'),
      outlineWidth: 4,
      style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.CENTER,
      pixelOffset: new Cartesian2(14, 0),
      distanceDisplayCondition: new DistanceDisplayCondition(0, 2_500),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
  viewer.entities.add({
    id: 'embodied-trail',
    polyline: {
      positions: new CallbackProperty(
        () => trailPositions.length >= 2 ? trailPositions : undefined,
        false,
      ),
      width: 4,
      clampToGround: true,
      material: new PolylineGlowMaterialProperty({
        glowPower: 0.22,
        taperPower: 0.65,
        color: Color.fromCssColorString('#55dfb9'),
      }),
    },
  })
  hazardEntity = viewer.entities.add({
    id: hazard.id,
    show: false,
    position: Cartesian3.fromDegrees(
      hazard.center.longitude,
      hazard.center.latitude,
      hazard.center.height,
    ),
    ellipse: {
      semiMajorAxis: hazard.radiusMeters,
      semiMinorAxis: hazard.radiusMeters,
      height: 0,
      material: Color.fromCssColorString('#ff625f').withAlpha(0.34),
      heightReference: HeightReference.CLAMP_TO_GROUND,
    },
    label: {
      text: `新发现 · ${LANDSLIDE_HAZARD.name}`,
      font: '600 12px sans-serif',
      fillColor: Color.fromCssColorString('#ffd7d1'),
      outlineColor: Color.fromCssColorString('#38100e'),
      outlineWidth: 4,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -18),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
  if (isUrban) viewer.entities.remove(hazardEntity)
}

function updateLiveUi(snapshot: EmbodiedWorldSnapshot, tick: EmbodiedTickResult): void {
  distanceMetric.textContent = `${isUrban ? '剩余路程' : '目标距离'} ${Math.round(snapshot.distanceToGoalMeters)} m`
  revisionStatus.textContent = `WORLD r${snapshot.revision}`
  loopStatus.textContent = `${tick.state.safety.toUpperCase()} · ${tick.state.planner.toUpperCase()} · 20HZ`
  const candidateSummary = snapshot.candidates
    .map(candidate => `${candidate.id} ${Math.round(candidate.clearanceMeters)}m${candidate.traversable ? '' : ' ×'}`)
    .join(' · ')

  if (tick.state.safety === 'avoiding') {
    setPhase('ACT · SAFETY', '本地安全循环正在制动转向', candidateSummary)
  } else if (tick.state.safety === 'blocked') {
    setPhase('HOLD', '证据不足，角色保持停止', candidateSummary)
  } else if (tick.state.planner === 'pending') {
    const moving = tick.input.moveY > 0 || tick.input.moveX !== 0
    setPhase(moving ? 'MOVING · PLANNING' : 'PLAN', moving
      ? '继续前进，Jev 正在更新下一段'
      : '正在获取可执行计划', candidateSummary)
  } else if (tick.state.activeIntent) {
    setPhase('ACT', intentLabel(tick.state.activeIntent), candidateSummary)
  } else {
    setPhase('SENSE', '等待下一段可提交计划', candidateSummary)
  }
}

function updateTrail(position: { x: number, y: number, z: number }, force = false): void {
  const current = new Cartesian3(position.x, position.y, position.z)
  if (lastTrailPosition) {
    const distance = Cartesian3.distance(current, lastTrailPosition)
    if (distance === 0) {
      const lastFrame = replayFrames.at(-1)
      if (force && lastFrame && latestSnapshot) {
        lastFrame.snapshot = structuredClone(latestSnapshot)
        lastFrame.at = Date.now()
      }
      return
    }
    if (!force && distance < 1.5) return
  }
  trailPositions.push(current)
  lastTrailPosition = Cartesian3.clone(current)
  if (trailPositions.length > 4_000) trailPositions.shift()
  if (latestSnapshot) {
    replayFrames.push({ position: Cartesian3.clone(current), snapshot: structuredClone(latestSnapshot), at: Date.now() })
    if (replayFrames.length > 4_000) replayFrames.shift()
  }
}

function installScenarioControls(): void {
  element('sceneCredit').textContent = isUrban ? buildingChoice.source === 'google' ? 'Google 3D · 仅浏览'
    : buildingChoice.source === 'white' ? 'PLATEAU 白模 · Esri 底图' : 'PLATEAU 实景 · Esri 影像' : 'ArcGIS World Elevation · Esri Imagery'
  element('sceneScope').textContent = isUrban
    ? buildingChoice.navigationAvailable ? '建筑与碰撞来自同源数据；街道路面为局部近似。' : 'Google 实景独立浏览，尚未准备对应碰撞数据。'
    : '同一片真实地形；目标与风险区为实验配置。'
  const buildingSelect = document.getElementById('cityBuildingSource') as UiSelect | null
  if (buildingSelect) {
    buildingSelect.value = buildingChoice.source
    const google = buildingSelect.querySelector<UiOption>('wa-option[value="google"]')
    if (google && !buildingChoice.googleAvailable) {
      google.disabled = true
      google.textContent = 'Google 3D · 需配置'
    }
    const note = document.getElementById('citySourceNote')
    if (note) note.textContent = buildingChoice.notice || (buildingChoice.source === 'white' ? '本地无纹理建筑，加载更轻。来源：PLATEAU。'
      : buildingChoice.source === 'google' ? '仅实景浏览；切回白模继续导航。' : '在线纹理建筑，需要加载远程瓦片。')
    buildingSelect.addEventListener('change', () => {
      if (active) stopTask()
      const url = writeUrbanMission(new URL(location.href), NAMCHE_START, NAMCHE_GOAL)
      url.searchParams.set('buildings', String(buildingSelect.value ?? 'white'))
      location.assign(url.href)
    })
  }
  const select = element<UiSelect>('sceneSelect')
  const seed = element<UiInput>('sceneSeed')
  for (const preset of displayScenarios) {
    const option = document.createElement('wa-option')
    option.value = preset.id
    option.textContent = preset.title
    select.append(option)
  }
  select.value = selectedPreset
  seed.value = String(selectedSeed)
  const updateDescription = (): void => {
    element('sceneDescription').textContent = displayScenarios.find(item => item.id === (select.value ?? selectedPreset))?.description ?? ''
  }
  updateDescription()
  select.addEventListener('change', updateDescription)
  const apply = (): void => {
    if (!seed.reportValidity()) return
    stopTask()
    const url = new URL(location.href)
    url.searchParams.set('planner', 'jev')
    url.searchParams.set('scene', String(select.value ?? selectedPreset))
    url.searchParams.set('seed', String(Math.trunc(Number(seed.value) || selectedSeed)))
    location.assign(url.href)
  }
  element('applyScene').addEventListener('click', apply)
  element('randomScene').addEventListener('click', async () => {
    select.value = 'random'
    seed.value = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 999999 + 1)
    await seed.updateComplete
    apply()
  })
  element('shareScene').addEventListener('click', () => {
    const url = isUrban ? writeUrbanMission(new URL(location.href), NAMCHE_START, NAMCHE_GOAL) : new URL(location.href)
    url.searchParams.set('scene', selectedPreset)
    url.searchParams.set('seed', String(selectedSeed))
    url.searchParams.set('planner', 'jev')
    void navigator.clipboard.writeText(url.href).then(() => {
      element('shareScene').textContent = '已复制当前场景'
    }).catch(() => appendMessage('event', `当前场景链接：${url.href}`))
  })
  element<UiSlider>('replaySlider').addEventListener('input', event => {
    showReplay((event.target as UiSlider).value)
  })
  element('exitReplay').addEventListener('click', exitReplay)
  const traceDialog = element<UiDialog>('traceDialog')
  const traceJson = element<UiTextarea>('traceJson')
  element('exportTrace').addEventListener('click', () => {
    traceJson.value = JSON.stringify({
      version: 1, scenario, planner: useJev ? 'jev' : 'hosted',
      channel: 'cesium-mcp-bridge-sdk', exportedAt: new Date().toISOString(),
      decisions: decisionTrace, calls: bridgeTrace, frames: replayFrames, continuity, urbanVisualState,
      navigation: isUrban ? { selectedRouteId, offer: routeOffer, candidates: urbanCandidates, motionSamples: urbanMotionSamples } : undefined,
    }, null, 2)
    traceDialog.open = true
  })
  element('closeTraceDialog').addEventListener('click', () => { traceDialog.open = false })
  element('selectTraceJson').addEventListener('click', () => {
    traceJson.focus({ preventScroll: true })
    traceJson.select()
    traceJson.setSelectionRange(0, traceJson.value?.length ?? 0)
  })
}

function recordBridgeCall(trace: BridgeAgentTrace): void {
  bridgeTrace.push(trace)
  if (bridgeTrace.length > 2_000) bridgeTrace.shift()
  const list = element('bridgeCalls')
  list.replaceChildren(...bridgeTrace.slice(-8).reverse().map(entry => {
    const item = document.createElement('li')
    item.dataset.status = entry.status
    const status = { succeeded: '成功', rejected: '已拒绝过期动作', failed: '失败' }[entry.status]
    item.textContent = `${entry.tool} · ${status} · ${entry.durationMs} ms`
    return item
  }))
}

function recordUrbanVisualState(state: UrbanVisualState): void {
  if (disposed) return
  urbanVisualState = state
  let badge = document.getElementById('urbanVisualStatus')
  if (!badge) {
    badge = document.createElement('span')
    badge.id = 'urbanVisualStatus'
    badge.className = 'world-status'
    worldStatus.after(badge)
  }
  badge.dataset.state = state.status === 'partial' ? 'degraded' : state.status
  badge.textContent = state.status === 'ready' ? URBAN_SOURCE_LABELS[buildingChoice.source]
    : state.status === 'partial' ? '部分建筑加载失败' : '建筑加载中'
  badge.title = buildingChoice.source === 'white' ? 'PLATEAU 本地白模，与导航和碰撞共用几何；不加载远程纹理。'
    : `已加载 ${state.loadedTiles} 个数据块，等待 ${state.pendingRequests}，处理中 ${state.processingTiles}；仅报告当前视野。`
}

function refreshReplayControls(): void {
  const slider = element<UiSlider>('replaySlider')
  slider.max = Math.max(0, replayFrames.length - 1)
  slider.disabled = active || replayFrames.length < 2
  if (!replaying) {
    slider.value = slider.max
    element('replayStatus').textContent = active
      ? '正在记录实际轨迹；停止后可回放。'
      : `已记录 ${replayFrames.length} 个历史位置。黄色回放点不改变角色状态。`
  }
}

function showReplay(index: number): void {
  if (active || !viewer) return
  const frame = replayFrames[index]
  if (!frame) return
  replaying = true
  if (!replayEntity) replayEntity = viewer.entities.add({
    id: 'history-position',
    point: { pixelSize: 16, color: Color.YELLOW, outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: { text: '历史位置', font: '14px sans-serif', pixelOffset: new Cartesian2(0, -24), disableDepthTestDistance: Number.POSITIVE_INFINITY },
  })
  replayEntity.position = new ConstantPositionProperty(frame.position)
  replayEntity.show = true
  setOverviewView(true, false)
  element('exitReplay').hidden = false
  element('replayStatus').textContent = `第 ${index + 1}/${replayFrames.length} 帧 · 距目标 ${frame.snapshot.distanceToGoalMeters.toFixed(1)} m`
  setPhase('REPLAY', '正在查看历史位置', '黄色标记为历史轨迹；角色保持停止，回放不调用模型。')
}

function exitReplay(): void {
  if (replayEntity) replayEntity.show = false
  replaying = false
  element('exitReplay').hidden = true
  refreshReplayControls()
  if (ready) setPhase('READY', scenario.title, '历史轨迹保留，可从角色当前位置继续导航。')
}

interface TerrainField {
  heightAt(point: GeoPoint): number | undefined
}

async function buildTerrainField(provider: TerrainProvider): Promise<TerrainField> {
  const size = TERRAIN_GRID_HALF_SIZE * 2 + 1
  const cartographics: Cartographic[] = []
  for (let northIndex = -TERRAIN_GRID_HALF_SIZE; northIndex <= TERRAIN_GRID_HALF_SIZE; northIndex += 1) {
    for (let eastIndex = -TERRAIN_GRID_HALF_SIZE; eastIndex <= TERRAIN_GRID_HALF_SIZE; eastIndex += 1) {
      const point = offsetGeoPoint(
        NAMCHE_START,
        eastIndex * TERRAIN_GRID_STEP_METERS,
        northIndex * TERRAIN_GRID_STEP_METERS,
      )
      cartographics.push(Cartographic.fromDegrees(point.longitude, point.latitude))
    }
  }
  const sampled = await sampleTerrainMostDetailed(provider, cartographics, true)
  const heights = sampled.map(sample => Number.isFinite(sample.height) ? sample.height : undefined)

  return {
    heightAt(point: GeoPoint): number | undefined {
      const offset = localOffsetFromStart(point)
      const gridX = offset.east / TERRAIN_GRID_STEP_METERS + TERRAIN_GRID_HALF_SIZE
      const gridY = offset.north / TERRAIN_GRID_STEP_METERS + TERRAIN_GRID_HALF_SIZE
      if (gridX < 0 || gridY < 0 || gridX > size - 1 || gridY > size - 1) return undefined
      const x0 = Math.floor(gridX)
      const y0 = Math.floor(gridY)
      const x1 = Math.min(size - 1, x0 + 1)
      const y1 = Math.min(size - 1, y0 + 1)
      const values = [
        heights[y0 * size + x0],
        heights[y0 * size + x1],
        heights[y1 * size + x0],
        heights[y1 * size + x1],
      ]
      if (values.some(value => value === undefined)) return undefined
      const tx = gridX - x0
      const ty = gridY - y0
      const top = values[0]! * (1 - tx) + values[1]! * tx
      const bottom = values[2]! * (1 - tx) + values[3]! * tx
      return top * (1 - ty) + bottom * ty
    },
  }
}

function flatTerrainField(): TerrainField {
  return { heightAt: () => 0 }
}

function terrainPoint(point: GeoPoint): GeoPoint {
  return { ...point, height: terrainField?.heightAt(point) ?? 0 }
}

function classifyActorRayHits(
  hits: ActorRayHitFan | undefined,
  field: TerrainField,
  maximumDistanceMeters: number,
): ActorRayFan | undefined {
  if (!hits) return undefined
  const result: ActorRayFan = {
    front: maximumDistanceMeters,
    left: maximumDistanceMeters,
    right: maximumDistanceMeters,
  }
  for (const id of ['front', 'left', 'right'] as const) {
    const hit = hits[id]
    if (!hit) continue
    if (hit.normalKnown === false || Math.hypot(hit.normalEcef.x, hit.normalEcef.y, hit.normalEcef.z) < 1e-9) {
      result[id] = hit.distanceMeters
      continue
    }
    const point = new Cartesian3(
      hit.positionEcef.x,
      hit.positionEcef.y,
      hit.positionEcef.z,
    )
    const cartographic = Cartographic.fromCartesian(point)
    const geoPoint: GeoPoint = {
      longitude: CesiumMath.toDegrees(cartographic.longitude),
      latitude: CesiumMath.toDegrees(cartographic.latitude),
      height: cartographic.height,
    }
    const terrainHeight = field.heightAt(geoPoint)
    const up = Ellipsoid.WGS84.geodeticSurfaceNormal(point, new Cartesian3())
    const normal = Cartesian3.normalize(
      new Cartesian3(hit.normalEcef.x, hit.normalEcef.y, hit.normalEcef.z),
      new Cartesian3(),
    )
    const heightAboveTerrain = terrainHeight === undefined
      ? undefined
      : cartographic.height - terrainHeight
    if (!isGroundSupportHit(heightAboveTerrain, Cartesian3.dot(up, normal))) {
      result[id] = hit.distanceMeters
    }
  }
  return result
}

function localOffsetFromStart(point: GeoPoint): { east: number, north: number } {
  const distance = distanceMeters(NAMCHE_START, point)
  const bearing = initialBearingRadians(NAMCHE_START, point)
  return {
    east: Math.sin(bearing) * distance,
    north: Math.cos(bearing) * distance,
  }
}

function setWorldStatus(state: 'loading' | 'ready' | 'degraded' | 'error', text: string): void {
  worldStatus.dataset.state = state
  const label = worldStatus.querySelector('span')
  if (label) label.textContent = text
}

function setPhase(label: string, title: string, detail: string): void {
  phaseLabel.textContent = label
  phaseTitle.textContent = title
  phaseDetail.textContent = detail
}

function appendMessage(className: string, text: string): void {
  const article = document.createElement('article')
  article.className = `message ${className}`
  const paragraph = document.createElement('p')
  paragraph.textContent = text
  article.append(paragraph)
  chatMessages.append(article)
  while (chatMessages.childElementCount > 40) chatMessages.firstElementChild?.remove()
  // Coalesce decision bursts; avoid repeated synchronous layout in Cesium preUpdate.
  if (chatScrollFrame === undefined) {
    chatScrollFrame = requestAnimationFrame(() => {
      chatScrollFrame = undefined
      chatMessages.scrollTop = chatMessages.scrollHeight
    })
  }
}

function intentLabel(intent: string): string {
  const labels: Record<string, string> = {
    advance: '沿当前证据继续前进',
    'turn-left': '向左重定向',
    'turn-right': '向右重定向',
    'inspect-left': '向左观察',
    'inspect-right': '向右观察',
    hold: '保持停止',
  }
  return labels[intent] ?? intent
}

function safetyEvidenceKey(reason: string): string {
  if (reason.includes('First bounded scan')) return 'scan-alternate'
  if (reason.includes('Both bounded')) return 'scan-hold'
  if (reason.includes('in-place')) return 'scan'
  if (reason.includes('verified')) return 'verify'
  if (reason.includes('bypass')) return 'bypass'
  return reason
}

function formatSafetyEvidence(reason: string): string {
  const side = reason.includes('left') ? '左' : reason.includes('right') ? '右' : ''
  if (reason.includes('First bounded scan')) {
    return '首次扫描未找到安全前方，正在换边复核。'
  }
  if (reason.includes('Both bounded')) {
    return '两侧有界扫描均未找到可通走廊，角色保持停止并等待新世界证据。'
  }
  if (reason.includes('in-place')) {
    return `选择${side}侧原地扫描，直到前方走廊通过验证。`
  }
  if (reason.includes('Holding position')) {
    return '保持停止，连续验证新发现的前方走廊。'
  }
  if (reason.includes('bypass')) {
    return `前方走廊稳定通过验证，开始执行${side}侧绕障承诺段。`
  }
  return reason
}

async function withTimeout<T>(
  sourceSignal: AbortSignal,
  timeoutMs: number,
  execute: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const abortFromSource = (): void => controller.abort(sourceSignal.reason)
  sourceSignal.addEventListener('abort', abortFromSource, { once: true })
  const timeout = window.setTimeout(
    () => controller.abort(new Error(`Hosted model timed out after ${timeoutMs} ms`)),
    timeoutMs,
  )
  try {
    return await execute(controller.signal)
  } finally {
    window.clearTimeout(timeout)
    sourceSignal.removeEventListener('abort', abortFromSource)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`Missing element #${id}`)
  return value as T
}

function exposeDebugApi(): void {
  const target = window as unknown as {
    __embodiedWorldLab?: Record<string, unknown>
  }
  target.__embodiedWorldLab = {
    start: startTask,
    stop: stopTask,
    toggleView,
    inspectSurface: (x: number, y: number) => {
      if (!viewer) return undefined
      const windowPosition = new Cartesian2(x, y)
      const ray = viewer.camera.getPickRay(windowPosition)
      const point = ray && viewer.scene.globe.pick(ray, viewer.scene)
      if (!point) return undefined
      const geo = Cartographic.fromCartesian(point)
      const surface = viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(windowPosition) : undefined
      return {
        longitude: CesiumMath.toDegrees(geo.longitude), latitude: CesiumMath.toDegrees(geo.latitude), height: geo.height,
        visibleSurfaceHeight: surface ? Cartographic.fromCartesian(surface).height : undefined,
      }
    },
    getState: () => ({
      active,
      ready,
      worldRevision,
      taskGeneration,
      hazardVisible,
      snapshot: latestSnapshot,
      tick: latestTick,
      plannerTasks: plannerRuntime.snapshot(),
      planner: useJev ? 'jev' : 'hosted',
      decisions: decisionTrace,
      bridgeCalls: bridgeTrace,
      scenario,
      replay: { frameCount: replayFrames.length, active: replaying, frames: replayFrames },
      continuity,
      urbanCollisionCounts,
      streamingGround: urbanStreamingGround?.getState(),
      urbanVisualState,
      navigation: {
        buildingSource: buildingChoice.source,
        navigationAvailable: buildingChoice.navigationAvailable,
        editor: { pickMode: mapPickMode, missionError, start: { ...NAMCHE_START }, goal: { ...NAMCHE_GOAL } },
        grid: urbanNavigation?.grid,
        selectedRouteId,
        offer: routeOffer,
        candidates: urbanCandidates,
        challenge: urbanNavigation?.defaultChallenge,
        minimumBuildingClearanceMeters,
        motionSamples: urbanMotionSamples,
      },
      positionEcef: embodiment?.observe().positionEcef,
      presentation: {
        overview: overviewView,
        speedMetersPerSecond: citySpeedMetersPerSecond,
        followHeightMeters: cityCameraHeightMeters,
        cameraHeight: viewer ? Cartographic.fromCartesian(viewer.camera.positionWC).height : undefined,
        cameraPitchDegrees: viewer ? CesiumMath.toDegrees(viewer.camera.pitch) : undefined,
        actorMinimumPixelSize: player?.getPlayerModel()?.minimumPixelSize,
      },
    }),
  }
}

window.addEventListener('beforeunload', () => {
  disposed = true
  active = false
  if (cameraTransitionFrame !== undefined) cancelAnimationFrame(cameraTransitionFrame)
  if (chatScrollFrame !== undefined) cancelAnimationFrame(chatScrollFrame)
  plannerRuntime.clear(new Error('Page disposed'))
  removePreUpdate?.()
  mapPickHandler?.destroy()
  removeUrbanVisualWatcher?.()
  agentChannel?.dispose()
  embodiment?.stop()
  urbanStreamingGround?.destroy()
  player?.destroy()
  if (viewer && !viewer.isDestroyed()) viewer.destroy()
})
