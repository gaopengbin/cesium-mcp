const CHAT_MODEL = '@cf/zai-org/glm-4.7-flash'
const VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'
const MAX_BODY_BYTES = 256 * 1024
const MAX_VISION_BODY_BYTES = 1024 * 1024
const MAX_VISION_IMAGE_BYTES = 512 * 1024
const MAX_VISION_PIXELS = 1_000_000
const MAX_VISION_DIMENSION = 4096
const MAX_GROUNDING_OBJECTS = 32
const MAX_GROUNDING_REGIONS = 32
const MAX_GROUNDING_CANDIDATES = 48
const MAX_ID_LENGTH = 128
const MAX_LABEL_LENGTH = 160
const MAX_SUMMARY_LENGTH = 512
const MAX_LIMITATIONS = 16
const MAX_LIMITATION_LENGTH = 500
const MAX_MESSAGES = 40
const MAX_TOOLS = 64
const REQUESTS_PER_MINUTE = 30
const DAILY_FREE_NEURONS = 10_000
const DEFAULT_DAILY_BUDGET = 9_000
const WARNING_RATIO = 0.7
const DEGRADE_RATIO = 0.85
const MAX_COMPLETION_TOKENS = 4096
const DEGRADED_COMPLETION_TOKENS = 2048
const DEGRADED_HISTORY_MESSAGES = 12
const VISION_COMPLETION_TOKENS = 1600
const DEGRADED_VISION_COMPLETION_TOKENS = 900
const INPUT_NEURONS_PER_TOKEN = 0.0055
const OUTPUT_NEURONS_PER_TOKEN = 0.0364
const ASSET_PROXY_PREFIX = '/api/assets/'
const ASSET_PROXY_SOURCES = Object.freeze({
  jojo: new URL('http://jojo1986.cn:8888'),
})
const PROXY_REQUEST_HEADERS = ['Accept', 'If-Modified-Since', 'If-None-Match', 'Range']
const PROXY_RESPONSE_HEADERS = [
  'Accept-Ranges',
  'Content-Range',
  'Content-Type',
  'ETag',
  'Last-Modified',
]

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith(ASSET_PROXY_PREFIX)) {
      return handleAssetProxy(request, url)
    }
    if (url.pathname === '/api/chat') {
      return handleChatRequest(request, env)
    }
    if (url.pathname === '/api/vision-grounding') {
      return handleVisionGroundingRequest(request, env)
    }
    if (url.pathname === '/api/usage') {
      return handleUsageRequest(request, env)
    }

    return withWebMcpHeaders(await env.ASSETS.fetch(request), env)
  },
}

export async function handleAssetProxy(request, url = new URL(request.url)) {
  const origin = request.headers.get('Origin')
  if (origin && !isAllowedOrigin(origin)) {
    return assetProxyError('Origin not allowed', 403)
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: assetProxyHeaders() })
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return assetProxyError('Method not allowed', 405)
  }

  const route = url.pathname.slice(ASSET_PROXY_PREFIX.length)
  const separator = route.indexOf('/')
  const sourceKey = separator > 0 ? route.slice(0, separator) : route
  const encodedPath = separator > 0 ? route.slice(separator + 1) : ''
  const upstreamBase = ASSET_PROXY_SOURCES[sourceKey]

  if (!upstreamBase) return assetProxyError('Asset source not allowed', 403)
  if (!encodedPath || hasUnsafeProxyPath(encodedPath)) {
    return assetProxyError('Invalid asset path', 400)
  }

  const upstreamUrl = new URL(`/${encodedPath}`, upstreamBase)
  upstreamUrl.search = url.search
  if (upstreamUrl.origin !== upstreamBase.origin) {
    return assetProxyError('Invalid asset origin', 400)
  }

  const headers = new Headers()
  for (const name of PROXY_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  let upstreamResponse
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      redirect: 'manual',
      cf: {
        cacheEverything: true,
        cacheTtl: 3600,
      },
    })
  } catch (error) {
    console.error('[Asset proxy]', error?.message || error)
    return assetProxyError('Asset source unavailable', 502)
  }

  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    return assetProxyError('Asset source redirect blocked', 502)
  }

  const responseHeaders = assetProxyHeaders()
  for (const name of PROXY_RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  responseHeaders.set(
    'Cache-Control',
    upstreamResponse.headers.get('Cache-Control') || 'public, max-age=3600',
  )

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  })
}

