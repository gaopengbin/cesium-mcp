# 示例

## 最小示例

仓库中包含完整的单文件示例 [`examples/minimal/`](https://github.com/gaopengbin/cesium-mcp/tree/main/examples/minimal)。

```bash
git clone https://github.com/gaopengbin/cesium-mcp.git
cd cesium-mcp/examples/minimal
# 在浏览器中打开 index.html
```

## 常见 AI 智能体交互

当 CesiumJS 应用连接好 Bridge、Runtime 也在运行后，你可以这样和 AI 智能体对话：

### 相机控制

> "飞到长城，高度 5000 米"

智能体调用 `flyTo`，参数为 `{ longitude: 116.57, latitude: 40.43, height: 5000 }`。

> "俯瞰上海浦东"

智能体调用 `flyTo`，参数为 `{ longitude: 121.5, latitude: 31.24, height: 10000, pitch: -90 }`。

### 图层管理

> "加载 USGS 地震数据"

```json
{
  "tool": "addGeoJsonLayer",
  "params": {
    "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    "name": "USGS Earthquakes"
  }
}
```

> "添加一个人口密度热力图"

```json
{
  "tool": "addHeatmap",
  "params": {
    "points": [
      { "longitude": 116.4, "latitude": 39.9, "value": 21540000 },
      { "longitude": 121.47, "latitude": 31.23, "value": 24280000 }
    ],
    "name": "人口密度",
    "radius": 50
  }
}
```

### 3D 数据

> "加载纽约市 3D 建筑"

```json
{
  "tool": "load3dTiles",
  "params": {
    "url": "https://assets.cesium.com/96188/tileset.json",
    "name": "NYC Buildings"
  }
}
```

### 实体创建

> "在东方明珠塔位置添加一个红色标记"

```json
{
  "tool": "addMarker",
  "params": {
    "longitude": 121.4956,
    "latitude": 31.2416,
    "name": "东方明珠塔",
    "color": "#FF0000"
  }
}
```

> "画一条从北京到上海的折线"

```json
{
  "tool": "addPolyline",
  "params": {
    "positions": [
      { "longitude": 116.4, "latitude": 39.9 },
      { "longitude": 121.47, "latitude": 31.23 }
    ],
    "name": "京沪线",
    "color": "#00BFFF",
    "width": 3
  }
}
```

### 轨迹动画

> "创建一个从北京飞到上海的飞行轨迹"

```json
{
  "tool": "playTrajectory",
  "params": {
    "positions": [
      { "longitude": 116.4, "latitude": 39.9, "height": 10000 },
      { "longitude": 118.8, "latitude": 36.0, "height": 10000 },
      { "longitude": 121.47, "latitude": 31.23, "height": 10000 }
    ],
    "duration": 10,
    "modelUrl": "https://assets.cesium.com/831744/CesiumAir.glb",
    "name": "京沪航线"
  }
}
```

### 分析

> "截一张当前视图的图"

智能体调用 `screenshot`，返回 base64 编码的图片。

> "当前加载了哪些图层？"

智能体读取 `cesium://scene/layers` 资源。

## GeoAgent 集成

如果你正在构建完整的 GIS AI 应用，可以将 `cesium-mcp-runtime` 嵌入你的智能体工作流。Runtime 提供的 HTTP Push API 允许后端系统直接向浏览器推送命令：

```bash
curl -X POST http://localhost:9100/api/command \
  -H "Content-Type: application/json" \
  -d '{"action": "flyTo", "params": {"longitude": 116.4, "latitude": 39.9}}'
```
