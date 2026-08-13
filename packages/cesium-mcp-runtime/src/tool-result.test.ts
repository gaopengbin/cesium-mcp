import { describe, expect, it } from 'vitest'

import { attachStructuredContent } from './tool-result.js'

describe('attachStructuredContent', () => {
  it('mirrors JSON object text into structuredContent', () => {
    const result = attachStructuredContent({
      content: [{ type: 'text', text: '{"success":true,"message":"done"}' }],
    })

    expect(result).toEqual({
      content: [{ type: 'text', text: '{"success":true,"message":"done"}' }],
      structuredContent: { success: true, message: 'done' },
    })
  })

  it('preserves explicitly authored structured content and image blocks', () => {
    const result = attachStructuredContent({
      content: [{ type: 'image', data: 'abc', mimeType: 'image/png' }],
      structuredContent: {
        success: true,
        data: {
          dataUrl: 'data:image/png;base64,abc',
          width: 800,
          height: 600,
        },
      },
    })

    expect(result.structuredContent).toMatchObject({
      success: true,
      data: { width: 800, height: 600 },
    })
    expect(result.content[0]?.type).toBe('image')
  })

  it('does not invent structured content for plain text or array JSON', () => {
    expect(attachStructuredContent({
      content: [{ type: 'text', text: 'done' }],
    })).not.toHaveProperty('structuredContent')
    expect(attachStructuredContent({
      content: [{ type: 'text', text: '[1,2,3]' }],
    })).not.toHaveProperty('structuredContent')
  })
})
