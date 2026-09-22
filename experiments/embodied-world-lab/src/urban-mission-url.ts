import { t } from './i18n.js'
import type { GeoPoint } from './world-sensor.js'

export interface UrbanMission {
  start: GeoPoint
  goal: GeoPoint
}

type CoordinateKey = 'from' | 'to'

const MISSION_HEIGHT = 38
const DECIMAL_COORDINATE = /^[+-]?\d+(?:\.\d+)?$/

export function readUrbanMission(search: URLSearchParams): UrbanMission | undefined {
  const from = search.getAll('from')
  const to = search.getAll('to')
  if (from.length === 0 && to.length === 0) return undefined
  if (from.length !== 1 || to.length !== 1) {
    throw new Error(t('地图任务链接必须同时包含且仅包含一个 from 和一个 to'))
  }

  return {
    start: parsePoint(from[0], 'from'),
    goal: parsePoint(to[0], 'to'),
  }
}

export function writeUrbanMission(url: URL, start: GeoPoint, goal: GeoPoint): URL {
  const from = formatPoint(start, 'from')
  const to = formatPoint(goal, 'to')
  const result = new URL(url.href)
  result.searchParams.set('scene', 'city')
  result.searchParams.set('planner', 'jev')
  result.searchParams.set('from', from)
  result.searchParams.set('to', to)
  return result
}

function parsePoint(value: string, key: CoordinateKey): GeoPoint {
  const parts = value.split(',').map(part => part.trim())
  if (parts.length !== 2 || parts.some(part => !DECIMAL_COORDINATE.test(part))) {
    throw new Error(t('地图任务链接的 {0} 必须是十进制经度,纬度', key))
  }
  return checkedPoint(Number(parts[0]), Number(parts[1]), key)
}

function checkedPoint(longitude: number, latitude: number, key: CoordinateKey): GeoPoint {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
    || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new Error(t('地图任务 {0} 坐标超出 WGS84 范围：经度 -180～180，纬度 -90～90', key))
  }
  return { longitude, latitude, height: MISSION_HEIGHT }
}

function formatPoint(point: GeoPoint, key: CoordinateKey): string {
  const { longitude, latitude } = checkedPoint(point.longitude, point.latitude, key)
  return [longitude, latitude].map(value => {
    const rounded = value.toFixed(7)
    return Number(rounded) === 0 ? '0' : rounded.replace(/\.?0+$/, '')
  }).join(',')
}
