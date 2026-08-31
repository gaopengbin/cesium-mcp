import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CORRIDOR_PLANNING_POLICY,
  evaluateCorridorEdge,
  planCorridorRoute,
} from './corridor-planning.js'
import type {
  CorridorPlanningPolicy,
  CorridorTopology,
  CorridorTopologyEdge,
} from './corridor-planning.js'
import type {
  AgentBeliefState,
  BeliefRegion,
  SpatialRegion,
} from './types.js'

const observedAt = '2026-08-31T00:00:00.000Z'

function spatialRegion(regionId: string): SpatialRegion {
  return {
    regionId,
    footprint: {
      type: 'Polygon',
      coordinates: [[
        [86.7, 27.8],
        [86.71, 27.8],
        [86.71, 27.81],
        [86.7, 27.81],
        [86.7, 27.8],
      ]],
    },
  }
}

function beliefRegion(
  regionId: string,
  occupancy: BeliefRegion['occupancy'],
  freshness: BeliefRegion['freshness'] = 'current',
  confidence = occupancy === 'unknown' ? 0 : 1,
): BeliefRegion {
  return {
    region: spatialRegion(regionId),
    occupancy,
    freshness,
    confidence,
    blockingObjectIds: occupancy === 'occupied' ? [`blocker:${regionId}`] : [],
    ...(occupancy === 'unknown' ? { unknownReason: 'not-observed' as const } : {}),
    evidence: [],
  }
}

function belief(regions: BeliefRegion[]): AgentBeliefState {
  return {
    schemaVersion: 1,
    beliefId: 'corridor-belief',
    worldId: 'corridor-world',
    revision: 7,
    createdAt: observedAt,
    updatedAt: observedAt,
    objects: [],
    regions,
    appliedObservationIds: [],
    conflicts: [],
  }
}

function edge(
  edgeId: string,
  fromNodeId: string,
  toNodeId: string,
  regionId: string,
  baseCost = 1,
  bidirectional = true,
): CorridorTopologyEdge {
  return { edgeId, fromNodeId, toNodeId, regionId, baseCost, bidirectional }
}

function topology(edges: CorridorTopologyEdge[]): CorridorTopology {
  return {
    nodeIds: [...new Set(edges.flatMap(item => [item.fromNodeId, item.toNodeId]))],
    edges,
  }
}

