import { normalizeEmbodiedMotionInput } from '../../../packages/cesium-mcp-spatial/src/index.js'
import type {
  EmbodiedActuator,
  EmbodiedMotionInput,
  NormalizedEmbodiedMotionInput,
} from '../../../packages/cesium-mcp-spatial/src/index.js'

export type NavigationCandidateId = 'front' | 'left' | 'right'
export type EmbodiedMotionIntent =
  | 'advance'
  | 'turn-left'
  | 'turn-right'
  | 'inspect-left'
  | 'inspect-right'
  | 'hold'

export interface NavigationCandidate {
  id: NavigationCandidateId
  clearanceMeters: number
  slopeDegrees?: number
  terrainReady: boolean
  traversable: boolean
}

export interface EmbodiedWorldSnapshot {
  revision: number
  capturedAt: string
  mode: 'character' | 'vehicle'
  distanceToGoalMeters: number
  bearingErrorRadians: number
  grounded: boolean
  speedMetersPerSecond: number
  hazardId?: string
  physicsCenterRayDistanceMeters?: number
  candidates: NavigationCandidate[]
}

export interface EmbodiedPlan {
  intent: EmbodiedMotionIntent
  durationMs: number
  reason: string
  confidence: number
  source: 'model' | 'fallback'
}

export type EmbodiedLoopLifecycle =
  | 'idle'
  | 'running'
  | 'completed'
  | 'stopped'
  | 'failed'

export type EmbodiedSafetyState = 'clear' | 'avoiding' | 'blocked'
export type EmbodiedPlannerState = 'idle' | 'pending' | 'committed'

export interface EmbodiedLoopState {
  lifecycle: EmbodiedLoopLifecycle
  safety: EmbodiedSafetyState
  planner: EmbodiedPlannerState
  worldRevision: number
  planRequestId: number
  activeIntent?: EmbodiedMotionIntent
  activePlanSource?: EmbodiedPlan['source']
  activePlanReason?: string
}

export interface EmbodiedTickResult {
  state: EmbodiedLoopState
  input: NormalizedEmbodiedMotionInput
  needsPlanning: boolean
  safetyReason?: string
}

export interface EmbodiedAgentLoopOptions {
  arrivalDistanceMeters?: number
  emergencyClearanceMeters?: number
  avoidanceBypassDurationMs?: number
  avoidanceScanDurationMs?: number
  planningDistanceDriftMeters?: number
  planningBearingDriftRadians?: number
  reactionTimeSeconds?: number
  characterDeceleration?: number
  vehicleDeceleration?: number
  retryDelayMs?: number
}

interface CommittedPlan extends EmbodiedPlan {
  requestId: number
  worldRevision: number
  expiresAtMs: number
}

interface PendingPlan {
  requestId: number
  worldRevision: number
  basisDistanceToGoalMeters: number
  basisBearingErrorRadians: number
}

type AvoidancePhase = 'scanning' | 'verifying' | 'bypassing' | 'holding'

const NEUTRAL_INPUT: EmbodiedMotionInput = {}
const AVOIDANCE_CLEAR_TICKS = 4
const AVOIDANCE_BLOCKED_TICKS = 5
const MAX_MODEL_PLAN_DURATION_MS = 8_000
const MAX_PROVISIONAL_PLAN_DURATION_MS = 20_000

export class EmbodiedAgentLoop {
  private readonly arrivalDistanceMeters: number
  private readonly emergencyClearanceMeters: number
  private readonly avoidanceBypassDurationMs: number
  private readonly avoidanceScanDurationMs: number
  private readonly planningDistanceDriftMeters: number
  private readonly planningBearingDriftRadians: number
  private readonly reactionTimeSeconds: number
  private readonly characterDeceleration: number
  private readonly vehicleDeceleration: number
  private readonly retryDelayMs: number
  private lifecycle: EmbodiedLoopLifecycle = 'idle'
  private safety: EmbodiedSafetyState = 'clear'
  private planner: EmbodiedPlannerState = 'idle'
  private worldRevision = 0
  private planRequestId = 0
  private currentNowMs = 0
  private retryNotBeforeMs = 0
  private committedPlan?: CommittedPlan
  private pendingPlan?: PendingPlan
  private latestSnapshot?: EmbodiedWorldSnapshot
  private avoidanceIntent?: Extract<EmbodiedMotionIntent, 'turn-left' | 'turn-right'>
  private avoidancePhase?: AvoidancePhase
  private avoidanceBypassUntilMs = 0
  private avoidanceScanStartedAtMs = 0
  private avoidanceAlternateAttempted = false
  private avoidanceClearTicks = 0
  private avoidanceBlockedTicks = 0
  private terminalStopSent = false
  private lastInput = normalizeEmbodiedMotionInput(NEUTRAL_INPUT)

