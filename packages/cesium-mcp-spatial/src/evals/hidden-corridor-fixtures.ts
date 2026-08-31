import type {
  SpatialCoordinate,
  SpatialObject,
} from '../types.js'
import { createAuthoritativeWorldState } from '../world-awareness/world-state.js'
import type {
  ActivePerceptionGoal,
  AuthoritativeWorldState,
  ObservationCandidate,
  ObservationCoverage,
  ObservationReadiness,
  SpatialRegion,
  UnknownReason,
  WorldObservation,
} from '../world-awareness/types.js'

export type HiddenCorridorId = 'short' | 'long'

export type HiddenCorridorCaseId =
  | 'short-corridor-blocked'
  | 'long-corridor-blocked'
  | 'both-corridors-free'
  | 'both-corridors-blocked'
  | 'split-view-one-observation'
  | 'split-view-two-observations'
  | 'partial-loading-retry'
  | 'revision-stales-belief'

export interface HiddenCorridorCell {
  cellId: string
  corridorId: HiddenCorridorId | 'shared'
  order: number
  traversalCost: number
  initiallyObserved: boolean
  region: SpatialRegion
}

export interface HiddenCorridorRoute {
  corridorId: HiddenCorridorId
  cellIds: string[]
  baseCost: number
}

/** Scenario construction data. Policies receive a redacted policy context instead. */
export interface HiddenCorridorPlannerFixture {
  schemaVersion: 1
  caseId: HiddenCorridorCaseId
  seed: number
  worldId: string
  initialWorldRevision: number
  cells: HiddenCorridorCell[]
  routes: HiddenCorridorRoute[]
  initialObservation: WorldObservation
  observationCandidates: ObservationCandidate[]
  goal: ActivePerceptionGoal
}

export interface HiddenCorridorActualRegionCoverage {
  regionId: string
  coverage: ObservationCoverage
  confidence: number
  unknownReason?: UnknownReason
}

export interface HiddenCorridorActualObservationAttempt {
  attempt: number
  worldRevision: number
  logicalTimeMs: number
  readiness: ObservationReadiness
  regions: HiddenCorridorActualRegionCoverage[]
  limitations: string[]
}

export interface HiddenCorridorActualCandidateCoverage {
  candidateId: string
  attempts: HiddenCorridorActualObservationAttempt[]
}

export interface HiddenCorridorRevisionEvent {
  eventId: string
  afterObservationCount: number
  logicalTimeMs: number
  fromWorldRevision: number
  toWorldRevision: number
  changedRegionIds: string[]
  staleRegionIds: string[]
  reason: string
}

export interface HiddenCorridorExpectedOutcome {
  outcome: 'goal-reached' | 'safe-abort'
  safeCorridor: HiddenCorridorId | null
  activeObservationCandidateIds: string[]
}

/** Evaluator-only state. It must never be passed to candidate scoring or planning. */
export interface HiddenCorridorOracleFixture {
  worldStates: AuthoritativeWorldState[]
  actualCandidateCoverage: HiddenCorridorActualCandidateCoverage[]
  revisionEvents: HiddenCorridorRevisionEvent[]
  expectedOutcome: HiddenCorridorExpectedOutcome
}

export interface HiddenCorridorFixture {
  planner: HiddenCorridorPlannerFixture
  oracle: HiddenCorridorOracleFixture
}

interface HiddenCorridorFixtureConfig {
  caseId: HiddenCorridorCaseId
  seed: number
  blockedRegionIds: string[]
  candidateSet: 'shared' | 'split' | 'partial'
  maximumObservationCount?: number
  actualCandidateCoverage?: HiddenCorridorActualCandidateCoverage[]
  revision?: {
    nextBlockedRegionIds: string[]
    event: HiddenCorridorRevisionEvent
  }
  expectedOutcome: HiddenCorridorExpectedOutcome
}

const WORLD_CAPTURED_AT = '2026-08-31T00:00:00.000Z'
const WORLD_REVISION_TWO_CAPTURED_AT = '2026-08-31T00:01:00.000Z'
const INITIAL_OBSERVATION_STARTED_AT = '2026-08-31T00:00:01.000Z'
const INITIAL_OBSERVATION_COMPLETED_AT = '2026-08-31T00:00:01.100Z'

