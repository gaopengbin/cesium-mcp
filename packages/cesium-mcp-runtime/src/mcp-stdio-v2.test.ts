import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { describe, expect, it } from 'vitest'

const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'))
const serverEntry = fileURLToPath(new URL('./stdio-test-server.ts', import.meta.url))

function createTransport(): StdioClientTransport {
  return new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, serverEntry],
    cwd: process.cwd(),
    stderr: 'pipe',
  })
}

describe('MCP SDK v2 dual-era stdio entry', () => {
  it('serves a modern client that pins 2026-07-28', async () => {
    const client = new Client({
      name: 'cesium-mcp-modern-stdio-test',
      version: '1.0.0',
    }, {
      versionNegotiation: {
        mode: { pin: '2026-07-28' },
      },
    })
    try {
      await client.connect(createTransport())
      expect(client.getProtocolEra()).toBe('modern')
      const { tools } = await client.listTools()
      expect(tools.map(tool => tool.name)).toContain('flyTo')
    } finally {
      await client.close()
    }
  }, 15_000)

  it('keeps the default legacy stdio handshake working', async () => {
    const client = new Client({
      name: 'cesium-mcp-legacy-stdio-test',
      version: '1.0.0',
    })
    try {
      await client.connect(createTransport())
      expect(client.getProtocolEra()).toBe('legacy')
      const { tools } = await client.listTools()
      expect(tools.map(tool => tool.name)).toContain('flyTo')
    } finally {
      await client.close()
    }
  }, 15_000)
})
