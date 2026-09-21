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
import { addUrbanBuildingColliders, addUrbanGroundCollider, createUrbanGround, createUrbanScenario, insideUrbanCoverage, loadUrbanBuildings, URBAN_GROUND_HEIGHT, URBAN_METADATA } from './urban-scene.js'
import type { UrbanVisualState } from './urban-scene.js'
import { createMovementContinuity } from './movement-continuity.js'
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
const useJev = sceneQuery.get('planner') !== 'hosted'
const displayScenarios = [URBAN_METADATA, ...SCENARIO_PRESETS]
const selectedPreset = displayScenarios.some(item => item.id === sceneQuery.get('scene'))
  ? sceneQuery.get('scene') as ScenarioPreset | 'city' : 'city'
const isUrban = selectedPreset === 'city'
const selectedSeed = Math.max(1, Math.min(999999, Number(sceneQuery.get('seed')) || 260921)) | 0
const scenario = isUrban ? createUrbanScenario(selectedSeed) : createScenario(selectedPreset as ScenarioPreset, selectedSeed)
const NAMCHE_START = scenario.start
const NAMCHE_GOAL = scenario.goal
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
const chatInput = element<HTMLTextAreaElement>('chatInput')
const loopStatus = element<HTMLElement>('loopStatus')
const revisionStatus = element<HTMLElement>('revisionStatus')
const foxCredits = element<HTMLAnchorElement>('foxCredits')
foxCredits.href = FOX_NOTICE_URL
if (useJev) {
  modelStatus.textContent = 'JEV · 等待开始'
  const intro = chatMessages.querySelector('p')
  if (intro) intro.textContent = 'Jev 在后台持续更新下一段动作，角色沿当前有效计划连续前进。建筑和地形碰撞由本地控制器实时处理；此实验使用结构化观测。'
}

