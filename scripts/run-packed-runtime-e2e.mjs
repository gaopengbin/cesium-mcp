import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const npmCli = process.env.npm_execpath
  ?? resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const requestedRuntime = process.argv[2] === '--runtime' ? process.argv[3] : undefined
const temp = await mkdtemp(join(tmpdir(), 'cesium-mcp-packed-e2e-'))
const artifactsDir = join(temp, 'artifacts')
const installDir = join(temp, 'install')
const cesiumDir = resolve(root, 'node_modules', 'cesium', 'Build', 'Cesium')

let runtime
let browser
let runtimeStdout = ''
let runtimeStderr = ''
const pageErrors = []

async function runNpm(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [npmCli, ...args], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr })
      else rejectPromise(new Error(`npm ${args[0]} exited with code ${code}:\n${stderr}`))
    })
  })
}

async function getFreePort() {
  const server = createServer()
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise(resolvePromise => server.close(resolvePromise))
  if (!port) throw new Error('Failed to allocate a local E2E port')
  return port
}

async function installRuntime() {
  if (requestedRuntime) {
    await runNpm([
      'install',
      '--prefix', installDir,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      requestedRuntime,
    ])
    return
  }

  await mkdir(artifactsDir, { recursive: true })
  const { stdout } = await runNpm([
    'pack',
    './packages/cesium-mcp-contracts',
    './packages/cesium-mcp-runtime',
    '--pack-destination', artifactsDir,
    '--json',
  ])
  const packed = JSON.parse(stdout)
  const contracts = packed.find(item => item.name === 'cesium-mcp-contracts')
  const runtimePackage = packed.find(item => item.name === 'cesium-mcp-runtime')
  if (!contracts || !runtimePackage) throw new Error('npm pack omitted a required package')

  await runNpm([
    'install',
    '--prefix', installDir,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    join(artifactsDir, contracts.filename),
    join(artifactsDir, runtimePackage.filename),
  ])
}

async function waitForRuntime(baseUrl) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (runtime.exitCode !== null) {
      throw new Error(`Runtime exited early with code ${runtime.exitCode}`)
    }
    try {
      const response = await fetch(`${baseUrl}/api/status`)
      if (response.ok) return response.json()
    } catch {
      // Runtime is still starting.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error(`Timed out waiting for Runtime at ${baseUrl}`)
}

function contentType(path) {
  return {
    '.css': 'text/css',
    '.gif': 'image/gif',
    '.glsl': 'text/plain',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
    '.xml': 'application/xml',
  }[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true })
  } catch (error) {
    if (process.platform !== 'win32') throw error
    return chromium.launch({ channel: 'chrome', headless: true })
  }
}

