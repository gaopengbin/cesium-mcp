import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUsageTelemetry, measureUsageCall } from './index.js'

beforeEach(() => {
  for (const name of ['CI', 'DO_NOT_TRACK', 'CESIUM_TELEMETRY_DISABLED', 'CESIUM_MCP_CONFORMANCE']) vi.stubEnv(name, '')
  vi.stubEnv('NODE_ENV', 'production')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

function setup(disabled = false) {
  const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  const identity = vi.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111')
  const notice = vi.fn()
  const telemetry = createUsageTelemetry({
    product: 'runtime', version: '1.147.0', platform: 'linux',
    isDisabled: () => disabled, identity, notice, send,
  })
  return { telemetry, send, identity, notice }
}

describe('disclosed package usage telemetry', () => {
  it('is enabled by default and displays disclosure before requesting an ID or sending', async () => {
    const { telemetry, send, identity, notice } = setup()
    telemetry.record('started')
    expect(notice).toHaveBeenCalledOnce()
    expect(identity).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    await telemetry.flush()
    expect(identity).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
    expect(notice.mock.calls[0][0]).toContain('CESIUM_TELEMETRY_DISABLED=1')
    telemetry.dispose()
  })
  it('does not read identity, schedule delivery, or send when disabled', async () => {
    const { telemetry, send, identity, notice } = setup(true)
    telemetry.record('started')
    telemetry.recordTool('flyTo', true, 12)
    await telemetry.flush()
    telemetry.dispose()
    expect(identity).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(notice).not.toHaveBeenCalled()
  })
  it('aggregates only known tools and fixed fields, without payloads or raw errors', async () => {
    const { telemetry, send } = setup()
    await measureUsageCall(telemetry, 'flyTo', async () => ({ success: true, data: { token: 'secret', longitude: 116 } }))
    await measureUsageCall(telemetry, 'flyTo', async () => ({ success: false, error: 'secret failure' }))
    await expect(measureUsageCall(telemetry, 'flyTo', async () => { throw new Error('private URL') })).rejects.toThrow('private URL')
    telemetry.recordTool('secret-project-name', true, 10)
    await telemetry.flush()
    const body = JSON.parse(send.mock.calls[0][1].body)
    expect(body.events.filter((event: any) => event.event === 'tool').reduce((n: number, event: any) => n + event.count, 0)).toBe(3)
    expect(JSON.stringify(body)).not.toMatch(/secret|longitude|private URL|data|error/)
    expect(body.events.every((event: any) => ['success', 'failure'].includes(event.outcome))).toBe(true)
    telemetry.dispose()
  })
  it('discards queued data if the user disables collection before delivery', async () => {
    let disabled = false
    const send = vi.fn()
    const identity = vi.fn()
    const telemetry = createUsageTelemetry({ product: 'bridge', version: '1.147.0', isDisabled: () => disabled, notice: vi.fn(), identity, send })
    telemetry.record('started')
    disabled = true
    await telemetry.flush()
    expect(send).not.toHaveBeenCalled()
    expect(identity).not.toHaveBeenCalled()
    telemetry.dispose()
  })
  it('never changes a tool result when the collector is unavailable', async () => {
    const { telemetry, send } = setup()
    send.mockRejectedValue(new Error('offline'))
    const result = await measureUsageCall(telemetry, 'flyTo', async () => ({ success: true }))
    await expect(telemetry.flush()).resolves.toBeUndefined()
    expect(result).toEqual({ success: true })
    telemetry.dispose()
  })
  it('does not let a local callback override a global opt-out', async () => {
    vi.stubEnv('DO_NOT_TRACK', '1')
    const { telemetry, identity, send } = setup()
    telemetry.record('started')
    await telemetry.flush()
    expect(identity).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    telemetry.dispose()
  })
  it('rejects unexpected product metadata before any network request', async () => {
    const send = vi.fn()
    const telemetry = createUsageTelemetry({ product: 'private-project' as never, version: '1.147.0', notice: vi.fn(), send })
    telemetry.record('started')
    await telemetry.flush()
    expect(send).not.toHaveBeenCalled()
    telemetry.dispose()
  })
})
