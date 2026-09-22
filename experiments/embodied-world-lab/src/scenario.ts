import { t } from './i18n.js'
import { offsetGeoPoint } from './world-sensor.js'
import type { CircularHazard, GeoPoint } from './world-sensor.js'

export type ScenarioPreset = 'inspection' | 'wide-detour' | 'near-risk' | 'random'

export interface ScenarioMetadata {
  id: ScenarioPreset
  title: string
  description: string
}

export interface WorldScenario {
  preset: ScenarioPreset
  seed: number
  title: string
  description: string
  start: GeoPoint
  goal: GeoPoint
  hazard: CircularHazard & { name: string }
}

export const SCENARIO_PRESETS: readonly ScenarioMetadata[] = [
  {
    id: 'inspection',
    title: t('山坡巡检'),
    description: t('复用南池地形上的原始实验路线；途中圆形风险区为人工配置。'),
  },
  {
    id: 'wide-detour',
    title: t('宽侧绕行'),
    description: t('扩大前方的实验风险圆，观察角色如何选择绕行方向。'),
  },
  {
    id: 'near-risk',
    title: t('近处风险'),
    description: t('将实验风险区移近起点，观察较早发现风险后的决策变化。'),
  },
  {
    id: 'random',
    title: t('随机场景'),
    description: t('用种子生成实验目标与风险布局；地形不变，不保证角色能够抵达。'),
  },
]

export const NAMCHE_START: GeoPoint = {
  longitude: 86.71445,
  latitude: 27.80555,
  height: 0,
}

export const NAMCHE_GOAL: GeoPoint = offsetGeoPoint(NAMCHE_START, 170, 100)
export const LANDSLIDE_CENTER: GeoPoint = offsetGeoPoint(NAMCHE_START, 100, 45)

export const LANDSLIDE_HAZARD = {
  id: 'namche-landslide-01',
  name: t('临时落石风险区'),
  center: LANDSLIDE_CENTER,
  radiusMeters: 22,
  sensorRangeMeters: 105,
}

/** All hazards are synthetic fixtures placed on real geographic terrain. */
export function createScenario(preset: ScenarioPreset, seed: number): WorldScenario {
  const normalizedSeed = Number.isFinite(seed) ? Math.floor(Math.abs(seed)) % 1_000_000 : 260921
  const metadata = SCENARIO_PRESETS.find(value => value.id === preset) ?? SCENARIO_PRESETS[0]
  const start = { ...NAMCHE_START }
  let goal = { ...NAMCHE_GOAL }
  let hazard = { ...LANDSLIDE_HAZARD, center: { ...LANDSLIDE_CENTER } }

  if (metadata.id === 'wide-detour') {
    goal = offsetGeoPoint(start, 160, 65)
    hazard = {
      ...hazard,
      id: 'namche-wide-detour',
      name: t('实验风险区 · 宽侧绕行'),
      center: offsetGeoPoint(start, 85, 35),
      radiusMeters: 29,
    }
  } else if (metadata.id === 'near-risk') {
    goal = offsetGeoPoint(start, 145, 90)
    hazard = {
      ...hazard,
      id: 'namche-near-risk',
      name: t('实验风险区 · 近处风险'),
      center: offsetGeoPoint(start, 55, 32),
      radiusMeters: 26,
    }
  } else if (metadata.id === 'random') {
    const random = seededRandom(normalizedSeed)
    // The terrain grid spans ±210 m. Endpoints leave at least 28 m for sensor probes.
    const east = 130 + random() * 42
    const north = 40 + random() * 56
    const distance = Math.hypot(east, north)
    const fraction = 0.46 + random() * 0.14
    const sideOffset = (random() - 0.5) * 24
    goal = offsetGeoPoint(start, east, north)
    hazard = {
      ...hazard,
      id: `namche-random-${normalizedSeed}`,
      name: t('实验风险区 · 随机配置'),
      center: offsetGeoPoint(
        start,
        east * fraction - north / distance * sideOffset,
        north * fraction + east / distance * sideOffset,
      ),
      radiusMeters: 16 + random() * 10,
    }
  }

  return {
    preset: metadata.id,
    seed: normalizedSeed,
    title: metadata.title,
    description: metadata.description,
    start,
    goal,
    hazard,
  }
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let result = value
    result = Math.imul(result ^ result >>> 15, result | 1)
    result ^= result + Math.imul(result ^ result >>> 7, result | 61)
    return ((result ^ result >>> 14) >>> 0) / 4294967296
  }
}

export const ARCGIS_WORLD_ELEVATION_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'

export const ESRI_WORLD_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
