import { createSpatialContext } from '../context.js'
import type {
  SpatialGeometry,
  SpatialObject,
  SpatialObjectQuery,
  SpatialRelation,
  SpatialRelationOptions,
} from '../types.js'

export const SCENE_RESOURCE_ID = 'urban-flood-response-v2'
export const SCENE_LAYER_ID = 'urban-flood-response'

export const SCHOOL_OBJECT_ID = `entity:${SCENE_LAYER_ID}:school_1`
export const HOSPITAL_OBJECT_ID = `entity:${SCENE_LAYER_ID}:hospital_1`
export const SHELTER_OBJECT_ID = `entity:${SCENE_LAYER_ID}:shelter_1`
export const FLOOD_OBJECT_ID = `entity:${SCENE_LAYER_ID}:flood_zone_1`
export const COMMUNITY_OBJECT_ID = `entity:${SCENE_LAYER_ID}:community_1`
export const PRIMARY_ROUTE_OBJECT_ID = `entity:${SCENE_LAYER_ID}:evacuation_primary`
export const PUMP_STATION_OBJECT_ID = `entity:${SCENE_LAYER_ID}:pump_station_1`

export const SCHOOL_POSITION: [number, number] = [116.405, 39.9]
export const EMERGENCY_VIEW_BOUNDS: [number, number, number, number] = [
  116.37,
  39.88,
  116.44,
  39.92,
]

export const FLOOD_BASELINE_RING: Array<[number, number]> = [
  [116.385, 39.887],
  [116.4, 39.887],
  [116.4, 39.913],
  [116.385, 39.913],
  [116.385, 39.887],
]

export const FLOOD_EXPANDED_RING: Array<[number, number]> = [
  [116.385, 39.887],
  [116.413, 39.887],
  [116.413, 39.913],
  [116.385, 39.913],
  [116.385, 39.887],
]

export type EmergencyResponseStage = 'baseline' | 'expanded'

export interface EmergencyResponseFeature {
  type: 'Feature'
  id: string
  properties: Record<string, unknown>
  geometry: SpatialGeometry
}

export interface EmergencyResponseGeoJson {
  type: 'FeatureCollection'
  features: EmergencyResponseFeature[]
}

const COMMUNITY_RING: Array<[number, number]> = [
  [116.401, 39.895],
  [116.411, 39.895],
  [116.411, 39.905],
  [116.401, 39.905],
  [116.401, 39.895],
]

const STATIC_FEATURES: readonly EmergencyResponseFeature[] = [
  {
    type: 'Feature',
    id: 'community_1',
    properties: {
      name: '滨河社区',
      semanticType: 'residential-zone',
      population: 2400,
      vulnerability: 'high',
    },
    geometry: { type: 'Polygon', coordinates: [COMMUNITY_RING] },
  },
  {
    type: 'Feature',
    id: 'river_channel_1',
    properties: {
      name: '清河河道',
      semanticType: 'river',
      waterLevelMeters: 4.7,
      trend: 'rising',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [116.386, 39.882],
        [116.389, 39.891],
        [116.392, 39.901],
        [116.395, 39.915],
      ],
    },
  },
  {
    type: 'Feature',
    id: 'evacuation_primary',
    properties: {
      name: '东向主疏散路线',
      semanticType: 'evacuation-route',
      status: 'open',
      capacityPerHour: 900,
      priority: 'primary',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        SCHOOL_POSITION,
        [116.411, 39.899],
        [116.417, 39.894],
      ],
    },
  },
  {
    type: 'Feature',
    id: 'evacuation_backup',
    properties: {
      name: '北向备用疏散路线',
      semanticType: 'evacuation-route',
      status: 'open',
      capacityPerHour: 520,
      priority: 'backup',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        SCHOOL_POSITION,
        [116.416, 39.906],
        [116.425, 39.91],
      ],
    },
  },
  {
    type: 'Feature',
    id: 'school_1',
    properties: {
      name: '滨河学校',
      semanticType: 'school',
      students: 800,
      priority: 'critical',
    },
    geometry: { type: 'Point', coordinates: SCHOOL_POSITION },
  },
  {
    type: 'Feature',
    id: 'hospital_1',
    properties: {
      name: '市立医院',
      semanticType: 'hospital',
      beds: 200,
      status: 'operational',
    },
    geometry: { type: 'Point', coordinates: [116.425, 39.91] },
  },
  {
    type: 'Feature',
    id: 'shelter_1',
    properties: {
      name: '东城应急避难点',
      semanticType: 'shelter',
      capacity: 1200,
      occupancy: 180,
      status: 'ready',
    },
    geometry: { type: 'Point', coordinates: [116.417, 39.894] },
  },
  {
    type: 'Feature',
    id: 'fire_station_1',
    properties: {
      name: '东城消防站',
      semanticType: 'fire-station',
      teamsAvailable: 4,
      status: 'ready',
    },
    geometry: { type: 'Point', coordinates: [116.438, 39.899] },
  },
  {
    type: 'Feature',
    id: 'pump_station_1',
    properties: {
      name: '滨河泵站',
      semanticType: 'pump-station',
      capacityCubicMetersPerHour: 7200,
      status: 'operational',
    },
    geometry: { type: 'Point', coordinates: [116.397, 39.89] },
  },
  {
    type: 'Feature',
    id: 'gauge_1',
    properties: {
      name: '清河水位监测站',
      semanticType: 'water-gauge',
      waterLevelMeters: 4.7,
      warningLevelMeters: 5.1,
      trend: 'rising',
    },
    geometry: { type: 'Point', coordinates: [116.392, 39.899] },
  },
  {
    type: 'Feature',
    id: 'bridge_1',
    properties: {
      name: '滨河桥',
      semanticType: 'bridge',
      status: 'monitored',
      clearanceMeters: 1.4,
    },
    geometry: { type: 'Point', coordinates: [116.4, 39.9] },
  },
]

