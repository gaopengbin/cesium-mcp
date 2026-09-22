import { createServer, request } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildJevRequest, createJevMiddleware, parseJevResult } from './jev-api.js'

const snapshot = {
  revision: 1, capturedAt: new Date().toISOString(), mode: 'character',
  distanceToGoalMeters: 100, bearingErrorRadians: 0, grounded: true, speedMetersPerSecond: 0,
  candidates: ['front', 'left', 'right'].map(id => ({
    id, clearanceMeters: 32, terrainReady: true, traversable: true,
  })),
}
const answer = {
  model: 'jev-1.13.0',
  answers: { motion: { type: 'choice', choice: 'advance', confidence: 0.9,
    probabilities: { advance: 0.9, hold: 0.1 } } },
  usage: { input_tokens: 400, output_tokens: 40 },
}
const realFetch = globalThis.fetch
afterEach(() => vi.unstubAllGlobals())

describe('Jev motion adapter', () => {
  it('requires the production Host and Origin and applies budget before an upstream request', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(answer)))
    vi.stubGlobal('fetch', upstream)
    const authorize = vi.fn().mockReturnValue('Demo quota exhausted')
    const middleware = createJevMiddleware({ apiKey: 'private', publicOrigin: 'https://demo.example', authorizeRequest: authorize })
    const server = createServer((req, res) => middleware(req, res, () => res.end()))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/jev/plan`
    const post = (host: string, origin?: string) => new Promise<{ status: number }>((resolve, reject) => {
      const req = request(url, { method: 'POST', headers: { Host: host, ...(origin ? { Origin: origin } : {}) } }, res => {
        res.resume()
        res.once('end', () => resolve({ status: res.statusCode! }))
      })
      req.on('error', reject)
      req.end(JSON.stringify({ ...snapshot, capturedAt: new Date().toISOString() }))
    })
    try {
      expect((await post('demo.example')).status).toBe(403)
      expect((await post('evil.example', 'https://demo.example')).status).toBe(403)
      expect((await post('demo.example', 'https://evil.example')).status).toBe(403)
      expect(authorize).not.toHaveBeenCalled()
      expect((await post('demo.example', 'https://demo.example')).status).toBe(429)
      expect(upstream).not.toHaveBeenCalled()
      authorize.mockReturnValue(undefined)
      expect((await post('demo.example', 'https://demo.example')).status).toBe(200)
      expect(upstream).toHaveBeenCalledTimes(1)
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
  it('labels the simulated ground outside mapped buildings instead of claiming global perception', () => {
    const request = buildJevRequest({ ...snapshot, dataCoverage: 'unmapped' })
    expect(JSON.parse(request.state).dataCoverage).toBe('unmapped')
    expect(request.questions.motion.instructions).toContain('simplified ground')
    expect(() => buildJevRequest({ ...snapshot, dataCoverage: 'worldwide' })).toThrow()
  })

  it('sends observed state only and limits decisions to movement intents', () => {
    const request = buildJevRequest({ ...snapshot, secret: 'must-not-leave', hiddenHazards: [1] })
    expect(request.state).not.toContain('must-not-leave')
    expect(request.state).not.toContain('hiddenHazards')
    expect(Object.keys(request.questions.motion.criteria)).toHaveLength(6)
    expect(JSON.parse(request.state).revision).toBe(1)
  })

  it('rejects missing, nonfinite and duplicate observation fields', () => {
    expect(() => buildJevRequest({ ...snapshot, distanceToGoalMeters: NaN })).toThrow()
    expect(() => buildJevRequest({ ...snapshot, grounded: 'yes' })).toThrow()
    expect(() => buildJevRequest({ ...snapshot, candidates: [snapshot.candidates[0]] })).toThrow()
    expect(() => buildJevRequest({ ...snapshot, candidates: Array(3).fill(snapshot.candidates[0]) })).toThrow()
  })

  it('uses actual response metadata and never invents a model-written reason', () => {
    expect(parseJevResult(answer, 700)).toMatchObject({
      model: 'jev-1.13.0', latencyMs: 700,
      plan: { intent: 'advance', source: 'model', confidence: 0.9, durationMs: 6000 },
      usage: { input_tokens: 400, output_tokens: 40 },
    })
  })

  it.each([
    { ...answer, model: undefined },
    { ...answer, answers: {} },
    { ...answer, answers: { motion: { ...answer.answers.motion, choice: 'teleport' } } },
    { ...answer, answers: { motion: { ...answer.answers.motion, confidence: 2 } } },
    { ...answer, answers: { motion: { ...answer.answers.motion, probabilities: { advance: -1 } } } },
  ])('rejects invalid decisions', body => {
    expect(() => parseJevResult(body, 1)).toThrow()
  })

  it('enforces same-origin localhost, uses server key, and redacts upstream failures', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(answer)))
    vi.stubGlobal('fetch', upstream)
    const middleware = createJevMiddleware({ apiKey: 'private-server-key' })
    const server = createServer((req, res) => middleware(req, res, () => {
      res.statusCode = 404
      res.end()
    }))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const origin = `http://127.0.0.1:${address.port}`
    const post = (requestOrigin = origin) => realFetch(`${origin}/api/jev/plan`, {
      method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...snapshot, capturedAt: new Date().toISOString() }),
    })
    try {
      expect((await post('https://evil.invalid')).status).toBe(403)
      expect(upstream).not.toHaveBeenCalled()
      const response = await post()
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ model: 'jev-1.13.0' })
      expect(upstream.mock.calls[0][0]).toBe('https://api.typesafe.ai/v1/systemone')
      expect(upstream.mock.calls[0][1].headers.Authorization).toBe('Bearer private-server-key')
      upstream.mockResolvedValueOnce(new Response('private-server-key', { status: 401 }))
      const failure = await post()
      expect(failure.status).toBe(502)
      expect(await failure.text()).not.toContain('private-server-key')
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
