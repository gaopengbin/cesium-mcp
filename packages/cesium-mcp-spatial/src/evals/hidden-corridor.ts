import {
  calculateGoalUncertainty,
  decideActivePerception,
  rankObservationCandidates,
} from '../world-awareness/active-perception.js'
import {
  applyWorldObservation,
  createAgentBeliefState,
  invalidateAgentBeliefState,
} from '../world-awareness/belief-state.js'
import {
  DEFAULT_CORRIDOR_PLANNING_POLICY,
  planCorridorRoute,
} from '../world-awareness/corridor-planning.js'
import type {
  CorridorRouteResult,
  CorridorTopology,
} from '../world-awareness/corridor-planning.js'
import {
  appendWorldAwarenessTraceEvent,
  completeWorldAwarenessTrace,
  createWorldAwarenessTrace,
  semanticTraceDigest,
} from '../world-awareness/trace.js'
import type {
  WorldAwarenessOutcome,
  WorldAwarenessTrace,
} from '../world-awareness/trace.js'
import type {
  ActivePerceptionDecision,
  ActivePerceptionGoal,
  AgentBeliefState,
  AuthoritativeWorldState,
  ObservationCandidate,
  RegionObservationEvidence,
  WorldObservation,
} from '../world-awareness/types.js'
import {
  HIDDEN_CORRIDOR_FIXTURES,
} from './hidden-corridor-fixtures.js'
import type {
  HiddenCorridorActualObservationAttempt,
  HiddenCorridorFixture,
  HiddenCorridorId,
  HiddenCorridorPlannerFixture,
  HiddenCorridorRevisionEvent,
  HiddenCorridorRoute,
} from './hidden-corridor-fixtures.js'

export type HiddenCorridorStrategyId =
  | 'oracle-upper-bound'
  | 'fixed-forward'
  | 'active-next-best-view'

export interface HiddenCorridorRunMetrics {
  taskCorrectness: boolean
  constraintViolationCount: number
  falseFreeRate: number
  unknownHonesty: number
  unknownHonestyCheckCount: number
  normalizedInformationGain: number
  observationEfficiency: number
  observationCount: number
  movementCost: number
  acquisitionCost: number
  nextBestViewRegret: number
  routeRegret: number
  replanSuccess: boolean
  verificationAccuracy: boolean
  repeatabilityDigest: string
}

export interface HiddenCorridorRunReport {
  caseId: string
  strategyId: HiddenCorridorStrategyId
  outcome: WorldAwarenessOutcome
  selectedCorridor: HiddenCorridorId | null
  selectedObservationCandidateIds: string[]
  routeHistory: HiddenCorridorRoutePlanRecord[]
  finalBelief: AgentBeliefState
  finalRoute: CorridorRouteResult
  metrics: HiddenCorridorRunMetrics
  trace: WorldAwarenessTrace
}

export interface HiddenCorridorRoutePlanRecord {
  sequence: number
  beliefRevision: number
  worldRevision: number
  status: CorridorRouteResult['status']
  corridorId: HiddenCorridorId | null
  totalCost: number
}

export interface HiddenCorridorCaseReport {
  caseId: string
  passed: boolean
  runs: Record<HiddenCorridorStrategyId, HiddenCorridorRunReport>
}

export interface HiddenCorridorEvaluationSummary {
  activeCaseAccuracy: number
  activeConstraintViolations: number
  activeFalseFreeRate: number
  activeUnknownHonesty: number
  activeObservationEfficiency: number
  fixedCaseAccuracy: number
  oracleCaseAccuracy: number
}

export interface HiddenCorridorEvaluationReport {
  schemaVersion: 1
  scenario: 'hidden-corridor-world-awareness'
  passed: boolean
  cases: HiddenCorridorCaseReport[]
  summary: HiddenCorridorEvaluationSummary
}

/** The complete, truth-free input that a Hidden Corridor policy may inspect. */
export interface HiddenCorridorPolicyContext {
  schemaVersion: 1
  topology: CorridorTopology
  routes: HiddenCorridorRoute[]
  goal: ActivePerceptionGoal
  observationCandidates: ObservationCandidate[]
}

interface RunState {
  belief: AgentBeliefState
  trace: WorldAwarenessTrace
  logicalTimeMs: number
  worldRevision: number
  observationCount: number
  selectedCandidateIds: string[]
  attemptsByCandidate: Map<string, number>
  appliedRevisionEventIds: Set<string>
  movementCost: number
  acquisitionCost: number
  accumulatedNextBestViewRegret: number
  honestyChecks: number
  honestUnknownChecks: number
  lastObservationCandidateId?: string
  routeHistory: HiddenCorridorRoutePlanRecord[]
}

interface RouteVerification {
  safe: boolean
  violationRegionIds: string[]
  selectedCorridor: HiddenCorridorId | null
}

const OBSERVATION_TIME_ORIGIN = Date.parse('2026-08-31T01:00:00.000Z')

