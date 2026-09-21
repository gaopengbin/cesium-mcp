import { describe, expect, it, vi } from 'vitest'
import { Cartesian3 } from 'cesium'

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
  it('can omit the camera diagnostic without losing the actor observation or sprint setting', () => {
    const controller = createController()
    controller.getCenterScreenRaycastHit = vi.fn(() => { throw new Error('Camera ray is inside a building') })
    const embodiment = new CesiumPlayerEmbodiment(controller, { includeCameraRay: false, allowSprint: false })
    expect(embodiment.observe()).toMatchObject({ positionEcef: { x: 1, y: 2, z: 3 }, grounded: true })
    expect(embodiment.observe()).not.toHaveProperty('physicsCenterRayHit')
    expect(controller.getCenterScreenRaycastHit).not.toHaveBeenCalled()
    embodiment.applyInput({ moveY: 1, sprint: true })
    expect(controller.setInput).toHaveBeenCalledWith(expect.objectContaining({ moveY: 1, shift: false }))
  })

  it('retains the camera diagnostic by default', () => {
    const controller = createController()
    controller.getCenterScreenRaycastHit = vi.fn(() => ({
      distance: 4, position: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 0, z: 1 },
    }))
    expect(new CesiumPlayerEmbodiment(controller).observe().physicsCenterRayHit?.distanceMeters).toBe(4)
    expect(controller.getCenterScreenRaycastHit).toHaveBeenCalledOnce()
  })

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

  it('keeps solid-ray hits as obstacles when the library cannot normalize an interior hit normal', () => {
    const controller = Object.assign(createController(), {
      frame: { enuVectorToEcef: (vector: Cartesian3) => ({ ...vector }) },
      physics: {
        charBody: {},
        raycastEcef: vi.fn(() => 0),
        raycastEcefHit: vi.fn(() => {
          Cartesian3.normalize(new Cartesian3(), new Cartesian3())
          return undefined
        }),
      },
    })
    const hits = new CesiumPlayerEmbodiment(controller).senseActorRayHitFan(28)
    for (const id of ['front', 'left', 'right'] as const) {
      expect(hits?.[id]).toMatchObject({
        distanceMeters: 0, normalKnown: false,
        normalEcef: { x: 0, y: 0, z: 0 }, positionEcef: { x: 1, y: 2, z: 3.8 },
      })
    }
    expect(controller.physics.raycastEcef).toHaveBeenCalledTimes(3)
    expect(controller.physics.raycastEcef.mock.calls).toEqual(controller.physics.raycastEcefHit.mock.calls)
  })

  it('preserves a finite fallback distance and derives its hit position along the same ray', () => {
    const controller = Object.assign(createController(), {
      frame: { enuVectorToEcef: (vector: Cartesian3) => ({ ...vector }) },
      physics: {
        charBody: {}, raycastEcef: vi.fn(() => 3),
        raycastEcefHit: vi.fn(() => { throw new Error('normalized result is not a number') }),
      },
    })
    expect(new CesiumPlayerEmbodiment(controller).senseActorRayHitFan(28)?.front).toEqual({
      distanceMeters: 3, normalKnown: false,
      normalEcef: { x: 0, y: 0, z: 0 }, positionEcef: { x: 1, y: 5, z: 3.8 },
    })
  })

  it('does not hide unrelated raycast failures or interpret an invalid fallback distance as clear space', () => {
    const controller = Object.assign(createController(), {
      frame: { enuVectorToEcef: (vector: Cartesian3) => ({ ...vector }) },
      physics: {
        charBody: {}, raycastEcef: vi.fn(() => Infinity),
        raycastEcefHit: vi.fn(() => { throw new Error('Physics world unavailable') }),
      },
    })
    const embodiment = new CesiumPlayerEmbodiment(controller)
    expect(() => embodiment.senseActorRayHitFan()).toThrow('Physics world unavailable')
    expect(controller.physics.raycastEcef).not.toHaveBeenCalled()
    controller.physics.raycastEcefHit.mockImplementation(() => { throw new Error('normalized result is not a number') })
    expect(() => embodiment.senseActorRayHitFan()).toThrow('normalized result is not a number')
  })
})
