# 将 ion MCP 资产交给实时地图

官方 [Cesium ion MCP](https://cesium.com/learn/ion/mcp/) 管理云端资产，本项目的 Runtime 控制已连接的 CesiumJS Viewer。Agent 可以在同一会话中使用两套服务：先从 ion 找到可访问的资产，再把资产 ID 交给地图。

## 连接与授权

按官方[客户端连接指南](https://cesium.com/learn/ion/connect-your-ai-client/)连接 `https://mcp.ion.cesium.com`，在浏览器完成 OAuth 登录。官方服务申请资产和标签的读写权限，请自行检查授权页面。

地图加载数据使用另一份流式读取凭据。Runtime 的浏览器 Viewer 在启动前从本地配置 `CESIUM_ION_TOKEN`；使用 Bridge SDK 的应用在浏览器初始化时配置 `Cesium.Ion.defaultAccessToken`。该 token 需要 `assets:read` 及目标资产的访问权限，URL 限制也必须允许 Viewer 的来源站点。不要把 token 放进提示词或受版本管理的配置文件。

本流程使用浏览器 Viewer。MCP Apps 面板拥有独立浏览器状态，不会自动继承浏览器 Viewer 的启动 token。官方 ion MCP 的 OAuth 授权同样不会替地图配置 CesiumJS token。

## 查找、加载与核验

1. 在**官方 ion MCP** 调用 `search_assets`，传入实际搜索词、`type: "3DTILES"` 和 `status: "COMPLETE"`。仍在处理的资产用 `get_asset` 或 `wait_for_asset` 检查最终状态；超时或切片失败不代表已经可用。
2. 在**我们的 Runtime** 连接前面已配置凭据的浏览器 Viewer，通过 `listSessions` 找到它的已连接会话。后续地图调用保留该 `sessionId`；打开 MCP Apps 面板会产生独立浏览器状态。必要时通过 `enable_toolset` 启用 `tiles` 工具集。
3. 矢量 3D Tiles 调用 `loadVectorTiles`，网格或点云资产调用 `load3dTiles`。传入 ion 实际返回的数字 ID，不要套用示例资产 ID。

矢量 3D Tiles 的参数如下，变量来自前面工具的真实返回结果：

```js
{
  sessionId: mapSessionId,
  source: 'tileset',
  id: 'ion-vectors',
  name: asset.name,
  ionAssetId: asset.id,
  flyTo: true,
}
```

4. 确认加载工具成功，再对返回的图层 ID 调用 `getLayerSchema`。`metadata.ionAssetId` 记录原始加载参数，可与官方返回的 ID 核对。它是来源记录，不代表资产归属或当前权限证明。属性字段采样自已加载瓦片，内容尚未加载时可能为空。
5. 点击可见要素后调用 `getSelectedTileFeature`，用返回的 `layerId` 调用 `updateLayerStyle`，仅使用真实属性构造样式表达式。再读取 `getLayerSchema.metadata.tileStyle` 核验实际应用的表达式。

官方 `get_tileset` 返回用于检查的根 tileset JSON，不是可直接传入加载工具的托管地址。不要从返回内容提取端点凭据交给地图；按资产 ID 加载，由 CesiumJS 解析并刷新流式数据资源。

## 能力边界与失败处理

| 结果 | 处理方式 |
| --- | --- |
| 官方 MCP 返回 401/403 | 重新认证或检查 ion 账户权限。 |
| 地图用同一 ID 返回 401/403/404 | 检查 Viewer token 的读取权限、可访问资产和允许的来源站点。仅凭 404 不能判断资产公开或不存在。保留原有图层。 |
| 没有选中要素 | 等待内容可见后点击；点击接口不查询完整数据集。 |
| 官方 BIM 元素查询不可用 | 该能力仅支持通过 `import_imodel` 创建的资产；普通点击属性不会自动等于官方 `elementId`。 |
| 受保护的 MVT 服务需要请求头 | 当前 `loadVectorTiles` 接受 URL，没有 headers 参数。由宿主应用或已获授权的网关处理认证，不要把凭据放入 Agent 参数。 |

官方 [MVT 教程](https://cesium.com/learn/cesiumjs-learn/load-mapbox-vector-tiles-in-cesiumjs/)覆盖 URL 模板、数据范围、稳定 ID、样式、拾取和贴附。对应工具见本项目的[矢量瓦片指南](./vector-tiles)。已有 Mapbox 样式 JSON 不会自动转换为 Cesium 样式。

## 本地回归验证

构建完成，并按矢量瓦片指南准备 Natural Earth 测试数据后运行：

```powershell
$env:ION_FIXTURE = '1'
$env:RUNTIME_ENTRY = 'packages/cesium-mcp-runtime/dist/cli.js'
node scripts/test-vector-tiles.mjs
Remove-Item Env:ION_FIXTURE, Env:RUNTIME_ENTRY
```

此模式与 `MVT=1`、`HYDRORIVERS=1` 分开运行。它使用真实浏览器的 `IonResource` 加载路径和模拟端点，读取公开河流几何，经 MCP 核验资产 ID，再实际点击、改样式和删除图层。报告保存在 `artifacts/vector-tiles/installed-ion-fixture-results.json`。它验证本地联动机制，不会登录真实 ion 账户，也不调用官方 ion MCP 的账户工具。
