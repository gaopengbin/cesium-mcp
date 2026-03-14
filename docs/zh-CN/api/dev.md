# cesium-mcp-dev

> IDE MCP 服务器 — CesiumJS API 文档、代码生成和 Entity 构建器。

[![npm](https://img.shields.io/npm/v/cesium-mcp-dev)](https://www.npmjs.com/package/cesium-mcp-dev)

## 安装与运行

```bash
npx cesium-mcp-dev
```

## IDE 配置

### VS Code (GitHub Copilot)

`.vscode/mcp.json`：

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

`.cursor/mcp.json`：

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

## MCP 工具（3 个）

### `cesium_api_lookup`

查询 CesiumJS API 文档，包括类、方法和属性。

**参数：**
| 参数 | 类型 | 描述 |
|------|------|------|
| `query` | `string` | 要查询的类名、方法或属性 |

**覆盖的类（12 个）：**
`Viewer`, `Entity`, `Camera`, `Cartesian3`, `Color`, `GeoJsonDataSource`, `ImageryLayer`, `Cesium3DTileset`, `Material`, `ScreenSpaceEventHandler`, `flyTo`, `setView`

### `cesium_code_gen`

生成可运行的 CesiumJS 代码片段。

**参数：**
| 参数 | 类型 | 描述 |
|------|------|------|
| `pattern` | `string` | 要生成的代码模式（如 "add marker", "fly to"） |

**支持的模式：**
- 相机操作（flyTo、setView、lookAt）
- 实体创建（点、Billboard、标注、折线、多边形）
- 数据加载（GeoJSON、3D Tiles、地形、影像）
- 事件处理（鼠标点击、悬停、相机变化）
- 量测（距离、面积）

### `cesium_entity_template`

根据自然语言描述生成完整的 Entity 配置对象。

**参数：**
| 参数 | 类型 | 描述 |
|------|------|------|
| `description` | `string` | 实体的自然语言描述 |

**示例：**
```
工具：cesium_entity_template
输入：{ "description": "北京的红色标记带标注" }
输出：包含位置、Billboard 和 Label 的完整 Entity 配置对象
```

## 适用场景

### AI 编码助手

当 AI 助手帮你编写 CesiumJS 代码时，Dev 服务器提供：

1. **准确的 API 信息** — 不会生成不存在的方法或参数
2. **可运行的代码** — 经过测试的代码片段
3. **最佳实践** — 遵循 CesiumJS 惯例

### 独立使用

Dev 服务器独立运行 — 不需要浏览器、不需要地球、不需要 Runtime。纯粹用于**开发阶段的代码辅助**。
