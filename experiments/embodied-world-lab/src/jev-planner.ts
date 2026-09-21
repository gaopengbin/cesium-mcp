import type { EmbodiedWorldSnapshot } from './embodied-agent-loop.js'
import type { HostedPlanResult } from './hosted-planner.js'

export interface JevPlanResult extends HostedPlanResult {
  latencyMs: number
  probabilities: Record<string, number>
  usage: Record<string, number>
}

export async function requestJevMotionPlan(
  snapshot: EmbodiedWorldSnapshot,
  options: { signal?: AbortSignal } = {},
): Promise<JevPlanResult> {
  const response = await fetch('/api/jev/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot), signal: options.signal,
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? `Jev planner failed with HTTP ${response.status}`)
  return body as JevPlanResult
}
