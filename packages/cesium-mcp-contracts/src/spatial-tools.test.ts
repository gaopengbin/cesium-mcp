import { describe, expect, it } from 'vitest'
import {
  cesiumBrowserToolContracts,
  cesiumExperimentalToolsets,
  cesiumSpatialToolContracts,
  selectCesiumExperimentalToolContracts,
  validateCesiumToolInput,
} from './index.js'

describe('experimental spatial tool contracts', () => {
  it('keeps perception separate from the stable browser inventory', () => {
    expect(cesiumSpatialToolContracts.map(tool => tool.name)).toEqual([
      'observeScene',
      'describeScene',
      'querySpatialObjects',
      'getObjectContext',
      'querySpatialRelation',
      'getViewContext',
    ])
    expect(cesiumBrowserToolContracts).toHaveLength(61)
    expect(cesiumBrowserToolContracts.some(tool =>
      cesiumSpatialToolContracts.some(spatial => spatial.name === tool.name),
    )).toBe(false)
    expect(cesiumExperimentalToolsets.perception.tools).toBe(cesiumSpatialToolContracts)
    expect(selectCesiumExperimentalToolContracts()).toBe(cesiumSpatialToolContracts)
  })

  it('provides bilingual metadata and validates perception inputs', () => {
    for (const tool of cesiumSpatialToolContracts) {
      expect(tool.annotations.readOnlyHint).toBe(true)
      expect(tool.localizations.en.description).toBeTruthy()
      expect(tool.localizations['zh-CN'].description).toBeTruthy()
    }

    expect(validateCesiumToolInput('querySpatialRelation', {
      subjectId: 'school_1',
      objectId: 'flood_zone_1',
      relation: 'within',
    })).toMatchObject({ knownTool: true, valid: true })
    expect(validateCesiumToolInput('querySpatialRelation', {
      subjectId: 'school_1',
      objectId: 'flood_zone_1',
      relation: 'touches',
    })).toMatchObject({ knownTool: true, valid: false })
    expect(validateCesiumToolInput('observeScene', {
      scope: 'view',
      imageMode: 'auto',
      includeObjects: true,
      limit: 25,
    })).toMatchObject({ knownTool: true, valid: true })
    expect(validateCesiumToolInput('observeScene', {
      imageMode: 'sometimes',
    })).toMatchObject({ knownTool: true, valid: false })
  })
})