export const HIDDEN_CORRIDOR_REGION_IDS = {
  entry: 'corridor:entry',
  shortOne: 'corridor:short:1',
  shortTwo: 'corridor:short:2',
  shortThree: 'corridor:short:3',
  longOne: 'corridor:long:1',
  longTwo: 'corridor:long:2',
  longThree: 'corridor:long:3',
  longFour: 'corridor:long:4',
  exit: 'corridor:exit',
} as const

const INITIAL_OBSERVED_REGION_IDS = [
  HIDDEN_CORRIDOR_REGION_IDS.entry,
  HIDDEN_CORRIDOR_REGION_IDS.shortOne,
  HIDDEN_CORRIDOR_REGION_IDS.longOne,
  HIDDEN_CORRIDOR_REGION_IDS.exit,
]

const SHORT_HIDDEN_REGION_IDS = [
  HIDDEN_CORRIDOR_REGION_IDS.shortTwo,
  HIDDEN_CORRIDOR_REGION_IDS.shortThree,
]

const LONG_HIDDEN_REGION_IDS = [
  HIDDEN_CORRIDOR_REGION_IDS.longTwo,
  HIDDEN_CORRIDOR_REGION_IDS.longThree,
  HIDDEN_CORRIDOR_REGION_IDS.longFour,
]

const ALL_HIDDEN_REGION_IDS = [
  ...SHORT_HIDDEN_REGION_IDS,
  ...LONG_HIDDEN_REGION_IDS,
]

export function createHiddenCorridorFixtures(): HiddenCorridorFixture[] {
  return [
    createFixture({
      caseId: 'short-corridor-blocked',
      seed: 1101,
      blockedRegionIds: [HIDDEN_CORRIDOR_REGION_IDS.shortTwo],
      candidateSet: 'shared',
      expectedOutcome: reached('long', ['shared-overlook']),
    }),
    createFixture({
      caseId: 'long-corridor-blocked',
      seed: 1102,
      blockedRegionIds: [HIDDEN_CORRIDOR_REGION_IDS.longThree],
      candidateSet: 'shared',
      expectedOutcome: reached('short', ['shared-overlook']),
    }),
    createFixture({
      caseId: 'both-corridors-free',
      seed: 1103,
      blockedRegionIds: [],
      candidateSet: 'shared',
      expectedOutcome: reached('short', ['shared-overlook']),
    }),
    createFixture({
      caseId: 'both-corridors-blocked',
      seed: 1104,
      blockedRegionIds: [
        HIDDEN_CORRIDOR_REGION_IDS.shortTwo,
        HIDDEN_CORRIDOR_REGION_IDS.longThree,
      ],
      candidateSet: 'shared',
      expectedOutcome: {
        outcome: 'safe-abort',
        safeCorridor: null,
        activeObservationCandidateIds: ['shared-overlook'],
      },
    }),
    createFixture({
      caseId: 'split-view-one-observation',
      seed: 1105,
      blockedRegionIds: [HIDDEN_CORRIDOR_REGION_IDS.longThree],
      candidateSet: 'split',
      expectedOutcome: reached('short', ['short-overlook']),
    }),
    createFixture({
      caseId: 'split-view-two-observations',
      seed: 1106,
      blockedRegionIds: [HIDDEN_CORRIDOR_REGION_IDS.shortTwo],
      candidateSet: 'split',
      expectedOutcome: reached('long', ['short-overlook', 'long-overlook']),
    }),
    createFixture({
      caseId: 'partial-loading-retry',
      seed: 1107,
      blockedRegionIds: [HIDDEN_CORRIDOR_REGION_IDS.shortTwo],
      candidateSet: 'partial',
      maximumObservationCount: 3,
      actualCandidateCoverage: partialLoadingCoverage(),
      expectedOutcome: reached('long', [
        'shared-overlook',
        'shared-overlook',
        'shared-overlook',
      ]),
    }),
    createFixture({
      caseId: 'revision-stales-belief',
      seed: 1108,
      blockedRegionIds: [],
      candidateSet: 'shared',
      revision: {
        nextBlockedRegionIds: [HIDDEN_CORRIDOR_REGION_IDS.shortTwo],
        event: {
          eventId: 'world-revision:1-to-2',
          afterObservationCount: 1,
          logicalTimeMs: 2_000,
          fromWorldRevision: 1,
          toWorldRevision: 2,
          changedRegionIds: [HIDDEN_CORRIDOR_REGION_IDS.shortTwo],
          staleRegionIds: [HIDDEN_CORRIDOR_REGION_IDS.shortTwo],
          reason: 'A rockfall blocks the previously observed short corridor.',
        },
      },
      actualCandidateCoverage: revisionCoverage(),
      expectedOutcome: reached('long', ['shared-overlook', 'short-overlook']),
    }),
  ]
}