function cloneGeometry(geometry: SpatialGeometry): SpatialGeometry {
  if (geometry.type === 'Point') {
    return { type: 'Point', coordinates: [...geometry.coordinates] as [number, number] }
  }
  if (geometry.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: geometry.coordinates.map(coordinate => [...coordinate] as [number, number]),
    }
  }
  return {
    type: 'Polygon',
    coordinates: geometry.coordinates.map(ring => (
      ring.map(coordinate => [...coordinate] as [number, number])
    )),
  }
}

export function createEmergencyResponseFeatures(
  stage: EmergencyResponseStage = 'baseline',
): EmergencyResponseFeature[] {
  const floodRing = stage === 'expanded' ? FLOOD_EXPANDED_RING : FLOOD_BASELINE_RING
  const floodFeature: EmergencyResponseFeature = {
    type: 'Feature',
    id: 'flood_zone_1',
    properties: {
      name: stage === 'expanded' ? '洪水预警区（扩大）' : '洪水预警区',
      semanticType: 'risk-zone',
      risk: 'high',
      source: 'forecast-model',
      forecastStage: stage,
    },
    geometry: { type: 'Polygon', coordinates: [floodRing] },
  }
  return [floodFeature, ...STATIC_FEATURES].map(feature => ({
    ...feature,
    properties: { ...feature.properties },
    geometry: cloneGeometry(feature.geometry),
  }))
}

export function createEmergencyResponseGeoJson(
  stage: EmergencyResponseStage = 'baseline',
): EmergencyResponseGeoJson {
  return {
    type: 'FeatureCollection',
    features: createEmergencyResponseFeatures(stage),
  }
}

function geometryMethod(geometry: SpatialGeometry): string {
  if (geometry.type === 'Point') return 'entity-position'
  if (geometry.type === 'LineString') return 'entity-linear-positions'
  return 'entity-polygon-positions'
}

