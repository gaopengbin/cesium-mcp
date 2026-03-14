interface TemplateParams {
  name: string
  lon: number
  lat: number
  height: number
  color: string
  size: number
}

interface EntityTemplate {
  defaultSize: number
  generate: (p: TemplateParams) => string
}

export const ENTITY_TEMPLATES: Record<string, EntityTemplate> = {
  point: {
    defaultSize: 10,
    generate: (p) => `viewer.entities.add({
  name: '${p.name}',
  position: Cesium.Cartesian3.fromDegrees(${p.lon}, ${p.lat}, ${p.height}),
  point: {
    pixelSize: ${p.size},
    color: Cesium.Color.fromCssColorString('${p.color}'),
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 1,
  },
})`,
  },

  billboard: {
    defaultSize: 32,
    generate: (p) => `viewer.entities.add({
  name: '${p.name}',
  position: Cesium.Cartesian3.fromDegrees(${p.lon}, ${p.lat}, ${p.height}),
  billboard: {
    image: 'path/to/icon.png',  // 替换为实际图标路径
    width: ${p.size},
    height: ${p.size},
    color: Cesium.Color.fromCssColorString('${p.color}'),
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
})`,
  },

  label: {
    defaultSize: 14,
    generate: (p) => `viewer.entities.add({
  name: '${p.name}',
  position: Cesium.Cartesian3.fromDegrees(${p.lon}, ${p.lat}, ${p.height}),
  label: {
    text: '${p.name}',
    font: '${p.size}px sans-serif',
    fillColor: Cesium.Color.fromCssColorString('${p.color}'),
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    outlineWidth: 2,
    outlineColor: Cesium.Color.BLACK,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, -10),
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
})`,
  },

  polyline: {
    defaultSize: 3,
    generate: (p) => `viewer.entities.add({
  name: '${p.name}',
  polyline: {
    positions: Cesium.Cartesian3.fromDegreesArray([
      ${p.lon}, ${p.lat},
      ${p.lon + 0.01}, ${p.lat + 0.01},  // 替换为实际坐标
    ]),
    width: ${p.size},
    material: Cesium.Color.fromCssColorString('${p.color}'),
    clampToGround: true,
  },
})`,
  },

  polygon: {
    defaultSize: 0,
    generate: (p) => `viewer.entities.add({
  name: '${p.name}',
  polygon: {
    hierarchy: Cesium.Cartesian3.fromDegreesArray([
      ${p.lon - 0.005}, ${p.lat - 0.005},
      ${p.lon + 0.005}, ${p.lat - 0.005},
      ${p.lon + 0.005}, ${p.lat + 0.005},
      ${p.lon - 0.005}, ${p.lat + 0.005},
    ]),
    material: Cesium.Color.fromCssColorString('${p.color}').withAlpha(0.4),
    outline: true,
    outlineColor: Cesium.Color.fromCssColorString('${p.color}'),
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
})`,
  },

  model: {
    defaultSize: 1,
    generate: (p) => `viewer.entities.add({
  name: '${p.name}',
  position: Cesium.Cartesian3.fromDegrees(${p.lon}, ${p.lat}, ${p.height}),
  model: {
    uri: 'path/to/model.glb',  // 替换为实际模型路径
    scale: ${p.size},
    minimumPixelSize: 64,
    color: Cesium.Color.fromCssColorString('${p.color}'),
    colorBlendMode: Cesium.ColorBlendMode.MIX,
    colorBlendAmount: 0.5,
  },
})`,
  },

  ellipse: {
    defaultSize: 500,
    generate: (p) => `viewer.entities.add({
  name: '${p.name}',
  position: Cesium.Cartesian3.fromDegrees(${p.lon}, ${p.lat}, ${p.height}),
  ellipse: {
    semiMajorAxis: ${p.size},
    semiMinorAxis: ${p.size * 0.7},
    material: Cesium.Color.fromCssColorString('${p.color}').withAlpha(0.3),
    outline: true,
    outlineColor: Cesium.Color.fromCssColorString('${p.color}'),
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
})`,
  },

  box: {
    defaultSize: 100,
    generate: (p) => `viewer.entities.add({
  name: '${p.name}',
  position: Cesium.Cartesian3.fromDegrees(${p.lon}, ${p.lat}, ${p.height + p.size / 2}),
  box: {
    dimensions: new Cesium.Cartesian3(${p.size}, ${p.size}, ${p.size}),
    material: Cesium.Color.fromCssColorString('${p.color}').withAlpha(0.6),
    outline: true,
    outlineColor: Cesium.Color.fromCssColorString('${p.color}'),
  },
})`,
  },
}
