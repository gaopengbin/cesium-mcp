import {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsetDefinitions,
  cesiumBrowserToolsetNames,
  cesiumSharedToolNames,
} from 'cesium-mcp-contracts'
import type {
  CesiumBrowserToolsetName,
  CesiumToolLocale,
} from 'cesium-mcp-contracts'

export const cesiumRuntimeOnlyToolNames = ['setIonToken'] as const
export const cesiumRuntimeMetaToolNames = ['list_toolsets', 'enable_toolset'] as const

export interface CesiumRuntimeToolMetadata {
  description: string
  parameterDescriptions: Readonly<Record<string, string>>
  annotations: {
    title: string
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
  }
}

const sharedContractByName = new Map(
  cesiumBrowserToolContracts.map(contract => [contract.name, contract]),
)

export function getCesiumRuntimeToolMetadata(
  name: string,
  locale: CesiumToolLocale,
): CesiumRuntimeToolMetadata | undefined {
  const contract = sharedContractByName.get(name)
  if (!contract) return undefined

  const localized = contract.localizations[locale]
  return {
    description: localized.description,
    parameterDescriptions: localized.parameters,
    annotations: {
      title: contract.title,
      readOnlyHint: contract.annotations.readOnlyHint ?? false,
      destructiveHint: contract.annotations.destructiveHint ?? false,
      idempotentHint: contract.annotations.idempotentHint ?? false,
      openWorldHint: contract.annotations.openWorldHint ?? false,
    },
  }
}

export const cesiumRuntimeToolsets: Readonly<
  Record<CesiumBrowserToolsetName, readonly string[]>
> = Object.fromEntries(cesiumBrowserToolsetNames.map(name => [
  name,
  name === 'scene'
    ? [...cesiumBrowserToolsetDefinitions[name].names, ...cesiumRuntimeOnlyToolNames]
    : [...cesiumBrowserToolsetDefinitions[name].names],
])) as unknown as Readonly<Record<CesiumBrowserToolsetName, readonly string[]>>

export const cesiumRuntimeToolsetDescriptions: Readonly<Record<CesiumBrowserToolsetName, string>> =
  Object.fromEntries(cesiumBrowserToolsetNames.map(name => [
    name,
    cesiumBrowserToolsetDefinitions[name].description,
  ])) as unknown as Readonly<Record<CesiumBrowserToolsetName, string>>

export const cesiumRuntimeCommandToolNames: readonly string[] = [
  ...cesiumSharedToolNames,
  ...cesiumRuntimeOnlyToolNames,
]
