import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { EmbodiedMotionIntent } from '../src/embodied-agent-loop.js'

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const criteria: Record<EmbodiedMotionIntent, string> = {
  advance: 'Move forward toward the goal, with local heading correction. Only if front terrain is known and traversable.',
  'turn-left': 'Rotate left in place to face a clear route or the goal; does not translate.',
  'turn-right': 'Rotate right in place to face a clear route or the goal; does not translate.',
  'inspect-left': 'Slowly rotate left in place to gather missing observations.',
  'inspect-right': 'Slowly rotate right in place to gather missing observations.',
  hold: 'Stay still when not grounded, already at the goal, or no safe action is supported.',
}
interface JevConfig { apiKey?: string }
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const probability = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1

export function buildJevRequest(input: unknown) {
  if (!record(input) || !Number.isInteger(input.revision) || Number(input.revision) < 0
    || typeof input.capturedAt !== 'string' || !Number.isFinite(Date.parse(input.capturedAt))
    || !['character', 'vehicle'].includes(String(input.mode))
    || !finite(input.distanceToGoalMeters) || input.distanceToGoalMeters < 0
    || !finite(input.bearingErrorRadians) || Math.abs(input.bearingErrorRadians) > Math.PI
    || typeof input.grounded !== 'boolean'
    || !finite(input.speedMetersPerSecond) || input.speedMetersPerSecond < 0
    || !Array.isArray(input.candidates) || input.candidates.length !== 3) {
    throw new Error('Invalid world observation')
  }
  const seen = new Set<string>()
  const candidates = input.candidates.map(candidate => {
    if (!record(candidate) || !['front', 'left', 'right'].includes(String(candidate.id))
      || seen.has(String(candidate.id)) || !finite(candidate.clearanceMeters)
      || candidate.clearanceMeters < 0 || typeof candidate.terrainReady !== 'boolean'
      || typeof candidate.traversable !== 'boolean'
      || (candidate.slopeDegrees !== undefined && !finite(candidate.slopeDegrees))) {
      throw new Error('Invalid navigation candidates')
    }
    seen.add(String(candidate.id))
    return {
      id: candidate.id, clearanceMeters: candidate.clearanceMeters,
      terrainReady: candidate.terrainReady, traversable: candidate.traversable,
      ...(candidate.slopeDegrees !== undefined ? { slopeDegrees: candidate.slopeDegrees } : {}),
    }
  })
  const state = {
    revision: input.revision, capturedAt: input.capturedAt, mode: input.mode,
    distanceToGoalMeters: input.distanceToGoalMeters,
    bearingErrorRadians: input.bearingErrorRadians, grounded: input.grounded,
    speedMetersPerSecond: input.speedMetersPerSecond, candidates,
    ...(finite(input.physicsCenterRayDistanceMeters)
      ? { physicsCenterRayDistanceMeters: input.physicsCenterRayDistanceMeters } : {}),
    ...(typeof input.hazardId === 'string' ? { hazardId: input.hazardId.slice(0, 200) } : {}),
  }
  return {
    model: 'jev-latest',
    state: JSON.stringify(state),
    questions: {
      motion: {
        type: 'choice',
        instructions: 'Choose the next short action for this simulated Cesium agent to reach its goal. '
          + 'Use only the supplied observation. Positive bearingErrorRadians means goal to the right, negative means left. '
          + 'Advance corrects small heading errors; for large errors rotate toward the goal first. '
          + 'Unknown terrain is not traversable. Never advance unless the front is terrainReady and traversable. '
          + 'Do not assume unobserved obstacles are absent. Within 8 meters of the goal, hold. '
          + 'A separate local controller handles immediate collision prevention.',
        criteria,
      },
    },
  }
}

