import * as Cesium from 'cesium'

/** Cesium 1.145's draping bakes vectors into surface colour, outside Scene.pick.
 * Keep the experimental content adapter here, pinned and covered by browser tests.
 */
export function* loadedVectorPrimitives(content: any): Generator<{ collection: any; primitive: any; feature: any }> {
  for (const collection of content?._collections ?? []) {
    const Primitive = collection._getPrimitiveClass?.()
    if (!Primitive) continue
    const view = new Primitive()
    for (let i = 0; i < collection.primitiveCount; i++) {
      const primitive = collection.get(i, view)
      const feature = content.getFeature(primitive.featureId, content._collectionFeatureTableIds?.get(collection))
      if (feature) yield { collection, primitive, feature }
    }
  }
}

function segmentDistance(a: number[], b: number[]): number {
  const dx = b[0]! - a[0]!
  const dy = b[1]! - a[1]!
  const t = Cesium.Math.clamp(-(a[0]! * dx + a[1]! * dy) / (dx * dx + dy * dy || 1), 0, 1)
  return Math.hypot(a[0]! + t * dx, a[1]! + t * dy)
}

function insideRing(points: number[][]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!
    const b = points[j]!
    if ((a[1]! > 0) !== (b[1]! > 0) && 0 < (b[0]! - a[0]!) * -a[1]! / (b[1]! - a[1]!) + a[0]!) inside = !inside
  }
  return inside
}

/** Pick from rendered LOD only. No source downloads, synthetic attributes or persistent geometry copies. */
export function pickDrapedVectorFeature(scene: Cesium.Scene, position: Cesium.Cartesian2, tilesets: Iterable<Cesium.Cesium3DTileset>, surfacePick?: any): unknown {
  if (!scene.pickPositionSupported) return undefined
  const world = scene.pickPosition(position)
  if (!world) return undefined
  const hit = Cesium.Cartographic.fromCartesian(world)
  const metresPerPixel = scene.camera.getPixelSize(new Cesium.BoundingSphere(world, 1), scene.canvas.clientWidth, scene.canvas.clientHeight)
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) return undefined
  const onTiles = !!surfacePick?.tileset || !!surfacePick?.content?.tileset || surfacePick?.primitive instanceof (Cesium as any).Model || surfacePick?.primitive instanceof Cesium.Cesium3DTileset
  let nearest: unknown
  let nearestDistance = Infinity
  let vertices = 0
  const point = new Cesium.Cartesian3()
  const transformed = new Cesium.Cartesian3()
  for (const tileset of tilesets) {
    const target = tileset.heightReference ?? Cesium.HeightReference.NONE
    if (!tileset.show || ![Cesium.HeightReference.CLAMP_TO_GROUND, onTiles ? Cesium.HeightReference.CLAMP_TO_3D_TILE : Cesium.HeightReference.CLAMP_TO_TERRAIN].includes(target)) continue
    for (const tile of (tileset as any)._selectedTiles ?? []) {
      for (const { collection, primitive, feature } of loadedVectorPrimitives(tile.content)) {
        if (!primitive.show || !primitive.getPositions) continue
        const Material = collection._getMaterialClass()
        const material = primitive.getMaterial(new Material())
        if (material.color?.alpha === 0) continue
        const project = (positions: ArrayLike<number>) => {
          const points: number[][] = []
          for (let i = 0; i < positions.length; i += 3) {
            if (++vertices > 200000) return []
            point.x = positions[i]!
            point.y = positions[i + 1]!
            point.z = positions[i + 2]!
            Cesium.Matrix4.multiplyByPoint(collection.modelMatrix, point, transformed)
            const geo = Cesium.Cartographic.fromCartesian(transformed)
            const circumference = Cesium.Math.TWO_PI * Math.cos(hit.latitude) * Cesium.Ellipsoid.WGS84.maximumRadius
            let x = Cesium.Math.negativePiToPi(geo.longitude - hit.longitude) * Math.cos(hit.latitude) * Cesium.Ellipsoid.WGS84.maximumRadius
            const previous = points.at(-1)?.[0]
            if (previous !== undefined && circumference > 0) x += Math.round((previous - x) / circumference) * circumference
            points.push([x, (geo.latitude - hit.latitude) * Cesium.Ellipsoid.WGS84.maximumRadius])
          }
          return points
        }
        let distance = Infinity
        if (primitive.getOuterPositions) {
          const outer = project(primitive.getOuterPositions())
          if (outer.length && insideRing(outer)) {
            let inHole = false
            for (let i = 0; i < primitive.holeCount; i++) if (insideRing(project(primitive.getHolePositions(i)))) inHole = true
            if (!inHole) distance = 0
          }
        } else {
          const points = project(primitive.getPositions())
          for (let i = 1; i < points.length; i++) distance = Math.min(distance, segmentDistance(points[i - 1]!, points[i]!))
          if (distance > metresPerPixel * (Math.max(0, material.width ?? 1) / 2 + 3)) distance = Infinity
        }
        if (distance < nearestDistance) { nearestDistance = distance; nearest = feature }
        if (vertices > 200000) return nearest
      }
    }
  }
  return nearest
}
