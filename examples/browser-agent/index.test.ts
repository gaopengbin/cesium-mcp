import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import {
  cesiumBrowserToolContracts,
  cesiumCoreToolContracts,
} from '../../packages/cesium-mcp-contracts/src/index.js'

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8')

describe('browser-agent startup order', () => {
  it('enables the WebMCP origin trial for remote scanners', () => {
    const token = html.match(/<meta http-equiv="origin-trial" content="([^"]+)">/)?.[1]

    expect(token).toBeTruthy()
    const decoded = Buffer.from(token!, 'base64').toString('utf8')
    expect(decoded).toContain('https://cesium-browser-agent.pages.dev:443')
    expect(decoded).toContain('"feature":"WebMCP"')
  })

  it('publishes a branded site icon for directories and browser tabs', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">')
    expect(html).toContain('<meta name="application-name" content="Cesium Agent Lab">')
    expect(html).toContain('https://cesium-browser-agent.pages.dev/favicon.svg')
  })

  it('registers WebMCP without starting Cesium during page load', () => {
    const bootstrapStart = html.indexOf('async function bootstrap()')
    const registration = html.indexOf('await registerPageWebMcpTools()', bootstrapStart)
    const bootstrapEnd = html.indexOf('\n}', bootstrapStart)
    const bootstrap = html.slice(bootstrapStart, bootstrapEnd)

    expect(bootstrapStart).toBeGreaterThan(-1)
    expect(registration).toBeGreaterThan(bootstrapStart)
    expect(bootstrap).not.toContain('initCesium()')
    expect(bootstrap).toContain('armCesiumActivation()')
  })

  it('does not parser-block startup on the remote Cesium script', () => {
    expect(html).not.toContain('<script src="https://cesium.com/downloads/cesiumjs/')
    expect(html).toContain("script.src = CESIUM_SCRIPT_URL")
  })

  it('registers tools without loading the Cesium-dependent bridge bundle', () => {
    expect(html).not.toContain('<script\n    src="../../packages/cesium-mcp-bridge')
    expect(html).toContain('/packages/cesium-mcp-webmcp/dist/cesium-mcp-webmcp.browser.global.js')
    expect(html).toContain("await CesiumMcpWebMcp.registerCesiumWebMcp(executor, { toolsets: 'all' })")
    expect(html).not.toContain('document.modelContext.registerTool')
    expect(html).toContain('loadScript(BRIDGE_SCRIPT_URL)')
  })

  it('publishes typed inputs, coordinate constraints, and result schemas', () => {
    const byName = Object.fromEntries(cesiumCoreToolContracts.map(tool => [tool.name, tool]))

    expect(cesiumCoreToolContracts).toHaveLength(15)
    expect(cesiumBrowserToolContracts).toHaveLength(61)
    expect(cesiumCoreToolContracts.every(tool => tool.outputSchema.type === 'object')).toBe(true)
    expect((byName.flyTo.inputSchema as any).properties.longitude).toMatchObject({ minimum: -180, maximum: 180 })
    expect((byName.flyTo.inputSchema as any).properties.latitude).toMatchObject({ minimum: -90, maximum: 90 })
    expect((byName.addPolyline.inputSchema as any).properties.coordinates.items.prefixItems).toHaveLength(3)
    expect((byName.addGeoJsonLayer.inputSchema as any).properties.data.properties.features.items.properties.geometry.oneOf).toHaveLength(3)
    expect((byName.addGeoJsonLayer.inputSchema as any).properties.style.properties).toHaveProperty('choropleth')
    expect(html).toContain('const TOOL_CONTRACTS = CesiumMcpWebMcp.cesiumCoreToolContracts')
    expect(html).toContain('CesiumMcpWebMcp.cesiumBrowserToolsetNames.map')
    expect(html).toContain('CesiumMcpWebMcp.cesiumBrowserToolsets[toolsetName]')

    const translations = html.slice(
      html.indexOf('const TOOL_DESCRIPTIONS_ZH = {'),
      html.indexOf('const TOOLSET_LABELS_ZH = {'),
    )
    for (const tool of cesiumBrowserToolContracts) {
      expect(translations).toMatch(new RegExp(`\\b${tool.name}:`))
    }
  })

  it('shows hosted AI usage, warning states, and WebMCP fallback copy', () => {
    expect(html).toContain('id="aiUsage"')
    expect(html).toContain('id="aiUsageProgress"')
    expect(html).toContain("fetch('/api/usage'")
    expect(html).toContain("if (err.code === 'AI_BUDGET_EXHAUSTED')")
    expect(html).toContain('WebMCP tools remain available')
    expect(html).toContain('WebMCP 页面工具仍可使用')
  })

  it('routes built-in chat tools while preserving explicit core and full modes', () => {
    expect(html).toContain('<script src="/tool-router.js"></script>')
    expect(html).toContain('id="toolModeSelect"')
    expect(html).toContain("value=\"auto\"")
    expect(html).toContain("value=\"core\"")
    expect(html).toContain("value=\"all\"")
    expect(html).toContain('CesiumToolRouter.resolveToolSelection')
    expect(html).toContain('tools: activeToolSelection.tools')
  })

  it('rewrites the allowlisted HTTP tiles origin for both execution paths', () => {
    expect(html).toContain("'http://jojo1986.cn:8888': 'jojo'")
    expect(html).toContain('function prepareCommandParams(action, params)')
    expect(html).toContain('CesiumToolRouter.rewriteAssetUrl')
    expect(html.match(/prepareCommandParams\(/g)).toHaveLength(3)
  })
})