export function buildHiddenCorridorTopology(
  fixture: HiddenCorridorPlannerFixture,
): CorridorTopology {
  const cellsById = new Map(fixture.cells.map(cell => [cell.cellId, cell] as const))
  const nodeIds = ['start', 'fork', 'join', 'goal']
  const edges: CorridorTopology['edges'] = []
  const entry = fixture.routes[0]?.cellIds[0]
  const exit = fixture.routes[0]?.cellIds.at(-1)
  if (!entry || !exit) throw new Error('Hidden corridor routes require shared entry and exit cells')

  edges.push(edgeForCell('edge:entry', 'start', 'fork', entry, cellsById))
  for (const route of fixture.routes) {
    if (route.cellIds[0] !== entry || route.cellIds.at(-1) !== exit) {
      throw new Error('Hidden corridor routes must share entry and exit cells')
    }
    const innerCellIds = route.cellIds.slice(1, -1)
    let fromNodeId = 'fork'
    for (const [index, cellId] of innerCellIds.entries()) {
      const last = index === innerCellIds.length - 1
      const toNodeId = last ? 'join' : `${route.corridorId}:${index + 1}`
      if (!last) nodeIds.push(toNodeId)
      edges.push(edgeForCell(
        `edge:${cellId}`,
        fromNodeId,
        toNodeId,
        cellId,
        cellsById,
      ))
      fromNodeId = toNodeId
    }
  }
  edges.push(edgeForCell('edge:exit', 'join', 'goal', exit, cellsById))
  return { nodeIds, edges }
}

export function createHiddenCorridorPolicyContext(
  fixture: HiddenCorridorPlannerFixture,
): HiddenCorridorPolicyContext {
  return {
    schemaVersion: 1,
    topology: buildHiddenCorridorTopology(fixture),
    routes: structuredClone(fixture.routes),
    goal: structuredClone(fixture.goal),
    observationCandidates: structuredClone(fixture.observationCandidates),
  }
}

/** Remove fixture identifiers while preserving legitimately observed belief. */
export function createHiddenCorridorPolicyBelief(
  belief: AgentBeliefState,
): AgentBeliefState {
  const sanitized = structuredClone(belief)
  sanitized.beliefId = 'hidden-corridor-policy-belief'
  sanitized.worldId = 'hidden-corridor-policy-world'
  sanitized.appliedObservationIds = sanitized.appliedObservationIds.map((_, index) => (
    `policy-observation:${index + 1}`
  ))
  for (const region of sanitized.regions) {
    region.evidence = region.evidence.map((reference, index) => ({
      ...reference,
      observationId: `policy-observation:${index + 1}`,
      evidenceId: `policy-region-evidence:${region.region.regionId}:${index + 1}`,
    }))
  }
  for (const object of sanitized.objects) {
    object.evidence = object.evidence.map((reference, index) => ({
      ...reference,
      observationId: `policy-observation:${index + 1}`,
      evidenceId: `policy-object-evidence:${object.objectId}:${index + 1}`,
    }))
  }
  sanitized.conflicts = sanitized.conflicts.map((conflict, index) => ({
    ...conflict,
    conflictId: `policy-conflict:${index + 1}`,
    evidenceIds: conflict.evidenceIds.map((_, evidenceIndex) => (
      `policy-conflict-evidence:${index + 1}:${evidenceIndex + 1}`
    )),
  }))
  return sanitized
}

/** Policy entry point. No case ID, seed, world ID, or oracle state crosses this boundary. */
export function selectHiddenCorridorObservation(
  context: HiddenCorridorPolicyContext,
  belief: AgentBeliefState,
  observationCount: number,
): ActivePerceptionDecision {
  return decideActivePerception(
    belief,
    context.goal,
    context.observationCandidates,
    undefined,
    observationCount,
  )
}

