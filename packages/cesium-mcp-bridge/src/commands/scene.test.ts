import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('cesium', () => ({
  Color: {
    fromCssColorString: (s: string) => ({ _css: s }),
  },
  default: {},
}))

// Mock parseColor used in scene.ts
vi.mock('../utils', () => ({
  parseColor: (s: string) => ({ _css: s }),
}))

import { setSceneOptions, setPostProcess } from './scene.js'

function makeViewer() {
  return {
    shadows: false,
    scene: {
      fog: { enabled: true, density: 0.0002, minimumBrightness: 0.03 },
      skyAtmosphere: { show: true, hueShift: 0, saturationShift: 0, brightnessShift: 0 },
      globe: {
        showGroundAtmosphere: true,
        depthTestAgainstTerrain: false,
      },
      shadowMap: { softShadows: false, darkness: 0.3 },
      sun: { show: true, glowFactor: 1.0 },
      moon: { show: true },
      backgroundColor: null as any,
      postProcessStages: {
        bloom: { enabled: false, uniforms: { contrast: 128, brightness: -0.3, delta: 1.0, sigma: 3.78, stepSize: 5.0, glowOnly: false } },
        ambientOcclusion: { enabled: false, uniforms: { intensity: 3.0, bias: 0.1, lengthCap: 0.26, stepSize: 1.95 } },
        fxaa: { enabled: false },
      },
    },
  } as any
}

describe('setSceneOptions', () => {
  let viewer: ReturnType<typeof makeViewer>

  beforeEach(() => {
    viewer = makeViewer()
  })

  it('should toggle fog', () => {
    setSceneOptions(viewer, { fogEnabled: false, fogDensity: 0.001 })
    expect(viewer.scene.fog.enabled).toBe(false)
    expect(viewer.scene.fog.density).toBe(0.001)
  })

  it('should set fog minimum brightness', () => {
    setSceneOptions(viewer, { fogMinimumBrightness: 0.5 })
    expect(viewer.scene.fog.minimumBrightness).toBe(0.5)
  })

  it('should configure sky atmosphere', () => {
    setSceneOptions(viewer, {
      skyAtmosphereShow: false,
      skyAtmosphereHueShift: 0.5,
      skyAtmosphereSaturationShift: -0.3,
      skyAtmosphereBrightnessShift: 0.2,
    })
    expect(viewer.scene.skyAtmosphere.show).toBe(false)
    expect(viewer.scene.skyAtmosphere.hueShift).toBe(0.5)
    expect(viewer.scene.skyAtmosphere.saturationShift).toBe(-0.3)
    expect(viewer.scene.skyAtmosphere.brightnessShift).toBe(0.2)
  })

  it('should toggle ground atmosphere', () => {
    setSceneOptions(viewer, { groundAtmosphereShow: false })
    expect(viewer.scene.globe.showGroundAtmosphere).toBe(false)
  })

  it('should toggle shadows', () => {
    setSceneOptions(viewer, { shadowsEnabled: true, shadowsSoftShadows: true, shadowsDarkness: 0.7 })
    expect(viewer.shadows).toBe(true)
    expect(viewer.scene.shadowMap.softShadows).toBe(true)
    expect(viewer.scene.shadowMap.darkness).toBe(0.7)
  })

  it('should toggle sun and moon', () => {
    setSceneOptions(viewer, { sunShow: false, sunGlowFactor: 2.0, moonShow: false })
    expect(viewer.scene.sun.show).toBe(false)
    expect(viewer.scene.sun.glowFactor).toBe(2.0)
    expect(viewer.scene.moon.show).toBe(false)
  })

  it('should set depth test against terrain', () => {
    setSceneOptions(viewer, { depthTestAgainstTerrain: true })
    expect(viewer.scene.globe.depthTestAgainstTerrain).toBe(true)
  })

  it('should set background color', () => {
    setSceneOptions(viewer, { backgroundColor: '#FF0000' })
    expect(viewer.scene.backgroundColor).toEqual({ _css: '#FF0000' })
  })

  it('should handle missing skyAtmosphere gracefully', () => {
    viewer.scene.skyAtmosphere = null
    expect(() => setSceneOptions(viewer, { skyAtmosphereShow: false })).not.toThrow()
  })

  it('should handle missing sun/moon gracefully', () => {
    viewer.scene.sun = null
    viewer.scene.moon = null
    expect(() => setSceneOptions(viewer, { sunShow: false, moonShow: false })).not.toThrow()
  })

  it('should apply multiple options at once', () => {
    setSceneOptions(viewer, {
      fogEnabled: false,
      shadowsEnabled: true,
      depthTestAgainstTerrain: true,
      moonShow: false,
    })
    expect(viewer.scene.fog.enabled).toBe(false)
    expect(viewer.shadows).toBe(true)
    expect(viewer.scene.globe.depthTestAgainstTerrain).toBe(true)
    expect(viewer.scene.moon.show).toBe(false)
  })

  it('should not modify unspecified properties', () => {
    const originalDensity = viewer.scene.fog.density
    setSceneOptions(viewer, { fogEnabled: false })
    expect(viewer.scene.fog.density).toBe(originalDensity)
  })
})

