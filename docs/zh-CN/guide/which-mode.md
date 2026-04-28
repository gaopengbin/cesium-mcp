# 我应该用哪种模式？

cesium-mcp 提供 **三种把 AI 接入 CesiumJS 的方式**，它们共享同一套底层（`cesium-mcp-bridge` + 60+ tool）。本页帮你 30 秒做出选择。

## 决策树

```
你想做什么？
│
├─ 只想最快试一下 / 个人 demo / 没有后端
│   └─→ 路径 0：Browser Agent（推荐）
│
├─ 已有 Web 应用，想嵌入一个 AI 助手
│   ├─ 想自己控制每一步（提示词、模型、工具调用日志）
│   │   └─→ 路径 1：function calling（推荐）
│   └─ 想直接复用 MCP 生态的客户端能力
│       └─→ 路径 2：MCP runtime + HTTP transport
│
└─ 想从 Claude Desktop / Cursor / Dify 调用 Cesium
    └─→ 路径 2：MCP runtime（stdio transport）
```

## 三种模式对比

| 维度 | 路径 0：Browser Agent | 路径 1：function calling | 路径 2：MCP runtime |
|---|---|---|---|
| **后端** | 不需要（只需一个静态 host） | 不需要 | 需要 Node.js 进程 |
| **AI 模型** | 任意 OpenAI 兼容 API | 任意 OpenAI / Anthropic / 国产模型 | 由 MCP 客户端决定（Claude / Cursor 自带） |
| **API key 暴露** | 在浏览器，需要代理 | 在浏览器，需要代理 | 由 MCP 客户端管理 |
| **首次部署成本** | 最低（fork + 填 key） | 中（要写 agent loop） | 中高（要装客户端 + 配 stdio） |
| **AI 调用链可见度** | 完全可见 | 完全可见 | 由 MCP 客户端决定 |
| **典型场景** | 个人项目、概念验证、教学 demo | 已有产品要加 AI 功能 | 配合 Claude / Cursor 做生产力工具 |
| **示例** | [examples/browser-agent](../../examples/browser-agent/) | examples/browser-agent 的 agent loop 部分 | [packages/cesium-mcp-runtime](../../packages/cesium-mcp-runtime/) |

## 为什么不只做 MCP？

MCP 协议解决的是 "AI 客户端如何发现和调用外部能力" 的问题，但当 **Cesium 本身就跑在浏览器里** 时，让模型直接通过浏览器侧的 function calling 调用 bridge 反而更简单——少一层进程间通信，少一层协议封装，调试也更容易。

bridge 把 60+ tool 设计成了协议无关的：你可以用 MCP 包装它，也可以直接 import 它。哪种合适用哪种。

## 路径详解

### 路径 0：Browser Agent

参考 [examples/browser-agent](../../examples/browser-agent/) 或直接体验 [在线 demo](https://cesium-browser-agent.pages.dev/)。

适合：
- 个人开发者想快速试一下 "AI + Cesium" 是什么感觉
- 教学、演示、博客配套项目
- 不需要服务器，能直接部署到 Cloudflare Pages / Vercel / GitHub Pages

### 路径 1：function calling 嵌入

把 bridge 当成一个普通的浏览器 SDK 用：

```js
import { CesiumBridge } from 'cesium-mcp-bridge';

const bridge = new CesiumBridge(viewer);
const tools = bridge.getToolsSchema('openai'); // 拿到工具 schema

// 把 tools 传给你的 LLM 调用
const response = await yourLLM.chat({ messages, tools });

// 路由模型的 tool call 回 bridge
for (const call of response.tool_calls ?? []) {
  await bridge.execute(call.name, call.params);
}
```

适合：
- 已经在用 Cesium 的产品想加 AI 助手
- 团队对 prompt 工程 / 工具选择有定制需求
- 想用国产模型（DeepSeek、智谱、Qwen 等）

### 路径 2：MCP runtime

```bash
npx cesium-mcp-runtime           # stdio
npx cesium-mcp-runtime --transport http --port 3000  # HTTP
```

适合：
- 用 Claude Desktop / Cursor / VS Code 这些已支持 MCP 的客户端
- 通过 Dify / n8n 等工作流编排平台调用
- 需要把 Cesium 能力暴露给非自家的 AI 应用

## 还在犹豫？

直接选 **路径 0**。零成本，10 分钟能跑起来，跑完之后你就知道自己实际想要什么了。
