import { describe, expect, it } from 'vitest'
import { WorldMemory } from './world-memory.js'
import { createVisualGroundingObservation } from './visual-grounding.js'
import type { WorldObservation } from './types.js'

const T0 = '2026-09-05T00:00:00.000Z'
const T1 = '2026-09-05T00:00:01.000Z'
const T2 = '2026-09-05T00:00:02.000Z'

function memory(): WorldMemory {
  return new WorldMemory({ beliefId: 'agent', worldId: 'world', createdAt: T0, regions: [] })
}

function observation(id: string, at = T1, longitude = 86): WorldObservation {
  return {
    schemaVersion: 1, observationId: id, worldId: 'world', worldRevision: at === T1 ? 1 : 2,
    startedAt: at, completedAt: at, changedDuringObservation: false, readiness: 'ready',
    sensors: [{ sensorId: 'metadata', kind: 'metadata' }], limitations: [],
    evidence: [{
      kind: 'object', evidenceId: 'object', sensorId: 'metadata', sampledAt: at,
      quality: 'exact', confidence: 1, basis: 'authorized-metadata-query',
      object: {
        objectId: 'bridge', name: '桥', type: 'bridge', sourceType: 'entity',
        geometry: { type: 'Point', coordinates: [longitude, 28, 100] },
        properties: {}, geometryQuality: 'exact', observedAt: at, revision: at === T1 ? 1 : 2,
        provenance: { source: 'scene', method: 'metadata-query' },
      },
    }],
  }
}