export function parseJevResult(body: unknown, latencyMs: number) {
  if (!record(body) || typeof body.model !== 'string' || !body.model || body.model.length > 100
    || !record(body.answers) || !record(body.answers.motion)) throw new Error('Invalid Jev response')
  const answer = body.answers.motion
  if (answer.type !== 'choice' || typeof answer.choice !== 'string'
    || !Object.hasOwn(criteria, answer.choice) || !probability(answer.confidence)
    || !record(answer.probabilities) || !probability(answer.probabilities[answer.choice])) {
    throw new Error('Invalid Jev motion decision')
  }
  let total = 0
  const probabilities: Record<string, number> = {}
  for (const [key, value] of Object.entries(answer.probabilities)) {
    if (!Object.hasOwn(criteria, key) || !probability(value)) throw new Error('Invalid Jev probabilities')
    probabilities[key] = value
    total += value
  }
  if (Math.abs(total - 1) > 0.05) throw new Error('Invalid Jev probability total')
  const intent = answer.choice as EmbodiedMotionIntent
  const usage: Record<string, number> = {}
  for (const key of ['input_tokens', 'output_tokens']) {
    if (record(body.usage) && finite(body.usage[key]) && body.usage[key] >= 0) usage[key] = body.usage[key]
  }
  return {
    plan: {
      intent, durationMs: intent === 'advance' ? 6000 : 1200,
      // Jev returns a typed choice, not a textual explanation. This is a local label.
      reason: `Jev choice: ${intent} (local label; no generated rationale)`,
      confidence: answer.confidence, source: 'model' as const,
    },
    model: body.model, latencyMs, probabilities, usage,
    usageState: `${latencyMs} ms`,
  }
}

export function jevApiPlugin(config: JevConfig): Plugin {
  const middleware = createJevMiddleware(config)
  return {
    name: 'local-jev-decisions',
    configureServer: server => { server.middlewares.use(middleware) },
    configurePreviewServer: server => { server.middlewares.use(middleware) },
  }
}

export function createJevMiddleware(config: JevConfig) {
  let busy = false
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    const path = request.url?.split('?')[0]
    if (path !== '/api/jev/plan' && path !== '/api/jev/status') return next()
    const send = (status: number, body: unknown) => {
      if (response.destroyed) return
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify(body))
    }
    const host = request.headers.host
    const remote = request.socket.remoteAddress
    let local = false
    try {
      const url = new URL(`http://${host}`)
      local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.host === host
        && !url.username && !url.password && url.pathname === '/'
    } catch { /* Reject malformed Host. */ }
    if (!local || !remote || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
      || (request.headers.origin && request.headers.origin !== `http://${host}`)
      || (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin')) {
      send(403, { error: 'Only same-origin localhost requests are allowed' })
      return
    }
    if (path === '/api/jev/status' && request.method === 'GET') {
      send(200, { configured: Boolean(config.apiKey?.trim()), model: 'jev-latest' })
      return
    }
    if (path !== '/api/jev/plan' || request.method !== 'POST') {
      send(405, { error: 'Unsupported method' })
      return
    }
    if (!config.apiKey?.trim()) {
      send(503, { error: 'TYPESAFE_API_KEY is not configured' })
      return
    }
    if (busy) {
      send(429, { error: 'A Jev decision is already running' })
      return
    }
    busy = true
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
      if (!request.complete) request.destroy()
    }, 15000)
    const onClose = () => { if (!response.writableEnded) controller.abort() }
    response.once('close', onClose)
    void (async () => {
      try {
        let raw = ''
        for await (const chunk of request) {
          raw += chunk.toString()
          if (Buffer.byteLength(raw) > 16384) {
            send(413, { error: 'Observation too large' })
            return
          }
        }
        let payload: ReturnType<typeof buildJevRequest>
        try {
          payload = buildJevRequest(JSON.parse(raw))
          const age = Date.now() - Date.parse(JSON.parse(payload.state).capturedAt)
          if (age > 30000 || age < -5000) throw new Error('Stale observation')
        } catch {
          send(400, { error: 'Invalid or stale world observation' })
          return
        }
        const started = performance.now()
        const upstream = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: controller.signal,
        })
        if (!upstream.ok) {
          await upstream.body?.cancel()
          send(502, { error: `Jev upstream returned HTTP ${upstream.status}` })
          return
        }
        const body: unknown = await upstream.json()
        send(200, parseJevResult(body, Math.round(performance.now() - started)))
      } catch {
        send(controller.signal.aborted ? 504 : 502, {
          error: controller.signal.aborted ? 'Jev request timed out or was cancelled' : 'Jev request failed or returned an invalid decision',
        })
      } finally {
        clearTimeout(timeout)
        response.removeListener('close', onClose)
        busy = false
      }
    })()
  }
}
