import type {
  EmbodiedMotionIntent,
  EmbodiedPlan,
  EmbodiedWorldSnapshot,
} from './embodied-agent-loop.js'

const DEFAULT_ENDPOINT = 'https://cesium-browser-agent.pages.dev/api/chat'
const ALLOWED_INTENTS = new Set<EmbodiedMotionIntent>([
  'advance',
  'turn-left',
  'turn-right',
  'inspect-left',
  'inspect-right',
  'hold',
])

export interface HostedPlanResult {
  plan: EmbodiedPlan
  model: string
  usageState?: string
}

export async function requestHostedMotionPlan(
  snapshot: EmbodiedWorldSnapshot,
  options: { endpoint?: string, signal?: AbortSignal } = {},
): Promise<HostedPlanResult> {
  const response = await fetch(options.endpoint ?? DEFAULT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content: [
            'You are an embodied navigation planner operating in a Cesium mountain scene. ',
            'Choose exactly one short motion intent from the current observation only. ',
            'Unknown terrain is not traversable. You must call commit_motion_intent. ',
            'Never advance when the front candidate is not traversable. ',
            'A separate local safety loop can override your intent when immediate danger appears. ',
            'Keep the reason concise and grounded in the supplied evidence.',
          ].join(''),
        },
        {
          role: 'user',
          content: JSON.stringify(snapshot),
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'commit_motion_intent',
            description: 'Commit the next time-bounded embodied motion intent.',
            parameters: {
              type: 'object',
              properties: {
                intent: {
                  type: 'string',
                  enum: [...ALLOWED_INTENTS],
                },
                duration_ms: {
                  type: 'number',
                  minimum: 500,
                  maximum: 8000,
                },
                reason: { type: 'string' },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                },
              },
              required: ['intent', 'duration_ms', 'reason', 'confidence'],
              additionalProperties: false,
            },
          },
        },
      ],
    }),
    signal: options.signal,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `Hosted planner failed with ${response.status}`)
  }

  const body = await response.json() as {
    model?: string
    choices?: Array<{
      message?: {
        tool_calls?: Array<{
          function?: { name?: string, arguments?: string }
        }>
      }
    }>
  }
  const call = body.choices?.[0]?.message?.tool_calls
    ?.find(candidate => candidate.function?.name === 'commit_motion_intent')
  if (!call?.function?.arguments) {
    throw new Error('The hosted model did not commit a motion intent')
  }

  const parsed = JSON.parse(call.function.arguments) as Record<string, unknown>
  const intent = String(parsed.intent ?? '') as EmbodiedMotionIntent
  if (!ALLOWED_INTENTS.has(intent)) {
    throw new Error(`The hosted model returned an unknown intent: ${intent}`)
  }

  return {
    plan: {
      intent,
      durationMs: finiteNumber(parsed.duration_ms, 2_500),
      reason: String(parsed.reason ?? 'No model reason provided'),
      confidence: finiteNumber(parsed.confidence, 0.5),
      source: 'model',
    },
    model: response.headers.get('X-AI-Model') ?? body.model ?? 'hosted-model',
    ...(response.headers.get('X-AI-Usage-State')
      ? { usageState: response.headers.get('X-AI-Usage-State')! }
      : {}),
  }
}

export function createFallbackPlan(snapshot: EmbodiedWorldSnapshot): EmbodiedPlan {
  const candidates = [...snapshot.candidates]
    .filter(candidate => candidate.traversable)
    .sort((left, right) => right.clearanceMeters - left.clearanceMeters)
  const front = candidates.find(candidate => candidate.id === 'front')
  const best = front && front.clearanceMeters >= 24 ? front : candidates[0]
  const intent: EmbodiedMotionIntent = best?.id === 'left'
    ? 'turn-left'
    : best?.id === 'right'
      ? 'turn-right'
      : best?.id === 'front'
        ? 'advance'
        : 'hold'

  return {
    intent,
    durationMs: intent === 'advance' ? 4_000 : 1_800,
    reason: best
      ? `Hosted model unavailable; local fallback selected ${best.id} with ${Math.round(best.clearanceMeters)} m clearance`
      : 'Hosted model unavailable and no traversable direction has been observed',
    confidence: best ? 0.55 : 0.2,
    source: 'fallback',
  }
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
