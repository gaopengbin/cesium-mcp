import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

const plugin = resolve(process.argv[2] ?? 'plugins/cesium-map')
const manifest = JSON.parse(await readFile(resolve(plugin, 'mcp.json'), 'utf8')).mcpServers['cesium-map']
const listener = createServer()
await new Promise(resolvePromise => listener.listen(0, '127.0.0.1', resolvePromise))
const port = String(listener.address().port)
await new Promise(resolvePromise => listener.close(resolvePromise))
const clients = []
const start = async () => {
  const client = new Client({ name: 'Cesium relay recovery check', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: manifest.args.map(value => value.replaceAll('${PLUGIN_ROOT}', plugin)),
    env: { ...process.env, ...manifest.env, CESIUM_WS_PORT: port }, stderr: 'pipe',
  })
  await client.connect(transport)
  clients.push(client)
  return client
}
const call = async (client, name, args) => {
  const result = await client.callTool({ name, arguments: args })
  assert(!result.isError, JSON.stringify(result.content))
  return result.structuredContent
}
try {
  const owner = await start()
  const relay = await start()
  const previous = await call(relay, 'connectCesiumMap', { sessionId: 'before-owner-exit' })
  await owner.close()
  const sessionId = 'after-owner-exit'
  const [{ token }, concurrent] = await Promise.all([
    call(relay, 'connectCesiumMap', { sessionId }),
    call(relay, 'connectCesiumMap', { sessionId: 'concurrent-recovery' }),
  ])
  const lost = await relay.callTool({ name: 'exchangeCesiumMap', arguments: {
    sessionId: 'before-owner-exit', token: previous.token,
  } })
  assert(lost.isError)
  assert(lost.content[0].text.startsWith('Map session is not connected;'))
  const sessions = await relay.callTool({ name: 'listSessions', arguments: {} })
  assert(JSON.stringify(sessions.content).includes(sessionId))
  const pending = relay.callTool({ name: 'getView', arguments: { sessionId } })
  const { commands } = await call(relay, 'exchangeCesiumMap', { sessionId, token })
  assert.equal(commands[0].method, 'getView')
  await call(relay, 'exchangeCesiumMap', { sessionId, token, results: [{
    id: commands[0].id,
    result: { success: true, data: { longitude: 116.397, latitude: 39.908, height: 12_000, heading: 0, pitch: -90, roll: 0 } },
  }] })
  assert(!(await pending).isError)
  const status = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json()
  assert(status.sessions.includes(sessionId))
  assert(status.sessions.includes('concurrent-recovery'))
  await call(relay, 'disconnectCesiumMap', { sessionId, token })
  await call(relay, 'disconnectCesiumMap', { sessionId: 'concurrent-recovery', token: concurrent.token })
  console.log(JSON.stringify({ relayTookOwnership: true, concurrentRecovery: true, mcpRoundTripAfterOwnerExit: true }))
} finally {
  for (const client of clients.reverse()) await client.close()
}
