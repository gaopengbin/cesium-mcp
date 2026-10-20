import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, access, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep, extname } from 'node:path'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { chromium } from 'playwright'
import { WebSocket } from 'ws'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

const root = resolve('.')
const temporary = await mkdtemp(join(tmpdir(), 'cesium-package-telemetry-test-'))
const clients = []
const report = { checks: [], productionCollectorUsed: false }
let worker, browser, site, socket
const waitFor = async (predicate, timeout = 65000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await predicate()) return; await new Promise(done => setTimeout(done, 250)) }
  throw new Error('Timed out waiting for local telemetry')
}
const freePort = async () => {
  const server = createServer()
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const port = server.address().port
  await new Promise(done => server.close(done))
  return port
}
try {
  const bundle = await build({ entryPoints: ['examples/browser-agent/_worker.js'], bundle: true, format: 'esm', write: false, target: 'es2022' })
  worker = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-04-20', port: 0, d1Databases: ['RATE_LIMIT_DB'], bindings: { TELEMETRY_ADMIN_TOKEN: 'local-test-only' } })
  const db = await worker.getD1Database('RATE_LIMIT_DB')
  for (const sql of (await readFile('examples/browser-agent/package-telemetry.sql', 'utf8')).split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(sql).run()
  const collector = new URL('/api/package-telemetry', await worker.ready).href
  const active = async product => Number(await db.prepare("SELECT COUNT(*) FROM npm_usage WHERE product=? AND event='tool'").bind(product).first('COUNT(*)')) > 0
  const launch = async (product, extraEnv = {}, args = []) => {
    const client = new Client({ name: 'local-telemetry-check', version: '1.0.0' })
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(root, `packages/cesium-mcp-${product}/dist/${product === 'runtime' ? 'cli' : 'index'}.js`), ...args],
      cwd: root, stderr: 'pipe',
      env: { ...process.env, CI: '', NODE_ENV: 'production', DO_NOT_TRACK: '', CESIUM_TELEMETRY_DISABLED: '', CESIUM_AUTH_TOKEN: '', CESIUM_ION_TOKEN: '', CESIUM_TOOLSETS: 'view,entity,layer,interaction', LOCALAPPDATA: temporary, XDG_STATE_HOME: temporary, CESIUM_TELEMETRY_ENDPOINT: collector, ...extraEnv },
    })
    let stderr = ''
    transport.stderr?.on('data', chunk => { stderr += chunk.toString() })
    clients.push(client)
    await client.connect(transport)
    return { client, stderr: () => stderr }
  }
  const wsPort = await freePort()
  const runtime = await launch('runtime', { CESIUM_WS_PORT: String(wsPort) })
  socket = new WebSocket(`ws://127.0.0.1:${wsPort}/?session=usage-check`)
  socket.on('message', bytes => {
    const message = JSON.parse(bytes.toString())
    socket.send(JSON.stringify({ id: message.id, result: { success: true, data: { longitude: 10, latitude: 20, height: 300, heading: 0, pitch: -90, roll: 0 } } }))
  })
  await new Promise((done, reject) => { socket.once('open', done); socket.once('error', reject) })
  assert.notEqual((await runtime.client.callTool({ name: 'getView', arguments: { sessionId: 'usage-check' } })).isError, true)
  await waitFor(() => active('runtime'))
  assert.match(runtime.stderr(), /Usage statistics ON/)
  assert.match(runtime.stderr(), /CESIUM_TELEMETRY_DISABLED=1/)
  report.checks.push('runtime default-on disclosure, stdio protocol, map connection and successful tool counters')

  const dev = await launch('dev')
  assert.notEqual((await dev.client.callTool({ name: 'cesium_api_lookup', arguments: { query: 'Viewer' } })).isError, true)
  await waitFor(() => active('dev'))
  assert.match(dev.stderr(), /Usage statistics ON/)
  report.checks.push('dev default-on disclosure and real MCP tool counter')

  const before = Number(await db.prepare('SELECT SUM(count) FROM npm_usage').first('SUM(count)'))
  for (const mode of ['environment', 'flag']) {
    const folder = join(temporary, mode)
    const disabled = await launch('dev', { LOCALAPPDATA: folder, XDG_STATE_HOME: folder, ...(mode === 'environment' ? { CESIUM_TELEMETRY_DISABLED: '1' } : {}) }, mode === 'flag' ? ['--no-telemetry'] : [])
    await disabled.client.callTool({ name: 'cesium_api_lookup', arguments: { query: 'Viewer' } })
    await new Promise(done => setTimeout(done, 1300))
    assert.doesNotMatch(disabled.stderr(), /Usage statistics ON/)
    await assert.rejects(access(join(folder, 'cesium-mcp', 'telemetry-id')))
    await disabled.client.close()
  }
  assert.equal(Number(await db.prepare('SELECT SUM(count) FROM npm_usage').first('SUM(count)')), before)
  report.checks.push('environment and CLI opt-outs: tools still work, no new ID or events')

  const vendor = join(root, 'node_modules/cesium/Build/Cesium')
  site = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.end('<html><head><style>html,body,#map{margin:0;width:100%;height:100%}</style><script src="/cesium/Cesium.js"></script><script src="/bridge.js"></script><script src="/webmcp.js"></script></head><body><div id="map"></div><script>window.v=new Cesium.Viewer("map",{baseLayer:false,terrainProvider:new Cesium.EllipsoidTerrainProvider(),animation:false,timeline:false,geocoder:false,baseLayerPicker:false});</script></body></html>')
      return
    }
    const file = path === '/bridge.js' ? join(root, 'packages/cesium-mcp-bridge/dist/cesium-mcp-bridge.browser.global.js') : path === '/webmcp.js' ? join(root, 'packages/cesium-mcp-webmcp/dist/cesium-mcp-webmcp.browser.global.js') : resolve(vendor, '.' + path.slice('/cesium'.length))
    if (!['/bridge.js', '/webmcp.js'].includes(path) && (!path.startsWith('/cesium/') || !file.startsWith(vendor + sep))) { res.writeHead(404); res.end(); return }
    try { res.setHeader('Content-Type', { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' }[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)) }
    catch { res.writeHead(404); res.end() }
  })
  await new Promise(done => site.listen(0, '127.0.0.1', done))
  const siteUrl = `http://127.0.0.1:${site.address().port}/`
  browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), headless: true, args: ['--enable-unsafe-swiftshader'] })
  const page = await browser.newPage()
  const notices = []
  page.on('console', message => { if (message.text().includes('Usage statistics ON')) notices.push(message.text()) })
  await page.goto(siteUrl)
  await page.waitForFunction(() => window.v && window.CesiumMcpWebMcp)
  const results = await page.evaluate(async endpoint => {
    const bridge = new CesiumMcpBridge.CesiumBridge(v, { telemetry: { endpoint } })
    const direct = await bridge.execute({ action: 'getView', params: {} })
    bridge.dispose()
    const underlying = new CesiumMcpBridge.CesiumBridge(v, { telemetry: false })
    const tools = []
    const registration = await CesiumMcpWebMcp.registerCesiumWebMcp(underlying, { telemetry: { endpoint }, modelContext: { async registerTool(tool) { tools.push(tool) } }, toolsets: 'all' })
    const web = await tools.find(tool => tool.name === 'getView').execute({})
    registration.unregister()
    underlying.dispose()
    return { bridge: direct.success, webmcp: web.success }
  }, collector)
  assert.deepEqual(results, { bridge: true, webmcp: true })
  await waitFor(async () => await active('bridge') && await active('webmcp'))
  assert.equal(notices.length, 2)
  report.checks.push('real Cesium browser Bridge and WebMCP: default-on disclosure, success counters and disposal flush')

  const disabledPage = await browser.newPage()
  await disabledPage.addInitScript(() => { globalThis.CESIUM_MCP_TELEMETRY_DISABLED = true })
  let statisticsRequests = 0
  disabledPage.on('request', request => { if (request.url().includes('/api/package-telemetry')) statisticsRequests++ })
  await disabledPage.goto(siteUrl)
  await disabledPage.evaluate(async () => { const bridge = new CesiumMcpBridge.CesiumBridge(v); await bridge.execute({ action: 'getView', params: {} }); bridge.dispose() })
  await new Promise(done => setTimeout(done, 1300))
  assert.equal(statisticsRequests, 0)
  assert.equal(await disabledPage.evaluate(() => localStorage.getItem('cesium-mcp.telemetry-id')), null)
  report.checks.push('browser global opt-out: zero requests, no localStorage ID, working tools')

  const summary = await fetch(collector + '?days=7', { headers: { Authorization: 'Bearer local-test-only' } })
  assert.equal(summary.status, 200)
  report.summary = await summary.json()
  assert.equal(report.summary.products.length, 4)
  assert.equal((await fetch(collector)).status, 401)
  report.success = true
} catch (error) {
  report.success = false
  report.failure = error.stack
  process.exitCode = 1
} finally {
  socket?.close()
  await Promise.allSettled(clients.map(client => client.close()))
  await browser?.close()
  if (site) { site.closeAllConnections(); await new Promise(done => site.close(done)) }
  await worker?.dispose()
  await mkdir('artifacts/package-telemetry', { recursive: true })
  await writeFile('artifacts/package-telemetry/local-integration.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep) || !temporary.includes('cesium-package-telemetry-test-')) throw new Error('Unexpected cleanup target')
  await rm(temporary, { recursive: true, force: true })
}
