import { describe, expect, it } from 'vitest'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { createPreviewAgentServer, readAgentEvent, updateAgentTurnState } from './preview-agent.js'

describe('preview conversation agent', () => {
  it('accepts a completed turn after transient reconnect errors, but rejects terminal failure', () => {
    const state = { replied: false, completed: false, failed: false }
    updateAgentTurnState(state, { type: 'error', message: 'Reconnecting 1/5' })
    updateAgentTurnState(state, { type: 'item.completed', item: { type: 'agent_message', text: 'Done' } })
    updateAgentTurnState(state, { type: 'turn.completed' })
    expect(state).toEqual({ replied: true, completed: true, failed: false })
    updateAgentTurnState(state, { type: 'turn.failed' })
    expect(state.failed).toBe(true)
  })
  it('binds tool execution to this map and hides host lifecycle and script tools', async () => {
    const calls: unknown[] = []
    const server = createPreviewAgentServer([
      { name: 'getView', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } } } },
      { name: 'openCesiumMap', inputSchema: { type: 'object' } },
      { name: 'executeScript', inputSchema: { type: 'object' } },
    ], async params => { calls.push(params); return { content: [{ type: 'text', text: 'ok' }] } }, 'map-a')
    const client = new Client({ name: 'agent-test', version: '1' })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(b)
    await client.connect(a)
    try {
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['getView'])
      await client.callTool({ name: 'getView', arguments: {} })
      expect(calls).toEqual([{ name: 'getView', arguments: { sessionId: 'map-a' } }])
      const rejected = await client.callTool({ name: 'getView', arguments: { sessionId: 'map-b' } })
      expect(rejected.isError).toBe(true)
      expect(calls).toHaveLength(1)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('shows real assistant and tool events without rendering raw model or process output', () => {
    expect(readAgentEvent({ type: 'item.completed', item: { type: 'agent_message', text: '需要拉伸到多少米？' } }))
      .toEqual({ role: 'assistant', text: '需要拉伸到多少米？' })
    expect(readAgentEvent({ type: 'item.started', item: { type: 'mcp_tool_call', tool: 'updateEntity' } }))
      .toEqual({ role: 'tool', text: '正在执行 updateEntity' })
    expect(readAgentEvent({ type: 'item.completed', item: { type: 'command_execution', aggregated_output: 'secret' } }))
      .toBeUndefined()
    expect(readAgentEvent({ type: 'item.completed', item: { type: 'mcp_tool_call', tool: 'updateEntity', status: 'failed' } }))
      .toEqual({ role: 'tool', text: 'updateEntity 执行失败' })
  })
})
