# cesium-mcp-runtime

> MCP 服务器（stdio）— 58 个工具（12 个工具集）+ 2 个资源，支持动态发现。

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

## MCP 工具（58 + 2 元工具）

工具按 **12 个工具集** 组织。默认启用 4 个核心工具集（约 31 个工具）。设置 `CESIUM_TOOLSETS=all` 启用全部，或由 AI 在运行时动态发现和激活。

### 工具集

| 工具集 | 工具数 | 默认启用 | 描述 |
|--------|--------|----------|------|
| `view` | 8 | 是 | 相机视角控制 + 视点书签 + 场景导出 |
| `entity` | 10 | 是 | 核心实体操作 + 批量、查询与属性查看 |
| `layer` | 8 | 是 | 图层管理（GeoJSON、Schema、样式、底图） |
| `interaction` | 3 | 是 | 截图、高亮与测量 |
| `camera` | 4 | — | 高级相机控制（环绕、注视） |
| `entity-ext` | 7 | — | 扩展实体类型（盒体、柱体、墙等） |
| `animation` | 8 | — | 动画系统（路径点、时钟、追踪、光照） |
| `tiles` | 5 | — | 3D Tiles、地形、影像服务、CZML 与 KML |
| `trajectory` | 1 | — | 轨迹回放 |
| `heatmap` | 1 | — | 热力图可视化 |
| `scene` | 2 | — | 场景选项与后处理效果 |
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

#### `saveViewpoint`

将当前相机状态保存为命名视点书签。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | `string` | ✅ | — | 视点书签名称 |

**返回值：** 保存的 `ViewState` 对象。

#### `loadViewpoint`

恢复先前保存的视点书签。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | `string` | ✅ | — | 视点书签名称 |
| `duration` | `number` | — | `0` | 飞行时长（秒，0 = 立即跳转） |

**返回值：** 恢复的 `ViewState`，未找到则报错。

#### `listViewpoints`

列出所有已保存的视点书签。无参数。

**返回值：** `[{ name, state: ViewState }]`

#### `exportScene`

将当前场景中的所有实体和图层导出为结构化 JSON 快照。

无参数。

**返回值：** `{ entities: [...], layers: [...], camera: ViewState }`

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

#### `batchAddEntities`

在一次调用中添加多个不同类型的实体。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `entities` | `object[]` | ✅ | — | 实体定义数组 |

每个实体对象必须包含 `type` 字段（`"marker"`, `"polyline"`, `"polygon"`, `"model"`, `"label"`, `"billboard"`, `"box"`, `"cylinder"`, `"ellipse"`, `"rectangle"`, `"wall"`, `"corridor"`）以及该实体类型对应的参数。

**返回值：** `{ entityIds: string[], errors: string[] }`

#### `queryEntities`

搜索和筛选场景中的实体。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | `string` | — | — | 按名称筛选（模糊匹配，不区分大小写） |
| `type` | `string` | — | — | 按类型筛选（`"point"`, `"billboard"`, `"label"`, `"model"`, `"polyline"`, `"polygon"`） |
| `bbox` | `number[]` | — | — | 包围盒筛选 `[west, south, east, north]` |

**返回值：** `[{ entityId, name?, type, position? }]`

#### `getEntityProperties`

获取指定实体的所有属性。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `entityId` | `string` | ✅ | — | 实体 ID |

**返回值：** `{ entityId, name, type, position?, properties }`

### 图层

#### `addGeoJsonLayer`

加载 GeoJSON 数据作为图层。支持内联数据和 URL 加载两种方式。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `data` | `object` | — | — | GeoJSON FeatureCollection（内联数据） |
| `url` | `string` | — | — | GeoJSON 文件 URL（浏览器端加载） |
| `id` | `string` | — | 自动 | 图层 ID |
| `name` | `string` | — | — | 显示名称 |
| `style` | `object` | — | — | 样式配置（color, opacity, pointSize, strokeWidth, randomColor, gradient, choropleth, category） |

> `data` 和 `url` 至少提供其一。

#### `listLayers`

列出当前所有图层。无参数。

**返回：** `[{ id, name, type, visible, color }]`

#### `removeLayer`

按 ID 移除图层。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | `string` | ✅ | — | 图层 ID |

#### `clearAll`

移除所有图层、实体和数据源。无参数。

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
| `tileStyle` | `object` | — | — | 3D Tiles 样式（Cesium3DTileStyle 表达式：color, show, pointSize, meta） |

#### `getLayerSchema`

获取图层属性字段结构（GeoJSON DataSource 或 3D Tiles 批量表）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `layerId` | `string` | ✅ | — | 图层 ID |

**返回值：** `{ layerId, layerName, entityCount, fields: [{ name, type, sample? }] }`

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

#### `loadCzml`

