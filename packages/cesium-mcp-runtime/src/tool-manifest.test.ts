import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import {
  cesiumBrowserToolsetDefinitions,
  cesiumBrowserToolsetNames,
  cesiumSharedToolNames,
} from 'cesium-mcp-contracts'
import {
  cesiumRuntimeCommandToolNames,
  cesiumRuntimeMetaToolNames,
  cesiumRuntimeOnlyToolNames,
  cesiumRuntimeToolsets,
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
    expect(registeredNames.toSorted()).toEqual(cesiumRuntimeCommandToolNames.toSorted())
  })

  it('matches the concrete MCP discovery registrations', () => {
    for (const name of cesiumRuntimeMetaToolNames) {
      expect(runtimeSource).toMatch(new RegExp(`server\\.tool\\(\\s*'${name}'`))
    }
  })
})