  constructor(
    private readonly actuator: EmbodiedActuator,
    options: EmbodiedAgentLoopOptions = {},
  ) {
    this.arrivalDistanceMeters = positiveFinite(options.arrivalDistanceMeters, 8)
    this.emergencyClearanceMeters = positiveFinite(options.emergencyClearanceMeters, 16)
    this.avoidanceBypassDurationMs = positiveFinite(options.avoidanceBypassDurationMs, 9_000)
    this.avoidanceScanDurationMs = positiveFinite(options.avoidanceScanDurationMs, 2_500)
    this.planningDistanceDriftMeters = positiveFinite(options.planningDistanceDriftMeters, 10)
    this.planningBearingDriftRadians = positiveFinite(
      options.planningBearingDriftRadians,
      Math.PI / 9,
    )
    this.reactionTimeSeconds = positiveFinite(options.reactionTimeSeconds, 0.5)
    this.characterDeceleration = positiveFinite(options.characterDeceleration, 5)
    this.vehicleDeceleration = positiveFinite(options.vehicleDeceleration, 6)
    this.retryDelayMs = positiveFinite(options.retryDelayMs, 2_000)
  }

  start(worldRevision: number): void {
    this.lifecycle = 'running'
    this.safety = 'clear'
    this.planner = 'idle'
    this.worldRevision = worldRevision
    this.retryNotBeforeMs = 0
    this.committedPlan = undefined
    this.pendingPlan = undefined
    this.latestSnapshot = undefined
    this.avoidanceIntent = undefined
    this.avoidancePhase = undefined
    this.avoidanceBypassUntilMs = 0
    this.avoidanceScanStartedAtMs = 0
    this.avoidanceAlternateAttempted = false
    this.avoidanceClearTicks = 0
    this.avoidanceBlockedTicks = 0
    this.terminalStopSent = false
    this.applyInput(NEUTRAL_INPUT)
  }

