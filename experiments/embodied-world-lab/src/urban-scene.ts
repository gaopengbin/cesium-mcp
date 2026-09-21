import {
  Cartesian3,
  Cesium3DTileset,
  Credit,
  CustomHeightmapTerrainProvider,
  JulianDate,
  Math as CesiumMath,
  ShadowMode,
} from 'cesium'
import type { Viewer } from 'cesium'
import { initRapier } from 'cesium-player-controller'
import type { playerController } from 'cesium-player-controller'
import type { GeoPoint } from './world-sensor.js'

export interface UrbanVisualState {
  status: 'loading' | 'ready' | 'partial'
  loadedTiles: number
  failedTiles: number
  pendingRequests: number
  processingTiles: number
  scope: 'current-view'
}

export function watchUrbanVisualState(
  buildings: Cesium3DTileset,
  viewer: Viewer,
  onState: (state: UrbanVisualState) => void,
): () => void {
  let loadedTiles = 0
  let failedTiles = 0
  let pendingRequests = 0
  let processingTiles = 0
  let visibleThisFrame = false
  let lastKey = ''
  const publish = (visible = false): void => {
    const state: UrbanVisualState = {
      status: failedTiles > 0 ? 'partial' : visible && buildings.tilesLoaded && loadedTiles > 0 ? 'ready' : 'loading',
      loadedTiles, failedTiles, pendingRequests, processingTiles, scope: 'current-view',
    }
    const key = JSON.stringify(state)
    if (key === lastKey) return
    lastKey = key
    onState(state)
  }
  const remove = [
    buildings.tileLoad.addEventListener(() => { loadedTiles += 1 }),
    buildings.tileVisible.addEventListener(() => { visibleThisFrame = true }),
    buildings.tileFailed.addEventListener(() => {
      failedTiles += 1
      publish()
    }),
    buildings.loadProgress.addEventListener((pending: number, processing: number) => {
      pendingRequests = pending
      processingTiles = processing
    }),
    viewer.scene.postRender.addEventListener(() => {
      publish(visibleThisFrame)
      visibleThisFrame = false
    }),
  ]
  publish()
  return () => { for (const unsubscribe of remove) unsubscribe() }
}

export const URBAN_GROUND_HEIGHT = 38
export const URBAN_METADATA = {
  id: 'city' as const,
  title: '东京 · 自由探索',
  description: '在真实建筑街区内点选起终点，预览候选路线，再让 Jev 控制人物行动。',
}
// Selected on the rendered road surface west of Tokyo Station; not inside a building.
export const URBAN_START: GeoPoint = { longitude: 139.764624924, latitude: 35.681082469, height: URBAN_GROUND_HEIGHT }
export const URBAN_GOAL: GeoPoint = { longitude: 139.764700799, latitude: 35.682126853, height: URBAN_GROUND_HEIGHT }
export const URBAN_COLLISION_BOUNDS = [139.7630, 35.6790, 139.7665, 35.6830] as const

export function insideUrbanCoverage(point: GeoPoint, marginMeters = 0): boolean {
  const latitudeMargin = marginMeters / 111_320
  const longitudeMargin = latitudeMargin / Math.cos(point.latitude * Math.PI / 180)
  return point.longitude > URBAN_COLLISION_BOUNDS[0] + longitudeMargin
    && point.latitude > URBAN_COLLISION_BOUNDS[1] + latitudeMargin
    && point.longitude < URBAN_COLLISION_BOUNDS[2] - longitudeMargin
    && point.latitude < URBAN_COLLISION_BOUNDS[3] - latitudeMargin
}
export const URBAN_TILESET_URL = 'https://assets.cms.plateau.reearth.io/assets/28/07d0a1-b6be-46ef-bd87-4f0683b5ef6e/13101_chiyoda-ku_pref_2025_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2/tileset.json'