describe('setPostProcess', () => {
  let viewer: ReturnType<typeof makeViewer>

  beforeEach(() => {
    viewer = makeViewer()
  })

  it('should enable bloom', () => {
    setPostProcess(viewer, { bloom: true, bloomContrast: 200 })
    expect(viewer.scene.postProcessStages.bloom.enabled).toBe(true)
    expect(viewer.scene.postProcessStages.bloom.uniforms.contrast).toBe(200)
  })

  it('should configure bloom parameters', () => {
    setPostProcess(viewer, {
      bloom: true,
      bloomBrightness: -0.5,
      bloomDelta: 2.0,
      bloomSigma: 5.0,
      bloomStepSize: 3.0,
      bloomGlowOnly: true,
    })
    const bloom = viewer.scene.postProcessStages.bloom
    expect(bloom.enabled).toBe(true)
    expect(bloom.uniforms.brightness).toBe(-0.5)
    expect(bloom.uniforms.delta).toBe(2.0)
    expect(bloom.uniforms.sigma).toBe(5.0)
    expect(bloom.uniforms.stepSize).toBe(3.0)
    expect(bloom.uniforms.glowOnly).toBe(true)
  })

  it('should enable ambient occlusion', () => {
    setPostProcess(viewer, { ambientOcclusion: true, aoIntensity: 5.0 })
    expect(viewer.scene.postProcessStages.ambientOcclusion.enabled).toBe(true)
    expect(viewer.scene.postProcessStages.ambientOcclusion.uniforms.intensity).toBe(5.0)
  })

  it('should configure AO parameters', () => {
    setPostProcess(viewer, {
      ambientOcclusion: true,
      aoBias: 0.2,
      aoLengthCap: 0.5,
      aoStepSize: 3.0,
    })
    const ao = viewer.scene.postProcessStages.ambientOcclusion
    expect(ao.uniforms.bias).toBe(0.2)
    expect(ao.uniforms.lengthCap).toBe(0.5)
    expect(ao.uniforms.stepSize).toBe(3.0)
  })

  it('should toggle FXAA', () => {
    setPostProcess(viewer, { fxaa: true })
    expect(viewer.scene.postProcessStages.fxaa.enabled).toBe(true)
  })

  it('should disable bloom', () => {
    viewer.scene.postProcessStages.bloom.enabled = true
    setPostProcess(viewer, { bloom: false })
    expect(viewer.scene.postProcessStages.bloom.enabled).toBe(false)
  })

  it('should apply multiple effects at once', () => {
    setPostProcess(viewer, { bloom: true, ambientOcclusion: true, fxaa: true })
    expect(viewer.scene.postProcessStages.bloom.enabled).toBe(true)
    expect(viewer.scene.postProcessStages.ambientOcclusion.enabled).toBe(true)
    expect(viewer.scene.postProcessStages.fxaa.enabled).toBe(true)
  })
})
