import { describe, expect, it } from 'vitest'
import {
  cesiumBrowserToolContracts,
  cesiumExperimentalToolsetNames,
  cesiumExperimentalToolsets,
  cesiumObserverToolContracts,
  cesiumSpatialToolContracts,
  selectCesiumExperimentalToolContracts,
  validateCesiumToolInput,
  validateCesiumToolOutput,
} from './index.js'

describe('experimental observer tool contracts', () => {
  it('keeps observer capture outside the stable browser inventory', () => {
    expect(cesiumExperimentalToolsetNames).toEqual(['perception', 'observer'])
    expect(cesiumObserverToolContracts.map(tool => tool.name)).toEqual([
      'captureObserverView',
    ])
    expect(cesiumExperimentalToolsets.observer.tools).toBe(cesiumObserverToolContracts)
    expect(cesiumBrowserToolContracts.some(tool =>
      cesiumObserverToolContracts.some(observer => observer.name === tool.name),
    )).toBe(false)
    expect(selectCesiumExperimentalToolContracts(['perception', 'observer'])).toEqual([
      ...cesiumSpatialToolContracts,
      ...cesiumObserverToolContracts,
    ])
  })

  it('validates bounded camera targets and structured image evidence', () => {
    const contract = cesiumObserverToolContracts[0]!
    expect(contract.annotations.readOnlyHint).toBe(true)
    expect(contract.localizations.en.description).toContain('independent')
    expect(contract.localizations['zh-CN'].description).toContain('独立')

    expect(validateCesiumToolInput('captureObserverView', {
      targetLongitude: 116.4,
      targetLatitude: 39.9,
      range: 3500,
      imageWidth: 1024,
      imageHeight: 576,
    })).toMatchObject({ knownTool: true, valid: true })
    expect(validateCesiumToolInput('captureObserverView', {
      targetObjectId: 'entity:scene:school',
      preset: 'detail',
      imageWidth: 1024,
      imageHeight: 576,
    })).toMatchObject({ knownTool: true, valid: true })
    expect(validateCesiumToolInput('captureObserverView', {}))
      .toMatchObject({ knownTool: true, valid: false })
    expect(validateCesiumToolInput('captureObserverView', {
      targetObjectId: 'entity:scene:school',
      targetLongitude: 116.4,
      targetLatitude: 39.9,
    })).toMatchObject({ knownTool: true, valid: false })
    expect(validateCesiumToolInput('captureObserverView', {
      targetLongitude: 116.4,
      targetLatitude: 39.9,
      pitch: 15,
    })).toMatchObject({ knownTool: true, valid: false })

    expect(validateCesiumToolOutput('captureObserverView', {
      success: true,
      data: {
        dataUrl: `data:image/png;base64,${'a'.repeat(32)}`,
        width: 1024,
        height: 576,
        camera: {
          longitude: 116.38,
          latitude: 39.88,
          height: 2400,
          heading: 35,
          pitch: -25,
          roll: 0,
        },
        target: {
          targetObjectId: 'entity:scene:school',
          preset: 'detail',
          longitude: 116.4,
          latitude: 39.9,
          height: 0,
          range: 3500,
          heading: 225,
          pitch: -35,
        },
        observedAt: '2026-08-27T00:00:00.000Z',
        bounds: [116.35, 39.85, 116.45, 39.95],
        visibleObjectIds: ['entity:scene:school'],
        objectCount: 1,
        quality: 'derived',
        basis: 'observer-viewer-spatial-snapshot',
        readiness: {
          state: 'ready',
          framesRendered: 8,
          stableFrameCount: 3,
          dataSourcesReady: true,
          globeTilesLoaded: true,
          frameHasContent: true,
        },
        userCameraUnchanged: true,
        limitations: ['Managed geometry only.'],
      },
      message: 'Independent observer view captured',
    })).toMatchObject({ knownTool: true, valid: true })
  })
})
