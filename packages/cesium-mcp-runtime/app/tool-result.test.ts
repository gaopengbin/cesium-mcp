import { describe, expect, it } from 'vitest'
import { readToolData } from './tool-result.js'

describe('MCP App tool results', () => {
  it('extracts entity IDs from the runtime JSON bridge envelope', () => {
    expect(readToolData({ content: [{ type: 'text', text: '{"success":true,"data":{"entityId":"marker-1"}}' }] }))
      .toEqual({ entityId: 'marker-1' })
  })

  it('accepts structured tool results and ignores non-object content', () => {
    expect(readToolData({ content: [], structuredContent: { entityId: 'marker-2' } }))
      .toEqual({ entityId: 'marker-2' })
    expect(readToolData({ content: [{ type: 'text', text: 'Done' }] })).toBeUndefined()
    expect(readToolData({ content: [{ type: 'text', text: 'null' }] })).toBeUndefined()
  })
})
