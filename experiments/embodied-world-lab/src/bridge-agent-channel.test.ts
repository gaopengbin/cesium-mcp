import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Viewer } from 'cesium'
import { CesiumBridge } from '../../../packages/cesium-mcp-bridge/src/index.js'
import { buildJevRequest } from '../server/jev-api.js'
import { createBridgeAgentChannel } from './bridge-agent-channel.js'
import type { EmbodiedPlan, EmbodiedWorldSnapshot } from './embodied-agent-loop.js'
import type { NavigationRouteObservation } from './jev-route-planner.js'

const NOW = Date.parse('2026-09-21T10:00:00.000Z')

function world(overrides: Partial<EmbodiedWorldSnapshot> = {}): EmbodiedWorldSnapshot {
  return {
    revision: 1,
    capturedAt: new Date(NOW).toISOString(),
    mode: 'character',
    distanceToGoalMeters: 120,
    bearingErrorRadians: 0.2,
    grounded: true,
    speedMetersPerSecond: 0,
    candidates: ['front', 'left', 'right'].map(id => ({
      id: id as 'front' | 'left' | 'right',
      clearanceMeters: 30,
      slopeDegrees: 4,
      terrainReady: true,
      traversable: true,
    })),
    ...overrides,
  }
}

function plan(overrides: Partial<EmbodiedPlan> = {}): EmbodiedPlan {
  return {
    intent: 'advance', durationMs: 2_000, reason: 'Observed clear corridor',
    confidence: 0.9, source: 'model', ...overrides,
  }
}

