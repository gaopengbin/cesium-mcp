# 快速开始

## 前置条件

- **Node.js** 20 或更高版本
- 一个 **CesiumJS** 应用（或使用我们提供的最小示例）
- 一个 **兼容 MCP 的 AI 客户端**（Claude Desktop、VS Code Copilot、Cursor 等）

## 安装

### 1. 在 CesiumJS 应用中添加 Bridge

```bash
npm install cesium-mcp-bridge
```

创建 Cesium Viewer 后初始化 Bridge：

```js
import { CesiumBridge } from 'cesium-mcp-bridge'

const viewer = new Cesium.Viewer('cesiumContainer')
const bridge = new CesiumBridge(viewer)
```

### 2. 启动 MCP Runtime

**stdio 模式**（适用于 Claude Desktop、VS Code、Cursor）：

```bash
npx cesium-mcp-runtime
```

**HTTP 模式**（适用于 Dify、n8n 等 HTTP 平台）：

```bash
npx cesium-mcp-runtime --transport http --port 3211
```

运行后会启动一个 Node.js 进程，它会：
- 在所选传输方式（stdio 或 HTTP）上提供 MCP 工具
- 在 9100 端口开启 **WebSocket 服务器**（与浏览器 Bridge 通信）

### 3. 配置 AI 智能体

#### Claude Desktop

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"]
    }
  }
}
```

#### VS Code (GitHub Copilot)

创建 `.vscode/mcp.json`：

```json
{
  "servers": {
    "cesium-mcp": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"]
    }
  }
}
```

#### Cursor

创建 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"]
    }
  }
}
```

#### Dify / n8n（HTTP 传输模式）

首先以 HTTP 模式启动 Runtime：

```bash
npx cesium-mcp-runtime --transport http --port 3211
```

然后在 Dify 中添加 MCP 工具节点，配置如下：

```json
{
  "cesium-mcp": {
    "transport": "streamable_http",
    "url": "http://localhost:3211/mcp",
    "timeout": 60
  }
}
```

> Docker 部署的 Dify 需将 `localhost` 替换为 `host.docker.internal`。
> 完整指南：[examples/dify-integration/](https://github.com/gaopengbin/cesium-mcp/tree/main/examples/dify-integration)

### 4. 试一试

在浏览器中打开你的 CesiumJS 应用，然后对 AI 智能体说：

> "飞到埃菲尔铁塔"

智能体会调用 `flyTo` 工具，指令通过 Runtime 路由到 Bridge，你的地球将自动飞行到巴黎。

## 仅 IDE 模式 (cesium-mcp-dev)

如果你只需要 AI 辅助编写 CesiumJS 代码（不需要实时地球），可以安装 dev 服务器：

```bash
npx cesium-mcp-dev
```

它提供：
- **API 文档查询** — 查询 Cesium 类、方法、属性
- **代码片段生成** — 获取常见模式的可运行代码
- **Entity 模板构建器** — 根据描述生成 Entity 配置

配置方式与 Runtime 相同，将 `cesium-mcp-runtime` 替换为 `cesium-mcp-dev` 即可。

## 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CESIUM_WS_PORT` | `9100` | WebSocket 服务器端口 |
| `DEFAULT_SESSION_ID` | `default` | 多标签页路由的会话 ID |
| `MCP_TRANSPORT` | `stdio` | 传输模式：`stdio` 或 `http` |
| `MCP_HTTP_PORT` | `3211` | HTTP 服务器端口（`MCP_TRANSPORT=http` 时生效） |
| `HTTPS_PROXY` | — | geocode 请求的 HTTP 代理地址（如 `http://127.0.0.1:10808`） |
| `OSM_USER_AGENT` | `cesium-mcp-runtime/1.0` | Nominatim geocode API 的 User-Agent |
| `CESIUM_LOCALE` | `en` | 工具描述语言：`en`（英文，默认）或 `zh-CN`（中文） |

### 代理配置

`geocode` 工具通过 HTTPS 调用 Nominatim API。如果需要代理（例如在国内网络），在 MCP 客户端配置中设置 `HTTPS_PROXY`：

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["-y", "cesium-mcp-runtime"],
      "env": {
        "HTTPS_PROXY": "http://127.0.0.1:10808"
      }
    }
  }
}
```

支持的变量：`HTTPS_PROXY`、`HTTP_PROXY`、`ALL_PROXY`。Runtime 使用 Node.js 内置的 `undici.ProxyAgent`，无需额外依赖。

## 最小示例

仓库中包含完整的单文件示例：

```bash
git clone https://github.com/gaopengbin/cesium-mcp.git
cd cesium-mcp/examples/minimal
# 在浏览器中打开 index.html
```

## 下一步

- [架构概览](/zh-CN/guide/architecture) — 了解三包架构设计
- [Bridge API](/zh-CN/api/bridge) — 全部 58 个命令
- [Runtime API](/zh-CN/api/runtime) — MCP 工具和资源
- [Dev API](/zh-CN/api/dev) — IDE 编码辅助工具