function hasUnsafeProxyPath(path) {
  let decoded = path
  try {
    for (let index = 0; index < 3; index += 1) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
  } catch {
    return true
  }

  return decoded.includes('\0')
    || decoded.replaceAll('\\', '/').split('/').some(segment => segment === '..')
}

function assetProxyError(error, status) {
  return Response.json({ error }, { status, headers: assetProxyHeaders() })
}

function assetProxyHeaders() {
  return new Headers({
    'Access-Control-Allow-Headers': 'Accept, If-Modified-Since, If-None-Match, Range',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
  })
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

export async function handleVisionGroundingRequest(request, env) {
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
  if (contentLength > MAX_VISION_BODY_BYTES) {
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
    console.error(JSON.stringify({
      message: 'vision grounding guardrail failed',
      error: error instanceof Error ? error.message : String(error),
    }))
    return jsonError('AI service temporarily unavailable', 503, request)
  }
  if (!allowed) {
    return jsonError('Rate limit exceeded. Try again in a minute.', 429, request)
  }
  if (usage.state === 'paused') {
    return jsonError(
      'The hosted AI daily safety budget has been reached.',
      503,
      request,
      { code: 'AI_BUDGET_EXHAUSTED', usage },
    )
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAX_VISION_BODY_BYTES) {
    return jsonError('Request body too large', 413, request)
  }

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return jsonError('Invalid JSON', 400, request)
  }

  let input
  try {
    input = await validateVisionGroundingRequest(body)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Invalid vision grounding request',
      400,
      request,
    )
  }

  const degraded = usage.state === 'degraded'
  let result
  try {
    result = await env.AI.run(VISION_MODEL, {
      messages: createVisionGroundingMessages(input),
      max_completion_tokens: degraded
        ? DEGRADED_VISION_COMPLETION_TOKENS
        : VISION_COMPLETION_TOKENS,
      temperature: 0,
    })
  } catch (error) {
    console.error(JSON.stringify({
      message: 'vision grounding inference failed',
      error: error instanceof Error ? error.message : String(error),
    }))
    return jsonError('Visual grounding inference failed', 502, request, {
      code: 'VISION_INFERENCE_FAILED',
    })
  }

  let report
  let outputFailure
  try {
    report = validateVisionGroundingReport(
      readVisionGroundingModelOutput(result),
      input,
    )
  } catch (error) {
    outputFailure = describeVisionOutputFailure(error)
    console.error(JSON.stringify({
      message: 'vision grounding output rejected',
      error: error instanceof Error ? error.message : String(error),
      ...outputFailure,
    }))
    report = createConservativeUnknownVisionReport(input, outputFailure)
  }

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
    console.error(JSON.stringify({
      message: 'vision grounding usage recording failed',
      error: error instanceof Error ? error.message : String(error),
    }))
  }

  return Response.json({ report, model: VISION_MODEL }, {
    headers: {
      ...apiHeaders(request),
      'X-AI-Model': VISION_MODEL,
      'X-AI-Usage-State': updatedUsage.state,
      'X-AI-Daily-Neurons': String(roundNeurons(updatedUsage.estimatedNeurons)),
      'X-AI-Usage-Percent': String(updatedUsage.percent),
      'X-AI-Degraded': String(degraded),
      'X-AI-Evidence-State': outputFailure ? 'unknown-fallback' : 'grounded',
    },
  })
}

