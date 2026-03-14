# Cesium MCP 极简接入示例

一个最小化的完整示例，展示如何用 cesium-mcp-bridge + cesium-mcp-runtime 让 AI Agent 操控浏览器中的 Cesium 3D 地图。

## 文件结构

```
examples/minimal/
├── index.html      # 单文件完整示例（Cesium + Bridge + WebSocket 连接）
└── README.md       # 本文件
```

## 快速体验

### 步骤 1: 启动 Runtime

```bash
cd packages/cesium-mcp-runtime
npx tsx src/index.ts
# 监听 9100 端口 (HTTP + WebSocket + MCP stdio)
```

### 步骤 2: 打开页面

```bash
# 方式 1: 直接用浏览器打开
# 双击 examples/minimal/index.html

# 方式 2: 用 serve 启动（推荐，避免 CORS）
npx serve examples/minimal -l 3000
# 浏览器访问 http://localhost:3000
```

### 步骤 3: 配置 AI Agent（可选）

在 Claude Desktop 或 VS Code 中添加 MCP Server 配置：

```json
{
  "mcpServers": {
    "cesium": {
      "command": "npx",
      "args": ["tsx", "<项目路径>/packages/cesium-mcp-runtime/src/index.ts"]
    }
  }
}
```

然后对 AI 说 "把地图飞到上海"，AI 会通过 MCP 调用 `flyTo` 工具，命令经 WebSocket 推送到浏览器，地图自动飞过去。

## 工作原理

```
AI Agent                           Runtime (port 9100)            浏览器
   │                                  │                             │
   │── MCP Tool: flyTo ──────────────>│                             │
   │                                  │── WebSocket JSON-RPC ─────>│
   │                                  │                             │── bridge.execute('flyTo')
   │                                  │                             │── Cesium 相机飞行
   │                                  │<── { success: true } ──────│
   │<── Tool Result ─────────────────│                             │
```

## 无 Runtime 模式

如果不启动 Runtime，页面仍可独立使用：
- 手动点击按钮测试 Bridge 命令
- WebSocket 显示"未连接"，5 秒后自动重试
- 所有本地命令（flyTo / screenshot / getView 等）正常工作
