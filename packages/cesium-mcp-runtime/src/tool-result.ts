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

/**
 * Return a PNG through MCP's multimodal content channel while keeping the full
 * canonical result available as structuredContent. The companion text block is
 * deliberately compact and does not repeat the image bytes.
 */
export function createPngImageToolResult(
  structured: Record<string, unknown>,
  dataUrl: string,
): CallToolResult | undefined {
  const prefix = 'data:image/png;base64,'
  if (!dataUrl.startsWith(prefix)) return undefined
  const data = dataUrl.slice(prefix.length)
  if (!data) return undefined

  return {
    content: [
      { type: 'image', data, mimeType: 'image/png' },
      { type: 'text', text: JSON.stringify(compactImageEvidence(structured)) },
    ],
    structuredContent: structured,
  }
}

function compactImageEvidence(structured: Record<string, unknown>): Record<string, unknown> {
  return stripDataUrls(structured) as Record<string, unknown>
}

function stripDataUrls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDataUrls)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'dataUrl')
      .map(([key, nested]) => [key, stripDataUrls(nested)]),
  )
}
