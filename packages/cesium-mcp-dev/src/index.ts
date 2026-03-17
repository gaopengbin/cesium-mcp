/**
 * cesium-mcp-dev — Development-time MCP Server for Cesium
 *
 * 为 IDE 中的 AI 助手提供 Cesium 开发辅助工具：
 * - cesium_api_lookup: 查询 Cesium API 文档
 * - cesium_code_gen: 根据描述生成 Cesium 代码片段
 * - cesium_entity_builder: 交互式构建 Cesium Entity JSON
 *
 * 用法：在 IDE MCP 配置中添加：
 *   { "command": "npx", "args": ["tsx", "path/to/cesium-mcp-dev/src/index.ts"] }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { CESIUM_API_DOCS } from './resources/api-docs.js'
import { ENTITY_TEMPLATES } from './resources/entity-templates.js'
import { CODE_SNIPPETS } from './resources/code-snippets.js'

declare const __VERSION__: string

const server = new McpServer({
  name: 'cesium-mcp-dev',
  version: __VERSION__,
})

// ==================== Tool 1: cesium_api_lookup ====================

server.tool(
  'cesium_api_lookup',
  '查询 Cesium API 文档。输入类名或关键词，返回对应的 API 描述、构造参数、常用方法和示例代码。',
  {
    query: z.string().describe('Cesium 类名或关键词，如 "Viewer"、"Entity"、"Color"、"flyTo"'),
    category: z.enum(['class', 'method', 'property', 'all']).default('all').describe('查询类别'),
  },
  async ({ query, category }) => {
    const q = query.toLowerCase()
    const matches = CESIUM_API_DOCS.filter(doc => {
      const nameMatch = doc.name.toLowerCase().includes(q)
      const descMatch = doc.description.toLowerCase().includes(q)
      const catMatch = category === 'all' || doc.category === category
      return (nameMatch || descMatch) && catMatch
    }).slice(0, 5)

    if (matches.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `未找到与 "${query}" 匹配的 Cesium API。\n\n可用的热门类：Viewer, Entity, Camera, Color, Cartesian3, GeoJsonDataSource, ImageryLayer, Terrain, Material, Clock`,
        }],
      }
    }

    const text = matches.map(doc =>
      `## ${doc.name}\n` +
      `**类别**: ${doc.category}\n` +
      `**描述**: ${doc.description}\n` +
      (doc.ctor ? `**构造函数**: \`${doc.ctor}\`\n` : '') +
      (doc.properties?.length ? `**常用属性**: ${doc.properties.join(', ')}\n` : '') +
      (doc.methods?.length ? `**常用方法**: ${doc.methods.join(', ')}\n` : '') +
      (doc.example ? `\n\`\`\`typescript\n${doc.example}\n\`\`\`\n` : ''),
    ).join('\n---\n\n')

    return { content: [{ type: 'text' as const, text }] }
  },
)

// ==================== Tool 2: cesium_code_gen ====================

server.tool(
  'cesium_code_gen',
  '根据自然语言描述生成 Cesium 代码片段。支持常见场景：视图控制、图层加载、Entity 创建、样式设置等。',
  {
    description: z.string().describe('用自然语言描述需要实现的功能，如 "创建一个红色的点标记在天安门"'),
    language: z.enum(['typescript', 'javascript']).default('typescript').describe('代码语言'),
  },
  async ({ description, language }) => {
    const desc = description.toLowerCase()
    const matched = CODE_SNIPPETS.filter(s =>
      s.keywords.some(k => desc.includes(k)),
    )

    if (matched.length === 0) {
      const fallback = `// Cesium 代码生成\n// 描述: ${description}\n// \n// 提示: 尝试使用更具体的关键词，如:\n// - "飞到" / "flyTo" — 视图飞行\n// - "标记" / "marker" / "点" — 添加标记\n// - "GeoJSON" / "图层" — 加载数据\n// - "热力图" / "heatmap" — 热力可视化\n// - "底图" / "basemap" — 切换底图\n// - "3D Tiles" — 加载 3D 模型`
      return { content: [{ type: 'text' as const, text: fallback }] }
    }

    const text = matched.slice(0, 3).map(s => {
      let code = s.code
      if (language === 'javascript') {
        code = code
          .replace(/: Cesium\.\w+/g, '')
          .replace(/: string/g, '')
          .replace(/: number/g, '')
          .replace(/: boolean/g, '')
          .replace(/as \w+/g, '')
      }
      return `### ${s.title}\n\n\`\`\`${language}\n${code}\n\`\`\``
    }).join('\n\n')

    return { content: [{ type: 'text' as const, text }] }
  },
)

// ==================== Tool 3: cesium_entity_builder ====================

server.tool(
  'cesium_entity_builder',
  '交互式构建 Cesium Entity 配置。选择 Entity 类型（point/billboard/label/polyline/polygon/model），返回完整的 Entity JSON 配置和创建代码。',
  {
    type: z.enum(['point', 'billboard', 'label', 'polyline', 'polygon', 'model', 'ellipse', 'box']).describe('Entity 图形类型'),
    name: z.string().optional().describe('Entity 名称'),
    position: z.object({
      longitude: z.number(),
      latitude: z.number(),
      height: z.number().default(0),
    }).optional().describe('位置（经纬度）'),
    color: z.string().default('#FF0000').describe('颜色（CSS 格式）'),
    size: z.number().optional().describe('尺寸（像素或米）'),
  },
  async ({ type, name, position, color, size }) => {
    const template = ENTITY_TEMPLATES[type]
    if (!template) {
      return { content: [{ type: 'text' as const, text: `不支持的 Entity 类型: ${type}` }] }
    }

    const entityName = name || `My ${type.charAt(0).toUpperCase() + type.slice(1)}`
    const lon = position?.longitude ?? 116.397
    const lat = position?.latitude ?? 39.908
    const h = position?.height ?? 0
    const entitySize = size ?? template.defaultSize

    const code = template.generate({ name: entityName, lon, lat, height: h, color, size: entitySize })

    const text =
      `## Entity: ${entityName}\n` +
      `**类型**: ${type}\n` +
      `**位置**: ${lon}, ${lat}, ${h}m\n` +
      `**颜色**: ${color}\n` +
      `**尺寸**: ${entitySize}\n\n` +
      `\`\`\`typescript\n${code}\n\`\`\``

    return { content: [{ type: 'text' as const, text }] }
  },
)

// ==================== 启动 ====================

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[cesium-mcp-dev] MCP Server running (stdio), 3 tools registered`)
}

main().catch((err) => {
  console.error('[cesium-mcp-dev] Fatal:', err)
  process.exit(1)
})
