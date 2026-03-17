#!/usr/bin/env node
/**
 * sync-version.mjs — Sync version from root package.json to all satellite files.
 *
 * Usage: node scripts/sync-version.mjs
 *
 * Files handled by this script (JSON / config files that can't dynamically read version):
 *   - packages/cesium-mcp-bridge/package.json
 *   - packages/cesium-mcp-dev/package.json
 *   - packages/cesium-mcp-runtime/package.json
 *   - packages/cesium-mcp-runtime/server.json   (2 fields)
 *   - packages/cesium-mcp-dev/server.json        (2 fields)
 *   - tools-meta.json
 *   - worker/server-card.json
 *   - worker/dev-server-card.json
 *
 * Files NOT handled (they read version dynamically):
 *   - packages/cesium-mcp-runtime/src/index.ts   -> tsup define __VERSION__
 *   - packages/cesium-mcp-dev/src/index.ts        -> tsup define __VERSION__
 *   - worker/src/index.js                         -> reads from server-card.json
 *   - docs/.vitepress/config.mts                  -> createRequire package.json
 *   - Dockerfile                                  -> ARG VERSION=latest
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const rootPkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = rootPkg.version

console.log(`Syncing version → ${version}\n`)

// Helper: update JSON file fields by dot-path
function updateJson(relPath, fieldPaths) {
  const absPath = resolve(root, relPath)
  const obj = JSON.parse(readFileSync(absPath, 'utf8'))
  for (const fp of fieldPaths) {
    const parts = fp.split('.')
    let target = obj
    for (let i = 0; i < parts.length - 1; i++) {
      target = target[parts[i]]
    }
    const key = parts[parts.length - 1]
    const old = target[key]
    target[key] = version
    if (old !== version) {
      console.log(`  ${relPath} → ${fp}: ${old} → ${version}`)
    }
  }
  writeFileSync(absPath, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

// 1. Sub-package package.json files
for (const pkg of ['cesium-mcp-bridge', 'cesium-mcp-dev', 'cesium-mcp-runtime']) {
  updateJson(`packages/${pkg}/package.json`, ['version'])
}

// 2. server.json files (each has 2 version fields)
updateJson('packages/cesium-mcp-runtime/server.json', ['version', 'packages.0.version'])
updateJson('packages/cesium-mcp-dev/server.json', ['version', 'packages.0.version'])

// 3. tools-meta.json (use regex to preserve original formatting)
const toolsMetaPath = resolve(root, 'tools-meta.json')
const toolsMetaContent = readFileSync(toolsMetaPath, 'utf8')
const toolsMetaUpdated = toolsMetaContent.replace(
  /("serverInfo"\s*:\s*\{[^}]*"version"\s*:\s*)"[^"]+"/,
  `$1"${version}"`
)
if (toolsMetaUpdated !== toolsMetaContent) {
  writeFileSync(toolsMetaPath, toolsMetaUpdated, 'utf8')
  console.log(`  tools-meta.json → serverInfo.version: → ${version}`)
}

// 4. Worker server cards
updateJson('worker/server-card.json', ['serverInfo.version'])

// Helper for single-line JSON (dev-server-card.json is minified)
const devCardPath = resolve(root, 'worker/dev-server-card.json')
const devCard = JSON.parse(readFileSync(devCardPath, 'utf8'))
const oldDevVer = devCard.serverInfo.version
devCard.serverInfo.version = version
writeFileSync(devCardPath, JSON.stringify(devCard) + '\n', 'utf8')
if (oldDevVer !== version) {
  console.log(`  worker/dev-server-card.json → serverInfo.version: ${oldDevVer} → ${version}`)
}

console.log('\nDone.')
