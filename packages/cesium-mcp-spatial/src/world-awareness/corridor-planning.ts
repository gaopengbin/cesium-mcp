import type {
  AgentBeliefState,
  BeliefFreshness,
  BeliefRegion,
  OccupancyState,
} from './types.js'

const COST_EPSILON = 1e-12

export interface CorridorTopologyEdge {
  edgeId: string
  fromNodeId: string
  toNodeId: string
  regionId: string
  baseCost: number
  bidirectional: boolean
}

export interface CorridorTopology {
  nodeIds: string[]
  edges: CorridorTopologyEdge[]
}

export type UnknownCorridorPolicy = 'reject' | 'allow-with-risk'

export interface CorridorPlanningPolicy {
  unknownPolicy: UnknownCorridorPolicy
  unknownRiskCost: number
  staleRiskCost: number
  minimumFreeConfidence: number
}

export const DEFAULT_CORRIDOR_PLANNING_POLICY: CorridorPlanningPolicy = {
  unknownPolicy: 'reject',
  unknownRiskCost: 100,
  staleRiskCost: 25,
  minimumFreeConfidence: 0.8,
}

export interface CorridorRouteRequest {
  belief: AgentBeliefState
  topology: CorridorTopology
  startNodeId: string
  goalNodeId: string
  policy?: Partial<CorridorPlanningPolicy>
}

export type CorridorTraversalReason =
  | 'current-free'
  | 'stale-free'
  | 'low-confidence-free-allowed-with-risk'
  | 'stale-low-confidence-free-allowed-with-risk'
  | 'low-confidence-free-rejected'
  | 'stale-low-confidence-free-rejected'
  | 'unknown-allowed-with-risk'
  | 'stale-unknown-allowed-with-risk'
  | 'occupied'
  | 'stale-occupied'
  | 'unknown-rejected'
  | 'stale-unknown-rejected'
  | 'missing-belief-rejected'
  | 'missing-belief-allowed-with-risk'

export interface CorridorEdgeEvaluation {
  edgeId: string
  regionId: string
  occupancy: OccupancyState
  freshness: BeliefFreshness
  confidence: number
  traversable: boolean
  baseCost: number
  riskCost: number
  totalCost: number
  reason: CorridorTraversalReason
}

export interface CorridorRouteSegment extends CorridorEdgeEvaluation {
  fromNodeId: string
  toNodeId: string
}

export interface CorridorBlockedEdge {
  edgeId: string
  regionId: string
  occupancy: OccupancyState
  freshness: BeliefFreshness
  reason: CorridorTraversalReason
}

export type CorridorRouteStatus = 'planned' | 'already-at-goal' | 'no-safe-route'

export interface CorridorRouteResult {
  status: CorridorRouteStatus
  shouldProceed: boolean
  reason: 'route-planned' | 'start-is-goal' | 'no-traversable-route'
  beliefRevision: number
  startNodeId: string
  goalNodeId: string
  nodeIds: string[]
  segments: CorridorRouteSegment[]
  totalBaseCost: number
  totalRiskCost: number
  totalCost: number
  blockedEdges: CorridorBlockedEdge[]
}

interface CorridorArc {
  edge: CorridorTopologyEdge
  evaluation: CorridorEdgeEvaluation
  fromNodeId: string
  toNodeId: string
}

interface RouteCandidate {
  nodeId: string
  nodeIds: string[]
  segments: CorridorRouteSegment[]
  totalBaseCost: number
  totalRiskCost: number
  totalCost: number
  signature: string
}

