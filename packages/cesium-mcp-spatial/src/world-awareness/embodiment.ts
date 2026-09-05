export interface EmbodiedMotionInput {
  moveX?: number
  moveY?: number
  lookX?: number
  lookY?: number
  jump?: boolean
  sprint?: boolean
  toggleView?: boolean
  toggleFly?: boolean
  toggleVehicle?: boolean
}

export interface NormalizedEmbodiedMotionInput {
  moveX: number
  moveY: number
  lookX: number
  lookY: number
  jump: boolean
  sprint: boolean
  toggleView: boolean
  toggleFly: boolean
  toggleVehicle: boolean
}

export interface EmbodiedVector3 {
  x: number
  y: number
  z: number
}

export interface EmbodiedVelocityEnu {
  east: number
  north: number
  up: number
}

export interface EmbodiedPhysicsRayHit {
  distanceMeters: number
  positionEcef: EmbodiedVector3
  normalEcef: EmbodiedVector3
}

export interface EmbodiedStateObservation {
  capturedAt: string
  mode: 'character' | 'vehicle'
  positionEcef: EmbodiedVector3
  headingRadians: number
  velocityEnu: EmbodiedVelocityEnu
  grounded: boolean
  flying: boolean
  physicsCenterRayHit?: EmbodiedPhysicsRayHit
}

export interface EmbodiedActuator {
  applyInput(input: EmbodiedMotionInput): NormalizedEmbodiedMotionInput
  observe(): EmbodiedStateObservation
  stop(): void
}

export function normalizeEmbodiedMotionInput(
  input: EmbodiedMotionInput,
): NormalizedEmbodiedMotionInput {
  return {
    moveX: boundedAxis(input.moveX),
    moveY: boundedAxis(input.moveY),
    lookX: boundedAxis(input.lookX),
    lookY: boundedAxis(input.lookY),
    jump: input.jump === true,
    sprint: input.sprint === true,
    toggleView: input.toggleView === true,
    toggleFly: input.toggleFly === true,
    toggleVehicle: input.toggleVehicle === true,
  }
}

function boundedAxis(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(-1, Math.min(1, value))
}
