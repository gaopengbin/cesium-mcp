import {
  cesiumBrowserToolsetDefinitions,
  cesiumBrowserToolsetNames,
  cesiumSharedToolNames,
} from 'cesium-mcp-contracts'
import type { CesiumBrowserToolsetName } from 'cesium-mcp-contracts'

export const cesiumRuntimeOnlyToolNames = ['setIonToken'] as const
export const cesiumRuntimeMetaToolNames = ['list_toolsets', 'enable_toolset'] as const

export const cesiumRuntimeToolsets: Readonly<
  Record<CesiumBrowserToolsetName, readonly string[]>
> = Object.fromEntries(cesiumBrowserToolsetNames.map(name => [
  name,
  name === 'scene'
    ? [...cesiumBrowserToolsetDefinitions[name].names, ...cesiumRuntimeOnlyToolNames]
    : [...cesiumBrowserToolsetDefinitions[name].names],
])) as unknown as Readonly<Record<CesiumBrowserToolsetName, readonly string[]>>

export const cesiumRuntimeCommandToolNames: readonly string[] = [
  ...cesiumSharedToolNames,
  ...cesiumRuntimeOnlyToolNames,
]