async function validateVisionGroundingRequest(value) {
  const request = strictObject(value, [
    'schemaVersion',
    'image',
    'observation',
    'candidates',
  ], 'Vision grounding request')
  if (request.schemaVersion !== 1) {
    throw new Error('Vision grounding request schemaVersion must be 1')
  }

  const image = strictObject(request.image, [
    'dataUrl',
    'width',
    'height',
    'digest',
  ], 'Vision grounding image')
  const dataUrl = boundedString(image.dataUrl, 'Image data URL', MAX_VISION_BODY_BYTES)
  const parsedImage = decodeVisionImage(dataUrl)
  const width = positiveInteger(image.width, 'Image width', MAX_VISION_DIMENSION)
  const height = positiveInteger(image.height, 'Image height', MAX_VISION_DIMENSION)
  const actualDimensions = readVisionImageDimensions(parsedImage)
  if (width !== actualDimensions.width || height !== actualDimensions.height) {
    throw new Error('Image dimensions do not match the submitted image bytes')
  }
  if (width * height > MAX_VISION_PIXELS) {
    throw new Error(`Image must contain at most ${MAX_VISION_PIXELS} pixels`)
  }
  const digest = normalizeSha256Digest(image.digest, 'Image digest')
  const actualDigest = await sha256Digest(parsedImage.bytes)
  if (digest !== actualDigest) {
    throw new Error('Image digest does not match the submitted image bytes')
  }

  const observation = validateVisionObservation(request.observation)
  const candidates = validateVisionCandidates(request.candidates)
  return {
    schemaVersion: 1,
    image: {
      dataUrl,
      width,
      height,
      digest,
      mimeType: parsedImage.mimeType,
    },
    observation,
    candidates,
  }
}

function validateVisionObservation(value) {
  const observation = strictObject(value, [
    'observationId',
    'worldId',
    'worldRevision',
    'capturedAt',
    'sensor',
  ], 'Vision grounding observation')
  const sensor = strictObject(observation.sensor, [
    'sensorId',
    'kind',
    'pose',
    'rangeMeters',
    'horizontalFieldOfViewDegrees',
    'verticalFieldOfViewDegrees',
  ], 'Vision grounding sensor')
  if (sensor.kind !== 'camera') throw new Error('Vision grounding sensor must be a camera')
  const pose = sensor.pose === undefined
    ? undefined
    : validateObserverPose(sensor.pose)
  return {
    observationId: boundedString(
      observation.observationId,
      'Observation ID',
      MAX_ID_LENGTH,
    ),
    worldId: boundedString(observation.worldId, 'World ID', MAX_ID_LENGTH),
    worldRevision: positiveInteger(
      observation.worldRevision,
      'World revision',
      Number.MAX_SAFE_INTEGER,
    ),
    capturedAt: isoTimestamp(observation.capturedAt, 'Capture time'),
    sensor: {
      sensorId: boundedString(sensor.sensorId, 'Sensor ID', MAX_ID_LENGTH),
      kind: 'camera',
      ...(pose ? { pose } : {}),
      ...(sensor.rangeMeters === undefined
        ? {}
        : { rangeMeters: positiveNumber(sensor.rangeMeters, 'Sensor range') }),
      ...(sensor.horizontalFieldOfViewDegrees === undefined
        ? {}
        : {
            horizontalFieldOfViewDegrees: boundedNumber(
              sensor.horizontalFieldOfViewDegrees,
              'Horizontal field of view',
              0,
              180,
              false,
            ),
          }),
      ...(sensor.verticalFieldOfViewDegrees === undefined
        ? {}
        : {
            verticalFieldOfViewDegrees: boundedNumber(
              sensor.verticalFieldOfViewDegrees,
              'Vertical field of view',
              0,
              180,
              false,
            ),
          }),
    },
  }
}

function validateObserverPose(value) {
  const pose = strictObject(value, [
    'position',
    'headingDegrees',
    'pitchDegrees',
    'rollDegrees',
  ], 'Observer pose')
  if (!Array.isArray(pose.position) || pose.position.length < 2 || pose.position.length > 3) {
    throw new Error('Observer pose position must contain longitude, latitude, and optional height')
  }
  const position = pose.position.map((coordinate, index) => {
    if (typeof coordinate !== 'number' || !Number.isFinite(coordinate)) {
      throw new Error(`Observer pose coordinate at index ${index} must be finite`)
    }
    return coordinate
  })
  const result = { position }
  for (const field of ['headingDegrees', 'pitchDegrees', 'rollDegrees']) {
    if (pose[field] !== undefined) {
      if (typeof pose[field] !== 'number' || !Number.isFinite(pose[field])) {
        throw new Error(`Observer pose ${field} must be finite`)
      }
      result[field] = pose[field]
    }
  }
  return result
}

