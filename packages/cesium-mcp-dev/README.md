# cesium-mcp-dev

**English** | [中文](README.zh-CN.md)

> MCP Server for IDE AI assistants -- Cesium API documentation, code generation, and Entity builder.

[![npm version](https://img.shields.io/npm/v/cesium-mcp-dev.svg)](https://www.npmjs.com/package/cesium-mcp-dev)
[![license](https://img.shields.io/npm/l/cesium-mcp-dev.svg)](LICENSE)

## What is this?

`cesium-mcp-dev` helps AI coding assistants (GitHub Copilot, Cursor, Claude Code, etc.) write better CesiumJS code by providing API documentation lookup, code snippet generation, and Entity configuration building -- all through the MCP protocol.

```
IDE AI Assistant <--MCP stdio--> cesium-mcp-dev --> API docs, code snippets, Entity configs
```

## Install & Run

```bash
npx cesium-mcp-dev
```

## IDE Configuration

### VS Code (Copilot)

In `.vscode/mcp.json`:

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

In `.cursor/mcp.json`:

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

## MCP Tools (3)

### `cesium_api_lookup`

Query Cesium API documentation by class name, method, or property.

```
Input: "Viewer"
Output: Constructor signature, properties, methods, and usage examples
```

**Covered classes**: Viewer, Entity, Camera, Cartesian3, Color, GeoJsonDataSource, ImageryLayer, Cesium3DTileset, Material, ScreenSpaceEventHandler, flyTo, setView (12 classes)

### `cesium_code_gen`

Generate Cesium code from natural language descriptions.

```
Input: "Add a red point marker at Tiananmen Square"
Output: Complete TypeScript code snippet ready to use
```

**Built-in snippets**: fly to location, add marker, load GeoJSON, draw polyline, draw polygon, load 3D Tiles, switch basemap, click handler, screenshot, heatmap, trajectory animation (11 scenarios)

### `cesium_entity_builder`

Build Entity configurations interactively by specifying type and properties.

```
Input: type: "polygon", position: {lon: 116.4, lat: 39.9}, color: "#ff6600"
Output: Complete Entity definition with material, style, and ground clamping
```

**Supported types**: point, billboard, label, polyline, polygon, model, ellipse, box (8 types)

## Example Interactions

**AI assistant asks**: "How do I load a 3D Tiles model from Cesium Ion?"

The assistant calls `cesium_api_lookup` with `"Cesium3DTileset"`, gets the API reference, then calls `cesium_code_gen` with the user's specific requirements to generate ready-to-use code.

**AI assistant asks**: "Create an Entity for a semi-transparent blue polygon"

The assistant calls `cesium_entity_builder` with `type: "polygon", color: "#0066ff", opacity: 0.5` and gets complete code output.

## Compatibility

| cesium-mcp-dev | Cesium |
|----------------|--------|
| 1.139.x | ~1.139.0 |

## License

MIT
