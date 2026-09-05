import { createSpatialContext } from '../context.js'
import type { SpatialObject, SpatialObjectQuery } from '../types.js'
import { ageAgentBeliefState, applyWorldObservation, createAgentBeliefState } from './belief-state.js'
import type {
  AgentBeliefState,
  ApplyWorldObservationOptions,
  BeliefObject,
  BeliefUpdateResult,
  CreateAgentBeliefStateInput,
  EvidenceReference,
  ObservationSensor,
  WorldObservation,
} from './types.js'

export type WorldMemoryTask =
  | { kind: 'describe', at: string }
  | { kind: 'find', at: string, query: SpatialObjectQuery }
  | { kind: 'changes', at: string, checkpointId: string }

export interface WorldMemoryCitation {
  reference: EvidenceReference
  sensor: ObservationSensor
  basis: string
  quality: string
  confidence: number
  artifactRef?: string
  limitations: string[]
}

export interface WorldMemoryChange {
  objectId: string
  kind: 'newly-observed' | 'changed'
  fields: string[]
  before?: BeliefObject
  after: BeliefObject
}

export interface WorldMemoryResult {
  kind: WorldMemoryTask['kind']
  status: 'supported' | 'insufficient-evidence'
  beliefRevision: number
  asOf: string
  objects: BeliefObject[]
  changes: WorldMemoryChange[]
  citations: WorldMemoryCitation[]
  limitations: string[]
}

// A session-scoped evidence ledger shared by tasks and sensor adapters.
// Object association belongs to adapters: this class never guesses identity from names.
export class WorldMemory {
  private belief: AgentBeliefState
  private observations = new Map<string, WorldObservation>()
  private checkpoints = new Map<string, AgentBeliefState>()

  constructor(input: CreateAgentBeliefStateInput) {
    this.belief = createAgentBeliefState(structuredClone(input))
  }

  observe(input: WorldObservation, options?: ApplyWorldObservationOptions): BeliefUpdateResult {
    const observation = structuredClone(input)
    const existing = this.observations.get(observation.observationId)
    if (existing && canonical(existing) !== canonical(observation)) {
      throw new Error('Observation ID reused with different evidence')
    }
    const result = applyWorldObservation(this.belief, observation, options)
    this.belief = result.state
    this.observations.set(observation.observationId, observation)
    return structuredClone(result)
  }

  snapshot(): AgentBeliefState {
    return structuredClone(this.belief)
  }

  checkpoint(id: string, at: string): void {
    if (!id.trim()) throw new Error('Checkpoint ID is required')
    if (this.checkpoints.has(id)) throw new Error(`Checkpoint already exists: ${id}`)
    this.age(at)
    this.checkpoints.set(id, this.snapshot())
  }

  resolveEvidence(reference: EvidenceReference): WorldMemoryCitation | undefined {
    const observation = this.observations.get(reference.observationId)
    if (!observation || observation.worldRevision !== reference.worldRevision) return undefined
    const evidence = observation.evidence.find(item => item.evidenceId === reference.evidenceId)
    if (!evidence || evidence.sampledAt !== reference.sampledAt) return undefined
    const sensor = observation.sensors.find(item => item.sensorId === evidence.sensorId)
    if (!sensor) return undefined
    return structuredClone({
      reference, sensor, basis: evidence.basis, quality: evidence.quality,
      confidence: evidence.confidence,
      ...(evidence.kind === 'artifact' ? { artifactRef: evidence.artifactRef } : {}),
      limitations: [...observation.limitations, ...(evidence.limitations ?? [])],
    })
  }

  execute(task: WorldMemoryTask): WorldMemoryResult {
    const baseline = task.kind === 'changes' ? this.checkpoints.get(task.checkpointId) : undefined
    if (task.kind === 'changes' && !baseline) throw new Error(`Unknown checkpoint: ${task.checkpointId}`)
    this.age(task.at)
    let objects = this.belief.objects
    const changes: WorldMemoryChange[] = []
    const limitations = ['Results describe observed knowledge, not exhaustive scene truth.']
    if (task.kind === 'find') {
      const context = createSpatialContext(objects.map(item => item.object))
      const ids = new Set(context.query(task.query).map(item => item.objectId))
      objects = objects.filter(item => ids.has(item.objectId))
      if (!objects.length) limitations.push('No match in observed memory does not establish absence in the world.')
    }
    if (baseline) {
      const previous = new Map(baseline.objects.map(item => [item.objectId, item]))
      for (const after of objects) {
        const before = previous.get(after.objectId)
        if (!before) {
          changes.push({ objectId: after.objectId, kind: 'newly-observed', fields: [], after })
        } else {
          const fields = changedFields(before.object, after.object)
          if (fields.length) changes.push({ objectId: after.objectId, kind: 'changed', fields, before, after })
        }
      }
      limitations.push('Changes compare observed knowledge, not a complete inventory of world changes.')
    }
    const references = [
      ...changes.flatMap(item => item.before?.evidence ?? []),
      ...objects.flatMap(item => item.evidence),
    ]
    const citations = new Map<string, WorldMemoryCitation>()
    let unresolved = false
    for (const ref of references) {
      const citation = this.resolveEvidence(ref)
      if (citation) citations.set(canonical(ref), citation)
      else unresolved = true
    }
    const stale = objects.some(item => item.freshness === 'stale')
    const conflict = this.belief.conflicts.some(item =>
      item.targetType === 'object' && objects.some(object => object.objectId === item.targetId),
    )
    if (stale) limitations.push('Some matched objects require fresh observation.')
    if (conflict) limitations.push('Some matched objects have conflicting evidence.')
    if (unresolved) limitations.push('Some evidence references could not be resolved.')
    return structuredClone({
      kind: task.kind,
      status: objects.length && !stale && !conflict && !unresolved ? 'supported' : 'insufficient-evidence',
      beliefRevision: this.belief.revision, asOf: task.at, objects, changes,
      citations: [...citations.values()], limitations,
    })
  }

  private age(at: string): void {
    if (!Number.isFinite(Date.parse(at))) throw new Error('Task time must be an ISO timestamp')
    if (Date.parse(at) < Date.parse(this.belief.updatedAt)) {
      throw new Error('Task time cannot be earlier than current memory')
    }
    this.belief = ageAgentBeliefState(this.belief, at).state
  }
}

function changedFields(before: SpatialObject, after: SpatialObject): string[] {
  const fields = ['name', 'type', 'geometry', 'centroid', 'bbox', 'properties'] as const
  return fields.filter(field => canonical(before[field]) !== canonical(after[field]))
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}
