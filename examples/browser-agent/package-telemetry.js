import { validateUsageBatch } from '../../packages/cesium-mcp-telemetry/src/schema.ts'

const MAX_BYTES = 16384
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}

export async function handlePackageTelemetry(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method === 'GET') return summary(request, env)
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: cors })
  if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') return new Response(null, { status: 204, headers: cors })
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return new Response(null, { status: 415, headers: cors })
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return new Response(null, { status: 413, headers: cors })
  let value
  try {
    const reader = request.body?.getReader()
    if (!reader) return new Response(null, { status: 400, headers: cors })
    let length = 0
    const chunks = []
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) break
      length += chunk.byteLength
      if (length > MAX_BYTES) { await reader.cancel(); return new Response(null, { status: 413, headers: cors }) }
      chunks.push(chunk)
    }
    const buffer = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
    value = JSON.parse(new TextDecoder().decode(buffer))
  } catch { return new Response(null, { status: 400, headers: cors }) }
  if (!validateUsageBatch(value)) return new Response(null, { status: 400, headers: cors })
  const db = env.RATE_LIMIT_DB
  if (!db) return new Response(null, { status: 503, headers: cors })
  try {
    const day = new Date().toISOString().slice(0, 10)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.installationId))
    const installHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const rate = await db.prepare(`INSERT INTO npm_usage_rate_limits(day, install_hash, requests) VALUES (?, ?, 1)
      ON CONFLICT(day, install_hash) DO UPDATE SET requests=requests+1 RETURNING requests`).bind(day, installHash).first()
    if (rate.requests > 2000) return new Response(null, { status: 429, headers: cors })
    const receipt = await db.prepare('INSERT OR IGNORE INTO npm_usage_batches(id, day) VALUES (?, ?)').bind(value.batchId, day).run()
    if (!receipt.meta.changes) return new Response(null, { status: 204, headers: cors })
    const statements = value.events.map(event => db.prepare(`INSERT INTO npm_usage
      (day, install_hash, product, version, platform, event, tool, outcome, latency, count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day, install_hash, product, version, platform, event, tool, outcome, latency)
      DO UPDATE SET count=MIN(100000, count+excluded.count)`)
      .bind(day, installHash, value.product, value.version, value.platform, event.event, event.tool, event.outcome, event.latency, event.count))
    // Bound retention independently of the AI/chat tables. Requests contain no IP field.
    for (const table of ['npm_usage', 'npm_usage_batches', 'npm_usage_rate_limits']) {
      statements.push(db.prepare(`DELETE FROM ${table} WHERE day < date('now', '-89 days')`))
    }
    await db.batch(statements)
    return new Response(null, { status: 204, headers: cors })
  } catch {
    // Do not log bodies, IDs, headers, SQL bindings, or exception messages.
    return new Response(null, { status: 503, headers: cors })
  }
}

async function summary(request, env) {
  if (!env.TELEMETRY_ADMIN_TOKEN) return new Response(null, { status: 503 })
  const expected = `Bearer ${env.TELEMETRY_ADMIN_TOKEN}`
  const actual = request.headers.get('Authorization') ?? ''
  const hash = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const [a, b] = await Promise.all([hash(actual), hash(expected)])
  const left = new Uint8Array(a)
  const right = new Uint8Array(b)
  let mismatch = 0
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i]
  if (mismatch) return new Response(null, { status: 401 })
  const days = Number(new URL(request.url).searchParams.get('days') ?? 30)
  if (![7, 30, 90].includes(days)) return new Response(null, { status: 400 })
  if (!env.RATE_LIMIT_DB) return new Response(null, { status: 503 })
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)
  try {
    const db = env.RATE_LIMIT_DB
    const [products, daily, tools, versions, returning] = await db.batch([
      db.prepare(`SELECT product, COUNT(DISTINCT install_hash) observed_installations,
        SUM(CASE WHEN event='started' THEN count ELSE 0 END) starts,
        SUM(CASE WHEN event='connected' THEN count ELSE 0 END) connections,
        COUNT(DISTINCT CASE WHEN event='connected' THEN install_hash END) connected_installations,
        COUNT(DISTINCT CASE WHEN event='tool' AND outcome='success' THEN install_hash END) active_installations
        FROM npm_usage WHERE day>=? GROUP BY product`).bind(since),
      db.prepare(`SELECT day, product, COUNT(DISTINCT CASE WHEN event='tool' AND outcome='success' THEN install_hash END) active_installations
        FROM npm_usage WHERE day>=? GROUP BY day, product`).bind(since),
      db.prepare(`SELECT product, tool, SUM(count) calls, SUM(CASE WHEN outcome='failure' THEN count ELSE 0 END) failures,
        SUM(CASE WHEN latency='lt100ms' THEN count ELSE 0 END) lt100ms,
        SUM(CASE WHEN latency='lt1s' THEN count ELSE 0 END) lt1s,
        SUM(CASE WHEN latency='lt10s' THEN count ELSE 0 END) lt10s,
        SUM(CASE WHEN latency='gte10s' THEN count ELSE 0 END) gte10s
        FROM npm_usage WHERE day>=? AND event='tool' GROUP BY product, tool`).bind(since),
      db.prepare(`SELECT product, version, platform, COUNT(DISTINCT install_hash) installations
        FROM npm_usage WHERE day>=? GROUP BY product, version, platform`).bind(since),
      db.prepare(`WITH recent AS (SELECT DISTINCT product, install_hash FROM npm_usage
          WHERE day>=date('now','-6 days') AND event='tool' AND outcome='success'),
        previous AS (SELECT DISTINCT product, install_hash FROM npm_usage
          WHERE day>=date('now','-13 days') AND day<date('now','-6 days') AND event='tool' AND outcome='success')
        SELECT recent.product, COUNT(*) returning_installations FROM recent JOIN previous
          ON recent.product=previous.product AND recent.install_hash=previous.install_hash GROUP BY recent.product`),
    ])
    return Response.json({
      source: 'package-runtime-telemetry', since, through: new Date().toISOString().slice(0, 10), days,
      products: products.results, daily: daily.results, tools: tools.results, versions: versions.results,
      returningLastTwoWeeks: returning.results,
      note: 'Observed installations, not people. Disabled, blocked, offline or dropped reports are absent. Do not add products together. Public client reports can be forged.',
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return new Response(null, { status: 503 }) }
}
