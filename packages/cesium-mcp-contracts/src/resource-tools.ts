import type { CesiumToolContract, JsonSchema } from './types'

const metadataSchema: JsonSchema = {
  type: 'object',
  properties: {
    resourceId: { type: 'string' },
    kind: { type: 'string', enum: ['geojson', 'czml', 'json'] },
    sizeBytes: { type: 'integer', minimum: 0 },
    createdAt: { type: 'string' },
    expiresAt: { type: 'string' },
  },
  required: ['resourceId', 'kind', 'sizeBytes', 'createdAt', 'expiresAt'],
  additionalProperties: false,
}

function contract(
  name: string,
  title: string,
  description: string,
  zhDescription: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  annotations: CesiumToolContract['annotations'],
  parameters: Record<string, string>,
  zhParameters: Record<string, string>,
): CesiumToolContract {
  return {
    name,
    title,
    description,
    inputSchema,
    outputSchema,
    annotations,
    localizations: {
      en: { description, parameters },
      'zh-CN': { description: zhDescription, parameters: zhParameters },
    },
  }
}

export const cesiumResourceToolContracts: readonly CesiumToolContract[] = [
  contract(
    'storeResource',
    'Store Resource',
    'Store GeoJSON, CZML, or JSON once and return a compact resourceId for later tool calls.',
    '存储一次 GeoJSON、CZML 或 JSON，并返回可供后续工具调用的短 resourceId。',
    {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['geojson', 'czml', 'json'] },
        data: {},
        resourceId: { type: 'string', minLength: 1, maxLength: 200 },
        ttlSeconds: { type: 'integer', minimum: 1, maximum: 86400, default: 1800 },
      },
      required: ['kind', 'data'],
      additionalProperties: false,
    },
    metadataSchema,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    {
      kind: 'Resource kind.',
      data: 'JSON-serializable resource payload.',
      resourceId: 'Optional caller-provided resource ID.',
      ttlSeconds: 'Lifetime in seconds.',
    },
    {
      kind: '资源类型。',
      data: '可 JSON 序列化的资源内容。',
      resourceId: '可选的自定义资源 ID。',
      ttlSeconds: '资源有效期（秒）。',
    },
  ),
  contract(
    'listResources',
    'List Resources',
    'List resource metadata for the current browser or MCP session without returning payloads.',
    '列出当前浏览器或 MCP 会话的资源元数据，不返回资源正文。',
    { type: 'object', properties: {}, additionalProperties: false },
    {
      type: 'object',
      properties: { resources: { type: 'array', items: metadataSchema } },
      required: ['resources'],
      additionalProperties: false,
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    {},
    {},
  ),
  contract(
    'deleteResource',
    'Delete Resource',
    'Delete one session-scoped resource by resourceId.',
    '按 resourceId 删除一个会话内资源。',
    {
      type: 'object',
      properties: { resourceId: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['resourceId'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { removed: { type: 'boolean' } },
      required: ['removed'],
      additionalProperties: false,
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    { resourceId: 'Resource ID to delete.' },
    { resourceId: '要删除的资源 ID。' },
  ),
]
