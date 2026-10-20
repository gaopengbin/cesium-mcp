import { cesiumSharedToolNames } from 'cesium-mcp-contracts'

export const telemetryProducts = ['runtime', 'dev', 'bridge', 'webmcp'] as const
export type TelemetryProduct = typeof telemetryProducts[number]
export const telemetryTools = new Set<string>([
  ...cesiumSharedToolNames, 'setIonToken',
  'cesium_api_lookup', 'cesium_code_gen', 'cesium_entity_builder',
])
export const latencyBuckets = ['lt100ms', 'lt1s', 'lt10s', 'gte10s'] as const
export interface UsageEvent {
  event: 'started' | 'connected' | 'tool'
  tool: string
  outcome: 'success' | 'failure'
  latency: typeof latencyBuckets[number]
  count: number
}
export interface UsageBatch {
  schema: 1
  batchId: string
  installationId: string
  product: TelemetryProduct
  version: string
  platform: 'win32' | 'darwin' | 'linux' | 'browser' | 'other'
  events: UsageEvent[]
}
export const isUsageId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export const isUsageVersion = (value: unknown): value is string => typeof value === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[a-zA-Z0-9.-]{1,24})?$/.test(value)

/** Reject extra keys instead of accidentally persisting arbitrary user input. */
export function validateUsageBatch(input: unknown): input is UsageBatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const value = input as Record<string, unknown>
  if (Object.keys(value).sort().join(',') !== 'batchId,events,installationId,platform,product,schema,version') return false
  if (value.schema !== 1 || !isUsageId(value.batchId) || !isUsageId(value.installationId) || !isUsageVersion(value.version)) return false
  if (!telemetryProducts.includes(value.product as TelemetryProduct) || typeof value.platform !== 'string' || !['win32', 'darwin', 'linux', 'browser', 'other'].includes(value.platform)) return false
  if (!Array.isArray(value.events) || !value.events.length || value.events.length > 32) return false
  return value.events.every(event => {
    if (!event || typeof event !== 'object' || Object.keys(event).sort().join(',') !== 'count,event,latency,outcome,tool') return false
    return ['started', 'connected', 'tool'].includes(event.event)
      && (event.event === 'tool' ? telemetryTools.has(event.tool) : event.tool === '')
      && ['success', 'failure'].includes(event.outcome)
      && latencyBuckets.includes(event.latency)
      && Number.isInteger(event.count) && event.count > 0 && event.count <= 10000
  })
}
