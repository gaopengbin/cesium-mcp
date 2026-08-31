export type SpatialSourceType =
  | 'entity'
  | 'layer'
  | 'geojson'
  | 'czml'
  | 'tileset-feature'

export type SpatialCoordinate = [number, number] | [number, number, number]

export type SpatialGeometry =
  | { type: 'Point'; coordinates: SpatialCoordinate }
  | { type: 'LineString'; coordinates: SpatialCoordinate[] }
  | { type: 'Polygon'; coordinates: SpatialCoordinate[][] }

export type SpatialBounds = [number, number, number, number]

export type SpatialEvidenceQuality = 'exact' | 'derived' | 'approximate' | 'unknown'

export interface SpatialObjectProvenance {
  source: string
  method: string
}

export interface SpatialObject {
  objectId: string
  sourceType: SpatialSourceType
  type: string
  name?: string
  layerId?: string
  resourceId?: string
  geometry?: SpatialGeometry
  centroid?: SpatialCoordinate
  bbox?: SpatialBounds
  properties: Record<string, unknown>
  geometryQuality: SpatialEvidenceQuality
  observedAt: string
  revision: number
  provenance: SpatialObjectProvenance
}

export interface SpatialNearQuery {
  longitude: number
  latitude: number
  radiusMeters: number
}

export interface SpatialObjectQuery {
  name?: string
  types?: string[]
  sourceTypes?: SpatialSourceType[]
  layerId?: string
  bbox?: SpatialBounds
  near?: SpatialNearQuery
  propertyEquals?: Record<string, string | number | boolean | null>
  limit?: number
}

export interface SpatialContextSummary {
  objectCount: number
  countsBySource: Record<string, number>
  countsByType: Record<string, number>
  bounds?: SpatialBounds
  revision: number
}

export type SpatialRelation =
  | 'distance'
  | 'near'
  | 'intersects'
  | 'within'
  | 'contains'
  | 'overlaps'

export interface SpatialRelationOptions {
  nearThresholdMeters?: number
}

export interface SpatialRelationResult {
  subjectId: string
  objectId: string
  relation: SpatialRelation
  value: boolean | number | null
  unit?: 'meters'
  quality: SpatialEvidenceQuality
  basis: string
  subjectRevision: number
  objectRevision: number
  observedAt: string
}

export interface SpatialContext {
  replace(objects: readonly SpatialObject[]): void
  upsert(object: SpatialObject): void
  remove(objectId: string): boolean
  get(objectId: string): SpatialObject | undefined
  list(): SpatialObject[]
  query(query?: SpatialObjectQuery): SpatialObject[]
  describe(): SpatialContextSummary
  relate(
    subjectId: string,
    objectId: string,
    relation: SpatialRelation,
    options?: SpatialRelationOptions,
  ): SpatialRelationResult
}

// ========== Terrain-aware flight planning ==========

export interface FlightRouteCoordinate {
  longitude: number
  latitude: number
  name?: string
}

export interface FlightTerrainSample extends FlightRouteCoordinate {
  terrainHeight: number
}

export interface TerrainAwareFlightOptions {
  clearanceMeters: number
  maxClimbAngleDegrees: number
  maxDescentAngleDegrees: number
}

export interface TerrainAwareFlightSample extends FlightTerrainSample {
  distanceMeters: number
  flightHeight: number
  clearanceMeters: number
  naiveFlightHeight: number
  naiveClearanceMeters: number
}

export interface TerrainAwareFlightMetrics {
  distanceMeters: number
  terrainHeightRange: [number, number]
  flightHeightRange: [number, number]
  minimumClearanceMeters: number
  naiveMinimumClearanceMeters: number
  naiveViolationCount: number
  maximumClimbAngleDegrees: number
  maximumDescentAngleDegrees: number
}

export interface TerrainAwareFlightPlan {
  samples: TerrainAwareFlightSample[]
  options: TerrainAwareFlightOptions
  metrics: TerrainAwareFlightMetrics
}
