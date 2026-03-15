import * as Cesium from 'cesium'

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
