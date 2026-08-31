import type {
  ActivePerceptionDecision,
  ActivePerceptionGoal,
  ActivePerceptionWeights,
  AgentBeliefState,
  BeliefRegion,
  ObservationCandidate,
  ObservationCandidateScore,
} from './types.js'

const SCORE_EPSILON = 1e-12

export const DEFAULT_ACTIVE_PERCEPTION_WEIGHTS: ActivePerceptionWeights = {
  informationGain: 0.45,
  routeDisambiguation: 0.25,
  movementCost: 0.1,
  acquisitionCost: 0.05,
  exposureRisk: 0.1,
  readinessCost: 0.05,
}

/** Binary entropy in bits. The probability must be within [0, 1]. */
export function binaryEntropy(probability: number): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('Binary entropy probability must be between 0 and 1')
  }
  if (probability === 0 || probability === 1) return 0
  return -probability * Math.log2(probability)
    - (1 - probability) * Math.log2(1 - probability)
}

/**
 * Convert the public belief representation into an uncertainty value in [0, 1].
 * Unknown, missing, and stale regions remain maximally uncertain. A current
 * free/occupied statement becomes less certain as its confidence approaches 0.
 */
export function beliefRegionUncertainty(region: BeliefRegion | undefined): number {
  if (!region || region.occupancy === 'unknown' || region.freshness === 'stale') return 1
  const confidence = clampUnit(region.confidence)
  const occupiedProbability = region.occupancy === 'occupied'
    ? 0.5 + confidence / 2
    : 0.5 - confidence / 2
  return binaryEntropy(occupiedProbability)
}

export function calculateGoalUncertainty(
  belief: AgentBeliefState,
  goal: ActivePerceptionGoal,
): number {
  const regionsById = new Map(
    belief.regions.map(region => [region.region.regionId, region] as const),
  )
  const relevantRegionIds = uniqueStrings(goal.relevantRegionIds)
  const totalWeight = relevantRegionIds.reduce(
    (total, regionId) => total + regionWeight(goal, regionId),
    0,
  )
  if (totalWeight === 0) return 0
  const weightedUncertainty = relevantRegionIds.reduce((total, regionId) => (
    total + regionWeight(goal, regionId)
      * beliefRegionUncertainty(regionsById.get(regionId))
  ), 0)
  return weightedUncertainty / totalWeight
}

export function shouldObserve(
  belief: AgentBeliefState,
  goal: ActivePerceptionGoal,
  observationCount = belief.appliedObservationIds.length,
): boolean {
  if (!Number.isInteger(goal.maximumObservationCount) || goal.maximumObservationCount <= 0) {
    return false
  }
  if (observationCount >= goal.maximumObservationCount) return false
  return calculateGoalUncertainty(belief, goal) > clampUnit(goal.uncertaintyThreshold)
}

export function scoreObservationCandidate(
  belief: AgentBeliefState,
  goal: ActivePerceptionGoal,
  candidate: ObservationCandidate,
  weights: ActivePerceptionWeights = DEFAULT_ACTIVE_PERCEPTION_WEIGHTS,
): ObservationCandidateScore {
  const invalidReasons = validateCandidate(candidate)
  const relevantRegionIds = uniqueStrings(goal.relevantRegionIds)
  const relevantRegionIdSet = new Set(relevantRegionIds)
  const coverageByRegion = new Map<string, number>()
  for (const coverage of candidate.predictedCoverage) {
    if (!relevantRegionIdSet.has(coverage.regionId)) continue
    coverageByRegion.set(
      coverage.regionId,
      Math.max(coverageByRegion.get(coverage.regionId) ?? 0, coverage.visibilityProbability),
    )
  }
  if (coverageByRegion.size === 0) invalidReasons.push('no-relevant-coverage')

  const regionsById = new Map(
    belief.regions.map(region => [region.region.regionId, region] as const),
  )
  const totalWeight = relevantRegionIds.reduce(
    (total, regionId) => total + regionWeight(goal, regionId),
    0,
  )
  let informationGain = 0
  let disambiguation = 0
  const coveredUnknownRegionIds: string[] = []
  for (const regionId of relevantRegionIds) {
    const coverage = coverageByRegion.get(regionId) ?? 0
    if (coverage <= 0) continue
    const beliefRegion = regionsById.get(regionId)
    const weight = regionWeight(goal, regionId)
    const uncertainty = beliefRegionUncertainty(beliefRegion)
    informationGain += weight * uncertainty * coverage
    if (isCategoricallyUnresolved(beliefRegion)) {
      disambiguation += weight * coverage
      coveredUnknownRegionIds.push(regionId)
    }
  }

  const readinessProbability = clampUnit(candidate.readinessProbability)
  const expectedInformationGain = totalWeight === 0
    ? 0
    : informationGain / totalWeight * readinessProbability
  const routeDisambiguation = totalWeight === 0
    ? 0
    : disambiguation / totalWeight * readinessProbability
  const movementCost = clampUnit(candidate.movementCost)
  const acquisitionCost = clampUnit(candidate.acquisitionCost)
  const exposureRisk = clampUnit(candidate.exposureRisk)
  const readinessCost = 1 - readinessProbability

  if (expectedInformationGain <= SCORE_EPSILON) {
    invalidReasons.push('no-expected-information-gain')
  }
  const valid = invalidReasons.length === 0
  const score = valid
    ? weights.informationGain * expectedInformationGain
      + weights.routeDisambiguation * routeDisambiguation
      - weights.movementCost * movementCost
      - weights.acquisitionCost * acquisitionCost
      - weights.exposureRisk * exposureRisk
      - weights.readinessCost * readinessCost
    : 0

  return {
    candidateId: candidate.candidateId,
    valid,
    score: cleanNumber(score),
    expectedInformationGain: cleanNumber(expectedInformationGain),
    routeDisambiguation: cleanNumber(routeDisambiguation),
    movementCost,
    acquisitionCost,
    exposureRisk,
    readinessCost: cleanNumber(readinessCost),
    coveredUnknownRegionIds,
    reasons: valid ? ['candidate-scored'] : uniqueStrings(invalidReasons),
  }
}