  tick(snapshot: EmbodiedWorldSnapshot, nowMs: number): EmbodiedTickResult {
    if (this.lifecycle !== 'running') return this.result(false)
    this.currentNowMs = finiteOr(nowMs, this.currentNowMs)

    if (snapshot.revision < this.worldRevision) {
      this.safety = 'blocked'
      this.applyInput(NEUTRAL_INPUT)
      return this.result(false, 'Ignored a stale world snapshot and stopped fail-safe')
    }

    if (snapshot.revision > this.worldRevision) {
      this.worldRevision = snapshot.revision
      this.committedPlan = undefined
      this.pendingPlan = undefined
      this.avoidanceIntent = undefined
      this.avoidancePhase = undefined
      this.avoidanceBypassUntilMs = 0
      this.avoidanceScanStartedAtMs = 0
      this.avoidanceAlternateAttempted = false
      this.avoidanceClearTicks = 0
      this.avoidanceBlockedTicks = 0
      this.planner = 'idle'
      this.retryNotBeforeMs = 0
    }
    this.latestSnapshot = snapshot

    if (this.committedPlan?.expiresAtMs !== undefined
      && this.committedPlan.expiresAtMs <= this.currentNowMs) {
      this.committedPlan = undefined
      this.planner = this.pendingPlan ? 'pending' : 'idle'
    }

    if (snapshot.distanceToGoalMeters <= this.arrivalDistanceMeters) {
      this.finish('completed')
      return this.result(false)
    }

    if (!snapshot.grounded) {
      this.safety = 'blocked'
      this.applyInput(NEUTRAL_INPUT)
      return this.result(
        this.shouldRequestPlan(),
        'Waiting for the embodiment to regain ground contact',
      )
    }

    const emergencyClearance = this.dynamicEmergencyClearance(snapshot)
    const front = snapshot.candidates.find(candidate => candidate.id === 'front')
    const frontIsSafe = isCandidateSafe(front, emergencyClearance)

    if (this.avoidanceIntent && this.avoidancePhase === 'bypassing') {
      const criticallyBlocked = !front?.terrainReady
        || !front.traversable
        || front.clearanceMeters < emergencyClearance
      this.avoidanceBlockedTicks = frontIsSafe ? 0 : this.avoidanceBlockedTicks + 1
      if (!criticallyBlocked
        && this.avoidanceBlockedTicks < AVOIDANCE_BLOCKED_TICKS
        && this.currentNowMs < this.avoidanceBypassUntilMs) {
        this.safety = 'avoiding'
        this.applyInput(bypassInput())
        const side = this.avoidanceIntent === 'turn-left' ? 'left' : 'right'
        return this.result(
          false,
          `Executing the committed ${side} bypass leg before re-acquiring the goal`,
        )
      }
      if (!criticallyBlocked
        && this.avoidanceBlockedTicks < AVOIDANCE_BLOCKED_TICKS
        && this.currentNowMs >= this.avoidanceBypassUntilMs) {
        this.avoidanceIntent = undefined
        this.avoidancePhase = undefined
        this.avoidanceBypassUntilMs = 0
        this.avoidanceClearTicks = 0
        this.avoidanceBlockedTicks = 0
      } else {
        this.avoidancePhase = 'scanning'
        this.avoidanceBypassUntilMs = 0
        this.avoidanceScanStartedAtMs = this.currentNowMs
        this.avoidanceAlternateAttempted = false
        this.avoidanceClearTicks = 0
        this.avoidanceBlockedTicks = 0
      }
    }

    if (this.avoidanceIntent && this.avoidancePhase === 'verifying') {
      if (frontIsSafe) {
        this.avoidanceClearTicks += 1
        if (this.avoidanceClearTicks >= AVOIDANCE_CLEAR_TICKS) {
          this.avoidancePhase = 'bypassing'
          this.avoidanceBypassUntilMs = this.currentNowMs + this.avoidanceBypassDurationMs
          this.avoidanceBlockedTicks = 0
          this.safety = 'avoiding'
          this.applyInput(bypassInput())
          const side = this.avoidanceIntent === 'turn-left' ? 'left' : 'right'
          return this.result(
            false,
            `Verified a stable front corridor; starting the committed ${side} bypass leg`,
          )
        }
        this.safety = 'avoiding'
        this.applyInput(NEUTRAL_INPUT)
        return this.result(false, 'Holding position while the newly observed corridor is verified')
      }
      this.avoidancePhase = 'scanning'
      this.avoidanceClearTicks = 0
    }

    if (this.avoidanceIntent && this.avoidancePhase === 'holding') {
      if (!frontIsSafe) {
        this.safety = 'blocked'
        this.applyInput(NEUTRAL_INPUT)
        return this.result(false, 'Both bounded in-place scans failed; holding for new world evidence')
      }
      this.clearAvoidance()
    }

    if (this.avoidanceIntent
      && this.avoidancePhase === 'scanning'
      && !frontIsSafe
      && this.currentNowMs - this.avoidanceScanStartedAtMs >= this.avoidanceScanDurationMs) {
      if (!this.avoidanceAlternateAttempted) {
        this.avoidanceIntent = oppositeTurn(this.avoidanceIntent)
        this.avoidanceAlternateAttempted = true
        this.avoidanceScanStartedAtMs = this.currentNowMs
        this.safety = 'avoiding'
        this.applyInput(motionInput(this.avoidanceIntent, snapshot))
        return this.result(false, 'First bounded scan found no safe front corridor; checking the other side')
      }
      this.avoidancePhase = 'holding'
      this.safety = 'blocked'
      this.applyInput(NEUTRAL_INPUT)
      return this.result(false, 'Both bounded in-place scans failed; holding for new world evidence')
    }

    if (this.avoidanceIntent && this.avoidancePhase === 'scanning' && frontIsSafe) {
      this.avoidancePhase = 'verifying'
      this.avoidanceClearTicks = 1
      this.safety = 'avoiding'
      this.applyInput(NEUTRAL_INPUT)
      return this.result(false, 'Holding position while the newly observed corridor is verified')
    }

    const emergency = frontIsSafe
      ? undefined
      : chooseEmergencyManeuver(snapshot, emergencyClearance, this.avoidanceIntent)
    if (emergency) {
      this.safety = emergency.intent === 'hold' ? 'blocked' : 'avoiding'
      this.avoidanceIntent = emergency.intent === 'turn-left' || emergency.intent === 'turn-right'
        ? emergency.intent
        : undefined
      this.avoidancePhase = this.avoidanceIntent ? 'scanning' : undefined
      this.avoidanceBypassUntilMs = 0
      this.avoidanceScanStartedAtMs = this.currentNowMs
      this.avoidanceAlternateAttempted = false
      this.avoidanceClearTicks = 0
      this.avoidanceBlockedTicks = 0
      this.applyInput(motionInput(emergency.intent, snapshot))
      return this.result(this.shouldRequestPlan(), emergency.reason)
    }

    this.safety = 'clear'
    this.clearAvoidance()
    if (!this.committedPlan) {
      this.applyInput(NEUTRAL_INPUT)
      return this.result(this.shouldRequestPlan())
    }

    this.applyInput(motionInput(this.committedPlan.intent, snapshot))
    return this.result(false)
  }

