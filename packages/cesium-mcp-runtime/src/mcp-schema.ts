import { fromJsonSchema } from '@modelcontextprotocol/server'
import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server'
import {
  addFormats,
  Ajv,
  AjvJsonSchemaValidator,
} from '@modelcontextprotocol/server/validators/ajv'
import type { JsonSchema } from 'cesium-mcp-contracts'

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  useDefaults: true,
})
addFormats(ajv)

const validator = new AjvJsonSchemaValidator(ajv)

/**
 * Wrap the canonical JSON Schema for SDK v2 while retaining the default-value
 * behavior that the previous Zod adapter provided.
 */
export function createMcpInputSchema(schema: JsonSchema): StandardSchemaWithJSON {
  return fromJsonSchema(schema, validator)
}
