import { describe, expect, it } from 'vitest'
import { initialWorkspace, transitionWorkspace } from './workspace.js'

describe('map workspace navigation', () => {
  it('opens a map workspace without creating a conversation', () => {
    const state = transitionWorkspace(initialWorkspace, 'map')
    expect(state.layout).toBe('map')
    expect(state).not.toHaveProperty('hasConversation')
  })

  it('restores the previous layout after expanding the map', () => {
    for (const state of [initialWorkspace, transitionWorkspace(initialWorkspace, 'map')]) {
      const expanded = transitionWorkspace(state, 'expand')
      expect(expanded.layout).toBe('expanded')
      expect(transitionWorkspace(expanded, 'restore').layout).toBe(state.layout)
    }
  })

  it('keeps an expanded map expanded when host tools operate on it', () => {
    const map = transitionWorkspace(initialWorkspace, 'map')
    const expanded = transitionWorkspace(map, 'expand')
    expect(transitionWorkspace(expanded, 'map')).toEqual(expanded)
    expect(transitionWorkspace(map, 'home').layout).toBe('home')
  })
})
