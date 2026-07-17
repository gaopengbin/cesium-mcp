import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsetDefinitions,
  cesiumBrowserToolsetNames,
  cesiumSharedToolNames,
} from 'cesium-mcp-contracts'
import {
  cesiumRuntimeCommandToolNames,
  cesiumRuntimeMetaToolNames,
  cesiumRuntimeOnlyToolNames,
  cesiumRuntimeToolsetDescriptions,
  cesiumRuntimeToolsets,
  getCesiumRuntimeToolMetadata,
} from './tool-manifest.js'

describe('runtime tool manifest', () => {
  const runtimeSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

  it('derives every shared toolset from the canonical contracts package', () => {
    for (const name of cesiumBrowserToolsetNames) {
      const runtimeNames = cesiumRuntimeToolsets[name]
      const sharedNames = cesiumBrowserToolsetDefinitions[name].names

      expect(runtimeNames.slice(0, sharedNames.length)).toEqual(sharedNames)
      if (name !== 'scene') expect(runtimeNames).toHaveLength(sharedNames.length)
    }
  })

  it('derives localized registration metadata from the canonical contracts', () => {
    for (const contract of cesiumBrowserToolContracts) {
      const metadata = getCesiumRuntimeToolMetadata(contract.name, 'en')!
      expect(metadata.description).toBe(contract.description)
      expect(metadata.inputSchema).toBe(contract.inputSchema)
      expect(metadata.annotations).toEqual({
        title: contract.title,
        readOnlyHint: contract.annotations.readOnlyHint,
        destructiveHint: contract.annotations.destructiveHint,
        idempotentHint: contract.annotations.idempotentHint,
        openWorldHint: contract.annotations.openWorldHint,
      })
    }

    const chineseGaussian = getCesiumRuntimeToolMetadata('load3dGaussianSplat', 'zh-CN')!
    expect(chineseGaussian.description).toContain('高斯泼溅')
    expect(chineseGaussian.parameterDescriptions.url).toContain('tileset.json')
    expect(getCesiumRuntimeToolMetadata('setIonToken', 'en')).toBeUndefined()
  })

  it('reuses canonical toolset descriptions', () => {
    for (const name of cesiumBrowserToolsetNames) {
      expect(cesiumRuntimeToolsetDescriptions[name]).toBe(
        cesiumBrowserToolsetDefinitions[name].description,
      )
    }
  })

  it('keeps the credential tool as the only runtime-specific Cesium command', () => {
    expect(cesiumRuntimeOnlyToolNames).toEqual(['setIonToken'])
    expect(cesiumRuntimeToolsets.scene).toEqual([
      ...cesiumBrowserToolsetDefinitions.scene.names,
      'setIonToken',
    ])
    expect(cesiumRuntimeCommandToolNames).toEqual([
      ...cesiumSharedToolNames,
      'setIonToken',
    ])
  })

  it('keeps MCP discovery tools outside the Cesium command inventory', () => {
    expect(cesiumRuntimeMetaToolNames).toEqual(['list_toolsets', 'enable_toolset'])
    expect(cesiumRuntimeMetaToolNames.some(name => cesiumRuntimeCommandToolNames.includes(name))).toBe(false)
  })

  it('does not publish duplicate command names', () => {
    expect(new Set(cesiumRuntimeCommandToolNames).size).toBe(cesiumRuntimeCommandToolNames.length)
  })

  it('matches every concrete runtime command registration', () => {
    const registeredNames = [...runtimeSource.matchAll(/_registerTool\(\s*'([^']+)'/g)]
      .map(match => match[1]!)

    expect(new Set(registeredNames).size).toBe(registeredNames.length)
    expect([...registeredNames].sort()).toEqual([...cesiumRuntimeCommandToolNames].sort())
  })

  it('builds shared runtime validation from canonical JSON Schema', () => {
    expect(runtimeSource).toContain('zodObjectFromJsonSchema(metadata.inputSchema)')
  })

  it('matches the concrete MCP discovery registrations', () => {
    for (const name of cesiumRuntimeMetaToolNames) {
      expect(runtimeSource).toMatch(new RegExp(`server\\.tool\\(\\s*'${name}'`))
    }
  })
})
