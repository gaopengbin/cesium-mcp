import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

let worker: Miniflare
let db: D1Database
const url = 'https://telemetry.example/api/package-telemetry'
const fixture = () => ({ schema: 1, batchId: crypto.randomUUID(), installationId: crypto.randomUUID(), product: 'runtime', version: '1.147.0', platform: 'linux', events: [{ event: 'tool', tool: 'flyTo', outcome: 'success', latency: 'lt1s', count: 2 }] })
const post = (body: unknown, headers = {}) => worker.dispatchFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

beforeAll(async () => {
  const bundle = await build({ entryPoints: ['examples/browser-agent/_worker.js'], bundle: true, format: 'esm', write: false, target: 'es2022' })
  worker = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-04-20', d1Databases: ['RATE_LIMIT_DB'], bindings: { TELEMETRY_ADMIN_TOKEN: 'local-test-only' } })
  db = await worker.getD1Database('RATE_LIMIT_DB')
  const schema = await readFile('examples/browser-agent/package-telemetry.sql', 'utf8')
  for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run()
  await db.prepare('CREATE TABLE ai_usage (value INTEGER)').run()
  await db.prepare('INSERT INTO ai_usage VALUES (123)').run()
}, 30000)
beforeEach(async () => {
  for (const table of ['npm_usage', 'npm_usage_batches', 'npm_usage_rate_limits']) await db.prepare(`DELETE FROM ${table}`).run()
})
afterAll(async () => { await worker?.dispose() })

describe('package telemetry real local D1 collector', () => {
  it('stores counters with a hash, deduplicates batches, and leaves chat data alone', async () => {
    const body = fixture()
    expect((await post(body)).status).toBe(204)
    expect((await post(body)).status).toBe(204)
    const rows = await db.prepare('SELECT * FROM npm_usage').all()
    expect(rows.results).toHaveLength(1)
    expect(rows.results[0]).toMatchObject({ product: 'runtime', tool: 'flyTo', count: 2 })
    expect(JSON.stringify(rows)).not.toContain(body.installationId)
    expect((rows.results[0] as any).install_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(await db.prepare('SELECT value FROM ai_usage').first('value')).toBe(123)
  })
  it('rejects extra fields and oversized chunked bodies before storing anything', async () => {
    expect((await post({ ...fixture(), prompt: 'private data' })).status).toBe(400)
    expect((await post({ ...fixture(), events: [{ ...fixture().events[0], tool: 'private-project' }] })).status).toBe(400)
    expect((await post({ secret: 'a'.repeat(17000) })).status).toBe(413)
    expect(await db.prepare('SELECT COUNT(*) FROM npm_usage').first('COUNT(*)')).toBe(0)
  })
  it('drops DNT and GPC reports without creating installation records', async () => {
    expect((await post(fixture(), { DNT: '1' })).status).toBe(204)
    expect((await post(fixture(), { 'Sec-GPC': '1' })).status).toBe(204)
    expect(await db.prepare('SELECT COUNT(*) FROM npm_usage_batches').first('COUNT(*)')).toBe(0)
  })
  it('requires admin authentication and returns only aggregate observed-installation metrics', async () => {
    await post(fixture())
    expect((await worker.dispatchFetch(url)).status).toBe(401)
    const response = await worker.dispatchFetch(url + '?days=7', { headers: { Authorization: 'Bearer local-test-only' } })
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.products).toEqual([expect.objectContaining({ product: 'runtime', active_installations: 1 })])
    expect(body.tools).toEqual([expect.objectContaining({ tool: 'flyTo', calls: 2, failures: 0 })])
    expect(body).not.toHaveProperty('install_hash')
    expect(JSON.stringify(body)).not.toMatch(/11111111|install_hash/)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
  it('limits one installation without storing its IP', async () => {
    const body = fixture()
    await post(body, { 'CF-Connecting-IP': '192.0.2.1' })
    await db.prepare('UPDATE npm_usage_rate_limits SET requests=2000').run()
    expect((await post({ ...body, batchId: crypto.randomUUID() })).status).toBe(429)
    expect(JSON.stringify((await db.prepare('SELECT * FROM npm_usage_rate_limits').all()).results)).not.toContain('192.0.2.1')
  })
  it('counts a returning active installation across the last two distinct weeks', async () => {
    await post(fixture())
    await db.prepare(`INSERT INTO npm_usage SELECT date('now','-8 days'), install_hash,
      product, version, platform, event, tool, outcome, latency, count FROM npm_usage`).run()
    const response = await worker.dispatchFetch(url + '?days=7', { headers: { Authorization: 'Bearer local-test-only' } })
    const body = await response.json() as any
    expect(body.returningLastTwoWeeks).toEqual([{ product: 'runtime', returning_installations: 1 }])
    expect(body.products[0].active_installations).toBe(1)
    expect(body.tools[0].lt1s).toBe(2)
  })
  it('purges old rows while retaining the current report', async () => {
    await db.prepare("INSERT INTO npm_usage_batches VALUES ('old', '2000-01-01')").run()
    await post(fixture())
    expect(await db.prepare("SELECT COUNT(*) FROM npm_usage_batches WHERE id='old'").first('COUNT(*)')).toBe(0)
    expect(await db.prepare('SELECT COUNT(*) FROM npm_usage').first('COUNT(*)')).toBe(1)
  })
})