export function runHiddenCorridorCase(
  fixture: HiddenCorridorFixture,
  strategyId: HiddenCorridorStrategyId,
): HiddenCorridorRunReport {
  const policyContext = createHiddenCorridorPolicyContext(fixture.planner)
  let state = initializeRun(fixture, strategyId)
  const initialUncertainty = calculateGoalUncertainty(state.belief, fixture.planner.goal)

  if (strategyId === 'oracle-upper-bound') {
    state = applyOracleObservation(fixture, state)
  }

  let outcome: WorldAwarenessOutcome
  let selectedCorridor: HiddenCorridorId | null = null
  let finalRoute: CorridorRouteResult
  let verification: RouteVerification

  const maximumIterations = fixture.planner.goal.maximumObservationCount * 4
    + fixture.oracle.revisionEvents.length * 2
    + 8
  let iteration = 0
  for (;;) {
    iteration += 1
    if (iteration > maximumIterations) {
      throw new Error(
        `Hidden corridor run exceeded ${maximumIterations} deterministic iterations`,
      )
    }
    finalRoute = planCorridorRoute({
      belief: createHiddenCorridorPolicyBelief(state.belief),
      topology: policyContext.topology,
      startNodeId: 'start',
      goalNodeId: 'goal',
    })
    const routeRecord: HiddenCorridorRoutePlanRecord = {
      sequence: state.routeHistory.length,
      beliefRevision: state.belief.revision,
      worldRevision: state.worldRevision,
      status: finalRoute.status,
      corridorId: corridorForRoute(fixture, finalRoute),
      totalCost: finalRoute.totalCost,
    }
    state = {
      ...state,
      routeHistory: [...state.routeHistory, routeRecord],
    }
    state = emit(state, 'route.planned', {
      status: finalRoute.status,
      nodeIds: finalRoute.nodeIds,
      regionIds: finalRoute.segments.map(segment => segment.regionId),
      totalBaseCost: finalRoute.totalBaseCost,
      totalRiskCost: finalRoute.totalRiskCost,
      beliefRevision: state.belief.revision,
      worldRevision: state.worldRevision,
      corridorId: routeRecord.corridorId,
    })

    const worldRevisionBeforePendingEvents = state.worldRevision
    state = applyDueRevisionEvents(fixture, state)
    if (state.worldRevision !== worldRevisionBeforePendingEvents) continue

    if (finalRoute.shouldProceed) {
      if (
        strategyId === 'active-next-best-view'
        && state.observationCount < policyContext.goal.maximumObservationCount
        && routeHasDecisionRelevantUncertainty(
          policyContext.routes,
          createHiddenCorridorPolicyBelief(state.belief),
          finalRoute,
        )
      ) {
        const selection = selectCandidate(policyContext, state, strategyId)
        state = selection.state
        if (selection.candidate) {
          state = observeCandidate(fixture, state, selection.candidate)
          continue
        }
      }
      state = emit(state, 'action.started', {
        corridorId: routeRecord.corridorId,
        regionIds: finalRoute.segments.map(segment => segment.regionId),
        worldRevision: state.worldRevision,
      })
      verification = verifyRoute(fixture, state.worldRevision, finalRoute)
      selectedCorridor = verification.selectedCorridor
      outcome = verification.safe ? 'goal-reached' : 'violation'
      state = emit(state, 'action.completed', {
        reachedGoal: verification.safe,
        completedSegmentCount: verification.safe ? finalRoute.segments.length : 0,
        violationRegionIds: verification.violationRegionIds,
        worldRevision: state.worldRevision,
      })
      state = emit(state, 'verification.completed', {
        safe: verification.safe,
        violationRegionIds: verification.violationRegionIds,
        selectedCorridor,
        worldRevision: state.worldRevision,
      })
      break
    }

    if (allGoalRegionsResolved(state.belief, policyContext.goal.relevantRegionIds)) {
      outcome = 'safe-abort'
      verification = verifySafeAbort(fixture, state.worldRevision)
      state = emit(state, 'verification.completed', {
        safeAbort: true,
        correct: verification.safe,
        worldRevision: state.worldRevision,
      })
      break
    }

    if (strategyId === 'oracle-upper-bound') {
      outcome = 'safe-abort'
      verification = verifySafeAbort(fixture, state.worldRevision)
      break
    }

    if (state.observationCount >= policyContext.goal.maximumObservationCount) {
      outcome = 'budget-exhausted'
      verification = verifySafeAbort(fixture, state.worldRevision)
      break
    }

    const selection = selectCandidate(policyContext, state, strategyId)
    state = selection.state
    if (!selection.candidate) {
      outcome = 'budget-exhausted'
      verification = verifySafeAbort(fixture, state.worldRevision)
      break
    }
    state = observeCandidate(fixture, state, selection.candidate)
  }

  const metricsWithoutDigest = calculateMetrics(
    fixture,
    state,
    outcome,
    selectedCorridor,
    finalRoute,
    verification,
    initialUncertainty,
  )
  state = emit(state, 'run.completed', { outcome, selectedCorridor })
  const completedTrace = completeWorldAwarenessTrace(state.trace, outcome, metricsWithoutDigest)
  const repeatabilityDigest = completedTrace.result!.traceDigest
  const metrics: HiddenCorridorRunMetrics = {
    ...metricsWithoutDigest,
    repeatabilityDigest,
  }
  return {
    caseId: fixture.planner.caseId,
    strategyId,
    outcome,
    selectedCorridor,
    selectedObservationCandidateIds: [...state.selectedCandidateIds],
    routeHistory: state.routeHistory.map(item => ({ ...item })),
    finalBelief: state.belief,
    finalRoute,
    metrics,
    trace: completedTrace,
  }
}

