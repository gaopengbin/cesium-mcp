# cesium-mcp-bridge 统一接入层 -- 详细技术方案

> 日期: 2025-07
> 状态: 实施阶段（基于官方源码分析完成）
> 最后更新: 2025-07

---

## 1. 目标定位

将 `cesium-mcp-bridge` 从 "cesium-mcp 专属命令执行层" 升级为 **"CesiumJS AI Agent 能力的统一接入层"**，**原生融合**官方 CesiumGS 全部功能：

- **原生实现**：不依赖官方服务器，直接将官方 3 个 MCP Server (Camera/Entity/Animation) 的全部功能融合进 bridge
- **44+ 命令**：现有 25 个 execute() 命令 + 19 个新增命令（Camera 4 + Entity 7 + Animation 8）
- **功能超集**：bridge 成为官方所有功能的超集，用户一个 bridge 即拥有全部能力
- **一行接入**：`new CesiumBridge(viewer)` 即可获得所有能力，无需额外配置

---

## 2. 架构总览

```
┌─────────────────────── AI Agent 侧 ───────────────────────┐
│                                                            │
│  Claude / GPT / Qwen 等 LLM                               │
│    └── cesium-mcp-runtime (stdio MCP, 44+ tools)           │
│        ├── 原有 25 个工具 (view/entity/layer/...)          │
│        └── 新增 19 个工具 (camera/entity/animation 融合)   │
│                                                            │
└──────────────────── WebSocket 下发 ───────────────────────┘
                          │
                          ▼
┌─────────────── 浏览器 (用户现有 CesiumJS 应用) ───────────┐
│                                                            │
│  ┌──────── CesiumBridge (增强) ──────────────────────────┐ │
│  │                                                        │ │
│  │  execute(cmd)                                          │ │
│  │    ├── 原有 25 个命令 (view/layer/entity/interaction)  │ │
│  │    └── 新增 19 个命令 (原生融合官方功能)               │ │
│  │                                                        │ │
│  │  ┌── commands/ ────────────────────────────────────┐   │ │
│  │  │  view.ts         (飞行/视角)                    │   │ │
│  │  │  layer.ts        (图层管理)                     │   │ │
│  │  │  entity.ts       (标注/标记)                    │   │ │
│  │  │  interaction.ts  (截图/高亮)                    │   │ │
│  │  │  trajectory.ts   (轨迹动画)                     │   │ │
│  │  │  camera.ts       (NEW: 官方 Camera 功能融合)    │   │ │
│  │  │  entity-types.ts (NEW: 官方 Entity 类型融合)    │   │ │
│  │  │  animation.ts    (NEW: 官方 Animation 功能融合) │   │ │
│  │  └─────────────────────────────────────────────────┘   │ │
│  │                                                        │ │
│  │  ─────── Cesium.Viewer ──────────                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

> **与旧方案的区别**：旧方案通过 CesiumMCPConnector 连接官方 4 个 WebSocket 服务器做中继；
> 新方案直接将官方代码逻辑原生实现在 bridge 内，无需额外服务器，降低部署复杂度。

---

## 3. 核心设计原则

| 原则 | 说明 |
|------|------|
| **原生融合** | 官方功能直接实现在 bridge 内，不做中继/转发，不依赖官方运行时 |
| **Bridge 无网络** | `CesiumBridge` 保持纯命令执行层，零 WebSocket 依赖 |
| **统一 execute()** | 新增命令与现有命令共用 `execute(action, params)` 入口，统一命令分发 |
| **功能超集** | 完整覆盖官方 Camera(7) + Entity(14) + Animation(8) 全部 29 个 MCP 工具的功能 |
| **渐进增强** | 已有命令保持兼容，新增命令可选使用，不影响现有用户 |

---

## 4. 模块设计

### 4.1 文件结构变更

```
packages/cesium-mcp-bridge/src/
├── bridge.ts              # 增强: execute() 新增 19 个 case
├── types.ts               # 增强: 新增融合命令类型定义
├── index.ts               # (不变)
└── commands/
    ├── view.ts            # (不变)
    ├── layer.ts           # (不变)
    ├── entity.ts          # (不变)
    ├── interaction.ts     # (不变)
    ├── trajectory.ts      # (不变)
    ├── camera.ts          # NEW: lookAt/orbit/controllerOptions (4 commands)
    ├── entity-types.ts    # NEW: 7 新实体类型 (7 commands)
    └── animation.ts       # NEW: 完整动画系统 (8 commands)
```

> 不再使用 `commands/official/` 子目录 — 融合即为一等公民，与现有命令文件平级。

### 4.2 CesiumBridge execute() 扩展

```typescript
// bridge.ts — execute() switch 新增 case

