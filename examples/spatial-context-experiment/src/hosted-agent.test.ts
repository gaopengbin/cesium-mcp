import { describe, expect, it, vi } from 'vitest'

import {
  requestHostedAgent,
  resolveHostedAgentEndpoint,
} from './hosted-agent.js'

describe('resolveHostedAgentEndpoint', () => {
  it('uses the same-origin worker on the production Pages hostname', () => {
    expect(resolveHostedAgentEndpoint('https://cesium-browser-agent.pages.dev/demo'))
      .toBe('https://cesium-browser-agent.pages.dev/api/chat')
  })

  it('uses the same-origin worker on a Pages preview hostname', () => {
    expect(resolveHostedAgentEndpoint(
      'https://spatial-v0-1-preview.cesium-browser-agent.pages.dev/',
    )).toBe('https://spatial-v0-1-preview.cesium-browser-agent.pages.dev/api/chat')
  })

  it('keeps local development on the public hosted endpoint', () => {
    expect(resolveHostedAgentEndpoint('http://127.0.0.1:4175/'))
      .toBe('https://cesium-browser-agent.pages.dev/api/chat')
  })
})

describe('requestHostedAgent', () => {
  it('returns a validated tool call and model evidence', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: {
              name: 'start_himalaya_flight',
              arguments: '{"duration_seconds":40}',
            },
          }],
        },
      }],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Model': '@cf/test-model',
        'X-AI-Usage-State': 'normal',
      },
    })) as unknown as typeof fetch

    const result = await requestHostedAgent({
      messages: [{ role: 'user', content: '飞越喜马拉雅' }],
      tools: [],
      fetchImpl,
    })

    expect(result.model).toBe('@cf/test-model')
    expect(result.usageState).toBe('normal')
    expect(result.message.tool_calls?.[0]?.function).toEqual({
      name: 'start_himalaya_flight',
      arguments: '{"duration_seconds":40}',
    })
  })

  it('surfaces hosted service errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: 'AI service temporarily unavailable',
    }), { status: 503 })) as unknown as typeof fetch

    await expect(requestHostedAgent({
      messages: [{ role: 'user', content: 'hello' }],
      fetchImpl,
    })).rejects.toThrow('AI service temporarily unavailable')
  })
})