export function evaluateCorridorEdge(
  edge: CorridorTopologyEdge,
  beliefRegion: BeliefRegion | undefined,
  policy: CorridorPlanningPolicy = DEFAULT_CORRIDOR_PLANNING_POLICY,
): CorridorEdgeEvaluation {
  validateEdge(edge)
  validatePolicy(policy)

  if (!beliefRegion) {
    const allowed = policy.unknownPolicy === 'allow-with-risk'
    return evaluation(
      edge,
      'unknown',
      'current',
      0,
      allowed,
      allowed ? policy.unknownRiskCost : 0,
      allowed ? 'missing-belief-allowed-with-risk' : 'missing-belief-rejected',
    )
  }

  const occupancy = beliefRegion.occupancy
  const freshness = beliefRegion.freshness
  const confidence = clampConfidence(beliefRegion.confidence)
  if (occupancy === 'occupied') {
    return evaluation(
      edge,
      occupancy,
      freshness,
      confidence,
      false,
      0,
      freshness === 'stale' ? 'stale-occupied' : 'occupied',
    )
  }
  if (occupancy === 'free') {
    const stale = freshness === 'stale'
    if (confidence < policy.minimumFreeConfidence) {
      const allowed = policy.unknownPolicy === 'allow-with-risk'
      return evaluation(
        edge,
        occupancy,
        freshness,
        confidence,
        allowed,
        allowed ? policy.unknownRiskCost + (stale ? policy.staleRiskCost : 0) : 0,
        allowed
          ? stale
            ? 'stale-low-confidence-free-allowed-with-risk'
            : 'low-confidence-free-allowed-with-risk'
          : stale
            ? 'stale-low-confidence-free-rejected'
            : 'low-confidence-free-rejected',
      )
    }
    return evaluation(
      edge,
      occupancy,
      freshness,
      confidence,
      true,
      stale ? policy.staleRiskCost : 0,
      stale ? 'stale-free' : 'current-free',
    )
  }

  const allowed = policy.unknownPolicy === 'allow-with-risk'
  const stale = freshness === 'stale'
  const riskCost = allowed
    ? policy.unknownRiskCost + (stale ? policy.staleRiskCost : 0)
    : 0
  return evaluation(
    edge,
    occupancy,
    freshness,
    confidence,
    allowed,
    riskCost,
    allowed
      ? stale
        ? 'stale-unknown-allowed-with-risk'
        : 'unknown-allowed-with-risk'
      : stale
        ? 'stale-unknown-rejected'
        : 'unknown-rejected',
  )
}

export function planCorridorRoute(request: CorridorRouteRequest): CorridorRouteResult {
  validateRequest(request)
  const policy: CorridorPlanningPolicy = {
    ...DEFAULT_CORRIDOR_PLANNING_POLICY,
    ...request.policy,
  }
  validatePolicy(policy)
  const beliefByRegion = beliefRegionMap(request.belief)
  const evaluatedEdges = request.topology.edges
    .map(edge => ({
      edge,
      evaluation: evaluateCorridorEdge(edge, beliefByRegion.get(edge.regionId), policy),
    }))
    .sort((left, right) => compareStrings(left.edge.edgeId, right.edge.edgeId))
  const blockedEdges = evaluatedEdges
    .filter(item => !item.evaluation.traversable)
    .map(item => ({
      edgeId: item.edge.edgeId,
      regionId: item.edge.regionId,
      occupancy: item.evaluation.occupancy,
      freshness: item.evaluation.freshness,
      reason: item.evaluation.reason,
    }))

  if (request.startNodeId === request.goalNodeId) {
    return terminalResult(request, blockedEdges, 'already-at-goal', 'start-is-goal')
  }

  const arcsByNode = new Map<string, CorridorArc[]>()
  for (const { edge, evaluation: edgeEvaluation } of evaluatedEdges) {
    if (!edgeEvaluation.traversable) continue
    addArc(arcsByNode, {
      edge,
      evaluation: edgeEvaluation,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
    })
    if (edge.bidirectional) {
      addArc(arcsByNode, {
        edge,
        evaluation: edgeEvaluation,
        fromNodeId: edge.toNodeId,
        toNodeId: edge.fromNodeId,
      })
    }
  }
  for (const arcs of arcsByNode.values()) arcs.sort(compareArcs)

  const initial: RouteCandidate = {
    nodeId: request.startNodeId,
    nodeIds: [request.startNodeId],
    segments: [],
    totalBaseCost: 0,
    totalRiskCost: 0,
    totalCost: 0,
    signature: '',
  }
  const queue: RouteCandidate[] = [initial]
  const settled = new Set<string>()
  const bestByNode = new Map<string, RouteCandidate>([[request.startNodeId, initial]])

  while (queue.length > 0) {
    queue.sort(compareRouteCandidates)
    const current = queue.shift()!
    if (settled.has(current.nodeId)) continue
    const best = bestByNode.get(current.nodeId)
    if (best && compareRouteCandidates(current, best) > 0) continue
    settled.add(current.nodeId)

    if (current.nodeId === request.goalNodeId) {
      return {
        status: 'planned',
        shouldProceed: true,
        reason: 'route-planned',
        beliefRevision: request.belief.revision,
        startNodeId: request.startNodeId,
        goalNodeId: request.goalNodeId,
        nodeIds: current.nodeIds,
        segments: current.segments,
        totalBaseCost: cleanNumber(current.totalBaseCost),
        totalRiskCost: cleanNumber(current.totalRiskCost),
        totalCost: cleanNumber(current.totalCost),
        blockedEdges,
      }
    }

    for (const arc of arcsByNode.get(current.nodeId) ?? []) {
      if (settled.has(arc.toNodeId) || current.nodeIds.includes(arc.toNodeId)) continue
      const candidate = extendRoute(current, arc)
      const previous = bestByNode.get(candidate.nodeId)
      if (previous && compareRouteCandidates(candidate, previous) >= 0) continue
      bestByNode.set(candidate.nodeId, candidate)
      queue.push(candidate)
    }
  }

  return terminalResult(request, blockedEdges, 'no-safe-route', 'no-traversable-route')
}