export function runHiddenCorridorEvaluation(
  fixtures: readonly HiddenCorridorFixture[] = HIDDEN_CORRIDOR_FIXTURES,
): HiddenCorridorEvaluationReport {
  const cases = fixtures.map((fixture): HiddenCorridorCaseReport => {
    const oracle = runHiddenCorridorCase(fixture, 'oracle-upper-bound')
    const fixed = runHiddenCorridorCase(fixture, 'fixed-forward')
    const active = runHiddenCorridorCase(fixture, 'active-next-best-view')
    const repeatedActive = runHiddenCorridorCase(fixture, 'active-next-best-view')
    const expected = fixture.oracle.expectedOutcome
    const passed = active.outcome === expected.outcome
      && active.selectedCorridor === expected.safeCorridor
      && arraysEqual(
        active.selectedObservationCandidateIds,
        expected.activeObservationCandidateIds,
      )
      && active.metrics.constraintViolationCount === 0
      && active.metrics.falseFreeRate === 0
      && active.metrics.unknownHonesty === 1
      && active.metrics.verificationAccuracy
      && active.metrics.replanSuccess
      && active.metrics.normalizedInformationGain > 0
      && active.metrics.routeRegret === 0
      && active.metrics.nextBestViewRegret === 0
      && active.metrics.observationCount <= fixture.planner.goal.maximumObservationCount
      && active.metrics.normalizedInformationGain
        >= fixed.metrics.normalizedInformationGain
      && active.metrics.repeatabilityDigest === repeatedActive.metrics.repeatabilityDigest
    return {
      caseId: fixture.planner.caseId,
      passed,
      runs: {
        'oracle-upper-bound': oracle,
        'fixed-forward': fixed,
        'active-next-best-view': active,
      },
    }
  })
  const activeRuns = cases.map(item => item.runs['active-next-best-view'])
  const fixedRuns = cases.map(item => item.runs['fixed-forward'])
  const oracleRuns = cases.map(item => item.runs['oracle-upper-bound'])
  return {
    schemaVersion: 1,
    scenario: 'hidden-corridor-world-awareness',
    passed: cases.every(item => item.passed),
    cases,
    summary: {
      activeCaseAccuracy: average(activeRuns.map(run => Number(run.metrics.taskCorrectness))),
      activeConstraintViolations: sum(activeRuns.map(run => run.metrics.constraintViolationCount)),
      activeFalseFreeRate: average(activeRuns.map(run => run.metrics.falseFreeRate)),
      activeUnknownHonesty: average(activeRuns.map(run => run.metrics.unknownHonesty)),
      activeObservationEfficiency: average(
        activeRuns.map(run => run.metrics.observationEfficiency),
      ),
      fixedCaseAccuracy: average(fixedRuns.map(run => Number(run.metrics.taskCorrectness))),
      oracleCaseAccuracy: average(oracleRuns.map(run => Number(run.metrics.taskCorrectness))),
    },
  }
}

function initializeRun(
  fixture: HiddenCorridorFixture,
  strategyId: HiddenCorridorStrategyId,
): RunState {
  const runId = `${fixture.planner.caseId}:${strategyId}:${fixture.planner.seed}`
  let trace = createWorldAwarenessTrace({
    runId,
    scenarioId: fixture.planner.caseId,
    scenarioVersion: 1,
    scenarioDigest: semanticTraceDigest(fixture),
    seed: fixture.planner.seed,
    strategyId,
    strategyVersion: '0.1.0',
    config: {
      maximumObservationCount: fixture.planner.goal.maximumObservationCount,
      unknownPolicy: 'reject',
    },
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 0,
    type: 'run.started',
    payload: { caseId: fixture.planner.caseId, strategyId },
  })
  let belief = createAgentBeliefState({
    beliefId: `belief:${runId}`,
    worldId: fixture.planner.worldId,
    createdAt: fixture.planner.initialObservation.startedAt,
    regions: fixture.planner.cells.map(cell => cell.region),
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 0,
    type: 'belief.initialized',
    beliefRevisionAfter: belief.revision,
    payload: {
      beliefId: belief.beliefId,
      regionCount: belief.regions.length,
      belief,
    },
  })
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 100,
    type: 'observation.completed',
    payload: {
      observationId: fixture.planner.initialObservation.observationId,
      sensorIds: fixture.planner.initialObservation.sensors.map(sensor => sensor.sensorId),
      initial: true,
      observation: fixture.planner.initialObservation,
    },
  })
  const initialUpdate = applyWorldObservation(belief, fixture.planner.initialObservation)
  trace = appendWorldAwarenessTraceEvent(trace, {
    logicalTimeMs: 100,
    type: 'belief.updated',
    beliefRevisionBefore: belief.revision,
    beliefRevisionAfter: initialUpdate.state.revision,
    payload: {
      operation: 'observation',
      observationId: fixture.planner.initialObservation.observationId,
      diff: initialUpdate.diff,
    },
  })
  belief = initialUpdate.state
  return {
    belief,
    trace,
    logicalTimeMs: 100,
    worldRevision: fixture.planner.initialWorldRevision,
    observationCount: 0,
    selectedCandidateIds: [],
    attemptsByCandidate: new Map(),
    appliedRevisionEventIds: new Set(),
    movementCost: 0,
    acquisitionCost: 0,
    accumulatedNextBestViewRegret: 0,
    honestyChecks: 0,
    honestUnknownChecks: 0,
    routeHistory: [],
  }
}

function applyOracleObservation(
  fixture: HiddenCorridorFixture,
  state: RunState,
): RunState {
  const world = worldAtRevision(fixture, state.worldRevision)
  const candidate: ObservationCandidate = {
    candidateId: 'oracle-full-state',
    sensor: { sensorId: 'oracle-evaluator', kind: 'metadata' },
    predictedCoverage: fixture.planner.goal.relevantRegionIds.map(regionId => ({
      regionId,
      visibilityProbability: 1,
    })),
    movementCost: 0,
    acquisitionCost: 0,
    exposureRisk: 0,
    readinessProbability: 1,
  }
  const attempt: HiddenCorridorActualObservationAttempt = {
    attempt: 1,
    worldRevision: state.worldRevision,
    logicalTimeMs: 200,
    readiness: 'ready',
    regions: world.regions.map(item => ({
      regionId: item.region.regionId,
      coverage: 'complete',
      confidence: 1,
    })),
    limitations: ['Evaluator-only oracle upper bound.'],
  }
  return applyObservation(fixture, {
    ...state,
    observationCount: 1,
  }, candidate, attempt, false)
}

