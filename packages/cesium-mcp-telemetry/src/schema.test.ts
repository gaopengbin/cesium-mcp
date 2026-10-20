import { describe, expect, it } from 'vitest'
import { validateUsageBatch } from './schema.js'

const fixture = () => ({ schema: 1, batchId: crypto.randomUUID(), installationId: crypto.randomUUID(), product: 'runtime', version: '1.147.0', platform: 'linux', events: [{ event: 'tool', tool: 'flyTo', outcome: 'success', latency: 'lt1s', count: 2 }] })

describe('collector input whitelist', () => {
  it('accepts bounded, known aggregate counters', () => expect(validateUsageBatch(fixture())).toBe(true))
  it.each(['prompt', 'token', 'url', 'coordinates', 'ip'])('rejects unexpected %s fields', field => {
    expect(validateUsageBatch({ ...fixture(), [field]: 'private' })).toBe(false)
  })
  it('rejects arbitrary tool names, extra event fields and excessive counters', () => {
    const body = fixture()
    body.events[0].tool = 'secret-project'
    expect(validateUsageBatch(body)).toBe(false)
    expect(validateUsageBatch({ ...fixture(), events: [{ ...fixture().events[0], error: 'secret' }] })).toBe(false)
    expect(validateUsageBatch({ ...fixture(), events: [{ ...fixture().events[0], count: 10001 }] })).toBe(false)
  })
})
