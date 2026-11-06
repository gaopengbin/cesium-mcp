import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { resolve, join, extname, sep } from 'node:path'
import { chromium } from 'playwright'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import * as Cesium from 'cesium'

const root = resolve('.')
const arg = name => process.argv[process.argv.indexOf(name) + 1]
const publicSample = process.argv.includes('--public-sample')
const assetId = Number(process.argv.includes('--asset') ? arg('--asset') : 6093105)
assert.ok(Number.isSafeInteger(assetId) && assetId > 0)
if (publicSample) assert.ok([6093105, 6093184, 5161569].includes(assetId), 'Public mode is limited to documented official tutorial assets')
const token = publicSample ? Cesium.Ion.defaultAccessToken : process.env.CESIUM_ION_TOKEN
assert.ok(token, 'Configure CESIUM_ION_TOKEN locally, or explicitly use --public-sample')
const output = join(root, 'artifacts/bim-live', String(assetId))
await mkdir(output, { recursive: true })
const report = { checkedAt: new Date().toISOString(), assetId, credential: publicSample ? 'Official tutorial CesiumJS public sample token' : 'Locally configured token', syntheticData: false, cloudResponsesIntercepted: false, checks: [], network: [], browserErrors: [], success: false }
const redact = value => String(value).replaceAll(token, '[REDACTED]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]').replace(/access_token=[^&\s]+/g, 'access_token=REDACTED')
const freePort = async () => { const server = createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done)); const port = server.address().port; await new Promise(done => server.close(done)); return port }
const wsPort = await freePort(), httpPort = await freePort()
let browser, page, runtime, site, client
try {
  site = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.end(`<!doctype html><html><head><link rel="stylesheet" href="/cesium/Widgets/widgets.css"><style>html,body,#map{height:100%;width:100%;margin:0}#note{position:fixed;top:12px;left:12px;background:#111b;color:white;padding:8px;pointer-events:none}</style><script>window.CESIUM_BASE_URL='/cesium/';window.CESIUM_MCP_TELEMETRY_DISABLED=true</script><script src="/cesium/Cesium.js"></script><script src="/bridge.js"></script></head><body><div id="map"></div><div id="note">LIVE official ion BIM asset ${assetId}</div><script>
      window.v=new Cesium.Viewer('map',{baseLayer:false,terrainProvider:new Cesium.EllipsoidTerrainProvider(),animation:false,timeline:false,geocoder:false,baseLayerPicker:false,infoBox:false,selectionIndicator:false,navigationHelpButton:false,homeButton:false,sceneModePicker:false});
      v.clock.currentTime=Cesium.JulianDate.fromIso8601('2026-06-21T17:00:00Z');
      window.b=new CesiumMcpBridge.CesiumBridge(v,{telemetry:false});
      window.ws=new WebSocket('ws://127.0.0.1:${wsPort}/?session=bim-live');
      ws.onmessage=async function(e){const m=JSON.parse(e.data);const result=await b.execute({action:m.method,params:m.params||{}});if(m.id)this.send(JSON.stringify({id:m.id,result}));};
      </script></body></html>`)
      return
    }
    const vendor = join(root, 'node_modules/cesium/Build/Cesium')
    const file = path === '/bridge.js' ? join(root, 'packages/cesium-mcp-bridge/dist/cesium-mcp-bridge.browser.global.js') : resolve(vendor, '.' + path.slice('/cesium'.length))
    if (path !== '/bridge.js' && (!path.startsWith('/cesium/') || !file.startsWith(vendor + sep))) { res.writeHead(404); res.end(); return }
    try { res.setHeader('Content-Type', { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)) } catch { res.writeHead(404); res.end() }
  })
  await new Promise(done => site.listen(0, '127.0.0.1', done))
  runtime = spawn(process.execPath, ['packages/cesium-mcp-runtime/dist/cli.js', '--transport', 'http', '--port', String(httpPort)], { env: { ...process.env, CESIUM_TELEMETRY_DISABLED: '1', CESIUM_ION_TOKEN: '', CESIUM_WS_PORT: String(wsPort), CESIUM_TOOLSETS: 'all' }, stdio: ['ignore', 'pipe', 'pipe'] })
  runtime.stdout.resume(); runtime.stderr.resume()
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${wsPort}/api/status`)).ok) break } catch {}; await new Promise(done => setTimeout(done, 250)) }
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
  page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  page.on('pageerror', error => report.browserErrors.push(redact(error.message)))
  page.on('response', response => { const url = new URL(response.url()); if (url.hostname === 'api.cesium.com') report.network.push({ method: response.request().method(), path: url.pathname, status: response.status() }) })
  await page.goto(`http://127.0.0.1:${site.address().port}`)
  await page.evaluate(value => { Cesium.Ion.defaultAccessToken = value }, token)
  await page.waitForFunction(() => ws.readyState === 1)
  report.renderer = await page.evaluate(() => Cesium.VERSION)
  client = new Client({ name: 'real-ion-bim-acceptance', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${httpPort}/mcp`)))
  const invoke = async (name, params = {}) => {
    const response = await client.callTool({ name, arguments: { sessionId: 'bim-live', ...params } })
    if (response.isError) throw new Error(`${name}: ${redact(JSON.stringify(response.content))}`)
    const result = response.structuredContent ?? JSON.parse(response.content.find(item => item.type === 'text').text)
    assert.equal(result.success, true, `${name}: ${redact(result.error)}`)
    return result.data
  }
  const retryableReads = new Set(['queryBimElements', 'getBimElement', 'getBimTree', 'getBimElementParents', 'aggregateBimElements', 'snapBimElement'])
  const call = async (name, params = {}) => {
    for (let attempt = 0; ; attempt++) {
      try { return await invoke(name, params) }
      catch (error) {
        if (attempt >= 2 || !retryableReads.has(name) || !/timed out|HTTP (429|50[234])/.test(error.message)) throw error
        report.retries ??= []
        report.retries.push({ tool: name, retry: attempt + 1, reason: 'Transient cloud timeout/rate limit/server failure' })
        await new Promise(done => setTimeout(done, (attempt + 1) * 1000))
      }
    }
  }
  await call('load3dTiles', { id: 'live-model', ionAssetId: assetId, flyTo: false })
  await page.evaluate(async () => { const tileset=b.layerManager.getCesiumRefs('live-model').tileset; await v.zoomTo(tileset) })
  await page.waitForFunction(() => b.layerManager.getCesiumRefs('live-model').tileset.tilesLoaded, undefined, { timeout: 90000 })
  await page.screenshot({ path: join(output, 'whole-model.png') })
  const one = await call('queryBimElements', { layerId: 'live-model', top: 2 })
  const two = await call('queryBimElements', { layerId: 'live-model', top: 2, continuationToken: one.continuationToken })
  assert.ok(one.total > 2 && new Set([...one.items, ...two.items].map(item => item.id)).size === 4)
  report.totalElements = one.total
  report.checks.push('Real cloud tileset load and cursor pagination through MCP HTTP/WebSocket')
  console.log(`Live asset ${assetId}: ${one.total} elements; pagination passed`)
  const roots = await call('getBimTree', { layerId: 'live-model' })
  assert.ok(roots.nodes.length)
  const children = await call('getBimTree', { layerId: 'live-model', nodeKey: roots.nodes[0].key })
  report.tree = { roots: roots.nodes.length, firstChildren: children.nodes.length }
  const propertyKey = 'Net Volume'
  const filter = { [propertyKey]: { $gt: 0 } }
  const filtered = await call('queryBimElements', { layerId: 'live-model', top: 1000, filter })
  assert.ok(filtered.total > 0)
  const selected = filtered.items.find(item => item.location) ?? filtered.items[0]
  const detail = await call('getBimElement', { layerId: 'live-model', elementId: selected.id })
  assert.ok(detail.location && typeof detail.properties[propertyKey].value === 'number')
  const parents = await call('getBimElementParents', { layerId: 'live-model', elementId: detail.id })
  assert.ok(parents.path.some(node => node.id === detail.id))
  const aggregate = await call('aggregateBimElements', { layerId: 'live-model', propertyKeys: [propertyKey], filter })
  assert.equal(aggregate.total, filtered.total)
  report.quantity = { propertyKey, units: detail.properties[propertyKey].units, matched: aggregate.total, statistics: aggregate.aggregations[0] }
  // Structural sample has a small complete set: independently sum all raw
  // numeric values, not formatted display strings or the first page.
  if (filtered.total <= 100 && !filtered.continuationToken) {
    const values = []
    for (let start = 0; start < filtered.items.length; start += 4) {
      const rows = await Promise.all(filtered.items.slice(start, start + 4).map(item => call('getBimElement', { layerId: 'live-model', elementId: item.id })))
      for (const row of rows) values.push(row.properties[propertyKey].value)
    }
    const total = values.reduce((sum, value) => sum + value, 0)
    assert.ok(Math.abs(total - aggregate.aggregations[0].sum) < 1e-8 * Math.max(1, Math.abs(total)))
    report.quantity.independent = { numericElements: values.length, sum: total, difference: total - aggregate.aggregations[0].sum }
  }
  report.checks.push('Real model tree/lineage, full-property units, server quantity statistics and matched count')
  console.log(`Live quantities: ${aggregate.total} matches, ${aggregate.aggregations[0].sum} ${detail.properties[propertyKey].units}`)
  await call('selectBimElements', { layerId: 'live-model', elementIds: [detail.id], isolate: true, color: '#ff8800' })
  await call('focusBimElements', { layerId: 'live-model', elementIds: [detail.id], duration: 0 })
  await page.waitForFunction(() => b.layerManager.getCesiumRefs('live-model').tileset.tilesLoaded, undefined, { timeout: 90000 })
  await page.waitForTimeout(1000)
  const hit = await page.evaluate(({ location, id }) => {
    const p = Cesium.SceneTransforms.worldToWindowCoordinates(v.scene, Cesium.Cartesian3.fromDegrees(location.center.longitude, location.center.latitude, location.center.height ?? 0))
    const candidates = [[p.x, p.y]]
    for (const radius of [4, 8, 16, 32, 64, 96, 128, 192]) for (let i = 0; i < 32; i++) candidates.push([p.x + Math.cos(i * Math.PI / 16) * radius, p.y + Math.sin(i * Math.PI / 16) * radius])
    let first
    for (const [x, y] of candidates) {
      if (x < 0 || y < 0 || x >= v.scene.canvas.clientWidth || y >= v.scene.canvas.clientHeight) continue
      const feature = v.scene.pick(new Cesium.Cartesian2(x, y))
      if (!feature?.getProperty || String(feature.getProperty('element')) !== id) continue
      const snap = v.scene.snap(new Cesium.Cartesian2(x, y), { width: 40 })
      const toGeo = position => {
        if (!position) return undefined
        const g = Cesium.Cartographic.fromCartesian(position)
        return [Cesium.Math.toDegrees(g.longitude), Cesium.Math.toDegrees(g.latitude), g.height]
      }
      const result = { x, y, color: [feature.color.red, feature.color.green, feature.color.blue], snapPosition: toGeo(snap?.surfacePosition ?? snap?.position), snappedEdge: snap?.isEdge ?? false }
      first ??= result
      if (snap?.isEdge) return result
    }
    return first
  }, { location: detail.location, id: detail.id })
  assert.ok(hit, 'Focused/isolated real component must be pickable in the rendered scene')
  assert.ok(hit.color[0] > .9 && hit.color[1] > .3 && hit.color[1] < .7 && hit.color[2] < .1)
  await page.mouse.click(hit.x, hit.y)
  const picked = await call('getSelectedTileFeature')
  assert.equal(picked.feature.properties.element, detail.id)
  await page.screenshot({ path: join(output, 'focused-highlight.png') })
  report.selection = { elementId: detail.id, label: detail.label, units: detail.properties[propertyKey].units, hit }
  report.checks.push('Real streamed BIM geometry: geographic focus, isolation, orange highlight and mouse click → exact element properties')
  console.log(`Live rendered selection: element ${detail.id}, edge snap=${hit.snappedEdge}`)
  if (hit.snapPosition) {
    report.preciseSnap = await call('snapBimElement', { layerId: 'live-model', elementId: detail.id, position: hit.snapPosition, snapAperture: 100 })
    assert.equal(report.preciseSnap.snapped, true, 'Real source-geometry refinement must hit')
    report.checks.push('Real ion ECEF and native IonSnapService source-geometry refinement returned a precise hit')
  } else throw new Error('No native snap position found on real geometry')
  const isolated = await call('filterBimElements', { layerId: 'live-model', filter, color: '#00ff00' })
  assert.equal(isolated.selected, aggregate.total, 'Visual filter must include every matching page')
  report.filteredElements = isolated.selected
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(output, 'filtered.png') })
  await call('clearBimSelection', { layerId: 'live-model' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(output, 'restored.png') })
  report.checks.push('Real server filter applied to map and original appearance restored')
  report.success = true
} catch (error) {
  report.error = redact(error.stack)
  process.exitCode = 1
  await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
} finally {
  await client?.close().catch(() => {})
  await browser?.close()
  if (runtime && runtime.exitCode === null) { runtime.kill(); await new Promise(done => runtime.once('exit', done)) }
  if (site) { site.closeAllConnections(); await new Promise(done => site.close(done)) }
  report.completedAt = new Date().toISOString()
  const serialized = JSON.stringify(report, null, 2)
  await writeFile(join(output, `run-${report.checkedAt.replace(/[:.]/g, '-')}.json`), serialized)
  const exists = await access(join(output, 'acceptance.json')).then(() => true, () => false)
  if (report.success || !exists) await writeFile(join(output, 'acceptance.json'), serialized)
  console.log(JSON.stringify({ assetId, success: report.success, checks: report.checks, quantity: report.quantity, preciseSnap: report.preciseSnap, error: report.error }, null, 2))
}
