#!/usr/bin/env node
/** Synchronize published metadata after `changeset version`. */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'))
}

function writeJson(relativePath, value, compact = false) {
  const content = compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)
  writeFileSync(resolve(root, relativePath), `${content}\n`, 'utf8')
}

function updateJson(relativePath, fieldPaths, version, compact = false) {
  const value = readJson(relativePath)
  for (const fieldPath of fieldPaths) {
    const parts = fieldPath.split('.')
    let target = value
    for (const part of parts.slice(0, -1)) target = target[part]
    target[parts.at(-1)] = version
  }
  writeJson(relativePath, value, compact)
  console.log(`  ${relativePath} -> ${version}`)
}

function updateEmbeddedVersion(relativePath, pattern, version) {
  const absolutePath = resolve(root, relativePath)
  const content = readFileSync(absolutePath, 'utf8')
  if (!pattern.test(content)) throw new Error(`Version field not found in ${relativePath}`)
  const updated = content.replace(pattern, `$1"${version}"`)
  if (updated !== content) writeFileSync(absolutePath, updated, 'utf8')
  console.log(`  ${relativePath} -> ${version}`)
}

const runtimeVersion = readJson('packages/cesium-mcp-runtime/package.json').version
const devVersion = readJson('packages/cesium-mcp-dev/package.json').version

console.log('Synchronizing published server metadata')

updateJson('packages/cesium-mcp-runtime/server.json', ['version', 'packages.0.version'], runtimeVersion)
updateJson('packages/cesium-mcp-dev/server.json', ['version', 'packages.0.version'], devVersion)
updateEmbeddedVersion(
  'tools-meta.json',
  /("serverInfo"\s*:\s*\{[^}]*"version"\s*:\s*)"[^"]+"/,
  runtimeVersion,
)
updateJson('worker/server-card.json', ['serverInfo.version'], runtimeVersion)
updateJson('worker/dev-server-card.json', ['serverInfo.version'], devVersion, true)

console.log('Done.')
