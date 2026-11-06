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
  const weak = bimFixture({ emissiveStrength: 1 }), strong = bimFixture({ emissiveStrength: 5 })
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
    if (path === '/weak.json' || path === '/strong.json') { res.setHeader('Content-Type', 'application/json'); const doc = structuredClone(fixture.tileset); doc.root.content.uri = path === '/weak.json' ? 'weak.b3dm' : 'strong.b3dm'; res.end(JSON.stringify(doc)); return }
    if (path === '/weak.b3dm' || path === '/strong.b3dm') { res.setHeader('Content-Type', 'application/octet-stream'); res.end(path === '/weak.b3dm' ? weak.b3dm : strong.b3dm); return }
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
      if (url.pathname.endsWith('/tree/children')) {
        data = { nodes: [{ key: 'model-key', label: 'QA model', hasChildren: true, kind: 'model', id: '1' }] }
      } else if (url.pathname.endsWith('/tree/parents')) {
        assert.equal(url.searchParams.get('elementId'), bimIds[0])
        data = { path: [{ kind: 'model', id: '1' }, { kind: 'element', id: bimIds[0] }] }
      } else if (url.pathname.endsWith('/ecef')) {
        assert.equal(url.pathname, '/assets/42/ecef')
        data = { ecefTransform: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]] }
      } else if (url.pathname.endsWith('/snap')) {
        assert.ok(url.pathname.startsWith('/assets/42/'))
        assert.ok(url.pathname.endsWith(`/elements/0x${BigInt(bimIds[0]).toString(16)}/snap`))
        assert.equal(request.method(), 'POST')
        const body = request.postDataJSON()
        assert.equal(body.worldToView.length, 4)
        const location = bimElements[0].location.center
        assert.ok(Math.abs(body.testPoint.longitude - location.longitude) < .00001)
        data = { heat: 1, geomType: 2, snapPoint: location, hitPoint: location }
      } else if (url.pathname.endsWith('/elements/aggregate')) {
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
  report.renderer = await page.evaluate(() => Cesium.VERSION)
  assert.match(report.renderer, /^1\.147(?:\.0)?$/)
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
  assert.equal((await call('getBimTree', { layerId: 'qa-bim' })).nodes[0].key, 'model-key')
  assert.equal((await call('getBimTree', { layerId: 'qa-bim', nodeKey: 'model-key' })).nodes[0].kind, 'model')
  assert.equal((await call('getBimElementParents', { layerId: 'qa-bim', elementId: bimIds[0] })).path[1].id, bimIds[0])
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
  const snapped = await call('snapToGeometry', { ...point, width: 25 })
  assert.equal(snapped.snapped, true)
  const otherPoint = await page.evaluate(location => {
    const p = Cesium.SceneTransforms.worldToWindowCoordinates(v.scene, Cesium.Cartesian3.fromDegrees(location.longitude, location.latitude, location.height))
    return [p.x, p.y]
  }, bimElements[1].location.center)
  const measured = await call('measureSnappedDistance', { points: [[point.x, point.y], otherPoint] })
  assert.equal(measured.unit, 'm')
  assert.ok(measured.value > 40 && measured.value < 80)
  const precise = await call('snapBimElement', { layerId: 'qa-bim', elementId: bimIds[0], position: [bimElements[0].location.center.longitude, bimElements[0].location.center.latitude, bimElements[0].location.center.height] })
  assert.equal(precise.snapped, true)
  await call('setTilesetOptions', { layerId: 'qa-bim', vectorBlendOption: 'opaque', cacheBytes: 1048576, maximumCacheOverflowBytes: 1048576, pointCloudBackFaceCulling: true, dynamicEnvironmentMapEnabled: true })
  assert.equal(await page.evaluate(() => b.layerManager.getCesiumRefs('qa-bim').tileset.vectorBlendOption), 0)
  await page.evaluate(() => {
    window.visibleUnloads = 0
    b.layerManager.getCesiumRefs('qa-bim').tileset.tileUnload.addEventListener(() => { window.visibleUnloads++ })
  })
  await call('setTilesetOptions', { layerId: 'qa-bim', cacheBytes: 0, maximumCacheOverflowBytes: 0 })
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => window.visibleUnloads), 0)
  report.checks.push('Cesium 1.147: native scene snapping and 3D measurement, model tree/lineage, official IonSnapService HTTP contract, vector blend/cache/lighting options')
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
  const sdk = await page.evaluate(async () => {
    const service = new Cesium.IonAssetElementService({ assetId: 42, resource: new Cesium.Resource({ url: 'https://api.cesium.com/v1/assets/42/', headers: { Authorization: 'Bearer synthetic-local-only' } }) })
    const sum = await service.aggregate({ propertyKeys: ['Quantity.Net Volume'] })
    const tree = await service.getElementTreeChildren()
    return { sum: sum.aggregations[0].sum, treeKey: tree.nodes[0].key }
  })
  assert.deepEqual(sdk, { sum: 30, treeKey: 'model-key' })
  report.checks.push('Server-side filter → actual feature visibility, clear → original colors/visibility, and WebMCP aggregate parity')
  await call('addGeoJsonPrimitive', { id: 'qa-buffers', flyTo: false, allowPicking: true, blendOption: 'opaque', pickMetadata: { tag: 'native-pickObject' }, data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'QA batch line' }, geometry: { type: 'LineString', coordinates: [[116.4, 39.9, 100], [116.401, 39.901, 100]] } }] } })
  const updated = await call('updateVectorCollection', { layerId: 'qa-buffers', collection: 'polylines', primitiveOffset: 0, primitiveCount: 1, positions: [[116.4, 39.9, 110], [116.401, 39.901, 110]], blendOption: 'translucent' })
  assert.equal(updated.updatedPrimitives, 1)
  const metadata = await page.evaluate(() => {
    const primitive = b.layerManager.getCesiumRefs('qa-buffers').primitive
    const pick = primitive.polylines.get(0, new Cesium.BufferPolyline()).pickObject
    return b.layerManager.selectTileFeature(pick)
  })
  assert.equal(metadata.properties.tag, 'native-pickObject')
  await call('removeLayer', { id: 'qa-buffers' })
  const location = bimElements[0].location.center
  const ring = [[location.longitude - .001, location.latitude - .001], [location.longitude + .001, location.latitude - .001], [location.longitude + .001, location.latitude + .001], [location.longitude - .001, location.latitude + .001]]
  await call('setClippingPolygons', { layerId: 'qa-bim', polygons: [{ positions: ring, holes: [ring.map(([x, y]) => [location.longitude + (x - location.longitude) / 100, location.latitude + (y - location.latitude) / 100])] }] })
  assert.equal(await page.evaluate(() => b.layerManager.getCesiumRefs('qa-bim').tileset.clippingPolygons.length), 1)
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(output, 'clipping.png') })
  await call('setClippingPolygons', { layerId: 'qa-bim', clear: true })
  report.checks.push('Native owned vector setPositions and pre-render pickObject metadata, real polygon clipping with holes, clear clipping')
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
  await call('setLayerVisibility', { id: 'qa-bim', visible: false })
  await page.evaluate(() => { v.scene.highDynamicRange = false })
  const reds = []
  for (const name of ['weak', 'strong']) {
    await call('load3dTiles', { id: 'qa-emissive', url: `${origin}/${name}.json`, flyTo: false })
    await page.waitForFunction(() => b.layerManager.getCesiumRefs('qa-emissive').tileset.root.content?.featuresLength === 2)
    await page.waitForTimeout(150)
    const bytes = await page.screenshot({ path: join(output, `emissive-${name}.png`) })
    reds.push(await page.evaluate(async ({ bytes, point }) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0)
      return context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data[0]
    }, { bytes: [...bytes], point }))
  }
  assert.ok(reds[1] > reds[0] + 20, `Emissive strength should brighten rendered pixels: ${reds}`)
  report.emissiveRedChannel = { weak: reds[0], strong: reds[1] }
  report.checks.push('KHR_materials_emissive_strength: actual rendered pixel brightness increases from strength 1 to 5')
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
