import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const port = Number.parseInt(process.env.CESIUM_MCP_CONFORMANCE_PORT ?? '19100', 10)
const baseUrl = `http://127.0.0.1:${port}`
const outputDir = await mkdtemp(join(tmpdir(), 'cesium-mcp-conformance-'))
const runtimeEntry = resolve('packages/cesium-mcp-runtime/dist/cli.js')
const conformanceEntry = resolve('node_modules/@modelcontextprotocol/conformance/dist/index.js')

const runtime = spawn(process.execPath, [runtimeEntry], {
  env: {
    ...process.env,
    CESIUM_MCP_CONFORMANCE: '1',
    CESIUM_WS_PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

runtime.stdout.pipe(process.stdout)
runtime.stderr.pipe(process.stderr)

async function waitForRuntime() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (runtime.exitCode !== null) {
      throw new Error(`cesium-mcp-runtime exited early with code ${runtime.exitCode}`)
    }
    try {
      const response = await fetch(`${baseUrl}/api/status`)
      if (response.ok) return
    } catch {
      // Runtime is still starting.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error(`Timed out waiting for cesium-mcp-runtime on port ${port}`)
}

function runConformance() {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [
      conformanceEntry,
      'server',
      '--url',
      `${baseUrl}/mcp`,
      '--scenario',
      'server-stateless',
      '--spec-version',
      '2026-07-28',
      '--output-dir',
      outputDir,
    ], {
      stdio: 'inherit',
    })

    child.on('error', rejectPromise)
    child.on('exit', code => {
      if (code === 0) resolvePromise()
      else rejectPromise(new Error(`MCP conformance exited with code ${code}`))
    })
  })
}

try {
  await waitForRuntime()
  await runConformance()
} finally {
  runtime.kill()
  await rm(outputDir, { recursive: true, force: true })
}
