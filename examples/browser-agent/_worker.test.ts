import { afterEach, describe, expect, it, vi } from 'vitest'

import worker, {
  handleAssetProxy,
  handleChatRequest,
  handleUsageRequest,
  handleVisionGroundingRequest,
} from './_worker.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function createEnv(options: {
  rateLimitSuccess?: boolean
  usageNeurons?: number
  dailyBudget?: number
  aiResult?: unknown
} = {}) {
  const usage = {
    request_count: 3,
    prompt_tokens: 1200,
    completion_tokens: 300,
    estimated_neurons: options.usageNeurons ?? 20,
    error_count: 0,
    degraded_requests: 0,
  }
  const prepare = vi.fn((query: string) => ({
    bind: vi.fn((...values: number[]) => ({
      first: vi.fn().mockImplementation(async () => {
        if (query.includes('rate_limits')) {
          return { request_count: options.rateLimitSuccess === false ? 31 : 1 }
        }
        if (query.includes('INSERT INTO ai_usage')) {
          usage.request_count += 1
          usage.prompt_tokens += values[1]
          usage.completion_tokens += values[2]
          usage.estimated_neurons += values[3]
          usage.degraded_requests += values[4]
        }
        return { ...usage }
      }),
    })),
  }))
  return {
    AI: {
      run: vi.fn().mockResolvedValue(options.aiResult ?? {
        choices: [{ message: { role: 'assistant', content: 'Done' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      }),
    },
    RATE_LIMIT_DB: {
      prepare,
    },
    AI_DAILY_NEURON_BUDGET: options.dailyBudget?.toString(),
  }
}

const visionImageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC6QAAAAASUVORK5CYII='
const visionImageDigest = 'sha256:9d76ce7c59822d3b4dea7ef3d13ec084283be4fbc840205c7dc9cedb48d65de3'

function createVisionBody(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    image: {
      dataUrl: visionImageDataUrl,
      width: 1,
      height: 1,
      digest: visionImageDigest,
    },
    observation: {
      observationId: 'himalaya-vision-1',
      worldId: 'himalaya-flight',
      worldRevision: 2,
      capturedAt: '2026-09-02T01:00:00.000Z',
      sensor: {
        sensorId: 'observer-camera',
        kind: 'camera',
        pose: {
          position: [86.8, 27.9, 7600],
          headingDegrees: 45,
          pitchDegrees: -5,
          rollDegrees: 0,
        },
        rangeMeters: 15000,
        horizontalFieldOfViewDegrees: 54,
      },
    },
    candidates: {
      objects: [{
        objectId: 'dynamic-no-fly-zone',
        label: '临时禁飞区',
        summary: 'Red translucent flight restriction volume ahead.',
      }],
      regions: [{
        regionId: 'forward-flight-corridor',
        label: '前向飞行走廊',
        summary: 'The immediate forward corridor used by the current route.',
      }],
    },
    ...overrides,
  }
}

function createVisionReport(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    imageDigest: visionImageDigest,
    objects: [{
      objectId: 'dynamic-no-fly-zone',
      visibility: 'visible',
      confidence: 0.96,
      bbox: { x: 0.35, y: 0.2, width: 0.3, height: 0.42 },
    }],
    regions: [{
      regionId: 'forward-flight-corridor',
      occupancy: 'occupied',
      coverage: 'partial',
      confidence: 0.91,
      bbox: { x: 0.2, y: 0.3, width: 0.6, height: 0.5 },
      blockingObjectIds: ['dynamic-no-fly-zone'],
    }],
    limitations: ['Terrain and imagery may still be streaming.'],
    ...overrides,
  }
}

function createVisionRequest(
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request('https://cesium-browser-agent.pages.dev/api/vision-grounding', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://cesium-browser-agent.pages.dev',
      ...headers,
    },
    body: JSON.stringify(body),
  })
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
        max_completion_tokens: 4096,
        messages: [{ role: 'user', content: 'Fly to Tokyo' }],
      }),
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-AI-Model')).toBe('@cf/zai-org/glm-4.7-flash')
    expect(response.headers.get('X-AI-Usage-State')).toBe('normal')
    expect(Number(response.headers.get('X-AI-Daily-Neurons'))).toBeGreaterThan(20)
  })

  it('reports aggregate daily usage without exposing client identities', async () => {
    const env = createEnv({ usageNeurons: 7200, dailyBudget: 9000 })
    const response = await handleUsageRequest(new Request(
      'https://cesium-browser-agent.pages.dev/api/usage',
      { headers: { Origin: 'https://cesium-browser-agent.pages.dev' } },
    ), env)
    const body = await response.json() as any

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      model: '@cf/zai-org/glm-4.7-flash',
      budgetNeurons: 9000,
      estimatedNeurons: 7200,
      percent: 80,
      state: 'warning',
    })
    expect(JSON.stringify(body)).not.toContain('client')
  })

  it('degrades completion size and message history near the daily budget', async () => {
    const env = createEnv({ usageNeurons: 8000, dailyBudget: 9000 })
    const messages = [
      { role: 'system', content: 'System' },
      ...Array.from({ length: 20 }, (_, index) => ({ role: 'user', content: `Message ${index}` })),
    ]
    const response = await handleChatRequest(createRequest({ messages }), env)

    expect(response.status).toBe(200)
    expect(env.AI.run).toHaveBeenCalledWith(
      '@cf/zai-org/glm-4.7-flash',
      expect.objectContaining({
        max_completion_tokens: 2048,
        messages: expect.arrayContaining([{ role: 'system', content: 'System' }]),
      }),
    )
    expect(env.AI.run.mock.calls[0][1].messages).toHaveLength(13)
    expect(response.headers.get('X-AI-Degraded')).toBe('true')
  })

  it('pauses hosted inference when the daily safety budget is exhausted', async () => {
    const env = createEnv({ usageNeurons: 9000, dailyBudget: 9000 })
    const response = await handleChatRequest(createRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    }), env)
    const body = await response.json() as any

    expect(response.status).toBe(503)
    expect(body.code).toBe('AI_BUDGET_EXHAUSTED')
    expect(body.usage.state).toBe('paused')
    expect(env.AI.run).not.toHaveBeenCalled()
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

  it('accepts the complete browser-safe tool surface', async () => {
    const env = createEnv()
    const tools = Array.from({ length: 61 }, (_, index) => ({
      type: 'function',
      function: { name: `tool_${index}` },
    }))
    const response = await handleChatRequest(createRequest({
      messages: [{ role: 'user', content: 'Load a tileset' }],
      tools,
    }), env)

    expect(response.status).toBe(200)
    expect(env.AI.run).toHaveBeenCalledWith(
      '@cf/zai-org/glm-4.7-flash',
      expect.objectContaining({ tools }),
    )
  })

  it('grounds a bounded image with the fixed vision model without echoing pixels', async () => {
    const report = createVisionReport()
    const env = createEnv({
      aiResult: {
        choices: [{ message: { role: 'assistant', content: JSON.stringify(report) } }],
        usage: { prompt_tokens: 300, completion_tokens: 80, total_tokens: 380 },
      },
    })
    const response = await handleVisionGroundingRequest(
      createVisionRequest(createVisionBody()),
      env,
    )
    const body = await response.json() as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body).toEqual({ report, model: '@cf/meta/llama-4-scout-17b-16e-instruct' })
    expect(JSON.stringify(body)).not.toContain(visionImageDataUrl)
    expect(response.headers.get('X-AI-Model')).toBe('@cf/meta/llama-4-scout-17b-16e-instruct')
    expect(env.AI.run).toHaveBeenCalledWith(
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      expect.objectContaining({
        max_completion_tokens: 1600,
        temperature: 0,
      }),
    )
    const messages = env.AI.run.mock.calls[0][1].messages
    expect(messages[1].content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'image_url',
        image_url: { url: visionImageDataUrl, detail: 'high' },
      }),
    ]))
  })

  it('rejects a mismatched image digest before invoking the vision model', async () => {
    const env = createEnv()
    const response = await handleVisionGroundingRequest(
      createVisionRequest(createVisionBody({
        image: {
          dataUrl: visionImageDataUrl,
          width: 1,
          height: 1,
          digest: `sha256:${'0'.repeat(64)}`,
        },
      })),
      env,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'Image digest does not match the submitted image bytes',
    })
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('rejects declared dimensions that do not match the encoded image', async () => {
    const env = createEnv()
    const response = await handleVisionGroundingRequest(
      createVisionRequest(createVisionBody({
        image: {
          dataUrl: visionImageDataUrl,
          width: 2,
          height: 1,
          digest: visionImageDigest,
        },
      })),
      env,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'Image dimensions do not match the submitted image bytes',
    })
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('fails closed to unknown when the vision model invents a candidate ID', async () => {
    const env = createEnv({
      aiResult: {
        response: createVisionReport({
          objects: [{
            objectId: 'invented-object',
            visibility: 'visible',
            confidence: 1,
            bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          }],
        }),
        usage: { prompt_tokens: 300, completion_tokens: 80 },
      },
    })
    const response = await handleVisionGroundingRequest(
      createVisionRequest(createVisionBody()),
      env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-AI-Evidence-State')).toBe('unknown-fallback')
    expect(await response.json()).toMatchObject({
      report: {
        imageDigest: visionImageDigest,
        objects: [{
          objectId: 'dynamic-no-fly-zone',
          visibility: 'uncertain',
          confidence: 0,
        }],
        regions: [{
          regionId: 'forward-flight-corridor',
          occupancy: 'unknown',
          coverage: 'unavailable',
          confidence: 0,
        }],
      },
    })
  })

  it('accepts text-part output with hidden reasoning and binds the trusted image digest', async () => {
    const modelReport = createVisionReport()
    delete modelReport.imageDigest
    const env = createEnv({
      aiResult: {
        choices: [{
          message: {
            role: 'assistant',
            content: [{
              type: 'text',
              text: `<think>Inspect candidate geometry carefully.</think>\n\`\`\`json\n${JSON.stringify(modelReport)}\n\`\`\``,
            }],
          },
        }],
        usage: { prompt_tokens: 300, completion_tokens: 80 },
      },
    })
    const response = await handleVisionGroundingRequest(
      createVisionRequest(createVisionBody()),
      env,
    )
    const body = await response.json() as { report: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(body.report.imageDigest).toBe(visionImageDigest)
  })

  it('distinguishes inference failures from invalid model evidence', async () => {
    const env = createEnv()
    env.AI.run.mockRejectedValueOnce(new Error('upstream timeout'))
    const response = await handleVisionGroundingRequest(
      createVisionRequest(createVisionBody()),
      env,
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Visual grounding inference failed',
      code: 'VISION_INFERENCE_FAILED',
    })
  })

  it('rejects oversized vision requests before reading or inference', async () => {
    const env = createEnv()
    const response = await handleVisionGroundingRequest(
      createVisionRequest(createVisionBody(), {
        'Content-Length': String(1024 * 1024 + 1),
      }),
      env,
    )

    expect(response.status).toBe(413)
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('streams allowlisted assets through the HTTPS worker origin', async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(new Response('tileset', {
      headers: {
        'Content-Type': 'application/json',
        ETag: 'tiles-v1',
      },
    }))
    vi.stubGlobal('fetch', upstreamFetch)
    const request = new Request(
      'https://cesium-browser-agent.pages.dev/api/assets/jojo/data/model/tileset.json?version=1',
      { headers: { Range: 'bytes=0-1023' } },
    )
    const response = await handleAssetProxy(request, new URL(request.url))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('tileset')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('ETag')).toBe('tiles-v1')
    expect(upstreamFetch).toHaveBeenCalledWith(
      new URL('http://jojo1986.cn:8888/data/model/tileset.json?version=1'),
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: expect.any(Headers),
      }),
    )
    expect(upstreamFetch.mock.calls[0][1].headers.get('Range')).toBe('bytes=0-1023')
  })

  it('rejects unknown proxy origins and encoded path traversal', async () => {
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)
    const unknown = new Request('https://cesium-browser-agent.pages.dev/api/assets/unknown/data.json')
    const traversal = new Request('https://cesium-browser-agent.pages.dev/api/assets/jojo/%252e%252e/secret')

    expect((await handleAssetProxy(unknown, new URL(unknown.url))).status).toBe(403)
    expect((await handleAssetProxy(traversal, new URL(traversal.url))).status).toBe(400)
    expect(upstreamFetch).not.toHaveBeenCalled()
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
