import * as Cesium from 'cesium'
import type { ScreenshotResult, HighlightParams } from '../types'
import type { LayerManager } from './layer'

/**
 * 地图截图，返回 base64 DataURL
 */
export function screenshot(viewer: Cesium.Viewer): Promise<ScreenshotResult> {
  return new Promise((resolve) => {
    // 等待下一帧渲染完成
    viewer.scene.requestRender()
    const removeListener = viewer.scene.postRender.addEventListener(() => {
      removeListener()
      const canvas = viewer.scene.canvas
      const dataUrl = canvas.toDataURL('image/png')
      resolve({
        dataUrl,
        width: canvas.width,
        height: canvas.height,
      })
    })
  })
}

/**
 * 高亮指定图层的要素
 */
export function highlight(
  viewer: Cesium.Viewer,
  layerManager: LayerManager,
  params: HighlightParams,
): void {
  const { layerId, featureIndex, color = '#FFFF00' } = params
  const refs = layerManager.getCesiumRefs(layerId)
  if (!refs?.dataSource) return

  const entities = refs.dataSource.entities.values
  const highlightColor = Cesium.Color.fromCssColorString(color).withAlpha(0.8)

  if (featureIndex != null && featureIndex < entities.length) {
    const entity = entities[featureIndex]!
    applyHighlight(entity, highlightColor)
  } else {
    for (const entity of entities) {
      applyHighlight(entity, highlightColor)
    }
  }
}

function applyHighlight(entity: Cesium.Entity, color: Cesium.Color): void {
  if (entity.polygon) {
    entity.polygon.material = new Cesium.ColorMaterialProperty(color)
  } else if (entity.polyline) {
    entity.polyline.material = new Cesium.ColorMaterialProperty(color)
    entity.polyline.width = new Cesium.ConstantProperty(3)
  } else if (entity.point) {
    entity.point.color = new Cesium.ConstantProperty(color)
    entity.point.pixelSize = new Cesium.ConstantProperty(16)
  }
}
