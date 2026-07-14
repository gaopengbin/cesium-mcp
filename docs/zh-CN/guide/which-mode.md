# 我应该用哪种模式？

cesium-mcp 提供 **四种接入路径**，它们共享同一套 Cesium 命令执行层。选择的关键是智能体在哪里运行，以及模型连接由谁管理。

## 决策树

```text
你想做什么？
│
├─ 让兼容的浏览器智能体调用当前页面里的工具
│   └─→ 路径 1：WebMCP
│
├─ 用现成聊天界面快速体验 AI + Cesium
│   └─→ 路径 2：在线 Browser Agent
│
├─ 在已有 Web 应用中嵌入自己的 AI 助手
│   └─→ 路径 3：Bridge + function calling
│
└─ 从 Claude Desktop、Cursor、VS Code、Dify 或 n8n 调用 Cesium
    └─→ 路径 4：MCP runtime
```

## 四种模式对比

| 维度 | WebMCP | 在线 Browser Agent | Function calling | MCP runtime |
|---|---|---|---|---|
| **智能体运行位置** | 兼容浏览器 | Web 应用 | 你的 Web 应用 | 桌面客户端或工作流平台 |
| **是否需要 MCP 服务** | 否 | 否 | 否 | 是 |
| **包是否要求模型** | 否 | 演示站提供 | 是，由应用管理 | 由 MCP 客户端管理 |
| **工具范围** | 15 个核心或 61 个浏览器安全工具 | 15 个聊天工具 + 61 个 WebMCP 工具 | 应用自行选择 | Runtime 工具集 |
| **最适合** | 面向智能体的网站 | 体验和演示 | 产品内 AI 助手 | 接入 MCP 生态 |
| **从这里开始** | [WebMCP 指南](/zh-CN/guide/webmcp) | [在线体验](https://cesium-browser-agent.pages.dev/) | [Browser Agent 源码](https://github.com/gaopengbin/cesium-mcp/tree/main/examples/browser-agent) | [快速开始](/zh-CN/guide/getting-started) |

## 路径 1：WebMCP

在页面中安装 `cesium-mcp-webmcp`，把工具注册到 `document.modelContext`。兼容的浏览器智能体可以发现并执行这些工具，不需要后端 MCP 服务。

适合以下场景：

- 希望网站本身向浏览器智能体暴露 Cesium 能力。
- 不希望每个用户都启动 `cesium-mcp-runtime`。
- 应用在不支持 WebMCP 的浏览器中仍然可以正常使用。

WebMCP 不提供 AI 模型或聊天界面。接入步骤见 [WebMCP 浏览器接入](/zh-CN/guide/webmcp)。

## 路径 2：在线 Browser Agent

打开 [Cesium Agent Lab](https://cesium-browser-agent.pages.dev/)，无需安装本地 MCP 服务即可体验自然语言控制地图。演示中的内置 AI 聊天和 WebMCP 工具注册是两个独立功能。

适合产品体验、教学、演示和参考部署。

## 路径 3：Bridge + function calling

使用 `cesium-mcp-bridge` 作为执行层，自行接入模型服务和 agent loop。

适合需要完全控制提示词、模型选择、身份认证、工具范围、日志和用量限制的产品。模型 API key 应放在你自己的服务端 `/api/chat` 接口后面，不要暴露在浏览器中。

## 路径 4：MCP runtime

```bash
npx cesium-mcp-runtime
npx cesium-mcp-runtime --transport http --port 3211
```

适合 Claude Desktop、Cursor、VS Code、Dify、n8n 或其他外部 MCP 客户端。这条路径会运行 Node.js MCP 服务，并通过 WebSocket 连接浏览器 Bridge。

## 还在犹豫？

先打开 [在线演示](https://cesium-browser-agent.pages.dev/) 体验。如果目标是让自己的网站可被浏览器智能体发现，继续阅读 [WebMCP 指南](/zh-CN/guide/webmcp)；如果需要外部 MCP 客户端控制地球，则使用 [MCP runtime](/zh-CN/guide/getting-started)。