function selectCandidate(
  context: HiddenCorridorPolicyContext,
  state: RunState,
  strategyId: Exclude<HiddenCorridorStrategyId, 'oracle-upper-bound'>,
): { state: RunState, candidate?: ObservationCandidate } {
  const policyBelief = createHiddenCorridorPolicyBelief(state.belief)
  const scores = rankObservationCandidates(
    policyBelief,
    context.goal,
    context.observationCandidates,
  )
  let next = emit(state, 'observation.candidates-generated', {
    candidateIds: context.observationCandidates.map(item => item.candidateId),
    beliefRevision: state.belief.revision,
  })
  for (const score of scores) {
    next = emit(next, 'observation.candidate-scored', { ...score })
  }

  let candidate: ObservationCandidate | undefined
  if (strategyId === 'active-next-best-view') {
    const decision = selectHiddenCorridorObservation(
      context,
      policyBelief,
      state.observationCount,
    )
    candidate = context.observationCandidates.find(item => (
      item.candidateId === decision.selectedCandidateId
    ))
  }
  else {
    candidate = context.observationCandidates.find(item => (
      item.candidateId === 'fixed-forward'
    ))
  }
  if (!candidate) return { state: next }

  const bestScore = scores.find(score => score.valid)?.score ?? 0
  const selectedScore = scores.find(score => score.candidateId === candidate!.candidateId)
  next = emit(next, 'observation.selected', {
    candidateId: candidate.candidateId,
    strategyId,
    bestAvailableScore: bestScore,
    selectedScore: selectedScore?.score ?? 0,
  })
  return { state: next, candidate }
}

function observeCandidate(
  fixture: HiddenCorridorFixture,
  state: RunState,
  candidate: ObservationCandidate,
): RunState {
  const attemptNumber = (state.attemptsByCandidate.get(candidate.candidateId) ?? 0) + 1
  const actual = fixture.oracle.actualCandidateCoverage.find(item => (
    item.candidateId === candidate.candidateId
  ))
  if (!actual || actual.attempts.length === 0) {
    throw new Error(
      `Hidden corridor oracle lacks observation attempts for candidate '${candidate.candidateId}'`,
    )
  }
  const attempt = actual?.attempts.find(item => item.attempt === attemptNumber)
    ?? actual?.attempts.at(-1)
  if (!attempt) {
    throw new Error(
      `Hidden corridor oracle lacks attempt ${attemptNumber} for candidate '${candidate.candidateId}'`,
    )
  }
  const realizedRegret = realizedNextBestViewRegret(fixture, state, candidate, attempt)
  const attemptsByCandidate = new Map(state.attemptsByCandidate)
  attemptsByCandidate.set(candidate.candidateId, attemptNumber)
  const next = {
    ...state,
    attemptsByCandidate,
    observationCount: state.observationCount + 1,
    selectedCandidateIds: [...state.selectedCandidateIds, candidate.candidateId],
    movementCost: state.movementCost
      + (state.lastObservationCandidateId === candidate.candidateId ? 0 : candidate.movementCost),
    acquisitionCost: state.acquisitionCost + candidate.acquisitionCost,
    accumulatedNextBestViewRegret: state.accumulatedNextBestViewRegret + realizedRegret,
    lastObservationCandidateId: candidate.candidateId,
  }
  return applyObservation(fixture, next, candidate, attempt, true)
}

function applyObservation(
  fixture: HiddenCorridorFixture,
  state: RunState,
  candidate: ObservationCandidate,
  attempt: HiddenCorridorActualObservationAttempt,
  measureHonesty: boolean,
): RunState {
  const observation = observationFromAttempt(fixture, state, candidate, attempt)
  const beforeByRegion = new Map(
    state.belief.regions.map(region => [region.region.regionId, region] as const),
  )
  let next = emitAt(state, Math.max(state.logicalTimeMs, attempt.logicalTimeMs), 'observation.completed', {
    observationId: observation.observationId,
    candidateId: candidate.candidateId,
    attempt: attempt.attempt,
    readiness: attempt.readiness,
    worldRevision: attempt.worldRevision,
    limitations: attempt.limitations,
    observation,
  })
  const update = applyWorldObservation(state.belief, observation)
  next = emit(next, 'belief.updated', {
    operation: 'observation',
    observationId: observation.observationId,
    diff: update.diff,
  }, state.belief.revision, update.state.revision)

  let honestyChecks = state.honestyChecks
  let honestUnknownChecks = state.honestUnknownChecks
  if (measureHonesty) {
    const truth = worldAtRevision(fixture, attempt.worldRevision)
    const truthByRegion = new Map(
      truth.regions.map(region => [region.region.regionId, region] as const),
    )
    for (const region of attempt.regions) {
      const unsafeForFree = attempt.readiness !== 'ready' || region.coverage !== 'complete'
      const before = beforeByRegion.get(region.regionId)
      const actual = truthByRegion.get(region.regionId)
      const actuallyFree = actual?.modeled && actual.occupancy === 'free'
      if (
        !unsafeForFree
        || !actuallyFree
        || (before && before.occupancy !== 'unknown')
      ) continue
      honestyChecks += 1
      const after = update.state.regions.find(item => item.region.regionId === region.regionId)
      if (!after || after.occupancy === 'unknown') honestUnknownChecks += 1
    }
  }
  return {
    ...next,
    belief: update.state,
    worldRevision: Math.max(state.worldRevision, attempt.worldRevision),
    honestyChecks,
    honestUnknownChecks,
  }
}

