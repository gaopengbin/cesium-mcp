# cesium-mcp-runtime

> MCP 服务器（stdio）— 44 个工具（11 个工具集）+ 2 个资源，支持动态发现。

[![npm](https://img.shields.io/npm/v/cesium-mcp-runtime)](https://www.npmjs.com/package/cesium-mcp-runtime)

## 安装与运行

```bash
npx cesium-mcp-runtime
```

或全局安装：

```bash
npm install -g cesium-mcp-runtime
cesium-mcp-runtime
```

## MCP 客户端配置

### Claude Desktop

`claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"]
    }
  }
}
```

### VS Code (GitHub Copilot)

`.vscode/mcp.json`：

```json
{
  "servers": {
    "cesium-mcp": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"]
    }
  }
}
```

### Cursor

`.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"]
    }
  }
}
```

## MCP 工具（43 + 2 元工具）

工具按 **11 个工具集** 组织。默认启用 4 个核心工具集（约 19 个工具）。设置 `CESIUM_TOOLSETS=all` 启用全部，或由 AI 在运行时动态发现和激活。

### 工具集

| 工具集 | 工具数 | 默认启用 | 描述 |
|--------|--------|----------|------|
| `view` | 4 | 是 | 相机视角控制 |
| `entity` | 7 | 是 | 核心实体操作 |
| `layer` | 6 | 是 | 图层管理 |
| `interaction` | 2 | 是 | 截图与高亮 |
| `camera` | 4 | — | 高级相机控制（环绕、注视） |
| `entity-ext` | 7 | — | 扩展实体类型（盒体、柱体、墙等） |
| `animation` | 8 | — | 动画系统（路径点、时钟、追踪） |
| `tiles` | 3 | — | 3D Tiles、地形、影像服务 |
| `trajectory` | 1 | — | 轨迹回放 |
| `heatmap` | 1 | — | 热力图可视化 |
| `geolocation` | 1 | — | 地理编码 — 将地址/地名转换为坐标（Nominatim/OSM） |

### 动态发现

非 `all` 模式下，始终注册两个元工具：

| 工具 | 描述 |
|------|------|
| `list_toolsets` | 列出所有工具集及其启用状态 |
| `enable_toolset` | 在运行时动态启用一个工具集 |

### 视图

#### `flyTo`

相机飞行到指定位置（带动画过渡）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `longitude` | `number` | ✅ | — | 经度（-180 ~ 180） |
| `latitude` | `number` | ✅ | — | 纬度（-90 ~ 90） |
| `height` | `number` | — | `50000` | 相机高度（米） |
| `heading` | `number` | — | `0` | 航向角（度），0 = 正北 |
| `pitch` | `number` | — | `-45` | 俯仰角（度），-90 = 正下方 |
| `duration` | `number` | — | `2` | 飞行动画时长（秒） |

#### `setView`

瞬间切换到指定视角（无动画）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `longitude` | `number` | ✅ | — | 经度（-180 ~ 180） |
| `latitude` | `number` | ✅ | — | 纬度（-90 ~ 90） |
| `height` | `number` | — | `50000` | 高度（米） |
| `heading` | `number` | — | `0` | 航向角（度） |
| `pitch` | `number` | — | `-90` | 俯仰角（度） |
| `roll` | `number` | — | `0` | 翻滚角（度） |

#### `getView`

获取当前相机状态。无参数。

**返回：** `{ longitude, latitude, height, heading, pitch, roll }`

#### `zoomToExtent`

缩放适配到地理包围盒。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `west` | `number` | ✅ | — | 西边界经度 |
| `south` | `number` | ✅ | — | 南边界纬度 |
| `east` | `number` | ✅ | — | 东边界经度 |
| `north` | `number` | ✅ | — | 北边界纬度 |
| `duration` | `number` | — | `2` | 动画时长（秒） |

### 实体

#### `addMarker`

添加点标记，可附加标注。返回 `entityId`。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `longitude` | `number` | ✅ | — | 经度（-180 ~ 180） |
| `latitude` | `number` | ✅ | — | 纬度（-90 ~ 90） |
| `label` | `string` | — | — | 标注文本 |
| `color` | `string` | — | `"#3B82F6"` | CSS 颜色 |
| `size` | `number` | — | `12` | 点大小（像素） |
| `id` | `string` | — | 自动 | 自定义图层 ID |

#### `addLabel`

为 GeoJSON 要素添加文本标注。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `data` | `object` | ✅ | — | GeoJSON FeatureCollection |
| `field` | `string` | ✅ | — | 标注字段名 |
| `style` | `object` | — | — | 标注样式（font, fillColor, outlineColor, scale） |

#### `addModel`

在指定位置放置 3D 模型（glTF/GLB）。返回 `entityId`。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `longitude` | `number` | ✅ | — | 经度 |
| `latitude` | `number` | ✅ | — | 纬度 |
| `height` | `number` | — | `0` | 高度（米） |
| `url` | `string` | ✅ | — | glTF/GLB 模型 URL |
| `scale` | `number` | — | `1` | 缩放比例 |
| `heading` | `number` | — | `0` | 航向角（度） |
| `pitch` | `number` | — | `0` | 俯仰角（度） |
| `roll` | `number` | — | `0` | 翻滚角（度） |
| `label` | `string` | — | — | 模型标注 |

#### `addPolygon`

添加多边形区域。返回 `entityId`。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `coordinates` | `number[][]` | ✅ | — | 外环坐标 `[[lon, lat, height?], ...]` |
| `color` | `string` | — | `"#3B82F6"` | 填充颜色 |
| `outlineColor` | `string` | — | `"#FFFFFF"` | 描边颜色 |
| `opacity` | `number` | — | `0.6` | 透明度（0–1） |
| `extrudedHeight` | `number` | — | — | 拉伸高度（米） |
| `clampToGround` | `boolean` | — | `true` | 是否贴地 |
| `label` | `string` | — | — | 标注文本 |

#### `addPolyline`

添加折线。返回 `entityId`。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `coordinates` | `number[][]` | ✅ | — | 坐标 `[[lon, lat, height?], ...]` |
| `color` | `string` | — | `"#3B82F6"` | 线条颜色 |
| `width` | `number` | — | `3` | 线宽（像素） |
| `clampToGround` | `boolean` | — | `true` | 是否贴地 |
| `label` | `string` | — | — | 标注文本 |

#### `updateEntity`

更新已有实体属性。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `entityId` | `string` | ✅ | — | 要更新的实体 ID |
| `position` | `object` | — | — | 新位置 `{ longitude, latitude, height? }` |
| `label` | `string` | — | — | 新标注 |
| `color` | `string` | — | — | 新颜色 |
| `scale` | `number` | — | — | 新缩放 |
| `show` | `boolean` | — | — | 可见性 |

#### `removeEntity`

按 ID 移除单个实体。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `entityId` | `string` | ✅ | — | 要移除的实体 ID |

### 图层

#### `addGeoJsonLayer`

加载 GeoJSON 数据作为图层。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `data` | `object` | ✅ | — | GeoJSON FeatureCollection |
| `id` | `string` | — | 自动 | 图层 ID |
| `name` | `string` | — | — | 显示名称 |
| `style` | `object` | — | — | 样式配置（color, opacity, pointSize, choropleth, category） |

#### `listLayers`

列出当前所有图层。无参数。

**返回：** `[{ id, name, type, visible, color }]`

#### `removeLayer`

按 ID 移除图层。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | `string` | ✅ | — | 图层 ID |

#### `setLayerVisibility`

切换图层可见性。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | `string` | ✅ | — | 图层 ID |
| `visible` | `boolean` | ✅ | — | 是否可见 |

#### `updateLayerStyle`

修改图层样式。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `layerId` | `string` | ✅ | — | 图层 ID |
| `labelStyle` | `object` | — | — | 标注样式（font, fillColor, outlineColor, outlineWidth, scale） |
| `layerStyle` | `object` | — | — | 图层样式（color, opacity, strokeWidth, pointSize） |

#### `setBasemap`

切换底图影像。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `basemap` | `string` | ✅ | — | `"dark"` \| `"satellite"` \| `"standard"` |

### 相机

#### `lookAtTransform`

环绕式相机注视目标位置。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `longitude` | `number` | ✅ | — | 目标经度 |
| `latitude` | `number` | ✅ | — | 目标纬度 |
| `height` | `number` | — | `0` | 目标高度（米） |
| `heading` | `number` | — | `0` | 相机航向角（度） |
| `pitch` | `number` | — | `-45` | 相机俯仰角（度） |
| `range` | `number` | — | `1000` | 距目标距离（米） |

#### `startOrbit`

开始相机环绕旋转。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `speed` | `number` | — | `0.005` | 旋转速度（弧度/帧） |
| `clockwise` | `boolean` | — | `true` | 旋转方向 |

#### `stopOrbit`

停止环绕动画。无参数。

#### `setCameraOptions`

配置相机控制器选项。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `enableRotate` | `boolean` | — | — | 启用旋转 |
| `enableTranslate` | `boolean` | — | — | 启用平移 |
| `enableZoom` | `boolean` | — | — | 启用缩放 |
| `enableTilt` | `boolean` | — | — | 启用倾斜 |
| `enableLook` | `boolean` | — | — | 启用环视 |
| `minimumZoomDistance` | `number` | — | — | 最小缩放距离（米） |
| `maximumZoomDistance` | `number` | — | — | 最大缩放距离（米） |
| `enableInputs` | `boolean` | — | — | 启用/禁用所有输入 |

### 扩展实体类型

#### `addBillboard`

在指定位置添加图片图标。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `longitude` | `number` | ✅ | — | 经度 |
| `latitude` | `number` | ✅ | — | 纬度 |
| `height` | `number` | — | `0` | 高度（米） |
| `image` | `string` | ✅ | — | 图片 URL |
| `name` | `string` | — | — | 名称 |
| `scale` | `number` | — | `1.0` | 缩放 |
| `color` | `ColorInput` | — | — | 着色 |
| `pixelOffset` | `{x, y}` | — | — | 像素偏移 |
| `heightReference` | `string` | — | — | `"NONE"` \| `"CLAMP_TO_GROUND"` \| `"RELATIVE_TO_GROUND"` |

#### `addBox`

添加 3D 盒体。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `longitude` | `number` | ✅ | — | 经度 |
| `latitude` | `number` | ✅ | — | 纬度 |
| `height` | `number` | — | `0` | 高度（米） |
| `dimensions` | `object` | ✅ | — | 尺寸 `{ width, length, height }`（米） |
| `name` | `string` | — | — | 名称 |
| `material` | `MaterialInput` | — | — | 材质 |
| `outline` | `boolean` | — | `true` | 显示轮廓 |
| `outlineColor` | `ColorInput` | — | — | 轮廓颜色 |
| `fill` | `boolean` | — | `true` | 显示填充 |
| `orientation` | `object` | — | — | 方向 `{ heading, pitch, roll }`（度） |

#### `addCorridor`

添加走廊（带宽度的路径）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `positions` | `PositionDegrees[]` | ✅ | — | 位置数组 `[{ longitude, latitude, height? }]` |
| `width` | `number` | ✅ | — | 宽度（米） |
| `name` | `string` | — | — | 名称 |
| `material` | `MaterialInput` | — | — | 材质 |
| `cornerType` | `string` | — | — | `"ROUNDED"` \| `"MITERED"` \| `"BEVELED"` |
| `height` | `number` | — | — | 离地高度 |
| `extrudedHeight` | `number` | — | — | 拉伸高度 |

#### `addCylinder`

添加圆柱体或圆锥体。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `longitude` | `number` | ✅ | — | 经度 |
| `latitude` | `number` | ✅ | — | 纬度 |
| `height` | `number` | — | `0` | 高度（米） |
| `length` | `number` | ✅ | — | 柱体高度（米） |
| `topRadius` | `number` | ✅ | — | 顶部半径（米） |
| `bottomRadius` | `number` | ✅ | — | 底部半径（米） |
| `name` | `string` | — | — | 名称 |
| `material` | `MaterialInput` | — | — | 材质 |
| `outline` | `boolean` | — | `true` | 显示轮廓 |
| `slices` | `number` | — | `128` | 切片数 |

#### `addEllipse`

添加椭圆。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `longitude` | `number` | ✅ | — | 中心经度 |
| `latitude` | `number` | ✅ | — | 中心纬度 |
| `height` | `number` | — | `0` | 高度（米） |
| `semiMajorAxis` | `number` | ✅ | — | 长半轴（米） |
| `semiMinorAxis` | `number` | ✅ | — | 短半轴（米） |
| `name` | `string` | — | — | 名称 |
| `material` | `MaterialInput` | — | — | 材质 |
| `extrudedHeight` | `number` | — | — | 拉伸高度 |
| `rotation` | `number` | — | — | 旋转角（弧度） |
| `outline` | `boolean` | — | — | 显示轮廓 |

#### `addRectangle`

添加矩形。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `west` | `number` | ✅ | — | 西边界经度 |
| `south` | `number` | ✅ | — | 南边界纬度 |
| `east` | `number` | ✅ | — | 东边界经度 |
| `north` | `number` | ✅ | — | 北边界纬度 |
| `name` | `string` | — | — | 名称 |
| `material` | `MaterialInput` | — | — | 材质 |
| `height` | `number` | — | — | 高度 |
| `extrudedHeight` | `number` | — | — | 拉伸高度 |
| `outline` | `boolean` | — | — | 显示轮廓 |

#### `addWall`

沿路径添加墙体。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `positions` | `PositionDegrees[]` | ✅ | — | 位置数组 `[{ longitude, latitude, height? }]` |
| `name` | `string` | — | — | 名称 |
| `minimumHeights` | `number[]` | — | — | 各位置最小高度 |
| `maximumHeights` | `number[]` | — | — | 各位置最大高度 |
| `material` | `MaterialInput` | — | — | 材质 |
| `outline` | `boolean` | — | — | 显示轮廓 |

### 动画

#### `createAnimation`

创建基于时间的路径动画（实体沿路径移动）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `waypoints` | `object[]` | ✅ | — | `[{ longitude, latitude, height?, time }]`，time 为 ISO 8601 |
| `name` | `string` | — | — | 动画名称 |
| `modelUri` | `string` | — | — | glTF URL 或预设：`cesium_man`, `cesium_air`, `ground_vehicle`, `cesium_drone` |
| `showPath` | `boolean` | — | `true` | 显示轨迹线 |
| `pathWidth` | `number` | — | `2` | 轨迹宽度（像素） |
| `pathColor` | `string` | — | `"#00FF00"` | 轨迹颜色 |
| `pathLeadTime` | `number` | — | `0` | 前导时间（秒） |
| `pathTrailTime` | `number` | — | `1e10` | 尾迹时间（秒） |
| `multiplier` | `number` | — | `1` | 时钟倍速 |
| `shouldAnimate` | `boolean` | — | `true` | 自动开始 |

#### `controlAnimation`

播放或暂停动画。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `action` | `string` | ✅ | — | `"play"` \| `"pause"` |

#### `removeAnimation`

删除动画实体。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `entityId` | `string` | ✅ | — | 要删除的动画实体 ID |

#### `listAnimations`

列出所有活跃动画。无参数。

**返回：** `[{ entityId, name?, startTime, stopTime, exists }]`

#### `updateAnimationPath`

更新动画路径的可视属性。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `entityId` | `string` | ✅ | — | 动画实体 ID |
| `width` | `number` | — | — | 路径宽度（像素） |
| `color` | `string` | — | — | 路径颜色 |
| `leadTime` | `number` | — | — | 前导时间（秒） |
| `trailTime` | `number` | — | — | 尾迹时间（秒） |
| `show` | `boolean` | — | — | 显示/隐藏路径 |

#### `trackEntity`

相机追踪实体，或停止追踪。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `entityId` | `string` | — | — | 要追踪的实体 ID（省略则停止追踪） |
| `heading` | `number` | — | — | 相机航向角（度） |
| `pitch` | `number` | — | `-30` | 相机俯仰角（度） |
| `range` | `number` | — | `500` | 相机距离（米） |

#### `controlClock`

配置 Cesium 时钟。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `action` | `string` | ✅ | — | `"configure"` \| `"setTime"` \| `"setMultiplier"` |
| `startTime` | `string` | — | — | ISO 8601 开始时间 |
| `stopTime` | `string` | — | — | ISO 8601 结束时间 |
| `currentTime` | `string` | — | — | ISO 8601 当前时间 |
| `time` | `string` | — | — | 跳转时间（用于 setTime） |
| `multiplier` | `number` | — | — | 时钟倍速 |
| `shouldAnimate` | `boolean` | — | — | 是否播放 |
| `clockRange` | `string` | — | — | `"UNBOUNDED"` \| `"CLAMPED"` \| `"LOOP_STOP"` |

#### `setGlobeLighting`

启用/禁用地球光照和大气效果。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `enableLighting` | `boolean` | — | — | 启用地球光照 |
| `dynamicAtmosphereLighting` | `boolean` | — | — | 动态大气光照 |
| `dynamicAtmosphereLightingFromSun` | `boolean` | — | — | 使用太阳位置计算大气光照 |

### 3D 数据

#### `load3dTiles`

加载 3D Tileset（建筑白膜、城市模型等）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `url` | `string` | ✅ | — | tileset.json URL |
| `id` | `string` | — | 自动 | 图层 ID |
| `name` | `string` | — | — | 显示名称 |
| `maximumScreenSpaceError` | `number` | — | `16` | 最大屏幕空间误差（值越小越精细） |
| `heightOffset` | `number` | — | — | 高度偏移（米） |

#### `loadTerrain`

设置地形提供者。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `provider` | `string` | ✅ | — | `"flat"` \| `"arcgis"` \| `"cesiumion"` |
| `url` | `string` | — | — | 自定义地形服务 URL |
| `cesiumIonAssetId` | `number` | — | — | Cesium Ion 资产 ID |

#### `loadImageryService`

添加影像服务图层。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `url` | `string` | ✅ | — | 影像服务 URL |
| `serviceType` | `string` | ✅ | — | `"wms"` \| `"wmts"` \| `"xyz"` \| `"arcgis_mapserver"` |
| `id` | `string` | — | 自动 | 图层 ID |
| `name` | `string` | — | — | 显示名称 |
| `layerName` | `string` | — | — | WMS/WMTS 图层名 |
| `opacity` | `number` | — | `1.0` | 透明度（0–1） |

### 交互

#### `screenshot`

截取当前地球视图。无参数。

**返回：** Base64 PNG 图片（MCP image 内容类型）。

#### `highlight`

高亮指定图层的要素。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `layerId` | `string` | ✅ | — | 图层 ID |
| `featureIndex` | `number` | — | — | 要素索引（省略则高亮全部） |
| `color` | `string` | — | `"#FFFF00"` | 高亮颜色 |

### 其他

#### `playTrajectory` <Badge type="info" text="trajectory" />

沿路径播放动画。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `coordinates` | `number[][]` | ✅ | — | 路径坐标 `[[lon, lat, alt?], ...]` |
| `id` | `string` | — | 自动 | 轨迹图层 ID |
| `name` | `string` | — | — | 名称 |
| `durationSeconds` | `number` | — | `10` | 动画时长（秒） |
| `trailSeconds` | `number` | — | `2` | 尾迹长度（秒） |
| `label` | `string` | — | — | 移动体标签 |

#### `addHeatmap` <Badge type="info" text="heatmap" />

从点数据创建热力图。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `data` | `object` | ✅ | — | GeoJSON Point FeatureCollection |
| `radius` | `number` | — | `30` | 影响半径（像素） |

#### `geocode` <Badge type="info" text="geolocation" />

将地址、地标或地名转换为地理坐标（经纬度）。使用 OpenStreetMap Nominatim 免费服务，无需 API Key。支持 `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` 环境变量配置代理。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `address` | `string` | ✅ | — | 地址、地标或地名，如 "故宫"、"Eiffel Tower"、"东京塔" |
| `countryCode` | `string` | — | — | 两位 ISO 国家代码限制搜索范围（如 `CN`、`US`、`JP`） |

**返回：** `{ success, longitude, latitude, displayName, boundingBox }`

## MCP 资源（2 个）

| URI | 描述 |
|-----|------|
| `cesium://scene/camera` | 当前相机状态（位置、方向） |
| `cesium://scene/layers` | 所有已加载图层及其元数据列表 |

资源为只读，AI 智能体可轮询获取以进行上下文感知决策。

## 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CESIUM_WS_PORT` | `9100` | Bridge 连接的 WebSocket 服务器端口 |
| `DEFAULT_SESSION_ID` | `default` | MCP 调用路由到哪个浏览器会话 |
| `CESIUM_TOOLSETS` | *（未设置）* | 工具集激活：省略使用默认集，`all` 启用全部，或逗号分隔列表 |
| `OSM_USER_AGENT` | `cesium-mcp-runtime/1.0` | Nominatim geocode 请求的 User-Agent 头 |

## 会话路由

多个浏览器标签页可同时连接。每个 Bridge 实例使用 `sessionId` 注册：

```
标签页 1：sessionId = "project-a"
标签页 2：sessionId = "project-b"
```

Runtime 将 MCP 工具调用路由到匹配 `DEFAULT_SESSION_ID` 的会话。

## HTTP Push API

对于非 MCP 集成（如 FastAPI 后端），Runtime 暴露 HTTP 端点：

```bash
curl -X POST http://localhost:9100/push \
  -H "Content-Type: application/json" \
  -d '{"action": "flyTo", "params": {"longitude": 2.29, "latitude": 48.86, "height": 1000}}'
```

## 公共类型

### `ColorInput`

```typescript
type ColorInput =
  | string                        // CSS 颜色："#FF0000"、"red"、"rgba(255,0,0,0.5)"
  | { red: number; green: number; blue: number; alpha?: number }  // RGBA 0–1
```

### `MaterialInput`

```typescript
type MaterialInput =
  | ColorInput
  | {
      type: "color" | "image" | "checkerboard" | "stripe" | "grid"
      color?: ColorInput
      image?: string
      evenColor?: ColorInput
      oddColor?: ColorInput
      orientation?: "horizontal" | "vertical"
      cellAlpha?: number
    }
```

### `PositionDegrees`

```typescript
type PositionDegrees = {
  longitude: number   // 度
  latitude: number    // 度
  height?: number     // 米
}
```
