import { describe, expect, it } from 'vitest'
import { PublicMapSessions } from './public-sessions.js'

describe('public map capabilities', () => {
  it('accepts only issued capabilities and never falls back to another map', () => {
    const sessions = new PublicMapSessions()
    const a = sessions.open()
    const b = sessions.open()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^map-[A-Za-z0-9_-]{43}$/)
    expect(sessions.require(a)).toBe(a)
    expect(() => sessions.require(undefined)).toThrow('sessionId')
    expect(() => sessions.require('not-a-real-session')).toThrow('expired')
    expect(() => sessions.open('not-a-real-session')).toThrow('expired')
  })

  it('expires idle maps, enforces a lifetime and bounds total capacity', () => {
    let now = 0
    const sessions = new PublicMapSessions({ capacity: 1, idleMs: 10, lifetimeMs: 25, now: () => now })
    const a = sessions.open()
    expect(() => sessions.open()).toThrow('capacity')
    now = 9
    sessions.require(a)
    now = 18
    sessions.require(a)
    now = 26
    expect(sessions.sweep()).toEqual([a])
    expect(() => sessions.require(a)).toThrow('expired')
    const b = sessions.open()
    now = 37
    expect(sessions.sweep()).toEqual([b])
  })
})