export const HIDDEN_CORRIDOR_FIXTURES: readonly HiddenCorridorFixture[] =
  createHiddenCorridorFixtures()

function createFixture(config: HiddenCorridorFixtureConfig): HiddenCorridorFixture {
  const cells = createCells()
  const regions = cells.map(cell => cell.region)
  const worldId = `hidden-corridor:${config.caseId}`
  const worldStates = [
    createWorldState(worldId, 1, WORLD_CAPTURED_AT, regions, config.blockedRegionIds),
    ...(config.revision
      ? [createWorldState(
          worldId,
          2,
          WORLD_REVISION_TWO_CAPTURED_AT,
          regions,
          config.revision.nextBlockedRegionIds,
        )]
      : []),
  ]
  const observationCandidates = candidatesForSet(config.candidateSet)
  return {
    planner: {
      schemaVersion: 1,
      caseId: config.caseId,
      seed: config.seed,
      worldId,
      initialWorldRevision: 1,
      cells,
      routes: createRoutes(),
      initialObservation: createInitialObservation(worldId, cells),
      observationCandidates,
      goal: createGoal(config.maximumObservationCount ?? 2),
    },
    oracle: {
      worldStates,
      actualCandidateCoverage: config.actualCandidateCoverage
        ?? readyCoverageForCandidates(observationCandidates),
      revisionEvents: config.revision ? [config.revision.event] : [],
      expectedOutcome: config.expectedOutcome,
    },
  }
}

function createCells(): HiddenCorridorCell[] {
  return [
    cell(HIDDEN_CORRIDOR_REGION_IDS.entry, 'shared', 0, 0.04, 86.80, 27.89, true),
    cell(HIDDEN_CORRIDOR_REGION_IDS.shortOne, 'short', 1, 0.08, 86.82, 27.90, true),
    cell(HIDDEN_CORRIDOR_REGION_IDS.shortTwo, 'short', 2, 0.08, 86.84, 27.91, false),
    cell(HIDDEN_CORRIDOR_REGION_IDS.shortThree, 'short', 3, 0.09, 86.86, 27.92, false),
    cell(HIDDEN_CORRIDOR_REGION_IDS.longOne, 'long', 1, 0.1, 86.81, 27.88, true),
    cell(HIDDEN_CORRIDOR_REGION_IDS.longTwo, 'long', 2, 0.1, 86.83, 27.87, false),
    cell(HIDDEN_CORRIDOR_REGION_IDS.longThree, 'long', 3, 0.11, 86.86, 27.87, false),
    cell(HIDDEN_CORRIDOR_REGION_IDS.longFour, 'long', 4, 0.1, 86.88, 27.89, false),
    cell(HIDDEN_CORRIDOR_REGION_IDS.exit, 'shared', 5, 0.04, 86.89, 27.91, true),
  ]
}

function cell(
  cellId: string,
  corridorId: HiddenCorridorCell['corridorId'],
  order: number,
  traversalCost: number,
  longitude: number,
  latitude: number,
  initiallyObserved: boolean,
): HiddenCorridorCell {
  return {
    cellId,
    corridorId,
    order,
    traversalCost,
    initiallyObserved,
    region: rectangleRegion(cellId, longitude, latitude, {
      corridorId,
      order,
      traversalCost,
    }),
  }
}

function rectangleRegion(
  regionId: string,
  longitude: number,
  latitude: number,
  properties: Record<string, unknown>,
): SpatialRegion {
  const halfWidth = 0.004
  const halfHeight = 0.003
  return {
    regionId,
    footprint: {
      type: 'Polygon',
      coordinates: [[
        [longitude - halfWidth, latitude - halfHeight],
        [longitude + halfWidth, latitude - halfHeight],
        [longitude + halfWidth, latitude + halfHeight],
        [longitude - halfWidth, latitude + halfHeight],
        [longitude - halfWidth, latitude - halfHeight],
      ]],
    },
    minHeight: 3_500,
    maxHeight: 6_500,
    properties: { ...properties },
  }
}

