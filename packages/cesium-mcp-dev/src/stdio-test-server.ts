import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { buildDevMcpServer } from './server.js'

serveStdio(() => buildDevMcpServer())