  beginPlanning(snapshot: EmbodiedWorldSnapshot): number | undefined {
    if (this.lifecycle !== 'running'
      || snapshot.revision !== this.worldRevision
      || this.pendingPlan
      || this.committedPlan
      || this.currentNowMs < this.retryNotBeforeMs) {
      return undefined
    }
    this.latestSnapshot = snapshot
    const requestId = ++this.planRequestId
    this.pendingPlan = {
      requestId,
      worldRevision: snapshot.revision,
      basisDistanceToGoalMeters: snapshot.distanceToGoalMeters,
      basisBearingErrorRadians: snapshot.bearingErrorRadians,
    }
    this.planner = 'pending'
    return requestId
  }

  commitPlan(
    requestId: number,
    worldRevision: number,
    plan: EmbodiedPlan,
    nowMs: number,
  ): boolean {
    if (this.lifecycle !== 'running'
      || this.worldRevision !== worldRevision
      || this.pendingPlan?.requestId !== requestId
      || this.pendingPlan.worldRevision !== worldRevision
      || !this.isPendingPlanFresh(this.pendingPlan)) {
      if (this.pendingPlan?.requestId === requestId) {
        this.pendingPlan = undefined
        this.planner = this.committedPlan ? 'committed' : 'idle'
      }
      return false
    }

    const normalized = normalizePlan(plan, MAX_MODEL_PLAN_DURATION_MS)
    const committedAtMs = finiteOr(nowMs, this.currentNowMs)
    this.currentNowMs = Math.max(this.currentNowMs, committedAtMs)
    this.committedPlan = {
      ...normalized,
      requestId,
      worldRevision,
      expiresAtMs: committedAtMs + normalized.durationMs,
    }
    this.pendingPlan = undefined
    this.planner = 'committed'
    return true
  }

  setProvisionalPlan(
    requestId: number,
    worldRevision: number,
    plan: EmbodiedPlan,
    nowMs: number,
  ): boolean {
    if (this.lifecycle !== 'running'
      || this.worldRevision !== worldRevision
      || this.pendingPlan?.requestId !== requestId
      || this.pendingPlan.worldRevision !== worldRevision) {
      return false
    }
    const normalized = normalizePlan(
      { ...plan, source: 'fallback' },
      MAX_PROVISIONAL_PLAN_DURATION_MS,
    )
    const committedAtMs = finiteOr(nowMs, this.currentNowMs)
    this.committedPlan = {
      ...normalized,
      requestId,
      worldRevision,
      expiresAtMs: committedAtMs + normalized.durationMs,
    }
    this.planner = 'pending'
    return true
  }

