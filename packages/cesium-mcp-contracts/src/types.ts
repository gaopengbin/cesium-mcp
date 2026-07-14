export type JsonSchema = Record<string, unknown>

export interface CesiumToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

export interface CesiumToolContract {
  name: string
  title?: string
  description: string
  inputSchema: JsonSchema
  outputSchema: JsonSchema
  annotations?: CesiumToolAnnotations
}