async execute(cmd: { action: string; params: Record<string, unknown> }) {
  switch (cmd.action) {
    // ========= 现有 25 个命令 (不变) =========
    case 'flyTo': case 'setView': case 'getView': /* ... */

    // ========= 融合: Camera (4 新命令) =========
    case 'lookAtTransform':
      return handleLookAtTransform(this._viewer, cmd.params)
    case 'startOrbit':
      return handleStartOrbit(this._viewer, cmd.params)
    case 'stopOrbit':
      return handleStopOrbit(this._viewer)
    case 'setCameraOptions':
      return handleSetCameraOptions(this._viewer, cmd.params)

    // ========= 融合: Entity 新类型 (7 新命令) =========
    case 'addBillboard':
      return handleAddBillboard(this._viewer, cmd.params, this._layerManager)
    case 'addBox':
      return handleAddBox(this._viewer, cmd.params, this._layerManager)
    case 'addCorridor':
      return handleAddCorridor(this._viewer, cmd.params, this._layerManager)
    case 'addCylinder':
      return handleAddCylinder(this._viewer, cmd.params, this._layerManager)
    case 'addEllipse':
      return handleAddEllipse(this._viewer, cmd.params, this._layerManager)
    case 'addRectangle':
      return handleAddRectangle(this._viewer, cmd.params, this._layerManager)
    case 'addWall':
      return handleAddWall(this._viewer, cmd.params, this._layerManager)

    // ========= 融合: Animation (8 新命令) =========
    case 'createAnimation':
      return handleCreateAnimation(this._viewer, cmd.params)
    case 'controlAnimation':
      return handleControlAnimation(this._viewer, cmd.params)
    case 'removeAnimation':
      return handleRemoveAnimation(this._viewer, cmd.params)
    case 'listAnimations':
      return handleListAnimations(this._viewer)
    case 'updateAnimationPath':
      return handleUpdateAnimationPath(this._viewer, cmd.params)
    case 'trackEntity':
      return handleTrackEntity(this._viewer, cmd.params)
    case 'controlClock':
      return handleControlClock(this._viewer, cmd.params)
    case 'setGlobeLighting':
      return handleSetGlobeLighting(this._viewer, cmd.params)
  }
}
```

> 不再需要 `executeOfficial()` 方法和 `CesiumMCPConnector` 类。

---

## 5. 官方 vs 我方命令映射（重叠分析）

融合后不再有"官方命令"和"我方命令"之分，全部是 bridge 的原生命令。下表记录功能重叠关系：

| 官方 MCP Tool | 我方 execute() 命令 | 关系 | 处理方式 |
|---------------|-------------------|------|---------|
| `camera_fly_to` | `flyTo` | 功能重叠 | 保留我方命令作为主入口，参数已兼容 |
| `camera_set_view` | `setView` | 功能重叠 | 同上 |
| `camera_get_position` | `getView` | 功能重叠 | 我方返回值已包含官方全部字段 |
| `entity_add_point` | `addMarker` | 功能重叠 | addMarker 用 billboard, 新增 addPoint 用 point 图元 |
| `entity_add_label` | `addLabel` | 功能重叠 | 保留我方 |
| `entity_add_model` | `addModel` | 功能重叠 | 保留我方 |
| `entity_add_polygon` | `addPolygon` | 功能重叠 | 保留我方，补充 extrudedHeight |
| `entity_add_polyline` | `addPolyline` | 功能重叠 | 保留我方，补充 arcType/glow |
| `entity_remove` | `removeEntity` | 功能一致 | 保留我方 |
| `entity_list` | `listLayers` | 部分重叠 | 保留我方图层维度列表 |
| `animation_create` | `playTrajectory` | 部分重叠 | playTrajectory 简化版, createAnimation 完整版 |

**不重叠的新增命令（19个）**：
- Camera: `lookAtTransform`, `startOrbit`, `stopOrbit`, `setCameraOptions`
- Entity: `addBillboard`, `addBox`, `addCorridor`, `addCylinder`, `addEllipse`, `addRectangle`, `addWall`
- Animation: `createAnimation`, `controlAnimation`, `removeAnimation`, `listAnimations`, `updateAnimationPath`, `trackEntity`, `controlClock`, `setGlobeLighting`

---

## 6. 融合命令实现设计（基于官方源码分析）

> 以下 API 调用细节均来自对 CesiumGS/cesium-ai-integrations 仓库实际代码的分析。

### 6.1 Camera 模块 (`commands/camera.ts`) — 4 个新命令

#### 6.1.1 lookAtTransform

**官方实现分析** (camera-server/browser/camera-manager.ts):
```typescript
// 核心 API 调用
const center = Cesium.Cartesian3.fromDegrees(longitude, latitude, height ?? 0)
const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center)
const hpr = new Cesium.HeadingPitchRange(
  Cesium.Math.toRadians(heading ?? 0),
  Cesium.Math.toRadians(pitch ?? -45),
  range ?? 1000
)
viewer.camera.lookAtTransform(transform, hpr)
```

**参数 Schema**:
```typescript
{
  longitude: number      // degrees, required
  latitude: number       // degrees, required
  height?: number        // meters, default 0
  heading?: number       // degrees, default 0
  pitch?: number         // degrees, default -45
  range?: number         // meters, default 1000
}
```

#### 6.1.2 startOrbit

**官方实现分析**: 使用 `viewer.clock.onTick` 事件监听器实现持续旋转。

```typescript
// 核心逻辑
const speedValue = speed ?? 0.005  // rad/tick
const direction = clockwise ? -1 : 1

