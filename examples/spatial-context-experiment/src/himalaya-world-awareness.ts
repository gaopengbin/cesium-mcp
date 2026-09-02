import {
  applyWorldObservation,
  createAgentBeliefState,
  createVisualGroundingObservation,
} from 'cesium-mcp-spatial'
import type {
  AgentBeliefState,
  BeliefRegion,
  SpatialObject,
  SpatialRegion,
  WorldObservation,
} from 'cesium-mcp-spatial'
import type {
  HimalayaFlightDecisionRequest,
} from './himalaya-flight.js'
import type { VisualGroundingResult } from './visual-grounding-client.js'

export const HIMALAYA_WORLD_ID = 'himalaya-flight-world'
export const HIMALAYA_RISK_ENVELOPE_ID = 'himalaya-active-risk-envelope'
export const HIMALAYA_WORLD_REVISION = 2
const VISUAL_EVIDENCE_VALID_FOR_MS = 20_000

export interface HimalayaVisualGroundingUpdate {
  belief: AgentBeliefState
  observation: WorldObservation
  fusionObservation?: WorldObservation
  corridor: BeliefRegion
  positivelyGroundedObstacle: boolean
  rayCorroborated: boolean
  summary: string
}

export function applyHimalayaVisualGrounding(
  request: HimalayaFlightDecisionRequest,
  result: VisualGroundingResult,
  previousBelief?: AgentBeliefState,
): HimalayaVisualGroundingUpdate {
  if (!request.visualFrame) {
    throw new Error('Himalaya visual grounding requires an independent camera frame')
  }
  const resources = createHimalayaVisualResources(request)
  if (previousBelief && previousBelief.worldId !== HIMALAYA_WORLD_ID) {
    throw new Error('Previous Himalaya belief belongs to a different world')
  }
  const belief = previousBelief ?? createAgentBeliefState({
    beliefId: `himalaya-belief-${request.runId}`,
    worldId: HIMALAYA_WORLD_ID,
    createdAt: request.visualFrame.startedAt,
    regions: [resources.region],
  })
  const worldRevision = HIMALAYA_WORLD_REVISION + request.planRevision
  const observation = createVisualGroundingObservation({
    observationId: request.requestId,
    worldId: HIMALAYA_WORLD_ID,
    worldRevision,
    startedAt: request.visualFrame.startedAt,
    capturedAt: request.visualFrame.capturedAt,
    completedAt: request.visualFrame.completedAt,
    changedDuringObservation: request.visualFrame.changedDuringObservation,
    readiness: request.visualFrame.readiness,
    sensor: request.visualFrame.sensor,
    imageDigest: result.imageDigest,
    artifactRef: result.artifactRef,
    requestedObjectIds: [resources.object.objectId],
    requestedRegionIds: [resources.region.regionId],
    spatialObjects: [resources.object],
    spatialRegions: [resources.region],
    report: result.report,
    limitations: request.visualFrame.readiness === 'ready'
      ? []
      : ['Independent camera timed out before every scene resource became stable.'],
  })
  const update = applyWorldObservation(belief, observation, {
    defaultValidForMs: VISUAL_EVIDENCE_VALID_FOR_MS,
  })
  let finalBelief = update.state
  let fusionObservation: WorldObservation | undefined
  const visualObjectGrounded = observation.evidence.some(evidence => (
    evidence.kind === 'object'
    && evidence.object.objectId === resources.object.objectId
  ))
  const corroboratingRay = request.sensor.readings.find(reading => (
    Math.abs(reading.headingOffsetDegrees) <= 10
    && reading.hitType === 'no-fly-zone'
    && reading.objectId === resources.object.objectId
    && reading.hitDistanceMeters !== undefined
    && reading.hitDistanceMeters <= request.sensor.rangeMeters
  ))
  if (visualObjectGrounded && corroboratingRay) {
    fusionObservation = createVisualRayFusionObservation(
      request,
      resources.region,
      resources.object.objectId,
      Math.min(
        0.98,
        result.report.objects.find(item => item.objectId === resources.object.objectId)
          ?.confidence ?? 0,
      ),
    )
    finalBelief = applyWorldObservation(finalBelief, fusionObservation, {
      defaultValidForMs: VISUAL_EVIDENCE_VALID_FOR_MS,
    }).state
  }
  const corridor = finalBelief.regions.find(region => (
    region.region.regionId === HIMALAYA_RISK_ENVELOPE_ID
  ))
  if (!corridor) throw new Error('Visual grounding did not update the flight corridor belief')
  const currentVisualOccupancy = observation.evidence.some(evidence => (
    evidence.kind === 'region-occupancy'
    && evidence.region.regionId === HIMALAYA_RISK_ENVELOPE_ID
    && evidence.occupancy === 'occupied'
    && evidence.blockingObjectIds?.includes(resources.object.objectId)
  ))
  const positivelyGroundedObstacle = visualObjectGrounded
    && (currentVisualOccupancy || fusionObservation !== undefined)
  return {
    belief: finalBelief,
    observation,
    ...(fusionObservation ? { fusionObservation } : {}),
    corridor,
    positivelyGroundedObstacle,
    rayCorroborated: fusionObservation !== undefined,
    summary: positivelyGroundedObstacle
      ? `独立相机正向识别到 ${resources.object.name}，belief r${finalBelief.revision} 的当前走廊为 ${corridor.occupancy}。`
      : `本轮没有形成新的正向障碍证据；belief r${finalBelief.revision} 保守保留为 ${corridor.occupancy}/${corridor.freshness}。`,
  }
}

