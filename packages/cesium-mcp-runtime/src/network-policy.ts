import { timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'

export interface NetworkPolicy {
  host: string
  token?: string
  allowedHosts: Set<string>
  allowedOrigins: Set<string>
}

interface NetworkRequest {
  headers: IncomingHttpHeaders
  method?: string
  url?: string
}

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const splitList = (value: string | undefined) => value?.split(',').map(part => part.trim()).filter(Boolean) ?? []

export function createNetworkPolicy(env: NodeJS.ProcessEnv): NetworkPolicy {
  const host = env.CESIUM_HOST?.trim() || '127.0.0.1'
  const token = env.CESIUM_AUTH_TOKEN?.trim() || undefined
  if (!loopbackHosts.has(host) && !token) {
    throw new Error('CESIUM_AUTH_TOKEN is required when CESIUM_HOST is not loopback')
  }
  const allowedHosts = new Set(loopbackHosts)
  if (host !== '0.0.0.0' && host !== '::') allowedHosts.add(host.toLowerCase())
  for (const hostname of splitList(env.CESIUM_ALLOWED_HOSTS)) {
    if (!/^(?:[a-z\d.-]+|\[[a-f\d:]+\])$/i.test(hostname) || hostname.includes('*')) {
      throw new Error('CESIUM_ALLOWED_HOSTS must contain exact hostnames without ports')
    }
    allowedHosts.add(hostname.toLowerCase())
  }
  const allowedOrigins = new Set<string>()
  for (const origin of splitList(env.CESIUM_ALLOWED_ORIGINS)) {
    const parsed = parseOrigin(origin)
    if (!parsed || parsed.origin !== origin || (parsed.protocol !== 'https:' && !loopbackHosts.has(parsed.hostname))) {
      throw new Error('CESIUM_ALLOWED_ORIGINS must contain exact HTTPS origins (HTTP is allowed on loopback)')
    }
    allowedOrigins.add(origin)
  }
  return { host, token, allowedHosts, allowedOrigins }
}

function parseOrigin(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) return undefined
    return url
  } catch {
    return undefined
  }
}

export function checkNetworkRequest(
  req: NetworkRequest,
  policy: NetworkPolicy,
  websocket = false,
): { status: number; message: string } | null {
  const host = req.headers.host
  // Parse only an HTTP authority, never userinfo, paths, or forwarded headers.
  if (!host || !/^(?:[a-z\d.-]+|\[[a-f\d:]+\])(?::\d{1,5})?$/i.test(host)) {
    return { status: 403, message: 'Invalid Host header' }
  }
  let hostname: string
  try { hostname = new URL(`http://${host}`).hostname } catch {
    return { status: 403, message: 'Invalid Host header' }
  }
  if (!policy.allowedHosts.has(hostname)) return { status: 403, message: 'Host is not allowed' }

  const origin = req.headers.origin
  if (origin !== undefined) {
    const parsed = parseOrigin(origin)
    if (!parsed || (!loopbackHosts.has(parsed.hostname) && !policy.allowedOrigins.has(origin))) {
      return { status: 403, message: 'Origin is not allowed' }
    }
  }

  let path: string
  try { path = new URL(req.url ?? '/', 'http://localhost').pathname } catch {
    return { status: 400, message: 'Invalid request URL' }
  }
  const publicAsset = req.method === 'GET' && ['/', '/index.html', '/bridge.js', '/favicon.ico'].includes(path)
  if (!policy.token || (!websocket && (req.method === 'OPTIONS' || publicAsset))) return null

  let supplied = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1]
  if (!supplied && websocket) {
    const encoded = req.headers['sec-websocket-protocol']?.split(',')
      .map(value => value.trim()).find(value => value.startsWith('cesium-token.'))?.slice(13)
    if (encoded && /^[a-z\d_-]+$/i.test(encoded)) supplied = Buffer.from(encoded, 'base64url').toString('utf8')
  }
  const expectedBytes = Buffer.from(policy.token)
  const suppliedBytes = Buffer.from(supplied ?? '')
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return { status: 401, message: 'Valid Bearer token required' }
  }
  return null
}

export function authorizeHttp(req: IncomingMessage, res: ServerResponse, policy: NetworkPolicy): boolean {
  const error = checkNetworkRequest(req, policy)
  if (error) {
    if (error.status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="cesium-mcp"')
    res.writeHead(error.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: error.message }))
    return false
  }
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
    res.setHeader('Vary', 'Origin')
  }
  return true
}
