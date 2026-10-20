import { DEFAULT_TELEMETRY_ENDPOINT } from 'cesium-mcp-telemetry'

const token = process.env.CESIUM_TELEMETRY_ADMIN_TOKEN
if (!token) throw new Error('Set CESIUM_TELEMETRY_ADMIN_TOKEN locally to read private package aggregates')
const daysIndex = process.argv.indexOf('--days')
const days = Number(daysIndex >= 0 ? process.argv[daysIndex + 1] : 30)
if (![7, 30, 90].includes(days)) throw new Error('--days must be 7, 30 or 90')
const url = new URL(process.env.CESIUM_TELEMETRY_ENDPOINT ?? DEFAULT_TELEMETRY_ENDPOINT)
if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Invalid telemetry endpoint')
url.searchParams.set('days', String(days))
const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(5000) })
if (!response.ok) throw new Error(`Telemetry is unavailable (HTTP ${response.status}); this does not mean zero users`)
console.log(JSON.stringify(await response.json(), null, 2))
