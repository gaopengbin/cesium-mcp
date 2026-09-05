export type CameraPresetName = 'follow' | 'overview'

export interface CameraPreset {
  minDistance: number
  maxDistance: number
  pitchOffset: number
}

export interface CameraPresetTransitionOptions {
  durationMs?: number
  initialPreset?: CameraPresetName
  maxPitchDeltaPerFrame?: number
  presets?: Record<CameraPresetName, CameraPreset>
}

export interface CameraTransitionFrame {
  active: boolean
  complete: boolean
  maxDistance: number
  minDistance: number
  pitchDelta: number
  preset: CameraPresetName
  progress: number
  transitionId: number
}

type CameraState = CameraPreset

interface ActiveTransition {
  from: CameraState
  id: number
  startedAtMs: number
  target: CameraPresetName
}

const DEFAULT_PRESETS: Record<CameraPresetName, CameraPreset> = {
  follow: {
    minDistance: 800,
    maxDistance: 2_200,
    pitchOffset: 0,
  },
  overview: {
    minDistance: 8_000,
    maxDistance: 16_000,
    pitchOffset: 55,
  },
}

const DEFAULT_DURATION_MS = 900
const DEFAULT_MAX_PITCH_DELTA_PER_FRAME = 4
const COMPLETE_EPSILON = 1e-6

export class CameraPresetTransition {
  private readonly durationMs: number
  private readonly maxPitchDeltaPerFrame: number
  private readonly presets: Record<CameraPresetName, CameraPreset>
  private activeTransition: ActiveTransition | undefined
  private current: CameraState
  private currentPreset: CameraPresetName
  private lastFrameAtMs = Number.NEGATIVE_INFINITY
  private transitionId = 0

  constructor(options: CameraPresetTransitionOptions = {}) {
    this.durationMs = requirePositive(options.durationMs ?? DEFAULT_DURATION_MS, 'durationMs')
    this.maxPitchDeltaPerFrame = requirePositive(
      options.maxPitchDeltaPerFrame ?? DEFAULT_MAX_PITCH_DELTA_PER_FRAME,
      'maxPitchDeltaPerFrame',
    )
    this.presets = validatePresets(options.presets ?? DEFAULT_PRESETS)
    this.currentPreset = options.initialPreset ?? 'follow'
    this.current = { ...this.presets[this.currentPreset] }
  }

  begin(preset: CameraPresetName, nowMs: number): number {
    requireFinite(nowMs, 'nowMs')

    if (this.activeTransition?.target === preset) return this.activeTransition.id
    if (!this.activeTransition && this.currentPreset === preset) return this.transitionId

    this.transitionId += 1
    this.activeTransition = {
      from: { ...this.current },
      id: this.transitionId,
      startedAtMs: Math.max(nowMs, this.lastFrameAtMs),
      target: preset,
    }
    return this.transitionId
  }

  step(nowMs: number): CameraTransitionFrame {
    requireFinite(nowMs, 'nowMs')
    const transition = this.activeTransition
    if (!transition) return this.createFrame(0, 1, false, true, this.currentPreset)

    const frameAtMs = Math.max(nowMs, transition.startedAtMs, this.lastFrameAtMs)
    this.lastFrameAtMs = frameAtMs
    const progress = clamp((frameAtMs - transition.startedAtMs) / this.durationMs, 0, 1)
    const easedProgress = smoothstep(progress)
    const target = this.presets[transition.target]

    this.current.minDistance = lerp(
      transition.from.minDistance,
      target.minDistance,
      easedProgress,
    )
    this.current.maxDistance = lerp(
      transition.from.maxDistance,
      target.maxDistance,
      easedProgress,
    )

    const desiredPitchOffset = lerp(
      transition.from.pitchOffset,
      target.pitchOffset,
      easedProgress,
    )
    let pitchDelta = clamp(
      desiredPitchOffset - this.current.pitchOffset,
      -this.maxPitchDeltaPerFrame,
      this.maxPitchDeltaPerFrame,
    )
    if (Math.abs(target.pitchOffset - (this.current.pitchOffset + pitchDelta)) <= COMPLETE_EPSILON) {
      pitchDelta = target.pitchOffset - this.current.pitchOffset
    }
    this.current.pitchOffset += pitchDelta

    const complete = progress === 1
      && Math.abs(this.current.pitchOffset - target.pitchOffset) <= COMPLETE_EPSILON
    if (complete) {
      this.current = { ...target }
      this.currentPreset = transition.target
      this.activeTransition = undefined
    }

    return this.createFrame(
      pitchDelta,
      progress,
      !complete,
      complete,
      transition.target,
      transition.id,
    )
  }

  private createFrame(
    pitchDelta: number,
    progress: number,
    active: boolean,
    complete: boolean,
    preset: CameraPresetName,
    transitionId = this.transitionId,
  ): CameraTransitionFrame {
    return {
      active,
      complete,
      maxDistance: this.current.maxDistance,
      minDistance: this.current.minDistance,
      pitchDelta,
      preset,
      progress,
      transitionId,
    }
  }
}

function validatePresets(
  presets: Record<CameraPresetName, CameraPreset>,
): Record<CameraPresetName, CameraPreset> {
  return {
    follow: validatePreset(presets.follow, 'follow'),
    overview: validatePreset(presets.overview, 'overview'),
  }
}

function validatePreset(preset: CameraPreset, name: CameraPresetName): CameraPreset {
  requireFinite(preset.minDistance, `${name}.minDistance`)
  requireFinite(preset.maxDistance, `${name}.maxDistance`)
  requireFinite(preset.pitchOffset, `${name}.pitchOffset`)
  if (preset.minDistance < 0 || preset.maxDistance < preset.minDistance) {
    throw new RangeError(`${name} camera distances are invalid`)
  }
  return { ...preset }
}

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`)
}

function requirePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be greater than zero`)
  }
  return value
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

function smoothstep(progress: number): number {
  return progress * progress * (3 - 2 * progress)
}