describe('WorldMemory shared evidence tasks', () => {
  it('consumes the existing visual grounding adapter through the same evidence ledger', () => {
    const session = memory()
    const objectEvidence = observation('metadata').evidence[0]
    if (objectEvidence?.kind !== 'object') throw new Error('Expected object fixture')
    const digest = `sha256:${'a'.repeat(64)}`
    session.observe(createVisualGroundingObservation({
      observationId: 'visual', worldId: 'world', worldRevision: 1,
      startedAt: T0, capturedAt: T1, completedAt: T2,
      changedDuringObservation: false, readiness: 'ready',
      sensor: { sensorId: 'camera', kind: 'camera', pose: { position: [86, 28, 200] } },
      imageDigest: digest, artifactRef: digest,
      requestedObjectIds: ['bridge'], requestedRegionIds: [],
      spatialObjects: [objectEvidence.object], spatialRegions: [],
      report: {
        schemaVersion: 1, imageDigest: digest,
        objects: [{ objectId: 'bridge', visibility: 'visible', confidence: 0.9, bbox: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 } }],
        regions: [], limitations: [],
      },
    }))
    const result = session.execute({ kind: 'find', query: { name: '桥' }, at: T2 })
    expect(result.objects).toHaveLength(1)
    expect(result.citations[0]!.sensor.kind).toBe('camera')
    expect(result.citations[0]!.reference.observationId).toBe('visual')
  })
  it('shares observations between describe and find without claiming an unseen target absent', () => {
    const session = memory()
    session.observe(observation('one'))
    const described = session.execute({ kind: 'describe', at: T1 })
    expect(described.objects).toHaveLength(1)
    expect(session.execute({ kind: 'find', query: { name: '桥' }, at: T1 }).objects[0]!.objectId).toBe('bridge')
    const missing = session.execute({ kind: 'find', query: { name: '学校' }, at: T1 })
    expect(missing.status).toBe('insufficient-evidence')
    expect(missing.limitations).toContain('No match in observed memory does not establish absence in the world.')
    expect(described.citations[0]!.sensor.kind).toBe('metadata')
    expect(described.citations[0]!.basis).toBe('authorized-metadata-query')
  })

  it('retains identity across observations and compares content instead of revision metadata', () => {
    const session = memory()
    session.observe(observation('one'))
    session.checkpoint('before', T1)
    session.observe(observation('two', T2))
    const result = session.execute({ kind: 'changes', checkpointId: 'before', at: T2 })
    expect(result.objects).toHaveLength(1)
    expect(result.changes).toEqual([])
  })

  it('reports a supported position change with evidence for both versions', () => {
    const session = memory()
    session.observe(observation('one'))
    session.checkpoint('before', T1)
    session.observe(observation('two', T2, 87))
    const result = session.execute({ kind: 'changes', checkpointId: 'before', at: T2 })
    expect(result.changes[0]).toMatchObject({ objectId: 'bridge', kind: 'changed', fields: ['geometry'] })
    expect(result.citations.map(item => item.reference.observationId)).toEqual(['one', 'two'])
  })

  it('does not interpret an empty camera frame as an object removal', () => {
    const session = memory()
    session.observe(observation('one'))
    session.checkpoint('before', T1)
    session.observe({ ...observation('empty', T2), evidence: [], readiness: 'partial' })
    const result = session.execute({ kind: 'changes', checkpointId: 'before', at: T2 })
    expect(result.objects).toHaveLength(1)
    expect(result.changes).toEqual([])
    expect(result.limitations).toContain('Changes compare observed knowledge, not a complete inventory of world changes.')
  })

  it('marks expired matches as insufficient evidence', () => {
    const session = memory()
    const input = observation('one')
    input.evidence[0]!.validUntil = T2
    session.observe(input)
    const result = session.execute({ kind: 'find', query: { name: '桥' }, at: T2 })
    expect(result.status).toBe('insufficient-evidence')
    expect(result.objects[0]!.freshness).toBe('stale')
  })

  it('keeps artifact evidence resolvable without inventing object-image grounding', () => {
    const session = memory()
    const input = observation('image')
    input.evidence.push({
      kind: 'artifact', artifactType: 'image', artifactRef: 'frame-1', relatedRegionIds: [],
      evidenceId: 'frame', sensorId: 'metadata', sampledAt: T1, quality: 'derived', confidence: 1,
      basis: 'context-image',
    })
    session.observe(input)
    expect(session.resolveEvidence({ observationId: 'image', evidenceId: 'frame', worldRevision: 1, sampledAt: T1 })?.artifactRef).toBe('frame-1')
    expect(session.execute({ kind: 'describe', at: T1 }).citations).toHaveLength(1)
  })

  it('rejects a conflicting duplicate ID and foreign world without changing memory', () => {
    const session = memory()
    const first = observation('one')
    session.observe(first)
    expect(session.observe(first).duplicate).toBe(true)
    expect(() => session.observe(observation('one', T1, 87))).toThrow(/reused/)
    expect(() => session.observe({ ...observation('two'), worldId: 'other' })).toThrow()
    expect(session.snapshot().objects).toHaveLength(1)
  })

  it('protects memory and checkpoints from callers mutating inputs or results', () => {
    const session = memory()
    const input = observation('one')
    session.observe(input)
    session.checkpoint('before', T1)
    input.evidence.length = 0
    session.snapshot().objects.length = 0
    session.execute({ kind: 'describe', at: T1 }).objects[0]!.object.name = 'mutated'
    expect(session.execute({ kind: 'describe', at: T1 }).objects[0]!.object.name).toBe('桥')
    expect(() => session.checkpoint('before', T2)).toThrow(/exists/)
  })

  it('rejects unknown checkpoints and backdated queries', () => {
    const session = memory()
    session.observe(observation('one'))
    expect(() => session.execute({ kind: 'changes', checkpointId: 'missing', at: T1 })).toThrow(/checkpoint/i)
    expect(() => session.execute({ kind: 'describe', at: T0 })).toThrow(/earlier/)
  })

  it('does not report later-discovered objects as newly created', () => {
    const session = memory()
    session.checkpoint('before', T0)
    session.observe(observation('one'))
    expect(session.execute({ kind: 'changes', checkpointId: 'before', at: T1 }).changes[0]!.kind).toBe('newly-observed')
  })
})
