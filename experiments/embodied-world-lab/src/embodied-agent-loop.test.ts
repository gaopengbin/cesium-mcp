import { describe, expect, it, vi } from 'vitest'

import type {
  EmbodiedMotionInput,
  EmbodiedStateObservation,
  NormalizedEmbodiedMotionInput,
} from '../../../packages/cesium-mcp-spatial/src/index.js'
import { EmbodiedAgentLoop } from './embodied-agent-loop.js'
import type {
  EmbodiedPlan,
  EmbodiedWorldSnapshot,
  NavigationCandidate,
} from './embodied-agent-loop.js'

function createActuator() {
  return {
    applyInput: vi.fn((input: EmbodiedMotionInput): NormalizedEmbodiedMotionInput => ({
      moveX: input.moveX ?? 0,
      moveY: input.moveY ?? 0,
      lookX: input.lookX ?? 0,
      lookY: input.lookY ?? 0,
      jump: input.jump === true,
      sprint: input.sprint === true,
      toggleView: input.toggleView === true,
      toggleFly: input.toggleFly === true,
      toggleVehicle: input.toggleVehicle === true,
    })),
    observe: vi.fn((): EmbodiedStateObservation => ({
      capturedAt: '2026-09-04T00:00:00.000Z',
      mode: 'character',
      positionEcef: { x: 1, y: 2, z: 3 },
      headingRadians: 0,
      velocityEnu: { east: 0, north: 0, up: 0 },
      grounded: true,
      flying: false,
    })),
    stop: vi.fn(() => {}),
  }
}

function candidate(
  id: NavigationCandidate['id'],
  clearanceMeters = 80,
  traversable = true,
): NavigationCandidate {
  return {
    id,
    clearanceMeters,
    slopeDegrees: 4,
    terrainReady: true,
    traversable,
  }
}

function world(overrides: Partial<EmbodiedWorldSnapshot> = {}): EmbodiedWorldSnapshot {
  return {
    revision: 1,
    capturedAt: '2026-09-04T00:00:00.000Z',
    mode: 'character',
    distanceToGoalMeters: 120,
    bearingErrorRadians: 0.2,
    grounded: true,
    speedMetersPerSecond: 0,
    candidates: [candidate('front'), candidate('left'), candidate('right')],
    ...overrides,
  }
}

function plan(overrides: Partial<EmbodiedPlan> = {}): EmbodiedPlan {
  return {
    intent: 'advance',
    durationMs: 2_000,
    reason: 'The goal corridor is traversable',
    confidence: 0.9,
    source: 'model',
    ...overrides,
  }
}

