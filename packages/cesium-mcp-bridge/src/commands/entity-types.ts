import * as Cesium from 'cesium'
import type {
  AddBillboardParams,
  AddBoxParams,
  AddCorridorParams,
  AddCylinderParams,
  AddEllipseParams,
  AddRectangleParams,
  AddWallParams,
} from '../types'
import { parseColor, resolveMaterial, resolveOrientation } from '../utils'

export function addBillboard(viewer: Cesium.Viewer, params: AddBillboardParams): Cesium.Entity {
  const position = Cesium.Cartesian3.fromDegrees(params.longitude, params.latitude, params.height ?? 0)
  return viewer.entities.add({
    name: params.name,
    position,
    billboard: {
      image: params.image,
      scale: params.scale ?? 1.0,
      color: params.color ? parseColor(params.color) : undefined,
      pixelOffset: new Cesium.Cartesian2(params.pixelOffset?.x ?? 0, params.pixelOffset?.y ?? 0),
      horizontalOrigin: Cesium.HorizontalOrigin[params.horizontalOrigin ?? 'CENTER'],
      verticalOrigin: Cesium.VerticalOrigin[params.verticalOrigin ?? 'CENTER'],
      heightReference: Cesium.HeightReference[params.heightReference ?? 'NONE'],
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
}

export function addBox(viewer: Cesium.Viewer, params: AddBoxParams): Cesium.Entity {
  const position = Cesium.Cartesian3.fromDegrees(params.longitude, params.latitude, params.height ?? 0)
  const opts: Cesium.Entity.ConstructorOptions = {
    name: params.name,
    position,
    box: {
      dimensions: new Cesium.Cartesian3(
        params.dimensions.width,
        params.dimensions.length,
        params.dimensions.height,
      ),
      material: resolveMaterial(params.material) as any,
      outline: params.outline ?? true,
      outlineColor: params.outlineColor ? parseColor(params.outlineColor) : undefined,
      fill: params.fill ?? true,
      heightReference: params.heightReference
        ? Cesium.HeightReference[params.heightReference]
        : undefined,
    },
  }
  if (params.orientation) {
    opts.orientation = resolveOrientation(position, params.orientation) as any
  }
  return viewer.entities.add(opts)
}

export function addCorridor(viewer: Cesium.Viewer, params: AddCorridorParams): Cesium.Entity {
  const posArray = params.positions.flatMap(p => [p.longitude, p.latitude, p.height ?? 0])
  return viewer.entities.add({
    name: params.name,
    corridor: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights(posArray),
      width: params.width,
      material: resolveMaterial(params.material) as any,
      cornerType: params.cornerType
        ? Cesium.CornerType[params.cornerType]
        : Cesium.CornerType.ROUNDED,
      height: params.height,
      extrudedHeight: params.extrudedHeight,
      outline: params.outline ?? false,
      outlineColor: params.outlineColor ? parseColor(params.outlineColor) : undefined,
    },
  })
}

export function addCylinder(viewer: Cesium.Viewer, params: AddCylinderParams): Cesium.Entity {
  const position = Cesium.Cartesian3.fromDegrees(params.longitude, params.latitude, params.height ?? 0)
  const opts: Cesium.Entity.ConstructorOptions = {
    name: params.name,
    position,
    cylinder: {
      length: params.length,
      topRadius: params.topRadius,
      bottomRadius: params.bottomRadius,
      material: resolveMaterial(params.material) as any,
      outline: params.outline ?? true,
      outlineColor: params.outlineColor ? parseColor(params.outlineColor) : undefined,
      fill: params.fill ?? true,
      numberOfVerticalLines: params.numberOfVerticalLines ?? 16,
      slices: params.slices ?? 128,
    },
  }
  if (params.orientation) {
    opts.orientation = resolveOrientation(position, params.orientation) as any
  }
  return viewer.entities.add(opts)
}

export function addEllipse(viewer: Cesium.Viewer, params: AddEllipseParams): Cesium.Entity {
  const position = Cesium.Cartesian3.fromDegrees(params.longitude, params.latitude, params.height ?? 0)
  return viewer.entities.add({
    name: params.name,
    position,
    ellipse: {
      semiMajorAxis: params.semiMajorAxis,
      semiMinorAxis: params.semiMinorAxis,
      material: resolveMaterial(params.material) as any,
      height: params.height,
      extrudedHeight: params.extrudedHeight,
      rotation: params.rotation,
      outline: params.outline ?? false,
      outlineColor: params.outlineColor ? parseColor(params.outlineColor) : undefined,
      fill: params.fill ?? true,
      stRotation: params.stRotation,
      numberOfVerticalLines: params.numberOfVerticalLines,
    },
  })
}

export function addRectangle(viewer: Cesium.Viewer, params: AddRectangleParams): Cesium.Entity {
  return viewer.entities.add({
    name: params.name,
    rectangle: {
      coordinates: Cesium.Rectangle.fromDegrees(params.west, params.south, params.east, params.north),
      material: resolveMaterial(params.material) as any,
      height: params.height,
      extrudedHeight: params.extrudedHeight,
      rotation: params.rotation,
      outline: params.outline ?? false,
      outlineColor: params.outlineColor ? parseColor(params.outlineColor) : undefined,
      fill: params.fill ?? true,
      stRotation: params.stRotation,
    },
  })
}

export function addWall(viewer: Cesium.Viewer, params: AddWallParams): Cesium.Entity {
  const posArray = params.positions.flatMap(p => [p.longitude, p.latitude, p.height ?? 0])
  return viewer.entities.add({
    name: params.name,
    wall: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights(posArray),
      minimumHeights: params.minimumHeights,
      maximumHeights: params.maximumHeights,
      material: resolveMaterial(params.material) as any,
      outline: params.outline ?? false,
      outlineColor: params.outlineColor ? parseColor(params.outlineColor) : undefined,
      fill: params.fill ?? true,
    },
  })
}