function observationFromAttempt(
  fixture: HiddenCorridorFixture,
  state: RunState,
  candidate: ObservationCandidate,
  attempt: HiddenCorridorActualObservationAttempt,
): WorldObservation {
  const world = worldAtRevision(fixture, attempt.worldRevision)
  const regionsById = new Map(world.regions.map(item => [item.region.regionId, item] as const))
  const sampledAt = new Date(OBSERVATION_TIME_ORIGIN + attempt.logicalTimeMs).toISOString()
  const evidence: RegionObservationEvidence[] = attempt.regions.map((actual, index) => {
    const truth = regionsById.get(actual.regionId)
    if (!truth) throw new Error(`Oracle coverage references unknown region: ${actual.regionId}`)
    const complete = actual.coverage === 'complete'
    const occupancy = complete && truth.modeled ? truth.occupancy : 'unknown'
    return {
      evidenceId: `${candidate.candidateId}:${attempt.attempt}:${index + 1}`,
      sensorId: candidate.sensor.sensorId,
      sampledAt,
      quality: complete ? 'exact' : actual.coverage === 'unavailable' ? 'unknown' : 'approximate',
      confidence: actual.confidence,
      basis: `hidden-corridor-${actual.coverage}-coverage`,
      kind: 'region-occupancy',
      region: truth.region,
      occupancy,
      coverage: actual.coverage,
      ...(occupancy === 'occupied' && truth.modeled
        ? { blockingObjectIds: truth.blockingObjectIds }
        : {}),
      ...(occupancy === 'unknown'
        ? { unknownReason: actual.unknownReason ?? 'insufficient-coverage' }
        : {}),
    }
  })
  return {
    schemaVersion: 1,
    observationId: [
      'observation',
      fixture.planner.caseId,
      candidate.candidateId,
      state.observationCount,
      attempt.attempt,
      attempt.worldRevision,
    ].join(':'),
    worldId: fixture.planner.worldId,
    worldRevision: attempt.worldRevision,
    startedAt: sampledAt,
    completedAt: sampledAt,
    changedDuringObservation: false,
    readiness: attempt.readiness,
    sensors: [candidate.sensor],
    evidence,
    limitations: [...attempt.limitations],
  }
}

function applyDueRevisionEvents(
  fixture: HiddenCorridorFixture,
  state: RunState,
): RunState {
  let next = state
  for (const event of fixture.oracle.revisionEvents) {
    if (
      next.appliedRevisionEventIds.has(event.eventId)
      || next.observationCount < event.afterObservationCount
    ) continue
    next = applyRevisionEvent(next, event)
  }
  return next
}

function applyRevisionEvent(state: RunState, event: HiddenCorridorRevisionEvent): RunState {
  if (state.worldRevision !== event.fromWorldRevision) {
    throw new Error(
      `Revision event '${event.eventId}' expected world revision ${event.fromWorldRevision}`,
    )
  }
  const invalidationInput = {
    invalidatedAt: new Date(OBSERVATION_TIME_ORIGIN + event.logicalTimeMs).toISOString(),
    reason: event.reason,
    regionIds: event.staleRegionIds,
  }
  const invalidation = invalidateAgentBeliefState(state.belief, invalidationInput)
  let next = emitAt(
    state,
    Math.max(state.logicalTimeMs, event.logicalTimeMs),
    'world.revised',
    {
      revisionEventId: event.eventId,
      changedRegionIds: event.changedRegionIds,
      worldRevisionBefore: event.fromWorldRevision,
      worldRevisionAfter: event.toWorldRevision,
      reason: event.reason,
    },
  )
  if (invalidation.state.revision !== state.belief.revision) {
    next = emit(
      next,
    'belief.updated',
    {
      operation: 'invalidation',
      invalidation: invalidationInput,
      revisionEventId: event.eventId,
      changedRegionIds: event.changedRegionIds,
      staleRegionIds: event.staleRegionIds,
      worldRevisionBefore: event.fromWorldRevision,
      worldRevisionAfter: event.toWorldRevision,
      diff: invalidation.diff,
    },
    state.belief.revision,
    invalidation.state.revision,
    )
  }
  next = {
    ...next,
    belief: invalidation.state,
    worldRevision: event.toWorldRevision,
    appliedRevisionEventIds: new Set([
      ...state.appliedRevisionEventIds,
      event.eventId,
    ]),
  }
  return next
}

