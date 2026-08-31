import type {
  SpatialObject,
  SpatialObjectQuery,
  SpatialRelation,
} from 'cesium-mcp-spatial'
import type { BridgeExecutor } from '../bridge.js'
import {
  createBridgeSpatialSnapshot,
  nearbySpatialObjects,
} from '../spatial-context.js'
import type {
  BridgeResult,
  CaptureObserverViewParams,
  ObservationImageMode,
  ObservationScope,
  ObservationVisualResult,
  ObserveSceneParams,
  ObserveSceneResult,
} from '../types.js'

const AUTO_IMAGE_LOCAL_HEIGHT_METERS = 100_000

const OBSERVATION_LIMITATIONS = [
  'Structured context includes Bridge-managed layers and entities only.',
  'View membership is geographic and does not prove pixel-level visibility or occlusion.',
  'Unloaded 3D Tiles features are not enumerated in this version.',
]

interface DescribeSceneParams {
  includeObjects?: boolean
  limit?: number
}

interface GetObjectContextParams {
  objectId: string
  nearbyRadiusMeters?: number
  nearbyLimit?: number
}

interface QuerySpatialRelationParams {
  subjectId: string
  objectId: string
  relation: SpatialRelation
  nearThresholdMeters?: number
}

interface GetViewContextParams {
  includeObjects?: boolean
  limit?: number
}

function validateObservationTarget(input: ObserveSceneParams): void {
  const hasObject = Boolean(input.targetObjectId?.trim())
  const hasLongitude = input.targetLongitude !== undefined
  const hasLatitude = input.targetLatitude !== undefined
  if (hasLongitude !== hasLatitude) {
    throw new Error('Observation target coordinates require both longitude and latitude')
  }
  if (hasObject && (hasLongitude || hasLatitude)) {
    throw new Error('Observation target must use either targetObjectId or coordinates, not both')
  }
}

function observationObjects(
  snapshot: ReturnType<typeof createBridgeSpatialSnapshot>,
  scope: ObservationScope,
  limit: number,
  targetObjectId?: string,
): SpatialObject[] {
  const selected = scope === 'scene'
    ? snapshot.context.query({ limit })
    : snapshot.viewBounds
      ? snapshot.context.query({ bbox: snapshot.viewBounds, limit })
      : []
  const target = targetObjectId ? snapshot.context.get(targetObjectId) : undefined
  if (!target || selected.some(object => object.objectId === target.objectId)) return selected
  return [target, ...selected].slice(0, limit)
}

function observationImageDecision(
  mode: ObservationImageMode,
  input: ObserveSceneParams,
  scope: ObservationScope,
  objects: readonly SpatialObject[],
  viewHeight: number,
): Pick<ObservationVisualResult, 'status' | 'reason'> {
  if (mode === 'never') return { status: 'skipped', reason: 'image-mode-never' }
  if (mode === 'always') return { status: 'captured', reason: 'image-mode-always' }
  if (input.targetObjectId || input.targetLongitude !== undefined) {
    return { status: 'captured', reason: 'auto-target-needs-visual-evidence' }
  }
  if (scope === 'view' && viewHeight <= AUTO_IMAGE_LOCAL_HEIGHT_METERS && objects.length === 0) {
    return { status: 'captured', reason: 'auto-local-view-has-no-structured-identity' }
  }
  return { status: 'skipped', reason: 'auto-structured-context-sufficient' }
}

function observerParamsForObservation(
  input: ObserveSceneParams,
  snapshot: ReturnType<typeof createBridgeSpatialSnapshot>,
): CaptureObserverViewParams {
  const common = {
    ...(input.targetHeight !== undefined ? { targetHeight: input.targetHeight } : {}),
    preset: input.preset ?? (snapshot.view.height <= AUTO_IMAGE_LOCAL_HEIGHT_METERS
      ? 'detail' as const
      : 'overview' as const),
    ...(input.range !== undefined ? { range: input.range } : {}),
    ...(input.heading !== undefined ? { heading: input.heading } : {}),
    ...(input.pitch !== undefined ? { pitch: input.pitch } : {}),
    ...(input.imageWidth !== undefined ? { imageWidth: input.imageWidth } : {}),
    ...(input.imageHeight !== undefined ? { imageHeight: input.imageHeight } : {}),
  }
  if (input.targetObjectId) return { ...common, targetObjectId: input.targetObjectId }
  if (input.targetLongitude !== undefined && input.targetLatitude !== undefined) {
    return {
      ...common,
      targetLongitude: input.targetLongitude,
      targetLatitude: input.targetLatitude,
    }
  }

  const longitude = snapshot.viewBounds
    ? (snapshot.viewBounds[0] + snapshot.viewBounds[2]) / 2
    : snapshot.view.longitude
  const latitude = snapshot.viewBounds
    ? (snapshot.viewBounds[1] + snapshot.viewBounds[3]) / 2
    : snapshot.view.latitude
  return { ...common, targetLongitude: longitude, targetLatitude: latitude }
}

