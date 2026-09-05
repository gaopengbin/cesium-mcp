import { describe, expect, it, vi } from 'vitest'
import { Cartesian3 } from 'cesium'

import {
  CesiumPlayerEmbodiment,
} from './cesium-player-embodiment.js'

function createController() {
  return {
    getCenterScreenRaycastHit: vi.fn(() => ({
      distance: 18,
      normal: new Cartesian3(0, 0, 1),
      position: new Cartesian3(4, 5, 6),
    })),
    getControllerMode: vi.fn(() => 1 as const),
    getIsFlying: vi.fn(() => false),
    getIsOnGround: vi.fn(() => true),
    getPosition: vi.fn(() => new Cartesian3(1, 2, 3)),
    getYaw: vi.fn(() => 0.75),
    getVelocity: vi.fn(() => ({ e: 7, n: 8, u: 9 })),
    setInput: vi.fn(),
  }
}

describe('CesiumPlayerEmbodiment', () => {
  it('maps bounded world actions onto controller input', () => {
    const controller = createController()
    const embodiment = new CesiumPlayerEmbodiment(controller, {
      lookDeltaScale: 12,
    })

    const applied = embodiment.applyInput({
      lookX: 3,
      moveX: -2,
      moveY: 0.5,
      sprint: true,
    })

    expect(applied.moveX).toBe(-1)
    expect(applied.lookX).toBe(1)
    expect(controller.setInput).toHaveBeenCalledWith({
      jump: false,
      lookDeltaX: 12,
      lookDeltaY: 0,
      moveX: -1,
      moveY: 0.5,
      shift: true,
      toggleFly: false,
      toggleVehicle: false,
      toggleView: false,
    })
  })

  it('serializes controller state as world observation evidence', () => {
    const controller = createController()
    const embodiment = new CesiumPlayerEmbodiment(
      controller,
      { now: () => '2026-09-03T05:00:00.000Z' },
    )

    expect(embodiment.observe()).toEqual({
      capturedAt: '2026-09-03T05:00:00.000Z',
      physicsCenterRayHit: {
        distanceMeters: 18,
        normalEcef: { x: 0, y: 0, z: 1 },
        positionEcef: { x: 4, y: 5, z: 6 },
      },
      flying: false,
      grounded: true,
      headingRadians: 0.75,
      mode: 'vehicle',
      positionEcef: { x: 1, y: 2, z: 3 },
      velocityEnu: { east: 7, north: 8, up: 9 },
    })
  })

  it('sends a neutral input when stopped', () => {
    const controller = createController()
    const embodiment = new CesiumPlayerEmbodiment(controller)

    embodiment.stop()

    expect(controller.setInput).toHaveBeenLastCalledWith({
      jump: false,
      lookDeltaX: 0,
      lookDeltaY: 0,
      moveX: 0,
      moveY: 0,
      shift: false,
      toggleFly: false,
      toggleVehicle: false,
      toggleView: false,
    })
  })
})