function validateVisionCandidates(value) {
  const candidates = strictObject(value, ['objects', 'regions'], 'Vision grounding candidates')
  const objects = validateCandidateArray(
    candidates.objects,
    'objectId',
    MAX_GROUNDING_OBJECTS,
    'object',
  )
  const regions = validateCandidateArray(
    candidates.regions,
    'regionId',
    MAX_GROUNDING_REGIONS,
    'region',
  )
  if (objects.length + regions.length > MAX_GROUNDING_CANDIDATES) {
    throw new Error(`Vision grounding supports at most ${MAX_GROUNDING_CANDIDATES} candidates`)
  }
  if (objects.length === 0 && regions.length === 0) {
    throw new Error('Vision grounding requires at least one candidate')
  }
  return { objects, regions }
}

function validateCandidateArray(value, idField, maximumCount, label) {
  if (!Array.isArray(value) || value.length > maximumCount) {
    throw new Error(`Vision grounding ${label}s must contain at most ${maximumCount} items`)
  }
  const seen = new Set()
  return value.map((item, index) => {
    const candidate = strictObject(
      item,
      [idField, 'label', 'summary'],
      `Vision grounding ${label} candidate at index ${index}`,
    )
    const id = boundedString(candidate[idField], `${label} candidate ID`, MAX_ID_LENGTH)
    if (seen.has(id)) throw new Error(`Duplicate ${label} candidate ID: ${id}`)
    seen.add(id)
    return {
      [idField]: id,
      label: boundedString(candidate.label, `${label} candidate label`, MAX_LABEL_LENGTH),
      summary: boundedString(
        candidate.summary,
        `${label} candidate summary`,
        MAX_SUMMARY_LENGTH,
      ),
    }
  })
}

function decodeVisionImage(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z\d+/]+={0,2})$/i.exec(dataUrl)
  if (!match) throw new Error('Image must be a base64 JPEG, PNG, or WebP data URL')
  let binary
  try {
    binary = atob(match[2])
  } catch {
    throw new Error('Image data URL contains invalid base64')
  }
  if (binary.length === 0 || binary.length > MAX_VISION_IMAGE_BYTES) {
    throw new Error(`Decoded image must contain between 1 and ${MAX_VISION_IMAGE_BYTES} bytes`)
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return { mimeType: match[1].toLowerCase(), bytes }
}

function readVisionImageDimensions(image) {
  if (image.mimeType === 'image/png') return readPngDimensions(image.bytes)
  if (image.mimeType === 'image/jpeg') return readJpegDimensions(image.bytes)
  if (image.mimeType === 'image/webp') return readWebpDimensions(image.bytes)
  throw new Error('Unsupported image format')
}

function readPngDimensions(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) {
    throw new Error('PNG bytes do not match the declared image type')
  }
  return validateEncodedDimensions(
    readUint32BigEndian(bytes, 16),
    readUint32BigEndian(bytes, 20),
  )
}

function readJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('JPEG bytes do not match the declared image type')
  }
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ])
  let offset = 2
  while (offset < bytes.length - 8) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9) continue
    if (marker === 0xda) break
    if (offset + 1 >= bytes.length) break
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1]
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return validateEncodedDimensions(
        (bytes[offset + 5] << 8) | bytes[offset + 6],
        (bytes[offset + 3] << 8) | bytes[offset + 4],
      )
    }
    offset += segmentLength
  }
  throw new Error('JPEG image dimensions could not be read')
}

function readWebpDimensions(bytes) {
  if (
    bytes.length < 30
    || ascii(bytes, 0, 4) !== 'RIFF'
    || ascii(bytes, 8, 12) !== 'WEBP'
  ) {
    throw new Error('WebP bytes do not match the declared image type')
  }
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, offset, offset + 4)
    const chunkLength = readUint32LittleEndian(bytes, offset + 4)
    const payload = offset + 8
    if (payload + chunkLength > bytes.length) break
    if (chunkType === 'VP8X' && chunkLength >= 10) {
      return validateEncodedDimensions(
        1 + readUint24LittleEndian(bytes, payload + 4),
        1 + readUint24LittleEndian(bytes, payload + 7),
      )
    }
    if (chunkType === 'VP8L' && chunkLength >= 5 && bytes[payload] === 0x2f) {
      const bits = readUint32LittleEndian(bytes, payload + 1)
      return validateEncodedDimensions(
        1 + (bits & 0x3fff),
        1 + ((bits >>> 14) & 0x3fff),
      )
    }
    if (
      chunkType === 'VP8 '
      && chunkLength >= 10
      && bytes[payload + 3] === 0x9d
      && bytes[payload + 4] === 0x01
      && bytes[payload + 5] === 0x2a
    ) {
      return validateEncodedDimensions(
        ((bytes[payload + 7] << 8) | bytes[payload + 6]) & 0x3fff,
        ((bytes[payload + 9] << 8) | bytes[payload + 8]) & 0x3fff,
      )
    }
    offset = payload + chunkLength + (chunkLength % 2)
  }
  throw new Error('WebP image dimensions could not be read')
}