  failPlanning(requestId: number, nowMs = this.currentNowMs): void {
    if (this.pendingPlan?.requestId !== requestId) return
    this.pendingPlan = undefined
    this.planner = 'idle'
    this.retryNotBeforeMs = finiteOr(nowMs, this.currentNowMs) + this.retryDelayMs
  }

  stop(): void {
    this.finish('stopped')
  }

  fail(): void {
    this.finish('failed')
  }

  getState(): EmbodiedLoopState {
    return {
      lifecycle: this.lifecycle,
      safety: this.safety,
      planner: this.planner,
      worldRevision: this.worldRevision,
      planRequestId: this.planRequestId,
      ...(this.committedPlan
        ? {
            activeIntent: this.committedPlan.intent,
            activePlanSource: this.committedPlan.source,
            activePlanReason: this.committedPlan.reason,
          }
        : {}),
    }
  }

  private shouldRequestPlan(): boolean {
    return this.lifecycle === 'running'
      && !this.pendingPlan
      && !this.committedPlan
      && this.currentNowMs >= this.retryNotBeforeMs
  }

  private dynamicEmergencyClearance(snapshot: EmbodiedWorldSnapshot): number {
    const speed = Math.max(0, finiteOr(snapshot.speedMetersPerSecond, 0))
    const deceleration = snapshot.mode === 'vehicle'
      ? this.vehicleDeceleration
      : this.characterDeceleration
    const footprint = snapshot.mode === 'vehicle' ? 2.5 : 0.8
    const stoppingDistance = speed * this.reactionTimeSeconds
      + speed ** 2 / (2 * deceleration)
      + footprint
    return Math.max(this.emergencyClearanceMeters, stoppingDistance)
  }

  private applyInput(input: EmbodiedMotionInput): NormalizedEmbodiedMotionInput {
    const applied = this.actuator.applyInput(input)
    this.lastInput = applied
    return applied
  }

  private finish(
    lifecycle: Extract<EmbodiedLoopLifecycle, 'completed' | 'stopped' | 'failed'>,
  ): void {
    if (isTerminal(this.lifecycle)) return
    this.lifecycle = lifecycle
    this.safety = 'clear'
    this.planner = 'idle'
    this.committedPlan = undefined
    this.pendingPlan = undefined
    this.latestSnapshot = undefined
    this.avoidanceIntent = undefined
    this.avoidancePhase = undefined
    this.avoidanceBypassUntilMs = 0
    this.avoidanceScanStartedAtMs = 0
    this.avoidanceAlternateAttempted = false
    this.avoidanceClearTicks = 0
    this.avoidanceBlockedTicks = 0
    if (!this.terminalStopSent) {
      this.actuator.stop()
      this.lastInput = normalizeEmbodiedMotionInput(NEUTRAL_INPUT)
      this.terminalStopSent = true
    }
  }

  private result(needsPlanning: boolean, safetyReason?: string): EmbodiedTickResult {
    return {
      state: this.getState(),
      input: this.lastInput,
      needsPlanning,
      ...(safetyReason ? { safetyReason } : {}),
    }
  }

  private clearAvoidance(): void {
    this.avoidanceIntent = undefined
    this.avoidancePhase = undefined
    this.avoidanceBypassUntilMs = 0
    this.avoidanceScanStartedAtMs = 0
    this.avoidanceAlternateAttempted = false
    this.avoidanceClearTicks = 0
    this.avoidanceBlockedTicks = 0
  }

  private isPendingPlanFresh(pending: PendingPlan): boolean {
    const latest = this.latestSnapshot
    if (!latest || latest.revision !== pending.worldRevision) return false
    const distanceDrift = Math.abs(
      finiteOr(latest.distanceToGoalMeters, Number.POSITIVE_INFINITY)
        - finiteOr(pending.basisDistanceToGoalMeters, Number.NEGATIVE_INFINITY),
    )
    const bearingDrift = angularDistance(
      latest.bearingErrorRadians,
      pending.basisBearingErrorRadians,
    )
    return distanceDrift <= this.planningDistanceDriftMeters
      && bearingDrift <= this.planningBearingDriftRadians
  }
}

