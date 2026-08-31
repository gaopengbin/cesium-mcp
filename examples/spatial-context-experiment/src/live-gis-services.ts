export const NASA_GIBS_WMS_URL = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'
export const NASA_GIBS_LAYER_NAME = 'BlueMarble_ShadedRelief_Bathymetry'
export const NASA_GIBS_LAYER_ID = 'nasa-gibs-blue-marble'

export const USGS_EARTHQUAKE_FEED_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
export const USGS_EARTHQUAKE_LAYER_ID = 'usgs-earthquakes-live'
export const USGS_EARTHQUAKE_RESOURCE_ID = 'usgs-earthquakes-m25-day'

export interface NormalizedEarthquakeFeature {
  type: 'Feature'
  id: string
  geometry: {
    type: 'Point'
    coordinates: [number, number, 0]
  }
  properties: {
    name: string
    semanticType: 'earthquake'
    magnitude: number
    depthKm: number
    occurredAt?: string
    updatedAt?: string
    eventId: string
    alert?: string
    status?: string
    tsunami: boolean
    significance?: number
    source: 'USGS Earthquake Hazards Program'
    sourceUrl?: string
    detailUrl?: string
    live: true
  }
}

export interface LiveEarthquakeTarget {
  eventId: string
  objectId: string
  name: string
  magnitude: number
  depthKm: number
  longitude: number
  latitude: number
  occurredAt?: string
  sourceUrl?: string
}

export interface LiveEarthquakeDataset {
  geoJson: {
    type: 'FeatureCollection'
    features: NormalizedEarthquakeFeature[]
  }
  featureCount: number
  reportedFeatureCount?: number
  generatedAt?: string
  strongest: LiveEarthquakeTarget
}

interface FetchEarthquakesOptions {
  fetcher?: typeof fetch
  limit?: number
  timeoutMs?: number
}

interface UsgsFeatureCandidate {
  id: string
  magnitude: number
  place: string
  longitude: number
  latitude: number
  depthKm: number
  occurredAt?: string
  updatedAt?: string
  alert?: string
  status?: string
  tsunami: boolean
  significance?: number
  sourceUrl?: string
  detailUrl?: string
  occurredAtMs: number
}

export function earthquakeObjectId(eventId: string): string {
  return `entity:${USGS_EARTHQUAKE_LAYER_ID}:${encodeURIComponent(eventId)}`
}

export function normalizeUsgsEarthquakeFeed(
  value: unknown,
  limit = 50,
): LiveEarthquakeDataset {
  const root = asRecord(value)
  const features = Array.isArray(root?.features) ? root.features : []
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)))
  const candidates = features
    .map(toCandidate)
    .filter((candidate): candidate is UsgsFeatureCandidate => candidate !== undefined)
    .sort((left, right) =>
      right.magnitude - left.magnitude || right.occurredAtMs - left.occurredAtMs,
    )
    .slice(0, boundedLimit)

  if (candidates.length === 0) {
    throw new Error('USGS earthquake feed contained no valid point events')
  }

  const normalized = candidates.map(toFeature)
  const strongest = candidates[0]!
  const metadata = asRecord(root?.metadata)
  const reportedFeatureCount = finiteNumber(metadata?.count)

  return {
    geoJson: {
      type: 'FeatureCollection',
      features: normalized,
    },
    featureCount: normalized.length,
    ...(reportedFeatureCount !== undefined
      ? { reportedFeatureCount: Math.max(0, Math.floor(reportedFeatureCount)) }
      : {}),
    ...(isoDate(metadata?.generated) ? { generatedAt: isoDate(metadata?.generated) } : {}),
    strongest: {
      eventId: strongest.id,
      objectId: earthquakeObjectId(strongest.id),
      name: strongest.place,
      magnitude: strongest.magnitude,
      depthKm: strongest.depthKm,
      longitude: strongest.longitude,
      latitude: strongest.latitude,
      ...(strongest.occurredAt ? { occurredAt: strongest.occurredAt } : {}),
      ...(strongest.sourceUrl ? { sourceUrl: strongest.sourceUrl } : {}),
    },
  }
}