this.orbitHandler = viewer.clock.onTick.addEventListener(() => {
  viewer.camera.rotateRight(speedValue * direction)
})
```

**参数 Schema**:
```typescript
{
  speed?: number         // radians per tick, default 0.005
  clockwise?: boolean    // default true (true = negative rotateRight)
}
```

**注意**: 需在 Bridge 实例上存储 `_orbitHandler` 引用，供 stopOrbit 清理。

#### 6.1.3 stopOrbit

**官方实现**: 移除 tick 监听器。
```typescript
if (this.orbitHandler) {
  this.orbitHandler()   // Event.RemoveCallback
  this.orbitHandler = null
}
```

无参数。

#### 6.1.4 setCameraOptions

**官方实现**: 直接设置 `screenSpaceCameraController` 属性。

```typescript
const controller = viewer.scene.screenSpaceCameraController
if (enableRotate !== undefined) controller.enableRotate = enableRotate
if (enableTranslate !== undefined) controller.enableTranslate = enableTranslate
if (enableZoom !== undefined) controller.enableZoom = enableZoom
if (enableTilt !== undefined) controller.enableTilt = enableTilt
if (enableLook !== undefined) controller.enableLook = enableLook
if (minimumZoomDistance !== undefined) controller.minimumZoomDistance = minimumZoomDistance
if (maximumZoomDistance !== undefined) controller.maximumZoomDistance = maximumZoomDistance
if (enableInputs !== undefined) controller.enableInputs = enableInputs
```

**参数 Schema**: 全部可选 boolean/number。

---

### 6.2 Entity 模块 (`commands/entity-types.ts`) — 7 个新实体类型

> **重要发现**: 官方 Entity Server 有 14 个独立 MCP tool（每种实体类型一个 tool），
> 而非最初假设的 3 个命令通过 entityType 分发。浏览器端 `entity-manager.ts` 
> 通过属性键检测自动识别实体类型。

#### 通用约定（从官方代码提取）

**颜色格式** — 双格式兼容:
```typescript
// 官方支持两种颜色表示
{ red: 0.5, green: 0.8, blue: 1.0, alpha: 1.0 }  // RGBA 0-1
"#80CCFF"  // CSS hex (我方已有的支持)

// 转换工具函数
function resolveColor(c: any): Cesium.Color {
  if (typeof c === 'string') return Cesium.Color.fromCssColorString(c)
  return new Cesium.Color(c.red, c.green, c.blue, c.alpha ?? 1.0)
}
```

**位置格式**:
```typescript
{ longitude: number, latitude: number, height?: number }  // degrees
// 转 Cesium: Cesium.Cartesian3.fromDegrees(lon, lat, height ?? 0)
```

**材质 (Material)** — 判别联合类型:
```typescript
type MaterialSpec =
  | { type: 'color', color: ColorSpec }
  | { type: 'image', image: string, repeat?: { x: number, y: number } }
  | { type: 'checkerboard', evenColor?: ColorSpec, oddColor?: ColorSpec, repeat?: { x: number, y: number } }
  | { type: 'stripe', orientation?: 'horizontal'|'vertical', evenColor?: ColorSpec, oddColor?: ColorSpec }
  | { type: 'grid', color?: ColorSpec, cellAlpha?: number, lineCount?: { x: number, y: number } }
```

**方向 (orientation)** — 有朝向的实体 (model/box/cylinder):
```typescript
{ heading: number, pitch: number, roll: number }  // degrees
// 转 Cesium:
const hpr = Cesium.HeadingPitchRoll.fromDegrees(heading, pitch, roll)
const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr)
```

#### 6.2.1 addBillboard

```typescript
viewer.entities.add({
  name,
  position: Cesium.Cartesian3.fromDegrees(lon, lat, height),
  billboard: {
    image,                    // URL string, required
    scale,                    // number, default 1.0
    color: resolveColor(color),
    pixelOffset: new Cesium.Cartesian2(pixelOffset?.x ?? 0, pixelOffset?.y ?? 0),
    horizontalOrigin: Cesium.HorizontalOrigin[horizontalOrigin ?? 'CENTER'],
    verticalOrigin: Cesium.VerticalOrigin[verticalOrigin ?? 'CENTER'],
    heightReference: Cesium.HeightReference[heightReference ?? 'NONE'],
    disableDepthTestDistance: Number.POSITIVE_INFINITY  // 官方默认
  }
})
```

#### 6.2.2 addBox

```typescript
viewer.entities.add({
  name,
  position: Cesium.Cartesian3.fromDegrees(lon, lat, height),
  orientation,  // HPR → Quaternion
  box: {
    dimensions: new Cesium.Cartesian3(
      dimensions.width,    // x, meters
      dimensions.length,   // y, meters
      dimensions.height    // z, meters
    ),
    material: resolveMaterial(material),
    outline: outline ?? true,
    outlineColor: resolveColor(outlineColor),
    heightReference,
    fill: fill ?? true
  }
})
```

#### 6.2.3 addCorridor

```typescript
viewer.entities.add({
  name,
  corridor: {
    positions: Cesium.Cartesian3.fromDegreesArrayHeights(
      positions.flatMap(p => [p.longitude, p.latitude, p.height ?? 0])
    ),
    width,                  // meters, required
    material: resolveMaterial(material),
    cornerType: Cesium.CornerType[cornerType ?? 'ROUNDED'],
    extrudedHeight,         // meters, optional
    height,                 // meters, optional
    outline, outlineColor
  }
})
```

#### 6.2.4 addCylinder

```typescript
viewer.entities.add({
  name,
  position: Cesium.Cartesian3.fromDegrees(lon, lat, height),
  orientation,  // HPR → Quaternion
  cylinder: {
    length,                 // meters, required
    topRadius,              // meters, required
    bottomRadius,           // meters, required
    material: resolveMaterial(material),
    outline, outlineColor, fill,
    numberOfVerticalLines,  // default 16
    slices                  // default 128
  }
})
```

#### 6.2.5 addEllipse

```typescript
viewer.entities.add({
  name,
  position: Cesium.Cartesian3.fromDegrees(lon, lat, height),
  ellipse: {
    semiMajorAxis,    // meters, required
    semiMinorAxis,    // meters, required
    material: resolveMaterial(material),
    height,           // meters, optional (surface height)
    extrudedHeight,   // meters, optional (3D ellipse)
    rotation,         // radians, optional
    outline, outlineColor, fill,
    stRotation,       // texture rotation
    numberOfVerticalLines
  }
})
```

#### 6.2.6 addRectangle

```typescript
viewer.entities.add({
  name,
  rectangle: {
    coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
    material: resolveMaterial(material),
    height,           // meters, optional
    extrudedHeight,   // meters, optional
    rotation,         // radians, optional
    outline, outlineColor, fill,
    stRotation
  }
})
```

**参数 Schema**:
```typescript
{
  west: number, south: number, east: number, north: number  // degrees
}
```

#### 6.2.7 addWall

```typescript
viewer.entities.add({
  name,
  wall: {
    positions: Cesium.Cartesian3.fromDegreesArrayHeights(
      positions.flatMap(p => [p.longitude, p.latitude, p.height ?? 0])
    ),
    minimumHeights,   // number[], optional
    maximumHeights,   // number[], optional
    material: resolveMaterial(material),
    outline, outlineColor, fill
  }
})
```

---

### 6.3 Animation 模块 (`commands/animation.ts`) — 8 个新命令

> 官方 Animation Server 维护浏览器端状态: `animations: Map<string, {startTime, stopTime}>`，
> 服务端无状态。我方融合实现同样需要在 Bridge 实例上维护此 Map。

#### 6.3.1 createAnimation

**官方实现分析** (animation-server/browser/animation-manager.ts):

这是最复杂的命令，核心是 `SampledPositionProperty` 时间采样动画系统。

```typescript
// 核心 API 调用流程
const positionProperty = new Cesium.SampledPositionProperty()