function chooseEmergencyManeuver(
  snapshot: EmbodiedWorldSnapshot,
  emergencyClearanceMeters: number,
  preferredIntent?: Extract<EmbodiedMotionIntent, 'turn-left' | 'turn-right'>,
): { intent: EmbodiedMotionIntent, reason: string } | undefined {
  const front = snapshot.candidates.find(candidate => candidate.id === 'front')
  if (front?.traversable && front.clearanceMeters >= emergencyClearanceMeters) {
    return undefined
  }

  const preferredId = preferredIntent === 'turn-left'
    ? 'left'
    : preferredIntent === 'turn-right'
      ? 'right'
      : undefined
  const preferredSide = preferredId
    ? snapshot.candidates.find(candidate => candidate.id === preferredId
      && isCandidateSafe(candidate, emergencyClearanceMeters))
    : undefined
  const side = preferredSide ?? snapshot.candidates
    .filter(candidate => candidate.id !== 'front'
      && isCandidateSafe(candidate, emergencyClearanceMeters))
    .sort((left, right) => right.clearanceMeters - left.clearanceMeters)[0]

  if (!side) {
    return {
      intent: 'hold',
      reason: 'Front is blocked and neither side has terrain evidence for an in-place scan',
    }
  }

  return {
    intent: side.id === 'left' ? 'turn-left' : 'turn-right',
    reason: `${preferredSide ? 'Local safety loop kept' : 'Local safety loop selected'} an in-place ${side.id} scan until the front corridor is verified clear`,
  }
}

function isCandidateSafe(
  candidate: NavigationCandidate | undefined,
  emergencyClearanceMeters: number,
): boolean {
  return candidate?.terrainReady === true
    && candidate.traversable
    && candidate.clearanceMeters >= emergencyClearanceMeters
}

function bypassInput(): EmbodiedMotionInput {
  return {
    moveY: 0.56,
    sprint: true,
  }
}

function oppositeTurn(
  intent: Extract<EmbodiedMotionIntent, 'turn-left' | 'turn-right'>,
): Extract<EmbodiedMotionIntent, 'turn-left' | 'turn-right'> {
  return intent === 'turn-left' ? 'turn-right' : 'turn-left'
}

function motionInput(
  intent: EmbodiedMotionIntent,
  snapshot: EmbodiedWorldSnapshot,
): EmbodiedMotionInput {
  if (intent === 'advance') {
    return {
      moveY: 0.72,
      lookX: boundedMotion(snapshot.bearingErrorRadians / 0.55, -0.6, 0.6),
      sprint: snapshot.distanceToGoalMeters > 60,
    }
  }
  if (intent === 'turn-left') return { lookX: -0.8 }
  if (intent === 'turn-right') return { lookX: 0.8 }
  if (intent === 'inspect-left') return { lookX: -0.45 }
  if (intent === 'inspect-right') return { lookX: 0.45 }
  return NEUTRAL_INPUT
}

function normalizePlan(plan: EmbodiedPlan, maximumDurationMs: number): EmbodiedPlan {
  return {
    intent: plan.intent,
    durationMs: boundedNumber(Math.round(plan.durationMs), 500, maximumDurationMs, 2_500),
    reason: plan.reason.trim().slice(0, 240) || 'No reason provided',
    confidence: boundedNumber(plan.confidence, 0, 1, 0.5),
    source: plan.source,
  }
}

function angularDistance(left: number, right: number): number {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.POSITIVE_INFINITY
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)))
}

function isTerminal(lifecycle: EmbodiedLoopLifecycle): boolean {
  return lifecycle === 'completed' || lifecycle === 'stopped' || lifecycle === 'failed'
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function boundedMotion(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(minimum, Math.min(maximum, value))
}

function boundedNumber(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.min(maximum, value))
}
