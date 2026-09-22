export type NavigationRouteId = 'left' | 'right' | 'direct' | 'detour' | 'hold'

export interface NavigationRouteCandidate {
  id: Exclude<NavigationRouteId, 'hold'>
  feasible: boolean
  lengthMeters: number
  minimumClearanceMeters: number
  turnCount: number
  dataCoverage?: 'surveyed' | 'mixed' | 'unmapped'
}

export interface NavigationRouteObservation {
  offerId: string
  revision: number
  capturedAt: string
  straightLineBlocked: boolean
  distanceToGoalMeters: number
  candidates: NavigationRouteCandidate[]
}

export interface JevRouteResult {
  offerId: string
  revision: number
  routeId: NavigationRouteId
  confidence: number
  probabilities: Partial<Record<NavigationRouteId, number>>
  model: string
  latencyMs: number
  usage: Record<string, number>
}

export async function requestJevRoute(
  observation: NavigationRouteObservation,
  options: { signal?: AbortSignal } = {},
): Promise<JevRouteResult> {
  const input = validateNavigationRouteObservation(observation)
  const response = await fetch('/api/jev/route', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal: options.signal,
  })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(`Jev route selection failed with HTTP ${response.status}`)
  return validateJevRouteResult(body, input)
}

/** Shared strict schema for the browser Bridge boundary and the server request. */
export function validateNavigationRouteObservation(value: unknown): NavigationRouteObservation {
  const input = exactRecord(value, ['offerId', 'revision', 'capturedAt', 'straightLineBlocked', 'distanceToGoalMeters', 'candidates'])
  identifier(input.offerId)
  nonnegativeInteger(input.revision)
  if (typeof input.capturedAt !== 'string' || !Number.isFinite(Date.parse(input.capturedAt))
    || typeof input.straightLineBlocked !== 'boolean'
    || !finiteRange(input.distanceToGoalMeters, 0, 40_000_000)
    || !Array.isArray(input.candidates) || input.candidates.length > 4) {
    throw new Error('Invalid route observation')
  }
  const seen = new Set<unknown>()
  for (const item of input.candidates) {
    const candidate = exactRecord(item, ['id', 'feasible', 'lengthMeters', 'minimumClearanceMeters', 'turnCount', 'dataCoverage'])
    if (!['left', 'right', 'direct', 'detour'].includes(String(candidate.id)) || seen.has(candidate.id)
      || typeof candidate.feasible !== 'boolean'
      || (candidate.id === 'direct' && candidate.feasible && input.straightLineBlocked)
      || !finiteRange(candidate.lengthMeters, 0, 40_000_000)
      || !finiteRange(candidate.minimumClearanceMeters, 0, 40_000_000)
      || (candidate.dataCoverage !== undefined && !['surveyed', 'mixed', 'unmapped'].includes(String(candidate.dataCoverage)))) {
      throw new Error('Invalid route candidate')
    }
    nonnegativeInteger(candidate.turnCount)
    seen.add(candidate.id)
  }
  return structuredClone(input) as unknown as NavigationRouteObservation
}

export function validateJevRouteResult(value: unknown, observation: NavigationRouteObservation): JevRouteResult {
  const input = exactRecord(value, ['offerId', 'revision', 'routeId', 'confidence', 'probabilities', 'model', 'latencyMs', 'usage'])
  if (input.offerId !== observation.offerId || input.revision !== observation.revision
    || !['left', 'right', 'direct', 'detour', 'hold'].includes(String(input.routeId))
    || !finiteRange(input.confidence, 0, 1) || !finiteRange(input.latencyMs, 0, 3_600_000)
    || typeof input.model !== 'string' || !input.model.trim() || input.model.length > 100) {
    throw new Error('Invalid or mismatched Jev route decision')
  }
  if (input.routeId !== 'hold' && !observation.candidates.some(candidate => candidate.id === input.routeId && candidate.feasible)) {
    throw new Error('Jev selected an infeasible route')
  }
  const probabilities = exactRecord(input.probabilities, ['left', 'right', 'direct', 'detour', 'hold'])
  if (!finiteRange(probabilities[String(input.routeId)], 0, 1)) throw new Error('Missing selected route probability')
  let total = 0
  for (const probability of Object.values(probabilities)) {
    if (!finiteRange(probability, 0, 1)) throw new Error('Invalid Jev route probabilities')
    total += probability as number
  }
  if (Math.abs(total - 1) > 0.05) throw new Error('Invalid Jev route probability total')
  const usage = exactRecord(input.usage, ['input_tokens', 'output_tokens'])
  for (const count of Object.values(usage)) nonnegativeInteger(count)
  return structuredClone(input) as unknown as JevRouteResult
}

function exactRecord(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Invalid route fields')
  return value as Record<string, unknown>
}

function identifier(value: unknown): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new Error('Invalid route offer id')
}

function nonnegativeInteger(value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Expected a non-negative integer')
}

function finiteRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
