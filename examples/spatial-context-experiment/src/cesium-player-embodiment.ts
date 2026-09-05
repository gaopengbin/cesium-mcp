import {
  normalizeEmbodiedMotionInput,
} from 'cesium-mcp-spatial'
import type {
  EmbodiedActuator,
  EmbodiedMotionInput,
  EmbodiedStateObservation,
  EmbodiedVector3,
  NormalizedEmbodiedMotionInput,
} from 'cesium-mcp-spatial'

interface CartesianLike {
  x: number
  y: number
  z: number
}

interface PlayerInput {
  moveX: number
  moveY: number
  lookDeltaX: number
  lookDeltaY: number
  jump: boolean
  shift: boolean
  toggleView: boolean
  toggleFly: boolean
  toggleVehicle: boolean
}

export interface CesiumPlayerControllerPort {
  getCenterScreenRaycastHit(): {
    distance: number
    position: CartesianLike
    normal: CartesianLike
  } | undefined
  getControllerMode(): 0 | 1
  getIsFlying(): boolean
  getIsOnGround(): boolean
  getPosition(): CartesianLike
  getYaw(): number
  getVelocity(): { e: number, n: number, u: number }
  setInput(input: PlayerInput): void
}

export interface CesiumPlayerEmbodimentOptions {
  lookDeltaScale?: number
  now?: () => string
}

export class CesiumPlayerEmbodiment implements EmbodiedActuator {
  private readonly lookDeltaScale: number
  private readonly now: () => string

  constructor(
    private readonly controller: CesiumPlayerControllerPort,
    options: CesiumPlayerEmbodimentOptions = {},
  ) {
    this.lookDeltaScale = positiveFinite(options.lookDeltaScale, 20)
    this.now = options.now ?? (() => new Date().toISOString())
  }

  applyInput(input: EmbodiedMotionInput): NormalizedEmbodiedMotionInput {
    const normalized = normalizeEmbodiedMotionInput(input)
    this.controller.setInput({
      moveX: normalized.moveX,
      moveY: normalized.moveY,
      lookDeltaX: normalized.lookX * this.lookDeltaScale,
      lookDeltaY: normalized.lookY * this.lookDeltaScale,
      jump: normalized.jump,
      shift: normalized.sprint,
      toggleView: normalized.toggleView,
      toggleFly: normalized.toggleFly,
      toggleVehicle: normalized.toggleVehicle,
    })
    return normalized
  }

  observe(): EmbodiedStateObservation {
    const position = this.controller.getPosition()
    const velocity = this.controller.getVelocity()
    const physicsCenterRayHit = this.controller.getCenterScreenRaycastHit()

    return {
      capturedAt: this.now(),
      mode: this.controller.getControllerMode() === 1 ? 'vehicle' : 'character',
      positionEcef: vector3(position),
      headingRadians: this.controller.getYaw(),
      velocityEnu: {
        east: velocity.e,
        north: velocity.n,
        up: velocity.u,
      },
      grounded: this.controller.getIsOnGround(),
      flying: this.controller.getIsFlying(),
      ...(physicsCenterRayHit
        ? {
            physicsCenterRayHit: {
              distanceMeters: physicsCenterRayHit.distance,
              positionEcef: vector3(physicsCenterRayHit.position),
              normalEcef: vector3(physicsCenterRayHit.normal),
            },
          }
        : {}),
    }
  }

  stop(): void {
    this.applyInput({})
  }
}

function vector3(value: EmbodiedVector3): EmbodiedVector3 {
  return { x: value.x, y: value.y, z: value.z }
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}
