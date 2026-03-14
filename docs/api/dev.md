# cesium-mcp-dev

> IDE MCP Server — CesiumJS API documentation, code generation, and Entity builder.

[![npm](https://img.shields.io/npm/v/cesium-mcp-dev)](https://www.npmjs.com/package/cesium-mcp-dev)

## Installation & Run

```bash
npx cesium-mcp-dev
```

## IDE Configuration

### VS Code (GitHub Copilot)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "cesium-dev": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-dev"]
    }
  }
}
```

### Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cesium-dev": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-dev"]
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
      "args": ["-y", "cesium-mcp-dev"]
    }
  }
}
```

## MCP Tools (3)

### `cesium_api_lookup`

Query CesiumJS API documentation for classes, methods, and properties.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Class name, method, or property to look up |

**Covered classes (12):**
`Viewer`, `Entity`, `Camera`, `Cartesian3`, `Color`, `GeoJsonDataSource`, `ImageryLayer`, `Cesium3DTileset`, `Material`, `ScreenSpaceEventHandler`, `flyTo`, `setView`

**Example:**
```
Tool: cesium_api_lookup
Input: { "query": "Camera" }
Output: Camera class documentation with constructor, properties, and methods
```

### `cesium_code_gen`

Generate working CesiumJS code snippets for common patterns.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string` | Code pattern to generate (e.g., "add marker", "fly to") |

**Supported patterns:**
- Camera operations (flyTo, setView, lookAt)
- Entity creation (point, billboard, label, polyline, polygon)
- Data loading (GeoJSON, 3D Tiles, terrain, imagery)
- Event handling (mouse click, hover, camera change)
- Measurement (distance, area)

**Example:**
```
Tool: cesium_code_gen
Input: { "pattern": "add polygon" }
Output: Complete code snippet for adding a polygon entity
```

### `cesium_entity_template`

Generate complete Entity configuration objects from natural language descriptions.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `description` | `string` | Natural language description of the entity |

**Example:**
```
Tool: cesium_entity_template
Input: { "description": "red pin marker at Beijing with label" }
Output: Complete Entity configuration object with position, billboard, and label
```

## Use Cases

### For AI Coding Assistants

When an AI assistant is helping you write CesiumJS code, the dev server provides:

1. **Accurate API info** — no hallucinated methods or parameters
2. **Working code** — tested snippets that compile and run
3. **Best practices** — follows CesiumJS conventions

### Standalone Usage

The dev server works independently — no browser, no globe, no runtime needed. It's purely for **code assistance** during development.