function calculateMetrics(
  fixture: HiddenCorridorFixture,
  state: RunState,
  outcome: WorldAwarenessOutcome,
  selectedCorridor: HiddenCorridorId | null,
  route: CorridorRouteResult,
  verification: RouteVerification,
  initialUncertainty: number,
): Omit<HiddenCorridorRunMetrics, 'repeatabilityDigest'> {
  const truth = worldAtRevision(fixture, state.worldRevision)
  const truthByRegion = new Map(truth.regions.map(item => [item.region.regionId, item] as const))
  const currentFree = state.belief.regions.filter(region => (
    region.occupancy === 'free' && region.freshness === 'current'
  ))
  const falseFreeCount = currentFree.filter(region => {
    const actual = truthByRegion.get(region.region.regionId)
    return actual?.modeled && actual.occupancy === 'occupied'
  }).length
  const finalUncertainty = calculateGoalUncertainty(state.belief, fixture.planner.goal)
  const normalizedInformationGain = initialUncertainty <= 0
    ? 0
    : clampUnit((initialUncertainty - finalUncertainty) / initialUncertainty)
  const expected = fixture.oracle.expectedOutcome
  const taskCorrectness = outcome === expected.outcome && selectedCorridor === expected.safeCorridor
  const oracleCost = bestSafeRouteCost(fixture, state.worldRevision)
  const routeRegret = route.shouldProceed && oracleCost !== null
    ? Math.max(0, route.totalBaseCost - oracleCost)
    : oracleCost === null ? 0 : 1
  const noSafeRoute = bestSafeRouteCost(fixture, state.worldRevision) === null
  const verificationAccuracy = outcome === 'goal-reached'
    ? verification.safe
    : outcome === 'safe-abort'
      ? noSafeRoute
      : false
  return {
    taskCorrectness,
    constraintViolationCount: verification.violationRegionIds.length,
    falseFreeRate: currentFree.length === 0 ? 0 : falseFreeCount / currentFree.length,
    unknownHonesty: state.honestyChecks === 0
      ? 1
      : state.honestUnknownChecks / state.honestyChecks,
    unknownHonestyCheckCount: state.honestyChecks,
    normalizedInformationGain,
    observationEfficiency: normalizedInformationGain / Math.max(1, state.observationCount),
    observationCount: state.observationCount,
    movementCost: cleanNumber(state.movementCost),
    acquisitionCost: cleanNumber(state.acquisitionCost),
    nextBestViewRegret: cleanNumber(state.accumulatedNextBestViewRegret),
    routeRegret: cleanNumber(routeRegret),
    replanSuccess: evaluateReplanSuccess(fixture, state, taskCorrectness, verification),
    verificationAccuracy,
  }
}

function verifyRoute(
  fixture: HiddenCorridorFixture,
  worldRevision: number,
  route: CorridorRouteResult,
): RouteVerification {
  const world = worldAtRevision(fixture, worldRevision)
  const truthByRegion = new Map(world.regions.map(item => [item.region.regionId, item] as const))
  const violationRegionIds = route.segments
    .map(segment => segment.regionId)
    .filter((regionId) => {
      const region = truthByRegion.get(regionId)
      return region?.modeled && region.occupancy === 'occupied'
    })
  return {
    safe: violationRegionIds.length === 0,
    violationRegionIds,
    selectedCorridor: corridorForRoute(fixture, route),
  }
}

function verifySafeAbort(
  fixture: HiddenCorridorFixture,
  worldRevision: number,
): RouteVerification {
  return {
    safe: bestSafeRouteCost(fixture, worldRevision) === null,
    violationRegionIds: [],
    selectedCorridor: null,
  }
}

function bestSafeRouteCost(
  fixture: HiddenCorridorFixture,
  worldRevision: number,
): number | null {
  const world = worldAtRevision(fixture, worldRevision)
  const truthByRegion = new Map(world.regions.map(item => [item.region.regionId, item] as const))
  const safeRoutes = fixture.planner.routes.filter(route => route.cellIds.every((regionId) => {
    const region = truthByRegion.get(regionId)
    return region?.modeled && region.occupancy === 'free'
  }))
  if (safeRoutes.length === 0) return null
  return Math.min(...safeRoutes.map(route => route.baseCost))
}

function corridorForRoute(
  fixture: HiddenCorridorFixture,
  route: CorridorRouteResult,
): HiddenCorridorId | null {
  const routeRegionIds = new Set(route.segments.map(segment => segment.regionId))
  return fixture.planner.routes.find(candidate => (
    candidate.cellIds.every(regionId => routeRegionIds.has(regionId))
  ))?.corridorId ?? null
}

function allGoalRegionsResolved(
  belief: AgentBeliefState,
  relevantRegionIds: readonly string[],
): boolean {
  const regions = new Map(belief.regions.map(item => [item.region.regionId, item] as const))
  return relevantRegionIds.every((regionId) => {
    const region = regions.get(regionId)
    return region && region.occupancy !== 'unknown' && region.freshness === 'current'
  })
}