function validateEncodedDimensions(width, height) {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || width > MAX_VISION_DIMENSION
    || height > MAX_VISION_DIMENSION
    || width * height > MAX_VISION_PIXELS
  ) {
    throw new Error('Encoded image dimensions exceed the visual grounding limits')
  }
  return { width, height }
}

function ascii(bytes, start, end) {
  return String.fromCharCode(...bytes.slice(start, end))
}

function readUint24LittleEndian(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function readUint32LittleEndian(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true)
}

function readUint32BigEndian(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false)
}

async function sha256Digest(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), byte => (
    byte.toString(16).padStart(2, '0')
  )).join('')}`
}

function createVisionGroundingMessages(input) {
  return [
    {
      role: 'system',
      content: [
        'You are a conservative visual grounding sensor for a CesiumJS world model.',
        'Ground only the supplied local candidate IDs. Never invent an ID.',
        'Mark a region occupied only when positive visible evidence blocks it.',
        'If visibility is incomplete, ambiguous, occluded, or unloaded, use unknown.',
        'A clear classification is descriptive only and is never permission to traverse.',
        'Return only one JSON object without markdown or reasoning.',
        'The exact top-level keys are schemaVersion, objects, regions, and limitations.',
        'Every visible object must include a normalized bbox.',
        'Only an occupied region may name visible objects in blockingObjectIds.',
        'Do not include labels, summaries, descriptions, explanations, or any other keys.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            imageDigest: input.image.digest,
            imageSize: {
              width: input.image.width,
              height: input.image.height,
            },
            observation: input.observation,
            candidates: input.candidates,
            instructions: {
              objectVisibility: ['visible', 'not-visible', 'uncertain'],
              regionOccupancy: ['occupied', 'clear', 'unknown'],
              coverage: ['complete', 'partial', 'occluded', 'unavailable'],
              normalizedBbox: '[x,y,width,height] values in [0,1]',
              outputExample: {
                schemaVersion: 1,
                objects: [{
                  objectId: 'COPY_AN_OBJECT_ID',
                  visibility: 'visible',
                  confidence: 0.9,
                  bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
                }],
                regions: [{
                  regionId: 'COPY_A_REGION_ID',
                  occupancy: 'occupied',
                  coverage: 'partial',
                  confidence: 0.9,
                  bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
                  blockingObjectIds: ['COPY_A_VISIBLE_OBJECT_ID'],
                }],
                limitations: [],
              },
            },
          }),
        },
        {
          type: 'image_url',
          image_url: {
            url: input.image.dataUrl,
            detail: 'high',
          },
        },
      ],
    },
  ]
}

function readVisionGroundingModelOutput(result) {
  const value = result?.response ?? result?.choices?.[0]?.message?.content
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  const content = Array.isArray(value)
    ? value
      .filter(part => part?.type === 'text' && typeof part.text === 'string')
      .map(part => part.text)
      .join('\n')
    : value
  if (typeof content !== 'string') {
    throw new Error('Vision model did not return a JSON object')
  }
  const withoutReasoning = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const unwrapped = withoutReasoning.startsWith('```')
    ? withoutReasoning.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : withoutReasoning
  const firstBrace = unwrapped.indexOf('{')
  const lastBrace = unwrapped.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error('Vision model did not return a JSON object')
  }
  const jsonText = unwrapped.slice(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(jsonText)
  } catch {
    throw new Error('Vision model returned invalid JSON')
  }
}