// 1. 添加时间采样点
for (const waypoint of waypoints) {
  const time = Cesium.JulianDate.fromIso8601(waypoint.time)
  const position = Cesium.Cartesian3.fromDegrees(
    waypoint.longitude, waypoint.latitude, waypoint.height ?? 0
  )
  positionProperty.addSample(time, position)
}

// 2. 设置插值算法
positionProperty.setInterpolationOptions({
  interpolationDegree: 2,
  interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
})

// 3. 创建实体
const entity = viewer.entities.add({
  name,
  position: positionProperty,
  // 自动朝向 (沿运动方向)
  orientation: new Cesium.VelocityOrientationProperty(positionProperty),
  // 可选: 3D 模型
  model: modelUri ? {
    uri: modelUri,  // 支持预设: cesium_man, cesium_air, ground_vehicle, cesium_drone
    minimumPixelSize: 64,
    maximumScale: 200
  } : undefined,
  // 轨迹路径线
  path: showPath ? new Cesium.PathGraphics({
    width: pathWidth ?? 2,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.1,
      color: resolveColor(pathColor ?? '#00FF00')
    }),
    leadTime: pathLeadTime ?? 0,
    trailTime: pathTrailTime ?? 1e10
  }) : undefined,
  // 可选: 点标记 (无模型时)
  point: !modelUri ? { pixelSize: 10, color: Cesium.Color.RED } : undefined
})

// 4. 设置时钟范围
const startTime = Cesium.JulianDate.fromIso8601(waypoints[0].time)
const stopTime = Cesium.JulianDate.fromIso8601(waypoints[waypoints.length - 1].time)
viewer.clock.startTime = startTime.clone()
viewer.clock.stopTime = stopTime.clone()
viewer.clock.currentTime = startTime.clone()
viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP
viewer.clock.multiplier = multiplier ?? 1
viewer.clock.shouldAnimate = true