export function createEmergencyResponseObjects(
  stage: EmergencyResponseStage = 'baseline',
): SpatialObject[] {
  const observedAt = stage === 'expanded'
    ? '2026-08-27T00:15:00.000Z'
    : '2026-08-27T00:00:00.000Z'
  const layerObject: SpatialObject = {
    objectId: `layer:${SCENE_LAYER_ID}`,
    sourceType: 'layer',
    type: 'geojson',
    name: '城市内涝应急响应',
    layerId: SCENE_LAYER_ID,
    resourceId: SCENE_RESOURCE_ID,
    properties: { visible: true, color: '#ef6a5b' },
    geometryQuality: 'unknown',
    observedAt,
    revision: 1,
    provenance: { source: 'cesium-bridge', method: 'layer-manager' },
  }

  return [
    layerObject,
    ...createEmergencyResponseFeatures(stage).map(feature => ({
      objectId: `entity:${SCENE_LAYER_ID}:${feature.id}`,
      sourceType: 'geojson' as const,
      type: String(feature.properties.semanticType),
      name: String(feature.properties.name),
      layerId: SCENE_LAYER_ID,
      resourceId: SCENE_RESOURCE_ID,
      geometry: feature.geometry,
      properties: { ...feature.properties },
      geometryQuality: 'exact' as const,
      observedAt,
      revision: feature.id === 'flood_zone_1' && stage === 'expanded' ? 2 : 1,
      provenance: {
        source: SCENE_LAYER_ID,
        method: geometryMethod(feature.geometry),
      },
    })),
  ]
}

export interface SpatialRelationEvaluationCase {
  name: string
  subjectId: string
  objectId: string
  relation: SpatialRelation
  options?: SpatialRelationOptions
  expectedValue: boolean | number | null
  expectedQuality: SpatialObject['geometryQuality']
  expectedBasis: string
}

export function emergencyRelationCases(
  stage: EmergencyResponseStage,
): readonly SpatialRelationEvaluationCase[] {
  const expanded = stage === 'expanded'
  return [
    {
      name: `school is ${expanded ? 'inside' : 'outside'} the forecast flood zone`,
      subjectId: SCHOOL_OBJECT_ID,
      objectId: FLOOD_OBJECT_ID,
      relation: 'within',
      expectedValue: expanded,
      expectedQuality: 'exact',
      expectedBasis: 'point-in-polygon',
    },
    {
      name: 'school remains near the emergency shelter',
      subjectId: SCHOOL_OBJECT_ID,
      objectId: SHELTER_OBJECT_ID,
      relation: 'near',
      options: { nearThresholdMeters: 1800 },
      expectedValue: true,
      expectedQuality: 'exact',
      expectedBasis: 'geodesic-point',
    },
    {
      name: `primary route ${expanded ? 'intersects' : 'avoids'} the forecast flood bounds`,
      subjectId: PRIMARY_ROUTE_OBJECT_ID,
      objectId: FLOOD_OBJECT_ID,
      relation: 'intersects',
      expectedValue: expanded,
      expectedQuality: 'approximate',
      expectedBasis: 'bounding-box',
    },
    {
      name: 'pump station remains inside the baseline flood zone',
      subjectId: PUMP_STATION_OBJECT_ID,
      objectId: FLOOD_OBJECT_ID,
      relation: 'within',
      expectedValue: true,
      expectedQuality: 'exact',
      expectedBasis: 'point-in-polygon',
    },
  ]
}

export interface SpatialQueryEvaluationCase {
  name: string
  query: SpatialObjectQuery
  expectedObjectIds: readonly string[]
}

export const emergencyQueryCases: readonly SpatialQueryEvaluationCase[] = [
  {
    name: 'find the high-risk forecast object',
    query: { propertyEquals: { risk: 'high' } },
    expectedObjectIds: [FLOOD_OBJECT_ID],
  },
  {
    name: 'find response facilities near the school',
    query: {
      types: ['school', 'hospital', 'shelter', 'fire-station'],
      near: { longitude: SCHOOL_POSITION[0], latitude: SCHOOL_POSITION[1], radiusMeters: 2500 },
    },
    expectedObjectIds: [SCHOOL_OBJECT_ID, HOSPITAL_OBJECT_ID, SHELTER_OBJECT_ID],
  },
]

export interface EmergencyEvaluationAssertion {
  id: string
  tool: 'describeScene' | 'querySpatialObjects' | 'getObjectContext' | 'querySpatialRelation' | 'getViewContext'
  passed: boolean
  expected: unknown
  actual: unknown
  quality?: string
  basis?: string
}

export interface EmergencyEvaluationStageReport {
  stage: EmergencyResponseStage
  passed: boolean
  assertions: EmergencyEvaluationAssertion[]
}

export interface EmergencyEvaluationReport {
  schemaVersion: 1
  scenario: 'urban-flood-response'
  passed: boolean
  stages: EmergencyEvaluationStageReport[]
}

