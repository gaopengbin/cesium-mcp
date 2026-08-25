# 工具命名契约

Cesium MCP 在 MCP、WebMCP 与 Function Calling 中共享同一份公开工具清单。因此，工具名必须让模型仅通过名称就能判断操作类型和目标 Cesium 对象，不能依赖某一种协议的额外上下文。

## 动词规则

| 前缀 | 统一含义 | 示例 |
|---|---|---|
| `add` | 根据结构化参数创建并附加新的场景对象 | `addMarker`、`addPolygon`、`addGeoJsonPrimitive` |
| `load` | 解析或获取指定格式的外部数据 | `loadCzml`、`loadKml` |
| `set` | 替换 Viewer 的单例状态或全局配置 | `setBasemap`、`setSceneOptions` |
| `update` | 根据 ID 修改已有对象 | `updateEntity`、`updateLayerStyle` |
| `remove` | 从场景移除已有托管对象 | `removeEntity`、`removeLayer` |
| `get` / `list` / `query` | 只读取状态，不修改场景 | `getView`、`listLayers`、`queryEntities` |
| `save` / `restore` | 保存或恢复应用内部状态 | `saveViewpoint` 与建议名称 `restoreViewpoint` |
| `start` / `stop` / `control` / `play` | 操作有生命周期的活动 | `startOrbit`、`controlClock`、`playTrajectory` |

公开工具名使用小驼峰。已有命令若因兼容性保留历史缩写大小写，应在标题和描述中保证格式名称清晰可读。

## 61 个工具审计结果

当前 61 个浏览器安全契约分布在 12 个工具集中。其中 55 个名称符合上述规则，没有明显的语义冲突；6 个名称需要迁移评估：

| 当前公开名称 | 建议公开名称 | 稳定 Bridge action | 原因 |
|---|---|---|---|
| `addGeoJsonLayer` | `loadGeoJson` | `addGeoJsonLayer` | 它通过托管数据图层解析内联或远程 GeoJSON；`load` 与 CZML、KML 更一致。 |
| `loadViewpoint` | `restoreViewpoint` | `loadViewpoint` | 它恢复页面本地状态，不是加载外部资源。 |
| `loadTerrain` | `setTerrainProvider` | `loadTerrain` | Terrain 是 Viewer 单例状态，该操作会替换 Provider。 |
| `loadImageryService` | `addImageryLayer` | `loadImageryService` | 影像以图层形式追加，可以和其他影像图层共存。 |
| `load3dTiles` | `load3dTileset` | `load3dTiles` | 返回的是一个托管的 `Cesium3DTileset`，建议名称目标更准确。 |
| `load3dGaussianSplat` | `load3dGaussianSplatTileset` | `load3dGaussianSplat` | 该操作同样创建托管 Tileset，而不是无类型资源。 |

`addGeoJsonPrimitive` 有意保留 `add`。它把 GeoJSON 几何转换为 Cesium Primitive，而不是加载 `GeoJsonDataSource`；不同前缀正好表达不同的执行模型。

## 公开名称与 Bridge action

每个规范契约包含两个标识符：

```ts
interface CesiumToolContract {
  name: string   // 暴露给模型和协议
  action?: string // 交给 CesiumBridge 执行；默认使用 name
}
```

当前发布的全部工具中二者仍然相同。协议适配器必须派发 `action`，这样未来修改公开名称时可以继续执行原有浏览器命令：

```ts
{
  name: 'loadGeoJson',
  action: 'addGeoJsonLayer',
}
```

这种解耦并不意味着可以随意改名。公开工具名已经存在于提示词、客户端配置、评测数据和用户代码中。

## 兼容迁移顺序

本轮命名契约工作不会修改任何公开工具名。后续统一迁移必须：

1. 使用相同的确定性路由与真实模型评测比较候选名称；
2. 同时更新 MCP、WebMCP、Function Calling、工具集、本地化、示例和文档；
3. 保留旧 Bridge action；
4. 发布明确的旧名称到新名称迁移表与 Release Note；
5. 默认不向模型同时暴露新旧别名，避免扩大工具面并产生歧义；
6. 为仍调用历史名称的客户端提供可选旧版兼容入口；
7. 只在提前公告的兼容性边界移除旧公开别名。

因此，命名审计首先是一项发布安全基础，不是立即执行的破坏性改名。
