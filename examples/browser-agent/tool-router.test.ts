import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'
import {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsets,
  cesiumCoreToolContracts,
} from '../../packages/cesium-mcp-contracts/src/index.js'

const context: Record<string, any> = {}
context.globalThis = context
runInNewContext(
  readFileSync(new URL('./tool-router.js', import.meta.url), 'utf8'),
  context,
)

const router = context.CesiumToolRouter
const contracts = {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsets,
  cesiumCoreToolContracts,
}

describe('browser-agent tool router', () => {
  it('routes Chinese and English 3D data requests to the tiles bundle', () => {
    for (const prompt of [
      '加载这个 tileset：http://localhost/data/tileset.json',
      'Load a 3D Tiles dataset and zoom to it',
    ]) {
      const selection = router.resolveToolSelection(prompt, 'auto', contracts)

      expect(selection.toolsetNames).toEqual(['tiles', 'view', 'interaction', 'geolocation'])
      expect(selection.tools.map((tool: any) => tool.name)).toContain('load3dTiles')
      expect(selection.tools).toHaveLength(19)
    }
  })

  it('keeps common layer and animation requests within the automatic tool budget', () => {
    const layer = router.resolveToolSelection('添加 GeoJSON 图层并设置样式', 'auto', contracts)
    const animation = router.resolveToolSelection('创建一个沿路径飞行的动画', 'auto', contracts)

    expect(layer.toolsetNames).toEqual(['layer', 'view', 'geolocation'])
    expect(layer.tools).toHaveLength(18)
    expect(animation.toolsetNames).toEqual(['animation', 'entity', 'geolocation'])
    expect(animation.tools).toHaveLength(19)
  })

  it('falls back to core tools and supports explicit toolset or full selection', () => {
    expect(router.resolveToolSelection('你好', 'auto', contracts).tools).toHaveLength(15)
    expect(router.resolveToolSelection('', 'core', contracts).tools).toHaveLength(15)
    expect(router.resolveToolSelection('', 'toolset:tiles', contracts).tools).toHaveLength(7)
    expect(router.resolveToolSelection('', 'all', contracts).tools).toHaveLength(61)
  })
})
