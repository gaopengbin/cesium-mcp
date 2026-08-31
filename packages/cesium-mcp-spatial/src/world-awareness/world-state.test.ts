import { describe, expect, it } from 'vitest'
import {
  createAuthoritativeWorldState,
  validateAuthoritativeWorldState,
} from './world-state.js'
import type {
  AuthoritativeRegionState,
  SpatialRegion,
} from './types.js'
import type { SpatialObject } from '../types.js'

const capturedAt = '2026-08-31T08:00:00.000Z'

function pointObject(objectId: string): SpatialObject {
  return {
    objectId,
    sourceType: 'entity',
    type: 'obstacle',
    geometry: { type: 'Point', coordinates: [86.9, 27.9, 5000] },
    properties: { tags: ['fixture'] },
    geometryQuality: 'exact',
    observedAt: capturedAt,
    revision: 1,
    provenance: { source: 'world-truth-fixture', method: 'entity' },
  }
}

function region(regionId: string): SpatialRegion {
  return {
    regionId,
    footprint: {
      type: 'Polygon',
      coordinates: [[
        [86.8, 27.8],
        [87, 27.8],
        [87, 28],
        [86.8, 28],
        [86.8, 27.8],
      ]],
    },
    properties: { label: regionId },
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

describe('authoritative world state', () => {
  it('creates a detached snapshot with deterministic ordering without mutating input', () => {
    const objects = deepFreeze([
      pointObject('obstacle_z'),
      pointObject('obstacle_a'),
    ])
    const regions = deepFreeze<AuthoritativeRegionState[]>([
      {
        region: region('region_z'),
        modeled: false,
        reason: 'Source coverage ends at this boundary',
        revision: 3,
        changedAt: capturedAt,
      },
      {
        region: region('region_a'),
        modeled: true,
        occupancy: 'occupied',
        blockingObjectIds: ['obstacle_z', 'obstacle_a'],
        revision: 3,
        changedAt: capturedAt,
      },
    ])

    const state = createAuthoritativeWorldState({
      worldId: 'himalaya-flight',
      revision: 3,
      capturedAt,
      objects,
      regions,
    })

    expect(state).toMatchObject({
      schemaVersion: 1,
      worldId: 'himalaya-flight',
      revision: 3,
      capturedAt,
    })
    expect(state.objects.map(object => object.objectId))
      .toEqual(['obstacle_a', 'obstacle_z'])
    expect(state.regions.map(item => item.region.regionId))
      .toEqual(['region_a', 'region_z'])
    expect(state.regions[0]).toMatchObject({
      modeled: true,
      blockingObjectIds: ['obstacle_a', 'obstacle_z'],
    })
    expect(objects.map(object => object.objectId))
      .toEqual(['obstacle_z', 'obstacle_a'])
    expect(regions[1]).toMatchObject({
      blockingObjectIds: ['obstacle_z', 'obstacle_a'],
    })

    state.objects[0]!.properties.tags = ['changed-output-only']
    state.regions[0]!.region.properties!.label = 'changed-output-only'
    expect(objects[1]!.properties.tags).toEqual(['fixture'])
    expect(regions[1]!.region.properties!.label).toBe('region_a')
  })

  it('produces the same canonical snapshot for different input ordering', () => {
    const worldA = createAuthoritativeWorldState({
      worldId: 'world_1',
      revision: 1,
      capturedAt,
      objects: [pointObject('object_b'), pointObject('object_a')],
      regions: [
        {
          region: region('region_b'),
          modeled: true,
          occupancy: 'free',
          blockingObjectIds: [],
          revision: 1,
          changedAt: capturedAt,
        },
        {
          region: region('region_a'),
          modeled: false,
          reason: 'No authoritative source',
          revision: 1,
          changedAt: capturedAt,
        },
      ],
    })
    const worldB = createAuthoritativeWorldState({
      worldId: 'world_1',
      revision: 1,
      capturedAt,
      objects: [pointObject('object_a'), pointObject('object_b')],
      regions: [...worldA.regions].reverse(),
    })

    expect(worldB).toEqual(worldA)
  })

  it('keeps an unmodeled truth region distinct from an agent unknown belief', () => {
    const state = createAuthoritativeWorldState({
      worldId: 'world_1',
      revision: 1,
      capturedAt,
      regions: [{
        region: region('outside-source-coverage'),
        modeled: false,
        reason: 'Terrain source did not model this region',
        revision: 1,
        changedAt: capturedAt,
      }],
    })

    expect(state.regions[0]).toEqual({
      region: region('outside-source-coverage'),
      modeled: false,
      reason: 'Terrain source did not model this region',
      revision: 1,
      changedAt: capturedAt,
    })
    expect('occupancy' in state.regions[0]!).toBe(false)

    expect(() => validateAuthoritativeWorldState({
      ...state,
      regions: [{
        ...state.regions[0],
        occupancy: 'unknown',
      }],
    })).toThrow(/modeled=false.*occupancy/i)
  })

  it('rejects invalid identity, occupancy, and blocking-object invariants', () => {
    const object = pointObject('duplicate')
    const base = {
      schemaVersion: 1,
      worldId: 'world_1',
      revision: 1,
      capturedAt,
      objects: [object],
      regions: [],
    }

    expect(() => validateAuthoritativeWorldState({
      ...base,
      objects: [object, pointObject('duplicate')],
    })).toThrow(/duplicate objectId/i)

    expect(() => validateAuthoritativeWorldState({
      ...base,
      regions: [{
        region: region('unknown-is-not-truth'),
        modeled: true,
        occupancy: 'unknown',
        blockingObjectIds: [],
        revision: 1,
        changedAt: capturedAt,
      }],
    })).toThrow(/modeled=true.*free or occupied/i)

    expect(() => validateAuthoritativeWorldState({
      ...base,
      regions: [{
        region: region('free-region'),
        modeled: true,
        occupancy: 'free',
        blockingObjectIds: ['duplicate'],
        revision: 1,
        changedAt: capturedAt,
      }],
    })).toThrow(/free.*blockingObjectIds/i)

    expect(() => validateAuthoritativeWorldState({
      ...base,
      regions: [{
        region: region('occupied-region'),
        modeled: true,
        occupancy: 'occupied',
        blockingObjectIds: ['missing-object'],
        revision: 1,
        changedAt: capturedAt,
      }],
    })).toThrow(/unknown blocking object/i)
  })
})
