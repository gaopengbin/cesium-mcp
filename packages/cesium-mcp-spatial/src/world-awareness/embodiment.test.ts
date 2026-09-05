import { describe, expect, it } from 'vitest'

import {
  normalizeEmbodiedMotionInput,
} from './embodiment.js'

describe('normalizeEmbodiedMotionInput', () => {
  it('bounds continuous controls while preserving explicit actions', () => {
    expect(normalizeEmbodiedMotionInput({
      jump: true,
      lookX: 2.5,
      lookY: Number.NaN,
      moveX: -4,
      moveY: 0.4,
      sprint: true,
      toggleVehicle: true,
    })).toEqual({
      jump: true,
      lookX: 1,
      lookY: 0,
      moveX: -1,
      moveY: 0.4,
      sprint: true,
      toggleFly: false,
      toggleVehicle: true,
      toggleView: false,
    })
  })

  it('returns a fail-safe neutral input for omitted controls', () => {
    expect(normalizeEmbodiedMotionInput({})).toEqual({
      jump: false,
      lookX: 0,
      lookY: 0,
      moveX: 0,
      moveY: 0,
      sprint: false,
      toggleFly: false,
      toggleVehicle: false,
      toggleView: false,
    })
  })
})