export function rankObservationCandidates(
  belief: AgentBeliefState,
  goal: ActivePerceptionGoal,
  candidates: readonly ObservationCandidate[],
  weights: ActivePerceptionWeights = DEFAULT_ACTIVE_PERCEPTION_WEIGHTS,
): ObservationCandidateScore[] {
  const candidateIdCounts = new Map<string, number>()
  for (const candidate of candidates) {
    candidateIdCounts.set(candidate.candidateId, (candidateIdCounts.get(candidate.candidateId) ?? 0) + 1)
  }
  return candidates
    .map((candidate) => {
      const scored = scoreObservationCandidate(belief, goal, candidate, weights)
      if ((candidateIdCounts.get(candidate.candidateId) ?? 0) <= 1) return scored
      return {
        ...scored,
        valid: false,
        score: 0,
        reasons: uniqueStrings([...scored.reasons, 'duplicate-candidate-id']),
      }
    })
    .sort(compareCandidateScores)
}

export function decideActivePerception(
  belief: AgentBeliefState,
  goal: ActivePerceptionGoal,
  candidates: readonly ObservationCandidate[],
  weights: ActivePerceptionWeights = DEFAULT_ACTIVE_PERCEPTION_WEIGHTS,
  observationCount = belief.appliedObservationIds.length,
): ActivePerceptionDecision {
  const scores = rankObservationCandidates(belief, goal, candidates, weights)
  const uncertainty = calculateGoalUncertainty(belief, goal)
  if (!Number.isInteger(goal.maximumObservationCount) || goal.maximumObservationCount <= 0) {
    return decision(false, 'observation-budget-disabled', belief, goal, scores)
  }
  if (observationCount >= goal.maximumObservationCount) {
    return decision(false, 'observation-budget-exhausted', belief, goal, scores)
  }
  if (uncertainty <= clampUnit(goal.uncertaintyThreshold)) {
    return decision(false, 'goal-uncertainty-within-threshold', belief, goal, scores)
  }
  const selected = scores.find(score => score.valid && score.score > SCORE_EPSILON)
  if (!selected) return decision(false, 'no-positive-utility-candidate', belief, goal, scores)
  return {
    goalId: goal.goalId,
    beliefRevision: belief.revision,
    shouldObserve: true,
    selectedCandidateId: selected.candidateId,
    scores,
    reason: 'selected-highest-scoring-information-gaining-candidate',
  }
}

function decision(
  shouldObserveValue: boolean,
  reason: string,
  belief: AgentBeliefState,
  goal: ActivePerceptionGoal,
  scores: ObservationCandidateScore[],
): ActivePerceptionDecision {
  return {
    goalId: goal.goalId,
    beliefRevision: belief.revision,
    shouldObserve: shouldObserveValue,
    scores,
    reason,
  }
}

function validateCandidate(candidate: ObservationCandidate): string[] {
  const reasons: string[] = []
  if (!candidate.candidateId.trim()) reasons.push('missing-candidate-id')
  if (!candidate.sensor.sensorId.trim()) reasons.push('missing-sensor-id')
  for (const [name, value] of [
    ['movement-cost', candidate.movementCost],
    ['acquisition-cost', candidate.acquisitionCost],
    ['exposure-risk', candidate.exposureRisk],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) reasons.push(`invalid-${name}`)
  }
  if (
    !Number.isFinite(candidate.readinessProbability)
    || candidate.readinessProbability < 0
    || candidate.readinessProbability > 1
  ) reasons.push('invalid-readiness-probability')
  if (candidate.predictedCoverage.length === 0) reasons.push('missing-predicted-coverage')
  for (const coverage of candidate.predictedCoverage) {
    if (!coverage.regionId.trim()) reasons.push('missing-coverage-region-id')
    if (
      !Number.isFinite(coverage.visibilityProbability)
      || coverage.visibilityProbability < 0
      || coverage.visibilityProbability > 1
    ) reasons.push(`invalid-visibility-probability:${coverage.regionId}`)
  }
  return uniqueStrings(reasons)
}

function isCategoricallyUnresolved(region: BeliefRegion | undefined): boolean {
  return !region || region.occupancy === 'unknown' || region.freshness === 'stale'
}

function regionWeight(goal: ActivePerceptionGoal, regionId: string): number {
  const weight = goal.regionWeights?.[regionId] ?? 1
  return Number.isFinite(weight) && weight > 0 ? weight : 1
}

function compareCandidateScores(
  left: ObservationCandidateScore,
  right: ObservationCandidateScore,
): number {
  if (left.valid !== right.valid) return left.valid ? -1 : 1
  if (Math.abs(left.score - right.score) > SCORE_EPSILON) return right.score - left.score
  if (
    Math.abs(left.expectedInformationGain - right.expectedInformationGain) > SCORE_EPSILON
  ) return right.expectedInformationGain - left.expectedInformationGain
  if (left.movementCost !== right.movementCost) return left.movementCost - right.movementCost
  return compareStrings(left.candidateId, right.candidateId)
}

function compareStrings(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function cleanNumber(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Object.is(value, -0) ? 0 : value
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}