// 5. 记录到 animations Map
this.animations.set(entity.id, { startTime, stopTime })
```

**参数 Schema**:
```typescript
{
  name?: string
  waypoints: Array<{
    longitude: number       // degrees
    latitude: number        // degrees
    height?: number         // meters
    time: string            // ISO 8601 时间戳
  }>
  modelUri?: string         // glTF/glb URL, 或预设名: cesium_man/cesium_air/ground_vehicle/cesium_drone
  showPath?: boolean        // default true
  pathWidth?: number        // pixels, default 2
  pathColor?: string        // CSS color, default '#00FF00'
  pathLeadTime?: number     // seconds, default 0
  pathTrailTime?: number    // seconds, default 1e10
  multiplier?: number       // clock speed, default 1
  shouldAnimate?: boolean   // auto-start, default true
}
```

**模型预设 URL 映射** (官方硬编码):
```typescript
const MODEL_PRESETS: Record<string, string> = {
  cesium_man: 'https://raw.githubusercontent.com/.../Cesium_Man.glb',
  cesium_air: 'https://raw.githubusercontent.com/.../Cesium_Air.glb',
  ground_vehicle: 'https://raw.githubusercontent.com/.../GroundVehicle.glb',
  cesium_drone: 'https://raw.githubusercontent.com/.../CesiumDrone.glb'
}
```

#### 6.3.2 controlAnimation

```typescript
// play/pause 动画
if (action === 'play') {
  viewer.clock.shouldAnimate = true
} else if (action === 'pause') {
  viewer.clock.shouldAnimate = false
}
```

**参数**: `{ action: 'play' | 'pause' }`

#### 6.3.3 removeAnimation

```typescript
const entity = viewer.entities.getById(entityId)
if (entity) {
  viewer.entities.remove(entity)
  this.animations.delete(entityId)
}
```

**参数**: `{ entityId: string }`

#### 6.3.4 listAnimations

```typescript
// 遍历 animations Map, 返回活跃动画列表
const result = []
for (const [entityId, info] of this.animations) {
  const entity = viewer.entities.getById(entityId)
  result.push({
    entityId,
    name: entity?.name,
    startTime: Cesium.JulianDate.toIso8601(info.startTime),
    stopTime: Cesium.JulianDate.toIso8601(info.stopTime),
    exists: !!entity
  })
}
```

无参数。

#### 6.3.5 updateAnimationPath

```typescript
const entity = viewer.entities.getById(entityId)
if (entity?.path) {
  if (width !== undefined) entity.path.width = new Cesium.ConstantProperty(width)
  if (color !== undefined) entity.path.material = new Cesium.PolylineGlowMaterialProperty({
    glowPower: 0.1,
    color: resolveColor(color)
  })
  if (leadTime !== undefined) entity.path.leadTime = new Cesium.ConstantProperty(leadTime)
  if (trailTime !== undefined) entity.path.trailTime = new Cesium.ConstantProperty(trailTime)
  if (show !== undefined) entity.path.show = new Cesium.ConstantProperty(show)
}
```

**参数**: `{ entityId, width?, color?, leadTime?, trailTime?, show? }`

#### 6.3.6 trackEntity

```typescript
if (entityId) {
  const entity = viewer.entities.getById(entityId)
  viewer.trackedEntity = entity
  // 可选: 设定跟踪视角
  if (heading !== undefined || pitch !== undefined || range !== undefined) {
    const position = entity.position.getValue(viewer.clock.currentTime)
    const hpr = new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(heading ?? 0),
      Cesium.Math.toRadians(pitch ?? -30),
      range ?? 500
    )
    viewer.camera.lookAt(position, hpr)
  }
} else {
  viewer.trackedEntity = undefined  // 取消跟踪
}
```

**参数**: `{ entityId?, heading?, pitch?, range? }`

#### 6.3.7 controlClock

**官方实现**: 3 个 action 通过 switch 分发。

```typescript
switch (action) {
  case 'configure':
    // 完整时钟配置
    if (startTime) viewer.clock.startTime = Cesium.JulianDate.fromIso8601(startTime)
    if (stopTime) viewer.clock.stopTime = Cesium.JulianDate.fromIso8601(stopTime)
    if (currentTime) viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(currentTime)
    if (multiplier !== undefined) viewer.clock.multiplier = multiplier
    if (shouldAnimate !== undefined) viewer.clock.shouldAnimate = shouldAnimate
    if (clockRange) viewer.clock.clockRange = Cesium.ClockRange[clockRange]
    break

  case 'setTime':
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(time)
    break

  case 'setMultiplier':
    viewer.clock.multiplier = multiplier
    break
}
```

**参数**: `{ action: 'configure'|'setTime'|'setMultiplier', ...相应参数 }`

#### 6.3.8 setGlobeLighting

```typescript
viewer.scene.globe.enableLighting = enableLighting ?? true
if (dynamicAtmosphereLighting !== undefined)
  viewer.scene.globe.dynamicAtmosphereLighting = dynamicAtmosphereLighting
if (dynamicAtmosphereLightingFromSun !== undefined)
  viewer.scene.globe.dynamicAtmosphereLightingFromSun = dynamicAtmosphereLightingFromSun
```

**参数**: `{ enableLighting?, dynamicAtmosphereLighting?, dynamicAtmosphereLightingFromSun? }`

---

## 7. Bridge 状态管理

融合后 Bridge 需要维护以下新增状态：

```typescript
class CesiumBridge {
  // 现有
  private _viewer: Cesium.Viewer
  private _layerManager: LayerManager

  // 新增 (融合)
  private _orbitHandler: (() => void) | null = null           // startOrbit 的 tick 回调
  private _animations: Map<string, { startTime: Cesium.JulianDate, stopTime: Cesium.JulianDate }> = new Map()
}
```

---

## 8. 用户接入方式（更新）

```javascript
// 融合后接入方式不变 — 一行代码
import { CesiumBridge } from 'cesium-mcp-bridge'
const bridge = new CesiumBridge(viewer)

// 所有命令统一通过 execute() 调用
bridge.execute({ action: 'flyTo', params: { longitude: 116.4, latitude: 39.9, height: 1000 } })
bridge.execute({ action: 'addBox', params: { longitude: 116.4, latitude: 39.9, ... } })
bridge.execute({ action: 'createAnimation', params: { waypoints: [...] } })
bridge.execute({ action: 'startOrbit', params: { speed: 0.01 } })

// 无需 CesiumMCPConnector, 无需连接官方服务器
```

---

## 8.5 Runtime MCP Tools 注册方案（Phase 3）

融合后需在 `cesium-mcp-runtime/src/index.ts` 中新增 19 个 MCP tool，复用现有 `sendToBrowser(action, params)` 模式。

### 8.5.1 注册模式（与现有一致）

```typescript
// 现有 tool 注册模式:
server.tool(
  'toolName',          // MCP tool 名称
  '工具描述',          // LLM 看到的描述
  { /* Zod schema */ },// 参数定义
  async (params) => {
    const result = await sendToBrowser('action', params)  // action = bridge execute() case
    return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { success: true }) }] }
  },
)
```

### 8.5.2 新增 Camera Tools (4个)

```typescript
// lookAtTransform
server.tool('lookAtTransform', '锁定相机注视某个地理坐标点，围绕该点旋转观察', {
  longitude: z.number().describe('注视点经度'),
  latitude: z.number().describe('注视点纬度'),
  height: z.number().default(0).describe('注视点海拔高度(米)'),
  heading: z.number().default(0).describe('航向角(度)'),
  pitch: z.number().default(-45).describe('俯仰角(度)'),
  range: z.number().default(1000).describe('与注视点的距离(米)'),
}, async (params) => { ... })

