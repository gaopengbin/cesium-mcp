import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Viewer } from 'cesium'
import { CesiumBridge } from '../../../packages/cesium-mcp-bridge/src/index.js'
import { createBridgeAgentChannel } from './bridge-agent-channel.js'
import type { EmbodiedPlan, EmbodiedWorldSnapshot } from './embodied-agent-loop.js'

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
