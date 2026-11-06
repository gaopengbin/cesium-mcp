export interface ApiDoc {
  name: string
  category: 'class' | 'method' | 'property'
  description: string
  ctor?: string
  properties?: string[]
  methods?: string[]
  example?: string
}

export const CESIUM_API_DOCS: ApiDoc[] = [
  {
    name: 'IonAssetElementService', category: 'class',
    description: 'CesiumJS 1.147 实验性 BIM/CAD 构件服务，支持过滤、游标分页、全模型工程量聚合和模型树。构件 ID 保留十进制字符串，属性单位保持源单位。',
    methods: ['fromAssetId(assetId, options)', 'listElements({filter, top, continuationToken})', 'getElement(elementId)', 'aggregate({propertyKeys, filter})', 'getElementTreeChildren({nodeKey})', 'getElementTreeParents(elementId)', 'getBoundingSphere(element)'],
    example: `const service = Cesium.IonAssetElementService.fromAssetId(YOUR_ASSET_ID)
const page = await service.listElements({ top: 50, filter: { 'IFC Class Name': 'ifcwall' } })
const quantities = await service.aggregate({ propertyKeys: ['Quantity.Net Volume'] })
// Numeric count differs from total matched elements; inspect source units first.`,
  },
  {
    name: 'ElementService', category: 'class',
    description: 'CesiumJS 1.147 可扩展构件服务基类。通常使用 IonAssetElementService；不要直接实例化抽象服务。',
    methods: ['listElements(options)', 'getElement(elementId)'],
  },
  {
    name: 'IonSnapService', category: 'class',
    description: '实验性 ion BIM 精确几何吸附，要求地理定位数据库、相机和 CSS 画布尺寸，SDK elementId 使用十六进制字符串。MCP 的 snapBimElement 接收十进制字符串并无损转换；真实云端可用性依赖资产权限。',
    methods: ['fromAssetId(assetId, options)', 'snap({elementId, testPoint, camera, canvasWidth, canvasHeight, snapAperture})'],
  },
  {
    name: 'Scene.snap', category: 'method',
    description: '原生 GPU 几何吸附，输入画布 CSS 像素坐标，返回 position、surfacePosition、isEdge、screenPosition；不支持或未命中时返回 undefined。',
    example: `const hit = viewer.scene.snap(new Cesium.Cartesian2(300, 200), { width: 25 })
if (hit) console.log(hit.position, hit.isEdge)`,
  },
  {
    name: 'BufferPrimitiveCollection.setPositions', category: 'method',
    description: '1.146+ 高效更新连续图元的坐标，实际调用 points/polylines/polygons 子集合。TypedArray 类型与缓冲一致，顶点总数和拓扑不变。',
    methods: ['setPositions(positions, primitiveOffset, primitiveCount)'],
  },
  {
    name: 'BufferPrimitive.pickObject', category: 'property',
    description: '1.146+ 点选对象 getter/setter。必须在首次渲染前设置，渲染后由引擎锁定。MCP addGeoJsonPrimitive 支持 pickMetadata。',
  },
  {
    name: 'Cesium3DTileset.vectorBlendOption', category: 'property',
    description: '矢量瓦片使用 BlendOption.OPAQUE 或 TRANSLUCENT，缓冲子集合 blendOption 也可动态切换。MCP setTilesetOptions / updateVectorCollection 已封装。',
  },
  {
    name: 'Viewer',
    category: 'class',
    description: 'Cesium 应用的核心容器，管理所有 Cesium 部件（Scene, Camera, DataSources 等）。',
    ctor: 'new Cesium.Viewer(container: string | Element, options?: Viewer.ConstructorOptions)',
    properties: ['scene', 'camera', 'entities', 'dataSources', 'imageryLayers', 'clock', 'canvas', 'container'],
    methods: ['flyTo(target)', 'zoomTo(target)', 'destroy()', 'render()', 'resize()'],
    example: `const viewer = new Cesium.Viewer('cesiumContainer', {
  terrain: Cesium.Terrain.fromWorldTerrain(),
  baseLayerPicker: false,
  geocoder: false,
})`,
  },
  {
    name: 'Entity',
    category: 'class',
    description: '表示场景中的一个空间对象，可包含 point, billboard, label, polyline, polygon, model 等图形。',
    ctor: 'new Cesium.Entity(options?: Entity.ConstructorOptions)',
    properties: ['id', 'name', 'position', 'description', 'point', 'billboard', 'label', 'polyline', 'polygon', 'model', 'show'],
    methods: ['isAvailable(time)', 'merge(source)', 'addProperty(name)'],
    example: `viewer.entities.add({
  name: 'My Point',
  position: Cesium.Cartesian3.fromDegrees(116.4, 39.9, 0),
  point: {
    pixelSize: 10,
    color: Cesium.Color.RED,
  },
})`,
  },
  {
    name: 'Camera',
    category: 'class',
    description: '场景的虚拟相机，控制视角位置、方向和视野。',
    ctor: '（通过 viewer.camera 获取）',
    properties: ['position', 'direction', 'up', 'right', 'heading', 'pitch', 'roll', 'frustum'],
    methods: ['flyTo(options)', 'setView(options)', 'lookAt(target, offset)', 'zoomIn(amount)', 'zoomOut(amount)', 'flyHome(duration)'],
    example: `viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(116.4, 39.9, 50000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-45),
    roll: 0,
  },
  duration: 2,
})`,
  },
  {
    name: 'Cartesian3',
    category: 'class',
    description: '三维笛卡尔坐标点，Cesium 中最常用的位置表示。1.146+ 数学、几何、时间类型拆入 @cesium/core；从 cesium 导入不变。旧 @cesium/engine 对应导出计划在 1.150 移除。1.147 私有 glTF 处理迁移至 @cesium/gltf，避免导入 GltfPipeline 私有路径。',
    ctor: 'new Cesium.Cartesian3(x?: number, y?: number, z?: number)',
    properties: ['x', 'y', 'z'],
    methods: ['clone()', 'equals(right)', 'toString()'],
    example: `// 从经纬度创建
const position = Cesium.Cartesian3.fromDegrees(116.4, 39.9, 100)

// 从弧度创建
const pos2 = Cesium.Cartesian3.fromRadians(lon, lat, height)

// 距离计算
const distance = Cesium.Cartesian3.distance(pos1, pos2)`,
  },
  {
    name: 'Color',
    category: 'class',
    description: '颜色对象，支持 RGBA 和各种预设颜色常量。',
    ctor: 'new Cesium.Color(red?: number, green?: number, blue?: number, alpha?: number)',
    properties: ['red', 'green', 'blue', 'alpha'],
    methods: ['withAlpha(alpha)', 'toCssColorString()', 'toBytes()'],
    example: `// 预设颜色
Cesium.Color.RED
Cesium.Color.BLUE.withAlpha(0.5)

// CSS 字符串
Cesium.Color.fromCssColorString('#3388ff')
Cesium.Color.fromCssColorString('rgba(255, 0, 0, 0.5)')`,
  },
  {
    name: 'GeoJsonDataSource',
    category: 'class',
    description: '加载和解析 GeoJSON / TopoJSON 数据，自动创建对应的 Entity 集合。',
    ctor: 'new Cesium.GeoJsonDataSource(name?: string)',
    properties: ['name', 'entities', 'isLoading', 'changedEvent'],
    methods: ['load(data, options)', 'process(data, options)'],
    example: `const ds = await Cesium.GeoJsonDataSource.load('/data/boundary.geojson', {
  stroke: Cesium.Color.fromCssColorString('#333'),
  fill: Cesium.Color.BLUE.withAlpha(0.4),
  strokeWidth: 2,
  clampToGround: true,
})
viewer.dataSources.add(ds)
viewer.flyTo(ds)`,
  },
  {
    name: 'ImageryLayer',
    category: 'class',
    description: '影像图层，管理底图和叠加影像。',
    ctor: '（通过 viewer.imageryLayers.addImageryProvider 创建）',
    properties: ['imageryProvider', 'alpha', 'brightness', 'contrast', 'show'],
    methods: ['isBaseLayer()', 'destroy()'],
    example: `// 添加 TMS 底图
const provider = new Cesium.UrlTemplateImageryProvider({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  maximumLevel: 18,
})
viewer.imageryLayers.addImageryProvider(provider)`,
  },
  {
    name: 'Cesium3DTileset',
    category: 'class',
    description: '加载和渲染 3D Tiles 数据集（建筑模型、点云等）。',
    ctor: 'await Cesium.Cesium3DTileset.fromUrl(url, options)',
    properties: ['root', 'boundingSphere', 'maximumScreenSpaceError', 'show', 'style'],
    methods: ['makeStyleDirty()', 'destroy()'],
    example: `const tileset = await Cesium.Cesium3DTileset.fromUrl(
  'https://assets.cesium.com/xxx/tileset.json',
  { maximumScreenSpaceError: 16 }
)
viewer.scene.primitives.add(tileset)
viewer.flyTo(tileset)`,
  },
  {
    name: 'Material',
    category: 'class',
    description: '定义几何体表面的渲染材质（颜色、纹理、发光等）。',
    ctor: '（通常通过 MaterialProperty 配置）',
    properties: ['type', 'uniforms'],
    methods: [],
    example: `// 条纹材质
entity.polygon.material = new Cesium.StripeMaterialProperty({
  evenColor: Cesium.Color.WHITE,
  oddColor: Cesium.Color.BLUE,
  repeat: 5,
})

// 发光线
entity.polyline.material = new Cesium.PolylineGlowMaterialProperty({
  glowPower: 0.2,
  color: Cesium.Color.CYAN,
})`,
  },
  {
    name: 'flyTo',
    category: 'method',
    description: 'Camera.flyTo — 平滑飞行到目标位置。',
    example: `viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(116.4, 39.9, 15000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-45),
    roll: 0,
  },
  duration: 2,
  complete: () => console.log('飞行完成'),
})`,
  },
  {
    name: 'setView',
    category: 'method',
    description: 'Camera.setView — 立即设置相机位置（无动画）。',
    example: `viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(116.4, 39.9, 15000),
  orientation: {
    heading: 0,
    pitch: -Cesium.Math.PI_OVER_FOUR,
    roll: 0,
  },
})`,
  },
  {
    name: 'ScreenSpaceEventHandler',
    category: 'class',
    description: '处理用户输入事件（鼠标点击、移动、悬停等）。',
    ctor: 'new Cesium.ScreenSpaceEventHandler(canvas)',
    properties: [],
    methods: ['setInputAction(action, type)', 'removeInputAction(type)', 'destroy()'],
    example: `const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
  const picked = viewer.scene.pick(movement.position)
  if (Cesium.defined(picked)) {
    console.log('点击了:', picked.id?.name)
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK)`,
  },
]