function createRoutes(): HiddenCorridorRoute[] {
  return [
    {
      corridorId: 'short',
      cellIds: [
        HIDDEN_CORRIDOR_REGION_IDS.entry,
        HIDDEN_CORRIDOR_REGION_IDS.shortOne,
        HIDDEN_CORRIDOR_REGION_IDS.shortTwo,
        HIDDEN_CORRIDOR_REGION_IDS.shortThree,
        HIDDEN_CORRIDOR_REGION_IDS.exit,
      ],
      baseCost: 0.33,
    },
    {
      corridorId: 'long',
      cellIds: [
        HIDDEN_CORRIDOR_REGION_IDS.entry,
        HIDDEN_CORRIDOR_REGION_IDS.longOne,
        HIDDEN_CORRIDOR_REGION_IDS.longTwo,
        HIDDEN_CORRIDOR_REGION_IDS.longThree,
        HIDDEN_CORRIDOR_REGION_IDS.longFour,
        HIDDEN_CORRIDOR_REGION_IDS.exit,
      ],
      baseCost: 0.49,
    },
  ]
}

function createWorldState(
  worldId: string,
  revision: number,
  capturedAt: string,
  regions: readonly SpatialRegion[],
  blockedRegionIds: readonly string[],
): AuthoritativeWorldState {
  const blocked = new Set(blockedRegionIds)
  const obstacles = regions
    .filter(region => blocked.has(region.regionId))
    .map(region => obstacleForRegion(region, revision, capturedAt))
  return createAuthoritativeWorldState({
    worldId,
    revision,
    capturedAt,
    objects: obstacles,
    regions: regions.map(region => ({
      region,
      modeled: true,
      occupancy: blocked.has(region.regionId) ? 'occupied' as const : 'free' as const,
      blockingObjectIds: blocked.has(region.regionId)
        ? [obstacleId(region.regionId, revision)]
        : [],
      revision,
      changedAt: capturedAt,
    })),
  })
}

function obstacleForRegion(
  region: SpatialRegion,
  revision: number,
  observedAt: string,
): SpatialObject {
  const coordinates = region.footprint.coordinates[0]!
  const center = coordinates.slice(0, -1).reduce<SpatialCoordinate>(
    (sum, coordinate) => [sum[0] + coordinate[0], sum[1] + coordinate[1]],
    [0, 0],
  )
  center[0] /= coordinates.length - 1
  center[1] /= coordinates.length - 1
  return {
    objectId: obstacleId(region.regionId, revision),
    sourceType: 'entity',
    type: 'blocking-obstacle',
    name: `Hidden obstacle in ${region.regionId}`,
    geometry: { type: 'Point', coordinates: center },
    properties: { regionId: region.regionId, evaluatorOnly: true },
    geometryQuality: 'exact',
    observedAt,
    revision,
    provenance: { source: 'hidden-corridor-oracle', method: 'deterministic-fixture' },
  }
}

function obstacleId(regionId: string, revision: number): string {
  return `obstacle:${regionId}:revision-${revision}`
}

function createInitialObservation(
  worldId: string,
  cells: readonly HiddenCorridorCell[],
): WorldObservation {
  const regionsById = new Map(cells.map(item => [item.cellId, item.region] as const))
  return {
    schemaVersion: 1,
    observationId: `observation:${worldId}:initial`,
    worldId,
    worldRevision: 1,
    startedAt: INITIAL_OBSERVATION_STARTED_AT,
    completedAt: INITIAL_OBSERVATION_COMPLETED_AT,
    changedDuringObservation: false,
    readiness: 'ready',
    sensors: [{
      sensorId: 'initial-forward-sensor',
      kind: 'ray',
      pose: { position: [86.795, 27.89, 5_000], headingDegrees: 80, pitchDegrees: -4 },
      rangeMeters: 3_000,
      horizontalFieldOfViewDegrees: 35,
    }],
    evidence: INITIAL_OBSERVED_REGION_IDS.map((regionId, index) => ({
      evidenceId: `initial-region:${index + 1}`,
      sensorId: 'initial-forward-sensor',
      sampledAt: INITIAL_OBSERVATION_COMPLETED_AT,
      quality: 'exact',
      confidence: 1,
      basis: 'complete-initial-corridor-coverage',
      kind: 'region-occupancy',
      region: regionsById.get(regionId)!,
      occupancy: 'free',
      coverage: 'complete',
      blockingObjectIds: [],
    })),
    limitations: ['Ridge occlusion leaves the inner corridor cells unobserved.'],
  }
}