// startOrbit
server.tool('startOrbit', '开始自动环绕当前视角旋转', {
  speed: z.number().default(0.005).describe('旋转速度(弧度/帧)'),
  clockwise: z.boolean().default(true).describe('是否顺时针'),
}, async (params) => { ... })

// stopOrbit
server.tool('stopOrbit', '停止自动环绕旋转', {}, async () => { ... })

// setCameraOptions
server.tool('setCameraOptions', '设置相机交互控制选项(缩放/旋转/倾斜开关)', {
  enableRotate: z.boolean().optional().describe('允许旋转'),
  enableTranslate: z.boolean().optional().describe('允许平移'),
  enableZoom: z.boolean().optional().describe('允许缩放'),
  enableTilt: z.boolean().optional().describe('允许倾斜'),
  enableLook: z.boolean().optional().describe('允许自由观察'),
  minimumZoomDistance: z.number().optional().describe('最小缩放距离(米)'),
  maximumZoomDistance: z.number().optional().describe('最大缩放距离(米)'),
  enableInputs: z.boolean().optional().describe('是否允许所有用户输入'),
}, async (params) => { ... })
```

### 8.5.3 新增 Entity Tools (7个)

```typescript
// addBillboard
server.tool('addBillboard', '添加图片标注(billboard)到指定位置', {
  longitude: z.number(), latitude: z.number(), height: z.number().default(0),
  name: z.string().optional(),
  image: z.string().describe('图片URL'),
  scale: z.number().default(1.0),
  color: z.string().optional().describe('叠加颜色(CSS格式)'),
}, async (params) => { ... })

// addBox
server.tool('addBox', '在指定位置添加三维盒体', {
  longitude: z.number(), latitude: z.number(), height: z.number().default(0),
  name: z.string().optional(),
  width: z.number().describe('宽度(米)'),
  length: z.number().describe('长度(米)'),
  boxHeight: z.number().describe('高度(米)'),
  color: z.string().default('#FF0000').describe('颜色'),
  outline: z.boolean().default(true),
  heading: z.number().default(0), pitch: z.number().default(0), roll: z.number().default(0),
}, async (params) => { ... })

// addCorridor
server.tool('addCorridor', '添加走廊(沿路径的带宽度区域)', {
  positions: z.array(z.object({ longitude: z.number(), latitude: z.number(), height: z.number().default(0) })),
  width: z.number().describe('走廊宽度(米)'),
  name: z.string().optional(), color: z.string().default('#FF0000'),
  cornerType: z.enum(['ROUNDED', 'MITERED', 'BEVELED']).default('ROUNDED'),
  extrudedHeight: z.number().optional(),
}, async (params) => { ... })

// addCylinder
server.tool('addCylinder', '在指定位置添加圆柱体/圆锥体', {
  longitude: z.number(), latitude: z.number(), height: z.number().default(0),
  name: z.string().optional(),
  cylinderLength: z.number().describe('圆柱长度(米)'),
  topRadius: z.number().describe('顶部半径(米)'),
  bottomRadius: z.number().describe('底部半径(米)'),
  color: z.string().default('#FF0000'),
}, async (params) => { ... })

// addEllipse
server.tool('addEllipse', '在指定位置添加椭圆形', {
  longitude: z.number(), latitude: z.number(), height: z.number().default(0),
  name: z.string().optional(),
  semiMajorAxis: z.number().describe('半长轴(米)'),
  semiMinorAxis: z.number().describe('半短轴(米)'),
  color: z.string().default('#FF0000'),
  extrudedHeight: z.number().optional(),
}, async (params) => { ... })

// addRectangle
server.tool('addRectangle', '添加矩形区域覆盖物', {
  west: z.number(), south: z.number(), east: z.number(), north: z.number(),
  name: z.string().optional(),
  color: z.string().default('#FF0000'),
  height: z.number().optional(),
  extrudedHeight: z.number().optional(),
}, async (params) => { ... })

// addWall
server.tool('addWall', '添加垂直墙体', {
  positions: z.array(z.object({ longitude: z.number(), latitude: z.number(), height: z.number().default(0) })),
  name: z.string().optional(), color: z.string().default('#FF0000'),
  minimumHeights: z.array(z.number()).optional(),
  maximumHeights: z.array(z.number()).optional(),
}, async (params) => { ... })
```

### 8.5.4 新增 Animation Tools (8个)

```typescript
// createAnimation
server.tool('createAnimation', '创建时间采样动画(沿路径运动的实体)', {
  name: z.string().optional(),
  waypoints: z.array(z.object({
    longitude: z.number(), latitude: z.number(), height: z.number().default(0),
    time: z.string().describe('ISO 8601时间戳'),
  })).min(2).describe('路径点(至少2个，含时间)'),
  modelUri: z.string().optional().describe('3D模型URL或预设名(cesium_man/cesium_air/ground_vehicle/cesium_drone)'),
  showPath: z.boolean().default(true),
  pathWidth: z.number().default(2),
  pathColor: z.string().default('#00FF00'),
  multiplier: z.number().default(1).describe('时钟速度倍率'),
}, async (params) => { ... })

// controlAnimation
server.tool('controlAnimation', '播放或暂停动画', {
  action: z.enum(['play', 'pause']),
}, async (params) => { ... })