async function postCommand(baseUrl, sessionId, action, params = {}) {
  const response = await fetch(`${baseUrl}/api/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params, sessionId }),
  })
  const payload = await response.json()
  if (!response.ok || !payload.ok) {
    throw new Error(`${action} failed: ${JSON.stringify(payload)}`)
  }
  return payload.result
}

try {
  await installRuntime()

  const runtimePackagePath = join(
    installDir,
    'node_modules',
    'cesium-mcp-runtime',
    'package.json',
  )
  const runtimePackage = JSON.parse(await readFile(runtimePackagePath, 'utf8'))
  const runtimeEntry = join(
    installDir,
    'node_modules',
    'cesium-mcp-runtime',
    'dist',
    'cli.js',
  )
  const bundledBridge = join(
    installDir,
    'node_modules',
    'cesium-mcp-runtime',
    'dist',
    'cesium-mcp-bridge.browser.global.js',
  )
  await stat(runtimeEntry)
  await stat(bundledBridge)

  const viewerPort = await getFreePort()
  const mcpPort = await getFreePort()
  const baseUrl = `http://127.0.0.1:${viewerPort}`
  const sessionId = 'packed-e2e'

  runtime = spawn(
    process.execPath,
    [runtimeEntry, '--transport', 'http', '--port', String(mcpPort)],
    {
      cwd: installDir,
      env: {
        ...process.env,
        CESIUM_WS_PORT: String(viewerPort),
        MCP_TRANSPORT: 'http',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  runtime.stdout.on('data', chunk => { runtimeStdout += chunk.toString() })
  runtime.stderr.on('data', chunk => { runtimeStderr += chunk.toString() })

  await waitForRuntime(baseUrl)

  const [viewerResponse, bundleResponse, toolsResponse] = await Promise.all([
    fetch(`${baseUrl}/?session=${sessionId}`),
    fetch(`${baseUrl}/bridge.js`),
    fetch(`${baseUrl}/api/tools?toolsets=view`),
  ])
  const viewerHtml = await viewerResponse.text()
  const bundleSource = await bundleResponse.text()
  const toolsPayload = await toolsResponse.json()
  const flyTo = toolsPayload.tools.find(tool => tool.name === 'flyTo')

  if (!viewerResponse.ok || !viewerHtml.includes('Cesium MCP Viewer')) {
    throw new Error('Packed Runtime did not serve the built-in Viewer')
  }
  if (!bundleResponse.ok || !bundleSource.includes('CesiumMcpBridge')) {
    throw new Error('Packed Runtime did not serve its local browser Bridge bundle')
  }
  if (!flyTo?.outputSchema?.required?.includes('success')) {
    throw new Error('Packed Runtime did not expose the canonical flyTo output schema')
  }

  browser = await launchBrowser()
  const context = await browser.newContext()
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === baseUrl) {
      await route.continue()
      return
    }

    const marker = '/Build/Cesium/'
    if (url.hostname === 'cesium.com' && url.pathname.includes(marker)) {
      const resource = decodeURIComponent(url.pathname.split(marker)[1] ?? '')
      const localPath = resolve(cesiumDir, ...resource.split('/'))
      const relativePath = relative(cesiumDir, localPath)
      if (
        relativePath === '..'
        || relativePath.startsWith(`..${sep}`)
        || isAbsolute(relativePath)
      ) {
        await route.abort()
        return
      }
      try {
        await route.fulfill({
          body: await readFile(localPath),
          contentType: contentType(localPath),
        })
      } catch {
        await route.abort()
      }
      return
    }

    await route.abort()
  })

  const page = await context.newPage()
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(`${baseUrl}/?session=${sessionId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  })
  await page.waitForFunction(
    () => document.querySelector('#s')?.textContent === 'Connected',
    undefined,
    { timeout: 30_000 },
  )

  const setViewResult = await postCommand(baseUrl, sessionId, 'setView', {
    longitude: 116.3972,
    latitude: 39.9163,
    height: 1200,
    heading: 0,
    pitch: -90,
  })
  const getViewResult = await postCommand(baseUrl, sessionId, 'getView')
  const view = getViewResult?.data
  if (!setViewResult?.success || !getViewResult?.success) {
    throw new Error(
      `Packed Viewer command execution did not succeed: ${JSON.stringify({
        setViewResult,
        getViewResult,
      })}`,
    )
  }
  if (
    Math.abs(view.longitude - 116.3972) > 0.01
    || Math.abs(view.latitude - 39.9163) > 0.01
  ) {
    throw new Error(`Packed Viewer returned an unexpected camera state: ${JSON.stringify(view)}`)
  }

  console.log(JSON.stringify({
    runtime: runtimePackage.version,
    source: requestedRuntime ?? 'local npm pack',
    viewer: 'connected',
    bridge: 'local bundle',
    tools: toolsPayload.tools.length,
    command: 'setView -> getView',
  }))
} catch (error) {
  console.error(error)
  if (pageErrors.length > 0) console.error(`Page errors:\n${pageErrors.join('\n')}`)
  if (runtimeStdout) console.error(`Runtime stdout:\n${runtimeStdout}`)
  if (runtimeStderr) console.error(`Runtime stderr:\n${runtimeStderr}`)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  if (runtime && runtime.exitCode === null) {
    runtime.kill()
    await new Promise(resolvePromise => runtime.once('exit', resolvePromise))
  }
  await rm(temp, { recursive: true, force: true })
}
