export const DEFAULT_HOSTED_AGENT_ENDPOINT = 'https://cesium-browser-agent.pages.dev/api/chat'

export function resolveHostedAgentEndpoint(pageUrl: string): string {
  try {
    const url = new URL(pageUrl)
    const isHostedPagesOrigin = url.protocol === 'https:'
      && (url.hostname === 'cesium-browser-agent.pages.dev'
        || url.hostname.endsWith('.cesium-browser-agent.pages.dev'))

    if (isHostedPagesOrigin) {
      return `${url.origin}/api/chat`
    }
  } catch {
    // Keep the public endpoint as the safe fallback for malformed URLs.
  }

  return DEFAULT_HOSTED_AGENT_ENDPOINT
}

export type HostedAgentRole = 'system' | 'user' | 'assistant' | 'tool'

export interface HostedAgentToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface HostedAgentMessage {
  role: HostedAgentRole
  content?: string | null
  tool_calls?: HostedAgentToolCall[]
  tool_call_id?: string
}

export interface HostedAgentTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface HostedAgentChoice {
  message: HostedAgentMessage
  model: string
  usageState?: string
}

export interface HostedAgentRequestOptions {
  messages: HostedAgentMessage[]
  tools?: HostedAgentTool[]
  endpoint?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export async function requestHostedAgent(
  options: HostedAgentRequestOptions,
): Promise<HostedAgentChoice> {
  const endpoint = options.endpoint ?? DEFAULT_HOSTED_AGENT_ENDPOINT
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: options.messages,
      tools: options.tools ?? [],
    }),
    signal: options.signal,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      error?: string | { message?: string }
      code?: string
    }
    const detail = typeof body.error === 'string' ? body.error : body.error?.message
    const suffix = body.code ? ` (${body.code})` : ''
    throw new Error(`${detail ?? `Hosted model request failed with ${response.status}`}${suffix}`)
  }

  const body = await response.json() as {
    model?: string
    choices?: Array<{ message?: unknown }>
  }
  const rawMessage = body.choices?.[0]?.message
  if (!isHostedAgentMessage(rawMessage)) {
    throw new Error('Hosted model returned no valid assistant message')
  }

  return {
    message: normalizeMessage(rawMessage),
    model: response.headers.get('X-AI-Model') ?? body.model ?? 'hosted-model',
    ...(response.headers.get('X-AI-Usage-State')
      ? { usageState: response.headers.get('X-AI-Usage-State')! }
      : {}),
  }
}

function isHostedAgentMessage(value: unknown): value is HostedAgentMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  if (message.role !== 'assistant') return false
  return typeof message.content === 'string'
    || message.content === null
    || Array.isArray(message.tool_calls)
}

function normalizeMessage(message: HostedAgentMessage): HostedAgentMessage {
  return {
    role: 'assistant',
    ...(message.content !== undefined ? { content: message.content } : {}),
    ...(message.tool_calls
      ? {
          tool_calls: message.tool_calls.map((call, index) => ({
            id: call.id || `tool-call-${index + 1}`,
            type: 'function',
            function: {
              name: call.function?.name ?? '',
              arguments: typeof call.function?.arguments === 'string'
                ? call.function.arguments
                : JSON.stringify(call.function?.arguments ?? {}),
            },
          })),
        }
      : {}),
  }
}