// removeAnimation
server.tool('removeAnimation', '移除指定动画实体', {
  entityId: z.string().describe('动画实体ID'),
}, async (params) => { ... })

// listAnimations
server.tool('listAnimations', '列出所有活跃动画', {}, async () => { ... })

// updateAnimationPath
server.tool('updateAnimationPath', '更新动画路径显示属性', {
  entityId: z.string(),
  width: z.number().optional(),
  color: z.string().optional(),
  leadTime: z.number().optional(),
  trailTime: z.number().optional(),
  show: z.boolean().optional(),
}, async (params) => { ... })

// trackEntity
server.tool('trackEntity', '相机跟踪指定实体', {
  entityId: z.string().optional().describe('实体ID，不传则取消跟踪'),
  heading: z.number().optional(), pitch: z.number().optional(), range: z.number().optional(),
}, async (params) => { ... })

// controlClock
server.tool('controlClock', '控制场景时钟', {
  action: z.enum(['configure', 'setTime', 'setMultiplier']),
  startTime: z.string().optional(), stopTime: z.string().optional(),
  currentTime: z.string().optional(), time: z.string().optional(),
  multiplier: z.number().optional(),
  shouldAnimate: z.boolean().optional(),
  clockRange: z.enum(['UNBOUNDED', 'CLAMPED', 'LOOP_STOP']).optional(),
}, async (params) => { ... })

// setGlobeLighting
server.tool('setGlobeLighting', '设置地球光照效果', {
  enableLighting: z.boolean().default(true),
  dynamicAtmosphereLighting: z.boolean().optional(),
  dynamicAtmosphereLightingFromSun: z.boolean().optional(),
}, async (params) => { ... })
```

---

## 9. 实施路线图

| 阶段 | 内容 | 产出 | 命令数 |
|------|------|------|-------|
| **Phase 1** | Camera 融合 (4新命令) + Entity 新类型 (7新命令) | `commands/camera.ts` + `commands/entity-types.ts` | 25→36 |
| **Phase 2** | Animation 融合 (8新命令) | `commands/animation.ts` | 36→44 |
| **Phase 3** | Runtime MCP tools 注册 + 端到端测试 | `cesium-mcp-runtime/src/index.ts` 新增 19 个 tool | 44 tools |
| **Phase 4** | 文档更新 + npm 发布 | README / CHANGELOG / npm publish | v0.x.0 |

---

## 9.5 工具数量管理策略

融合后 MCP tools 达到 44+，需要解决 LLM 工具选择困难的问题。

### 业界参考方案

#### GitHub MCP Server (github/github-mcp-server)
GitHub 使用 **3 层策略**:

1. **Toolsets 分组** — 工具按功能域分组（repos/issues/pull_requests/actions 等 17 个组），用户通过 `--toolsets repos,issues` 或 `GITHUB_TOOLSETS` 环境变量选择启用哪些组
2. **Individual Tools** — `--tools get_file_contents,issue_read` 精确挑选单个工具，可与 toolsets 叠加使用
3. **Dynamic Tool Discovery** (Beta) — `--dynamic-toolsets` 模式：启动时只注册 3 个元工具（`enable_toolset` / `list_available_toolsets` / `get_toolset_tools`），LLM 根据用户意图按需激活工具组

#### CesiumGS 官方 (maka/search-tool 分支, 未合入 main)
每个 MCP Server 注册一个 `search_tools` 元工具:
- `search_tools(query?, detailLevel)` — 按关键词搜索可用工具
- 3 级详情: `name` → `name+description` → `full` (含完整 JSON Schema)
- 通过 `ToolRegistry` 注册表实现，各 server 共享

### 我方拟采用方案

**推荐: Toolsets 分组 (借鉴 GitHub)**

```typescript
// 工具分组定义
const TOOLSETS = {
  // 默认启用
  view: ['flyTo', 'setView', 'getView', 'zoomToExtent'],
  entity: ['addMarker', 'addLabel', 'addModel', 'addPolygon', 'addPolyline', 'updateEntity', 'removeEntity'],
  layer: ['addGeoJsonLayer', 'listLayers', 'removeLayer', 'setLayerVisibility', 'updateLayerStyle', 'setBasemap'],

  // 可选启用 (融合工具)
  camera: ['lookAtTransform', 'startOrbit', 'stopOrbit', 'setCameraOptions'],
  'entity-ext': ['addBillboard', 'addBox', 'addCorridor', 'addCylinder', 'addEllipse', 'addRectangle', 'addWall'],
  animation: ['createAnimation', 'controlAnimation', 'removeAnimation', 'listAnimations', 
              'updateAnimationPath', 'trackEntity', 'controlClock', 'setGlobeLighting'],
  tiles: ['load3dTiles', 'loadTerrain', 'loadImageryService'],
  interaction: ['screenshot', 'highlight'],
  trajectory: ['playTrajectory'],
  heatmap: ['addHeatmap'],
}

