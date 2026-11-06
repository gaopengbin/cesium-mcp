import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join, extname, sep } from 'node:path'
import { chromium } from 'playwright'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { bimFixture, bimElements, bimIds } from './bim-fixtures.mjs'

const root = resolve('.')
const output = join(root, 'artifacts/bim-workflow')
await mkdir(output, { recursive: true })
const report = { success: false, source: 'synthetic local BIM/CAD fixture using official ion REST shapes; not a live cloud asset', checks: [], requests: [] }
const freePort = async () => {
  const server = createServer()
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const port = server.address().port
  await new Promise(done => server.close(done))
  return port
}
const wsPort = await freePort(), httpPort = await freePort()
let runtime, browser, client, site, stdioClient
try {
  const fixture = bimFixture()
  site = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.end(`<!doctype html><html><head><link rel="stylesheet" href="/cesium/Widgets/widgets.css"><style>html,body,#map{width:100%;height:100%;margin:0}</style><script>window.CESIUM_BASE_URL='/cesium/';window.CESIUM_MCP_TELEMETRY_DISABLED=true</script><script src="/cesium/Cesium.js"></script><script src="/bridge.js"></script><script src="/webmcp.js"></script></head><body><div id="map"></div><script>
      Cesium.Ion.defaultAccessToken='synthetic-local-only';
      window.v=new Cesium.Viewer('map',{baseLayer:false,terrainProvider:new Cesium.EllipsoidTerrainProvider(),animation:false,timeline:false,geocoder:false,baseLayerPicker:false,infoBox:false,selectionIndicator:false,navigationHelpButton:false,homeButton:false,sceneModePicker:false,fullscreenButton:false});
      v.scene.globe.show=false; v.scene.skyAtmosphere.show=false;
      window.b=new CesiumMcpBridge.CesiumBridge(v,{telemetry:false});
      window.ws=new WebSocket('ws://127.0.0.1:${wsPort}/?session=bim-test');
      ws.onmessage=async function(event){const m=JSON.parse(event.data);const result=await b.execute({action:m.method,params:m.params||{}});if(m.id)this.send(JSON.stringify({id:m.id,result}));};
      </script></body></html>`)
      return
    }
    if (path === '/tileset.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fixture.tileset)); return }
    if (path === '/model.b3dm') { res.setHeader('Content-Type', 'application/octet-stream'); res.end(fixture.b3dm); return }
    const vendor = join(root, 'node_modules/cesium/Build/Cesium')
    const file = path === '/bridge.js' ? join(root, 'packages/cesium-mcp-bridge/dist/cesium-mcp-bridge.browser.global.js') : path === '/webmcp.js' ? join(root, 'packages/cesium-mcp-webmcp/dist/cesium-mcp-webmcp.browser.global.js') : resolve(vendor, '.' + path.slice('/cesium'.length))
    if (!['/bridge.js', '/webmcp.js'].includes(path) && (!path.startsWith('/cesium/') || !file.startsWith(vendor + sep))) { res.writeHead(404); res.end(); return }
    try { res.setHeader('Content-Type', { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)) }
    catch { res.writeHead(404); res.end() }
  })
  await new Promise(done => site.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${site.address().port}`
  runtime = spawn(process.execPath, ['packages/cesium-mcp-runtime/dist/cli.js', '--transport', 'http', '--port', String(httpPort)], { env: { ...process.env, CESIUM_TELEMETRY_DISABLED: '1', CESIUM_ION_TOKEN: '', CESIUM_WS_PORT: String(wsPort), CESIUM_TOOLSETS: 'all' }, stdio: ['ignore', 'pipe', 'pipe'] })
  runtime.stdout.resume(); runtime.stderr.resume()
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${wsPort}/api/status`)).ok) break } catch {}
    await new Promise(done => setTimeout(done, 250))
  }
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 } })
  const errors = report.browserErrors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://api.cesium.com/**', async route => {
    const request = route.request(), url = new URL(request.url())
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Cesium-Client, X-Cesium-Client-Version' }
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }
    report.requests.push({ path: url.pathname, filter: url.searchParams.get('filter'), top: url.searchParams.get('top') })
    let data
    if (url.pathname.endsWith('/endpoint')) data = { type: '3DTILES', url: `${origin}/tileset.json`, accessToken: 'synthetic-stream-only', attributions: [] }
    else {
      assert.equal(request.headers().authorization, 'Bearer synthetic-local-only')
      const filter = JSON.parse(url.searchParams.get('filter') ?? '{}')
      const selected = filter['IFC Class Name'] ? bimElements.filter(element => element.properties['IFC Class Name'].value === filter['IFC Class Name']) : bimElements
      if (url.pathname.endsWith('/elements/aggregate')) {
        assert.deepEqual(JSON.parse(url.searchParams.get('aggregations')), ['Quantity.Net Volume'])
        const values = selected.map(element => element.properties['Quantity.Net Volume'].value)
        data = { total: selected.length, aggregations: [{ key: 'Quantity.Net Volume', count: values.length, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, sum: values.reduce((a, b) => a + b, 0) }] }
      } else if (url.pathname.endsWith('/elements')) {
        const offset = Number(url.searchParams.get('continuationToken') ?? 0), top = Number(url.searchParams.get('top') ?? 100)
        data = { items: selected.slice(offset, offset + top), total: selected.length, ...(offset + top < selected.length ? { continuationToken: String(offset + top) } : {}) }
      } else data = bimElements.find(element => url.pathname.endsWith('/' + element.id))
    }
    await route.fulfill({ status: data ? 200 : 404, headers, contentType: 'application/json', body: JSON.stringify(data ?? {}) })
  })
  await page.goto(origin)
  await page.waitForFunction(() => window.ws?.readyState === 1)
  client = new Client({ name: 'bim-local-integration', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${httpPort}/mcp`)))
  const tools = await client.listTools()
  for (const name of ['queryBimElements', 'getBimElement', 'aggregateBimElements', 'focusBimElements', 'selectBimElements', 'filterBimElements', 'clearBimSelection']) assert.ok(tools.tools.some(tool => tool.name === name))
  const call = async (name, params = {}) => {
    const response = await client.callTool({ name, arguments: { sessionId: 'bim-test', ...params } })
    const result = response.structuredContent ?? JSON.parse(response.content.find(item => item.type === 'text').text)
    assert.equal(result.success, true, `${name}: ${result.error}`)
    return result.data
  }
  await call('load3dTiles', { id: 'qa-bim', ionAssetId: 42, flyTo: false, tileStyle: { color: "color('white')" } })
  const pageOne = await call('queryBimElements', { layerId: 'qa-bim', top: 1 })
  assert.equal(pageOne.items[0].id, bimIds[0])
  const pageTwo = await call('queryBimElements', { layerId: 'qa-bim', top: 1, continuationToken: pageOne.continuationToken })
  assert.equal(pageTwo.items[0].id, bimIds[1])
  const detail = await call('getBimElement', { layerId: 'qa-bim', elementId: bimIds[0] })
  assert.equal(detail.properties['Quantity.Net Volume'].units, 'm³')
  const aggregate = await call('aggregateBimElements', { layerId: 'qa-bim', propertyKeys: ['Quantity.Net Volume'] })
  assert.equal(aggregate.total, 2)
  assert.equal(aggregate.aggregations[0].sum, 30)
  report.checks.push('Real MCP HTTP → WebSocket → Bridge → official-shaped REST: exact IDs, cursor pages, property units, whole-model aggregate=30 (not first-page=10)')
  await call('focusBimElements', { layerId: 'qa-bim', elementIds: bimIds, duration: 0 })
  await page.waitForFunction(() => b.layerManager.getCesiumRefs('qa-bim').tileset.root.content?.featuresLength === 2)
  const featureState = () => page.evaluate(() => {
    const content = b.layerManager.getCesiumRefs('qa-bim').tileset.root.content
    return [0, 1].map(i => { const f = content.getFeature(i); return { id: String(f.getProperty('element')), show: f.show, color: [f.color.red, f.color.green, f.color.blue] } })
  })
  await call('selectBimElements', { layerId: 'qa-bim', elementIds: [bimIds[0]], color: '#ff0000' })
  await page.waitForFunction(() => b.layerManager.getCesiumRefs('qa-bim').tileset.root.content.getFeature(0).color.red > .9 && b.layerManager.getCesiumRefs('qa-bim').tileset.root.content.getFeature(0).color.green < .1)
  assert.deepEqual((await featureState())[0].color, [1, 0, 0])
  await page.evaluate(() => {
    const tileset = b.layerManager.getCesiumRefs('qa-bim').tileset
    window.bimTileUnloaded = false
    tileset.tileUnload.addEventListener(() => { window.bimTileUnloaded = true })
    v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(0, 0, 1000) })
    tileset.trimLoadedTiles()
  })
  await page.waitForFunction(() => window.bimTileUnloaded)
  await call('focusBimElements', { layerId: 'qa-bim', elementIds: bimIds, duration: 0 })
  await page.waitForFunction(() => {
    const content = b.layerManager.getCesiumRefs('qa-bim').tileset.root.content
    if (content?.featuresLength !== 2) return false
    return content.getFeature(0).color.green < .1
  })
  assert.deepEqual((await featureState())[0].color, [1, 0, 0])
  report.checks.push('Highlight survives actual tile unload/reload and applies to newly streamed features')
  await page.screenshot({ path: join(output, 'highlight.png') })
  const point = await page.evaluate(location => {
    const p = Cesium.SceneTransforms.worldToWindowCoordinates(v.scene, Cesium.Cartesian3.fromDegrees(location.longitude, location.latitude, location.height))
    return { x: p.x, y: p.y }
  }, bimElements[0].location.center)
  await page.mouse.click(point.x, point.y)
  const picked = await call('getSelectedTileFeature')
  assert.equal(picked.feature.properties.element, bimIds[0])
  assert.equal((await call('getBimElement', { layerId: picked.feature.layerId, elementId: picked.feature.properties.element })).id, bimIds[0])
  report.checks.push('Real rendered b3dm model: camera bounds framing, red feature color, click → exact element ID → property query')
  await call('filterBimElements', { layerId: 'qa-bim', filter: { 'IFC Class Name': 'ifcwall' }, color: '#00ff00' })
  await page.waitForFunction(() => !b.layerManager.getCesiumRefs('qa-bim').tileset.root.content.getFeature(1).show)
  assert.deepEqual((await featureState()).map(f => f.show), [true, false])
  await page.screenshot({ path: join(output, 'filtered.png') })
  await call('clearBimSelection', { layerId: 'qa-bim' })
  await page.waitForFunction(() => b.layerManager.getCesiumRefs('qa-bim').tileset.root.content.getFeature(1).show)
  assert.deepEqual((await featureState())[0].color, [1, 1, 1])
  const web = await page.evaluate(async () => {
    const tools = CesiumMcpWebMcp.buildCesiumWebMcpTools(b, { toolsets: 'bim' })
    return tools.find(tool => tool.name === 'aggregateBimElements').execute({ layerId: 'qa-bim', propertyKeys: ['Quantity.Net Volume'] })
  })
  assert.equal(web.data.aggregations[0].sum, 30)
  report.checks.push('Server-side filter → actual feature visibility, clear → original colors/visibility, and WebMCP aggregate parity')
  const stdioWsPort = await freePort()
  stdioClient = new Client({ name: 'bim-stdio-discovery', version: '1.0.0' })
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'packages/cesium-mcp-runtime/dist/cli.js')], stderr: 'pipe', env: { ...process.env, CESIUM_TELEMETRY_DISABLED: '1', CESIUM_ION_TOKEN: '', CESIUM_WS_PORT: String(stdioWsPort), CESIUM_TOOLSETS: 'view,entity,layer,interaction' } })
  transport.stderr?.resume()
  await stdioClient.connect(transport)
  assert.ok(!(await stdioClient.listTools()).tools.some(tool => tool.name === 'queryBimElements'))
  await stdioClient.callTool({ name: 'enable_toolset', arguments: { toolset: 'bim' } })
  assert.ok((await stdioClient.listTools()).tools.some(tool => tool.name === 'queryBimElements'))
  await page.evaluate(port => new Promise((done, reject) => {
    window.ws2 = new WebSocket(`ws://127.0.0.1:${port}/?session=bim-test`)
    ws2.onmessage = ws.onmessage
    ws2.onopen = done
    ws2.onerror = reject
  }), stdioWsPort)
  const stdioResult = await stdioClient.callTool({ name: 'queryBimElements', arguments: { sessionId: 'bim-test', layerId: 'qa-bim', top: 1 } })
  const stdioData = stdioResult.structuredContent ?? JSON.parse(stdioResult.content.find(item => item.type === 'text').text)
  assert.equal(stdioData.data.items[0].id, bimIds[0])
  report.checks.push('MCP stdio: optional BIM toolset discovery, enable_toolset, browser routing and real query')
  assert.deepEqual(errors, [])
  report.success = true
} catch (error) { report.error = error.stack; process.exitCode = 1 }
finally {
  await client?.close().catch(() => {})
  await stdioClient?.close().catch(() => {})
  await browser?.close()
  if (runtime && runtime.exitCode === null) { runtime.kill(); await new Promise(done => runtime.once('exit', done)) }
  if (site) { site.closeAllConnections(); await new Promise(done => site.close(done)) }
  await writeFile(join(output, 'local-integration.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