function evaluationStage(stage: EmergencyResponseStage): EmergencyEvaluationStageReport {
  const observedAt = stage === 'expanded'
    ? '2026-08-27T00:15:00.000Z'
    : '2026-08-27T00:00:00.000Z'
  const objects = createEmergencyResponseObjects(stage)
  const context = createSpatialContext(objects, () => new Date(observedAt))
  const summary = context.describe()
  const highRiskIds = context.query({ propertyEquals: { risk: 'high' } })
    .map(object => object.objectId)
  const nearbyFacilityIds = context.query({
    types: ['hospital', 'shelter', 'fire-station'],
    near: {
      longitude: SCHOOL_POSITION[0],
      latitude: SCHOOL_POSITION[1],
      radiusMeters: 2500,
    },
  }).map(object => object.objectId)
  const schoolWithinFlood = context.relate(SCHOOL_OBJECT_ID, FLOOD_OBJECT_ID, 'within')
  const routeIntersectsFlood = context.relate(
    PRIMARY_ROUTE_OBJECT_ID,
    FLOOD_OBJECT_ID,
    'intersects',
  )
  const viewObjectIds = context.query({ bbox: EMERGENCY_VIEW_BOUNDS, limit: 50 })
    .map(object => object.objectId)
  const lineageCount = objects.filter(object => (
    object.layerId === SCENE_LAYER_ID && object.resourceId === SCENE_RESOURCE_ID
  )).length
  const expanded = stage === 'expanded'
  const assertions: EmergencyEvaluationAssertion[] = [
    {
      id: 'scene-inventory',
      tool: 'describeScene',
      passed: summary.objectCount === 13 && lineageCount === 13,
      expected: { objectCount: 13, lineageCount: 13 },
      actual: { objectCount: summary.objectCount, lineageCount },
    },
    {
      id: 'high-risk-query',
      tool: 'querySpatialObjects',
      passed: highRiskIds.length === 1 && highRiskIds[0] === FLOOD_OBJECT_ID,
      expected: [FLOOD_OBJECT_ID],
      actual: highRiskIds,
    },
    {
      id: 'school-response-context',
      tool: 'getObjectContext',
      passed: nearbyFacilityIds.includes(HOSPITAL_OBJECT_ID)
        && nearbyFacilityIds.includes(SHELTER_OBJECT_ID),
      expected: { includes: [HOSPITAL_OBJECT_ID, SHELTER_OBJECT_ID] },
      actual: nearbyFacilityIds,
    },
    {
      id: 'school-flood-relation',
      tool: 'querySpatialRelation',
      passed: schoolWithinFlood.value === expanded
        && schoolWithinFlood.quality === 'exact'
        && schoolWithinFlood.basis === 'point-in-polygon',
      expected: { value: expanded, quality: 'exact', basis: 'point-in-polygon' },
      actual: { value: schoolWithinFlood.value },
      quality: schoolWithinFlood.quality,
      basis: schoolWithinFlood.basis,
    },
    {
      id: 'route-flood-relation',
      tool: 'querySpatialRelation',
      passed: routeIntersectsFlood.value === expanded
        && routeIntersectsFlood.quality === 'approximate'
        && routeIntersectsFlood.basis === 'bounding-box',
      expected: { value: expanded, quality: 'approximate', basis: 'bounding-box' },
      actual: { value: routeIntersectsFlood.value },
      quality: routeIntersectsFlood.quality,
      basis: routeIntersectsFlood.basis,
    },
    {
      id: 'current-view-context',
      tool: 'getViewContext',
      passed: viewObjectIds.length === 12,
      expected: { visibleFeatureCount: 12 },
      actual: { visibleFeatureCount: viewObjectIds.length, objectIds: viewObjectIds },
      quality: 'derived',
      basis: 'evaluation-view-bounds',
    },
  ]
  return {
    stage,
    passed: assertions.every(assertion => assertion.passed),
    assertions,
  }
}

export function runEmergencyResponseEvaluation(): EmergencyEvaluationReport {
  const stages = [evaluationStage('baseline'), evaluationStage('expanded')]
  return {
    schemaVersion: 1,
    scenario: 'urban-flood-response',
    passed: stages.every(stage => stage.passed),
    stages,
  }
}
