import type { Cesium3DTileset } from 'cesium'

export interface TileFeatureResult {
  layerId: string
  properties: Record<string, unknown>
}

/** Serialize only metadata of a feature belonging to a managed tileset. */
export function readTileFeature(picked: unknown, layers: Iterable<[string, Cesium3DTileset]>): TileFeatureResult | null {
  const feature = picked as { tileset?: Cesium3DTileset; getPropertyIds?: () => string[]; getProperty?: (id: string) => unknown } | undefined
  if (!feature?.getPropertyIds || !feature.getProperty) return null
  for (const [layerId, tileset] of layers) {
    if (feature.tileset !== tileset) continue
    const properties: Record<string, unknown> = Object.create(null)
    for (const key of feature.getPropertyIds().slice(0, 100)) {
      const value = feature.getProperty(key)
      if (value !== undefined) {
        try {
          properties[key] = JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item))
        } catch {
          // Ignore non-serializable custom properties without losing the other attributes.
        }
      }
    }
    return { layerId, properties }
  }
  return null
}