export async function fetchLatestEarthquakes(
  options: FetchEarthquakesOptions = {},
): Promise<LiveEarthquakeDataset> {
  const fetcher = options.fetcher ?? fetch
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? 12_000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetcher(USGS_EARTHQUAKE_FEED_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/geo+json, application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(
        `USGS earthquake feed returned ${response.status} ${response.statusText}`.trim(),
      )
    }
    return normalizeUsgsEarthquakeFeed(await response.json(), options.limit)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`USGS earthquake feed timed out after ${timeoutMs} ms`, {
        cause: error,
      })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function toCandidate(value: unknown): UsgsFeatureCandidate | undefined {
  const feature = asRecord(value)
  const properties = asRecord(feature?.properties)
  const geometry = asRecord(feature?.geometry)
  const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : []
  const id = typeof feature?.id === 'string' ? feature.id.trim() : ''
  const magnitude = finiteNumber(properties?.mag)
  const longitude = finiteNumber(coordinates[0])
  const latitude = finiteNumber(coordinates[1])

  if (
    feature?.type !== 'Feature'
    || geometry?.type !== 'Point'
    || !id
    || magnitude === undefined
    || longitude === undefined
    || latitude === undefined
    || longitude < -180
    || longitude > 180
    || latitude < -90
    || latitude > 90
  ) {
    return undefined
  }

  const depthKm = finiteNumber(coordinates[2]) ?? 0
  const occurredAtMs = finiteNumber(properties?.time) ?? 0
  const place = stringValue(properties?.place) ?? `Earthquake ${id}`

  return {
    id,
    magnitude,
    place,
    longitude,
    latitude,
    depthKm,
    occurredAtMs,
    ...(isoDate(properties?.time) ? { occurredAt: isoDate(properties?.time) } : {}),
    ...(isoDate(properties?.updated) ? { updatedAt: isoDate(properties?.updated) } : {}),
    ...(stringValue(properties?.alert) ? { alert: stringValue(properties?.alert) } : {}),
    ...(stringValue(properties?.status) ? { status: stringValue(properties?.status) } : {}),
    tsunami: properties?.tsunami === 1 || properties?.tsunami === true,
    ...(finiteNumber(properties?.sig) !== undefined
      ? { significance: finiteNumber(properties?.sig) }
      : {}),
    ...(stringValue(properties?.url) ? { sourceUrl: stringValue(properties?.url) } : {}),
    ...(stringValue(properties?.detail) ? { detailUrl: stringValue(properties?.detail) } : {}),
  }
}

function toFeature(candidate: UsgsFeatureCandidate): NormalizedEarthquakeFeature {
  return {
    type: 'Feature',
    id: candidate.id,
    geometry: {
      type: 'Point',
      // USGS uses positive depth below the surface. Cesium expects height above the ellipsoid,
      // so the event is rendered on the surface and depth remains explicit metadata.
      coordinates: [candidate.longitude, candidate.latitude, 0],
    },
    properties: {
      name: candidate.place,
      semanticType: 'earthquake',
      magnitude: candidate.magnitude,
      depthKm: candidate.depthKm,
      ...(candidate.occurredAt ? { occurredAt: candidate.occurredAt } : {}),
      ...(candidate.updatedAt ? { updatedAt: candidate.updatedAt } : {}),
      eventId: candidate.id,
      ...(candidate.alert ? { alert: candidate.alert } : {}),
      ...(candidate.status ? { status: candidate.status } : {}),
      tsunami: candidate.tsunami,
      ...(candidate.significance !== undefined ? { significance: candidate.significance } : {}),
      source: 'USGS Earthquake Hazards Program',
      ...(candidate.sourceUrl ? { sourceUrl: candidate.sourceUrl } : {}),
      ...(candidate.detailUrl ? { detailUrl: candidate.detailUrl } : {}),
      live: true,
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isoDate(value: unknown): string | undefined {
  const epoch = finiteNumber(value)
  if (epoch === undefined) return undefined
  const date = new Date(epoch)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