function describeVisionOutputFailure(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (/invalid JSON/i.test(message)) return { reason: 'invalid_json' }
  if (/did not return a JSON object/i.test(message)) return { reason: 'missing_json_object' }
  if (/Unrequested visual .* ID/i.test(message)) return { reason: 'candidate_id_mismatch' }
  if (/image digest/i.test(message)) return { reason: 'image_digest_mismatch' }
  if (/must include a bounding box/i.test(message)) return { reason: 'missing_visible_bbox' }
  const unknownField = /unknown field: ([a-z\d_-]{1,80})/i.exec(message)?.[1]
  if (unknownField) return { reason: 'unknown_schema_field', field: unknownField }
  return { reason: 'invalid_report_schema' }
}

function createConservativeUnknownVisionReport(input, failure) {
  return {
    schemaVersion: 1,
    imageDigest: input.image.digest,
    objects: input.candidates.objects.map(candidate => ({
      objectId: candidate.objectId,
      visibility: 'uncertain',
      confidence: 0,
    })),
    regions: input.candidates.regions.map(candidate => ({
      regionId: candidate.regionId,
      occupancy: 'unknown',
      coverage: 'unavailable',
      confidence: 0,
    })),
    limitations: [
      `Visual model output was rejected (${failure.reason}); no positive spatial claim was accepted.`,
    ],
  }
}

function validateVisionGroundingReport(value, input) {
  const report = strictObject(value, [
    'schemaVersion',
    'imageDigest',
    'objects',
    'regions',
    'limitations',
  ], 'Visual grounding report')
  if (report.schemaVersion !== 1) {
    throw new Error('Visual grounding report schemaVersion must be 1')
  }
  if (
    report.imageDigest !== undefined
    && normalizeSha256Digest(report.imageDigest, 'Report image digest') !== input.image.digest
  ) {
    throw new Error('Visual grounding report image digest mismatch')
  }
  const objectIds = new Set(input.candidates.objects.map(candidate => candidate.objectId))
  const regionIds = new Set(input.candidates.regions.map(candidate => candidate.regionId))
  const seenObjects = new Set()
  const objects = requireArray(report.objects, 'Visual grounding report objects')
    .map((item, index) => validateGroundedObject(item, index, objectIds, seenObjects))
  const visibleObjectIds = new Set(
    objects.filter(item => item.visibility === 'visible').map(item => item.objectId),
  )
  const seenRegions = new Set()
  const regions = requireArray(report.regions, 'Visual grounding report regions')
    .map((item, index) => validateGroundedRegion(
      item,
      index,
      regionIds,
      objectIds,
      visibleObjectIds,
      seenRegions,
    ))
  const limitations = requireArray(report.limitations, 'Visual grounding report limitations')
  if (limitations.length > MAX_LIMITATIONS) {
    throw new Error(`Visual grounding report supports at most ${MAX_LIMITATIONS} limitations`)
  }
  return {
    schemaVersion: 1,
    imageDigest: input.image.digest,
    objects: objects.sort((left, right) => left.objectId.localeCompare(right.objectId)),
    regions: regions.sort((left, right) => left.regionId.localeCompare(right.regionId)),
    limitations: [...new Set(limitations.map((limitation, index) => boundedString(
      limitation,
      `Visual grounding limitation at index ${index}`,
      MAX_LIMITATION_LENGTH,
    )))].sort(),
  }
}

function validateGroundedObject(value, index, allowedIds, seenIds) {
  const item = strictObject(value, [
    'objectId',
    'visibility',
    'confidence',
    'bbox',
  ], `Visual object grounding at index ${index}`)
  const objectId = boundedString(item.objectId, 'Visual object ID', MAX_ID_LENGTH)
  if (!allowedIds.has(objectId)) throw new Error(`Unrequested visual object ID: ${objectId}`)
  if (seenIds.has(objectId)) throw new Error(`Duplicate visual object ID: ${objectId}`)
  seenIds.add(objectId)
  const visibility = enumString(
    item.visibility,
    ['visible', 'not-visible', 'uncertain'],
    'Visual object visibility',
  )
  const confidence = boundedNumber(item.confidence, 'Visual object confidence', 0, 1)
  const bbox = item.bbox === undefined ? undefined : validateNormalizedBbox(item.bbox)
  if (visibility === 'visible' && !bbox) {
    throw new Error(`Visible object '${objectId}' must include a bounding box`)
  }
  if (visibility !== 'visible' && bbox) {
    throw new Error(`Non-visible object '${objectId}' must not include a bounding box`)
  }
  return {
    objectId,
    visibility,
    confidence,
    ...(bbox ? { bbox } : {}),
  }
}

