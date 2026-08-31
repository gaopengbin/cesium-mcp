import {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsetDefinitions,
  cesiumBrowserToolsetNames,
  cesiumExperimentalToolsetNames,
  cesiumExperimentalToolsets,
  cesiumSharedToolNames,
  cesiumResourceToolContracts,
  cesiumObserverToolContracts,
  cesiumSpatialToolContracts,
  getCesiumToolAction,
} from 'cesium-mcp-contracts'
import type {
  CesiumBrowserToolsetName,
  CesiumExperimentalToolsetName,
  CesiumToolLocale,
  JsonSchema,
} from 'cesium-mcp-contracts'

export const cesiumRuntimeOnlyToolNames = ['setIonToken'] as const
export const cesiumRuntimeResourceToolNames = [
  'storeResource',
  'listResources',
  'deleteResource',
] as const
export const cesiumRuntimeMetaToolNames = ['list_toolsets', 'enable_toolset'] as const

export interface CesiumRuntimeToolMetadata {
  action: string
  description: string
  inputSchema: JsonSchema
  outputSchema: JsonSchema
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
  [
    ...cesiumBrowserToolContracts,
    ...cesiumSpatialToolContracts,
    ...cesiumObserverToolContracts,
    ...cesiumResourceToolContracts,
  ]
    .map(contract => [contract.name, contract]),
)

export function getCesiumRuntimeToolMetadata(
  name: string,
  locale: CesiumToolLocale,
): CesiumRuntimeToolMetadata | undefined {
  const contract = sharedContractByName.get(name)
  if (!contract) return undefined

  const localized = contract.localizations[locale]
  return {
    action: getCesiumToolAction(contract),
    description: localized.description,
    inputSchema: contract.inputSchema,
    outputSchema: contract.outputSchema,
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

export function getCesiumRuntimeToolAction(name: string): string {
  const contract = sharedContractByName.get(name)
  return contract ? getCesiumToolAction(contract) : name
}

export type CesiumRuntimeToolsetName =
  | CesiumBrowserToolsetName
  | CesiumExperimentalToolsetName

export const cesiumRuntimeStableToolsetNames: readonly CesiumBrowserToolsetName[] =
  cesiumBrowserToolsetNames

export const cesiumRuntimeExperimentalToolsetNames: readonly CesiumExperimentalToolsetName[] =
  cesiumExperimentalToolsetNames

export const cesiumRuntimeToolsets: Readonly<Record<CesiumRuntimeToolsetName, readonly string[]>> = {
  ...Object.fromEntries(cesiumBrowserToolsetNames.map(name => [
    name,
    name === 'scene'
      ? [...cesiumBrowserToolsetDefinitions[name].names, ...cesiumRuntimeOnlyToolNames]
      : [...cesiumBrowserToolsetDefinitions[name].names],
  ])),
  ...Object.fromEntries(cesiumExperimentalToolsetNames.map(name => [
    name,
    cesiumExperimentalToolsets[name].tools.map(tool => tool.name),
  ])),
} as unknown as Readonly<Record<CesiumRuntimeToolsetName, readonly string[]>>

export const cesiumRuntimeToolsetDescriptions: Readonly<Record<CesiumRuntimeToolsetName, string>> = {
  ...Object.fromEntries(cesiumBrowserToolsetNames.map(name => [
    name,
    cesiumBrowserToolsetDefinitions[name].description,
  ])),
  ...Object.fromEntries(cesiumExperimentalToolsetNames.map(name => [
    name,
    `[Experimental] ${cesiumExperimentalToolsets[name].description}`,
  ])),
} as Readonly<Record<CesiumRuntimeToolsetName, string>>

export const cesiumRuntimeCommandToolNames: readonly string[] = [
  ...cesiumSharedToolNames,
  ...cesiumSpatialToolContracts.map(tool => tool.name),
  ...cesiumObserverToolContracts.map(tool => tool.name),
  ...cesiumRuntimeOnlyToolNames,
  ...cesiumRuntimeResourceToolNames,
]