加载 CZML 时间动态数据源（内联数据数组或远程 URL）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `data` | `unknown[]` | — | — | CZML 数据包数组（内联） |
| `url` | `string` | — | — | CZML 文件 URL |
| `id` | `string` | — | 自动 | 图层 ID |
| `name` | `string` | — | — | 显示名称 |
| `sourceUri` | `string` | — | — | 相对引用的基础 URI |
| `clampToGround` | `boolean` | — | `false` | 是否贴地 |

> `data` 和 `url` 至少提供其一。

#### `loadKml`

加载 KML/KMZ 数据源（内联字符串或远程 URL）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `data` | `string` | — | — | KML 文档字符串（内联） |
| `url` | `string` | — | — | KML/KMZ 文件 URL |
| `id` | `string` | — | 自动 | 图层 ID |
| `name` | `string` | — | — | 显示名称 |
| `clampToGround` | `boolean` | — | `false` | 是否贴地 |

> `data` 和 `url` 至少提供其一。

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

#### `measure`

测量地球表面上两点间的距离或多点围成的面积。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `type` | `string` | ✅ | — | `"distance"` \| `"area"` |
| `coordinates` | `number[][]` | ✅ | — | 坐标点 `[[lon, lat], ...]`（距离需 2 个点，面积需 3+ 个点） |

**返回值：** `{ type, value, unit, coordinates }`

### 场景

#### `setSceneOptions`

配置场景环境（雾效、大气、阴影、太阳、月亮、背景色、深度测试）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `fogEnabled` | `boolean` | — | — | 启用/禁用雾效 |
| `fogDensity` | `number` | — | `0.0002` | 雾密度（0.0–1.0） |
| `fogMinimumBrightness` | `number` | — | — | 最小雾亮度（0.0–1.0） |
| `skyAtmosphereShow` | `boolean` | — | — | 显示天空大气 |
| `skyAtmosphereHueShift` | `number` | — | — | 天空色调偏移（-1.0–1.0） |
| `skyAtmosphereSaturationShift` | `number` | — | — | 天空饱和度偏移（-1.0–1.0） |
| `skyAtmosphereBrightnessShift` | `number` | — | — | 天空亮度偏移（-1.0–1.0） |
| `groundAtmosphereShow` | `boolean` | — | — | 显示地面大气 |
| `shadowsEnabled` | `boolean` | — | — | 启用阴影 |
| `shadowsSoftShadows` | `boolean` | — | — | 使用柔和阴影 |
| `shadowsDarkness` | `number` | — | — | 阴影深度（0.0–1.0） |
| `sunShow` | `boolean` | — | — | 显示太阳 |
| `sunGlowFactor` | `number` | — | `1.0` | 太阳光晕系数 |
| `moonShow` | `boolean` | — | — | 显示月亮 |
| `depthTestAgainstTerrain` | `boolean` | — | — | 地形深度测试 |
| `backgroundColor` | `string` | — | — | 背景颜色（CSS 格式） |

#### `setPostProcess`

配置后处理效果（泛光、环境光遮蔽 SSAO、抗锯齿 FXAA）。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `bloom` | `boolean` | — | — | 启用泛光效果 |
| `bloomContrast` | `number` | — | `128` | 泛光对比度 |
| `bloomBrightness` | `number` | — | `-0.3` | 泛光亮度 |
| `bloomDelta` | `number` | — | `1.0` | 泛光 delta |
| `bloomSigma` | `number` | — | `3.78` | 泛光 sigma |
| `bloomStepSize` | `number` | — | `5.0` | 泛光步长 |
| `bloomGlowOnly` | `boolean` | — | — | 仅显示光晕 |
| `ambientOcclusion` | `boolean` | — | — | 启用环境光遮蔽（SSAO） |
| `aoIntensity` | `number` | — | `3.0` | AO 强度 |
| `aoBias` | `number` | — | `0.1` | AO 偏差 |
| `aoLengthCap` | `number` | — | `0.26` | AO 长度上限 |
| `aoStepSize` | `number` | — | `1.95` | AO 步长 |
| `fxaa` | `boolean` | — | — | 启用 FXAA 抗锯齿 |

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
| `CESIUM_LOCALE` | `en` | 工具描述语言：`en`（英文，默认）或 `zh-CN`（中文） |

## 会话路由

多个浏览器标签页可同时连接。每个 Bridge 实例使用 `sessionId` 注册：

```
标签页 1：sessionId = "project-a"
标签页 2：sessionId = "project-b"
```

### 通过 MCP URL 路由

在 MCP HTTP 端点 URL 后添加 `?session=xxx`，即可将所有工具调用路由到指定浏览器：

```
http://localhost:3216/mcp?session=project-a
```

推荐用于第三方集成（如 Dify），无需在提示词或工具参数中注入 sessionId。

### 路由优先级

1. 工具参数中的 `sessionId`（单次调用级覆盖）
2. MCP HTTP URL 中的 `?session=xxx`（连接级）
3. `DEFAULT_SESSION_ID` 环境变量
4. 第一个已连接的浏览器（兜底）

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
