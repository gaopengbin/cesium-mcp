import type { Viewer } from 'cesium'
import { CesiumBridge } from '../../../packages/cesium-mcp-bridge/src/index.js'
import type { BridgeResult } from '../../../packages/cesium-mcp-bridge/src/index.js'
import type { EmbodiedPlan, EmbodiedWorldSnapshot } from './embodied-agent-loop.js'
import { validateNavigationRouteObservation } from './jev-route-planner.js'
import type { NavigationRouteId, NavigationRouteObservation } from './jev-route-planner.js'

export interface MotionIntentParams {
  requestId: number
  revision: number
  plan: EmbodiedPlan
}

export interface NavigationRouteParams {
  requestId: number
  revision: number
  offerId: string
  routeId: NavigationRouteId
}

export interface BridgeAgentTrace {
  tool: 'observeWorld' | 'commitMotionIntent' | 'stopEmbodied' | 'readNavigationOptions' | 'commitNavigationRoute'
  status: 'succeeded' | 'rejected' | 'failed'
  durationMs: number
  timestamp: string
}

export interface BridgeAgentChannelOptions {
  observeWorld: () => EmbodiedWorldSnapshot
  /** The loop remains authoritative for request identity and position/bearing drift. */
  commitMotionIntent: (input: MotionIntentParams) => boolean
  stopEmbodied: () => void
  readNavigationOptions?: () => NavigationRouteObservation
  /** Main remains authoritative for generation, request identity and current route validity. */
  commitNavigationRoute?: (input: NavigationRouteParams) => boolean
  onTrace?: (trace: BridgeAgentTrace) => void
  now?: () => number
}

export interface BridgeAgentChannel {
  bridge: CesiumBridge
  readObservation(): Promise<EmbodiedWorldSnapshot>
  commitIntent(requestId: number, revision: number, plan: EmbodiedPlan): Promise<boolean>
  readNavigationOptions(): Promise<NavigationRouteObservation>
  commitNavigationRoute(requestId: number, revision: number, offerId: string, routeId: NavigationRouteId): Promise<boolean>
  stop(): Promise<void>
  dispose(): void
}

const OBSERVATION_MAX_AGE_MS = 20_000
const INTENTS = ['advance', 'turn-left', 'turn-right', 'inspect-left', 'inspect-right', 'hold']