let viewer: Viewer | undefined
let player: playerController | undefined
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
let minimumHazardBoundaryDistanceMeters = Number.POSITIVE_INFINITY
const trailPositions: Cartesian3[] = []
const plannerRuntime = new WorldTaskRuntime({ frameBudgetMs: 5 })
const cameraTransition = new CameraPresetTransition({
  presets: {
    follow: { minDistance: isUrban ? 1_800 : 800, maxDistance: isUrban ? 3_500 : 2_200, pitchOffset: 0 },
    overview: { minDistance: isUrban ? 18_000 : 50_000, maxDistance: isUrban ? 25_000 : 60_000, pitchOffset: isUrban ? 12 : 45 },
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
installScenarioControls()

void bootstrap().catch((error: unknown) => {
  const message = errorMessage(error)
  setWorldStatus('error', '初始化失败')
  setPhase('ERROR', '具身执行器未能启动', message)
  appendMessage('event safety', `初始化失败：${message}`)
  console.error('[Embodied world lab]', error)
})

async function bootstrap(): Promise<void> {
  setPhase('BOOT', '正在加载真实地形', '慢速网络工作只发生在启动阶段，不进入控制快循环。')
  const baseLayer = new ImageryLayer(new UrlTemplateImageryProvider({
    url: ESRI_WORLD_IMAGERY_URL,
    maximumLevel: 18,
    credit: 'Esri World Imagery',
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
  viewer.scene.globe.baseColor = Color.fromCssColorString('#0a2528')
  viewer.scene.backgroundColor = Color.fromCssColorString('#02090c')
  viewer.scene.globe.depthTestAgainstTerrain = true
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = true

  let terrainProvider: TerrainProvider
  let terrainDegraded = false
  if (isUrban) {
    terrainProvider = createUrbanGround()
    viewer.scene.terrainProvider = terrainProvider
    terrainField = { heightAt: () => URBAN_GROUND_HEIGHT }
    setPhase('CITY', '正在加载东京实景建筑', 'PLATEAU 2025 带纹理三维建筑；街道路面使用局部平面近似。')
    await loadUrbanBuildings(viewer, recordUrbanVisualState, cleanup => { removeUrbanVisualWatcher = cleanup })
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
  const modelUrl = new URL('./assets/Fox.glb', import.meta.url).href
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
      idleAnim: 'Survey',
      walkAnim: 'Walk',
      runAnim: 'Run',
      jumpAnim: 'Survey',
      gravity: -980,
      jumpHeight: 0,
      speed: isUrban ? 220 : 300,
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
    minCamDistance: isUrban ? 1_800 : 800,
    maxCamDistance: isUrban ? 3_500 : 2_200,
    enableZoom: false,
  })
  if (isUrban) {
    await addUrbanGroundCollider(player)
    setPhase('BUILDING COLLISIONS', '正在建立真实楼体碰撞', '完成后才开放导航，避免把未加载的建筑当作空地。')
    urbanCollisionCounts = await addUrbanBuildingColliders(player)
  }
  player.setOverShoulderView(false)
  player.setInput({
    moveX: 0,
    moveY: 0,
    lookDeltaX: 0,
    lookDeltaY: isUrban ? -2 : 34,
    jump: false,
    shift: false,
    toggleView: false,
    toggleFly: false,
    toggleVehicle: false,
  })

  embodiment = new CesiumPlayerEmbodiment(player, { lookDeltaScale: 0.8 })
  agentLoop = new EmbodiedAgentLoop(embodiment, {
    arrivalDistanceMeters: 8,
    emergencyClearanceMeters: 12,
    retryDelayMs: 2_000,
    planningLeadTimeMs: 3_000,
  })
  agentChannel = createBridgeAgentChannel(viewer, {
    observeWorld: () => {
      if (!latestSnapshot) throw new Error('场景还没有可用观测')
      return structuredClone(latestSnapshot)
    },
    commitMotionIntent: ({ requestId, revision, plan }) =>
      agentLoop?.commitPlan(requestId, revision, plan, performance.now()) ?? false,
    stopEmbodied: () => { agentLoop?.stop() },
    onTrace: recordBridgeCall,
  })
  removePreUpdate = viewer.scene.preUpdate.addEventListener(() => {
    player?.update()
    if (!active || !ready || disposed) return
    const now = performance.now()
    if (now - lastFastLoopAt < FAST_LOOP_INTERVAL_MS) return
    lastFastLoopAt = now
    runFastLoop(now, goal, hazard)
  })

  installInteractions()
  terrainWasReady = true
  ready = true
  distanceMetric.textContent = `目标距离 ${Math.round(distanceMeters(NAMCHE_START, NAMCHE_GOAL))} m`
  setOverviewView(true, false)
  element('bridgeStatus').textContent = 'Bridge 已连接'
  if (urbanCollisionCounts) appendMessage('event', `建筑碰撞已加载：${urbanCollisionCounts.tileCount} 个真实建筑数据块，${urbanCollisionCounts.triangleCount.toLocaleString()} 个三角面。`)
  setWorldStatus(terrainDegraded ? 'degraded' : 'ready', terrainDegraded
    ? '椭球地面 · 可演示'
    : isUrban ? '城市碰撞 · 已就绪' : '真实地形 · 已就绪')
  setPhase(
    'READY',
    `${scenario.title} · 已就绪`,
    `${scenario.description} 点击“开始导航”，观察 Jev 决策与本地安全接管。`,
  )
  appendMessage(
    'event',
    '执行器已就绪：Cesium 每帧更新角色；20Hz 本地感知/安全循环；托管模型在当前动作有效期内异步更新下一段。',
  )
  appendMessage(
    'event',
    isUrban ? '场景来源：PLATEAU 2025 东京千代田区实景纹理建筑。街道路面使用 38m 椭球高的局部平面近似，未模拟车辆和行人。' : '实验边界：落石区是可重复评测 fixture；地形高度与角色坐标系 Rapier 扇形射线来自正在运行的场景。',
  )
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
  if (isUrban && !insideUrbanCoverage(position, SENSOR_DISTANCE_METERS + 2)) {
    stopTask()
    setPhase('COVERAGE LIMIT', '已到建筑碰撞数据边界', '角色已停止；未加载区域不作为可通行区域。')
    return
  }
  if (!isUrban) minimumHazardBoundaryDistanceMeters = Math.min(
    minimumHazardBoundaryDistanceMeters,
    distanceMeters(position, hazard.center) - hazard.radiusMeters,
  )
  let sensed = senseEmbodiedWorld({
    revision: worldRevision,
    position,
    target: goal,
    embodiment: observation,
    hazard,
    hazardVisible,
    terrainHeightAt: terrainField.heightAt,
    candidateDistanceMeters: SENSOR_DISTANCE_METERS,
    hazardPaddingMeters: HAZARD_PADDING_METERS,
  })
  const terrainSlopes = Object.fromEntries(
    sensed.snapshot.candidates.map(candidate => [candidate.id, candidate.slopeDegrees]),
  )
  const rayHits = embodiment.senseActorRayHitFan(SENSOR_DISTANCE_METERS, terrainSlopes)
  const rayFan = classifyActorRayHits(rayHits, terrainField, SENSOR_DISTANCE_METERS)
  sensed = senseEmbodiedWorld({
    revision: worldRevision,
    position,
    target: goal,
    embodiment: observation,
    hazard,
    hazardVisible,
    terrainHeightAt: terrainField.heightAt,
    candidateDistanceMeters: SENSOR_DISTANCE_METERS,
    hazardPaddingMeters: HAZARD_PADDING_METERS,
    ...(rayFan ? { actorRayClearanceMeters: rayFan } : {}),
  })

  const allTerrainReady = sensed.snapshot.candidates.every(candidate => candidate.terrainReady)
  if (allTerrainReady && !terrainWasReady) {
    terrainWasReady = true
    worldRevision += 1
    sensed = senseEmbodiedWorld({
      revision: worldRevision,
      position,
      target: goal,
      embodiment: observation,
      hazard,
      hazardVisible,
      terrainHeightAt: terrainField.heightAt,
      candidateDistanceMeters: SENSOR_DISTANCE_METERS,
      hazardPaddingMeters: HAZARD_PADDING_METERS,
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
      target: goal,
      embodiment: observation,
      hazard,
      hazardVisible: true,
      terrainHeightAt: terrainField.heightAt,
      candidateDistanceMeters: SENSOR_DISTANCE_METERS,
      hazardPaddingMeters: HAZARD_PADDING_METERS,
      ...(rayFan ? { actorRayClearanceMeters: rayFan } : {}),
    })
  }

  latestSnapshot = sensed.snapshot
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
    const safetySummary = isUrban ? '已沿建筑街区到达目标，执行器停止。' : rawBoundaryClearance >= 0
      ? `轨迹未进入风险区，距其边界最近 ${boundaryClearance} 米。`
      : `轨迹曾进入风险区 ${boundaryClearance} 米，需要继续调优。`
    setPhase('ARRIVED', '观察点已到达', `角色已停止；${safetySummary}`)
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
    if (decisionTrace.length > 100) decisionTrace.shift()
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
  setPhase('SENSE', '正在读取角色周边世界', '下一步模型规划在后台运行，角色控制帧不会等待网络。')
  appendMessage('assistant', '任务开始。我会先依据当前地形和前向扇形射线形成短时动作计划；发现新风险时，本地安全循环会先制动，再废弃旧计划。')
}

function stopTask(): void {
  if (agentLoop?.getState().lifecycle === 'completed') return
  taskGeneration += 1
  active = false
  setAutonomousCameraLock(false)
  if (agentChannel) void agentChannel.stop().catch(error => appendMessage('event safety', errorMessage(error)))
  else agentLoop?.stop()
  plannerRuntime.clear(new Error('Task stopped by user'))
  modelStatus.textContent = 'TASK STOPPED'
  loopStatus.textContent = 'STOPPED · IDLE · 20HZ'
  setPhase('STOPPED', '任务已停止', '角色输入已归零，地图和证据仍保留。')
  appendMessage('assistant', '已停止任务，角色执行器已经收到中性输入。')
  refreshReplayControls()
}

function toggleView(): void {
  setOverviewView(!overviewView)
}

function setAutonomousCameraLock(locked: boolean): void {
  if (viewer) viewer.canvas.style.pointerEvents = locked ? 'none' : 'auto'
}

function setOverviewView(enabled: boolean, announce = true): void {
  if (!player || !ready || overviewView === enabled) return
  overviewView = enabled
  cameraTransition.begin(enabled ? 'overview' : 'follow', performance.now())
  scheduleCameraTransition()
  if (announce) appendMessage('event', overviewView
    ? 'ACTIVE VIEW · 高位环境观察视角'
    : 'ACTIVE VIEW · 近距第三人称跟随视角')
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
    const command = chatInput.value.trim()
    if (!command) return
    chatInput.value = ''
    resizeComposer()
    handleCommand(command)
  })
  chatInput.addEventListener('input', resizeComposer)
  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      chatForm.requestSubmit()
    }
  })
  document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach((button) => {
    button.addEventListener('click', () => {
      const command = button.dataset.command
      if (command === 'view') {
        appendMessage('user', '切换观察视角')
        toggleView()
      } else if (command === 'stop') {
        appendMessage('user', '停止任务')
        stopTask()
      } else {
        appendMessage('user', '自主前往观察点')
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
      const position = embodiment?.observe().positionEcef
      return position ? new Cartesian3(position.x, position.y, position.z) : undefined
    }, false),
    point: { pixelSize: 9, color: Color.fromCssColorString('#ffbf69'), outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: { text: 'Jev 角色', font: '12px sans-serif', pixelOffset: new Cartesian2(0, -19), outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: Number.POSITIVE_INFINITY },
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
      text: 'AI 观察点',
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
  distanceMetric.textContent = `目标距离 ${Math.round(snapshot.distanceToGoalMeters)} m`
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
  if (trailPositions.length > 240) trailPositions.shift()
  if (latestSnapshot) {
    replayFrames.push({ position: Cartesian3.clone(current), snapshot: structuredClone(latestSnapshot), at: Date.now() })
    if (replayFrames.length > 4_000) replayFrames.shift()
  }
}

function installScenarioControls(): void {
  element('sceneCredit').textContent = isUrban ? 'PLATEAU 2025 · Esri Imagery' : 'ArcGIS World Elevation · Esri Imagery'
  element('sceneScope').textContent = isUrban
    ? '真实纹理建筑及建筑网格碰撞；街道路面为局部近似。'
    : '同一片真实地形；目标与风险区为实验配置。'
  const select = element<HTMLSelectElement>('sceneSelect')
  const seed = element<HTMLInputElement>('sceneSeed')
  for (const preset of displayScenarios) select.add(new Option(preset.title, preset.id))
  select.value = selectedPreset
  seed.value = String(selectedSeed)
  const updateDescription = (): void => {
    element('sceneDescription').textContent = displayScenarios.find(item => item.id === select.value)?.description ?? ''
  }
  updateDescription()
  select.addEventListener('change', updateDescription)
  const apply = (): void => {
    if (!seed.reportValidity()) return
    stopTask()
    const url = new URL(location.href)
    url.searchParams.set('planner', 'jev')
    url.searchParams.set('scene', select.value)
    url.searchParams.set('seed', String(Math.trunc(Number(seed.value) || selectedSeed)))
    location.assign(url.href)
  }
  element('applyScene').addEventListener('click', apply)
  element('randomScene').addEventListener('click', () => {
    select.value = 'random'
    seed.value = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 999999 + 1)
    apply()
  })
  element('shareScene').addEventListener('click', () => {
    const url = new URL(location.href)
    url.searchParams.set('scene', selectedPreset)
    url.searchParams.set('seed', String(selectedSeed))
    url.searchParams.set('planner', 'jev')
    void navigator.clipboard.writeText(url.href).then(() => {
      element('shareScene').textContent = '已复制当前场景'
    }).catch(() => appendMessage('event', `当前场景链接：${url.href}`))
  })
  element<HTMLInputElement>('replaySlider').addEventListener('input', event => {
    showReplay(Number((event.target as HTMLInputElement).value))
  })
  element('exitReplay').addEventListener('click', exitReplay)
  const traceDialog = element<HTMLDialogElement>('traceDialog')
  const traceJson = element<HTMLTextAreaElement>('traceJson')
  element('exportTrace').addEventListener('click', () => {
    traceJson.value = JSON.stringify({
      version: 1, scenario, planner: useJev ? 'jev' : 'hosted',
      channel: 'cesium-mcp-bridge-sdk', exportedAt: new Date().toISOString(),
      decisions: decisionTrace, calls: bridgeTrace, frames: replayFrames, continuity, urbanVisualState,
    }, null, 2)
    if (!traceDialog.open) traceDialog.showModal()
  })
  element('closeTraceDialog').addEventListener('click', () => traceDialog.close())
  element('selectTraceJson').addEventListener('click', () => {
    traceJson.focus({ preventScroll: true })
    traceJson.select()
    traceJson.setSelectionRange(0, traceJson.value.length)
  })
}

function recordBridgeCall(trace: BridgeAgentTrace): void {
  bridgeTrace.push(trace)
  if (bridgeTrace.length > 200) bridgeTrace.shift()
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
  badge.textContent = state.status === 'ready' ? '当前视野建筑已加载'
    : state.status === 'partial' ? `建筑画面部分失败 (${state.failedTiles})` : '建筑画面加载中'
  badge.title = `已加载 ${state.loadedTiles} 个数据块，等待 ${state.pendingRequests}，处理中 ${state.processingTiles}；仅报告当前视野，碰撞状态单独显示。`
}

function refreshReplayControls(): void {
  const slider = element<HTMLInputElement>('replaySlider')
  slider.max = String(Math.max(0, replayFrames.length - 1))
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

function resizeComposer(): void {
  chatInput.style.height = 'auto'
  chatInput.style.height = `${Math.min(112, chatInput.scrollHeight)}px`
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
      urbanVisualState,
      positionEcef: embodiment?.observe().positionEcef,
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
  removeUrbanVisualWatcher?.()
  agentChannel?.dispose()
  embodiment?.stop()
  player?.destroy()
  if (viewer && !viewer.isDestroyed()) viewer.destroy()
})