function evaluation(
  edge: CorridorTopologyEdge,
  occupancy: OccupancyState,
  freshness: BeliefFreshness,
  confidence: number,
  traversable: boolean,
  riskCost: number,
  reason: CorridorTraversalReason,
): CorridorEdgeEvaluation {
  return {
    edgeId: edge.edgeId,
    regionId: edge.regionId,
    occupancy,
    freshness,
    confidence,
    traversable,
    baseCost: edge.baseCost,
    riskCost,
    totalCost: cleanNumber(edge.baseCost + riskCost),
    reason,
  }
}

function terminalResult(
  request: CorridorRouteRequest,
  blockedEdges: CorridorBlockedEdge[],
  status: Exclude<CorridorRouteStatus, 'planned'>,
  reason: Exclude<CorridorRouteResult['reason'], 'route-planned'>,
): CorridorRouteResult {
  return {
    status,
    shouldProceed: false,
    reason,
    beliefRevision: request.belief.revision,
    startNodeId: request.startNodeId,
    goalNodeId: request.goalNodeId,
    nodeIds: [request.startNodeId],
    segments: [],
    totalBaseCost: 0,
    totalRiskCost: 0,
    totalCost: 0,
    blockedEdges,
  }
}

function extendRoute(current: RouteCandidate, arc: CorridorArc): RouteCandidate {
  const segment: CorridorRouteSegment = {
    fromNodeId: arc.fromNodeId,
    toNodeId: arc.toNodeId,
    ...arc.evaluation,
  }
  const signaturePart = `${arc.edge.edgeId}:${arc.toNodeId}`
  return {
    nodeId: arc.toNodeId,
    nodeIds: [...current.nodeIds, arc.toNodeId],
    segments: [...current.segments, segment],
    totalBaseCost: current.totalBaseCost + arc.evaluation.baseCost,
    totalRiskCost: current.totalRiskCost + arc.evaluation.riskCost,
    totalCost: current.totalCost + arc.evaluation.totalCost,
    signature: current.signature
      ? `${current.signature}\u0000${signaturePart}`
      : signaturePart,
  }
}

function addArc(arcsByNode: Map<string, CorridorArc[]>, arc: CorridorArc): void {
  const arcs = arcsByNode.get(arc.fromNodeId) ?? []
  arcs.push(arc)
  arcsByNode.set(arc.fromNodeId, arcs)
}

function compareArcs(left: CorridorArc, right: CorridorArc): number {
  const edgeOrder = compareStrings(left.edge.edgeId, right.edge.edgeId)
  return edgeOrder !== 0 ? edgeOrder : compareStrings(left.toNodeId, right.toNodeId)
}

