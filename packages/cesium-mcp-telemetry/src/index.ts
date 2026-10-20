import { isUsageId, isUsageVersion, telemetryTools, telemetryProducts, validateUsageBatch } from './schema.js'
import type { TelemetryProduct, UsageBatch, UsageEvent } from './schema.js'

export const DEFAULT_TELEMETRY_ENDPOINT = 'https://cesium-browser-agent.pages.dev/api/package-telemetry'
export interface UsageTelemetry {
  record(event: 'started' | 'connected'): void
  recordTool(tool: string, success: boolean, durationMs: number): void
  flush(): Promise<void>
  dispose(): void
}
export interface UsageTelemetryOptions {
  product: TelemetryProduct
  version: string
  enabled?: boolean
  platform?: UsageBatch['platform']
  endpoint?: string
  isDisabled?: () => boolean
  identity?: () => Promise<string | undefined>
  notice?: (message: string) => void
  send?: typeof fetch
}

/** Imports have no side effects. Identity and network access occur only after disclosure. */
export function createUsageTelemetry(options: UsageTelemetryOptions): UsageTelemetry {
  const entries = new Map<string, UsageEvent>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let announced = false
  let inFlight: Promise<void> | undefined
  let endpoint: string | undefined
  try {
    const url = new URL(options.endpoint ?? DEFAULT_TELEMETRY_ENDPOINT)
    if ((url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) && !url.username && !url.password && !url.search && !url.hash) endpoint = url.href
  } catch { /* Invalid configuration disables delivery; never fall back to another endpoint. */ }
  const disabled = () => {
    try { return options.enabled === false || !endpoint || !isUsageVersion(options.version) || !telemetryProducts.includes(options.product) || telemetryDisabled() || Boolean(options.isDisabled?.()) }
    catch { return true }
  }
  const stopTimer = () => { if (timer) clearTimeout(timer); timer = undefined }
  const record = (event: UsageEvent) => {
    if (disposed || disabled()) return
    if (!announced) {
      const message = `[Cesium MCP] Usage statistics ON / 使用统计默认开启 (${options.product}). Fields: random installation ID, package/version, OS family, event/tool, success/failure, latency bucket and counts. Destination: ${endpoint}. No prompts, map data, coordinates, URLs or tokens. Disable / 关闭: CESIUM_TELEMETRY_DISABLED=1 or DO_NOT_TRACK=1; browser: globalThis.CESIUM_MCP_TELEMETRY_DISABLED=true or telemetry:false. Details: https://gaopengbin.github.io/cesium-mcp/guide/telemetry.html`
      try { (options.notice ?? console.info)(message) } catch { return }
      announced = true
    }
    const key = `${event.event}:${event.tool}:${event.outcome}:${event.latency}`
    const previous = entries.get(key)
    if (previous) previous.count = Math.min(10000, previous.count + 1)
    else if (entries.size < 32) entries.set(key, event)
    if (!timer) {
      timer = setTimeout(() => { timer = undefined; void flush() }, entries.size === 1 && event.event === 'started' ? 1000 : 60000)
      const handle = timer as unknown as { unref?: () => void }
      handle.unref?.()
    }
  }
  const flush = async () => {
    if (inFlight) { await inFlight; if (entries.size) await flush(); return }
    stopTimer()
    if (disabled()) { entries.clear(); return }
    if (!entries.size) return
    const events = [...entries.values()].map(event => ({ ...event }))
    entries.clear()
    inFlight = (async () => {
      try {
        const installationId = await (options.identity ?? browserIdentity)()
        if (!isUsageId(installationId) || disabled()) return
        const batch: UsageBatch = {
          schema: 1, batchId: crypto.randomUUID(), installationId,
          product: options.product, version: options.version,
          platform: options.platform ?? 'browser', events,
        }
        if (!validateUsageBatch(batch)) return
        await (options.send ?? fetch)(endpoint!, {
          method: 'POST', body: JSON.stringify(batch),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
          keepalive: true, signal: AbortSignal.timeout(2000),
        })
      } catch { /* Best effort: collector failures never affect application results. */ }
    })().finally(() => { inFlight = undefined })
    return inFlight
  }
  return {
    record: event => record({ event, tool: '', outcome: 'success', latency: 'lt100ms', count: 1 }),
    recordTool(tool, success, durationMs) {
      if (!telemetryTools.has(tool)) return
      record({ event: 'tool', tool, outcome: success ? 'success' : 'failure', latency: durationMs < 100 ? 'lt100ms' : durationMs < 1000 ? 'lt1s' : durationMs < 10000 ? 'lt10s' : 'gte10s', count: 1 })
    },
    flush,
    dispose() { disposed = true; stopTimer(); void flush() },
  }
}

export function telemetryDisabled(): boolean {
  const runtime = globalThis as typeof globalThis & { CESIUM_MCP_TELEMETRY_DISABLED?: boolean; process?: { env?: Record<string, string | undefined> } }
  const env = runtime.process?.env ?? {}
  return runtime.CESIUM_MCP_TELEMETRY_DISABLED === true
    || ['1', 'true'].includes(env.CESIUM_TELEMETRY_DISABLED?.toLowerCase() ?? '')
    || ['1', 'true'].includes(env.DO_NOT_TRACK?.toLowerCase() ?? '')
    || Boolean(env.CI && env.CI !== 'false' && env.CI !== '0') || env.NODE_ENV === 'test'
    || env.CESIUM_MCP_CONFORMANCE === '1'
    || typeof navigator !== 'undefined' && (navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true)
}

let fallbackBrowserId: string | undefined
async function browserIdentity(): Promise<string | undefined> {
  try {
    const existing = localStorage.getItem('cesium-mcp.telemetry-id')
    if (isUsageId(existing)) return existing
    const id = crypto.randomUUID()
    localStorage.setItem('cesium-mcp.telemetry-id', id)
    return id
  } catch {
    // No fingerprinting when storage is unavailable: this ID lasts only for this page.
    return fallbackBrowserId ??= crypto.randomUUID()
  }
}

export async function measureUsageCall<T>(telemetry: UsageTelemetry | undefined, tool: string, operation: () => Promise<T>): Promise<T> {
  const start = performance.now()
  const record = (success: boolean) => {
    try { telemetry?.recordTool(tool, success, performance.now() - start) } catch { /* Observability never changes tool results. */ }
  }
  try {
    const result = await operation()
    const status = result as { success?: boolean; isError?: boolean } | null
    record(status?.success !== false && status?.isError !== true)
    return result
  } catch (error) {
    record(false)
    throw error
  }
}