function createGoal(maximumObservationCount: number): ActivePerceptionGoal {
  return {
    goalId: 'reach-hidden-corridor-exit-safely',
    relevantRegionIds: [...ALL_HIDDEN_REGION_IDS],
    regionWeights: {
      [HIDDEN_CORRIDOR_REGION_IDS.shortTwo]: 2.5,
      [HIDDEN_CORRIDOR_REGION_IDS.shortThree]: 2,
      [HIDDEN_CORRIDOR_REGION_IDS.longTwo]: 1.2,
      [HIDDEN_CORRIDOR_REGION_IDS.longThree]: 1.3,
      [HIDDEN_CORRIDOR_REGION_IDS.longFour]: 1,
    },
    maximumObservationCount,
    uncertaintyThreshold: 0.08,
  }
}

function candidatesForSet(
  candidateSet: HiddenCorridorFixtureConfig['candidateSet'],
): ObservationCandidate[] {
  if (candidateSet === 'split') {
    return [shortOverlookCandidate(), longOverlookCandidate(), fixedForwardCandidate()]
  }
  if (candidateSet === 'partial') return [sharedOverlookCandidate(0.6), fixedForwardCandidate()]
  return [
    sharedOverlookCandidate(),
    shortOverlookCandidate(),
    longOverlookCandidate(),
    fixedForwardCandidate(),
  ]
}

function sharedOverlookCandidate(readinessProbability = 0.98): ObservationCandidate {
  return {
    candidateId: 'shared-overlook',
    sensor: {
      sensorId: 'shared-overlook-camera',
      kind: 'camera',
      pose: { position: [86.845, 27.945, 7_800], headingDegrees: 150, pitchDegrees: -28 },
      rangeMeters: 18_000,
      horizontalFieldOfViewDegrees: 72,
      verticalFieldOfViewDegrees: 48,
    },
    predictedCoverage: ALL_HIDDEN_REGION_IDS.map(regionId => ({
      regionId,
      visibilityProbability: 0.95,
    })),
    movementCost: 0.45,
    acquisitionCost: 0.3,
    exposureRisk: 0.2,
    readinessProbability,
    properties: { role: 'shared-ridge-overlook' },
  }
}

function shortOverlookCandidate(): ObservationCandidate {
  return {
    candidateId: 'short-overlook',
    sensor: {
      sensorId: 'short-overlook-camera',
      kind: 'camera',
      pose: { position: [86.83, 27.93, 7_200], headingDegrees: 120, pitchDegrees: -24 },
      rangeMeters: 10_000,
      horizontalFieldOfViewDegrees: 55,
      verticalFieldOfViewDegrees: 40,
    },
    predictedCoverage: SHORT_HIDDEN_REGION_IDS.map(regionId => ({
      regionId,
      visibilityProbability: 0.98,
    })),
    movementCost: 0.12,
    acquisitionCost: 0.1,
    exposureRisk: 0.05,
    readinessProbability: 0.99,
    properties: { role: 'short-corridor-overlook' },
  }
}

function longOverlookCandidate(): ObservationCandidate {
  return {
    candidateId: 'long-overlook',
    sensor: {
      sensorId: 'long-overlook-camera',
      kind: 'camera',
      pose: { position: [86.85, 27.855, 7_000], headingDegrees: 40, pitchDegrees: -22 },
      rangeMeters: 13_000,
      horizontalFieldOfViewDegrees: 60,
      verticalFieldOfViewDegrees: 42,
    },
    predictedCoverage: LONG_HIDDEN_REGION_IDS.map(regionId => ({
      regionId,
      visibilityProbability: 0.95,
    })),
    movementCost: 0.3,
    acquisitionCost: 0.15,
    exposureRisk: 0.15,
    readinessProbability: 0.98,
    properties: { role: 'long-corridor-overlook' },
  }
}

