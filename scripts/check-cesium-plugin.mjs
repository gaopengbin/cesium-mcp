import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(process.argv[2] ?? join(root, 'plugins', 'cesium-map'))
const sessionId = process.argv[3]
const livePort = process.argv[4]
const temporaryRoot = await mkdtemp(join(tmpdir(), 'cesium-plugin-check-'))
const installed = join(temporaryRoot, 'copied plugin')
let client
let logs = ''

async function freePort() {
  const server = createServer()
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise))
  const port = server.address().port
  await new Promise(resolvePromise => server.close(resolvePromise))
  return port
}

function toolData(result) {
  assert.ok(!result.isError, JSON.stringify(result.content))
  const record = result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text)
  assert.notEqual(record.success, false, JSON.stringify(record))
  return record.data ?? record
}

try {
  await cp(source, installed, { recursive: true })
  const manifest = JSON.parse(await readFile(join(installed, 'plugin.json'), 'utf8'))
  const presentation = manifest.extensions['com.openai'].interface
  const iconAssets = {}
  for (const field of ['composerIcon', 'composerIconDark', 'logo', 'logoDark']) {
    const asset = presentation[field]
    assert.ok(asset?.startsWith('./assets/'), `Missing packaged ${field}`)
    const path = resolve(installed, asset)
    const withinPlugin = relative(installed, path)
    assert.ok(!isAbsolute(withinPlugin) && withinPlugin !== '..' && !withinPlugin.startsWith(`..${sep}`))
    const svg = await readFile(path, 'utf8')
    assert.ok(svg.includes('<svg') && svg.includes('width="64" height="64"'), `Invalid ${field}`)
    assert.ok(!/<(?:script|image|foreignObject)\b|href=/i.test(svg), `Icon must be self-contained: ${field}`)
    iconAssets[field] = asset
  }
  const configuration = JSON.parse(await readFile(join(installed, 'mcp.json'), 'utf8'))
  const server = configuration.mcpServers['cesium-map']
  const port = livePort ?? String(await freePort())
  const args = server.args.map(argument => argument.replaceAll('${PLUGIN_ROOT}', installed))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    cwd: temporaryRoot,
    env: { ...process.env, ...server.env, CESIUM_WS_PORT: port },
    stderr: 'pipe',
  })
  client = new Client({ name: 'cesium-map-installed-check', version: '1.0.0' })
  client.onerror = error => { logs += `\nMCP client error: ${error.message}` }
  try {
    await client.connect(transport)
    transport.stderr?.on('data', chunk => { logs += chunk.toString() })
  } catch (error) {
    throw new Error(`Installed plugin failed to start: ${logs}`, { cause: error })
  }
  let { tools } = await client.listTools()
  if (!tools.some(tool => tool.name === 'loadVectorTiles')) {
    toolData(await client.callTool({ name: 'enable_toolset', arguments: { toolset: 'tiles' } }))
    tools = (await client.listTools()).tools
  }
  const opener = tools.find(tool => tool.name === 'openCesiumMap')
  assert.equal(opener?._meta?.ui?.resourceUri, 'ui://cesium-mcp/map-v10.html')
  assert.deepEqual(opener._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }])
  assert.equal(opener.icons?.[0]?.mimeType, 'image/svg+xml')
  assert.deepEqual(opener.icons[0].sizes, ['20x20'])
  const toolIcon = Buffer.from(opener.icons[0].src.split(',')[1], 'base64').toString('utf8')
  assert.ok(toolIcon.includes('currentColor') && toolIcon.includes('viewBox="0 0 20 20"'))
  assert.deepEqual(client.getServerVersion()?.icons, opener.icons)
  for (const name of ['getView', 'flyTo', 'addMarker', 'addGeoJsonLayer', 'listLayers']) {
    assert.ok(tools.some(tool => tool.name === name), `Missing map tool: ${name}`)
  }
  for (const name of ['loadVectorTiles', 'getSelectedTileFeature', 'updateLayerStyle', 'getLayerSchema']) {
    assert.ok(tools.some(tool => tool.name === name), `Missing vector tool: ${name}`)
  }
  const vectorSchema = tools.find(tool => tool.name === 'loadVectorTiles').inputSchema.properties
  assert.ok(vectorSchema.clampTarget, 'Missing vector clamping options')
  assert.ok(vectorSchema.tileStyle, 'Missing vector style options')
  const styleSchema = tools.find(tool => tool.name === 'updateLayerStyle').inputSchema.properties
  assert.ok(styleSchema.tileStyle, 'Missing tile style update options')
  const opened = toolData(await client.callTool({ name: 'openCesiumMap', arguments: sessionId ? { sessionId } : {} }))
  assert.equal(opened.transport, 'mcp')
  if (sessionId) assert.equal(opened.sessionId, sessionId)
  const { contents } = await client.readResource({ uri: opener._meta.ui.resourceUri })
  const resource = contents[0]
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app')
  assert.ok(resource.text.includes('CESIUM_BASE_URL'))
  assert.ok(resource.text.includes('exchangeCesiumMap'))
  assert.ok(resource.text.length > 1_000_000, 'Map bundle is missing')
  const bridge = await fetch(`http://127.0.0.1:${port}/bridge.js`)
  assert.equal(bridge.status, 200)
  assert.ok((await bridge.text()).includes('CesiumMcpBridge'))
  const report = {
    plugin: `${manifest.name}@${manifest.version}`,
    relocatedWithoutNodeModules: true,
    stdioHandshake: true,
    toolCount: tools.length,
    uiResourceBytes: Buffer.byteLength(resource.text),
    entrypoints: opener._meta['openai/ui'].entrypoints,
    iconAssets,
    nativeEntrypointIcon: true,
    browserBridge: true,
    liveViewer: false,
  }
  if (sessionId) {
    const args = { sessionId }
    const sessions = toolData(await client.callTool({ name: 'listSessions', arguments: {} }))
    assert.ok(sessions.some(session => session.sessionId === sessionId && session.connected))
    const view = toolData(await client.callTool({ name: 'getView', arguments: args }))
    assert.equal(typeof view.longitude, 'number')
    const marker = toolData(await client.callTool({ name: 'addMarker', arguments: {
      ...args, longitude: -74.009, latitude: 40.7148, label: '安装包实测 · 纽约',
    } }))
    assert.ok(marker.entityId, JSON.stringify(marker))
    try {
      toolData(await client.callTool({ name: 'updateEntity', arguments: {
        ...args, entityId: marker.entityId, position: { longitude: -74.006, latitude: 40.7128 },
      } }))
      const properties = toolData(await client.callTool({ name: 'getEntityProperties', arguments: { ...args, entityId: marker.entityId } }))
      assert.equal(properties.type, 'marker')
      assert.ok(Math.abs(properties.position.longitude + 74.006) < 0.001)
    } finally {
      toolData(await client.callTool({ name: 'removeEntity', arguments: { ...args, entityId: marker.entityId } }))
    }
    report.liveViewer = true
    report.sessionId = sessionId
    report.roundTrip = ['getView', 'addMarker', 'updateEntity', 'getEntityProperties', 'removeEntity']
  }
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  if (logs) console.error(logs)
  throw error
} finally {
  await client?.close()
  const withinTemp = relative(resolve(tmpdir()), temporaryRoot)
  if (!isAbsolute(withinTemp) && withinTemp !== '..' && !withinTemp.startsWith(`..${sep}`) && withinTemp.startsWith('cesium-plugin-check-')) {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}
