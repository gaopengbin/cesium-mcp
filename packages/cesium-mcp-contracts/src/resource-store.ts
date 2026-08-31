export type CesiumResourceKind = 'geojson' | 'czml' | 'json'

export interface CesiumResourceMetadata {
  resourceId: string
  kind: CesiumResourceKind
  sizeBytes: number
  createdAt: string
  expiresAt: string
}

export interface CesiumResourceEntry extends CesiumResourceMetadata {
  data: unknown
}

export interface RegisterCesiumResourceInput {
  kind: CesiumResourceKind
  data: unknown
  resourceId?: string
  ttlMs?: number
}

export interface CesiumResourceStoreOptions {
  defaultTtlMs?: number
  maxEntries?: number
  maxResourceBytes?: number
  now?: () => number
  createId?: () => string
}

export interface CesiumResourceStore {
  register(input: RegisterCesiumResourceInput): CesiumResourceMetadata
  get(resourceId: string): CesiumResourceEntry | undefined
  resolve(resourceId: string, expectedKind?: CesiumResourceKind): unknown
  list(): CesiumResourceMetadata[]
  remove(resourceId: string): boolean
  clear(): void
  sweep(): number
}

const DEFAULT_TTL_MS = 30 * 60 * 1000
const DEFAULT_MAX_ENTRIES = 100
const DEFAULT_MAX_RESOURCE_BYTES = 10 * 1024 * 1024
const RESOURCE_KINDS: readonly CesiumResourceKind[] = ['geojson', 'czml', 'json']

let resourceCounter = 0

function defaultCreateId(): string {
  resourceCounter += 1
  return `resource_${Date.now().toString(36)}_${resourceCounter.toString(36)}`
}

function byteLength(value: unknown): number {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('Resource data must be JSON-serializable')
  return new TextEncoder().encode(serialized).byteLength
}

function metadata(entry: CesiumResourceEntry): CesiumResourceMetadata {
  const { data: _data, ...rest } = entry
  return rest
}

export function createCesiumResourceStore(
  options: CesiumResourceStoreOptions = {},
): CesiumResourceStore {
  const defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const maxResourceBytes = options.maxResourceBytes ?? DEFAULT_MAX_RESOURCE_BYTES
  const now = options.now ?? Date.now
  const createId = options.createId ?? defaultCreateId
  const entries = new Map<string, CesiumResourceEntry>()

  function sweep(): number {
    const currentTime = now()
    let removed = 0
    for (const [resourceId, entry] of entries) {
      if (Date.parse(entry.expiresAt) <= currentTime) {
        entries.delete(resourceId)
        removed += 1
      }
    }
    return removed
  }

  function get(resourceId: string): CesiumResourceEntry | undefined {
    sweep()
    return entries.get(resourceId)
  }

  return {
    register(input) {
      sweep()
      if (!RESOURCE_KINDS.includes(input.kind)) {
        throw new Error(`Unsupported resource kind: ${String(input.kind)}`)
      }
      if (entries.size >= maxEntries) {
        throw new Error(`Resource limit reached (${maxEntries})`)
      }
      const sizeBytes = byteLength(input.data)
      if (sizeBytes > maxResourceBytes) {
        throw new Error(`Resource exceeds ${maxResourceBytes} byte limit`)
      }
      const resourceId = input.resourceId?.trim() || createId()
      if (entries.has(resourceId)) throw new Error(`Resource already exists: ${resourceId}`)
      const createdAtMs = now()
      const ttlMs = input.ttlMs ?? defaultTtlMs
      if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Resource TTL must be positive')
      const entry: CesiumResourceEntry = {
        resourceId,
        kind: input.kind,
        data: input.data,
        sizeBytes,
        createdAt: new Date(createdAtMs).toISOString(),
        expiresAt: new Date(createdAtMs + ttlMs).toISOString(),
      }
      entries.set(resourceId, entry)
      return metadata(entry)
    },
    get,
    resolve(resourceId, expectedKind) {
      const entry = get(resourceId)
      if (!entry) throw new Error(`Resource not found or expired: ${resourceId}`)
      if (expectedKind && entry.kind !== expectedKind) {
        throw new Error(`Resource ${resourceId} has kind ${entry.kind}; expected ${expectedKind}`)
      }
      return entry.data
    },
    list() {
      sweep()
      return Array.from(entries.values(), metadata)
    },
    remove(resourceId) {
      return entries.delete(resourceId)
    },
    clear() {
      entries.clear()
    },
    sweep,
  }
}

const RESOURCE_INPUT_KINDS: Readonly<Record<string, CesiumResourceKind>> = {
  addGeoJsonLayer: 'geojson',
  addGeoJsonPrimitive: 'geojson',
  addLabel: 'geojson',
  addHeatmap: 'geojson',
  loadCzml: 'czml',
}

export function resolveCesiumResourceInput(
  action: string,
  params: Record<string, unknown>,
  store: CesiumResourceStore,
): Record<string, unknown> {
  const resourceId = params.resourceId
  if (typeof resourceId !== 'string' || resourceId.length === 0) return params
  const expectedKind = RESOURCE_INPUT_KINDS[action]
  if (!expectedKind) throw new Error(`Tool does not accept resourceId: ${action}`)
  if (params.data !== undefined || params.url !== undefined) {
    throw new Error('resourceId cannot be combined with data or url')
  }
  return {
    ...params,
    data: store.resolve(resourceId, expectedKind),
  }
}
