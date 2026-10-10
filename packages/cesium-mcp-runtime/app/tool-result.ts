interface ToolResult {
  structuredContent?: unknown
  content: { type: string; text?: string }[]
}

/** Older runtime tools return the bridge result as JSON text. */
export function readToolData(result: ToolResult): Record<string, unknown> | undefined {
  let value: unknown = result.structuredContent
  if (!value) {
    const text = result.content.find(item => item.type === 'text')?.text
    if (!text) return undefined
    try { value = JSON.parse(text) } catch { return undefined }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const data = record.data ?? record
  return data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : undefined
}