describe('belief-only corridor planning', () => {
  it('prefers current free corridors over stale and unknown alternatives', () => {
    const graph = topology([
      edge('free-start', 'start', 'free-mid', 'free-a', 2),
      edge('free-finish', 'free-mid', 'goal', 'free-b', 2),
      edge('stale-start', 'start', 'stale-mid', 'stale-a', 1),
      edge('stale-finish', 'stale-mid', 'goal', 'stale-b', 1),
      edge('unknown-direct', 'start', 'goal', 'unknown', 1),
    ])
    const state = belief([
      beliefRegion('free-a', 'free'),
      beliefRegion('free-b', 'free'),
      beliefRegion('stale-a', 'free', 'stale'),
      beliefRegion('stale-b', 'free', 'stale'),
      beliefRegion('unknown', 'unknown'),
    ])

    const result = planCorridorRoute({
      belief: state,
      topology: graph,
      startNodeId: 'start',
      goalNodeId: 'goal',
      policy: { unknownPolicy: 'allow-with-risk' },
    })

    expect(result).toMatchObject({
      status: 'planned',
      shouldProceed: true,
      reason: 'route-planned',
      beliefRevision: 7,
      nodeIds: ['start', 'free-mid', 'goal'],
      totalBaseCost: 4,
      totalRiskCost: 0,
      totalCost: 4,
    })
    expect(result.segments.every(segment => segment.reason === 'current-free')).toBe(true)
  })

  it('forbids both current and stale occupied regions', () => {
    const policy = DEFAULT_CORRIDOR_PLANNING_POLICY
    const current = evaluateCorridorEdge(
      edge('current', 'a', 'b', 'occupied-current'),
      beliefRegion('occupied-current', 'occupied'),
      policy,
    )
    const stale = evaluateCorridorEdge(
      edge('stale', 'a', 'b', 'occupied-stale'),
      beliefRegion('occupied-stale', 'occupied', 'stale'),
      policy,
    )

    expect(current).toMatchObject({ traversable: false, reason: 'occupied' })
    expect(stale).toMatchObject({
      occupancy: 'occupied',
      freshness: 'stale',
      traversable: false,
      reason: 'stale-occupied',
    })
  })

  it('rejects unknown corridors by default and terminates without an unsafe route', () => {
    const graph = topology([edge('blind', 'start', 'goal', 'blind-region')])
    const result = planCorridorRoute({
      belief: belief([beliefRegion('blind-region', 'unknown')]),
      topology: graph,
      startNodeId: 'start',
      goalNodeId: 'goal',
    })

    expect(result).toMatchObject({
      status: 'no-safe-route',
      shouldProceed: false,
      reason: 'no-traversable-route',
      nodeIds: ['start'],
      segments: [],
      totalCost: 0,
      blockedEdges: [{
        edgeId: 'blind',
        occupancy: 'unknown',
        reason: 'unknown-rejected',
      }],
    })
  })

  it('can allow unknown corridors with an explicit risk cost', () => {
    const graph = topology([edge('blind', 'start', 'goal', 'blind-region', 3)])
    const result = planCorridorRoute({
      belief: belief([beliefRegion('blind-region', 'unknown')]),
      topology: graph,
      startNodeId: 'start',
      goalNodeId: 'goal',
      policy: {
        unknownPolicy: 'allow-with-risk',
        unknownRiskCost: 40,
      },
    })

    expect(result).toMatchObject({
      status: 'planned',
      totalBaseCost: 3,
      totalRiskCost: 40,
      totalCost: 43,
      segments: [{
        occupancy: 'unknown',
        freshness: 'current',
        riskCost: 40,
        reason: 'unknown-allowed-with-risk',
      }],
    })
  })

  it('retains stale occupancy semantics and adds risk to stale free space', () => {
    const policy: CorridorPlanningPolicy = {
      unknownPolicy: 'allow-with-risk',
      unknownRiskCost: 40,
      staleRiskCost: 9,
      minimumFreeConfidence: 0.8,
    }
    const staleFree = evaluateCorridorEdge(
      edge('stale-free', 'a', 'b', 'stale-free-region', 2),
      beliefRegion('stale-free-region', 'free', 'stale'),
      policy,
    )
    const staleUnknown = evaluateCorridorEdge(
      edge('stale-unknown', 'a', 'b', 'stale-unknown-region', 2),
      beliefRegion('stale-unknown-region', 'unknown', 'stale'),
      policy,
    )

    expect(staleFree).toMatchObject({
      occupancy: 'free',
      freshness: 'stale',
      traversable: true,
      riskCost: 9,
      totalCost: 11,
      reason: 'stale-free',
    })
    expect(staleUnknown).toMatchObject({
      occupancy: 'unknown',
      freshness: 'stale',
      traversable: true,
      riskCost: 49,
      reason: 'stale-unknown-allowed-with-risk',
    })
  })

  it('rejects low-confidence free claims unless risky traversal is explicit', () => {
    const lowConfidence = beliefRegion('low-confidence', 'free', 'current', 0.4)
    const rejected = evaluateCorridorEdge(
      edge('low-confidence', 'a', 'b', 'low-confidence', 2),
      lowConfidence,
    )
    const allowed = evaluateCorridorEdge(
      edge('low-confidence', 'a', 'b', 'low-confidence', 2),
      lowConfidence,
      {
        ...DEFAULT_CORRIDOR_PLANNING_POLICY,
        unknownPolicy: 'allow-with-risk',
        unknownRiskCost: 40,
      },
    )

    expect(rejected).toMatchObject({
      traversable: false,
      reason: 'low-confidence-free-rejected',
    })
    expect(allowed).toMatchObject({
      traversable: true,
      riskCost: 40,
      totalCost: 42,
      reason: 'low-confidence-free-allowed-with-risk',
    })
  })

  it('treats a missing belief region as unknown instead of free', () => {
    const graph = topology([edge('unobserved', 'start', 'goal', 'not-in-belief')])
    const rejected = planCorridorRoute({
      belief: belief([]),
      topology: graph,
      startNodeId: 'start',
      goalNodeId: 'goal',
    })
    const allowed = planCorridorRoute({
      belief: belief([]),
      topology: graph,
      startNodeId: 'start',
      goalNodeId: 'goal',
      policy: { unknownPolicy: 'allow-with-risk', unknownRiskCost: 12 },
    })

    expect(rejected.blockedEdges[0]!.reason).toBe('missing-belief-rejected')
    expect(allowed.segments[0]).toMatchObject({
      occupancy: 'unknown',
      riskCost: 12,
      reason: 'missing-belief-allowed-with-risk',
    })
  })

  it('uses deterministic edge IDs to break equal-cost ties regardless of input order', () => {
    const routeA = [
      edge('a-1', 'start', 'a-mid', 'a-1-region'),
      edge('a-2', 'a-mid', 'goal', 'a-2-region'),
    ]
    const routeB = [
      edge('b-1', 'start', 'b-mid', 'b-1-region'),
      edge('b-2', 'b-mid', 'goal', 'b-2-region'),
    ]
    const state = belief([
      beliefRegion('a-1-region', 'free'),
      beliefRegion('a-2-region', 'free'),
      beliefRegion('b-1-region', 'free'),
      beliefRegion('b-2-region', 'free'),
    ])
    const first = planCorridorRoute({
      belief: state,
      topology: topology([...routeB, ...routeA]),
      startNodeId: 'start',
      goalNodeId: 'goal',
    })
    const second = planCorridorRoute({
      belief: state,
      topology: topology([...routeA].reverse().concat([...routeB].reverse())),
      startNodeId: 'start',
      goalNodeId: 'goal',
    })

    expect(first.nodeIds).toEqual(['start', 'a-mid', 'goal'])
    expect(first.segments.map(segment => segment.edgeId)).toEqual(['a-1', 'a-2'])
    expect(second.nodeIds).toEqual(first.nodeIds)
    expect(second.segments.map(segment => segment.edgeId))
      .toEqual(first.segments.map(segment => segment.edgeId))
  })

  it('handles cycles and disconnected goals with finite safe termination', () => {
    const graph: CorridorTopology = {
      nodeIds: ['start', 'loop-a', 'loop-b', 'goal'],
      edges: [
        edge('loop-1', 'start', 'loop-a', 'free-1', 0),
        edge('loop-2', 'loop-a', 'loop-b', 'free-2', 0),
        edge('loop-3', 'loop-b', 'start', 'free-3', 0),
      ],
    }
    const result = planCorridorRoute({
      belief: belief([
        beliefRegion('free-1', 'free'),
        beliefRegion('free-2', 'free'),
        beliefRegion('free-3', 'free'),
      ]),
      topology: graph,
      startNodeId: 'start',
      goalNodeId: 'goal',
    })

    expect(result).toMatchObject({
      status: 'no-safe-route',
      shouldProceed: false,
      segments: [],
    })
  })

  it('terminates safely when the start already equals the goal', () => {
    const result = planCorridorRoute({
      belief: belief([]),
      topology: { nodeIds: ['home'], edges: [] },
      startNodeId: 'home',
      goalNodeId: 'home',
    })

    expect(result).toMatchObject({
      status: 'already-at-goal',
      shouldProceed: false,
      reason: 'start-is-goal',
      nodeIds: ['home'],
      segments: [],
    })
  })

  it('never inspects hidden truth metadata and does not mutate inputs', () => {
    const publicEdge = edge('public', 'start', 'goal', 'free-region') as CorridorTopologyEdge & {
      truth?: unknown
    }
    Object.defineProperty(publicEdge, 'truth', {
      configurable: true,
      get() {
        throw new Error('planner attempted to read authoritative truth')
      },
    })
    const graph = topology([publicEdge])
    const state = belief([beliefRegion('free-region', 'free')])
    const graphJson = JSON.stringify({ nodeIds: graph.nodeIds, edges: graph.edges.map(item => ({
      edgeId: item.edgeId,
      fromNodeId: item.fromNodeId,
      toNodeId: item.toNodeId,
      regionId: item.regionId,
      baseCost: item.baseCost,
      bidirectional: item.bidirectional,
    })) })
    const beliefJson = JSON.stringify(state)

    expect(planCorridorRoute({
      belief: state,
      topology: graph,
      startNodeId: 'start',
      goalNodeId: 'goal',
    }).status).toBe('planned')
    expect(JSON.stringify(state)).toBe(beliefJson)
    expect(JSON.stringify({ nodeIds: graph.nodeIds, edges: graph.edges.map(item => ({
      edgeId: item.edgeId,
      fromNodeId: item.fromNodeId,
      toNodeId: item.toNodeId,
      regionId: item.regionId,
      baseCost: item.baseCost,
      bidirectional: item.bidirectional,
    })) })).toBe(graphJson)
  })

  it('rejects malformed topology and unsafe policy values', () => {
    expect(() => planCorridorRoute({
      belief: belief([]),
      topology: {
        nodeIds: ['start', 'goal'],
        edges: [edge('bad', 'start', 'goal', 'region', -1)],
      },
      startNodeId: 'start',
      goalNodeId: 'goal',
    })).toThrow('non-negative finite')

    expect(() => planCorridorRoute({
      belief: belief([]),
      topology: {
        nodeIds: ['start', 'goal'],
        edges: [edge('duplicate', 'start', 'goal', 'region-1'), edge('duplicate', 'start', 'goal', 'region-2')],
      },
      startNodeId: 'start',
      goalNodeId: 'goal',
    })).toThrow('Duplicate corridor edge ID')

    expect(() => planCorridorRoute({
      belief: belief([]),
      topology: { nodeIds: ['start', 'goal'], edges: [] },
      startNodeId: 'start',
      goalNodeId: 'goal',
      policy: { staleRiskCost: Number.NaN },
    })).toThrow('non-negative finite')
  })
})
