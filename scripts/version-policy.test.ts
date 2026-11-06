import { describe, expect, it } from 'vitest'
import { alignedPackageNames, assertVersionPolicy, assertUnusedAlignedVersions } from './version-policy.mjs'
const policy = () => ({ cesium: '~1.147.0', manifests: {
  ...Object.fromEntries(alignedPackageNames.map(name => [name, { version: '1.147.1' }])),
  'cesium-mcp-webmcp': { version: '1.0.1', dependencies: { 'cesium-mcp-bridge': '~1.147.1' } },
} })
describe('Cesium-aligned version policy', () => {
  it('keeps MCP feature releases on the verified Cesium minor', () => {
    expect(assertVersionPolicy(policy())).toBe('1.147.1')
    expect(assertVersionPolicy({ ...policy(), releases: alignedPackageNames.map(name => ({ name, newVersion: '1.147.2' })) })).toBe('1.147.2')
  })
  it.each(['2.0.0', '1.148.0'])('rejects an accidental %s plan before versioning', version => {
    expect(() => assertVersionPolicy({ ...policy(), releases: alignedPackageNames.map(name => ({ name, newVersion: version })) })).toThrow(/does not track/)
  })
  it('allows a verified renderer minor upgrade with an aligned release plan', () => {
    expect(assertVersionPolicy({ ...policy(), cesium: '~1.148.0', releases: alignedPackageNames.map(name => ({ name, newVersion: '1.148.1' })) })).toBe('1.148.1')
  })
  it('prevents the WebMCP range from resolving historical 1.148 or 2.x packages', () => {
    const input = policy()
    input.manifests['cesium-mcp-webmcp'].dependencies['cesium-mcp-bridge'] = '^1.147.1'
    expect(() => assertVersionPolicy(input)).toThrow(/~ Bridge/)
  })
  it('requires the three main packages to stay synchronized', () => {
    const input = policy()
    input.manifests['cesium-mcp-dev'].version = '1.147.2'
    expect(() => assertVersionPolicy(input)).toThrow(/same/)
  })
  it('allows a compatible patch range but rejects a different renderer line', () => {
    const input = policy()
    for (const name of alignedPackageNames) input.manifests[name].version = '1.147.2'
    expect(assertVersionPolicy(input)).toBe('1.147.2')
    input.manifests['cesium-mcp-webmcp'].dependencies['cesium-mcp-bridge'] = '~1.148.0'
    expect(() => assertVersionPolicy(input)).toThrow(/verified Cesium release line/)
  })
  it('blocks reused historical versions and treats registry failures as unavailable, not free', async () => {
    const releases = [{ name: 'cesium-mcp-bridge', newVersion: '1.148.0' }]
    await expect(assertUnusedAlignedVersions(releases, async () => 200)).rejects.toThrow(/already published/)
    await expect(assertUnusedAlignedVersions(releases, async () => 503)).rejects.toThrow(/Cannot verify/)
    await expect(assertUnusedAlignedVersions(releases, async () => 404)).resolves.toBeUndefined()
  })
})
