const CHAT_MODEL = '@cf/zai-org/glm-4.7-flash'
const MAX_BODY_BYTES = 256 * 1024
const MAX_MESSAGES = 40
const MAX_TOOLS = 64
const REQUESTS_PER_MINUTE = 30
const DAILY_FREE_NEURONS = 10_000
const DEFAULT_DAILY_BUDGET = 9_000
const WARNING_RATIO = 0.7
const DEGRADE_RATIO = 0.85
const MAX_COMPLETION_TOKENS = 1024
const DEGRADED_COMPLETION_TOKENS = 512
const DEGRADED_HISTORY_MESSAGES = 12
const INPUT_NEURONS_PER_TOKEN = 0.0055
const OUTPUT_NEURONS_PER_TOKEN = 0.0364

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/chat') {
      return handleChatRequest(request, env)
    }
    if (url.pathname === '/api/usage') {
      return handleUsageRequest(request, env)
    }

    return withWebMcpHeaders(await env.ASSETS.fetch(request), env)
  },
}

export async function handleChatRequest(request, env) {
  const origin = request.headers.get('Origin')
  if (origin && !isAllowedOrigin(origin)) {
    return jsonError('Origin not allowed', 403, request)
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: apiHeaders(request) })
  }
  if (request.method !== 'POST') {
    return jsonError('Method not allowed', 405, request)
  }
  if (!env.AI || !env.RATE_LIMIT_DB) {
    return jsonError('AI service is not configured', 503, request)
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError('Request body too large', 413, request)
  }

  const clientIdentity = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Demo-Session')
    || 'anonymous'
  let allowed
  let usage
  try {
    [allowed, usage] = await Promise.all([
      checkRateLimit(env.RATE_LIMIT_DB, clientIdentity),
      getUsageSnapshot(env.RATE_LIMIT_DB, env),
    ])
  } catch (error) {
    console.error('[AI guardrails]', error?.message || error)
    return jsonError('AI service temporarily unavailable', 503, request)
  }
  if (!allowed) {
    return jsonError('Rate limit exceeded. Try again in a minute.', 429, request)
  }
  if (usage.state === 'paused') {
    return jsonError(
      'The hosted AI daily safety budget has been reached. WebMCP tools remain available.',
      503,
      request,
      { code: 'AI_BUDGET_EXHAUSTED', usage },
    )
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonError('Request body too large', 413, request)
  }

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return jsonError('Invalid JSON', 400, request)
  }

  const { messages, tools } = body
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return jsonError(`Messages must contain between 1 and ${MAX_MESSAGES} items`, 400, request)
  }
  if (tools !== undefined && (!Array.isArray(tools) || tools.length > MAX_TOOLS)) {
    return jsonError(`Tools must contain at most ${MAX_TOOLS} items`, 400, request)
  }

  const degraded = usage.state === 'degraded'
  try {
    const result = await env.AI.run(CHAT_MODEL, {
      messages: degraded ? compactMessages(messages) : messages,
      tools: tools || [],
      max_completion_tokens: degraded ? DEGRADED_COMPLETION_TOKENS : MAX_COMPLETION_TOKENS,
    })
    const tokenUsage = readTokenUsage(result.usage)
    const estimatedNeurons = estimateNeurons(tokenUsage)
    let updatedUsage = addUsageLocally(usage, tokenUsage, estimatedNeurons, degraded)

    try {
      updatedUsage = await recordUsage(
        env.RATE_LIMIT_DB,
        env,
        tokenUsage,
        estimatedNeurons,
        degraded,
      )
    } catch (error) {
      console.error('[AI usage]', error?.message || error)
    }

    return Response.json(result, {
      headers: {
        ...apiHeaders(request),
        'X-AI-Model': CHAT_MODEL,
        'X-AI-Usage-State': updatedUsage.state,
        'X-AI-Daily-Neurons': String(roundNeurons(updatedUsage.estimatedNeurons)),
        'X-AI-Usage-Percent': String(updatedUsage.percent),
        'X-AI-Degraded': String(degraded),
      },
    })
  } catch (error) {
    console.error('[Workers AI]', error?.message || error)
    return jsonError('AI service temporarily unavailable', 502, request)
  }
}

export async function handleUsageRequest(request, env) {
  const origin = request.headers.get('Origin')
  if (origin && !isAllowedOrigin(origin)) {
    return jsonError('Origin not allowed', 403, request)
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: apiHeaders(request) })
  }
  if (request.method !== 'GET') {
    return jsonError('Method not allowed', 405, request)
  }
  if (!env.RATE_LIMIT_DB) {
    return jsonError('AI usage is not configured', 503, request)
  }

  try {
    return Response.json(await getUsageSnapshot(env.RATE_LIMIT_DB, env), {
      headers: apiHeaders(request),
    })
  } catch (error) {
    console.error('[AI usage]', error?.message || error)
    return jsonError('AI usage is temporarily unavailable', 503, request)
  }
}

async function checkRateLimit(database, clientIdentity) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(clientIdentity),
  )
  const clientKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const window = Math.floor(Date.now() / 60_000)
  const row = await database.prepare(`
    INSERT INTO rate_limits (client_key, window, request_count)
    VALUES (?1, ?2, 1)
    ON CONFLICT(client_key) DO UPDATE SET
      window = excluded.window,
      request_count = CASE
        WHEN rate_limits.window = excluded.window THEN rate_limits.request_count + 1
        ELSE 1
      END
    RETURNING request_count
  `).bind(clientKey, window).first()

  return Number(row?.request_count) <= REQUESTS_PER_MINUTE
}

