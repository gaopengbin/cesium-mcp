export interface CodeSnippet {
  title: string
  keywords: string[]
  code: string
}

export const CODE_SNIPPETS: CodeSnippet[] = [
  {
    title: '飞行到指定位置',
    keywords: ['飞到', '飞行', 'flyto', '视角', '定位'],
    code: `viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(116.397, 39.908, 15000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-45),
    roll: 0,
  },
  duration: 2,
})`,
  },
  {
    title: '添加点标记',
    keywords: ['标记', 'marker', '点', 'point', '图钉', 'pin'],
    code: `const entity: Cesium.Entity = viewer.entities.add({
  name: '我的标记',
  position: Cesium.Cartesian3.fromDegrees(116.397, 39.908, 0),
  point: {
    pixelSize: 12,
    color: Cesium.Color.RED,
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
  label: {
    text: '天安门',
    font: '14px sans-serif',
    pixelOffset: new Cesium.Cartesian2(0, -20),
    fillColor: Cesium.Color.WHITE,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    outlineWidth: 2,
    outlineColor: Cesium.Color.BLACK,
  },
})`,
  },
  {
    title: '加载 GeoJSON 数据',
    keywords: ['geojson', '图层', 'layer', '加载', 'load', '数据'],
    code: `const dataSource: Cesium.GeoJsonDataSource = await Cesium.GeoJsonDataSource.load(
  '/path/to/data.geojson',
  {
    stroke: Cesium.Color.fromCssColorString('#3388ff'),
    fill: Cesium.Color.fromCssColorString('#3388ff').withAlpha(0.3),
    strokeWidth: 2,
    clampToGround: true,
  }
)
viewer.dataSources.add(dataSource)
await viewer.flyTo(dataSource)`,
  },
  {
    title: '绘制折线',
    keywords: ['线', 'line', 'polyline', '折线', '路径', '路线'],
    code: `viewer.entities.add({
  name: '我的路线',
  polyline: {
    positions: Cesium.Cartesian3.fromDegreesArray([
      116.39, 39.91,
      116.40, 39.90,
      116.41, 39.92,
    ]),
    width: 3,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.2,
      color: Cesium.Color.CYAN,
    }),
    clampToGround: true,
  },
})`,
  },
  {
    title: '绘制多边形',
    keywords: ['多边形', 'polygon', '面', '区域', '范围'],
    code: `viewer.entities.add({
  name: '我的区域',
  polygon: {
    hierarchy: Cesium.Cartesian3.fromDegreesArray([
      116.38, 39.90,
      116.42, 39.90,
      116.42, 39.93,
      116.38, 39.93,
    ]),
    material: Cesium.Color.fromCssColorString('#ff6600').withAlpha(0.3),
    outline: true,
    outlineColor: Cesium.Color.fromCssColorString('#ff6600'),
    outlineWidth: 2,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
})`,
  },
  {
    title: '加载 3D Tiles',
    keywords: ['3d', 'tiles', '3dtiles', '模型', '建筑', 'tileset'],
    code: `const tileset: Cesium.Cesium3DTileset = await Cesium.Cesium3DTileset.fromUrl(
  'https://assets.cesium.com/your-asset-id/tileset.json',
  {
    maximumScreenSpaceError: 16,
    maximumMemoryUsage: 512,
  }
)
viewer.scene.primitives.add(tileset)

// 可选：设置 3D Tiles 样式
tileset.style = new Cesium.Cesium3DTileStyle({
  color: "color('white')",
  show: true,
})

await viewer.flyTo(tileset)`,
  },
  {
    title: '切换底图',
    keywords: ['底图', 'basemap', '影像', '卫星', 'imagery'],
    code: `// 移除当前底图
viewer.imageryLayers.removeAll()

// 添加新底图 — OpenStreetMap
viewer.imageryLayers.addImageryProvider(
  new Cesium.UrlTemplateImageryProvider({
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maximumLevel: 18,
    credit: new Cesium.Credit('OpenStreetMap'),
  })
)

// 或使用 Cesium Ion 底图
// viewer.imageryLayers.addImageryProvider(
//   await Cesium.IonImageryProvider.fromAssetId(3)  // Bing Maps
// )`,
  },
  {
    title: '鼠标点击拾取',
    keywords: ['点击', 'click', '拾取', 'pick', '选择', '交互'],
    code: `const handler: Cesium.ScreenSpaceEventHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)

handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
  // 拾取 Entity
  const picked = viewer.scene.pick(movement.position)
  if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity) {
    console.log('选中:', picked.id.name)
    viewer.selectedEntity = picked.id
  }

  // 获取地理坐标
  const cartesian = viewer.camera.pickEllipsoid(movement.position)
  if (cartesian) {
    const carto = Cesium.Cartographic.fromCartesian(cartesian)
    const lon = Cesium.Math.toDegrees(carto.longitude)
    const lat = Cesium.Math.toDegrees(carto.latitude)
    console.log(\`坐标: \${lon.toFixed(6)}, \${lat.toFixed(6)}\`)
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK)

// 清理: handler.destroy()`,
  },
  {
    title: '截图导出',
    keywords: ['截图', 'screenshot', '导出', '图片', 'canvas'],
    code: `// 方法 1: 使用 canvas toDataURL
viewer.render()
const dataUrl: string = viewer.canvas.toDataURL('image/png')

// 方法 2: 下载
const link = document.createElement('a')
link.download = 'cesium-screenshot.png'
link.href = dataUrl
link.click()`,
  },
  {
    title: '热力图效果',
    keywords: ['热力', 'heatmap', '热力图', '密度'],
    code: `// 使用 canvas 生成热力图纹理叠加
// 需要 heatmap.js 或自定义实现

// 简单的点密度可视化（使用不同大小的点）
const points = [
  { lon: 116.39, lat: 39.91, weight: 0.8 },
  { lon: 116.40, lat: 39.90, weight: 0.5 },
  { lon: 116.41, lat: 39.92, weight: 1.0 },
]

for (const p of points) {
  viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
    point: {
      pixelSize: 10 + p.weight * 30,
      color: Cesium.Color.RED.withAlpha(0.3 + p.weight * 0.4),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
  })
}`,
  },
  {
    title: '时间动画/轨迹播放',
    keywords: ['动画', 'animation', '轨迹', 'trajectory', '时间', 'clock', '播放'],
    code: `// 设置时钟
const start = Cesium.JulianDate.fromIso8601('2024-01-01T00:00:00Z')
const stop = Cesium.JulianDate.addHours(start, 1, new Cesium.JulianDate())

viewer.clock.startTime = start.clone()
viewer.clock.stopTime = stop.clone()
viewer.clock.currentTime = start.clone()
viewer.clock.multiplier = 60  // 60x 速度

// 创建采样位置
const positionProperty = new Cesium.SampledPositionProperty()
positionProperty.addSample(start,
  Cesium.Cartesian3.fromDegrees(116.39, 39.90, 100))
positionProperty.addSample(stop,
  Cesium.Cartesian3.fromDegrees(116.42, 39.93, 100))

// 添加运动实体
viewer.entities.add({
  name: '移动目标',
  position: positionProperty,
  point: { pixelSize: 8, color: Cesium.Color.YELLOW },
  path: {
    resolution: 1,
    material: Cesium.Color.CYAN.withAlpha(0.5),
    width: 2,
    leadTime: 0,
    trailTime: 3600,
  },
})`,
  },
]
