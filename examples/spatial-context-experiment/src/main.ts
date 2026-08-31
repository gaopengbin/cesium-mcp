import 'cesium/Build/Cesium/Widgets/widgets.css'
import './style.css'

import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  DistanceDisplayCondition,
  EllipsoidTerrainProvider,
  GridImageryProvider,
  ImageryLayer,
  JulianDate,
  LabelGraphics,
  PolylineDashMaterialProperty,
  PolygonHierarchy,
  Viewer,
  VerticalOrigin,
} from 'cesium'
import {
  buildCesiumWebMcpTools,
  createCesiumResourceStore,
  isWebMcpSupported,
  registerCesiumWebMcp,
} from 'cesium-mcp-webmcp'
import type { WebMcpRegistration } from 'cesium-mcp-webmcp'
import { CesiumBridge } from 'cesium-mcp-webmcp/viewer'
import {
  emergencyResponseGeoJson,
  FLOOD_BASELINE_RING,
  FLOOD_EXPANDED_RING,
  FLOOD_OBJECT_ID,
  HOSPITAL_OBJECT_ID,
  PRIMARY_ROUTE_OBJECT_ID,
  SCENE_LAYER_ID,
  SCENE_RESOURCE_ID,
  SCHOOL_OBJECT_ID,
  SHELTER_OBJECT_ID,
} from './scenario.js'
import {
  NASA_GIBS_LAYER_ID,
  NASA_GIBS_LAYER_NAME,
  NASA_GIBS_WMS_URL,
  USGS_EARTHQUAKE_FEED_URL,
  USGS_EARTHQUAKE_LAYER_ID,
  USGS_EARTHQUAKE_RESOURCE_ID,
  fetchLatestEarthquakes,
} from './live-gis-services.js'
import type { LiveEarthquakeDataset } from './live-gis-services.js'
import {
  ARCGIS_WORLD_ELEVATION_URL,
  ESRI_WORLD_IMAGERY_CREDIT,
  installHimalayaBasemap,
  prepareHimalayaFlight,
} from './himalaya-flight.js'
import type {
  HimalayaFlightCameraEvent,
  HimalayaFlightDecisionEvent,
  HimalayaFlightDecisionRequest,
  HimalayaFlightExperience,
  HimalayaFlightModelDecision,
  HimalayaFlightObservation,
  HimalayaFlightProgress,
  HimalayaFlightViewMode,
} from './himalaya-flight.js'
import {
  DEFAULT_HOSTED_AGENT_ENDPOINT,
  requestHostedAgent,
} from './hosted-agent.js'
import type {
  HostedAgentMessage,
  HostedAgentTool,
  HostedAgentToolCall,
} from './hosted-agent.js'

interface ToolEnvelope<T = Record<string, unknown>> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

interface SpatialObjectResult {
  objectId: string
  type: string
  name?: string
  layerId?: string
  resourceId?: string
  properties?: Record<string, unknown>
  geometry?: {
    type: string
    coordinates: unknown
  }
  geometryQuality: string
  provenance: { source: string; method: string }
}

interface ObserverCaptureData {
  dataUrl: string
  width: number
  height: number
  camera: {
    longitude: number
    latitude: number
    height: number
    heading: number
    pitch: number
    roll: number
  }
  target: {
    targetObjectId?: string
    preset?: 'overview' | 'detail' | 'eye-level'
    longitude: number
    latitude: number
    height: number
    range: number
    heading: number
    pitch: number
  }
  observedAt: string
  bounds?: [number, number, number, number]
  visibleObjectIds: string[]
  objectCount: number
  quality: 'derived'
  basis: 'observer-viewer-spatial-snapshot'
  readiness: {
    state: 'ready'
    framesRendered: number
    stableFrameCount: number
  }
  userCameraUnchanged: boolean
  limitations: string[]
}

interface GroundedObservationData {
  observationId: string
  readiness: {
    state: 'ready' | 'partial' | 'loading' | 'unknown'
    pendingReasons: string[]
  }
  freshness: {
    snapshotRevision: number
    changedDuringObservation: boolean
  }
  visual: {
    status: 'captured' | 'skipped' | 'unavailable'
    reason: string
    evidence?: ObserverCaptureData
  }
}

interface CheckResult {
  id: string
  label: string
  detail: string
  passed: boolean
  tool: string
  output: unknown
}

interface LabSnapshot {
  phase: 'booting' | 'ready' | 'running' | 'passed' | 'failed'
  sceneMode: 'scenario' | 'live' | 'flight'
  floodExpanded: boolean
  checks: Array<Pick<CheckResult, 'id' | 'label' | 'detail' | 'passed' | 'tool'>>
  perceptionTools: string[]
  resourceId: string
  layerId: string
  observerState: 'empty' | 'loading' | 'ready' | 'failed'
  live?: {
    featureCount: number
    generatedAt?: string
    strongestObjectId: string
  }
  flight?: {
    sampleCount: number
    distanceMeters: number
    minimumClearanceMeters: number
    naiveViolationCount: number
    sampledAt: string
    observationCount: number
    viewMode: HimalayaFlightViewMode
    cameraIntent: string
    safetyMarginMeters: number
    minimumNoFlyZoneClearanceMeters?: number
    unsafeSampleCount: number
  }
}

declare global {
  interface Window {
    __spatialContextLab: {
      getState(): LabSnapshot
      runChecks(): Promise<LabSnapshot>
      toggleFlood(): Promise<LabSnapshot>
      reset(): Promise<LabSnapshot>
      captureObserver(): Promise<LabSnapshot>
      loadLiveGis(): Promise<LabSnapshot>
      loadScenario(): Promise<LabSnapshot>
      planHimalayaFlight(): Promise<LabSnapshot>
      playHimalayaFlight(options?: { durationSeconds?: number }): Promise<LabSnapshot>
    }
  }
}

const globeStage = element<HTMLElement>('globeStage')
const mapBrandTitle = element<HTMLElement>('mapBrandTitle')
const mapBrandSubtitle = element<HTMLElement>('mapBrandSubtitle')
const sceneSourceChip = element<HTMLElement>('sceneSourceChip')
const sceneLegend = element<HTMLElement>('sceneLegend')
const spatialReference = element<HTMLElement>('spatialReference')
const sceneObjectSummary = element<HTMLElement>('sceneObjectSummary')
const panelEyebrow = element<HTMLElement>('panelEyebrow')
const panelTitle = element<HTMLElement>('panelTitle')
const panelIntro = element<HTMLElement>('panelIntro')
const versionChip = element<HTMLElement>('versionChip')
const phaseDot = element<HTMLSpanElement>('phaseDot')
const phaseTitle = element<HTMLElement>('phaseTitle')
const phaseDetail = element<HTMLParagraphElement>('phaseDetail')
const toolMetric = element<HTMLElement>('toolMetric')
const checkMetric = element<HTMLElement>('checkMetric')
const objectMetric = element<HTMLElement>('objectMetric')
const checksElement = element<HTMLDivElement>('checks')
const evidenceOutput = element<HTMLElement>('evidenceOutput')
const scenarioBadge = element<HTMLElement>('scenarioBadge')
const webMcpStatus = element<HTMLElement>('webMcpStatus')
const runButton = element<HTMLButtonElement>('runButton')
const expandFloodButton = element<HTMLButtonElement>('expandFloodButton')
const resetButton = element<HTMLButtonElement>('resetButton')
const riskStateCard = element<HTMLElement>('riskStateCard')
const riskLabel = element<HTMLElement>('riskLabel')
const riskTitle = element<HTMLElement>('riskTitle')
const riskDetail = element<HTMLElement>('riskDetail')
const mapAssessment = element<HTMLElement>('mapAssessment')
const mapAssessmentDetail = element<HTMLElement>('mapAssessmentDetail')
const forecastTime = element<HTMLElement>('forecastTime')
const observerCard = element<HTMLElement>('observerCard')
const observerImage = element<HTMLImageElement>('observerImage')
const observerPlaceholder = element<HTMLElement>('observerPlaceholder')
const observerProof = element<HTMLElement>('observerProof')
const observerStatus = element<HTMLElement>('observerStatus')
const observerMeta = element<HTMLElement>('observerMeta')
const captureObserverButton = element<HTMLButtonElement>('captureObserverButton')
const scenarioModeButton = element<HTMLButtonElement>('scenarioModeButton')
const liveModeButton = element<HTMLButtonElement>('liveModeButton')
const flightModeButton = element<HTMLButtonElement>('flightModeButton')
const flightCommandCard = element<HTMLElement>('flightCommandCard')
const flightProgressBar = element<HTMLElement>('flightProgressBar')
const flightProgressText = element<HTMLElement>('flightProgressText')
const flightPlayButton = element<HTMLButtonElement>('flightPlayButton')
const flightViewFollowButton = element<HTMLButtonElement>('flightViewFollowButton')
const flightViewPovButton = element<HTMLButtonElement>('flightViewPovButton')
const flightViewOverviewButton = element<HTMLButtonElement>('flightViewOverviewButton')
const flightObservationCount = element<HTMLElement>('flightObservationCount')
const flightObservationLog = element<HTMLOListElement>('flightObservationLog')
const flightPovViewport = element<HTMLElement>('flightPovViewport')
const aiObserverCesiumContainer = element<HTMLElement>('aiObserverCesiumContainer')
const flightPovStatus = element<HTMLElement>('flightPovStatus')
const metricOneLabel = element<HTMLElement>('metricOneLabel')
const metricOneValue = element<HTMLElement>('metricOneValue')
const metricOneDetail = element<HTMLElement>('metricOneDetail')
const metricTwoLabel = element<HTMLElement>('metricTwoLabel')
const metricTwoValue = element<HTMLElement>('metricTwoValue')
const metricTwoDetail = element<HTMLElement>('metricTwoDetail')
const metricThreeLabel = element<HTMLElement>('metricThreeLabel')
const metricThreeValue = element<HTMLElement>('metricThreeValue')
const metricThreeDetail = element<HTMLElement>('metricThreeDetail')
const metricFourLabel = element<HTMLElement>('metricFourLabel')
const metricFourValue = element<HTMLElement>('metricFourValue')
const metricFourDetail = element<HTMLElement>('metricFourDetail')
const gisServiceStatus = element<HTMLElement>('gisServiceStatus')
const chatForm = element<HTMLFormElement>('chatForm')
const chatInput = element<HTMLTextAreaElement>('chatInput')
const chatSendButton = element<HTMLButtonElement>('chatSendButton')
const chatMessages = element<HTMLElement>('chatMessages')
const chatModelStatus = element<HTMLElement>('chatModelStatus')
const chatEvidence = element<HTMLElement>('chatEvidence')