function fixture() {
  let current = world()
  let now = NOW
  const observeWorld = vi.fn(() => current)
  const commitMotionIntent = vi.fn(() => true)
  const stopEmbodied = vi.fn()
  const onTrace = vi.fn()
  const channel = createBridgeAgentChannel({} as Viewer, {
    observeWorld, commitMotionIntent, stopEmbodied, onTrace, now: () => now,
  })
  return {
    channel, observeWorld, commitMotionIntent, stopEmbodied, onTrace,
    setWorld: (value: EmbodiedWorldSnapshot) => { current = value },
    setNow: (value: number) => { now = value },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('Cesium Bridge embodied agent channel', () => {
  it.each(['surveyed', 'unmapped'] as const)('preserves %s coverage through Bridge, Jev request construction and intent commit', async dataCoverage => {
    const f = fixture()
    f.setWorld(world({ dataCoverage }))
    const observation = await f.channel.readObservation()
    expect(observation.dataCoverage).toBe(dataCoverage)
    expect(JSON.parse(buildJevRequest(observation).state).dataCoverage).toBe(dataCoverage)
    expect(await f.channel.commitIntent(1, 1, plan())).toBe(true)
    expect(f.commitMotionIntent).toHaveBeenCalledExactlyOnceWith({ requestId: 1, revision: 1, plan: plan() })
  })

  it.each(['worldwide', 'mixed', null, 1, { surveyed: true }])('rejects invalid observation coverage %j', async dataCoverage => {
    const f = fixture()
    f.setWorld({ ...world(), dataCoverage } as EmbodiedWorldSnapshot)
    await expect(f.channel.readObservation()).rejects.toThrow('dataCoverage')
    expect(await f.channel.commitIntent(1, 1, plan())).toBe(false)
    expect(f.commitMotionIntent).not.toHaveBeenCalled()
  })

  it('still rejects arbitrary observation fields alongside valid coverage', async () => {
    const f = fixture()
    f.setWorld({ ...world({ dataCoverage: 'unmapped' }), hiddenWorld: { fullMap: [] } } as EmbodiedWorldSnapshot)
    await expect(f.channel.readObservation()).rejects.toThrow('Unexpected field: hiddenWorld')
    expect(await f.channel.commitIntent(1, 1, plan())).toBe(false)
  })

  it('routes observation, bounded intent and stop through the real Bridge dispatcher', async () => {
    const execute = vi.spyOn(CesiumBridge.prototype, 'execute')
    const f = fixture()
    expect(await f.channel.readObservation()).toEqual(world())
    expect(await f.channel.commitIntent(1, 1, plan())).toBe(true)
    await f.channel.stop()
    expect(execute.mock.calls.map(([command]) => command.action)).toEqual([
      'observeWorld', 'commitMotionIntent', 'stopEmbodied',
    ])
    expect(f.commitMotionIntent).toHaveBeenCalledWith({ requestId: 1, revision: 1, plan: plan() })
    expect(f.stopEmbodied).toHaveBeenCalledOnce()
    expect(f.onTrace.mock.calls.map(([trace]) => trace.status)).toEqual(['succeeded', 'succeeded', 'succeeded'])
    expect(f.onTrace.mock.calls[0][0]).toMatchObject({
      tool: 'observeWorld', timestamp: new Date(NOW).toISOString(), durationMs: expect.any(Number),
    })
  })

  it('takes a detached observation and rejects an unobserved or stopped submission', async () => {
    const f = fixture()
    expect(await f.channel.commitIntent(1, 1, plan())).toBe(false)
    const observed = await f.channel.readObservation()
    observed.revision = 300
    observed.candidates[0].clearanceMeters = 0
    expect(f.observeWorld()).toEqual(world())
    await f.channel.stop()
    expect(await f.channel.commitIntent(2, 1, plan())).toBe(false)
    expect(f.commitMotionIntent).not.toHaveBeenCalled()
  })

  it('rejects changed world revisions, repeated requests and the loop rejection', async () => {
    const f = fixture()
    await f.channel.readObservation()
    f.setWorld(world({ revision: 2 }))
    expect(await f.channel.commitIntent(1, 1, plan())).toBe(false)
    await f.channel.readObservation()
    expect(await f.channel.commitIntent(2, 2, plan())).toBe(true)
    expect(await f.channel.commitIntent(2, 2, plan())).toBe(false)
    f.commitMotionIntent.mockReturnValue(false)
    expect(await f.channel.commitIntent(3, 2, plan())).toBe(false)
    expect(f.onTrace.mock.calls.at(-1)?.[0].status).toBe('rejected')
  })

  it('rejects a response after its observation expires even when the live revision is unchanged', async () => {
    const f = fixture()
    await f.channel.readObservation()
    f.setNow(NOW + 20_001)
    f.setWorld(world({ capturedAt: new Date(NOW + 20_001).toISOString() }))
    expect(await f.channel.commitIntent(1, 1, plan())).toBe(false)
    expect(f.commitMotionIntent).not.toHaveBeenCalled()
  })

  it.each([
    { intent: 'teleport' }, { durationMs: 8_001 }, { durationMs: Number.NaN },
    { confidence: -0.1 }, { reason: '' }, { source: 'untrusted' }, { extra: true },
  ])('rejects invalid custom plan fields before committing: %j', async invalid => {
    const f = fixture()
    await f.channel.readObservation()
    await expect(f.channel.commitIntent(1, 1, { ...plan(), ...invalid } as EmbodiedPlan)).rejects.toThrow()
    expect(f.commitMotionIntent).not.toHaveBeenCalled()
    expect(f.onTrace.mock.calls.at(-1)?.[0].status).toBe('failed')
  })

  it('validates direct dispatcher calls as well as the convenience methods', async () => {
    const f = fixture()
    await f.channel.readObservation()
    const extra = await f.channel.bridge.execute({ action: 'stopEmbodied', params: { execute: 'anything' } })
    const invalidId = await f.channel.bridge.execute({
      action: 'commitMotionIntent', params: { requestId: -1, revision: 1, plan: plan() },
    })
    expect(extra.success).toBe(false)
    expect(invalidId.success).toBe(false)
    expect(f.stopEmbodied).not.toHaveBeenCalled()
    expect(f.commitMotionIntent).not.toHaveBeenCalled()
  })

  it.each([
    { speedMetersPerSecond: Number.NaN }, { capturedAt: 'invalid' },
    { capturedAt: new Date(NOW - 20_001).toISOString() },
    { capturedAt: new Date(NOW + 1_001).toISOString() },
    { candidates: [world().candidates[0], world().candidates[0], world().candidates[2]] },
    { hiddenWorld: { fullMap: [] } },
  ])('refuses invalid, stale, or expanded observations: %j', async invalid => {
    const f = fixture()
    f.setWorld({ ...world(), ...invalid } as EmbodiedWorldSnapshot)
    await expect(f.channel.readObservation()).rejects.toThrow()
    expect(await f.channel.commitIntent(1, 1, plan())).toBe(false)
  })

  it('invalidates the prior observation when a later read fails', async () => {
    const f = fixture()
    await f.channel.readObservation()
    f.observeWorld.mockImplementationOnce(() => { throw new Error('Sensor unavailable') })
    await expect(f.channel.readObservation()).rejects.toThrow('Sensor unavailable')
    expect(await f.channel.commitIntent(1, 1, plan())).toBe(false)
  })

  it('keeps telemetry errors from changing a successful action', async () => {
    const f = fixture()
    f.onTrace.mockImplementation(() => { throw new Error('UI listener failed') })
    await expect(f.channel.readObservation()).resolves.toEqual(world())
    await expect(f.channel.commitIntent(1, 1, plan())).resolves.toBe(true)
    expect(f.commitMotionIntent).toHaveBeenCalledOnce()
  })
})

function routeOffer(overrides: Partial<NavigationRouteObservation> = {}): NavigationRouteObservation {
  return {
    offerId: 'run-1:offer-1', revision: 1, capturedAt: new Date(NOW).toISOString(),
    straightLineBlocked: true, distanceToGoalMeters: 100,
    candidates: [
      { id: 'left', feasible: true, lengthMeters: 150, minimumClearanceMeters: 3, turnCount: 3 },
      { id: 'right', feasible: true, lengthMeters: 180, minimumClearanceMeters: 4, turnCount: 4 },
    ], ...overrides,
  }
}

function routeFixture() {
  let current = routeOffer()
  let now = NOW
  const readNavigationOptions = vi.fn(() => current)
  const commitNavigationRoute = vi.fn(() => true)
  const onTrace = vi.fn()
  const channel = createBridgeAgentChannel({} as Viewer, {
    observeWorld: () => world(), commitMotionIntent: () => true, stopEmbodied: vi.fn(),
    readNavigationOptions, commitNavigationRoute, onTrace, now: () => now,
  })
  return {
    channel, readNavigationOptions, commitNavigationRoute, onTrace,
    setOffer: (offer: NavigationRouteObservation) => { current = offer },
    setNow: (value: number) => { now = value },
  }
}

describe('Cesium Bridge navigation route channel', () => {
  it.each(['direct', 'detour'] as const)('dispatches offered %s routes through Bridge and refuses other unoffered routes', async routeId => {
    const execute = vi.spyOn(CesiumBridge.prototype, 'execute')
    const f = routeFixture()
    f.setOffer(routeOffer({
      straightLineBlocked: false,
      candidates: [{ id: routeId, feasible: true, lengthMeters: 120, minimumClearanceMeters: 3, turnCount: 2 }],
    }))
    await f.channel.readNavigationOptions()
    expect(await f.channel.commitNavigationRoute(1, 1, 'run-1:offer-1', 'left')).toBe(false)
    expect(await f.channel.commitNavigationRoute(2, 1, 'run-1:offer-1', routeId)).toBe(true)
    expect(f.commitNavigationRoute).toHaveBeenCalledWith({ requestId: 2, revision: 1, offerId: 'run-1:offer-1', routeId })
    expect(execute.mock.calls.at(-1)?.[0].action).toBe('commitNavigationRoute')
  })

  it('uses the actual Bridge dispatcher for candidate observations and route commitments', async () => {
    const execute = vi.spyOn(CesiumBridge.prototype, 'execute')
    const f = routeFixture()
    const observation = await f.channel.readNavigationOptions()
    observation.candidates[0].feasible = false
    expect(await f.channel.commitNavigationRoute(1, 1, 'run-1:offer-1', 'left')).toBe(true)
    expect(f.commitNavigationRoute).toHaveBeenCalledWith({ requestId: 1, revision: 1, offerId: 'run-1:offer-1', routeId: 'left' })
    expect(execute.mock.calls.map(([command]) => command.action)).toEqual(['readNavigationOptions', 'commitNavigationRoute'])
    expect(f.onTrace.mock.calls.map(([trace]) => trace.status)).toEqual(['succeeded', 'succeeded'])
  })

  it('rejects a missing observation, repeated request and a stopped run', async () => {
    const f = routeFixture()
    expect(await f.channel.commitNavigationRoute(1, 1, 'run-1:offer-1', 'left')).toBe(false)
    await f.channel.readNavigationOptions()
    expect(await f.channel.commitNavigationRoute(1, 1, 'run-1:offer-1', 'left')).toBe(true)
    expect(await f.channel.commitNavigationRoute(1, 1, 'run-1:offer-1', 'right')).toBe(false)
    await f.channel.stop()
    expect(await f.channel.commitNavigationRoute(2, 1, 'run-1:offer-1', 'right')).toBe(false)
    expect(f.commitNavigationRoute).toHaveBeenCalledOnce()
  })

  it.each([
    { revision: 2 }, { offerId: 'run-2:offer-1' },
    { candidates: routeOffer().candidates.map(candidate => ({ ...candidate, lengthMeters: candidate.lengthMeters + 2 })) },
  ])('rejects a delayed choice after the observed offer changes: %j', async changes => {
    const f = routeFixture()
    await f.channel.readNavigationOptions()
    f.setOffer(routeOffer(changes))
    expect(await f.channel.commitNavigationRoute(1, 1, 'run-1:offer-1', 'left')).toBe(false)
    expect(f.commitNavigationRoute).not.toHaveBeenCalled()
  })

  it('rejects stale choices and observes the current callback rejection', async () => {
    const f = routeFixture()
    await f.channel.readNavigationOptions()
    f.setNow(NOW + 20_001)
    f.setOffer(routeOffer({ capturedAt: new Date(NOW + 20_001).toISOString() }))
    expect(await f.channel.commitNavigationRoute(1, 1, 'run-1:offer-1', 'left')).toBe(false)
    await f.channel.readNavigationOptions()
    f.commitNavigationRoute.mockReturnValue(false)
    expect(await f.channel.commitNavigationRoute(2, 1, 'run-1:offer-1', 'left')).toBe(false)
    expect(f.onTrace.mock.calls.at(-1)?.[0].status).toBe('rejected')
  })

  it('rejects an infeasible side without silently replacing it, while accepting explicit hold', async () => {
    const f = routeFixture()
    f.setOffer(routeOffer({ candidates: routeOffer().candidates.map(candidate => ({ ...candidate, feasible: false })) }))
    await f.channel.readNavigationOptions()
    expect(await f.channel.commitNavigationRoute(1, 1, 'run-1:offer-1', 'left')).toBe(false)
    expect(await f.channel.commitNavigationRoute(2, 1, 'run-1:offer-1', 'hold')).toBe(true)
    expect(f.commitNavigationRoute).toHaveBeenCalledTimes(1)
    expect(f.commitNavigationRoute).toHaveBeenCalledWith(expect.objectContaining({ routeId: 'hold' }))
  })

  it('validates direct dispatcher route fields and fails clearly when hooks are absent', async () => {
    const f = routeFixture()
    await f.channel.readNavigationOptions()
    const result = await f.channel.bridge.execute({ action: 'commitNavigationRoute', params: {
      requestId: 1, revision: 1, offerId: 'run-1:offer-1', routeId: 'teleport', path: [1, 2],
    } })
    expect(result.success).toBe(false)
    expect(f.commitNavigationRoute).not.toHaveBeenCalled()
    await expect(fixture().channel.readNavigationOptions()).rejects.toThrow('not configured')
  })

  it('invalidates prior options if a subsequent read fails', async () => {
    const f = routeFixture()
    await f.channel.readNavigationOptions()
    f.readNavigationOptions.mockImplementationOnce(() => { throw new Error('Route observation failed') })
    await expect(f.channel.readNavigationOptions()).rejects.toThrow()
    expect(await f.channel.commitNavigationRoute(1, 1, 'run-1:offer-1', 'left')).toBe(false)
  })
})
