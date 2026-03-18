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

> "加载 GeoJSON 并按人口渐变着色"

```json
{
  "tool": "addGeoJsonLayer",
  "params": {
    "url": "https://example.com/provinces.geojson",
    "name": "省份人口",
    "style": {
      "gradient": {
        "field": "population",
        "stops": [
          { "value": 0, "color": "#ffffcc" },
          { "value": 50000000, "color": "#fd8d3c" },
          { "value": 100000000, "color": "#bd0026" }
        ]
      },
      "strokeWidth": 2
    }
  }
}
```

> "获取已加载 GeoJSON 图层的字段结构"

```json
{
  "tool": "getLayerSchema",
  "params": { "layerId": "geojson_123456" }
}
```

**返回：** `{ layerId: "geojson_123456", layerName: "省份", entityCount: 34, fields: [{ name: "name", type: "string", sample: "北京" }, ...] }`
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

> "把 3D 建筑染成黄色"

```json
{
  "tool": "updateLayerStyle",
  "params": {
    "layerId": "3dtiles_xxx",
    "tileStyle": {
      "color": "color('yellow')"
    }
  }
}
```

> "加载 CZML 动画"

```json
{
  "tool": "loadCzml",
  "params": {
    "url": "https://example.com/satellite-orbit.czml",
    "name": "卫星轨道"
  }
}
```

> "加载 KML 文件"

```json
{
  "tool": "loadKml",
  "params": {
    "url": "https://example.com/landmarks.kml",
    "name": "地标"
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

### 测量

> "测量北京到上海的距离"

```json
{
  "tool": "measure",
  "params": {
    "type": "distance",
    "coordinates": [[116.4, 39.9], [121.47, 31.23]]
  }
}
```

### 场景效果

> "开启泛光效果"

```json
{
  "tool": "setPostProcess",
  "params": {
    "bloom": true,
    "bloomBrightness": -0.1
  }
}
```

> "开启阴影并隐藏月亮"

```json
{
  "tool": "setSceneOptions",
  "params": {
    "shadowsEnabled": true,
    "moonShow": false
  }
}
```

## GeoAgent 集成

如果你正在构建完整的 GIS AI 应用，可以将 `cesium-mcp-runtime` 嵌入你的智能体工作流。Runtime 提供的 HTTP Push API 允许后端系统直接向浏览器推送命令：

```bash
curl -X POST http://localhost:9100/api/command \
  -H "Content-Type: application/json" \
  -d '{"action": "flyTo", "params": {"longitude": 116.4, "latitude": 39.9}}'
```
