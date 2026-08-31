import { describe, expect, it } from 'vitest'

import { attachStructuredContent, createPngImageToolResult } from './tool-result.js'

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

describe('createPngImageToolResult', () => {
  it('emits standard MCP image content with compact textual evidence', () => {
    const structured = {
      success: true,
      data: {
        dataUrl: 'data:image/png;base64,abc123',
        width: 1024,
        height: 576,
        target: {
          targetObjectId: 'entity:scene:school',
          preset: 'detail',
        },
      },
    }

    const result = createPngImageToolResult(structured, structured.data.dataUrl)
    expect(result?.content[0]).toEqual({
      type: 'image',
      data: 'abc123',
      mimeType: 'image/png',
    })
    const text = result?.content.find(item => item.type === 'text')
    expect(text?.type === 'text' ? JSON.parse(text.text) : undefined).toMatchObject({
      success: true,
      data: {
        width: 1024,
        height: 576,
        target: {
          targetObjectId: 'entity:scene:school',
          preset: 'detail',
        },
      },
    })
    expect(text?.type === 'text' ? text.text : '').not.toContain('dataUrl')
    expect(text?.type === 'text' ? text.text : '').not.toContain('abc123')
    expect(result?.structuredContent).toBe(structured)
  })

  it('ignores non-PNG data URLs', () => {
    expect(createPngImageToolResult({}, 'data:image/jpeg;base64,abc123')).toBeUndefined()
  })

  it('removes nested observation image bytes from textual evidence', () => {
    const structured = {
      success: true,
      data: {
        observationId: 'observation:1:test',
        visual: {
          status: 'captured',
          evidence: {
            dataUrl: 'data:image/png;base64,nested123',
            width: 1024,
            height: 576,
          },
        },
      },
    }

    const result = createPngImageToolResult(
      structured,
      structured.data.visual.evidence.dataUrl,
    )
    const text = result?.content.find(item => item.type === 'text')
    expect(text?.type === 'text' ? text.text : '').not.toContain('dataUrl')
    expect(text?.type === 'text' ? text.text : '').not.toContain('nested123')
    expect(text?.type === 'text' ? JSON.parse(text.text) : undefined).toMatchObject({
      data: {
        visual: {
          status: 'captured',
          evidence: { width: 1024, height: 576 },
        },
      },
    })
  })
})
