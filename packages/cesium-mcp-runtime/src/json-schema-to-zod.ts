import { z } from 'zod'
import type { JsonSchema } from 'cesium-mcp-contracts'

type SchemaObject = Record<string, unknown>

function schemaObject(value: unknown): SchemaObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as SchemaObject
    : {}
}

function literalSchema(values: readonly unknown[]): z.ZodTypeAny {
  const schemas = values.map(value => z.literal(value as z.Primitive))
  if (schemas.length === 0) return z.never()
  if (schemas.length === 1) return schemas[0]!
  return z.union(schemas as [z.ZodLiteral<z.Primitive>, z.ZodLiteral<z.Primitive>, ...z.ZodLiteral<z.Primitive>[]])
}

function stringSchema(schema: SchemaObject): z.ZodTypeAny {
  let result = z.string()
  if (typeof schema.minLength === 'number') result = result.min(schema.minLength)
  if (typeof schema.maxLength === 'number') result = result.max(schema.maxLength)
  if (typeof schema.pattern === 'string') result = result.regex(new RegExp(schema.pattern))
  if (schema.format === 'uri' || schema.format === 'url') result = result.url()
  if (schema.format === 'date-time') result = result.datetime()
  return result
}

function numberSchema(schema: SchemaObject, integer: boolean): z.ZodTypeAny {
  let result = integer ? z.number().int() : z.number()
  if (typeof schema.minimum === 'number') result = result.min(schema.minimum)
  if (typeof schema.maximum === 'number') result = result.max(schema.maximum)
  if (typeof schema.exclusiveMinimum === 'number') result = result.gt(schema.exclusiveMinimum)
  if (typeof schema.exclusiveMaximum === 'number') result = result.lt(schema.exclusiveMaximum)
  return result
}

function arraySchema(schema: SchemaObject): z.ZodTypeAny {
  const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : []
  if (prefixItems.length > 0) {
    const minimum = typeof schema.minItems === 'number' ? schema.minItems : prefixItems.length
    const maximum = typeof schema.maxItems === 'number'
      ? Math.min(schema.maxItems, prefixItems.length)
      : prefixItems.length
    const convertedItems = prefixItems.map(item => zodSchemaFromJsonSchema(schemaObject(item)))
    const variants = Array.from(
      { length: Math.max(0, maximum - minimum + 1) },
      (_, index) => z.tuple(
        convertedItems.slice(0, minimum + index) as [z.ZodTypeAny, ...z.ZodTypeAny[]],
      ),
    )
    if (variants.length === 1) return variants[0]!
    return z.union(variants as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
  }

  let result = z.array(zodSchemaFromJsonSchema(schemaObject(schema.items)))
  if (typeof schema.minItems === 'number') result = result.min(schema.minItems)
  if (typeof schema.maxItems === 'number') result = result.max(schema.maxItems)
  return result
}

function objectSchema(schema: SchemaObject): z.ZodTypeAny {
  const properties = schemaObject(schema.properties)
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  const shape: z.ZodRawShape = {}

  for (const [name, value] of Object.entries(properties)) {
    const propertySchema = schemaObject(value)
    let converted = zodSchemaFromJsonSchema(propertySchema)
    if (!required.has(name) && propertySchema.default === undefined) converted = converted.optional()
    shape[name] = converted
  }

  const result = z.object(shape)
  if (schema.additionalProperties === false) return result.strict()
  if (schema.additionalProperties === true) return result.passthrough()
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    return result.catchall(zodSchemaFromJsonSchema(schemaObject(schema.additionalProperties)))
  }
  if (Object.keys(properties).length === 0) return z.record(z.unknown())
  return result.passthrough()
}

function schemaForType(type: string, schema: SchemaObject): z.ZodTypeAny {
  switch (type) {
    case 'string': return stringSchema(schema)
    case 'number': return numberSchema(schema, false)
    case 'integer': return numberSchema(schema, true)
    case 'boolean': return z.boolean()
    case 'null': return z.null()
    case 'array': return arraySchema(schema)
    case 'object': return objectSchema(schema)
    default: return z.unknown()
  }
}

export function zodSchemaFromJsonSchema(schema: JsonSchema): z.ZodTypeAny {
  const source = schemaObject(schema)
  let result: z.ZodTypeAny

  if ('const' in source) {
    result = z.literal(source.const as z.Primitive)
  } else if (Array.isArray(source.enum)) {
    result = literalSchema(source.enum)
  } else if (Array.isArray(source.oneOf)) {
    const options = source.oneOf.map(option => zodSchemaFromJsonSchema(schemaObject(option)))
    result = options.length === 1
      ? options[0]!
      : z.union(options as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
  } else if (Array.isArray(source.type)) {
    const options = source.type.map(type => schemaForType(String(type), source))
    result = options.length === 1
      ? options[0]!
      : z.union(options as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
  } else if (typeof source.type === 'string') {
    result = schemaForType(source.type, source)
  } else if (source.properties || source.additionalProperties !== undefined) {
    result = objectSchema(source)
  } else {
    result = z.unknown()
  }

  if (source.default !== undefined) result = result.default(source.default)
  if (typeof source.description === 'string') result = result.describe(source.description)
  return result
}

export function zodObjectFromJsonSchema(schema: JsonSchema): z.AnyZodObject {
  const converted = zodSchemaFromJsonSchema(schema)
  if (!(converted instanceof z.ZodObject)) {
    throw new Error('Cesium tool input schema must be a JSON Schema object')
  }
  return converted
}
