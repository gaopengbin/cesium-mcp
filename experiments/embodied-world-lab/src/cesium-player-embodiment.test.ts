import { describe, expect, it, vi } from 'vitest'

import {
  CesiumPlayerEmbodiment,
} from './cesium-player-embodiment.js'
import type {
  CesiumPlayerControllerPort,
} from './cesium-player-embodiment.js'

function createController(): CesiumPlayerControllerPort {
  return {
    getCenterScreenRaycastHit: () => undefined,
    getControllerMode: () => 0,
    getIsFlying: () => false,
    getIsOnGround: () => true,
    getPosition: () => ({ x: 1, y: 2, z: 3 }),
    getVelocity: () => ({ e: 0, n: 0, u: 0 }),
    getYaw: () => 0,
    setInput: vi.fn(),
  }
}

describe('CesiumPlayerEmbodiment actor-space sensor', () => {
  it('casts front, left and right rays from the actor instead of the camera', () => {
    const controller = createController() as CesiumPlayerControllerPort & {
      frame: {
        enuVectorToEcef(vector: { x: number, y: number, z: number }): {
          x: number
          y: number
          z: number
        }
      }
      physics: {
        charBody: object
        raycastEcef(
          origin: { x: number, y: number, z: number },
          direction: { x: number, y: number, z: number },
          maximumDistance: number,
          excludedBody?: object,
        ): number
        raycastEcefHit(
          origin: { x: number, y: number, z: number },
          direction: { x: number, y: number, z: number },
          maximumDistance: number,
          excludedBody?: object,
        ): {
          distance: number
          point: { x: number, y: number, z: number }
          normal: { x: number, y: number, z: number }
        } | undefined
      }
    }
    controller.frame = {
      enuVectorToEcef: vector => ({ ...vector }),
    }
    controller.physics = {
      charBody: {},
      raycastEcef: vi.fn((_origin, direction, maximumDistance) => {
        if (Math.abs(direction.x) < 0.1) return 6
        return direction.x < 0 ? 14 : maximumDistance
      }),
      raycastEcefHit: vi.fn(() => undefined),
    }
    const embodiment = new CesiumPlayerEmbodiment(controller)

    expect(embodiment.senseActorRayFan(28)).toEqual({
      front: 6,
      left: 14,
      right: 28,
    })
    expect(controller.physics.raycastEcef).toHaveBeenCalledTimes(3)
  })

  it('tilts each actor ray along the observed terrain slope', () => {
    const controller = createController() as CesiumPlayerControllerPort & {
      frame: {
        enuVectorToEcef(vector: { x: number, y: number, z: number }): {
          x: number
          y: number
          z: number
        }
      }
      physics: {
        charBody: object
        raycastEcef(
          origin: { x: number, y: number, z: number },
          direction: { x: number, y: number, z: number },
          maximumDistance: number,
          excludedBody?: object,
        ): number
        raycastEcefHit(
          origin: { x: number, y: number, z: number },
          direction: { x: number, y: number, z: number },
          maximumDistance: number,
          excludedBody?: object,
        ): {
          distance: number
          point: { x: number, y: number, z: number }
          normal: { x: number, y: number, z: number }
        } | undefined
      }
    }
    controller.frame = {
      enuVectorToEcef: vector => ({ ...vector }),
    }
    controller.physics = {
      charBody: {},
      raycastEcef: vi.fn((_origin, _direction, maximumDistance) => maximumDistance),
      raycastEcefHit: vi.fn(() => undefined),
    }
    const embodiment = new CesiumPlayerEmbodiment(controller)

    embodiment.senseActorRayFan(28, { front: 26.565 })

    const frontDirection = vi.mocked(controller.physics.raycastEcef).mock.calls[0][1]
    expect(frontDirection.x).toBeCloseTo(0)
    expect(frontDirection.y).toBeCloseTo(0.894, 2)
    expect(frontDirection.z).toBeCloseTo(0.447, 2)
  })

  it('returns hit positions and normals for terrain-aware classification', () => {
    const controller = createController() as CesiumPlayerControllerPort & {
      frame: {
        enuVectorToEcef(vector: { x: number, y: number, z: number }): {
          x: number
          y: number
          z: number
        }
      }
      physics: {
        charBody: object
        raycastEcef(): number
        raycastEcefHit(): {
          distance: number
          point: { x: number, y: number, z: number }
          normal: { x: number, y: number, z: number }
        } | undefined
      }
    }
    controller.frame = {
      enuVectorToEcef: vector => ({ ...vector }),
    }
    controller.physics = {
      charBody: {},
      raycastEcef: vi.fn(() => Number.POSITIVE_INFINITY),
      raycastEcefHit: vi.fn(() => ({
        distance: 7,
        point: { x: 10, y: 20, z: 30 },
        normal: { x: 0, y: 0, z: 1 },
      })),
    }
    const embodiment = new CesiumPlayerEmbodiment(controller)

    expect(embodiment.senseActorRayHitFan(28)?.front).toEqual({
      distanceMeters: 7,
      positionEcef: { x: 10, y: 20, z: 30 },
      normalEcef: { x: 0, y: 0, z: 1 },
    })
  })
})
