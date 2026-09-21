import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createJevMiddleware } from './jev-api.js'
import { buildJevRouteRequest, parseJevRouteResult } from './jev-route.js'
import type { NavigationRouteObservation } from '../src/jev-route-planner.js'

const observation = (): NavigationRouteObservation => ({
  offerId: 'run-1:routes-1', revision: 1, capturedAt: new Date().toISOString(),
  straightLineBlocked: true, distanceToGoalMeters: 100,
  candidates: [
    { id: 'left', feasible: true, lengthMeters: 150, minimumClearanceMeters: 3, turnCount: 3 },
    { id: 'right', feasible: true, lengthMeters: 180, minimumClearanceMeters: 4, turnCount: 4 },
  ],
})
const answer = {
  model: 'jev-1.13.0', answers: { route: {
    type: 'choice', choice: 'left', confidence: 0.9, probabilities: { left: 0.9, right: 0.08, hold: 0.02 },
  } }, usage: { input_tokens: 200, output_tokens: 20 },
}
const realFetch = globalThis.fetch
afterEach(() => vi.unstubAllGlobals())

describe('Jev route choice adapter', () => {
  it('describes local geometry candidates truthfully and asks Jev to choose an offered route', () => {
    const input = observation()
    const payload = buildJevRouteRequest(input)
    expect(JSON.parse(payload.state)).toEqual(input)
    expect(Object.keys(payload.questions.route.criteria)).toEqual(['left', 'right', 'hold'])
    expect(payload.questions.route.instructions).toContain('local geometry algorithm')
    expect(payload.questions.route.instructions).toContain('does not generate the route geometry')
  })

  it('does not offer an infeasible route, and offers only hold when both are blocked', () => {
    const input = observation()
    input.candidates[0].feasible = false
    expect(Object.keys(buildJevRouteRequest(input).questions.route.criteria)).toEqual(['right', 'hold'])
    input.candidates[1].feasible = false
    expect(Object.keys(buildJevRouteRequest(input).questions.route.criteria)).toEqual(['hold'])
  })

  it('accepts a remaining single candidate without fabricating metrics for the absent route', () => {
    const input = observation()
    input.candidates = [input.candidates[1]]
    expect(Object.keys(buildJevRouteRequest(input).questions.route.criteria)).toEqual(['right', 'hold'])
    expect(() => parseJevRouteResult(answer, 1, input)).toThrow()
    input.candidates = []
    expect(Object.keys(buildJevRouteRequest(input).questions.route.criteria)).toEqual(['hold'])
  })

  it('offers an unobstructed direct route and describes a whole-map detour without calling it left or right', () => {
    const input = observation()
    input.straightLineBlocked = false
    input.candidates.push(
      { id: 'direct', feasible: true, lengthMeters: 100, minimumClearanceMeters: 4, turnCount: 0 },
      { id: 'detour', feasible: true, lengthMeters: 140, minimumClearanceMeters: 4, turnCount: 4 },
    )
    const criteria = buildJevRouteRequest(input).questions.route.criteria
    expect(Object.keys(criteria)).toEqual(['left', 'right', 'direct', 'detour', 'hold'])
    expect(criteria.direct).toContain('unobstructed')
    expect(criteria.detour).toContain('local whole-map A*')
    expect(criteria.detour).toContain('both sides')
    expect(criteria.detour).not.toContain('left corridor')
  })

  it.each(['direct', 'detour'] as const)('accepts an offered feasible %s choice and rejects it when absent or blocked', routeId => {
    const input = observation()
    input.straightLineBlocked = false
    input.candidates = [{ id: routeId, feasible: true, lengthMeters: 120, minimumClearanceMeters: 3, turnCount: 2 }]
    const body = { ...answer, answers: { route: {
      type: 'choice', choice: routeId, confidence: 0.9, probabilities: { [routeId]: 0.9, hold: 0.1 },
    } } }
    expect(parseJevRouteResult(body, 250, input)).toMatchObject({ routeId, model: 'jev-1.13.0' })
    input.candidates[0].feasible = false
    expect(() => parseJevRouteResult(body, 250, input)).toThrow('infeasible')
    input.candidates = []
    expect(() => parseJevRouteResult(body, 250, input)).toThrow('infeasible')
  })

  it('rejects contradictory direct-route evidence and candidate sets exceeding four unique ids', () => {
    const input = observation()
    input.candidates = [{ id: 'direct', feasible: true, lengthMeters: 100, minimumClearanceMeters: 3, turnCount: 0 }]
    expect(() => buildJevRouteRequest(input)).toThrow()
    expect(() => buildJevRouteRequest({ ...observation(), candidates: Array(5).fill(observation().candidates[0]) })).toThrow()
  })

  it.each([
    { offerId: '' }, { revision: -1 }, { capturedAt: 'invalid' }, { straightLineBlocked: 'yes' },
    { distanceToGoalMeters: Infinity }, { secret: 'must-not-leave' },
    { candidates: [observation().candidates[0], observation().candidates[0]] },
    { candidates: [{ ...observation().candidates[0], lengthMeters: NaN }, observation().candidates[1]] },
  ])('rejects invalid or expanded route observations: %j', invalid => {
    expect(() => buildJevRouteRequest({ ...observation(), ...invalid })).toThrow()
  })

  it('returns actual model metadata bound to the offer without invented explanations', () => {
    const result = parseJevRouteResult(answer, 450, observation())
    expect(result).toMatchObject({
      offerId: 'run-1:routes-1', revision: 1, routeId: 'left', confidence: 0.9,
      model: 'jev-1.13.0', latencyMs: 450, usage: { input_tokens: 200, output_tokens: 20 },
    })
    expect(result).not.toHaveProperty('reason')
  })

  it('rejects infeasible, unoffered or malformed decisions instead of choosing a local fallback', () => {
    const blocked = observation()
    blocked.candidates[0].feasible = false
    expect(() => parseJevRouteResult(answer, 1, blocked)).toThrow()
    for (const changes of [
      { choice: 'teleport' }, { confidence: 1.1 }, { probabilities: { left: 0.1 } },
      { probabilities: { left: 0.9, unknown: 0.1 } },
    ]) {
      expect(() => parseJevRouteResult({ ...answer, answers: {
        route: { ...answer.answers.route, ...changes },
      } }, 1, observation())).toThrow()
    }
  })

  it('uses the shared localhost boundary, fresh observation, server key and busy lock', async () => {
    let release!: (value: Response) => void
    const upstream = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { release = resolve }))
    vi.stubGlobal('fetch', upstream)
    const middleware = createJevMiddleware({ apiKey: 'private-test-key' })
    const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const post = (body = observation(), requestOrigin = origin, path = '/api/jev/route') => realFetch(`${origin}${path}`, {
      method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    try {
      expect((await post(observation(), 'https://evil.invalid')).status).toBe(403)
      expect((await post({ ...observation(), capturedAt: new Date(Date.now() - 31_000).toISOString() })).status).toBe(400)
      expect(upstream).not.toHaveBeenCalled()
      const pending = post()
      await vi.waitFor(() => expect(upstream).toHaveBeenCalledOnce())
      expect((await post()).status).toBe(429)
      expect((await post(observation(), origin, '/api/jev/plan')).status).toBe(429)
      expect(upstream.mock.calls[0][1].headers.Authorization).toBe('Bearer private-test-key')
      release(new Response(JSON.stringify(answer)))
      const response = await pending
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ routeId: 'left', offerId: 'run-1:routes-1' })
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