describe('EmbodiedAgentLoop', () => {
  it('waits neutrally for the first asynchronous plan', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator)
    loop.start(1)

    const result = loop.tick(world(), 0)

    expect(result.needsPlanning).toBe(true)
    expect(result.input.moveY).toBe(0)
    expect(result.state.planner).toBe('idle')
  })

  it('executes a current model plan without waiting in the fast tick', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator)
    loop.start(1)
    const requestId = loop.beginPlanning(world())!
    expect(loop.commitPlan(requestId, 1, plan(), 10)).toBe(true)

    const result = loop.tick(world(), 20)

    expect(result.needsPlanning).toBe(false)
    expect(result.input.moveY).toBe(0.72)
    expect(result.input.sprint).toBe(true)
  })

  it('turns in place toward the clearer side while a new plan is pending', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator, { emergencyClearanceMeters: 20 })
    loop.start(1)
    const requestId = loop.beginPlanning(world())!
    loop.commitPlan(requestId, 1, plan(), 0)

    const result = loop.tick(world({
      revision: 2,
      hazardId: 'landslide-01',
      candidates: [
        candidate('front', 8, false),
        candidate('left', 65, true),
        candidate('right', 22, true),
      ],
    }), 100)

    expect(result.state.safety).toBe('avoiding')
    expect(result.input.lookX).toBe(-0.8)
    expect(result.input.moveY).toBe(0)
    expect(result.needsPlanning).toBe(true)
  })

  it('rejects a late plan from a superseded world revision', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator)
    loop.start(1)
    const requestId = loop.beginPlanning(world())!
    loop.tick(world({ revision: 2 }), 100)

    expect(loop.commitPlan(requestId, 1, plan(), 200)).toBe(false)
    expect(loop.getState().activeIntent).toBeUndefined()
  })

  it('sends one neutral terminal stop and keeps the first terminal state', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator)
    loop.start(1)

    const result = loop.tick(world({ distanceToGoalMeters: 3 }), 0)
    loop.tick(world({ distanceToGoalMeters: 2 }), 20)
    loop.stop()

    expect(loop.getState().lifecycle).toBe('completed')
    expect(result.input.moveY).toBe(0)
    expect(result.input.lookX).toBe(0)
    expect(actuator.stop).toHaveBeenCalledTimes(1)
  })

  it('stops fail-safe instead of rolling back to an older world revision', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator)
    loop.start(2)

    const result = loop.tick(world({ revision: 1 }), 100)

    expect(result.state.worldRevision).toBe(2)
    expect(result.state.safety).toBe('blocked')
    expect(result.input.moveY).toBe(0)
    expect(loop.beginPlanning(world({ revision: 1 }))).toBeUndefined()
  })

  it('does not create a planning request storm while an emergency plan is active', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator)
    loop.start(1)
    const blocked = world({
      candidates: [
        candidate('front', 6, false),
        candidate('left', 26, true),
        candidate('right', 22, true),
      ],
    })
    expect(loop.tick(blocked, 0).needsPlanning).toBe(true)
    const requestId = loop.beginPlanning(blocked)!
    expect(loop.commitPlan(requestId, 1, plan({ intent: 'turn-left' }), 10)).toBe(true)

    expect(loop.tick(blocked, 20).needsPlanning).toBe(false)
    expect(loop.beginPlanning(blocked)).toBeUndefined()
  })

  it('keeps moving on a provisional local plan while the model is pending', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator)
    loop.start(1)
    loop.tick(world(), 0)
    const requestId = loop.beginPlanning(world())!

    expect(loop.setProvisionalPlan(
      requestId,
      1,
      plan({ source: 'fallback', durationMs: 8_000 }),
      0,
    )).toBe(true)
    const pending = loop.tick(world(), 100)

    expect(pending.state.planner).toBe('pending')
    expect(pending.state.activePlanSource).toBe('fallback')
    expect(pending.input.moveY).toBe(0.72)
    expect(loop.commitPlan(requestId, 1, plan({ intent: 'inspect-left' }), 200)).toBe(true)
    expect(loop.tick(world(), 250).input.lookX).toBe(-0.45)
  })

  it('rejects a model result after pose drift within the same world revision', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator, { planningDistanceDriftMeters: 10 })
    const initialWorld = world({ distanceToGoalMeters: 120 })
    loop.start(1)
    loop.tick(initialWorld, 0)
    const requestId = loop.beginPlanning(initialWorld)!
    loop.setProvisionalPlan(
      requestId,
      1,
      plan({ source: 'fallback', durationMs: 16_000 }),
      0,
    )

    loop.tick(world({ distanceToGoalMeters: 98 }), 5_000)

    expect(loop.commitPlan(requestId, 1, plan({ intent: 'turn-left' }), 5_100)).toBe(false)
    expect(loop.getState().activePlanSource).toBe('fallback')
    expect(loop.getState().planner).toBe('committed')
    expect(loop.tick(world({ distanceToGoalMeters: 97 }), 5_200).input.moveY).toBe(0.72)
  })

  it('keeps provisional control active until the hosted timeout can settle', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator)
    const snapshot = world()
    loop.start(1)
    loop.tick(snapshot, 0)
    const requestId = loop.beginPlanning(snapshot)!
    loop.setProvisionalPlan(
      requestId,
      1,
      plan({ source: 'fallback', durationMs: 16_000 }),
      0,
    )

    const stillPending = loop.tick(world(), 15_000)

    expect(stillPending.state.planner).toBe('pending')
    expect(stillPending.state.activePlanSource).toBe('fallback')
    expect(stillPending.input.moveY).toBe(0.72)
  })

  it('stops translation and scans in place when stopping clearance is insufficient', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator, { emergencyClearanceMeters: 20 })
    loop.start(1)

    const result = loop.tick(world({
      speedMetersPerSecond: 18,
      candidates: [
        candidate('front', 8, false),
        candidate('left', 64, true),
        candidate('right', 65, true),
      ],
    }), 0)

    expect(result.state.safety).toBe('avoiding')
    expect(result.input.moveY).toBe(0)
    expect(result.input.lookX).toBe(0.8)
  })

  it('commits to a verified bypass leg before steering back toward the goal', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator, {
      emergencyClearanceMeters: 12,
      avoidanceBypassDurationMs: 1_000,
    })
    loop.start(1)
    const requestId = loop.beginPlanning(world())!
    loop.commitPlan(requestId, 1, plan(), 0)

    const blocked = world({
      candidates: [
        candidate('front', 6, false),
        candidate('left', 8, false),
        candidate('right', 24, true),
      ],
    })
    const clear = world({
      bearingErrorRadians: -0.5,
      candidates: [candidate('front', 32), candidate('left', 32), candidate('right', 32)],
    })

    expect(loop.tick(blocked, 0).input.lookX).toBe(0.8)
    expect(loop.tick(clear, 100).input.moveY).toBe(0)
    expect(loop.tick(clear, 150).input.moveY).toBe(0)
    expect(loop.tick(clear, 200).input.moveY).toBe(0)
    const bypass = loop.tick(clear, 250)
    expect(bypass.state.safety).toBe('avoiding')
    expect(bypass.input.moveY).toBe(0.56)
    expect(bypass.input.lookX).toBe(0)
    expect(bypass.input.sprint).toBe(true)

    expect(loop.tick(clear, 1_249).state.safety).toBe('avoiding')
    const resumed = loop.tick(clear, 1_250)
    expect(resumed.state.safety).toBe('clear')
    expect(resumed.input.moveY).toBe(0.72)
    expect(resumed.input.lookX).toBeLessThan(0)
  })

  it('returns to an in-place scan if the bypass corridor becomes blocked', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator, { avoidanceBypassDurationMs: 1_000 })
    loop.start(1)
    const blocked = world({
      candidates: [
        candidate('front', 5, false),
        candidate('left', 8, false),
        candidate('right', 20, true),
      ],
    })
    const clear = world()

    loop.tick(blocked, 0)
    loop.tick(clear, 100)
    loop.tick(clear, 150)
    loop.tick(clear, 200)
    expect(loop.tick(clear, 250).input.moveY).toBe(0.56)
    const rescanning = loop.tick(blocked, 300)

    expect(rescanning.state.safety).toBe('avoiding')
    expect(rescanning.input.moveY).toBe(0)
    expect(rescanning.input.lookX).toBe(0.8)
  })

  it('stops a bypass immediately when front terrain becomes non-traversable', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator, { avoidanceBypassDurationMs: 1_000 })
    loop.start(1)
    const blocked = world({
      candidates: [
        candidate('front', 5, false),
        candidate('left', 8, false),
        candidate('right', 24, true),
      ],
    })
    const clear = world()

    loop.tick(blocked, 0)
    loop.tick(clear, 100)
    loop.tick(clear, 150)
    loop.tick(clear, 200)
    expect(loop.tick(clear, 250).input.moveY).toBe(0.56)

    const steepFront = world({
      candidates: [
        candidate('front', 32, false),
        candidate('left', 32, true),
        candidate('right', 32, true),
      ],
    })
    const stopped = loop.tick(steepFront, 300)

    expect(stopped.input.moveY).toBe(0)
    expect(stopped.state.safety).toBe('avoiding')
  })

  it('bounds an in-place scan and holds after both directions fail', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator, {
      emergencyClearanceMeters: 12,
      avoidanceScanDurationMs: 100,
    })
    loop.start(1)
    const blocked = world({
      candidates: [
        candidate('front', 6, false),
        candidate('left', 32, true),
        candidate('right', 30, true),
      ],
    })

    expect(loop.tick(blocked, 0).input.lookX).toBe(-0.8)
    expect(loop.tick(blocked, 100).input.lookX).toBe(0.8)
    const held = loop.tick(blocked, 200)
    const stillHeld = loop.tick(blocked, 250)

    expect(held.state.safety).toBe('blocked')
    expect(held.input.lookX).toBe(0)
    expect(held.input.moveY).toBe(0)
    expect(stillHeld.state.safety).toBe('blocked')
    expect(stillHeld.input.lookX).toBe(0)
  })

  it('does not reset the bounded scan timer on transient safe readings', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator, { avoidanceScanDurationMs: 100 })
    loop.start(1)
    const blocked = world({
      candidates: [
        candidate('front', 6, false),
        candidate('left', 32, true),
        candidate('right', 30, true),
      ],
    })
    const brieflyClear = world()

    loop.tick(blocked, 0)
    loop.tick(brieflyClear, 80)
    const changedSide = loop.tick(blocked, 100)
    loop.tick(brieflyClear, 180)
    const held = loop.tick(blocked, 200)

    expect(changedSide.input.lookX).toBe(0.8)
    expect(held.state.safety).toBe('blocked')
    expect(held.input.moveY).toBe(0)
    expect(held.input.lookX).toBe(0)
  })

  it('holds when blocked and neither side has terrain evidence', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator)
    loop.start(1)
    const unknownSide = (id: 'left' | 'right'): NavigationCandidate => ({
      ...candidate(id, 0, false),
      terrainReady: false,
    })

    const result = loop.tick(world({
      candidates: [
        candidate('front', 5, false),
        unknownSide('left'),
        unknownSide('right'),
      ],
    }), 0)

    expect(result.state.safety).toBe('blocked')
    expect(result.input.moveY).toBe(0)
    expect(result.input.lookX).toBe(0)
  })

  it('uses neutral steering when bearing evidence is not finite', () => {
    const actuator = createActuator()
    const loop = new EmbodiedAgentLoop(actuator)
    loop.start(1)
    const requestId = loop.beginPlanning(world())!
    loop.commitPlan(requestId, 1, plan(), 0)

    const result = loop.tick(world({ bearingErrorRadians: Number.NaN }), 10)

    expect(result.input.lookX).toBe(0)
  })
})
