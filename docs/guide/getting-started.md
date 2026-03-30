# Getting Started

## Prerequisites

- **Node.js** 20 or higher
- A **CesiumJS** application (or use our minimal example)
- An **MCP-compatible AI client** (Claude Desktop, VS Code Copilot, Cursor, etc.)

## Installation

### 1. Add the Bridge to Your CesiumJS App

```bash
npm install cesium-mcp-bridge
```

Initialize the bridge after creating your Cesium Viewer:

```js
import { CesiumBridge } from 'cesium-mcp-bridge'

const viewer = new Cesium.Viewer('cesiumContainer')
const bridge = new CesiumBridge(viewer)
```

### 2. Start the MCP Runtime

```bash
npx cesium-mcp-runtime
```

This starts a Node.js process that:
- Listens for MCP tool calls on **stdio** (from your AI agent)
- Opens a **WebSocket server** on port 9100 (for the browser bridge)

### 3. Configure Your AI Agent

#### Claude Desktop

Edit `claude_desktop_config.json`:

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

Create `.vscode/mcp.json`:

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

Create `.cursor/mcp.json`:

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

### 4. Try It Out

Open your CesiumJS app in a browser, then ask your AI agent:

> "Fly to the Eiffel Tower"

The agent will call the `flyTo` tool, which routes through the runtime to the bridge, and your globe will animate to Paris.

## IDE-Only Setup (cesium-mcp-dev)

If you just want AI-powered CesiumJS code assistance (no live globe), install the dev server:

```bash
npx cesium-mcp-dev
```

This provides:
- **API documentation lookup** — query Cesium classes, methods, properties
- **Code snippet generation** — get working code for common patterns
- **Entity template builder** — generate Entity configurations from descriptions

Configure it the same way as the runtime, replacing `cesium-mcp-runtime` with `cesium-mcp-dev`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CESIUM_WS_PORT` | `9100` | WebSocket server port |
| `DEFAULT_SESSION_ID` | `default` | Session ID for multi-tab routing |
| `HTTPS_PROXY` | — | HTTP proxy URL for geocode requests (e.g. `http://127.0.0.1:10808`) |
| `OSM_USER_AGENT` | `cesium-mcp-runtime/1.0` | User-Agent for Nominatim geocode API |
| `CESIUM_LOCALE` | `en` | Tool description language: `en` (English, default) or `zh-CN` (Chinese) |

### Proxy Configuration

The `geocode` tool calls the Nominatim API over HTTPS. If you need a proxy (e.g. in China), set `HTTPS_PROXY` in your MCP client config:

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

Supported variables: `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`. The runtime uses Node.js built-in `undici.ProxyAgent` — no extra dependencies needed.

## Minimal Example

A complete single-file example is included in the repository:

```bash
git clone https://github.com/gaopengbin/cesium-mcp.git
cd cesium-mcp/examples/minimal
# Open index.html in a browser
```

This example includes a CesiumJS Viewer with the bridge pre-configured, ready for AI agent control.

## Next Steps

- [Architecture](/guide/architecture) — understand the three-package design
- [Bridge API](/api/bridge) — all 58 commands
- [Runtime API](/api/runtime) — MCP tools and resources
- [Dev API](/api/dev) — IDE coding assistance tools
