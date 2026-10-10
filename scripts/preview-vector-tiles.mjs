import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRiverFixtures } from './vector-tile-fixtures.mjs'

const wsPort = 19350
const port = 19351
const sandboxPort = 19352
const fixturePort = 19353
const origin = `http://127.0.0.1:${fixturePort}`
const data = JSON.parse((await readFile(new URL('../artifacts/vector-tiles/natural-earth-rivers.geojson', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''))
const { mvt } = createRiverFixtures(data)
const fixture = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (!/^\/0\/0\/0\.pbf$/.test(req.url)) { res.writeHead(404); res.end(); return }
  res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile')
  res.end(mvt)
})
await new Promise(done => fixture.listen(fixturePort, '127.0.0.1', done))
const runtime = spawn(process.execPath, ['--import', 'tsx', 'packages/cesium-mcp-runtime/src/app-preview-server.ts'], {
  windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, CESIUM_WS_PORT: String(wsPort), CESIUM_APP_PREVIEW_PORT: String(port), CESIUM_APP_SANDBOX_PORT: String(sandboxPort), MCP_HTTP_PORT: '19450', CESIUM_MAP_DATA_ORIGINS: origin },
})
const loaded = new Set()
let polling = false
const interval = setInterval(async () => {
  if (polling) return
  polling = true
  try {
    const status = await fetch(`http://127.0.0.1:${wsPort}/api/status`, { signal: AbortSignal.timeout(1500) }).then(response => response.json())
    for (const sessionId of status.sessions ?? []) {
      if (loaded.has(sessionId)) continue
      for (const [action, params] of [
        ['loadVectorTiles', { source: 'mvt', id: 'rivers', name: 'Natural Earth 河流', url: `${origin}/{z}/{x}/{y}.pbf`, minZoom: 0, maxZoom: 0, extent: [75, 15, 100, 40], featureIdProperty: 'ne_id', clampTarget: 'terrain', flyTo: false, tileStyle: { color: "color('#38bdf8')", lineWidth: 7 } }],
        ['setView', { longitude: 87.984118, latitude: 29.342034, height: 750000, pitch: -90 }],
      ]) {
        const result = await fetch(`http://127.0.0.1:${wsPort}/api/relay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, action, params }), signal: AbortSignal.timeout(15000) }).then(response => response.json())
        if (!result.ok || !result.result?.success) throw new Error('Map is not ready')
      }
      loaded.add(sessionId)
      console.log('River preview loaded. Click a river, then ask the map assistant to restyle it.')
    }
  } catch { /* New viewers may take a moment to initialize; retry while the preview is open. */ }
  finally { polling = false }
}, 1000)
const stop = () => { clearInterval(interval); runtime.kill(); fixture.closeAllConnections(); fixture.close() }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
runtime.once('exit', () => { clearInterval(interval); fixture.closeAllConnections(); fixture.close() })
console.log(`River preview: http://127.0.0.1:${port}/`)