export function createUrbanScenario(seed: number) {
  return {
    preset: 'city' as const,
    seed,
    title: URBAN_METADATA.title,
    description: URBAN_METADATA.description,
    start: { ...URBAN_START },
    goal: { ...URBAN_GOAL },
    // Urban sensing uses the physical building mesh, not an artificial risk circle.
    hazard: {
      id: 'urban-unused-fixture', name: '城市建筑',
      center: { longitude: 139.77, latitude: 35.7, height: URBAN_GROUND_HEIGHT },
      radiusMeters: 1, sensorRangeMeters: 1,
    },
  }
}

export function createUrbanGround(): CustomHeightmapTerrainProvider {
  return new CustomHeightmapTerrainProvider({
    width: 32, height: 32,
    callback: () => new Float32Array(32 * 32).fill(URBAN_GROUND_HEIGHT),
    credit: '局部路面：38m 椭球高简化平面',
  })
}

export async function loadUrbanBuildings(
  viewer: Viewer,
  onState?: (state: UrbanVisualState) => void,
  onCleanup?: (cleanup: () => void) => void,
): Promise<Cesium3DTileset> {
  const buildings = await Cesium3DTileset.fromUrl(URBAN_TILESET_URL, {
    maximumScreenSpaceError: 4,
    cacheBytes: 256 * 1024 * 1024,
    maximumCacheOverflowBytes: 128 * 1024 * 1024,
    shadows: ShadowMode.DISABLED,
    lightColor: new Cartesian3(2.5, 2.5, 2.5),
  })
  if (onState) {
    const cleanup = watchUrbanVisualState(buildings, viewer, onState)
    onCleanup?.(cleanup)
  }
  viewer.scene.primitives.add(buildings)
  viewer.scene.globe.enableLighting = false
  viewer.shadows = false
  viewer.clock.currentTime = JulianDate.fromIso8601('2026-09-21T03:00:00Z')
  viewer.cesiumWidget.creditDisplay.addStaticCredit(new Credit(
    '<a href="https://www.mlit.go.jp/plateau/" target="_blank">出典：PLATEAU / 国土交通省 · 千代田区2025</a>',
    true,
  ))
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(139.7630, 35.6794, 210),
    orientation: { heading: CesiumMath.toRadians(32), pitch: CesiumMath.toRadians(-30), roll: 0 },
  })
  return buildings
}

export async function addUrbanGroundCollider(player: playerController): Promise<void> {
  const rapier = await initRapier()
  const center = player.frame.ecefToRapier(Cartesian3.fromDegrees(
    URBAN_START.longitude, URBAN_START.latitude, URBAN_GROUND_HEIGHT - 1,
  ))
  player.physics.world.createCollider(rapier.ColliderDesc.cuboid(350, 1, 350)
    .setTranslation(center.x, center.y, center.z)
    .setFriction(0.8))
}

interface UrbanCollisionData {
  schemaVersion: number
  originEcef: [number, number, number]
  positions: number[]
  indices: number[]
  coverageBbox: [number, number, number, number]
  counts: { tileCount: number, vertexCount: number, triangleCount: number }
}

export async function addUrbanBuildingColliders(player: playerController): Promise<UrbanCollisionData['counts']> {
  const response = await fetch(new URL('./assets/tokyo-colliders.json', import.meta.url))
  if (!response.ok) throw new Error('城市建筑碰撞数据加载失败')
  const data = await response.json() as UrbanCollisionData
  if (data.schemaVersion !== 1 || data.positions.length % 3 || data.indices.length % 3
    || data.counts.triangleCount < 1 || data.originEcef.length !== 3
    || data.coverageBbox.some((value, index) => value !== URBAN_COLLISION_BOUNDS[index])) {
    throw new Error('城市建筑碰撞数据不完整，暂不能开始导航')
  }
  const positions = new Float32Array(data.positions.length)
  for (let i = 0; i < data.positions.length; i += 3) {
    const local = player.frame.ecefToRapier(new Cartesian3(
      data.originEcef[0] + data.positions[i],
      data.originEcef[1] + data.positions[i + 1],
      data.originEcef[2] + data.positions[i + 2],
    ))
    positions[i] = local.x
    positions[i + 1] = local.y
    positions[i + 2] = local.z
  }
  player.physics.addTerrainTileCollider('plateau-tokyo-buildings', positions, new Uint32Array(data.indices))
  return data.counts
}