function fixedForwardCandidate(): ObservationCandidate {
  return {
    candidateId: 'fixed-forward',
    sensor: {
      sensorId: 'fixed-forward-rays',
      kind: 'ray',
      pose: { position: [86.80, 27.89, 5_000], headingDegrees: 75, pitchDegrees: -5 },
      rangeMeters: 6_000,
      horizontalFieldOfViewDegrees: 30,
    },
    predictedCoverage: [{
      regionId: HIDDEN_CORRIDOR_REGION_IDS.shortTwo,
      visibilityProbability: 0.15,
    }],
    movementCost: 0,
    acquisitionCost: 0.05,
    exposureRisk: 0.25,
    readinessProbability: 1,
    properties: { role: 'fixed-baseline-sensor' },
  }
}

function readyCoverageForCandidates(
  candidates: readonly ObservationCandidate[],
): HiddenCorridorActualCandidateCoverage[] {
  return candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    attempts: [{
      attempt: 1,
      worldRevision: 1,
      logicalTimeMs: 1_000,
      readiness: 'ready',
      regions: candidate.candidateId === 'fixed-forward'
        ? [{
            regionId: HIDDEN_CORRIDOR_REGION_IDS.shortTwo,
            coverage: 'occluded',
            confidence: 1,
            unknownReason: 'occluded',
          }]
        : candidate.predictedCoverage.map(coverage => ({
            regionId: coverage.regionId,
            coverage: 'complete',
            confidence: 1,
          })),
      limitations: candidate.candidateId === 'fixed-forward'
        ? ['The ridge occludes the critical inner corridor.']
        : [],
    }],
  }))
}

function partialLoadingCoverage(): HiddenCorridorActualCandidateCoverage[] {
  return [
    {
      candidateId: 'shared-overlook',
      attempts: [
        {
          attempt: 1,
          worldRevision: 1,
          logicalTimeMs: 1_000,
          readiness: 'loading',
          regions: ALL_HIDDEN_REGION_IDS.map(regionId => ({
            regionId,
            coverage: 'unavailable',
            confidence: 0,
            unknownReason: 'not-loaded',
          })),
          limitations: ['Terrain and scene content have not completed loading.'],
        },
        {
          attempt: 2,
          worldRevision: 1,
          logicalTimeMs: 2_000,
          readiness: 'partial',
          regions: [
            ...SHORT_HIDDEN_REGION_IDS.map(regionId => ({
              regionId,
              coverage: 'complete' as const,
              confidence: 1,
            })),
            ...LONG_HIDDEN_REGION_IDS.map(regionId => ({
              regionId,
              coverage: 'partial' as const,
              confidence: 0.35,
              unknownReason: 'insufficient-coverage' as const,
            })),
          ],
          limitations: ['Only the short corridor is fully resolved.'],
        },
        {
          attempt: 3,
          worldRevision: 1,
          logicalTimeMs: 3_000,
          readiness: 'ready',
          regions: ALL_HIDDEN_REGION_IDS.map(regionId => ({
            regionId,
            coverage: 'complete',
            confidence: 1,
          })),
          limitations: [],
        },
      ],
    },
    readyCoverageForCandidates([fixedForwardCandidate()])[0]!,
  ]
}

function revisionCoverage(): HiddenCorridorActualCandidateCoverage[] {
  const base = readyCoverageForCandidates([
    sharedOverlookCandidate(),
    shortOverlookCandidate(),
    longOverlookCandidate(),
    fixedForwardCandidate(),
  ])
  const shared = base.find(item => item.candidateId === 'shared-overlook')!
  shared.attempts.push({
    attempt: 2,
    worldRevision: 2,
    logicalTimeMs: 3_000,
    readiness: 'ready',
    regions: ALL_HIDDEN_REGION_IDS.map(regionId => ({
      regionId,
      coverage: 'complete',
      confidence: 1,
    })),
    limitations: [],
  })
  const short = base.find(item => item.candidateId === 'short-overlook')!
  short.attempts[0] = {
    ...short.attempts[0]!,
    worldRevision: 2,
    logicalTimeMs: 3_000,
  }
  return base
}

function reached(
  corridor: HiddenCorridorId,
  activeObservationCandidateIds: string[],
): HiddenCorridorExpectedOutcome {
  return {
    outcome: 'goal-reached',
    safeCorridor: corridor,
    activeObservationCandidateIds,
  }
}
