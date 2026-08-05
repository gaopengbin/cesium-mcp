import { cesiumBrowserToolContracts } from './toolsets.js'
import type { JsonSchema } from './types.js'

export interface CesiumToolValidationIssue {
  path: string
  message: string
}

export interface CesiumToolValidationResult {
  knownTool: boolean
  valid: boolean
  issues: CesiumToolValidationIssue[]
}

const contractByName = new Map(
  cesiumBrowserToolContracts.map(contract => [contract.name, contract]),
)

function addIssue(
  issues: CesiumToolValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function equals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

function typeMatches(type: unknown, value: unknown): boolean {
  switch (type) {
    case 'object': return isRecord(value)
    case 'array': return Array.isArray(value)
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return typeof value === 'number' && Number.isInteger(value)
    case 'boolean': return typeof value === 'boolean'
    case 'null': return value === null
    default: return true
  }
}

function validateSchema(
  schema: JsonSchema,
  value: unknown,
  path: string,
  issues: CesiumToolValidationIssue[],
): void {
  const oneOf = schema.oneOf
  if (Array.isArray(oneOf)) {
    const candidates = oneOf.map((candidate) => {
      const candidateIssues: CesiumToolValidationIssue[] = []
      validateSchema(candidate as JsonSchema, value, path, candidateIssues)
      return candidateIssues
    })
    const matches = candidates.filter(candidate => candidate.length === 0)
    if (matches.length === 1) return
    if (matches.length > 1) {
      addIssue(issues, path, 'must match exactly one allowed schema')
      return
    }
    const closest = [...candidates].sort((left, right) => left.length - right.length)[0]
    if (closest && closest.length > 0) issues.push(...closest)
    else addIssue(issues, path, 'does not match any allowed schema')
    return
  }

  if ('const' in schema && !equals(value, schema.const)) {
    addIssue(issues, path, `must equal ${JSON.stringify(schema.const)}`)
    return
  }

  if (Array.isArray(schema.enum) && !schema.enum.some(item => equals(item, value))) {
    addIssue(issues, path, `must be one of ${schema.enum.map(String).join(', ')}`)
    return
  }

  if (schema.type && !typeMatches(schema.type, value)) {
    addIssue(issues, path, `must be ${String(schema.type)}`)
    return
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      addIssue(issues, path, `must be >= ${schema.minimum}`)
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      addIssue(issues, path, `must be <= ${schema.maximum}`)
    }
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      addIssue(issues, path, `must be > ${schema.exclusiveMinimum}`)
    }
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
      addIssue(issues, path, `must be < ${schema.exclusiveMaximum}`)
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      addIssue(issues, path, `must contain at least ${schema.minLength} characters`)
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      addIssue(issues, path, `must contain at most ${schema.maxLength} characters`)
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
      addIssue(issues, path, `must match ${schema.pattern}`)
    }
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      addIssue(issues, path, 'must be a valid date-time')
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      addIssue(issues, path, `must contain at least ${schema.minItems} items`)
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      addIssue(issues, path, `must contain at most ${schema.maxItems} items`)
    }

    const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : []
    for (let index = 0; index < Math.min(prefixItems.length, value.length); index++) {
      validateSchema(prefixItems[index] as JsonSchema, value[index], `${path}[${index}]`, issues)
    }
    if (isRecord(schema.items)) {
      for (let index = prefixItems.length; index < value.length; index++) {
        validateSchema(schema.items, value[index], `${path}[${index}]`, issues)
      }
    }
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required = Array.isArray(schema.required) ? schema.required : []
    for (const property of required) {
      if (typeof property === 'string' && !(property in value)) {
        addIssue(issues, `${path}.${property}`, 'is required')
      }
    }
    for (const [property, propertyValue] of Object.entries(value)) {
      const propertySchema = properties[property]
      if (isRecord(propertySchema)) {
        validateSchema(propertySchema, propertyValue, `${path}.${property}`, issues)
      } else if (schema.additionalProperties === false) {
        addIssue(issues, `${path}.${property}`, 'is not allowed')
      } else if (isRecord(schema.additionalProperties)) {
        validateSchema(schema.additionalProperties, propertyValue, `${path}.${property}`, issues)
      }
    }
  }
}

export function validateCesiumToolInput(
  name: string,
  input: unknown,
): CesiumToolValidationResult {
  const contract = contractByName.get(name)
  if (!contract) return { knownTool: false, valid: true, issues: [] }

  const issues: CesiumToolValidationIssue[] = []
  validateSchema(contract.inputSchema, input, '$', issues)
  return {
    knownTool: true,
    valid: issues.length === 0,
    issues,
  }
}
