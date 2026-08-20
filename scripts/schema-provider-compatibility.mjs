const ROOT_UNION_KEYS = ['oneOf', 'anyOf', 'allOf']
const CHILD_SCHEMA_KEYS = [
  'items',
  'additionalProperties',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'propertyNames',
]
const CHILD_SCHEMA_MAP_KEYS = [
  'properties',
  'patternProperties',
  'dependentSchemas',
  '$defs',
  'definitions',
]
const CHILD_SCHEMA_LIST_KEYS = [
  'prefixItems',
  ...ROOT_UNION_KEYS,
]

export function auditProviderToolSchema({ surface, toolName, schema }) {
  const issues = []
  const addIssue = (providers, rule, path, message) => {
    issues.push({ surface, toolName, providers, rule, path, message })
  }

  try {
    JSON.stringify(schema)
  } catch (error) {
    addIssue(
      ['OpenAI', 'Azure OpenAI', 'VS Code MCP', 'WebMCP'],
      'json-serializable',
      '$',
      `schema is not JSON serializable: ${error instanceof Error ? error.message : String(error)}`,
    )
    return issues
  }

  if (!schema || typeof schema !== 'object' || schema.type !== 'object') {
    addIssue(
      ['OpenAI', 'Azure OpenAI', 'VS Code MCP'],
      'root-object',
      '$',
      'tool input schema must have root type "object"',
    )
  }
  for (const key of ROOT_UNION_KEYS) {
    if (schema && typeof schema === 'object' && key in schema) {
      addIssue(
        ['OpenAI', 'Azure OpenAI'],
        'root-union',
        `$.${key}`,
        `tool input schema must not use root-level ${key}`,
      )
    }
  }

  visitSchema(schema, '$', (node, path) => {
    if ('$schema' in node) {
      addIssue(
        ['OpenAI', 'Azure OpenAI', 'WebMCP'],
        'schema-pointer',
        `${path}.$schema`,
        'published tool schemas must not include a $schema meta-schema pointer',
      )
    }
    if (node.type === 'array' && !('items' in node)) {
      addIssue(
        ['VS Code MCP'],
        'array-items',
        path,
        'array schemas must declare items, including tuples that use prefixItems',
      )
    }
  })

  return issues
}

export function auditProviderToolSurfaces(surfaces) {
  const issues = []
  for (const [surface, tools] of Object.entries(surfaces)) {
    for (const tool of tools) {
      issues.push(...auditProviderToolSchema({
        surface,
        toolName: tool.name,
        schema: tool.inputSchema,
      }))
    }
  }
  return issues
}

function visitSchema(value, path, visitor) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  visitor(value, path)

  for (const key of CHILD_SCHEMA_KEYS) {
    if (value[key] && typeof value[key] === 'object') {
      visitSchema(value[key], `${path}.${key}`, visitor)
    }
  }
  for (const key of CHILD_SCHEMA_MAP_KEYS) {
    const children = value[key]
    if (!children || typeof children !== 'object' || Array.isArray(children)) continue
    for (const [name, child] of Object.entries(children)) {
      visitSchema(child, `${path}.${key}.${name}`, visitor)
    }
  }
  for (const key of CHILD_SCHEMA_LIST_KEYS) {
    const children = value[key]
    if (!Array.isArray(children)) continue
    for (const [index, child] of children.entries()) {
      visitSchema(child, `${path}.${key}[${index}]`, visitor)
    }
  }
}