// 通过环境变量控制
// CESIUM_TOOLSETS="view,entity,camera,animation"  (只启用这些组)
// CESIUM_TOOLSETS="all"  (启用全部)
// 不设置 = 使用默认组 (view + entity + layer + interaction)
```

### 最终策略: 两层同步实现 (Phase 3)

| 层级 | 方案 | 说明 |
|------|------|------|
| **第一层** | 静态 Toolsets 分组 | `CESIUM_TOOLSETS` 环境变量控制启用哪些组，默认启用核心组(~19 tools)，覆盖 80% 场景，零额外交互成本 |
| **第二层** | Dynamic Discovery | 额外注册 `list_toolsets` + `enable_toolset` 两个元工具，LLM 发现需要更多功能时自主调 `enable_toolset("animation")` 激活，无需用户手动配置环境变量 |

两层共存互补：
- 用户显式配置 `CESIUM_TOOLSETS` → 按配置启用，`enable_toolset` 仍可追加
- 用户不配置 → 默认核心组 + LLM 可通过 `enable_toolset` 按需扩展
- `CESIUM_TOOLSETS=all` → 全部启用，`list_toolsets`/`enable_toolset` 不注册（无需）

**为什么不用 search_tools?**
- 每次使用工具前需多一次搜索交互，增加 token 开销和延迟
- 对小模型不友好（可能跳过搜索直接凭"记忆"调工具）
- Toolsets + Dynamic Discovery 组合更优：静态分组保证基础可用，动态发现保证扩展性

#### Dynamic Discovery 实现设计

```typescript
// 元工具 1: list_toolsets
// 返回所有可用工具组的名称和描述，以及当前启用状态
server.tool('list_toolsets', {}, async () => {
  const groups = Object.entries(TOOLSETS).map(([name, tools]) => ({
    name,
    tools: tools.length,
    enabled: enabledSets.has(name),
    description: TOOLSET_DESCRIPTIONS[name],
  }))
  return { content: [{ type: 'text', text: JSON.stringify(groups, null, 2) }] }
})

// 元工具 2: enable_toolset
// LLM 调用此工具激活一个工具组，新的 tools 立即可用
server.tool('enable_toolset', { toolset: z.string() }, async ({ toolset }) => {
  if (!TOOLSETS[toolset]) return error(`Unknown toolset: ${toolset}`)
  if (enabledSets.has(toolset)) return { content: [{ type: 'text', text: `Toolset "${toolset}" already enabled` }] }
  
  enabledSets.add(toolset)
  // 动态注册该组的全部 tools
  for (const toolDef of TOOLSETS[toolset]) {
    registerTool(server, toolDef)
  }
  // 通知 MCP 客户端工具列表已变更
  server.sendToolsChanged()
  return { content: [{ type: 'text', text: `Enabled toolset "${toolset}" with ${TOOLSETS[toolset].length} tools` }] }
})
```

**实施时机**: Phase 3 — 与静态 Toolsets 同步实现

---

## 10. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| IIFE 包体积增长 | 目前 56KB, 预估 70-80KB | 仍在可接受范围, tree-shaking 友好 |
| Entity 7 种新类型实现量 | 开发周期 | 模式统一 (position + graphics options), 可批量生成 |
| Animation 时间系统复杂 | JulianDate 转换易出错 | 统一 `Cesium.JulianDate.fromIso8601()`, 充分测试 |
| 官方后续更新新功能 | 需持续跟进 | 关注 cesium-ai-integrations 仓库 Releases |
| 模型预设 URL 变更 | 动画创建失败 | 将预设映射提取为可配置项 |

---

## 附录 A: 官方仓库结构参考

```
CesiumGS/cesium-ai-integrations/
├── camera-server/          # 7 MCP tools, port 3002
│   ├── src/index.ts        # Zod schema + MCP tool 定义
│   └── browser/
│       └── camera-manager.ts  # Cesium API 调用
├── entity-server/          # 14 MCP tools, port 3003
│   ├── src/index.ts        # 14 个独立 tool (非 3 命令分发)
│   └── browser/
│       └── entity-manager.ts  # 属性键检测 → 类型分发
├── animation-server/       # 8 MCP tools, port 3004
│   ├── src/index.ts        # Zod schema
│   └── browser/
│       └── animation-manager.ts  # SampledPositionProperty 系统
└── geolocation-server/     # stdio, 无浏览器交互
```

## 附录 B: 颜色/材质工具函数

```typescript
// 建议新增到 bridge 内部的工具函数

function resolveColor(c: unknown): Cesium.Color {
  if (!c) return Cesium.Color.WHITE
  if (typeof c === 'string') return Cesium.Color.fromCssColorString(c)
  if (typeof c === 'object' && c !== null && 'red' in c) {
    const { red, green, blue, alpha } = c as { red: number; green: number; blue: number; alpha?: number }
    return new Cesium.Color(red, green, blue, alpha ?? 1.0)
  }
  return Cesium.Color.WHITE
}

function resolveMaterial(m: unknown): Cesium.MaterialProperty | Cesium.Color {
  if (!m) return Cesium.Color.WHITE
  if (typeof m === 'string') return Cesium.Color.fromCssColorString(m)
  const spec = m as { type: string; [k: string]: unknown }
  switch (spec.type) {
    case 'color': return resolveColor(spec.color)
    case 'image': return new Cesium.ImageMaterialProperty({ image: spec.image as string })
    case 'checkerboard': return new Cesium.CheckerboardMaterialProperty({
      evenColor: resolveColor(spec.evenColor),
      oddColor: resolveColor(spec.oddColor)
    })
    case 'stripe': return new Cesium.StripeMaterialProperty({
      orientation: spec.orientation === 'vertical'
        ? Cesium.StripeOrientation.VERTICAL
        : Cesium.StripeOrientation.HORIZONTAL,
      evenColor: resolveColor(spec.evenColor),
      oddColor: resolveColor(spec.oddColor)
    })
    case 'grid': return new Cesium.GridMaterialProperty({
      color: resolveColor(spec.color),
      cellAlpha: spec.cellAlpha as number
    })
    default: return Cesium.Color.WHITE
  }
}
```