/** A local Bridge SDK channel. It does not start an MCP transport or replace fast physics. */
export function createBridgeAgentChannel(
  viewer: Viewer,
  options: BridgeAgentChannelOptions,
): BridgeAgentChannel {
  const now = options.now ?? Date.now
  let observed: EmbodiedWorldSnapshot | undefined
  let observedRoutes: NavigationRouteObservation | undefined
  let lastSubmittedRequestId = -1
  let lastRouteRequestId = -1
  let disposed = false

  const bridge = new CesiumBridge(viewer, {
    executors: {
      observeWorld(params) {
        exactRecord(params, [])
        observed = undefined
        const snapshot = validateObservation(options.observeWorld(), now())
        observed = structuredClone(snapshot)
        return { success: true, data: snapshot }
      },
      commitMotionIntent(params) {
        const input = validateIntent(params)
        if (!observed || input.requestId <= lastSubmittedRequestId
          || input.revision !== observed.revision
          || !isFresh(observed.capturedAt, now())) {
          return { success: true, data: { accepted: false } }
        }
        // Recheck the current sensor revision at the execution boundary, after model latency.
        const current = validateObservation(options.observeWorld(), now())
        if (current.revision !== input.revision) {
          observed = undefined
          return { success: true, data: { accepted: false } }
        }
        lastSubmittedRequestId = input.requestId
        const accepted = options.commitMotionIntent(input)
        if (typeof accepted !== 'boolean') throw new Error('The motion executor must return a boolean')
        return { success: true, data: { accepted } }
      },
      readNavigationOptions(params) {
        exactRecord(params, [])
        observedRoutes = undefined
        if (!options.readNavigationOptions) throw new Error('Navigation options are not configured')
        const snapshot = validateRouteObservation(options.readNavigationOptions(), now())
        observedRoutes = structuredClone(snapshot)
        return { success: true, data: snapshot }
      },
      commitNavigationRoute(params) {
        const input = validateRouteCommit(params)
        if (!options.readNavigationOptions || !options.commitNavigationRoute) {
          throw new Error('Navigation route executor is not configured')
        }
        if (!observedRoutes || input.requestId <= lastRouteRequestId
          || input.revision !== observedRoutes.revision || input.offerId !== observedRoutes.offerId
          || !isFresh(observedRoutes.capturedAt, now())) {
          return { success: true, data: { accepted: false } }
        }
        const current = validateRouteObservation(options.readNavigationOptions(), now())
        if (routeSignature(current) !== routeSignature(observedRoutes)) {
          observedRoutes = undefined
          return { success: true, data: { accepted: false } }
        }
        if (input.routeId !== 'hold' && !current.candidates.some(candidate => candidate.id === input.routeId && candidate.feasible)) {
          return { success: true, data: { accepted: false } }
        }
        lastRouteRequestId = input.requestId
        const accepted = options.commitNavigationRoute(input)
        if (typeof accepted !== 'boolean') throw new Error('The route executor must return a boolean')
        return { success: true, data: { accepted } }
      },
      stopEmbodied(params) {
        exactRecord(params, [])
        observed = undefined
        observedRoutes = undefined
        options.stopEmbodied()
        return { success: true }
      },
    },
  })

  async function execute(tool: BridgeAgentTrace['tool'], params: Record<string, unknown>): Promise<BridgeResult> {
    const startedAt = now()
    let status: BridgeAgentTrace['status'] = 'failed'
    try {
      const result = await bridge.execute({ action: tool, params })
      if (!result.success) throw new Error(result.error ?? `${tool} failed`)
      status = (tool === 'commitMotionIntent' || tool === 'commitNavigationRoute') && !(result.data as { accepted: boolean }).accepted
        ? 'rejected'
        : 'succeeded'
      return result
    } finally {
      try {
        options.onTrace?.({ tool, status, durationMs: Math.max(0, now() - startedAt), timestamp: new Date(startedAt).toISOString() })
      } catch {
        // An optional UI listener must not repeat or undo an already executed action.
      }
    }
  }

  return {
    bridge,
    async readObservation() {
      const result = await execute('observeWorld', {})
      return result.data as EmbodiedWorldSnapshot
    },
    async commitIntent(requestId, revision, plan) {
      const result = await execute('commitMotionIntent', { requestId, revision, plan })
      return (result.data as { accepted: boolean }).accepted
    },
    async readNavigationOptions() {
      const result = await execute('readNavigationOptions', {})
      return result.data as NavigationRouteObservation
    },
    async commitNavigationRoute(requestId, revision, offerId, routeId) {
      const result = await execute('commitNavigationRoute', { requestId, revision, offerId, routeId })
      return (result.data as { accepted: boolean }).accepted
    },
    async stop() {
      await execute('stopEmbodied', {})
    },
    dispose() {
      if (disposed) return
      disposed = true
      observed = undefined
      observedRoutes = undefined
      try {
        options.stopEmbodied()
      } finally {
        bridge.dispose()
      }
    },
  }
}

function validateRouteCommit(value: unknown): NavigationRouteParams {
  const input = exactRecord(value, ['requestId', 'revision', 'offerId', 'routeId'])
  integer(input.requestId, 'requestId')
  integer(input.revision, 'revision')
  text(input.offerId, 120, 'offerId')
  oneOf(input.routeId, ['left', 'right', 'direct', 'detour', 'hold'], 'routeId')
  return structuredClone(input) as unknown as NavigationRouteParams
}

function validateRouteObservation(value: unknown, now: number): NavigationRouteObservation {
  const observation = validateNavigationRouteObservation(value)
  if (!isFresh(observation.capturedAt, now)) throw new Error('Route observation timestamp is invalid or stale')
  return observation
}

function routeSignature(observation: NavigationRouteObservation): string {
  return JSON.stringify({
    offerId: observation.offerId, revision: observation.revision, straightLineBlocked: observation.straightLineBlocked,
    candidates: [...observation.candidates].sort((left, right) => left.id.localeCompare(right.id)).map(candidate => [
      candidate.id, candidate.feasible, candidate.lengthMeters, candidate.minimumClearanceMeters, candidate.turnCount, candidate.dataCoverage,
    ]),
  })
}

