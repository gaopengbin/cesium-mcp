import { serveStdio } from '@modelcontextprotocol/server/stdio'

import { buildMcpServer } from './index.js'

serveStdio(() => buildMcpServer({
  toolsets: ['view'],
}))
