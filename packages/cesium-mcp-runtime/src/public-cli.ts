import { createPublicMapServer } from './public-server.js'

const port = Number(process.env.PORT ?? '9116')
const server = createPublicMapServer()
server.listen(port, '127.0.0.1', () => console.error(`Cesium Map public MCP listening on loopback port ${port}`))
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