function validateGroundedRegion(
  value,
  index,
  allowedRegionIds,
  allowedObjectIds,
  visibleObjectIds,
  seenIds,
) {
  const item = strictObject(value, [
    'regionId',
    'occupancy',
    'coverage',
    'confidence',
    'bbox',
    'blockingObjectIds',
  ], `Visual region grounding at index ${index}`)
  const regionId = boundedString(item.regionId, 'Visual region ID', MAX_ID_LENGTH)
  if (!allowedRegionIds.has(regionId)) throw new Error(`Unrequested visual region ID: ${regionId}`)
  if (seenIds.has(regionId)) throw new Error(`Duplicate visual region ID: ${regionId}`)
  seenIds.add(regionId)
  const occupancy = enumString(
    item.occupancy,
    ['occupied', 'clear', 'unknown'],
    'Visual region occupancy',
  )
  const coverage = enumString(
    item.coverage,
    ['complete', 'partial', 'occluded', 'unavailable'],
    'Visual region coverage',
  )
  const confidence = boundedNumber(item.confidence, 'Visual region confidence', 0, 1)
  const bbox = item.bbox === undefined ? undefined : validateNormalizedBbox(item.bbox)
  const blockingObjectIds = item.blockingObjectIds === undefined
    ? []
    : requireArray(item.blockingObjectIds, 'Visual region blockingObjectIds')
      .map((objectId, objectIndex) => boundedString(
        objectId,
        `Visual region blocking object ID at index ${objectIndex}`,
        MAX_ID_LENGTH,
      ))
  if (new Set(blockingObjectIds).size !== blockingObjectIds.length) {
    throw new Error(`Visual region '${regionId}' contains duplicate blocking object IDs`)
  }
  for (const objectId of blockingObjectIds) {
    if (!allowedObjectIds.has(objectId) || !visibleObjectIds.has(objectId)) {
      throw new Error(`Visual region '${regionId}' references an ungrounded blocking object`)
    }
  }
  if (occupancy !== 'occupied' && blockingObjectIds.length > 0) {
    throw new Error(`Visual region '${regionId}' may only name blockers when occupied`)
  }
  return {
    regionId,
    occupancy,
    coverage,
    confidence,
    ...(bbox ? { bbox } : {}),
    ...(blockingObjectIds.length > 0 ? { blockingObjectIds: blockingObjectIds.sort() } : {}),
  }
}

function validateNormalizedBbox(value) {
  const bbox = strictObject(value, ['x', 'y', 'width', 'height'], 'Normalized bounding box')
  const x = boundedNumber(bbox.x, 'Bounding box x', 0, 1)
  const y = boundedNumber(bbox.y, 'Bounding box y', 0, 1)
  const width = boundedNumber(bbox.width, 'Bounding box width', 0, 1, false)
  const height = boundedNumber(bbox.height, 'Bounding box height', 0, 1, false)
  if (x + width > 1 + Number.EPSILON || y + height > 1 + Number.EPSILON) {
    throw new Error('Normalized bounding box must fit inside the image')
  }
  return { x, y, width, height }
}

function strictObject(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown field: ${key}`)
  }
  return value
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function boundedString(value, label, maximumLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`)
  }
  if (value !== value.trim() || value.length > maximumLength) {
    throw new Error(`${label} exceeds its allowed format or length`)
  }
  return value
}

function positiveInteger(value, label, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} must be a positive integer no greater than ${maximum}`)
  }
  return value
}

function positiveNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`)
  }
  return value
}

function boundedNumber(value, label, minimum, maximum, allowMinimum = true) {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < minimum
    || (!allowMinimum && value === minimum)
    || value > maximum
  ) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`)
  }
  return value
}

function enumString(value, allowedValues, label) {
  if (typeof value !== 'string' || !allowedValues.includes(value)) {
    throw new Error(`${label} must be one of: ${allowedValues.join(', ')}`)
  }
  return value
}

function normalizeSha256Digest(value, label) {
  if (typeof value !== 'string' || !/^sha256:[a-f\d]{64}$/i.test(value)) {
    throw new Error(`${label} must use sha256:<64 hexadecimal characters>`)
  }
  return value.toLowerCase()
}

function isoTimestamp(value, label) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`)
  }
  return value
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
