import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { beforeAll, describe, expect, it } from 'vitest'

const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'))
const serverEntry = fileURLToPath(new URL('./stdio-test-server.ts', import.meta.url))
const bundledServerEntry = fileURLToPath(new URL('../dist/index.js', import.meta.url))

beforeAll(() => {
  if (!existsSync(bundledServerEntry)) {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'run',
      'build',
      '-w',
      'packages/cesium-mcp-dev',
    ], {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
  }
})

function createTransport(): StdioClientTransport {
  return new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, serverEntry],
    cwd: process.cwd(),
    stderr: 'pipe',
  })
}

function createBundledTransport(): StdioClientTransport {
  return new StdioClientTransport({
    command: process.execPath,
    args: [bundledServerEntry],
    cwd: process.cwd(),
    stderr: 'pipe',
  })
}

async function expectDevTools(client: Client) {
  const { tools } = await client.listTools()
  expect(tools.map(tool => tool.name)).toEqual([
    'cesium_api_lookup',
    'cesium_code_gen',
    'cesium_entity_builder',
  ])
}

describe('cesium-mcp-dev MCP SDK v2 stdio entry', () => {
  it('starts the bundled CLI with a single valid shebang', async () => {
    const client = new Client({
      name: 'cesium-mcp-dev-bundle-test',
      version: '1.0.0',
    }, {
      versionNegotiation: {
        mode: { pin: '2026-07-28' },
      },
    })
    try {
      await client.connect(createBundledTransport())
      expect(client.getProtocolEra()).toBe('modern')
      await expectDevTools(client)
    } finally {
      await client.close()
    }
  }, 15_000)

  it('serves a modern client that pins 2026-07-28', async () => {
    const client = new Client({
      name: 'cesium-mcp-dev-modern-test',
      version: '1.0.0',
    }, {
      versionNegotiation: {
        mode: { pin: '2026-07-28' },
      },
    })
    try {
      await client.connect(createTransport())
      expect(client.getProtocolEra()).toBe('modern')
      await expectDevTools(client)
    } finally {
      await client.close()
    }
  }, 15_000)

  it('keeps the default legacy stdio handshake working', async () => {
    const client = new Client({
      name: 'cesium-mcp-dev-legacy-test',
      version: '1.0.0',
    })
    try {
      await client.connect(createTransport())
      expect(client.getProtocolEra()).toBe('legacy')
      await expectDevTools(client)
    } finally {
      await client.close()
    }
  }, 15_000)
})