async function getUsageSnapshot(database, env) {
  const day = new Date().toISOString().slice(0, 10)
  const row = await database.prepare(`
    SELECT request_count, prompt_tokens, completion_tokens, estimated_neurons,
      error_count, degraded_requests
    FROM ai_usage
    WHERE day = ?1
  `).bind(day).first()

  return createUsageSnapshot(row, env)
}

async function recordUsage(database, env, tokenUsage, estimatedNeurons, degraded) {
  const day = new Date().toISOString().slice(0, 10)
  const row = await database.prepare(`
    INSERT INTO ai_usage (
      day, request_count, prompt_tokens, completion_tokens,
      estimated_neurons, error_count, degraded_requests
    ) VALUES (?1, 1, ?2, ?3, ?4, 0, ?5)
    ON CONFLICT(day) DO UPDATE SET
      request_count = ai_usage.request_count + 1,
      prompt_tokens = ai_usage.prompt_tokens + excluded.prompt_tokens,
      completion_tokens = ai_usage.completion_tokens + excluded.completion_tokens,
      estimated_neurons = ai_usage.estimated_neurons + excluded.estimated_neurons,
      degraded_requests = ai_usage.degraded_requests + excluded.degraded_requests
    RETURNING request_count, prompt_tokens, completion_tokens, estimated_neurons,
      error_count, degraded_requests
  `).bind(
    day,
    tokenUsage.promptTokens,
    tokenUsage.completionTokens,
    estimatedNeurons,
    degraded ? 1 : 0,
  ).first()

  return createUsageSnapshot(row, env)
}

function createUsageSnapshot(row, env) {
  const budgetNeurons = readDailyBudget(env)
  const estimatedNeurons = Number(row?.estimated_neurons) || 0
  const ratio = estimatedNeurons / budgetNeurons
  const state = ratio >= 1
    ? 'paused'
    : ratio >= DEGRADE_RATIO
      ? 'degraded'
      : ratio >= WARNING_RATIO
        ? 'warning'
        : 'normal'

  return {
    model: CHAT_MODEL,
    date: new Date().toISOString().slice(0, 10),
    resetsAt: nextUtcMidnight(),
    freeAllocationNeurons: DAILY_FREE_NEURONS,
    budgetNeurons,
    estimatedNeurons: roundNeurons(estimatedNeurons),
    percent: Math.min(100, Math.round(ratio * 100)),
    state,
    requests: Number(row?.request_count) || 0,
    promptTokens: Number(row?.prompt_tokens) || 0,
    completionTokens: Number(row?.completion_tokens) || 0,
    errors: Number(row?.error_count) || 0,
    degradedRequests: Number(row?.degraded_requests) || 0,
  }
}

function readDailyBudget(env) {
  const configured = Number(env.AI_DAILY_NEURON_BUDGET)
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, DAILY_FREE_NEURONS)
    : DEFAULT_DAILY_BUDGET
}

function readTokenUsage(usage = {}) {
  return {
    promptTokens: Number(usage.prompt_tokens ?? usage.input_tokens) || 0,
    completionTokens: Number(usage.completion_tokens ?? usage.output_tokens) || 0,
  }
}

function estimateNeurons({ promptTokens, completionTokens }) {
  return promptTokens * INPUT_NEURONS_PER_TOKEN
    + completionTokens * OUTPUT_NEURONS_PER_TOKEN
}

function addUsageLocally(snapshot, tokenUsage, estimatedNeurons, degraded) {
  return createUsageSnapshot({
    request_count: snapshot.requests + 1,
    prompt_tokens: snapshot.promptTokens + tokenUsage.promptTokens,
    completion_tokens: snapshot.completionTokens + tokenUsage.completionTokens,
    estimated_neurons: snapshot.estimatedNeurons + estimatedNeurons,
    error_count: snapshot.errors,
    degraded_requests: snapshot.degradedRequests + (degraded ? 1 : 0),
  }, { AI_DAILY_NEURON_BUDGET: snapshot.budgetNeurons })
}

function compactMessages(messages) {
  const systemMessage = messages[0]?.role === 'system' ? messages[0] : null
  const conversation = messages.slice(systemMessage ? 1 : 0).slice(-DEGRADED_HISTORY_MESSAGES)
  while (conversation[0]?.role === 'tool') conversation.shift()
  return systemMessage ? [systemMessage, ...conversation] : conversation
}

function nextUtcMidnight() {
  const next = new Date()
  next.setUTCHours(24, 0, 0, 0)
  return next.toISOString()
}

function roundNeurons(value) {
  return Math.round(value * 10) / 10
}

function isAllowedOrigin(origin) {
  try {
    const url = new URL(origin)
    return url.origin === 'https://cesium-browser-agent.pages.dev'
      || url.hostname.endsWith('.cesium-browser-agent.pages.dev')
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  } catch {
    return false
  }
}

function jsonError(error, status, request, details = {}) {
  return Response.json({ error, ...details }, { status, headers: apiHeaders(request) })
}

function apiHeaders(request) {
  const origin = request.headers.get('Origin')
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, X-Demo-Session',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  }
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  return headers
}

function withWebMcpHeaders(response, env) {
  const headers = new Headers(response.headers)
  headers.set('Origin-Agent-Cluster', '?1')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Content-Type-Options', 'nosniff')
  if (env.WEBMCP_ORIGIN_TRIAL_TOKEN) {
    headers.set('Origin-Trial', env.WEBMCP_ORIGIN_TRIAL_TOKEN)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