const viewer = new Viewer('cesiumContainer', {
  baseLayer: new ImageryLayer(createLabGridImageryProvider()),
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
viewer.scene.globe.depthTestAgainstTerrain = false
viewer.scene.globe.baseColor = Color.fromCssColorString('#102d3b')
viewer.scene.backgroundColor = Color.fromCssColorString('#040b10')

const bridge = new CesiumBridge(viewer)
const resourceStore = createCesiumResourceStore({
  defaultTtlMs: 60 * 60 * 1000,
})
const tools = buildCesiumWebMcpTools(bridge, {
  toolsets: ['view', 'layer', 'tiles'],
  experimentalToolsets: ['perception', 'observer'],
  resourceStore,
})
const toolsByName = new Map(tools.map(tool => [tool.name, tool]))
const perceptionTools = [
  'observeScene',
  'describeScene',
  'querySpatialObjects',
  'getObjectContext',
  'querySpatialRelation',
  'getViewContext',
]

let registration: WebMcpRegistration | undefined
let phase: LabSnapshot['phase'] = 'booting'
let checkResults: CheckResult[] = []
let floodExpanded = false
let sceneLoading: Promise<void> | undefined
let observerState: LabSnapshot['observerState'] = 'empty'
let sceneMode: LabSnapshot['sceneMode'] = 'scenario'
let liveDataset: LiveEarthquakeDataset | undefined
let liveSceneLoading: Promise<LabSnapshot> | undefined
let himalayaFlight: HimalayaFlightExperience | undefined
let flightSceneLoading: Promise<LabSnapshot> | undefined
let flightPlaying = false
let flightObservations: HimalayaFlightObservation[] = []
let chatBusy = false
let flightCompletionAnnounced = false
const hostedAgentEndpoint = import.meta.env.VITE_CHAT_API_URL || DEFAULT_HOSTED_AGENT_ENDPOINT
const chatHistory: HostedAgentMessage[] = []
const chatTools: HostedAgentTool[] = [
  {
    type: 'function',
    function: {
      name: 'start_himalaya_flight',
      description: '开始播放已经根据真实喜马拉雅 DEM 规划好的飞行路线。',
      parameters: {
        type: 'object',
        properties: {
          duration_seconds: {
            type: 'number',
            minimum: 20,
            maximum: 120,
            description: '完整飞行播放时长，默认 52 秒。',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_flight_view',
      description: '仅当用户明确要求第一视角、跟随或全局视角时切换观察偏好。不要为“自动选择视角”调用；运行时场景导演会根据风险事件自动构图。',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['follow', 'pov', 'overview'],
            description: 'follow 为旁观跟随，pov 为飞行器第一视角，overview 为全局路线。',
          },
        },
        required: ['mode'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop_himalaya_flight',
      description: '停止当前喜马拉雅飞行。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_flight_state',
      description: '读取当前路线、飞行进度和观察记录的结构化状态。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
]
const avoidanceDecisionTool: HostedAgentTool = {
  type: 'function',
  function: {
    name: 'choose_flight_maneuver',
    description: '根据有限视域射线数据，为飞行器选择左侧或右侧局部绕行。必须调用此工具。',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['left', 'right'],
          description: '选择净空更可靠的绕行方向。',
        },
        reason: {
          type: 'string',
          description: '用一句话引用射线证据解释选择。',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
      },
      required: ['direction', 'reason'],
      additionalProperties: false,
    },
  },
}

runButton.addEventListener('click', () => void runChecks())
expandFloodButton.addEventListener('click', () => void toggleFlood())
resetButton.addEventListener('click', () => void resetScene())
captureObserverButton.addEventListener('click', () => void captureObserverView())
scenarioModeButton.addEventListener('click', () => void activateScenarioMode())
liveModeButton.addEventListener('click', () => void activateLiveGisMode())
flightModeButton.addEventListener('click', () => void activateHimalayaFlightMode())
flightPlayButton.addEventListener('click', () => void toggleHimalayaFlight())
flightViewFollowButton.addEventListener('click', () => setHimalayaFlightViewMode('follow'))
flightViewPovButton.addEventListener('click', () => setHimalayaFlightViewMode('pov'))
flightViewOverviewButton.addEventListener('click', () => setHimalayaFlightViewMode('overview'))
chatForm.addEventListener('submit', event => {
  event.preventDefault()
  void submitChatMessage(chatInput.value)
})
chatInput.addEventListener('input', resizeChatInput)
chatInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    chatForm.requestSubmit()
  }
})
document.querySelectorAll<HTMLButtonElement>('[data-chat-prompt]').forEach(button => {
  button.addEventListener('click', () => void submitChatMessage(button.dataset.chatPrompt ?? ''))
})

window.__spatialContextLab = {
  getState: snapshot,
  runChecks,
  toggleFlood,
  reset: resetScene,
  captureObserver: captureObserverView,
  loadLiveGis: activateLiveGisMode,
  loadScenario: activateScenarioMode,
  planHimalayaFlight: activateHimalayaFlightMode,
  playHimalayaFlight,
}

try {
  setChatStatus('loading', '正在加载地形')
  await activateHimalayaFlightMode()
  await registerNativeWebMcp()
  if (himalayaFlight) {
    setChatStatus('ready', '地图就绪')
    appendChatMessage('assistant', '喜马拉雅真实地形和基准航线已准备好。直接告诉我任务，我会显示真实模型调用和工具执行记录。')
  } else {
    setChatStatus('error', '地图加载失败')
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  setPhase('failed', '场景初始化失败', message)
  evidenceOutput.textContent = message
  setChatStatus('error', '初始化失败')
  appendChatMessage('error', message)
  console.error('[spatial-context-lab]', error)
}

window.addEventListener('beforeunload', () => {
  disposeHimalayaFlight()
  registration?.unregister()
  bridge.dispose()
  viewer.destroy()
})

async function submitChatMessage(rawMessage: string): Promise<void> {
  const message = rawMessage.trim()
  if (!message || chatBusy) return
  chatBusy = true
  chatInput.value = ''
  resizeChatInput()
  chatSendButton.disabled = true
  appendChatMessage('user', message)
  chatHistory.push({ role: 'user', content: message })
  setChatStatus('thinking', '模型思考中')

  try {
    await runHostedChatLoop()
    if (chatModelStatus.dataset.state === 'thinking') setChatStatus('ready', '模型已响应')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    setChatStatus('error', '模型不可用')
    appendChatMessage('error', `模型请求失败：${detail}`)
  } finally {
    chatBusy = false
    chatSendButton.disabled = false
    chatInput.focus()
  }
}

async function runHostedChatLoop(): Promise<void> {
  for (let iteration = 0; iteration < 5; iteration++) {
    const choice = await requestHostedAgent({
      endpoint: hostedAgentEndpoint,
      messages: [
        {
          role: 'system',
          content: [
            '你是正在控制 CesiumJS 地图的任务 Agent。',
            '只能根据本轮提供的工具声明可执行能力；需要改变地图时必须调用工具，不能假装执行。',
            '工具结果返回后，用简洁中文说明真实发生了什么。',
            '最终回答使用纯文本，不要输出 Markdown 标记。',
            '当前飞行中的射线紧急避障会由另一条模型请求处理，并由本地安全约束复核。',
            '飞行镜头由运行时场景导演自动调度；除非用户明确指定 follow、pov 或 overview，否则不要调用 set_flight_view。',
          ].join('\n'),
        },
        ...chatHistory.slice(-24),
      ],
      tools: chatTools,
    })
    chatEvidence.textContent = `最近模型调用：${choice.model} · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
    chatHistory.push(choice.message)

    const toolCalls = choice.message.tool_calls ?? []
    if (toolCalls.length === 0) {
      appendChatMessage('assistant', choice.message.content?.trim() || '模型没有返回可执行内容。')
      return
    }

    for (const toolCall of toolCalls) {
      appendChatMessage('event', `MODEL ${choice.model} → ${toolCall.function.name}`)
      let result: unknown
      try {
        result = await executeChatTool(toolCall)
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
      chatHistory.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }
  }
  throw new Error('模型工具循环超过安全上限')
}

async function executeChatTool(toolCall: HostedAgentToolCall): Promise<unknown> {
  const params = parseToolArguments(toolCall)
  if (toolCall.function.name === 'start_himalaya_flight') {
    if (!himalayaFlight || sceneMode !== 'flight') await activateHimalayaFlightMode()
    if (!himalayaFlight) throw new Error('喜马拉雅飞行场景尚未就绪')
    if (flightPlaying) return { success: true, state: 'already-flying' }
    const requestedDuration = typeof params.duration_seconds === 'number'
      ? params.duration_seconds
      : 52
    const durationSeconds = Math.min(120, Math.max(20, requestedDuration))
    flightCompletionAnnounced = false
    void playHimalayaFlight({ durationSeconds }).catch(error => {
      const detail = error instanceof Error ? error.message : String(error)
      appendChatMessage('error', `飞行执行失败：${detail}`)
    })
    return {
      success: true,
      state: 'started',
      durationSeconds,
      decisionProvider: 'hosted-model-with-local-safety-validation',
    }
  }
  if (toolCall.function.name === 'set_flight_view') {
    const mode = params.mode
    if (mode !== 'follow' && mode !== 'pov' && mode !== 'overview') {
      throw new Error('mode 必须是 follow、pov 或 overview')
    }
    setHimalayaFlightViewMode(mode)
    return { success: true, mode }
  }
  if (toolCall.function.name === 'stop_himalaya_flight') {
    himalayaFlight?.stop()
    flightPlaying = false
    return { success: true, state: 'stopped' }
  }
  if (toolCall.function.name === 'inspect_flight_state') {
    const state = snapshot()
    return {
      success: true,
      phase: state.phase,
      sceneMode: state.sceneMode,
      flightPlaying,
      flight: state.flight,
    }
  }
  throw new Error(`不支持的地图工具：${toolCall.function.name}`)
}

async function requestModelAvoidanceDecision(
  request: HimalayaFlightDecisionRequest,
): Promise<HimalayaFlightModelDecision> {
  const controller = new AbortController()
  const timeout = window.setTimeout(
    () => controller.abort(new Error('模型决策超过 25 秒')),
    25_000,
  )
  try {
    const choice = await requestHostedAgent({
      endpoint: hostedAgentEndpoint,
      signal: controller.signal,
      messages: [
        {
          role: 'system',
          content: [
            '你是低频局部飞行规划模型。',
            '输入是 Cesium 当前已加载场景中 5 条有限视域射线的结构化测量。',
            '你必须调用 choose_flight_maneuver 选择 left 或 right，并在 reason 中引用左右净空。',
            '不要声称看到了图像；本次只读取结构化射线证据。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            requestId: request.requestId,
            routeProgress: request.progress,
            sensorRangeMeters: request.sensor.rangeMeters,
            readings: request.sensor.readings,
            localSafetySuggestion: request.safetySuggestion,
          }),
        },
      ],
      tools: [avoidanceDecisionTool],
    })
    chatEvidence.textContent = `最近飞行决策模型：${choice.model} · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
    const toolCall = choice.message.tool_calls?.find(call =>
      call.function.name === avoidanceDecisionTool.function.name,
    )
    if (!toolCall) throw new Error('模型没有调用 choose_flight_maneuver')
    const params = parseToolArguments(toolCall)
    if (params.direction !== 'left' && params.direction !== 'right') {
      throw new Error('模型返回了无效绕行方向')
    }
    if (typeof params.reason !== 'string' || params.reason.trim().length === 0) {
      throw new Error('模型没有返回决策理由')
    }
    return {
      direction: params.direction,
      reason: params.reason.trim(),
      model: choice.model,
      ...(typeof params.confidence === 'number'
        ? { confidence: Math.min(1, Math.max(0, params.confidence)) }
        : {}),
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

function handleFlightDecisionEvent(event: HimalayaFlightDecisionEvent): void {
  if (event.state === 'requesting') {
    setChatStatus('thinking', '模型判断障碍')
    appendChatMessage(
      'event',
      `SENSOR → MODEL REQUEST · obstacle ${Math.round(event.request.safetySuggestion.obstacleDistanceMeters)} m · left ${Math.round(event.request.safetySuggestion.leftClearanceMeters)} m · right ${Math.round(event.request.safetySuggestion.rightClearanceMeters)} m`,
    )
    return
  }

  const evidence = event.evidence
  if (!evidence) return
  if (event.state === 'accepted' && evidence.source === 'model') {
    setChatStatus('ready', '模型决策已执行')
    appendChatMessage(
      'assistant',
      `模型 ${evidence.model ?? ''} 选择向${evidence.direction === 'left' ? '左' : '右'}绕行：${evidence.reason}`,
    )
    return
  }

  setChatStatus('ready', '安全控制接管')
  appendChatMessage(
    event.error ? 'error' : 'event',
    `模型决策未直接执行，本地安全控制向${evidence.direction === 'left' ? '左' : '右'}接管。${event.error ? `原因：${event.error}` : evidence.reason}`,
  )
}

function parseToolArguments(toolCall: HostedAgentToolCall): Record<string, unknown> {
  try {
    const value = JSON.parse(toolCall.function.arguments) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('工具参数必须是对象')
    }
    return value as Record<string, unknown>
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`模型工具参数无效：${detail}`, { cause: error })
  }
}

function appendChatMessage(
  kind: 'assistant' | 'user' | 'event' | 'error',
  content: string,
): void {
  const article = document.createElement('article')
  article.className = `chat-message ${kind}`
  const paragraph = document.createElement('p')
  paragraph.textContent = content
  article.append(paragraph)
  chatMessages.append(article)
  chatMessages.scrollTop = chatMessages.scrollHeight
}

function setChatStatus(
  state: 'loading' | 'ready' | 'thinking' | 'error',
  label: string,
): void {
  chatModelStatus.dataset.state = state
  const labelElement = chatModelStatus.querySelector('span')
  if (labelElement) labelElement.textContent = label
}

function resizeChatInput(): void {
  chatInput.style.height = 'auto'
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`
}

async function loadScene(): Promise<void> {
  if (sceneLoading) return sceneLoading
  sceneLoading = (async () => {
    disposeHimalayaFlight()
    viewer.scene.terrainProvider = new EllipsoidTerrainProvider()
    viewer.scene.globe.depthTestAgainstTerrain = false
    sceneMode = 'scenario'
    liveDataset = undefined
    resetObserverCapture()
    setPhase('booting', '正在加载场景', '通过资源句柄写入应急响应 GeoJSON。')
    resourceStore.clear()
    await executeTool('clearAll', {})
    restoreLabBasemap()
    await executeTool('storeResource', {
      kind: 'geojson',
      data: emergencyResponseGeoJson,
      resourceId: SCENE_RESOURCE_ID,
      ttlSeconds: 3600,
    })
    await executeTool('addGeoJsonLayer', {
      id: SCENE_LAYER_ID,
      name: '城市内涝应急响应',
      resourceId: SCENE_RESOURCE_ID,
      style: {
        color: '#ef6a5b',
        opacity: 0.45,
        pointSize: 15,
      },
    })
    viewer.camera.cancelFlight()
    styleSceneEntities()
    await executeTool('setView', {
      longitude: 116.4,
      latitude: 39.9,
      height: 9200,
      heading: 0,
      pitch: -58,
      roll: 0,
    })
    floodExpanded = false
    updateScenarioControls()
    updateModeControls()
    viewer.scene.requestRender()
    await nextFrame()
  })()

  try {
    await sceneLoading
  } finally {
    sceneLoading = undefined
  }
}

async function activateScenarioMode(): Promise<LabSnapshot> {
  await loadScene()
  return runChecks()
}

async function activateLiveGisMode(): Promise<LabSnapshot> {
  if (liveSceneLoading) return liveSceneLoading

  liveSceneLoading = (async () => {
    setControlsDisabled(true)
    liveModeButton.dataset.state = 'loading'
    setPhase(
      'booting',
      '正在连接真实 GIS 服务',
      '先获取 USGS 实时要素；成功后再切换 NASA GIBS 影像与 Viewer 场景。',
    )
    gisServiceStatus.textContent = '正在连接 USGS Earthquake GeoJSON…'

    try {
      const dataset = await fetchLatestEarthquakes({ limit: 50, timeoutMs: 12_000 })
      await loadLiveScene(dataset)
      return await runChecks()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPhase('failed', '实时 GIS 服务暂不可用', '当前场景未被远程请求失败替换，可稍后重试。')
      gisServiceStatus.textContent = `实时服务失败：${message}`
      evidenceOutput.textContent = JSON.stringify({
        source: USGS_EARTHQUAKE_FEED_URL,
        error: message,
        fallback: sceneMode,
      }, null, 2)
      console.error('[live-gis-services]', error)
      return snapshot()
    } finally {
      delete liveModeButton.dataset.state
      setControlsDisabled(false)
    }
  })()

  try {
    return await liveSceneLoading
  } finally {
    liveSceneLoading = undefined
  }
}

async function loadLiveScene(dataset: LiveEarthquakeDataset): Promise<void> {
  setPhase(
    'booting',
    '正在构建实时态势',
    `已获取 ${dataset.featureCount} 个 USGS 地震事件，正在加载 NASA GIBS WMS。`,
  )
  resourceStore.clear()
  disposeHimalayaFlight()
  viewer.scene.terrainProvider = new EllipsoidTerrainProvider()
  viewer.scene.globe.depthTestAgainstTerrain = false
  await executeTool('clearAll', {})
  viewer.imageryLayers.removeAll()
  await executeTool('loadImageryService', {
    id: NASA_GIBS_LAYER_ID,
    name: 'NASA Blue Marble',
    url: NASA_GIBS_WMS_URL,
    serviceType: 'wms',
    layerName: NASA_GIBS_LAYER_NAME,
    opacity: 1,
  })
  await executeTool('storeResource', {
    kind: 'geojson',
    data: dataset.geoJson,
    resourceId: USGS_EARTHQUAKE_RESOURCE_ID,
    ttlSeconds: 120,
  })
  await executeTool('addGeoJsonLayer', {
    id: USGS_EARTHQUAKE_LAYER_ID,
    name: 'USGS M2.5+ Earthquakes · Past Day',
    resourceId: USGS_EARTHQUAKE_RESOURCE_ID,
    style: {
      color: '#ff746a',
      opacity: 0.94,
      pointSize: 14,
    },
  })

  styleEarthquakeEntities(dataset)
  await executeTool('setView', {
    longitude: dataset.strongest.longitude,
    latitude: dataset.strongest.latitude,
    height: 1_500_000,
    heading: 0,
    pitch: -86,
    roll: 0,
  })
  sceneMode = 'live'
  liveDataset = dataset
  resetObserverCapture()
  updateLiveControls(dataset)
  updateModeControls()
  viewer.scene.requestRender()
  await waitForMainSceneReady()
}

async function activateHimalayaFlightMode(): Promise<LabSnapshot> {
  if (flightSceneLoading) return flightSceneLoading

  flightSceneLoading = (async () => {
    setControlsDisabled(true)
    flightModeButton.dataset.state = 'loading'
    setPhase(
      'booting',
      '正在读取喜马拉雅真实地形',
      'ArcGIS World Elevation 将为整条候选走廊返回最高可用 DEM 高程。',
    )
    gisServiceStatus.textContent = '正在连接 ArcGIS World Elevation 3D…'

    try {
      disposeHimalayaFlight()
      flightPovViewport.hidden = true
      flightPovViewport.dataset.state = 'loading'
      flightPovViewport.setAttribute('aria-busy', 'true')
      flightPovStatus.textContent = '规划路线并初始化 AI 独立视角…'
      aiObserverCesiumContainer.replaceChildren()
      resourceStore.clear()
      await executeTool('clearAll', {})
      installHimalayaBasemap(viewer)
      himalayaFlight = await prepareHimalayaFlight(viewer, {
        onProgress: updateHimalayaFlightProgress,
        onObservation: recordHimalayaFlightObservation,
        requestAvoidanceDecision: requestModelAvoidanceDecision,
        onDecision: handleFlightDecisionEvent,
        onCameraChange: handleFlightCameraEvent,
      })
      sceneMode = 'flight'
      liveDataset = undefined
      resetObserverCapture()
      updateFlightControls(himalayaFlight)
      updateModeControls()
      await himalayaFlight.showOverview()
      await waitForMainSceneReady(12_000)
      return await runFlightChecks()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPhase('failed', '喜马拉雅路线规划失败', message)
      gisServiceStatus.textContent = `地形服务或路线规划失败：${message}`
      flightPovViewport.dataset.state = 'failed'
      flightPovViewport.setAttribute('aria-busy', 'false')
      flightPovStatus.textContent = `AI 独立视角初始化失败：${message}`
      evidenceOutput.textContent = JSON.stringify({
        source: ARCGIS_WORLD_ELEVATION_URL,
        error: message,
      }, null, 2)
      console.error('[himalaya-flight]', error)
      return snapshot()
    } finally {
      delete flightModeButton.dataset.state
      setControlsDisabled(false)
    }
  })()

  try {
    return await flightSceneLoading
  } finally {
    flightSceneLoading = undefined
  }
}

async function toggleHimalayaFlight(): Promise<void> {
  if (flightPlaying) {
    himalayaFlight?.stop()
    flightPlaying = false
    flightPlayButton.textContent = '继续 AI 飞行漫游'
    return
  }
  await playHimalayaFlight()
}

async function playHimalayaFlight(
  options: { durationSeconds?: number } = {},
): Promise<LabSnapshot> {
  if (sceneMode !== 'flight' || !himalayaFlight) {
    await activateHimalayaFlightMode()
  }
  const experience = himalayaFlight
  if (!experience) throw new Error('Himalaya flight experience is unavailable')

  flightPlaying = true
  flightPlayButton.textContent = '停止飞行漫游'
  try {
    await experience.play(options)
  } finally {
    if (sceneMode === 'flight') {
      flightPlaying = false
      flightPlayButton.textContent = '再次播放 AI 飞行漫游'
    }
  }
  return snapshot()
}

function updateHimalayaFlightProgress(progress: HimalayaFlightProgress): void {
  if (sceneMode !== 'flight') return
  const percentage = Math.round(progress.progress * 100)
  if (progress.phase === 'flying' && chatModelStatus.dataset.state !== 'thinking') {
    setChatStatus('ready', `飞行 ${percentage}%`)
  } else if (progress.phase === 'completed' && !flightCompletionAnnounced) {
    flightCompletionAnnounced = true
    setChatStatus('ready', '飞行完成')
    const clearance = progress.minimumNoFlyZoneClearanceMeters
    const diagnostics = himalayaFlight?.getDiagnostics()
    appendChatMessage(
      'assistant',
      clearance === undefined
        ? '飞行已完成。蓝色轨迹是实际执行路径；对话中保留了模型决策与镜头调度记录。'
        : `飞行已完成。实际轨迹距禁飞区边界最近 ${Math.round(clearance)} 米，禁飞体内采样 ${diagnostics?.unsafeSampleCount ?? 0} 次；风险解除后镜头已恢复先前的任务观察偏好。`,
    )
  } else if (progress.phase === 'stopped' && flightPlaying) {
    setChatStatus('ready', '飞行已停止')
  }
  flightProgressBar.style.width = `${percentage}%`
  const coordinates = `${progress.sample.longitude.toFixed(4)}, ${progress.sample.latitude.toFixed(4)}`
  if (progress.phase === 'transition') {
    flightProgressText.textContent = '正在进入路线起点'
    mapAssessment.textContent = 'AI 正在进入喜马拉雅飞行走廊'
    flightPovViewport.dataset.state = 'loading'
    flightPovViewport.setAttribute('aria-busy', 'true')
    flightPovStatus.textContent = 'AI POV 正在锁定起点并请求影像、地形…'
  } else if (progress.phase === 'loading') {
    flightProgressText.textContent = '起点预加载中 · 飞行开始后不再因瓦片流式加载暂停'
    mapAssessment.textContent = 'AI 正在预热起点视觉场景'
    flightPovViewport.dataset.state = 'loading'
    flightPovViewport.setAttribute('aria-busy', 'true')
    flightPovStatus.textContent = `PRELOADING START · ${coordinates}`
  } else if (progress.phase === 'flying') {
    flightProgressText.textContent = `${percentage}% · 当前净空 ${Math.round(progress.sample.clearanceMeters)} m`
    mapAssessment.textContent = progress.avoidance
      ? `AI 正在向${progress.avoidance.direction === 'left' ? '左' : '右'}执行局部绕行`
      : `地形感知飞行 ${percentage}%`
    flightPovViewport.dataset.state = 'live'
    flightPovViewport.setAttribute('aria-busy', 'false')
    flightPovStatus.textContent = progress.sceneReady
      ? `LIVE · ${coordinates} · clearance ${Math.round(progress.sample.clearanceMeters)} m`
      : `STREAMING · ${coordinates} · flight continues`
  } else if (progress.phase === 'completed') {
    flightProgressText.textContent = '100% · 整条路线已实际播放'
    mapAssessment.textContent = '喜马拉雅飞行漫游完成'
    flightPovViewport.dataset.state = 'complete'
    flightPovViewport.setAttribute('aria-busy', 'false')
    flightPovStatus.textContent = `OBSERVATION COMPLETE · ${flightObservations.length} checkpoints`
  } else {
    flightProgressText.textContent = '飞行已停止，可从起点重新播放'
    mapAssessment.textContent = '飞行漫游已暂停'
    flightPovViewport.dataset.state = 'idle'
    flightPovViewport.setAttribute('aria-busy', 'false')
    flightPovStatus.textContent = 'AI POV 已暂停，等待重新开始'
  }
  mapAssessmentDetail.textContent = [
    `terrain ${Math.round(progress.sample.terrainHeight)} m`,
    `flight ${Math.round(progress.sample.flightHeight)} m`,
    `clearance ${Math.round(progress.sample.clearanceMeters)} m`,
    `camera ${progress.cameraIntent}`,
    ...(progress.noFlyZoneClearanceMeters !== undefined
      ? [`zone ${Math.round(progress.noFlyZoneClearanceMeters)} m`]
      : []),
    ...(progress.sensor
      ? [`rays ${progress.sensor.readings.length} · nearest ${progress.sensor.nearestHitDistanceMeters === undefined
          ? 'clear'
          : `${Math.round(progress.sensor.nearestHitDistanceMeters)} m ${progress.sensor.nearestHitType}`}`]
      : []),
  ].join(' · ')
}

function handleFlightCameraEvent(event: HimalayaFlightCameraEvent): void {
  if (!event.automatic || sceneMode !== 'flight') return
  appendChatMessage(
    'event',
    event.mode === 'decision'
      ? `WORLD STATE → AUTO VIEW · 已切到避障决策视角：${event.reason}`
      : `WORLD STATE → AUTO VIEW · 已切换为${event.mode === 'follow' ? '跟随' : event.mode}视角：${event.reason}`,
  )
}

function setHimalayaFlightViewMode(mode: HimalayaFlightViewMode): void {
  himalayaFlight?.setViewMode(mode)
  flightViewFollowButton.classList.toggle('active', mode === 'follow')
  flightViewPovButton.classList.toggle('active', mode === 'pov')
  flightViewOverviewButton.classList.toggle('active', mode === 'overview')
  if (sceneMode !== 'flight') return
  const labels: Record<HimalayaFlightViewMode, string> = {
    follow: '旁观视角：看见 AI 观察体与实时视锥',
    pov: 'AI 第一视角：当前相机与 AI 眼睛同步',
    overview: '全局视角：保持路线总览，AI 独立移动',
  }
  flightProgressText.textContent = labels[mode]
}

function recordHimalayaFlightObservation(observation: HimalayaFlightObservation): void {
  flightObservations.push(observation)
  renderHimalayaFlightObservations()
  if (sceneMode !== 'flight') return
  mapAssessment.textContent = observation.kind === 'avoidance'
    ? observation.name
    : `AI 正在观察：${observation.name}`
  mapAssessmentDetail.textContent = [
    `terrain ${Math.round(observation.terrainHeight)} m`,
    `flight ${Math.round(observation.flightHeight)} m`,
    `clearance ${Math.round(observation.clearanceMeters)} m`,
  ].join(' · ')
}

function renderHimalayaFlightObservations(): void {
  flightObservationCount.textContent = `${flightObservations.length} observations`
  if (flightObservations.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = '开始飞行后，AI 会记录有限视域射线、路线锚点和局部重规划决策。'
    flightObservationLog.replaceChildren(empty)
    return
  }

  const items = flightObservations.slice(-5).reverse().map(observation => {
    const item = document.createElement('li')
    const title = document.createElement('strong')
    title.textContent = observation.name
    const detail = document.createElement('span')
    detail.textContent = observation.kind === 'avoidance' && observation.avoidance
      ? `RAY ${Math.round(observation.avoidance.obstacleDistanceMeters)} m · left ${Math.round(observation.avoidance.leftClearanceMeters)} m · right ${Math.round(observation.avoidance.rightClearanceMeters)} m`
      : `DEM ${Math.round(observation.terrainHeight)} m · 净空 ${Math.round(observation.clearanceMeters)} m · ${(observation.progress * 100).toFixed(0)}%`
    item.append(title, detail)
    return item
  })
  flightObservationLog.replaceChildren(...items)
}

function disposeHimalayaFlight(): void {
  himalayaFlight?.dispose()
  himalayaFlight = undefined
  flightPlaying = false
  flightObservations = []
  flightPovViewport.hidden = true
  flightPovViewport.dataset.state = 'idle'
  flightPovViewport.setAttribute('aria-busy', 'false')
  flightPovStatus.textContent = '等待 AI 进入飞行走廊'
  aiObserverCesiumContainer.replaceChildren()
}

async function registerNativeWebMcp(): Promise<void> {
  if (!isWebMcpSupported()) {
    webMcpStatus.textContent = '当前浏览器未启用 WebMCP；页面仍通过同一工具适配层执行评测。'
    return
  }
  registration = await registerCesiumWebMcp(bridge, {
    tools: [],
    experimentalToolsets: ['perception', 'observer'],
  })
  webMcpStatus.textContent = `WebMCP 已注册 ${registration.registered.length} 个 perception / observer 工具。`
}

async function runChecks(): Promise<LabSnapshot> {
  if (sceneMode === 'live') return runLiveChecks()
  if (sceneMode === 'flight') return runFlightChecks()

  setControlsDisabled(true)
  setPhase('running', '正在执行评测', '从真实 Cesium Viewer 重新生成空间快照。')

  try {
    const describe = await executeTool<{
      summary: { objectCount: number }
      objects: SpatialObjectResult[]
    }>('describeScene', { includeObjects: true, limit: 50 })
    const objects = describe.data?.objects ?? []

    const riskQuery = await executeTool<{
      objects: SpatialObjectResult[]
      total: number
    }>('querySpatialObjects', { propertyEquals: { risk: 'high' } })

    const schoolContext = await executeTool<{
      object: SpatialObjectResult
      nearby: Array<{ object: SpatialObjectResult; distanceMeters: number }>
    }>('getObjectContext', {
      objectId: SCHOOL_OBJECT_ID,
      nearbyRadiusMeters: 2500,
      nearbyLimit: 20,
    })

    const within = await executeTool<{
      value: boolean
      quality: string
      basis: string
    }>('querySpatialRelation', {
      subjectId: SCHOOL_OBJECT_ID,
      objectId: FLOOD_OBJECT_ID,
      relation: 'within',
    })

    const nearShelter = await executeTool<{
      value: boolean
      quality: string
      basis: string
    }>('querySpatialRelation', {
      subjectId: SCHOOL_OBJECT_ID,
      objectId: SHELTER_OBJECT_ID,
      relation: 'near',
      nearThresholdMeters: 1800,
    })

    const routeIntersects = await executeTool<{
      value: boolean
      quality: string
      basis: string
    }>('querySpatialRelation', {
      subjectId: PRIMARY_ROUTE_OBJECT_ID,
      objectId: FLOOD_OBJECT_ID,
      relation: 'intersects',
    })

    const viewContext = await executeTool<{
      bounds?: number[]
      objects?: SpatialObjectResult[]
      quality: string
      basis: string
    }>('getViewContext', { includeObjects: true, limit: 50 })

    const expectedWithin = floodExpanded
    const entityObjects = objects.filter(object => object.objectId.startsWith('entity:'))
    checkResults = [
      check(
        'tool-surface',
        '实验工具面保持隔离',
        `${perceptionTools.filter(name => toolsByName.has(name)).length}/6 个 perception 工具可用`,
        perceptionTools.every(name => toolsByName.has(name)),
        'describeScene',
        perceptionTools,
      ),
      check(
        'scene-inventory',
        '复杂场景被标准化为 13 个对象',
        '1 个受管图层 + 12 个业务要素',
        describe.success && describe.data?.summary.objectCount === 13,
        'describeScene',
        describe,
      ),
      check(
        'risk-query',
        '高风险对象可按属性检索',
        'risk=high 只返回洪水预测范围',
        riskQuery.success
          && riskQuery.data?.total === 1
          && riskQuery.data.objects[0]?.objectId === FLOOD_OBJECT_ID,
        'querySpatialObjects',
        riskQuery,
      ),
      check(
        'object-context',
        '学校上下文包含医疗与安置能力',
        '2.5 km 内发现市立医院和应急避难点',
        schoolContext.success
          && Boolean(schoolContext.data?.nearby.some(item => item.object.objectId === HOSPITAL_OBJECT_ID))
          && Boolean(schoolContext.data?.nearby.some(item => item.object.objectId === SHELTER_OBJECT_ID)),
        'getObjectContext',
        schoolContext,
      ),
      check(
        'within-relation',
        expectedWithin ? '扩展预警区已覆盖学校' : '学校当前位于预警区外',
        `value=${String(within.data?.value)} · ${within.data?.quality ?? 'unknown'} · ${within.data?.basis ?? 'unknown'}`,
        within.success
          && within.data?.value === expectedWithin
          && within.data.quality === 'exact'
          && within.data.basis === 'point-in-polygon',
        'querySpatialRelation',
        within,
      ),
      check(
        'near-relation',
        '学校与避难点距离满足阈值',
        `value=${String(nearShelter.data?.value)} · 1.8 km 阈值`,
        nearShelter.success
          && nearShelter.data?.value === true
          && nearShelter.data.quality === 'exact'
          && nearShelter.data.basis === 'geodesic-point',
        'querySpatialRelation',
        nearShelter,
      ),
      check(
        'approximate-relation',
        floodExpanded ? '主疏散路线受到洪水范围影响' : '主疏散路线仍避开洪水范围',
        `value=${String(routeIntersects.data?.value)} · ${routeIntersects.data?.quality ?? 'unknown'} · ${routeIntersects.data?.basis ?? 'unknown'}`,
        routeIntersects.success
          && routeIntersects.data?.value === floodExpanded
          && routeIntersects.data.quality === 'approximate'
          && routeIntersects.data.basis === 'bounding-box',
        'querySpatialRelation',
        routeIntersects,
      ),
      check(
        'view-context',
        '当前视野可以反查空间对象',
        `${viewContext.data?.objects?.length ?? 0} 个对象 · ${viewContext.data?.basis ?? 'unknown'}`,
        viewContext.success
          && Array.isArray(viewContext.data?.bounds)
          && Boolean(viewContext.data?.objects?.some(object => object.objectId === SCHOOL_OBJECT_ID))
          && viewContext.data?.quality !== 'unknown',
        'getViewContext',
        viewContext,
      ),
      check(
        'lineage',
        '数据血缘贯穿资源、图层与对象',
        `${SCENE_RESOURCE_ID} → ${SCENE_LAYER_ID} → entity:*`,
        entityObjects.length === 12
          && entityObjects.every(object =>
            object.resourceId === SCENE_RESOURCE_ID && object.layerId === SCENE_LAYER_ID,
          ),
        'describeScene',
        entityObjects,
      ),
    ]

    const passed = checkResults.filter(result => result.passed).length
    renderChecks()
    toolMetric.textContent = `${perceptionTools.filter(name => toolsByName.has(name)).length}/6`
    checkMetric.textContent = `${passed}/${checkResults.length}`
    objectMetric.textContent = String(describe.data?.summary.objectCount ?? '—')
    setPhase(
      passed === checkResults.length ? 'passed' : 'failed',
      passed === checkResults.length ? '全部评测通过' : '存在未通过项',
      `${passed}/${checkResults.length} 项断言通过；点击任一检查可查看原始证据。`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    checkResults = [check('runtime-error', '评测执行失败', message, false, 'runtime', { error: message })]
    renderChecks()
    checkMetric.textContent = '0/1'
    setPhase('failed', '评测执行失败', message)
    console.error('[spatial-context-lab]', error)
  } finally {
    setControlsDisabled(false)
  }

  return snapshot()
}

async function runLiveChecks(): Promise<LabSnapshot> {
  const dataset = liveDataset
  if (!dataset) throw new Error('Live GIS dataset is not loaded')

  setControlsDisabled(true)
  setPhase(
    'running',
    '正在验证实时服务链路',
    '从当前 Viewer 反查 NASA 影像、USGS 要素、空间对象与目标视野。',
  )

  try {
    const describe = await executeTool<{
      summary: { objectCount: number }
      objects: SpatialObjectResult[]
    }>('describeScene', { includeObjects: true, limit: 100 })
    const objects = describe.data?.objects ?? []

    const earthquakes = await executeTool<{
      objects: SpatialObjectResult[]
      total: number
    }>('querySpatialObjects', {
      propertyEquals: { semanticType: 'earthquake' },
      limit: 100,
    })

    const strongestContext = await executeTool<{
      object: SpatialObjectResult
      nearby: Array<{ object: SpatialObjectResult; distanceMeters: number }>
    }>('getObjectContext', {
      objectId: dataset.strongest.objectId,
      nearbyRadiusMeters: 750_000,
      nearbyLimit: 20,
    })

    const viewContext = await executeTool<{
      bounds?: number[]
      objects?: SpatialObjectResult[]
      quality: string
      basis: string
    }>('getViewContext', { includeObjects: true, limit: 100 })

    const eventObjects = objects.filter(object =>
      object.objectId.startsWith('entity:') && object.layerId === USGS_EARTHQUAKE_LAYER_ID,
    )
    const liveLayerIds = new Set(objects.filter(object => object.objectId.startsWith('layer:'))
      .map(object => object.layerId))
    const imageryLayer = bridge.layerManager.getCesiumRefs(NASA_GIBS_LAYER_ID)?.imageryLayer
    const strongestMagnitude = Number(strongestContext.data?.object.properties?.magnitude)
    const strongestDepth = Number(strongestContext.data?.object.properties?.depthKm)
    const generatedAtMs = dataset.generatedAt ? Date.parse(dataset.generatedAt) : Number.NaN
    const feedAgeMs = Date.now() - generatedAtMs

    checkResults = [
      check(
        'tool-surface',
        '实验工具面保持隔离',
        `${perceptionTools.filter(name => toolsByName.has(name)).length}/6 个 perception 工具可用`,
        perceptionTools.every(name => toolsByName.has(name)),
        'describeScene',
        perceptionTools,
      ),
      check(
        'live-services',
        '两个权威 GIS 服务已进入 Viewer',
        'NASA GIBS WMS 影像 + USGS 实时 GeoJSON',
        liveLayerIds.has(NASA_GIBS_LAYER_ID)
          && liveLayerIds.has(USGS_EARTHQUAKE_LAYER_ID)
          && Boolean(imageryLayer && viewer.imageryLayers.contains(imageryLayer)),
        'loadImageryService',
        {
          nasa: NASA_GIBS_WMS_URL,
          usgs: USGS_EARTHQUAKE_FEED_URL,
          layers: [...liveLayerIds],
        },
      ),
      check(
        'live-inventory',
        `${dataset.featureCount} 个实时地震被标准化为空间对象`,
        `2 个服务图层 + ${dataset.featureCount} 个 USGS 事件`,
        describe.success
          && describe.data?.summary.objectCount === dataset.featureCount + 2
          && earthquakes.success
          && earthquakes.data?.total === dataset.featureCount
          && eventObjects.length === dataset.featureCount,
        'querySpatialObjects',
        { describe, earthquakes },
      ),
      check(
        'strongest-event',
        `最强事件 M${dataset.strongest.magnitude.toFixed(1)} 可由稳定 ID 定位`,
        dataset.strongest.name,
        strongestContext.success
          && strongestContext.data?.object.objectId === dataset.strongest.objectId
          && strongestMagnitude === dataset.strongest.magnitude,
        'getObjectContext',
        strongestContext,
      ),
      check(
        'depth-semantics',
        'USGS 深度未被误当作 Cesium 高程',
        `地表定位 · depthKm=${dataset.strongest.depthKm.toFixed(1)}`,
        strongestDepth === dataset.strongest.depthKm
          && strongestContext.data?.object.geometryQuality !== 'unknown',
        'getObjectContext',
        strongestContext.data?.object,
      ),
      check(
        'live-view-context',
        '当前相机视野包含最强事件',
        `${viewContext.data?.objects?.length ?? 0} 个可见对象 · ${viewContext.data?.basis ?? 'unknown'}`,
        viewContext.success
          && Array.isArray(viewContext.data?.bounds)
          && Boolean(viewContext.data?.objects?.some(
            object => object.objectId === dataset.strongest.objectId,
          ))
          && viewContext.data?.quality !== 'unknown',
        'getViewContext',
        viewContext,
      ),
      check(
        'live-lineage',
        '实时数据血缘贯穿资源、图层与事件',
        `${USGS_EARTHQUAKE_RESOURCE_ID} → ${USGS_EARTHQUAKE_LAYER_ID} → entity:*`,
        eventObjects.length === dataset.featureCount
          && eventObjects.every(object =>
            object.resourceId === USGS_EARTHQUAKE_RESOURCE_ID
            && object.layerId === USGS_EARTHQUAKE_LAYER_ID,
          ),
        'describeScene',
        eventObjects,
      ),
      check(
        'feed-freshness',
        'USGS 实时 Feed 处于可接受的新鲜度',
        dataset.generatedAt
          ? `${Math.max(0, Math.round(feedAgeMs / 60_000))} 分钟前生成`
          : '缺少 generatedAt',
        Number.isFinite(generatedAtMs) && feedAgeMs >= -5 * 60_000 && feedAgeMs <= 15 * 60_000,
        'fetch',
        {
          generatedAt: dataset.generatedAt,
          checkedAt: new Date().toISOString(),
          feedAgeMs,
        },
      ),
    ]

    const passed = checkResults.filter(result => result.passed).length
    renderChecks()
    toolMetric.textContent = `${perceptionTools.filter(name => toolsByName.has(name)).length}/6`
    checkMetric.textContent = `${passed}/${checkResults.length}`
    objectMetric.textContent = String(describe.data?.summary.objectCount ?? '—')
    setPhase(
      passed === checkResults.length ? 'passed' : 'failed',
      passed === checkResults.length ? '实时 GIS 链路验证通过' : '实时链路存在异常项',
      `${passed}/${checkResults.length} 项断言通过；结果来自当前远程服务快照。`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    checkResults = [check('runtime-error', '实时链路评测失败', message, false, 'runtime', { error: message })]
    renderChecks()
    checkMetric.textContent = '0/1'
    setPhase('failed', '实时链路评测失败', message)
    console.error('[live-gis-checks]', error)
  } finally {
    setControlsDisabled(false)
  }

  return snapshot()
}

async function runFlightChecks(): Promise<LabSnapshot> {
  const experience = himalayaFlight
  if (!experience) throw new Error('Himalaya flight plan is not loaded')
  const { plan } = experience

  setControlsDisabled(true)
  setPhase(
    'running',
    '正在验证地形感知路线',
    '逐点检查真实 DEM、最低净空、爬升角、下降角与朴素路线的撞山风险。',
  )

  try {
    const plannedRoute = viewer.entities.getById('himalaya-flight-planned-route')
    const naiveRoute = viewer.entities.getById('himalaya-flight-naive-route')
    const metrics = plan.metrics
    const terrainMaximum = metrics.terrainHeightRange[1]

    checkResults = [
      check(
        'terrain-source',
        '路线高程来自公开 DEM 服务',
        'ArcGIS World Elevation 3D · highest available detail',
        experience.sourceUrl === ARCGIS_WORLD_ELEVATION_URL
          && viewer.scene.terrainProvider === experience.terrainProvider,
        'sampleTerrainMostDetailed',
        {
          source: experience.sourceUrl,
          sampledAt: experience.sampledAt,
        },
      ),
      check(
        'terrain-samples',
        `${plan.samples.length} 个高程样本覆盖整条飞行走廊`,
        `${(metrics.distanceMeters / 1_000).toFixed(1)} km · 自适应路线采样`,
        plan.samples.length >= 40 && metrics.distanceMeters >= 50_000,
        'densifyFlightRoute',
        plan.samples,
      ),
      check(
        'rolling-ray-awareness',
        '有限视域射线进入滚动重规划闭环',
        `${experience.awareness.rayCount} rays · ${(experience.awareness.rangeMeters / 1_000).toFixed(0)} km · dynamic obstacle`,
        experience.awareness.rayCount >= 5
          && experience.awareness.rangeMeters >= 10_000
          && experience.awareness.rollingReplan
          && experience.awareness.dynamicObstacle,
        'Cesium.Ray + Globe.pick + IntersectionTests.raySphere',
        experience.awareness,
      ),
      check(
        'mountain-relief',
        '真实样本捕获到喜马拉雅高山起伏',
        `最高地形 ${Math.round(terrainMaximum)} m`,
        terrainMaximum >= 7_500,
        'sampleTerrainMostDetailed',
        metrics.terrainHeightRange,
      ),
      check(
        'clearance',
        '规划路线全程满足最低净空',
        `最低 ${Math.round(metrics.minimumClearanceMeters)} m · 约束 ${plan.options.clearanceMeters} m`,
        metrics.minimumClearanceMeters + 0.1 >= plan.options.clearanceMeters,
        'buildTerrainAwareFlightPlan',
        {
          minimumClearanceMeters: metrics.minimumClearanceMeters,
          requiredClearanceMeters: plan.options.clearanceMeters,
        },
      ),
      check(
        'naive-collision',
        '未感知地形的朴素路线会穿入山体',
        `${metrics.naiveViolationCount} 个采样点净空不足 · 最低 ${Math.round(metrics.naiveMinimumClearanceMeters)} m`,
        metrics.naiveViolationCount > 0 && metrics.naiveMinimumClearanceMeters < 0,
        'validateRoute',
        {
          violationCount: metrics.naiveViolationCount,
          minimumClearanceMeters: metrics.naiveMinimumClearanceMeters,
        },
      ),
      check(
        'flight-envelope',
        '爬升与下降角保持在飞行包线内',
        `爬升 ${metrics.maximumClimbAngleDegrees.toFixed(1)}° · 下降 ${metrics.maximumDescentAngleDegrees.toFixed(1)}°`,
        metrics.maximumClimbAngleDegrees <= plan.options.maxClimbAngleDegrees + 0.01
          && metrics.maximumDescentAngleDegrees <= plan.options.maxDescentAngleDegrees + 0.01,
        'buildTerrainAwareFlightPlan',
        {
          maximumClimbAngleDegrees: metrics.maximumClimbAngleDegrees,
          maximumDescentAngleDegrees: metrics.maximumDescentAngleDegrees,
          options: plan.options,
        },
      ),
      check(
        'route-rendering',
        '朴素路线与地形感知路线同时进入当前 Viewer',
        '红色虚线 = 未感知 · 绿色实线 = 已规划',
        Boolean(plannedRoute?.polyline && naiveRoute?.polyline),
        'viewer.entities',
        {
          plannedRouteId: plannedRoute?.id,
          naiveRouteId: naiveRoute?.id,
        },
      ),
    ]

    const passed = checkResults.filter(result => result.passed).length
    renderChecks()
    toolMetric.textContent = 'DEM'
    checkMetric.textContent = `${passed}/${checkResults.length}`
    objectMetric.textContent = String(plan.samples.length)
    setPhase(
      passed === checkResults.length ? 'passed' : 'failed',
      passed === checkResults.length ? '喜马拉雅路线验证通过' : '路线存在未通过项',
      `${passed}/${checkResults.length} 项约束通过；现在可以实际播放整条飞行路线。`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    checkResults = [check('runtime-error', '路线验证失败', message, false, 'runtime', { error: message })]
    renderChecks()
    checkMetric.textContent = '0/1'
    setPhase('failed', '路线验证失败', message)
    console.error('[himalaya-flight-checks]', error)
  } finally {
    setControlsDisabled(false)
  }

  return snapshot()
}

async function toggleFlood(): Promise<LabSnapshot> {
  if (sceneMode !== 'scenario') {
    throw new Error('Flood mutation is only available in the deterministic scenario')
  }
  const refs = bridge.layerManager.getCesiumRefs(SCENE_LAYER_ID)
  const dataSource = refs?.dataSource
  const flood = dataSource?.entities.getById('flood_zone_1')
  if (!flood?.polygon) throw new Error('Flood-zone entity is unavailable')
  resetObserverCapture()
  floodExpanded = !floodExpanded
  const ring = floodExpanded ? FLOOD_EXPANDED_RING : FLOOD_BASELINE_RING
  const positions = Cartesian3.fromDegreesArray(ring.flat())
  flood.polygon.hierarchy = new ConstantProperty(new PolygonHierarchy(positions))
  flood.name = floodExpanded ? '洪水预警区（扩大）' : '洪水预警区'
  if (flood.properties) {
    flood.properties.name = new ConstantProperty(flood.name)
    flood.properties.forecastStage = new ConstantProperty(floodExpanded ? 'expanded' : 'baseline')
  }
  for (const outline of refs?.polygonOutlines?.get(flood) ?? []) {
    if (outline.polyline) outline.polyline.positions = new ConstantProperty(positions)
  }
  updateScenarioControls()
  viewer.scene.requestRender()
  await nextFrame()
  return runChecks()
}

async function resetScene(): Promise<LabSnapshot> {
  return activateScenarioMode()
}

async function captureObserverView(): Promise<LabSnapshot> {
  setControlsDisabled(true)
  observerState = 'loading'
  observerCard.dataset.state = 'loading'
  observerStatus.textContent = 'Observer Viewer 正在加载并稳定场景…'
  observerMeta.textContent = '等待数据源、地球瓦片与有效像素连续就绪'
  observerProof.textContent = 'RENDERING'

  try {
    const targetObjectId = sceneMode === 'live'
      ? liveDataset?.strongest.objectId
      : SCHOOL_OBJECT_ID
    if (!targetObjectId) throw new Error('Observer target is unavailable')
    const result = await executeTool<GroundedObservationData>('observeScene', {
      scope: 'view',
      includeObjects: true,
      imageMode: 'always',
      targetObjectId,
      preset: sceneMode === 'live' ? 'overview' : 'detail',
      ...(sceneMode === 'live' ? { range: 650_000 } : {}),
      imageWidth: 1024,
      imageHeight: 576,
    })
    const capture = result.data?.visual.evidence
    if (!result.success || !capture?.dataUrl) {
      throw new Error(
        result.error
          ?? result.data?.visual.reason
          ?? 'Grounded observation returned no image',
      )
    }

    await displayObserverImage(capture.dataUrl)
    observerState = 'ready'
    observerCard.dataset.state = 'ready'
    observerProof.textContent = capture.userCameraUnchanged
      ? 'USER CAMERA UNCHANGED'
      : 'USER CAMERA CHANGED'
    observerStatus.textContent = sceneMode === 'live'
      ? `USGS 最强事件已观察 · ${capture.objectCount} 个可见对象`
      : `Grounded Observation 已完成 · ${capture.objectCount} 个可见对象`
    observerMeta.textContent = [
      `${capture.width} × ${capture.height}`,
      `${capture.target.preset ?? 'custom'} 视角`,
      `场景 ${result.data?.readiness.state ?? 'unknown'}`,
      `revision ${result.data?.freshness.snapshotRevision ?? '—'}`,
      `${capture.readiness.framesRendered} 帧后就绪`,
    ].join(' · ')
  } catch (error) {
    observerState = 'failed'
    observerCard.dataset.state = 'failed'
    observerProof.textContent = 'CAPTURE FAILED'
    observerStatus.textContent = '独立视角拍摄失败'
    observerMeta.textContent = error instanceof Error ? error.message : String(error)
    console.error('[observer-capture]', error)
  } finally {
    setControlsDisabled(false)
  }

  return snapshot()
}

function resetObserverCapture(): void {
  observerState = 'empty'
  observerCard.dataset.state = 'empty'
  observerImage.hidden = true
  observerImage.removeAttribute('src')
  observerPlaceholder.hidden = false
  observerProof.textContent = 'CAMERA ISOLATED'
  observerStatus.textContent = sceneMode === 'live' ? '等待拍摄最强地震' : '尚未拍摄'
  observerMeta.textContent = sceneMode === 'live'
    ? '1024 × 576 · USGS 空间对象 · 用户相机隔离'
    : '1024 × 576 · 派生空间快照'
}

function displayObserverImage(dataUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    observerImage.onload = () => {
      observerImage.onload = null
      observerImage.onerror = null
      observerImage.hidden = false
      observerPlaceholder.hidden = true
      resolve()
    }
    observerImage.onerror = () => {
      observerImage.onload = null
      observerImage.onerror = null
      reject(new Error('Observer PNG could not be decoded'))
    }
    observerImage.src = dataUrl
  })
}

function styleSceneEntities(): void {
  const refs = bridge.layerManager.getCesiumRefs(SCENE_LAYER_ID)
  const dataSource = refs?.dataSource
  if (!dataSource) throw new Error('Emergency GeoJSON data source was not registered')
  const auxiliaryIds = new Set(
    [...(refs?.polygonOutlines?.values() ?? [])]
      .flatMap(outlines => outlines.map(outline => outline.id)),
  )
  const pointStyles: Record<string, { color: string; scale: number }> = {
    school: { color: '#48d9b0', scale: 0.82 },
    hospital: { color: '#53a8ff', scale: 0.88 },
    shelter: { color: '#67e8d0', scale: 0.82 },
    'fire-station': { color: '#ff9f43', scale: 0.8 },
    'pump-station': { color: '#b28dff', scale: 0.76 },
    'water-gauge': { color: '#36c5f0', scale: 0.72 },
    bridge: { color: '#ffd166', scale: 0.74 },
  }

  for (const entity of dataSource.entities.values) {
    if (auxiliaryIds.has(entity.id)) continue
    const semanticType = String(entity.properties?.semanticType?.getValue(JulianDate.now()) ?? '')
    const entityName = String(entity.properties?.name?.getValue(JulianDate.now()) ?? entity.name ?? '')

    if (entity.point || entity.billboard) {
      const pointStyle = pointStyles[semanticType] ?? { color: '#d6e3e3', scale: 0.72 }
      const color = Color.fromCssColorString(pointStyle.color)
      if (entity.point) {
        entity.point.color = new ConstantProperty(color)
        entity.point.outlineColor = new ConstantProperty(Color.fromCssColorString('#061018'))
        entity.point.outlineWidth = new ConstantProperty(3)
        entity.point.pixelSize = new ConstantProperty(Math.round(pointStyle.scale * 20))
      }
      if (entity.billboard) {
        entity.billboard.color = new ConstantProperty(color)
        entity.billboard.scale = new ConstantProperty(pointStyle.scale)
      }
      entity.label = new LabelGraphics({
        text: entityName,
        font: '600 13px Inter, sans-serif',
        fillColor: Color.WHITE,
        showBackground: true,
        backgroundColor: Color.fromCssColorString('#061018').withAlpha(0.84),
        backgroundPadding: new Cartesian2(8, 5),
        pixelOffset: new Cartesian2(0, -27),
        verticalOrigin: VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 100000),
      })
    }

    if (entity.polygon) {
      const polygonColor = semanticType === 'risk-zone' ? '#ff6259' : '#4d92b8'
      const alpha = semanticType === 'risk-zone' ? 0.36 : 0.16
      entity.polygon.material = new ColorMaterialProperty(Color.fromCssColorString(polygonColor).withAlpha(alpha))
    }

    if (entity.polyline) {
      if (semanticType === 'river') {
        entity.polyline.material = new ColorMaterialProperty(Color.fromCssColorString('#2f9ed8').withAlpha(0.82))
        entity.polyline.width = new ConstantProperty(13)
      } else if (semanticType === 'evacuation-route') {
        const primary = entity.properties?.priority?.getValue(JulianDate.now()) === 'primary'
        const color = Color.fromCssColorString(primary ? '#ffd166' : '#6fe0b7')
        entity.polyline.material = primary
          ? new ColorMaterialProperty(color)
          : new PolylineDashMaterialProperty({ color, dashLength: 18 })
        entity.polyline.width = new ConstantProperty(primary ? 7 : 5)
      }
    }
  }

  for (const [owner, outlines] of refs?.polygonOutlines ?? []) {
    const semanticType = String(owner.properties?.semanticType?.getValue(JulianDate.now()) ?? '')
    const color = Color.fromCssColorString(semanticType === 'risk-zone' ? '#ff746a' : '#58a7cc')
    for (const outline of outlines) {
      if (!outline.polyline) continue
      outline.polyline.material = new ColorMaterialProperty(color)
      outline.polyline.width = new ConstantProperty(semanticType === 'risk-zone' ? 3 : 2)
    }
  }
}

function styleEarthquakeEntities(dataset: LiveEarthquakeDataset): void {
  const dataSource = bridge.layerManager.getCesiumRefs(USGS_EARTHQUAKE_LAYER_ID)?.dataSource
  if (!dataSource) throw new Error('USGS GeoJSON data source was not registered')

  for (const entity of dataSource.entities.values) {
    const magnitude = Number(entity.properties?.magnitude?.getValue(JulianDate.now()) ?? 0)
    const eventId = String(entity.properties?.eventId?.getValue(JulianDate.now()) ?? entity.id)
    const place = String(entity.properties?.name?.getValue(JulianDate.now()) ?? entity.name ?? eventId)
    const isStrongest = eventId === dataset.strongest.eventId
    const color = Color.fromCssColorString(
      magnitude >= 5 ? '#ff746a' : magnitude >= 4 ? '#f4bd67' : '#48d9b0',
    )
    const diameter = Math.round(12 + Math.max(0, magnitude - 2.5) * 6)

    if (entity.billboard) {
      entity.billboard.color = new ConstantProperty(color)
      entity.billboard.width = new ConstantProperty(diameter)
      entity.billboard.height = new ConstantProperty(diameter)
      entity.billboard.scale = new ConstantProperty(isStrongest ? 1.25 : 1)
      entity.billboard.disableDepthTestDistance = new ConstantProperty(Number.POSITIVE_INFINITY)
    }
    if (entity.point) {
      entity.point.color = new ConstantProperty(color)
      entity.point.pixelSize = new ConstantProperty(diameter)
      entity.point.outlineColor = new ConstantProperty(Color.fromCssColorString('#061018'))
      entity.point.outlineWidth = new ConstantProperty(isStrongest ? 4 : 2)
    }

    if (isStrongest || magnitude >= 5) {
      entity.label = new LabelGraphics({
        text: `M${magnitude.toFixed(1)} · ${place}`,
        font: '700 14px Inter, sans-serif',
        fillColor: Color.WHITE,
        showBackground: true,
        backgroundColor: Color.fromCssColorString('#061018').withAlpha(0.88),
        backgroundPadding: new Cartesian2(9, 6),
        pixelOffset: new Cartesian2(0, -30),
        verticalOrigin: VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 4_000_000),
      })
    }
  }
}

function renderChecks(): void {
  checksElement.replaceChildren(...checkResults.map((result, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `check-item ${result.passed ? 'passed' : 'failed'}`
    button.dataset.testid = `check-${result.id}`
    button.innerHTML = `
      <span class="check-icon" aria-hidden="true">${result.passed ? '✓' : '!'}</span>
      <span class="check-copy">
        <strong>${escapeHtml(result.label)}</strong>
        <small>${escapeHtml(result.tool)} · ${escapeHtml(result.detail)}</small>
      </span>
      <span class="check-arrow" aria-hidden="true">↗</span>
    `
    button.addEventListener('click', () => {
      evidenceOutput.textContent = JSON.stringify(result.output, null, 2)
      document.querySelector('.evidence-panel')?.setAttribute('open', '')
    })
    if (index === 0) evidenceOutput.textContent = JSON.stringify(result.output, null, 2)
    return button
  }))
}

function check(
  id: string,
  label: string,
  detail: string,
  passed: boolean,
  tool: string,
  output: unknown,
): CheckResult {
  return { id, label, detail, passed, tool, output }
}

function setPhase(
  nextPhase: LabSnapshot['phase'],
  title: string,
  detail: string,
): void {
  phase = nextPhase
  phaseDot.dataset.phase = nextPhase
  phaseTitle.textContent = title
  phaseDetail.textContent = detail
}

function setControlsDisabled(disabled: boolean): void {
  runButton.disabled = disabled
  expandFloodButton.disabled = disabled
  resetButton.disabled = disabled
  captureObserverButton.disabled = disabled
  scenarioModeButton.disabled = disabled
  liveModeButton.disabled = disabled
  flightModeButton.disabled = disabled
  flightPlayButton.disabled = disabled
  flightViewFollowButton.disabled = disabled
  flightViewPovButton.disabled = disabled
  flightViewOverviewButton.disabled = disabled
}

function updateScenarioControls(): void {
  flightCommandCard.hidden = true
  flightPlayButton.hidden = true
  flightPovViewport.hidden = true
  observerCard.hidden = false
  globeStage.setAttribute('aria-label', 'Cesium flood-risk assessment scene')
  mapBrandTitle.textContent = '应急态势推演'
  mapBrandSubtitle.textContent = 'Spatial Context Experiment'
  sceneSourceChip.textContent = 'LIVE SCENE'
  sceneLegend.innerHTML = `
    <span><i class="legend-dot facility"></i>关键设施</span>
    <span><i class="legend-dot response"></i>救援与安置</span>
    <span><i class="legend-line route"></i>疏散路线</span>
    <span><i class="legend-line river"></i>河道</span>
    <span><i class="legend-area flood"></i>洪水预警区</span>
  `
  spatialReference.textContent = 'EPSG:4326'
  sceneObjectSummary.textContent = '12 个业务对象'
  panelEyebrow.textContent = 'Experimental · perception'
  panelTitle.textContent = '洪水风险研判'
  panelIntro.textContent = '验证 Agent 能否基于真实 Viewer，解释场景、证据与风险变化。'
  versionChip.textContent = 'SC / 01'
  scenarioBadge.textContent = floodExpanded ? '预警范围扩大' : '初始预警范围'
  scenarioBadge.dataset.variant = floodExpanded ? 'mutated' : 'baseline'
  forecastTime.textContent = floodExpanded ? '08:45 模型快照' : '08:30 模型快照'
  expandFloodButton.textContent = floodExpanded ? '恢复初始预警范围' : '模拟洪水范围扩大'
  riskStateCard.dataset.risk = floodExpanded ? 'high' : 'watch'
  riskLabel.textContent = floodExpanded ? 'HIGH RISK' : 'MONITORING'
  riskTitle.textContent = floodExpanded ? '学校进入洪水预警区' : '学校暂未进入预警区'
  riskDetail.textContent = floodExpanded
    ? '最新预测边界已覆盖滨河学校，并与东向主疏散路线相交，应切换备用路线并启动安置。'
    : '当前预测边界距学校约 400 米，主疏散路线可用，水位仍在持续上涨。'
  mapAssessment.textContent = floodExpanded ? '学校及主疏散路线受到影响' : '学校位于预警边界之外'
  mapAssessmentDetail.textContent = floodExpanded
    ? 'Spatial Context 重新计算：within = true · exact'
    : 'Spatial Context 当前结论：within = false · exact'
  metricOneLabel.textContent = '重点转移'
  metricOneValue.textContent = '800'
  metricOneDetail.textContent = '名在校人员'
  metricTwoLabel.textContent = '安置能力'
  metricTwoValue.textContent = '1,200'
  metricTwoDetail.textContent = '个避难床位'
  metricThreeLabel.textContent = '疏散通道'
  metricThreeValue.textContent = '2'
  metricThreeDetail.textContent = '条候选路线'
  metricFourLabel.textContent = '当前水位'
  metricFourValue.textContent = '4.7m'
  metricFourDetail.textContent = '距警戒 0.4m'
  expandFloodButton.hidden = false
  resetButton.textContent = '恢复初始态势'
  runButton.textContent = '重新运行评测'
  captureObserverButton.textContent = '执行一次 AI 现场观察'
  gisServiceStatus.textContent = '确定性场景使用本地 GeoJSON，不依赖外部服务。'
}

function updateLiveControls(dataset: LiveEarthquakeDataset): void {
  flightCommandCard.hidden = true
  flightPlayButton.hidden = true
  flightPovViewport.hidden = true
  observerCard.hidden = false
  const generatedTime = dataset.generatedAt
    ? new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(dataset.generatedAt))
    : '未知时间'
  const occurredTime = dataset.strongest.occurredAt
    ? new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(dataset.strongest.occurredAt))
    : '时间未知'

  globeStage.setAttribute('aria-label', 'Cesium live global earthquake GIS scene')
  mapBrandTitle.textContent = '全球地震实时态势'
  mapBrandSubtitle.textContent = 'USGS GeoJSON · NASA GIBS WMS'
  sceneSourceChip.textContent = 'USGS + NASA LIVE'
  sceneLegend.innerHTML = `
    <span><i class="legend-dot quake-major"></i>M5.0+</span>
    <span><i class="legend-dot quake-moderate"></i>M4.0–4.9</span>
    <span><i class="legend-dot facility"></i>M2.5–3.9</span>
    <span><i class="legend-dot imagery"></i>NASA GIBS 影像</span>
  `
  spatialReference.textContent = 'EPSG:4326 · WMS'
  forecastTime.textContent = `${generatedTime} Feed 快照`
  sceneObjectSummary.textContent = `${dataset.featureCount} 个实时事件`
  panelEyebrow.textContent = 'Live services · spatial context'
  panelTitle.textContent = '全球地震态势'
  panelIntro.textContent = '直接消费权威 GIS 服务，让 Agent 对当前远程数据执行检索、取景与证据追踪。'
  versionChip.textContent = 'LIVE / 01'
  riskStateCard.dataset.risk = 'live'
  riskLabel.textContent = `M${dataset.strongest.magnitude.toFixed(1)} STRONGEST`
  riskTitle.textContent = dataset.strongest.name
  riskDetail.textContent = `${occurredTime} · 深度 ${dataset.strongest.depthKm.toFixed(1)} km · USGS 过去 24 小时 M2.5+ Feed。`
  mapAssessment.textContent = `最强事件 M${dataset.strongest.magnitude.toFixed(1)}`
  mapAssessmentDetail.textContent = `${dataset.strongest.name} · Spatial Context 已建立稳定 objectId`
  metricOneLabel.textContent = '最高震级'
  metricOneValue.textContent = `M${dataset.strongest.magnitude.toFixed(1)}`
  metricOneDetail.textContent = '当前 Feed'
  metricTwoLabel.textContent = '震源深度'
  metricTwoValue.textContent = `${dataset.strongest.depthKm.toFixed(1)}`
  metricTwoDetail.textContent = 'km · 独立属性'
  metricThreeLabel.textContent = '有效事件'
  metricThreeValue.textContent = String(dataset.featureCount)
  metricThreeDetail.textContent = 'M2.5+ · 24h'
  metricFourLabel.textContent = '服务状态'
  metricFourValue.textContent = 'LIVE'
  metricFourDetail.textContent = `生成于 ${generatedTime}`
  scenarioBadge.textContent = '真实服务快照'
  scenarioBadge.dataset.variant = 'live'
  expandFloodButton.hidden = true
  resetButton.textContent = '返回确定性场景'
  runButton.textContent = '重新验证实时链路'
  captureObserverButton.textContent = '拍摄最强地震'
  gisServiceStatus.textContent = `USGS ${dataset.featureCount} 个事件 · NASA GIBS WMS · ${generatedTime} 更新。`
}

function updateFlightControls(experience: HimalayaFlightExperience): void {
  const { metrics } = experience.plan
  const distanceKilometers = metrics.distanceMeters / 1_000
  const terrainMaximum = metrics.terrainHeightRange[1]

  flightCommandCard.hidden = false
  flightPovViewport.hidden = true
  flightPovViewport.dataset.state = 'idle'
  flightPovViewport.setAttribute('aria-busy', 'false')
  flightPovStatus.textContent = 'AI POV 已就绪 · 起点预加载后按平滑时间轴连续推进'
  flightProgressBar.style.width = '0%'
  flightProgressText.textContent = '路线已规划，等待实际播放'
  flightObservations = []
  renderHimalayaFlightObservations()
  setHimalayaFlightViewMode('follow')
  flightPlayButton.hidden = false
  flightPlayButton.textContent = '开始 AI 飞行漫游'
  observerCard.hidden = true
  globeStage.setAttribute('aria-label', 'Closed-loop Himalaya flight awareness scene')
  mapBrandTitle.textContent = '喜马拉雅 AI 飞行走廊'
  mapBrandSubtitle.textContent = 'ArcGIS World Elevation · Esri World Imagery'
  sceneSourceChip.textContent = 'GROUNDED FLIGHT'
  sceneLegend.innerHTML = `
    <span><i class="legend-line flight-planned"></i>地形感知路线</span>
    <span><i class="legend-line flight-executed"></i>实际执行轨迹</span>
    <span><i class="legend-line flight-naive"></i>朴素路线</span>
    <span><i class="legend-dot flight-obstacle"></i>动态禁飞区</span>
    <span><i class="legend-line flight-sensor"></i>有限视域射线</span>
    <span><i class="legend-dot response"></i>路线锚点</span>
  `
  spatialReference.textContent = 'EPSG:4326 · DEM'
  forecastTime.textContent = `${new Date(experience.sampledAt).toLocaleTimeString('zh-CN', { hour12: false })} 采样`
  sceneObjectSummary.textContent = `${experience.plan.samples.length} 个高程样本`
  panelEyebrow.textContent = 'Experimental · grounded flight loop'
  panelTitle.textContent = '喜马拉雅飞行漫游'
  panelIntro.textContent = 'AI 以独立视角和 5 条 Cesium 射线持续观察前方，在未知障碍出现后滚动重规划并验证实际轨迹。'
  versionChip.textContent = 'FLIGHT / 02'
  riskStateCard.dataset.risk = 'live'
  riskLabel.textContent = 'SENSE · PLAN · ACT'
  riskTitle.textContent = '有限视域感知与滚动重规划已就绪'
  riskDetail.textContent = `基准路线最低净空 ${Math.round(metrics.minimumClearanceMeters)} m；飞行中会注入一个事先未知的临时禁飞区，AI 只能在射线进入探测范围后响应。`
  mapAssessment.textContent = 'DEM 基准路线 + 在线射线闭环'
  mapAssessmentDetail.textContent = `green plan · blue executed · 5 rays · ${distanceKilometers.toFixed(1)} km`
  metricOneLabel.textContent = '路线长度'
  metricOneValue.textContent = distanceKilometers.toFixed(1)
  metricOneDetail.textContent = 'km · 5 个锚点'
  metricTwoLabel.textContent = '最高地形'
  metricTwoValue.textContent = Math.round(terrainMaximum).toLocaleString('zh-CN')
  metricTwoDetail.textContent = 'm · DEM 实测'
  metricThreeLabel.textContent = '最低净空'
  metricThreeValue.textContent = Math.round(metrics.minimumClearanceMeters).toLocaleString('zh-CN')
  metricThreeDetail.textContent = 'm · 全程满足'
  metricFourLabel.textContent = '朴素违例'
  metricFourValue.textContent = String(metrics.naiveViolationCount)
  metricFourDetail.textContent = '个采样点'
  scenarioBadge.textContent = '闭环飞行感知'
  scenarioBadge.dataset.variant = 'live'
  expandFloodButton.hidden = true
  resetButton.textContent = '返回确定性场景'
  runButton.textContent = '重新验证路线'
  gisServiceStatus.textContent = `${ESRI_WORLD_IMAGERY_CREDIT} · ArcGIS World Elevation · ${experience.plan.samples.length} samples`
}

function updateModeControls(): void {
  const scenarioActive = sceneMode === 'scenario'
  const liveActive = sceneMode === 'live'
  const flightActive = sceneMode === 'flight'
  scenarioModeButton.classList.toggle('active', scenarioActive)
  scenarioModeButton.setAttribute('aria-pressed', String(scenarioActive))
  liveModeButton.classList.toggle('active', liveActive)
  liveModeButton.setAttribute('aria-pressed', String(liveActive))
  flightModeButton.classList.toggle('active', flightActive)
  flightModeButton.setAttribute('aria-pressed', String(flightActive))
}

function snapshot(): LabSnapshot {
  const activeResourceId = sceneMode === 'live'
    ? USGS_EARTHQUAKE_RESOURCE_ID
    : sceneMode === 'flight'
      ? 'arcgis-world-elevation'
      : SCENE_RESOURCE_ID
  const activeLayerId = sceneMode === 'live'
    ? USGS_EARTHQUAKE_LAYER_ID
    : sceneMode === 'flight'
      ? 'himalaya-flight-route'
      : SCENE_LAYER_ID
  return {
    phase,
    sceneMode,
    floodExpanded,
    checks: checkResults.map(({ id, label, detail, passed, tool }) => ({
      id,
      label,
      detail,
      passed,
      tool,
    })),
    perceptionTools: [...perceptionTools],
    resourceId: activeResourceId,
    layerId: activeLayerId,
    observerState,
    ...(liveDataset ? {
      live: {
        featureCount: liveDataset.featureCount,
        ...(liveDataset.generatedAt ? { generatedAt: liveDataset.generatedAt } : {}),
        strongestObjectId: liveDataset.strongest.objectId,
      },
    } : {}),
    ...(himalayaFlight ? {
      flight: {
        ...himalayaFlight.getDiagnostics(),
        sampleCount: himalayaFlight.plan.samples.length,
        distanceMeters: himalayaFlight.plan.metrics.distanceMeters,
        minimumClearanceMeters: himalayaFlight.plan.metrics.minimumClearanceMeters,
        naiveViolationCount: himalayaFlight.plan.metrics.naiveViolationCount,
        sampledAt: himalayaFlight.sampledAt,
        observationCount: flightObservations.length,
        viewMode: himalayaFlight.getViewMode(),
      },
    } : {}),
  }
}

async function executeTool<T = Record<string, unknown>>(
  name: string,
  input: Record<string, unknown>,
): Promise<ToolEnvelope<T>> {
  const tool = toolsByName.get(name)
  if (!tool) throw new Error(`Tool is not available in the lab: ${name}`)
  return await tool.execute(input) as ToolEnvelope<T>
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`Missing element: #${id}`)
  return value as T
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

function createLabGridImageryProvider(): GridImageryProvider {
  return new GridImageryProvider({
    cells: 12,
    color: Color.fromCssColorString('#39788b').withAlpha(0.65),
    glowColor: Color.fromCssColorString('#0b1f2a').withAlpha(0.8),
    backgroundColor: Color.fromCssColorString('#102d3b'),
  })
}

function restoreLabBasemap(): void {
  viewer.imageryLayers.removeAll()
  viewer.imageryLayers.addImageryProvider(createLabGridImageryProvider())
}

async function waitForMainSceneReady(timeoutMs = 8_000): Promise<void> {
  const startedAt = performance.now()
  let stableFrames = 0

  while (performance.now() - startedAt < timeoutMs) {
    viewer.scene.requestRender()
    await nextFrame()
    stableFrames = viewer.scene.globe.tilesLoaded ? stableFrames + 1 : 0
    if (stableFrames >= 3) return
  }
}