async function observeScene(
  params: Record<string, unknown>,
  bridge: Parameters<BridgeExecutor>[1],
): Promise<BridgeResult> {
  const input = params as unknown as ObserveSceneParams
  validateObservationTarget(input)
  const scope = input.scope ?? 'view'
  const limit = Math.max(1, Math.min(input.limit ?? 50, 500))
  const imageMode = input.imageMode ?? 'auto'
  const snapshot = createBridgeSpatialSnapshot(bridge)
  if (input.targetObjectId && !snapshot.context.get(input.targetObjectId)) {
    throw new Error(`Spatial object not found: ${input.targetObjectId}`)
  }
  const objects = observationObjects(snapshot, scope, limit, input.targetObjectId)
  const decision = observationImageDecision(
    imageMode,
    input,
    scope,
    objects,
    snapshot.view.height,
  )
  let visual: ObservationVisualResult = {
    mode: imageMode,
    status: decision.status,
    reason: decision.reason,
  }

  if (decision.status === 'captured') {
    try {
      visual = {
        ...visual,
        evidence: await bridge.captureObserverView(
          observerParamsForObservation(input, snapshot),
        ),
      }
    } catch (error) {
      visual = {
        mode: imageMode,
        status: 'unavailable',
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const completedAt = new Date().toISOString()
  const finalSnapshot = createBridgeSpatialSnapshot(bridge)
  const changedDuringObservation = finalSnapshot.snapshotRevision !== snapshot.snapshotRevision
  const quality = changedDuringObservation
    ? 'approximate'
    : snapshot.readiness.state === 'ready'
      ? 'derived'
      : 'unknown'
  const basis = changedDuringObservation
    ? 'scene-changed-during-observation'
    : snapshot.readiness.state === 'ready'
      ? visual.status === 'captured'
        ? 'managed-scene-plus-independent-observer'
        : 'managed-scene-snapshot'
      : `scene-readiness-${snapshot.readiness.state}`
  const result: ObserveSceneResult = {
    observationId: `observation:${snapshot.snapshotRevision}:${completedAt}`,
    scope,
    scene: {
      summary: snapshot.context.describe(),
      ...(input.includeObjects === false ? {} : { objects }),
    },
    view: {
      camera: snapshot.view,
      ...(snapshot.viewBounds ? { bounds: snapshot.viewBounds } : {}),
      quality: snapshot.viewQuality,
      basis: snapshot.viewBasis,
    },
    readiness: snapshot.readiness,
    freshness: {
      sceneObservedAt: snapshot.observedAt,
      completedAt,
      ageMs: Math.max(0, Date.parse(completedAt) - Date.parse(snapshot.observedAt)),
      snapshotRevision: snapshot.snapshotRevision,
      changedDuringObservation,
    },
    visual,
    quality,
    basis,
    limitations: [
      ...OBSERVATION_LIMITATIONS,
      ...(visual.status === 'unavailable'
        ? ['Visual evidence was requested but could not be captured.']
        : []),
    ],
  }
  return {
    success: true,
    data: result,
    message: visual.status === 'captured'
      ? 'Grounded scene observation completed with visual evidence'
      : 'Grounded scene observation completed with structured evidence',
  }
}

export const perceptionExecutors = {
  observeScene,
  describeScene(params, bridge) {
    const input = params as unknown as DescribeSceneParams
    const snapshot = createBridgeSpatialSnapshot(bridge)
    const limit = input.limit ?? 50
    return {
      success: true,
      data: {
        summary: snapshot.context.describe(),
        ...(input.includeObjects
          ? { objects: snapshot.context.query({ limit }) }
          : {}),
      },
      message: 'Spatial scene context described',
    }
  },
  querySpatialObjects(params, bridge) {
    const snapshot = createBridgeSpatialSnapshot(bridge)
    const objects = snapshot.context.query(params as unknown as SpatialObjectQuery)
    return {
      success: true,
      data: { objects, total: objects.length },
      message: `${objects.length} spatial objects found`,
    }
  },
  getObjectContext(params, bridge) {
    const input = params as unknown as GetObjectContextParams
    const snapshot = createBridgeSpatialSnapshot(bridge)
    const object = snapshot.context.get(input.objectId)
    if (!object) {
      return {
        success: false,
        error: `Spatial object not found: ${input.objectId}`,
      }
    }
    return {
      success: true,
      data: {
        object,
        nearby: nearbySpatialObjects(
          snapshot.context,
          object,
          input.nearbyRadiusMeters ?? 1000,
          input.nearbyLimit ?? 10,
        ),
      },
      message: `Spatial context for '${input.objectId}'`,
    }
  },
  querySpatialRelation(params, bridge) {
    const input = params as unknown as QuerySpatialRelationParams
    const snapshot = createBridgeSpatialSnapshot(bridge)
    const result = snapshot.context.relate(
      input.subjectId,
      input.objectId,
      input.relation,
      { nearThresholdMeters: input.nearThresholdMeters },
    )
    return {
      success: true,
      data: result,
      message: `Spatial relation '${input.relation}' evaluated`,
    }
  },
  getViewContext(params, bridge) {
    const input = params as unknown as GetViewContextParams
    const snapshot = createBridgeSpatialSnapshot(bridge)
    const objects = snapshot.viewBounds
      ? snapshot.context.query({ bbox: snapshot.viewBounds, limit: input.limit ?? 50 })
      : []
    return {
      success: true,
      data: {
        view: snapshot.view,
        ...(snapshot.viewBounds ? { bounds: snapshot.viewBounds } : {}),
        summary: snapshot.context.describe(),
        ...(input.includeObjects === false ? {} : { objects }),
        quality: snapshot.viewQuality,
        basis: snapshot.viewBasis,
      },
      message: 'Current view context described',
    }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
