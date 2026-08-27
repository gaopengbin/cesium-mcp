# 资源句柄

大型 GeoJSON 和 CZML 不应在每次模型工具调用中重复传递。Cesium MCP 可以先存储一次数据，再让后续可视化工具只传递短小的 `resourceId`。

```text
GeoJSON / CZML 数据
        ↓ storeResource
会话内 resourceId
        ↓ addGeoJsonLayer / loadCzml / addHeatmap / ...
适配层还原 data
        ↓
原有 Cesium Bridge action
```

资源层属于 MCP 或 WebMCP 适配器。它不改变浏览器 Bridge 协议，也不会把临时数据混入 Cesium 场景状态。

## MCP Runtime

`storeResource`、`listResources` 和 `deleteResource` 不依赖工具集，始终可以使用：

```json
{
  "name": "storeResource",
  "arguments": {
    "kind": "geojson",
    "data": {
      "type": "FeatureCollection",
      "features": []
    }
  }
}
```

后续调用只传返回的 ID，不再重复 `data`：

```json
{
  "name": "addGeoJsonLayer",
  "arguments": {
    "resourceId": "resource_mabc_1",
    "name": "行政边界"
  }
}
```

Runtime 按浏览器 `sessionId` 隔离资源；另一个浏览器会话无法访问同一 ID。

## WebMCP 与 Function Calling

为保持现有接入兼容，资源工具默认不启用，原有 15 工具表面不变：

```ts
const registration = await registerCesiumViewerWebMcp(viewer, {
  enableResources: true,
})

const stored = registration.resourceStore!.register({
  kind: 'geojson',
  data: largeFeatureCollection,
})
```

应用也可以提供自己的 Store：

```ts
const resourceStore = createCesiumResourceStore()

await registerCesiumViewerWebMcp(viewer, {
  resourceStore,
  toolsets: 'all',
})
```

在线 Browser Agent 已启用这三个工具，并让原生 WebMCP 与内置 Function Calling 智能体共享同一个页面级 Store。

## 支持的消费工具

| 资源类型 | 接受 `resourceId` 的工具 |
|---|---|
| `geojson` | `addGeoJsonLayer`、`addGeoJsonPrimitive`、`addLabel`、`addHeatmap` |
| `czml` | `loadCzml` |
| `json` | 预留给应用及后续空间分析工具 |

## 生命周期与限制

- 只保存在内存中，定位是临时数据，不替代场景持久化。
- 默认有效期：注册后 30 分钟。
- 默认容量：每个 Store 100 个资源。
- 默认单资源上限：10 MiB。
- `listResources` 只返回元数据，不返回资源正文。
- 当前适用于单个 Runtime 进程或单个浏览器页面；多实例部署后续应接入共享存储适配器。

原有 `data` 和 `url` 调用保持完全兼容；`resourceId` 不能与二者同时使用。
