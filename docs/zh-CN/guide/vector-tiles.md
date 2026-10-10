# 矢量瓦片

先启用 `tiles` 工具集，再用 `loadVectorTiles` 加载矢量 3D Tiles 或原生 MVT。`layer` 工具集负责样式、显隐、属性读取和删除。

```json
{
  "source": "mvt",
  "id": "rivers",
  "url": "https://你的瓦片服务.example/{z}/{x}/{y}.pbf",
  "minZoom": 6,
  "maxZoom": 12,
  "extent": [85, 25, 89, 29],
  "featureIdProperty": "river_id",
  "clampTarget": "terrain",
  "tileStyle": {
    "color": { "conditions": [["Number(${ORD_FLOW}) <= 3", "color('#38bdf8')"], ["true", "color('#22c55e')"]] },
    "lineWidth": "5.0 - clamp(Number(${ORD_FLOW}), 0.0, 10.0) * 0.4"
  }
}
```

字段必须来自实际数据。`ORD_FLOW` 是 HydroRIVERS 的河流等级字段；本地公开河流测试采用 Natural Earth 的 `name`、`scalerank`、`ne_id`，没有流量数据。

矢量 3D Tiles 使用 `source: "tileset"`，传入 `url` 或 `ionAssetId`。[官方 HydroRIVERS 示例](https://github.com/CesiumGS/cesium/blob/main/packages/sandcastle/gallery/3d-tiles-property-lod-river/main.js) 使用资产 `5135960`，仍需浏览器中的 ion token 和相应访问权限。加载工具不会绕过资产权限。

点击河流后，`getSelectedTileFeature` 返回真实属性快照和所属 `layerId`。Agent 可以调用：

```json
{ "layerId": "rivers", "tileStyle": { "color": "color('#ff8800')", "lineWidth": 7 } }
```

样式修改作用于整个图层；按属性写条件表达式可分别设置不同要素组。支持颜色、显隐、线宽、点大小和点描边，未指定的样式保留。点击空白、隐藏或删除图层、清空地图都会清除选中快照。该接口不代表查询完整数据集。

## 当前支持范围

- 本项目使用 CesiumJS 1.145（engine 26.3、widgets 16.2），矢量能力仍属于实验接口。两种格式均支持 `clampTarget`：`none`（默认）、`terrain`、`3d-tiles`、`ground`（地形及 3D Tiles）。`clampToGround: true` 是贴地形的快捷参数，显式目标优先。改变目标需要重新加载图层；`load3dTiles` 加载的接收模型会自动连接当前场景。
- MVT 地址必须使用 `/{z}/{x}/{y}` 路径顺序，此版本不支持仅在查询参数中传 XYZ。
- 贴附线、面的拾取使用针对 Cesium 1.145 的兼容处理，只读取当前显示瓦片及点击位置的表面深度，遵守显隐及多边形孔洞，单次点击最多检查 200,000 个顶点。它需要浏览器支持深度位置拾取，升级渲染器时应重新验证。点要素使用原生拾取，并保留渲染器对点高程的处理。
- Bridge 会补足改样式后的渲染帧，并在视口尺寸变化、表面瓦片加载完成后恢复贴附样式，避免缓存颜色回退。面板测试检查真实截图像素，除 Chrome、Playwright 外还需要 Python 和 Pillow。
- 默认缩放级别为 0–6。高缩放级别需要限定经纬度范围；最深一级覆盖超过 50,000 个瓦片会被拒绝，避免创建过大的瓦片树。
- 数据服务必须允许浏览器跨域访问。MCP Apps 中使用自定义服务时，在 `CESIUM_MAP_DATA_ORIGINS` 配置来源站点，以逗号分隔，只接受 HTTPS 或本地 HTTP 来源。重启 Runtime 并重新打开面板后生效，宿主仍可能施加额外限制。
- 普通浏览器 SDK 在浏览器配置 `Cesium.Ion.defaultAccessToken`；Runtime 内置 Viewer 使用 `CESIUM_ION_TOKEN`。不要把 token 提交进源码或放入 Agent 提示词。

## 本地验证

将公开的 [Natural Earth 河流数据](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_rivers_lake_centerlines.geojson) 保存到 `artifacts/vector-tiles/natural-earth-rivers.geojson`，构建 contracts、Bridge、Runtime 后运行：

```powershell
node scripts/test-vector-tiles.mjs
$env:DRAPE = '1'
node scripts/test-vector-tiles.mjs
$env:MVT = '1'
node scripts/test-vector-tiles.mjs
```

测试会启动独立本地服务，用实际河流坐标和属性生成矢量 glTF / MVT，在 Chrome 中渲染、实际点击、读属性、改样式、隐藏和删除。报告与截图保存在 `artifacts/vector-tiles`。它验证本地链路，不代表官方 HydroRIVERS 资产可用或已经发布。

`getLayerSchema` 会采样已加载瓦片的属性，并在 `metadata.tileStyle` 返回实际生效的样式表达式。MVT 可以按 `_layer` 字段区分源图层。加载新数据失败会保留原图层。

`DRAPE=1` 使用人工构造的固定高度地形验证渲染高度，不代表真实高程数据。`node scripts/test-vector-tiles-app.mjs` 验证 MCP Apps 面板、窄屏布局和普通实体选中行为。

同时设置 `TARGET=3d-tiles` 或 `TARGET=ground` 可验证人工构造的接收模型；`MIXED=1` 额外验证明确标记为测试数据的点和面。

`node scripts/preview-vector-tiles.mjs` 启动可交互的本地河流预览，地址为 `http://127.0.0.1:19351/`。可点击河流并与地图助手对话，停止该进程即可关闭预览服务。

如需真实模型调用测试，清除 `DRAPE`，设置 `AGENT=1`，运行 `node --import tsx scripts/test-vector-tiles.mjs`。需要本地 Codex CLI 已登录且可用，模型超时会记录为 Agent 验收失败。本地预览使用临时 HTTPS 配置，不修改用户的 Codex 设置。

也可以设置 `AGENT=workers-ai` 使用本项目现有的浏览器 Agent 服务。该模式调用真实 Runtime MCP 工具，并检查修改后的实际渲染颜色；会向该服务发送被点击的公开要素属性并使用模型配额。
