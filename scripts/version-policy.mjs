export const alignedPackageNames = ['cesium-mcp-bridge', 'cesium-mcp-runtime', 'cesium-mcp-dev']

/** Validate the effective release, including Changesets' proposed versions. */
export function assertVersionPolicy({ cesium, manifests, releases = [] }) {
  const match = /^~(\d+)\.(\d+)\.\d+$/.exec(cesium)
  if (!match) throw new Error('Use an explicit verified Cesium baseline such as ~1.147.0')
  const prefix = `${match[1]}.${match[2]}.`
  const versions = alignedPackageNames.map(name => {
    const version = releases.find(release => release.name === name)?.newVersion ?? manifests[name]?.version
    if (typeof version !== 'string' || !version.startsWith(prefix) || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error(`${name}@${version} does not track Cesium ${cesium}. MCP-only changes must use patch changesets; renderer upgrades require an explicitly aligned version.`)
    }
    return version
  })
  if (new Set(versions).size !== 1) throw new Error('Bridge, Runtime and Dev must share the same Cesium-aligned version')
  const web = manifests['cesium-mcp-webmcp']
  if (web && !/^~\d+\.\d+\.\d+$/.test(web.dependencies?.['cesium-mcp-bridge'] ?? '')) {
    throw new Error('WebMCP must use a ~ Bridge dependency, excluding unrelated historical minor versions')
  }
  if (!releases.length && web && web.dependencies['cesium-mcp-bridge'] !== `~${versions[0]}`) {
    throw new Error('WebMCP Bridge dependency must match the coordinated release')
  }
  return versions[0]
}

export async function assertUnusedAlignedVersions(releases, check) {
  for (const release of releases.filter(item => alignedPackageNames.includes(item.name))) {
    const status = await check(release.name, release.newVersion)
    if (status === 200) throw new Error(`${release.name}@${release.newVersion} is already published; choose an unused patch on the verified Cesium baseline`)
    if (status !== 404) throw new Error(`Cannot verify publication availability for ${release.name}: HTTP ${status}`)
  }
}
