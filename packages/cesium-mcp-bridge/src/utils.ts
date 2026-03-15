import * as Cesium from 'cesium'
import type { MaterialInput, MaterialSpec, OrientationInput } from './types'

/**
 * 颜色输入格式：CSS 字符串或 RGBA 对象 (0-1 范围)
 */
export type ColorInput = string | { red: number; green: number; blue: number; alpha?: number }

/**
 * 将 CSS 字符串或 RGBA 对象转为 Cesium.Color
 */
export function parseColor(input: ColorInput): Cesium.Color {
  if (typeof input === 'string') {
    return Cesium.Color.fromCssColorString(input)
  }
  return new Cesium.Color(input.red, input.green, input.blue, input.alpha ?? 1.0)
}

/**
 * 将 MaterialInput 转为 Cesium MaterialProperty 或 Color
 */
export function resolveMaterial(input?: MaterialInput): Cesium.Color | Cesium.MaterialProperty {
  if (!input) return Cesium.Color.WHITE
  if (typeof input === 'string' || 'red' in input) return parseColor(input as ColorInput)
  const spec = input as MaterialSpec
  switch (spec.type) {
    case 'color':
      return spec.color ? parseColor(spec.color) : Cesium.Color.WHITE
    case 'image':
      return new Cesium.ImageMaterialProperty({ image: spec.image })
    case 'checkerboard':
      return new Cesium.CheckerboardMaterialProperty({
        evenColor: spec.evenColor ? parseColor(spec.evenColor) : undefined,
        oddColor: spec.oddColor ? parseColor(spec.oddColor) : undefined,
      })
    case 'stripe':
      return new Cesium.StripeMaterialProperty({
        orientation: spec.orientation === 'vertical'
          ? Cesium.StripeOrientation.VERTICAL
          : Cesium.StripeOrientation.HORIZONTAL,
        evenColor: spec.evenColor ? parseColor(spec.evenColor) : undefined,
        oddColor: spec.oddColor ? parseColor(spec.oddColor) : undefined,
      })
    case 'grid':
      return new Cesium.GridMaterialProperty({
        color: spec.color ? parseColor(spec.color) : undefined,
        cellAlpha: spec.cellAlpha,
      })
    default:
      return Cesium.Color.WHITE
  }
}

/**
 * 将 heading/pitch/roll (degrees) 转为 Cesium Quaternion orientation
 */
export function resolveOrientation(
  position: Cesium.Cartesian3,
  orientation: OrientationInput,
): Cesium.Quaternion {
  const hpr = Cesium.HeadingPitchRoll.fromDegrees(
    orientation.heading,
    orientation.pitch,
    orientation.roll,
  )
  return Cesium.Transforms.headingPitchRollQuaternion(position, hpr)
}

/**
 * 校验经纬度坐标范围
 */
export function validateCoordinate(longitude: number, latitude: number, height?: number): void {
  if (longitude < -180 || longitude > 180) {
    throw new RangeError(`经度超出范围 [-180, 180]: ${longitude}`)
  }
  if (latitude < -90 || latitude > 90) {
    throw new RangeError(`纬度超出范围 [-90, 90]: ${latitude}`)
  }
  if (height !== undefined && height < -12000) {
    throw new RangeError(`高度异常 (< -12000m): ${height}`)
  }
}
