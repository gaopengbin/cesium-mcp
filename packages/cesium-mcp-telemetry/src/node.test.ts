import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { readInstallationId } from './node.js'
import { telemetryDisabled } from './index.js'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('installation identity and opt-out', () => {
  it('creates one random ID atomically across concurrent readers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cesium-telemetry-id-test-'))
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !directory.includes('cesium-telemetry-id-test-')) throw new Error('Unexpected test cleanup target')
    try {
      const ids = await Promise.all(Array.from({ length: 5 }, () => readInstallationId(directory)))
      expect(new Set(ids).size).toBe(1)
      expect(ids[0]).toMatch(/^[a-f0-9-]{36}$/)
      expect(await readFile(join(directory, 'telemetry-id'), 'utf8')).toBe(ids[0])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it.each(['CESIUM_TELEMETRY_DISABLED', 'DO_NOT_TRACK', 'CI'])('honours %s even when collection would otherwise be enabled', name => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', '')
    vi.stubEnv('CESIUM_TELEMETRY_DISABLED', '')
    vi.stubEnv('DO_NOT_TRACK', '')
    vi.stubEnv(name, '1')
    expect(telemetryDisabled()).toBe(true)
  })
  it('respects browser privacy signals and the browser-wide switch', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', '')
    vi.stubGlobal('navigator', { globalPrivacyControl: true })
    expect(telemetryDisabled()).toBe(true)
    vi.stubGlobal('navigator', { doNotTrack: '1' })
    expect(telemetryDisabled()).toBe(true)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('CESIUM_MCP_TELEMETRY_DISABLED', true)
    expect(telemetryDisabled()).toBe(true)
  })
})
