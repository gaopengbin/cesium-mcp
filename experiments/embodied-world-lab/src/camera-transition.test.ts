import { describe, expect, it } from 'vitest'

import { CameraPresetTransition } from './camera-transition.js'

describe('CameraPresetTransition', () => {
  it('moves from follow to overview with bounded pitch steps', () => {
    const transition = new CameraPresetTransition({
      durationMs: 400,
      maxPitchDeltaPerFrame: 40,
    })

    const transitionId = transition.begin('overview', 0)
    const frames = [100, 200, 300, 400, 500, 600, 700, 800]
      .map(nowMs => transition.step(nowMs))

    expect(transitionId).toBe(1)
    expect(frames[0].minDistance).toBeGreaterThan(800)
    expect(frames[0].maxDistance).toBeLessThan(16_000)
    expect(frames.every(frame => Math.abs(frame.pitchDelta) <= 40)).toBe(true)
    expect(frames.reduce((total, frame) => total + frame.pitchDelta, 0)).toBe(55)
    expect(frames.at(-1)).toMatchObject({
      active: false,
      complete: true,
      maxDistance: 16_000,
      minDistance: 8_000,
      preset: 'overview',
      transitionId,
    })
  })

  it('reverses overview back to follow without exceeding the pitch clamp', () => {
    const transition = new CameraPresetTransition({
      durationMs: 200,
      initialPreset: 'overview',
      maxPitchDeltaPerFrame: 60,
    })

    transition.begin('follow', 0)
    const frames = [50, 100, 150, 200, 250, 300]
      .map(nowMs => transition.step(nowMs))

    expect(frames.every(frame => frame.pitchDelta <= 0)).toBe(true)
    expect(frames.every(frame => Math.abs(frame.pitchDelta) <= 60)).toBe(true)
    expect(frames.reduce((total, frame) => total + frame.pitchDelta, 0)).toBe(-55)
    expect(frames.at(-1)).toMatchObject({
      active: false,
      complete: true,
      maxDistance: 2_200,
      minDistance: 800,
      preset: 'follow',
    })
  })

  it('cancels the old direction when reversed in the middle of a transition', () => {
    const transition = new CameraPresetTransition({
      durationMs: 1_000,
      maxPitchDeltaPerFrame: 20,
    })

    const overviewId = transition.begin('overview', 0)
    const beforeReverse = transition.step(500)
    const followId = transition.begin('follow', 500)
    const afterReverse = transition.step(750)

    expect(followId).toBeGreaterThan(overviewId)
    expect(afterReverse.transitionId).toBe(followId)
    expect(afterReverse.preset).toBe('follow')
    expect(afterReverse.minDistance).toBeLessThan(beforeReverse.minDistance)
    expect(afterReverse.maxDistance).toBeLessThan(beforeReverse.maxDistance)
    expect(afterReverse.pitchDelta).toBeLessThan(0)

    const completed = [1_000, 1_250, 1_500, 1_750]
      .map(nowMs => transition.step(nowMs))
      .at(-1)
    expect(completed).toMatchObject({
      active: false,
      complete: true,
      maxDistance: 2_200,
      minDistance: 800,
      preset: 'follow',
      transitionId: followId,
    })
  })

  it('returns stable camera values after a transition completes', () => {
    const transition = new CameraPresetTransition({
      durationMs: 100,
      maxPitchDeltaPerFrame: 300,
    })

    transition.begin('overview', 0)
    transition.step(100)

    expect(transition.step(200)).toEqual({
      active: false,
      complete: true,
      maxDistance: 16_000,
      minDistance: 8_000,
      pitchDelta: 0,
      preset: 'overview',
      progress: 1,
      transitionId: 1,
    })
  })
})
