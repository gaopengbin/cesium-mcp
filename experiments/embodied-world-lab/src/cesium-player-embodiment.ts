import { normalizeEmbodiedMotionInput } from '../../../packages/cesium-mcp-spatial/src/index.js'
import type {
  EmbodiedActuator,
  EmbodiedMotionInput,
  EmbodiedStateObservation,
  EmbodiedVector3,
  NormalizedEmbodiedMotionInput,
} from '../../../packages/cesium-mcp-spatial/src/index.js'

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
  getVelocity(): { e: number, n: number, u: number }
  getYaw(): number
  setInput(input: PlayerInput): void
}

export interface CesiumPlayerEmbodimentOptions {
  lookDeltaScale?: number
  now?: () => string
}

export interface ActorRayFan {
  front: number
  left: number
  right: number
}

export type ActorRayTerrainSlopes = Partial<Record<keyof ActorRayFan, number>>

export interface ActorRayHit {
  distanceMeters: number
  positionEcef: CartesianLike
  normalEcef: CartesianLike
}

export type ActorRayHitFan = Partial<Record<keyof ActorRayFan, ActorRayHit>>

interface PlayerSensorPort {
  frame: {
    enuVectorToEcef(vector: CartesianLike, result?: CartesianLike): CartesianLike
  }
  physics: {
    charBody: unknown
    raycastEcef(
      origin: CartesianLike,
      direction: CartesianLike,
      maximumDistance: number,
      excludedBody?: unknown,
    ): number
    raycastEcefHit(
      origin: CartesianLike,
      direction: CartesianLike,
      maximumDistance: number,
      excludedBody?: unknown,
    ): {
      distance: number
      point: CartesianLike
      normal: CartesianLike
    } | undefined
  }
}

export class CesiumPlayerEmbodiment implements EmbodiedActuator {
  private readonly lookDeltaScale: number
  private readonly now: () => string

  constructor(
    private readonly controller: CesiumPlayerControllerPort,
    options: CesiumPlayerEmbodimentOptions = {},
  ) {
    this.lookDeltaScale = positiveFinite(options.lookDeltaScale, 0.8)
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

  senseActorRayFan(
    maximumDistanceMeters = 28,
    terrainSlopeDegrees: ActorRayTerrainSlopes = {},
  ): ActorRayFan | undefined {
    const sensor = this.controller as unknown as Partial<PlayerSensorPort>
    if (!sensor.frame?.enuVectorToEcef || !sensor.physics?.raycastEcef) return undefined

    const maximumDistance = positiveFinite(maximumDistanceMeters, 28)
    const position = this.controller.getPosition()
    const up = sensor.frame.enuVectorToEcef({ x: 0, y: 0, z: 1 })
    const origin = {
      x: position.x + up.x * 0.8,
      y: position.y + up.y * 0.8,
      z: position.z + up.z * 0.8,
    }
    const heading = this.controller.getYaw()

    return {
      front: castActorRay(
        sensor as PlayerSensorPort,
        origin,
        heading,
        slopeRadians(terrainSlopeDegrees.front),
        maximumDistance,
      ),
      left: castActorRay(
        sensor as PlayerSensorPort,
        origin,
        heading - Math.PI / 5,
        slopeRadians(terrainSlopeDegrees.left),
        maximumDistance,
      ),
      right: castActorRay(
        sensor as PlayerSensorPort,
        origin,
        heading + Math.PI / 5,
        slopeRadians(terrainSlopeDegrees.right),
        maximumDistance,
      ),
    }
  }

  senseActorRayHitFan(
    maximumDistanceMeters = 28,
    terrainSlopeDegrees: ActorRayTerrainSlopes = {},
  ): ActorRayHitFan | undefined {
    const sensor = this.controller as unknown as Partial<PlayerSensorPort>
    if (!sensor.frame?.enuVectorToEcef || !sensor.physics?.raycastEcefHit) return undefined

    const maximumDistance = positiveFinite(maximumDistanceMeters, 28)
    const position = this.controller.getPosition()
    const up = sensor.frame.enuVectorToEcef({ x: 0, y: 0, z: 1 })
    const origin = {
      x: position.x + up.x * 0.8,
      y: position.y + up.y * 0.8,
      z: position.z + up.z * 0.8,
    }
    const heading = this.controller.getYaw()
    const typedSensor = sensor as PlayerSensorPort
    const hits: ActorRayHitFan = {}
    const front = castActorRayHit(
      typedSensor,
      origin,
      heading,
      slopeRadians(terrainSlopeDegrees.front),
      maximumDistance,
    )
    const left = castActorRayHit(
      typedSensor,
      origin,
      heading - Math.PI / 5,
      slopeRadians(terrainSlopeDegrees.left),
      maximumDistance,
    )
    const right = castActorRayHit(
      typedSensor,
      origin,
      heading + Math.PI / 5,
      slopeRadians(terrainSlopeDegrees.right),
      maximumDistance,
    )
    if (front) hits.front = front
    if (left) hits.left = left
    if (right) hits.right = right
    return hits
  }

  stop(): void {
    this.applyInput({})
  }
}

function castActorRay(
  sensor: PlayerSensorPort,
  origin: CartesianLike,
  headingRadians: number,
  terrainSlopeRadians: number,
  maximumDistance: number,
): number {
  const directionEnu = {
    x: Math.sin(headingRadians),
    y: Math.cos(headingRadians),
    z: Math.tan(terrainSlopeRadians),
  }
  const directionEcef = normalizeVector(sensor.frame.enuVectorToEcef(directionEnu))
  const distance = sensor.physics.raycastEcef(
    origin,
    directionEcef,
    maximumDistance,
    sensor.physics.charBody,
  )
  return Number.isFinite(distance)
    ? Math.max(0, Math.min(maximumDistance, distance))
    : maximumDistance
}

function castActorRayHit(
  sensor: PlayerSensorPort,
  origin: CartesianLike,
  headingRadians: number,
  terrainSlopeRadians: number,
  maximumDistance: number,
): ActorRayHit | undefined {
  const directionEcef = normalizeVector(sensor.frame.enuVectorToEcef({
    x: Math.sin(headingRadians),
    y: Math.cos(headingRadians),
    z: Math.tan(terrainSlopeRadians),
  }))
  const hit = sensor.physics.raycastEcefHit(
    origin,
    directionEcef,
    maximumDistance,
    sensor.physics.charBody,
  )
  if (!hit || !Number.isFinite(hit.distance)) return undefined
  return {
    distanceMeters: Math.max(0, Math.min(maximumDistance, hit.distance)),
    positionEcef: vector3(hit.point),
    normalEcef: vector3(hit.normal),
  }
}

function slopeRadians(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(-45, Math.min(45, value)) * Math.PI / 180
}

function normalizeVector(value: CartesianLike): CartesianLike {
  const magnitude = Math.hypot(value.x, value.y, value.z)
  if (!Number.isFinite(magnitude) || magnitude === 0) return { x: 0, y: 0, z: 0 }
  return {
    x: value.x / magnitude,
    y: value.y / magnitude,
    z: value.z / magnitude,
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
