import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alignedPackageNames, assertVersionPolicy } from './version-policy.mjs'

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export function readVersionPolicy() {
  const root = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'))
  const manifests = Object.fromEntries([...alignedPackageNames, 'cesium-mcp-webmcp'].map(name => [name, JSON.parse(readFileSync(resolve(repositoryRoot, 'packages', name, 'package.json'), 'utf8'))]))
  return { cesium: root.devDependencies.cesium, manifests }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Cesium-aligned version policy verified: ${assertVersionPolicy(readVersionPolicy())}`)
}