function createVisualRayFusionObservation(
  request: HimalayaFlightDecisionRequest,
  region: SpatialRegion,
  objectId: string,
  confidence: number,
): WorldObservation {
  if (!request.visualFrame) {
    throw new Error('Visual and ray fusion requires an independent camera frame')
  }
  const sensorId = 'himalaya-forward-ray-bundle'
  return {
    schemaVersion: 1,
    observationId: `${request.requestId}:visual-ray-fusion`,
    worldId: HIMALAYA_WORLD_ID,
    worldRevision: HIMALAYA_WORLD_REVISION + request.planRevision,
    startedAt: request.visualFrame.startedAt,
    completedAt: request.visualFrame.completedAt,
    changedDuringObservation: request.visualFrame.changedDuringObservation,
    readiness: request.visualFrame.readiness,
    sensors: [{
      sensorId,
      kind: 'ray',
      rangeMeters: request.sensor.rangeMeters,
    }],
    evidence: [{
      kind: 'region-occupancy',
      evidenceId: `${request.requestId}:visual-ray-occupied`,
      sensorId,
      sampledAt: request.visualFrame.completedAt,
      quality: 'derived',
      confidence,
      basis: 'positive-forward-ray-hit-corroborated-by-visual-object-grounding',
      region,
      occupancy: 'occupied',
      coverage: 'partial',
      blockingObjectIds: [objectId],
    }],
    limitations: [
      'Occupancy is fused from a positive object grounding and a matching forward ray hit.',
    ],
  }
}

export function createHimalayaVisualResources(
  request: HimalayaFlightDecisionRequest,
): { object: SpatialObject; region: SpatialRegion } {
  const obstacle = request.obstacle
  const radius = obstacle.horizontalRadiusMeters * 1.45
  const latitudeDelta = radius / 111_320
  const longitudeScale = Math.max(0.2, Math.cos(obstacle.latitude * Math.PI / 180))
  const longitudeDelta = radius / (111_320 * longitudeScale)
  const west = obstacle.longitude - longitudeDelta
  const east = obstacle.longitude + longitudeDelta
  const south = obstacle.latitude - latitudeDelta
  const north = obstacle.latitude + latitudeDelta
  const footprint: SpatialRegion['footprint'] = {
    type: 'Polygon',
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ]],
  }
  const observedAt = request.visualFrame?.capturedAt ?? request.requestedAt
  return {
    object: {
      objectId: obstacle.objectId,
      sourceType: 'entity',
      type: 'temporary-no-fly-zone',
      name: '临时禁飞区',
      geometry: {
        type: 'Point',
        coordinates: [obstacle.longitude, obstacle.latitude, obstacle.height],
      },
      centroid: [obstacle.longitude, obstacle.latitude, obstacle.height],
      bbox: [west, south, east, north],
      properties: {
        horizontalRadiusMeters: obstacle.horizontalRadiusMeters,
        verticalRadiusMeters: obstacle.verticalRadiusMeters,
        dynamic: true,
      },
      geometryQuality: 'derived',
      observedAt,
      revision: HIMALAYA_WORLD_REVISION + request.planRevision,
      provenance: {
        source: 'cesium-flight-scene',
        method: 'runtime-entity-snapshot',
      },
    },
    region: {
      regionId: HIMALAYA_RISK_ENVELOPE_ID,
      footprint,
      minHeight: obstacle.height - obstacle.verticalRadiusMeters,
      maxHeight: obstacle.height + obstacle.verticalRadiusMeters,
      properties: {
        purpose: 'active-maneuver-risk-envelope',
        candidateObstacleId: obstacle.objectId,
      },
    },
  }
}
