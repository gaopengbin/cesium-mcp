import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const file = 'cesium-mcp-bridge.browser.global.js'
const source = join(root, 'packages', 'cesium-mcp-bridge', 'dist', file)
const target = join(root, 'packages', 'cesium-mcp-runtime', 'dist', file)

await stat(source).catch(() => {
  throw new Error(`Build cesium-mcp-bridge before cesium-mcp-runtime: ${source}`)
})
await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)

console.log(`Copied browser Bridge bundle to ${target}`)
