import { createServer } from 'node:http'
import { isIP } from 'node:net'
import { createJevMiddleware } from './jev-api.js'
import { createPublicBudget } from './public-budget.js'

const origin = process.env.PUBLIC_ORIGIN
const apiKey = process.env.TYPESAFE_API_KEY
const budgetPath = process.env.JEV_BUDGET_PATH
if (!origin || new URL(origin).protocol !== 'https:' || !apiKey || !budgetPath) throw new Error('Missing production configuration')
const budget = createPublicBudget(budgetPath, Number(process.env.JEV_DAILY_LIMIT || 5_000))
const middleware = createJevMiddleware({
  apiKey, publicOrigin: origin, maxConcurrent: 4,
  authorizeRequest: request => {
    const ip = request.headers['x-real-ip']
    if (typeof ip !== 'string' || !isIP(ip)) return 'The public demo is unavailable through this connection.'
    return budget(ip)
  },
})
const server = createServer((request, response) => {
  if (request.url === '/health' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ ok: true, service: 'cesium-jev', revision: process.env.RELEASE_ID ?? 'unknown' }))
    return
  }
  middleware(request, response, () => { response.writeHead(404); response.end() })
})
server.headersTimeout = 10_000
server.requestTimeout = 20_000
server.listen(Number(process.env.PORT || 9097), '127.0.0.1')
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => server.close(() => process.exit(0)))
