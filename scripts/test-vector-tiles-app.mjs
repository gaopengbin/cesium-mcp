import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createRiverFixtures } from './vector-tile-fixtures.mjs'

const output = 'artifacts/vector-tiles'
const data = JSON.parse((await readFile(`${output}/natural-earth-rivers.geojson`, 'utf8')).replace(/^\uFEFF/, ''))
const { mvt } = createRiverFixtures(data)
const fixture = createServer((_req, res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.end(mvt) })
await new Promise(done => fixture.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${fixture.address().port}`
const previewPort = 19331
const runtime = spawn(process.execPath, ['--import', 'tsx', 'packages/cesium-mcp-runtime/src/app-preview-server.ts'], {
  env: { ...process.env, CESIUM_WS_PORT: '19330', CESIUM_APP_PREVIEW_PORT: String(previewPort), CESIUM_APP_SANDBOX_PORT: '19332', MCP_HTTP_PORT: '19430', CESIUM_MAP_DATA_ORIGINS: origin },
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
})
runtime.stdout.resume()
runtime.stderr.resume()
const client = new Client({ name: 'Vector panel acceptance', version: '1.0.0' })
const report = { checks: [], errors: [], resourceWarnings: [] }
let browser
let page
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${previewPort}/`)).ok) break } catch {}
    await new Promise(done => setTimeout(done, 250))
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] })
  page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') report.resourceWarnings.push(message.text()) })
  await page.goto(`http://127.0.0.1:${previewPort}/`)
  await page.waitForFunction(() => {
    try { return JSON.parse(document.getElementById('context').textContent).connected } catch { return false }
  }, undefined, { timeout: 45000 })
  const context = await page.locator('#context').textContent()
  const { sessionId } = JSON.parse(context)
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${previewPort}/mcp`)))
  const command = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: { ...args, sessionId } })
    if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`)
    report.checks.push(name)
    const value = result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text)
    return value.data ?? value
  }
  await command('loadVectorTiles', { source: 'mvt', id: 'rivers', url: `${origin}/{z}/{x}/{y}.pbf`, minZoom: 0, maxZoom: 0, extent: [75, 15, 100, 40], clampTarget: 'terrain', flyTo: false, tileStyle: { color: "color('#38bdf8')", lineWidth: 7 } })
  const river = data.features.find(feature => feature.properties.name === 'Brahmaputra')
  const coordinates = river.geometry.type === 'LineString' ? river.geometry.coordinates : river.geometry.coordinates.flat()
  const [longitude, latitude] = coordinates.filter(([lon, lat]) => lon > 80 && lon < 95 && lat > 20 && lat < 30).sort((a, b) => Math.abs(a[0] - 88) + Math.abs(a[1] - 27) - Math.abs(b[0] - 88) - Math.abs(b[1] - 27))[0]
  await command('setView', { longitude, latitude, height: 750000, pitch: -90 })
  const frame = page.frames().find(frame => frame.url() === 'http://127.0.0.1:19332/')
  await frame.waitForFunction(() => document.querySelector('#workspace').dataset.layout !== 'home')
  const canvas = frame.locator('canvas').first()
  const box = await canvas.boundingBox()
  report.canvas = box
  let selected
  // Allow content to render, then use physical clicks near a real source vertex.
  await page.waitForTimeout(2000)
  for (const [dx, dy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [4, 0], [-4, 0]]) {
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy)
    selected = await command('getSelectedTileFeature')
    if (selected.feature) break
  }
  if (!selected?.feature) throw new Error('MCP panel click did not select a rendered river')
  report.selection = selected.feature
  await frame.locator('#selection-properties').waitFor({ state: 'visible' })
  if (!(await frame.locator('#selection-properties').textContent()).includes('Brahmaputra')) throw new Error('Selection attributes missing in panel')
  await frame.locator('#ask').click()
  await page.waitForFunction(() => document.getElementById('messages').textContent.includes('getSelectedTileFeature'))
  report.checks.push('selected river context and host message')
  await command('updateLayerStyle', { layerId: 'rivers', tileStyle: { color: "color('#ff8800')", lineWidth: 9 } })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${output}/panel-rivers.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  report.styleAfterResize = (await command('getLayerSchema', { layerId: 'rivers' })).metadata?.tileStyle
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.screenshot({ path: `${output}/panel-rivers-narrow.png` })
    try {
      report.renderedColors = JSON.parse(execFileSync('python', ['-X', 'utf8', 'scripts/check-vector-render-colors.py', `${output}/panel-rivers-narrow.png`], { encoding: 'utf8' }))
      break
    } catch { await page.waitForTimeout(250) }
  }
  if (!report.renderedColors) throw new Error('Restyled river reverted to blue after resizing')
  report.horizontalOverflow = await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  if (report.horizontalOverflow) throw new Error('River panel overflows on a narrow screen')
  await command('removeLayer', { id: 'rivers' })
  await frame.locator('#selection-properties').waitFor({ state: 'hidden' })
  const marker = await command('addMarker', { longitude, latitude, color: '#ef4444', size: 16 })
  await page.setViewportSize({ width: 1280, height: 960 })
  await page.waitForTimeout(1000)
  const markerBox = await canvas.boundingBox()
  for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
    await page.mouse.click(markerBox.x + markerBox.width / 2 + dx, markerBox.y + markerBox.height / 2 + dy)
    await page.waitForTimeout(150)
    const current = JSON.parse(await page.locator('#context').textContent())
    if (current.selectedEntity?.entityId === marker.entityId) break
  }
  await page.waitForFunction(entityId => {
    try { return JSON.parse(document.getElementById('context').textContent).selectedEntity?.entityId === entityId } catch { return false }
  }, marker.entityId)
  if ((await command('getSelectedTileFeature')).feature !== null) throw new Error('Entity selection left a stale river feature')
  report.checks.push('existing entity selection preserved')
  report.success = true
} catch (error) {
  report.failure = error.message
  if (page) {
    await page.screenshot({ path: `${output}/panel-failure.png` }).catch(() => {})
    report.context = await page.locator('#context').textContent().catch(() => '')
  }
  process.exitCode = 1
}
finally {
  await writeFile(`${output}/panel-results.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await client.close()
  await browser?.close()
  fixture.closeAllConnections()
  await new Promise(done => fixture.close(done))
  runtime.kill()
}