function routeHasDecisionRelevantUncertainty(
  routes: readonly HiddenCorridorRoute[],
  belief: AgentBeliefState,
  plannedRoute: CorridorRouteResult,
): boolean {
  if (plannedRoute.segments.some(segment => segment.freshness === 'stale')) return true
  const beliefByRegion = new Map(
    belief.regions.map(region => [region.region.regionId, region] as const),
  )
  return routes.some((route) => {
    if (route.baseCost >= plannedRoute.totalBaseCost) return false
    let unresolved = false
    for (const regionId of route.cellIds) {
      const region = beliefByRegion.get(regionId)
      if (region?.occupancy === 'occupied') return false
      if (
        !region
        || region.occupancy === 'unknown'
        || region.freshness === 'stale'
        || region.confidence < DEFAULT_CORRIDOR_PLANNING_POLICY.minimumFreeConfidence
      ) {
        unresolved = true
      }
    }
    return unresolved
  })
}

function realizedNextBestViewRegret(
  fixture: HiddenCorridorFixture,
  state: RunState,
  selectedCandidate: ObservationCandidate,
  selectedAttempt: HiddenCorridorActualObservationAttempt,
): number {
  const before = calculateGoalUncertainty(state.belief, fixture.planner.goal)
  const candidateGains = fixture.planner.observationCandidates.map((candidate) => {
    const attemptNumber = (state.attemptsByCandidate.get(candidate.candidateId) ?? 0) + 1
    const actual = fixture.oracle.actualCandidateCoverage.find(item => (
      item.candidateId === candidate.candidateId
    ))
    const attempt = candidate.candidateId === selectedCandidate.candidateId
      ? selectedAttempt
      : actual?.attempts.find(item => item.attempt === attemptNumber) ?? actual?.attempts.at(-1)
    if (!attempt) return 0
    const observation = observationFromAttempt(fixture, state, candidate, attempt)
    const counterfactual = applyWorldObservation(state.belief, observation).state
    const after = calculateGoalUncertainty(counterfactual, fixture.planner.goal)
    return Math.max(0, before - after)
  })
  const selectedIndex = fixture.planner.observationCandidates.findIndex(item => (
    item.candidateId === selectedCandidate.candidateId
  ))
  const selectedGain = candidateGains[selectedIndex] ?? 0
  return cleanNumber(Math.max(0, Math.max(0, ...candidateGains) - selectedGain))
}

function evaluateReplanSuccess(
  fixture: HiddenCorridorFixture,
  state: RunState,
  taskCorrectness: boolean,
  verification: RouteVerification,
): boolean {
  if (fixture.oracle.revisionEvents.length === 0) return true
  return fixture.oracle.revisionEvents.every((event) => {
    const before = state.routeHistory.find(item => (
      item.worldRevision === event.fromWorldRevision && item.status === 'planned'
    ))
    const after = state.routeHistory.find(item => (
      item.worldRevision === event.toWorldRevision && item.status === 'planned'
    ))
    return Boolean(
      before
      && after
      && before.corridorId
      && after.corridorId
      && before.corridorId !== after.corridorId
      && taskCorrectness
      && verification.safe,
    )
  })
}

function worldAtRevision(
  fixture: HiddenCorridorFixture,
  revision: number,
): AuthoritativeWorldState {
  const world = fixture.oracle.worldStates.find(item => item.revision === revision)
  if (!world) throw new Error(`Hidden corridor oracle lacks world revision ${revision}`)
  return world
}

function edgeForCell(
  edgeId: string,
  fromNodeId: string,
  toNodeId: string,
  cellId: string,
  cellsById: Map<string, HiddenCorridorPlannerFixture['cells'][number]>,
): CorridorTopology['edges'][number] {
  const cell = cellsById.get(cellId)
  if (!cell) throw new Error(`Hidden corridor route references unknown cell: ${cellId}`)
  return {
    edgeId,
    fromNodeId,
    toNodeId,
    regionId: cellId,
    baseCost: cell.traversalCost,
    bidirectional: false,
  }
}

function emit(
  state: RunState,
  type: Parameters<typeof appendWorldAwarenessTraceEvent>[1]['type'],
  payload: Record<string, unknown>,
  beliefRevisionBefore?: number,
  beliefRevisionAfter?: number,
): RunState {
  return emitAt(
    state,
    state.logicalTimeMs,
    type,
    payload,
    beliefRevisionBefore,
    beliefRevisionAfter,
  )
}

function emitAt(
  state: RunState,
  logicalTimeMs: number,
  type: Parameters<typeof appendWorldAwarenessTraceEvent>[1]['type'],
  payload: Record<string, unknown>,
  beliefRevisionBefore?: number,
  beliefRevisionAfter?: number,
): RunState {
  return {
    ...state,
    logicalTimeMs,
    trace: appendWorldAwarenessTraceEvent(state.trace, {
      logicalTimeMs,
      type,
      ...(beliefRevisionBefore === undefined ? {} : { beliefRevisionBefore }),
      ...(beliefRevisionAfter === undefined ? {} : { beliefRevisionAfter }),
      payload,
    }),
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : cleanNumber(sum(values) / values.length)
}

function sum(values: readonly number[]): number {
  return cleanNumber(values.reduce((total, value) => total + value, 0))
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function cleanNumber(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Object.is(value, -0) ? 0 : Number(value.toFixed(12))
}
