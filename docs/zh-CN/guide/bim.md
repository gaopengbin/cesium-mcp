# BIM 构件与工程量统计

可选工具组 `bim` 将官方 ion Asset Elements REST API 接入当前地图。渲染基线已升级至 CesiumJS 1.147。查询沿用官方同源 REST 接口，保留响应大小、取消和超时控制，并与原生 IonAssetElementService 做本地结果一致性检查。

调用 `enable_toolset({ toolset: 'bim' })`，或设置 `CESIUM_TOOLSETS=view,layer,tiles,bim,interaction`。Bridge、WebMCP 使用相同工具契约；WebMCP 可选择 `toolsets: 'bim'` 或 `'all'`。

## 数据条件

需要**带 BIM/CAD 数据库且 token 有读取权限的 ion 资产**。普通倾斜摄影瓦片、GeoJSON 或本地 IFC 文件并不自动具备云端构件数据库。先用 `load3dTiles({ id: 'design', ionAssetId: 资产ID })` 加载；仅通过 URL 加载的图层不能查询任意账号资产。

使用现有本地 `CESIUM_ION_TOKEN` 配置 / `setIonToken`；网页集成读取 `Cesium.Ion.defaultAccessToken` 和 `Cesium.Ion.defaultServer`。BIM 工具参数不接收 token，也不会将其放入查询 URL、结果或使用统计。请求不携带 Cookie/Referrer，不跟随重定向，响应上限 4 MiB。

## 完整流程

1. `queryBimElements`：按官方 JSON 条件筛选并分页查询，例如 `filter: { 'IFC Class Name': 'ifcwall' }`。使用返回的 `continuationToken` 继续查询，不能把当前页当成全模型。
2. `getBimElement`：读取单个构件完整属性、源单位和地理范围。属性键名保留点号和命名空间，列表可能省略详情。
3. `aggregateBimElements`：传入 `propertyKeys` 与相同筛选条件，由 ion 服务端统计全部匹配构件的数量、最小值、最大值、平均值、总和。`total` 是匹配构件数，各属性的 `count` 是具有数值的构件数；空值不是测量值 0。不会自动换算或统一混合单位，属性键及单位必须以模型详情为准。
4. `focusBimElements`：传入十进制字符串 `elementIds`，按真实地理包围球定位，支持 `duration: 0` 立即定位。无地理位置的构件会被报告，全部无位置时不移动镜头。
5. `selectBimElements`：按 ID 高亮；`isolate: true` 同时隐藏其他构件。
6. `filterBimElements`：取完全部匹配分页后隔离、高亮。默认上限 5,000 个、最多 10,000 个；超限、分页异常、请求失败或取消时不应用部分结果。空结果会隐藏全部构件。
7. `clearBimSelection`：恢复原来的图层样式与可见性。主动调用 `updateLayerStyle` 也会清除 BIM 选择。

高亮与筛选对后续流入的瓦片同样有效，并遵守原有样式可见性规则，状态按图层、Viewer 隔离。点击模型后使用 `getSelectedTileFeature` 的 `data.feature.properties.element` 查询详细属性。构件 ID 必须保留为字符串，不转成 JavaScript Number，以免大整数精度丢失。

## 本地测试与边界

构建后运行 `npm run test:bim`。测试使用明确标注的本地双构件模型和官方接口形状，实际经过 MCP HTTP → WebSocket → Bridge、Cesium 渲染与 WebMCP，检查分页、单位、全量统计、定位、点选、高亮、筛选和恢复。

本地样例不是私有 ion 资产授权验证。真实云端验证还需要可访问的 BIM/CAD 资产 ID 和读取权限；资产列表失败不代表账号没有资产。本次本地测试也不涉及部署或 npm 发布。

Bridge/WebMCP 支持通过 AbortSignal 取消操作；现有 WebSocket 传输尚不转发 MCP 客户端取消信号。多请求筛选与定位设有 25 秒总时限。

参考：[官方接口文档](https://cesium.com/learn/cesiumjs/ref-doc/IonAssetElementService.html)、[官方 REST 调用实现](https://github.com/CesiumGS/cesium/blob/1.147/packages/engine/Source/Scene/IonAssetElementService.js)。

## 模型树与精确吸附

`getBimTree` 读取根节点或按 `nodeKey` 读取子节点；`getBimElementParents` 返回构件根到叶的层级路径。`snapBimElement` 使用原生 IonSnapService；传入十进制构件 ID 和地理测试点，内部无损转为十六进制 ID。它需要地理定位数据库，不支持经过额外 modelMatrix/heightOffset 变换的模型；没有可吸附几何时返回 snapped=false。云端精确吸附目前仅完成本地接口契约测试，尚缺授权真实资产验证。
