# cesium-mcp-bridge

> 浏览器 SDK — 嵌入到 CesiumJS 应用中，通过 WebSocket 接收命令。

[![npm](https://img.shields.io/npm/v/cesium-mcp-bridge)](https://www.npmjs.com/package/cesium-mcp-bridge)

## 安装

```bash
npm install cesium-mcp-bridge
```

**Peer 依赖**：`cesium@~1.139.0`

## 初始化

```js
import { CesiumBridge } from 'cesium-mcp-bridge'

const viewer = new Cesium.Viewer('cesiumContainer')
const bridge = new CesiumBridge(viewer, {
  wsUrl: 'ws://localhost:9100',
  sessionId: 'default',
})
```

## 命令（43 个）

### 视图控制

| 命令 | 描述 | 关键参数 |
|------|------|----------|
| `flyTo` | 相机飞行动画到指定位置 | `longitude`, `latitude`, `height`, `heading`, `pitch`, `roll`, `duration` |
| `setView` | 立即设置相机位置 | `longitude`, `latitude`, `height`, `heading`, `pitch`, `roll` |
| `getView` | 获取当前相机状态 | — |
| `zoomToExtent` | 缩放到地理范围 | `west`, `south`, `east`, `north` |

### 实体

| 命令 | 描述 | 关键参数 |
|------|------|----------|
| `addMarker` | 添加点标记 | `longitude`, `latitude`, `label`, `color`, `size` |
| `addLabel` | 添加文字标注 | `data`, `field`, `style` |
| `addPolyline` | 添加折线（路径/线段） | `coordinates`, `color`, `width`, `clampToGround` |
| `addPolygon` | 添加多边形区域 | `coordinates`, `color`, `outlineColor`, `opacity`, `extrudedHeight` |
| `addModel` | 放置 3D 模型 (glTF/GLB) | `longitude`, `latitude`, `url`, `scale`, `heading`, `pitch`, `roll` |
| `updateEntity` | 更新实体属性 | `entityId`, `position`, `color`, `label`, `scale`, `show` |
| `removeEntity` | 移除单个实体 | `entityId` |

### 图层管理

| 命令 | 描述 | 关键参数 |
|------|------|----------|
| `addGeoJsonLayer` | 加载 GeoJSON 数据 | `url` 或 `data`, `name`, `style` |
| `listLayers` | 列出所有已加载图层 | — |
| `removeLayer` | 按 ID 移除图层 | `layerId` |
| `setLayerVisibility` | 显示/隐藏图层 | `layerId`, `visible` |
| `updateLayerStyle` | 修改图层样式 | `layerId`, `style` |
| `setBasemap` | 切换底图影像 | `provider`, `url` |

### 高级相机

| 命令 | 描述 | 关键参数 |
|------|------|----------|
| `lookAtTransform` | 环绕式相机注视 | `longitude`, `latitude`, `height`, `heading`, `pitch`, `range` |
| `startOrbit` | 开始相机环绕旋转 | `speed`, `direction` |
| `stopOrbit` | 停止环绕动画 | — |
| `setCameraOptions` | 配置相机控制器 | `enableRotate`, `enableZoom`, `enableTilt` |

### 扩展实体类型

| 命令 | 描述 | 关键参数 |
|------|------|----------|
| `addBillboard` | 添加图片图标 | `longitude`, `latitude`, `image`, `scale` |
| `addBox` | 添加 3D 盒体 | `position`, `dimensions`, `material` |
| `addCorridor` | 添加走廊 | `positions`, `width`, `material` |
| `addCylinder` | 添加圆柱体/圆锥体 | `position`, `length`, `topRadius`, `bottomRadius` |
| `addEllipse` | 添加椭圆 | `position`, `semiMajorAxis`, `semiMinorAxis` |
| `addRectangle` | 添加矩形 | `west`, `south`, `east`, `north`, `material` |
| `addWall` | 添加墙体 | `positions`, `maximumHeights`, `minimumHeights` |

### 动画

| 命令 | 描述 | 关键参数 |
|------|------|----------|
| `createAnimation` | 创建路径动画 | `entityId`, `waypoints`, `model` |
| `controlAnimation` | 播放/暂停动画 | `entityId`, `action` |
| `removeAnimation` | 删除动画实体 | `entityId` |
| `listAnimations` | 列出活跃动画 | — |
| `updateAnimationPath` | 更新路径可视属性 | `entityId`, `show`, `width`, `color` |
| `trackEntity` | 相机追踪实体 | `entityId` |
| `controlClock` | 配置时钟 | `startTime`, `stopTime`, `multiplier` |
| `setGlobeLighting` | 地球光照控制 | `enableLighting`, `enableFog` |

### 3D 场景

| 命令 | 描述 | 关键参数 |
|------|------|----------|
| `load3dTiles` | 加载 3D Tileset | `url`, `name`, `maximumScreenSpaceError` |
| `loadTerrain` | 设置地形提供者 | `url`, `provider` |
| `loadImageryService` | 添加影像图层 | `url`, `provider`, `name` |

### 交互

| 命令 | 描述 | 关键参数 |
|------|------|----------|
| `screenshot` | 截取当前视图 | `width`, `height`, `format` |
| `highlight` | 高亮要素 | `layerId`, `featureId`, `color` |

### 其他

| 命令 | 描述 | 关键参数 |
|------|------|----------|
| `playTrajectory` | 沿路径播放动画 | `positions`, `duration`, `loop` |
| `addHeatmap` | 创建热力图可视化 | `points`, `name`, `radius`, `gradient` |

## 两种调用方式

### 方式一：类型安全方法

```typescript
const result = await bridge.flyTo({
  longitude: 116.4,
  latitude: 39.9,
  height: 5000,
  duration: 2,
})
```

### 方式二：JSON 命令分发

```typescript
const result = await bridge.execute({
  action: 'flyTo',
  params: {
    longitude: 116.4,
    latitude: 39.9,
    height: 5000,
    duration: 2,
  },
})
```

## 事件

```typescript
bridge.on('layerAdded', (layer) => console.log('图层已添加:', layer))
bridge.on('layerRemoved', (layerId) => console.log('已移除:', layerId))
bridge.on('error', (err) => console.error('Bridge 错误:', err))
```

## TypeScript 类型

```typescript
import type {
  BridgeCommand,
  BridgeResult,
  FlyToParams,
  SetViewParams,
  AddGeoJsonLayerParams,
  AddHeatmapParams,
  Load3dTilesParams,
  PlayTrajectoryParams,
  LayerInfo,
  HighlightParams,
  // 相机
  LookAtTransformParams,
  StartOrbitParams,
  SetCameraOptionsParams,
  // 扩展实体类型
  AddBillboardParams,
  AddBoxParams,
  AddCorridorParams,
  AddCylinderParams,
  AddEllipseParams,
  AddRectangleParams,
  AddWallParams,
  MaterialSpec,
  MaterialInput,
  OrientationInput,
  PositionDegrees,
  // 动画
  CreateAnimationParams,
  ControlAnimationParams,
  RemoveAnimationParams,
  UpdateAnimationPathParams,
  TrackEntityParams,
  ControlClockParams,
  SetGlobeLightingParams,
  AnimationWaypoint,
  AnimationInfo,
} from 'cesium-mcp-bridge'
```
