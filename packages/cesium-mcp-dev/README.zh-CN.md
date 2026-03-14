# cesium-mcp-dev

[English](README.md) | **中文**

> 为 IDE AI 助手提供的 MCP 服务器 — Cesium API 文档查询、代码生成和 Entity 构建器。

[![npm version](https://img.shields.io/npm/v/cesium-mcp-dev.svg)](https://www.npmjs.com/package/cesium-mcp-dev)
[![license](https://img.shields.io/npm/l/cesium-mcp-dev.svg)](LICENSE)

## 简介

`cesium-mcp-dev` 帮助 AI 编程助手（GitHub Copilot、Cursor、Claude Code 等）编写更好的 CesiumJS 代码——通过 MCP 协议提供 API 文档查询、代码片段生成和 Entity 配置构建功能。

```
IDE AI 助手 <--MCP stdio--> cesium-mcp-dev --> API 文档、代码片段、Entity 配置
```

## 安装与运行

```bash
npx cesium-mcp-dev
```

## IDE 配置

### VS Code (Copilot)

在 `.vscode/mcp.json` 中：

```json
{
  "servers": {
    "cesium-dev": {
      "command": "npx",
      "args": ["cesium-mcp-dev"]
    }
  }
}
```

### Cursor

在 `.cursor/mcp.json` 中：

```json
{
  "mcpServers": {
    "cesium-dev": {
      "command": "npx",
      "args": ["cesium-mcp-dev"]
    }
  }
}
```

### Claude Desktop

```json
{
  "mcpServers": {
    "cesium-dev": {
      "command": "npx",
      "args": ["cesium-mcp-dev"]
    }
  }
}
```

## MCP 工具 (3)

### `cesium_api_lookup`

按类名、方法或属性查询 Cesium API 文档。

```
输入: "Viewer"
输出: 构造函数签名、属性、方法和使用示例
```

**覆盖的类**: Viewer, Entity, Camera, Cartesian3, Color, GeoJsonDataSource, ImageryLayer, Cesium3DTileset, Material, ScreenSpaceEventHandler, flyTo, setView（12 个类）

### `cesium_code_gen`

根据自然语言描述生成 Cesium 代码。

```
输入: "在天安门广场添加一个红色点标记"
输出: 可直接使用的完整 TypeScript 代码片段
```

**内置片段**: 飞行到位置、添加标记、加载 GeoJSON、绘制折线、绘制多边形、加载 3D Tiles、切换底图、点击处理器、截图、热力图、轨迹动画（11 个场景）

### `cesium_entity_builder`

通过指定类型和属性交互式构建 Entity 配置。

```
输入: type: "polygon", position: {lon: 116.4, lat: 39.9}, color: "#ff6600"
输出: 包含材质、样式和地面贴合的完整 Entity 定义
```

**支持类型**: point, billboard, label, polyline, polygon, model, ellipse, box（8 种类型）

## 许可证

MIT
