import { describe, expect, it, vi } from 'vitest'

import worker, { handleChatRequest } from './_worker.js'

function createEnv(options: { rateLimitSuccess?: boolean } = {}) {
  const first = vi.fn().mockResolvedValue({
    request_count: options.rateLimitSuccess === false ? 31 : 1,
  })
  const bind = vi.fn().mockReturnValue({ first })
  return {
    AI: {
      run: vi.fn().mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'Done' } }],
      }),
    },
    RATE_LIMIT_DB: {
      prepare: vi.fn().mockReturnValue({ bind }),
    },
  }
}

function createRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://cesium-browser-agent.pages.dev/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://cesium-browser-agent.pages.dev',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('browser-agent hosted AI worker', () => {
  it('uses the fixed Workers AI model and ignores client model selection', async () => {
    const env = createEnv()
    const response = await handleChatRequest(createRequest({
      model: 'attacker/expensive-model',
      messages: [{ role: 'user', content: 'Fly to Tokyo' }],
      tools: [{ type: 'function', function: { name: 'flyTo' } }],
    }), env)

    expect(response.status).toBe(200)
    expect(env.AI.run).toHaveBeenCalledWith(
      '@cf/zai-org/glm-4.7-flash',
      expect.objectContaining({
        max_completion_tokens: 1024,
        messages: [{ role: 'user', content: 'Fly to Tokyo' }],
      }),
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-AI-Model')).toBe('@cf/zai-org/glm-4.7-flash')
  })

  it('rejects requests from unrelated browser origins', async () => {
    const env = createEnv()
    const response = await handleChatRequest(createRequest(
      { messages: [{ role: 'user', content: 'Hello' }] },
      { Origin: 'https://attacker.example' },
    ), env)

    expect(response.status).toBe(403)
    expect(env.AI.run).not.toHaveBeenCalled()
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  })

  it('returns 429 before inference when the rate limit is exhausted', async () => {
    const env = createEnv({ rateLimitSuccess: false })
    const response = await handleChatRequest(createRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    }), env)

    expect(response.status).toBe(429)
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('rejects oversized message histories', async () => {
    const env = createEnv()
    const messages = Array.from({ length: 41 }, () => ({ role: 'user', content: 'Hello' }))
    const response = await handleChatRequest(createRequest({ messages }), env)

    expect(response.status).toBe(400)
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('fails closed when required Cloudflare bindings are missing', async () => {
    const response = await handleChatRequest(createRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    }), {})

    expect(response.status).toBe(503)
  })

  it('continues to serve static assets with WebMCP headers', async () => {
    const response = await worker.fetch(new Request('https://cesium-browser-agent.pages.dev/'), {
      ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('demo')) },
      WEBMCP_ORIGIN_TRIAL_TOKEN: 'trial-token',
    })

    expect(await response.text()).toBe('demo')
    expect(response.headers.get('Origin-Agent-Cluster')).toBe('?1')
    expect(response.headers.get('Origin-Trial')).toBe('trial-token')
  })
})