function compareRouteCandidates(left: RouteCandidate, right: RouteCandidate): number {
  if (Math.abs(left.totalCost - right.totalCost) > COST_EPSILON) {
    return left.totalCost - right.totalCost
  }
  if (Math.abs(left.totalRiskCost - right.totalRiskCost) > COST_EPSILON) {
    return left.totalRiskCost - right.totalRiskCost
  }
  if (Math.abs(left.totalBaseCost - right.totalBaseCost) > COST_EPSILON) {
    return left.totalBaseCost - right.totalBaseCost
  }
  return compareStrings(left.signature, right.signature)
}

function beliefRegionMap(belief: AgentBeliefState): Map<string, BeliefRegion> {
  const result = new Map<string, BeliefRegion>()
  for (const region of belief.regions) {
    const regionId = region.region.regionId
    if (result.has(regionId)) throw new Error(`Duplicate belief region ID: ${regionId}`)
    result.set(regionId, region)
  }
  return result
}

function validateRequest(request: CorridorRouteRequest): void {
  assertNonEmpty(request.startNodeId, 'Corridor route start node ID')
  assertNonEmpty(request.goalNodeId, 'Corridor route goal node ID')
  const nodeIds = new Set<string>()
  for (const nodeId of request.topology.nodeIds) {
    assertNonEmpty(nodeId, 'Corridor topology node ID')
    if (nodeIds.has(nodeId)) throw new Error(`Duplicate corridor topology node ID: ${nodeId}`)
    nodeIds.add(nodeId)
  }
  if (!nodeIds.has(request.startNodeId)) {
    throw new Error(`Corridor route start node not found: ${request.startNodeId}`)
  }
  if (!nodeIds.has(request.goalNodeId)) {
    throw new Error(`Corridor route goal node not found: ${request.goalNodeId}`)
  }

  const edgeIds = new Set<string>()
  for (const edge of request.topology.edges) {
    validateEdge(edge)
    if (edgeIds.has(edge.edgeId)) throw new Error(`Duplicate corridor edge ID: ${edge.edgeId}`)
    edgeIds.add(edge.edgeId)
    if (!nodeIds.has(edge.fromNodeId)) {
      throw new Error(`Corridor edge '${edge.edgeId}' references missing node: ${edge.fromNodeId}`)
    }
    if (!nodeIds.has(edge.toNodeId)) {
      throw new Error(`Corridor edge '${edge.edgeId}' references missing node: ${edge.toNodeId}`)
    }
  }
}

function validateEdge(edge: CorridorTopologyEdge): void {
  assertNonEmpty(edge.edgeId, 'Corridor edge ID')
  assertNonEmpty(edge.fromNodeId, 'Corridor edge source node ID')
  assertNonEmpty(edge.toNodeId, 'Corridor edge destination node ID')
  assertNonEmpty(edge.regionId, 'Corridor edge region ID')
  if (edge.fromNodeId === edge.toNodeId) {
    throw new Error(`Corridor edge '${edge.edgeId}' must connect distinct nodes`)
  }
  if (!Number.isFinite(edge.baseCost) || edge.baseCost < 0) {
    throw new Error(`Corridor edge '${edge.edgeId}' base cost must be a non-negative finite number`)
  }
}

function validatePolicy(policy: CorridorPlanningPolicy): void {
  if (policy.unknownPolicy !== 'reject' && policy.unknownPolicy !== 'allow-with-risk') {
    throw new Error(`Unsupported unknown corridor policy: ${String(policy.unknownPolicy)}`)
  }
  for (const [label, value] of [
    ['unknown risk cost', policy.unknownRiskCost],
    ['stale risk cost', policy.staleRiskCost],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Corridor ${label} must be a non-negative finite number`)
    }
  }
  if (
    !Number.isFinite(policy.minimumFreeConfidence)
    || policy.minimumFreeConfidence < 0
    || policy.minimumFreeConfidence > 1
  ) {
    throw new Error('Corridor minimum free confidence must be between 0 and 1')
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty`)
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function cleanNumber(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Object.is(value, -0) ? 0 : value
}

function compareStrings(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}
