import { offsetGeoPoint } from './world-sensor.js'
import type { GeoPoint } from './world-sensor.js'

export const NAMCHE_START: GeoPoint = {
  longitude: 86.71445,
  latitude: 27.80555,
  height: 0,
}

export const NAMCHE_GOAL: GeoPoint = offsetGeoPoint(NAMCHE_START, 170, 100)
export const LANDSLIDE_CENTER: GeoPoint = offsetGeoPoint(NAMCHE_START, 100, 45)

export const LANDSLIDE_HAZARD = {
  id: 'namche-landslide-01',
  name: '临时落石风险区',
  center: LANDSLIDE_CENTER,
  radiusMeters: 22,
  sensorRangeMeters: 105,
}

export const ARCGIS_WORLD_ELEVATION_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'

export const ESRI_WORLD_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
