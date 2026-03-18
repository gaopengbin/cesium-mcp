import * as Cesium from 'cesium'
import type { SetSceneOptionsParams, SetPostProcessParams } from '../types'
import { parseColor } from '../utils'

export function setSceneOptions(viewer: Cesium.Viewer, params: SetSceneOptionsParams): void {
  const { scene } = viewer

  // Fog
  if (params.fogEnabled !== undefined) scene.fog.enabled = params.fogEnabled
  if (params.fogDensity !== undefined) scene.fog.density = params.fogDensity
  if (params.fogMinimumBrightness !== undefined) scene.fog.minimumBrightness = params.fogMinimumBrightness

  // Sky Atmosphere
  if (scene.skyAtmosphere) {
    if (params.skyAtmosphereShow !== undefined) scene.skyAtmosphere.show = params.skyAtmosphereShow
    if (params.skyAtmosphereHueShift !== undefined) scene.skyAtmosphere.hueShift = params.skyAtmosphereHueShift
    if (params.skyAtmosphereSaturationShift !== undefined) scene.skyAtmosphere.saturationShift = params.skyAtmosphereSaturationShift
    if (params.skyAtmosphereBrightnessShift !== undefined) scene.skyAtmosphere.brightnessShift = params.skyAtmosphereBrightnessShift
  }

  // Ground Atmosphere
  if (params.groundAtmosphereShow !== undefined) scene.globe.showGroundAtmosphere = params.groundAtmosphereShow

  // Shadows
  if (params.shadowsEnabled !== undefined) viewer.shadows = params.shadowsEnabled
  if (params.shadowsSoftShadows !== undefined) scene.shadowMap.softShadows = params.shadowsSoftShadows
  if (params.shadowsDarkness !== undefined) scene.shadowMap.darkness = params.shadowsDarkness

  // Sun & Moon
  if (scene.sun && params.sunShow !== undefined) scene.sun.show = params.sunShow
  if (scene.sun && params.sunGlowFactor !== undefined) scene.sun.glowFactor = params.sunGlowFactor
  if (scene.moon && params.moonShow !== undefined) scene.moon.show = params.moonShow

  // Globe
  if (params.depthTestAgainstTerrain !== undefined) scene.globe.depthTestAgainstTerrain = params.depthTestAgainstTerrain

  // Background Color
  if (params.backgroundColor !== undefined) scene.backgroundColor = parseColor(params.backgroundColor)
}

export function setPostProcess(viewer: Cesium.Viewer, params: SetPostProcessParams): void {
  const stages = viewer.scene.postProcessStages

  // Bloom
  if (params.bloom !== undefined) stages.bloom.enabled = params.bloom
  if (params.bloom || stages.bloom.enabled) {
    const bloom = stages.bloom
    if (params.bloomContrast !== undefined) bloom.uniforms.contrast = params.bloomContrast
    if (params.bloomBrightness !== undefined) bloom.uniforms.brightness = params.bloomBrightness
    if (params.bloomDelta !== undefined) bloom.uniforms.delta = params.bloomDelta
    if (params.bloomSigma !== undefined) bloom.uniforms.sigma = params.bloomSigma
    if (params.bloomStepSize !== undefined) bloom.uniforms.stepSize = params.bloomStepSize
    if (params.bloomGlowOnly !== undefined) bloom.uniforms.glowOnly = params.bloomGlowOnly
  }

  // Ambient Occlusion (SSAO)
  if (params.ambientOcclusion !== undefined) stages.ambientOcclusion.enabled = params.ambientOcclusion
  if (params.ambientOcclusion || stages.ambientOcclusion.enabled) {
    const ao = stages.ambientOcclusion
    if (params.aoIntensity !== undefined) ao.uniforms.intensity = params.aoIntensity
    if (params.aoBias !== undefined) ao.uniforms.bias = params.aoBias
    if (params.aoLengthCap !== undefined) ao.uniforms.lengthCap = params.aoLengthCap
    if (params.aoStepSize !== undefined) ao.uniforms.stepSize = params.aoStepSize
  }

  // FXAA
  if (params.fxaa !== undefined) stages.fxaa.enabled = params.fxaa
}
