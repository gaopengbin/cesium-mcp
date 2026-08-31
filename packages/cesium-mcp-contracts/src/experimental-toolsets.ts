import { cesiumSpatialToolContracts } from './spatial-tools.js'
import { cesiumObserverToolContracts } from './observer-tools.js'
import type { CesiumToolContract } from './types.js'

export const cesiumExperimentalToolsetNames = ['perception', 'observer'] as const

export type CesiumExperimentalToolsetName = typeof cesiumExperimentalToolsetNames[number]

export interface CesiumExperimentalToolset {
  name: CesiumExperimentalToolsetName
  description: string
  tools: readonly CesiumToolContract[]
}

export const cesiumExperimentalToolsets: Readonly<
  Record<CesiumExperimentalToolsetName, CesiumExperimentalToolset>
> = {
  perception: {
    name: 'perception',
    description: 'Experimental scene grounding, spatial object discovery, and evidence-aware relations',
    tools: cesiumSpatialToolContracts,
  },
  observer: {
    name: 'observer',
    description: 'Independent observer-camera rendering without moving the application camera',
    tools: cesiumObserverToolContracts,
  },
}

export function selectCesiumExperimentalToolContracts(
  selection: CesiumExperimentalToolsetName | readonly CesiumExperimentalToolsetName[] = 'perception',
): readonly CesiumToolContract[] {
  if (typeof selection === 'string') return cesiumExperimentalToolsets[selection].tools

  const selected = new Map<string, CesiumToolContract>()
  for (const toolsetName of selection) {
    for (const tool of cesiumExperimentalToolsets[toolsetName].tools) {
      selected.set(tool.name, tool)
    }
  }
  return [...selected.values()]
}
