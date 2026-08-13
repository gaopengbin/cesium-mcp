import type { CallToolResult } from '@modelcontextprotocol/server'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Keep legacy text content while exposing the same JSON object through MCP's
 * structured result channel.
 */
export function attachStructuredContent(result: CallToolResult): CallToolResult {
  if (result.structuredContent !== undefined) return result

  const text = result.content.find(item => item.type === 'text')?.text
  if (!text) return result

  try {
    const parsed = JSON.parse(text) as unknown
    return isRecord(parsed)
      ? { ...result, structuredContent: parsed }
      : result
  } catch {
    return result
  }
}
