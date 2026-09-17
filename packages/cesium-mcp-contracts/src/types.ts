export type JsonSchema = Record<string, unknown>

export type CesiumToolLocale = 'en' | 'zh-CN'

export interface CesiumToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
  untrustedContentHint?: boolean
}

export interface CesiumToolLocalization {
  description: string
  parameters: Readonly<Record<string, string>>
}

export interface CesiumToolContract {
  /** Public name exposed to MCP, WebMCP, and function-calling models. */
  name: string
  /** Stable browser Bridge action. Omit to use `name`; it may outlive a public rename. */
  action?: string
  title: string
  description: string
  inputSchema: JsonSchema
  outputSchema: JsonSchema
  annotations: CesiumToolAnnotations
  localizations: Readonly<Record<CesiumToolLocale, CesiumToolLocalization>>
}
