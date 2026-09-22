import { t } from './i18n.js'
import { Cesium3DTileset, Credit, IonResource, JulianDate, createGooglePhotorealistic3DTileset } from 'cesium'
import type { Viewer } from 'cesium'
import { loadUrbanBuildings, watchUrbanVisualState } from './urban-scene.js'
import type { UrbanVisualState } from './urban-scene.js'
import { addUrbanWhiteBuildings } from './urban-white-buildings.js'
import type { UrbanBuildingMesh } from './urban-building-mesh.js'

export type UrbanBuildingSource = 'white' | 'plateau' | 'google'
export interface UrbanBuildingCredentials {
  googleMapsApiKey?: string
  cesiumIonToken?: string
}

export function resolveUrbanBuildingSource(requested: string | null, credentials: UrbanBuildingCredentials) {
  const googleAvailable = Boolean(credentials.googleMapsApiKey?.trim() || credentials.cesiumIonToken?.trim())
  const source: UrbanBuildingSource = requested === 'plateau' ? 'plateau'
    : requested === 'google' && googleAvailable ? 'google' : 'white'
  return {
    source,
    googleAvailable,
    navigationAvailable: source !== 'google',
    notice: requested === 'google' && !googleAvailable ? t('Google 3D 未配置访问凭据，当前显示本地白模。') : '',
  }
}

export const URBAN_SOURCE_LABELS = { white: t('轻量白模'), plateau: t('PLATEAU 实景'), google: t('Google 3D · 浏览') }
export const GRAY_BASEMAP_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
export const GRAY_BASEMAP_CREDIT = 'Esri, HERE, Garmin, (c) OpenStreetMap contributors, and the GIS user community'

export async function loadUrbanBuildingLayer(
  viewer: Viewer,
  mesh: UrbanBuildingMesh,
  source: UrbanBuildingSource,
  credentials: UrbanBuildingCredentials,
  onState: (state: UrbanVisualState) => void,
): Promise<() => void> {
  if (source === 'plateau') {
    let stopWatching: (() => void) | undefined
    const buildings = await loadUrbanBuildings(viewer, onState, cleanup => { stopWatching = cleanup })
    return () => {
      stopWatching?.()
      if (!viewer.isDestroyed()) viewer.scene.primitives.remove(buildings)
    }
  }
  if (source === 'google') {
    // Never fall back to Cesium's shared example credential.
    if (!resolveUrbanBuildingSource('google', credentials).googleAvailable) throw new Error(t('Google 3D 需要配置访问凭据'))
    const options = { maximumScreenSpaceError: 24, cacheBytes: 512 * 1024 * 1024, maximumCacheOverflowBytes: 128 * 1024 * 1024 }
    const buildings = credentials.googleMapsApiKey?.trim()
      ? await createGooglePhotorealistic3DTileset({ key: credentials.googleMapsApiKey.trim(), onlyUsingWithGoogleGeocoder: true }, options)
      : await Cesium3DTileset.fromUrl(await IonResource.fromAssetId(2275207, { accessToken: credentials.cesiumIonToken!.trim() }), options)
    viewer.scene.primitives.add(buildings)
    const stopWatching = watchUrbanVisualState(buildings, viewer, onState)
    return () => {
      stopWatching()
      if (!viewer.isDestroyed()) viewer.scene.primitives.remove(buildings)
    }
  }
  const white = addUrbanWhiteBuildings(viewer, mesh)
  viewer.scene.globe.enableLighting = false
  viewer.shadows = false
  viewer.clock.currentTime = JulianDate.fromIso8601('2026-09-21T03:00:00Z')
  const credit = new Credit(t('<a href="https://www.mlit.go.jp/plateau/" target="_blank">PLATEAU 2025 · 本地无纹理白模</a>'), true)
  viewer.cesiumWidget.creditDisplay.addStaticCredit(credit)
  const state = (ready: boolean): UrbanVisualState => ({
    status: ready ? 'ready' : 'loading', loadedTiles: ready ? 1 : 0, failedTiles: 0,
    pendingRequests: 0, processingTiles: ready ? 0 : 1, residentTiles: ready ? 1 : 0,
    unloadedTiles: 0, visibleTiles: 0, memoryUsageBytes: 0, cacheBudgetBytes: 0, scope: 'current-view',
  })
  onState(state(false))
  // A local primitive has no streamed tiles. Report upload readiness, not invented visibility/memory metrics.
  const removeReadyListener = viewer.scene.postRender.addEventListener(() => {
    if (!white.primitive.ready) return
    onState(state(true))
    removeReadyListener()
  })
  return () => {
    removeReadyListener()
    white.destroy()
    if (!viewer.isDestroyed()) viewer.cesiumWidget.creditDisplay.removeStaticCredit(credit)
  }
}