function validateIntent(value: unknown): MotionIntentParams {
  const input = exactRecord(value, ['requestId', 'revision', 'plan'])
  integer(input.requestId, 'requestId')
  integer(input.revision, 'revision')
  const plan = exactRecord(input.plan, ['intent', 'durationMs', 'reason', 'confidence', 'source'])
  oneOf(plan.intent, INTENTS, 'intent')
  finiteRange(plan.durationMs, 1, 8_000, 'durationMs')
  finiteRange(plan.confidence, 0, 1, 'confidence')
  text(plan.reason, 1_200, 'reason')
  oneOf(plan.source, ['model', 'fallback'], 'source')
  return structuredClone(input) as unknown as MotionIntentParams
}

function validateObservation(value: unknown, now: number): EmbodiedWorldSnapshot {
  const input = exactRecord(value, [
    'revision', 'capturedAt', 'mode', 'distanceToGoalMeters', 'bearingErrorRadians',
    'grounded', 'speedMetersPerSecond', 'dataCoverage', 'hazardId', 'physicsCenterRayDistanceMeters', 'candidates',
  ])
  integer(input.revision, 'revision')
  if (typeof input.capturedAt !== 'string' || !isFresh(input.capturedAt, now)) {
    throw new Error('Observation timestamp is invalid or stale')
  }
  oneOf(input.mode, ['character', 'vehicle'], 'mode')
  finiteRange(input.distanceToGoalMeters, 0, 40_000_000, 'distanceToGoalMeters')
  finiteRange(input.bearingErrorRadians, -Math.PI, Math.PI, 'bearingErrorRadians')
  finiteRange(input.speedMetersPerSecond, 0, 10_000, 'speedMetersPerSecond')
  boolean(input.grounded, 'grounded')
  if (input.dataCoverage !== undefined) oneOf(input.dataCoverage, ['surveyed', 'unmapped'], 'dataCoverage')
  if (input.hazardId !== undefined) text(input.hazardId, 256, 'hazardId')
  if (input.physicsCenterRayDistanceMeters !== undefined) {
    finiteRange(input.physicsCenterRayDistanceMeters, 0, 40_000_000, 'physicsCenterRayDistanceMeters')
  }
  if (!Array.isArray(input.candidates) || input.candidates.length !== 3) {
    throw new Error('Observation must contain the three navigation candidates')
  }
  const ids = new Set<unknown>()
  for (const value of input.candidates) {
    const candidate = exactRecord(value, ['id', 'clearanceMeters', 'slopeDegrees', 'terrainReady', 'traversable'])
    oneOf(candidate.id, ['front', 'left', 'right'], 'candidate.id')
    if (ids.has(candidate.id)) throw new Error('Navigation candidates must have distinct ids')
    ids.add(candidate.id)
    finiteRange(candidate.clearanceMeters, 0, 40_000_000, 'candidate.clearanceMeters')
    if (candidate.slopeDegrees !== undefined) finiteRange(candidate.slopeDegrees, -90, 90, 'candidate.slopeDegrees')
    boolean(candidate.terrainReady, 'candidate.terrainReady')
    boolean(candidate.traversable, 'candidate.traversable')
  }
  return structuredClone(input) as unknown as EmbodiedWorldSnapshot
}

function exactRecord(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error('Tool parameters must be a plain object')
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`Unexpected field: ${key}`)
  }
  return value as Record<string, unknown>
}

function isFresh(capturedAt: string, now: number): boolean {
  const captured = Date.parse(capturedAt)
  return Number.isFinite(captured) && captured <= now + 1_000 && now - captured <= OBSERVATION_MAX_AGE_MS
}

function integer(value: unknown, name: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`)
}

function finiteRange(value: unknown, min: number, max: number, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be finite and within ${min}..${max}`)
  }
}

function oneOf(value: unknown, allowed: string[], name: string): void {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`Invalid ${name}`)
}

function boolean(value: unknown, name: string): void {
  if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`)
}

function text(value: unknown, max: number, name: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${name}`)
}
