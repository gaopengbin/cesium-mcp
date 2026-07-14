const CHAT_MODEL = '@cf/zai-org/glm-4.7-flash'
const MAX_BODY_BYTES = 128 * 1024
const MAX_MESSAGES = 40
const MAX_TOOLS = 20
const REQUESTS_PER_MINUTE = 30

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/chat') {
      return handleChatRequest(request, env)
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
  try {
    allowed = await checkRateLimit(env.RATE_LIMIT_DB, clientIdentity)
  } catch (error) {
    console.error('[Rate limit]', error?.message || error)
    return jsonError('AI service temporarily unavailable', 503, request)
  }
  if (!allowed) {
    return jsonError('Rate limit exceeded. Try again in a minute.', 429, request)
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

  try {
    const result = await env.AI.run(CHAT_MODEL, {
      messages,
      tools: tools || [],
      max_completion_tokens: 1024,
    })

    return Response.json(result, {
      headers: {
        ...apiHeaders(request),
        'X-AI-Model': CHAT_MODEL,
      },
    })
  } catch (error) {
    console.error('[Workers AI]', error?.message || error)
    return jsonError('AI service temporarily unavailable', 502, request)
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

function jsonError(error, status, request) {
  return Response.json({ error }, { status, headers: apiHeaders(request) })
}

function apiHeaders(request) {
  const origin = request.headers.get('Origin')
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, X-Demo-Session',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
