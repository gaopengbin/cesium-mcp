# Which Mode Should I Use?

cesium-mcp offers **four integration paths** that share the same Cesium command layer. Choose based on where the agent runs and who owns the model connection.

## Decision tree

```text
What are you trying to do?
│
├─ Let a compatible browser agent use tools from the current page
│   └─→ Path 1: WebMCP
│
├─ Try AI + Cesium quickly with a ready-made chat UI
│   └─→ Path 2: Hosted Browser Agent demo
│
├─ Embed your own AI assistant into an existing web app
│   └─→ Path 3: Bridge + function calling
│
└─ Call Cesium from Claude Desktop, Cursor, VS Code, Dify, or n8n
    └─→ Path 4: MCP runtime
```

## Side-by-side

| Aspect | WebMCP | Hosted Browser Agent | Function calling | MCP runtime |
|---|---|---|---|---|
| **Agent runs in** | Compatible browser | Web application | Your web application | Desktop client or workflow platform |
| **MCP service required** | No | No | No | Yes |
| **Model required by package** | No | Demo provides one | Yes, application-owned | MCP client-owned |
| **Tool surface** | 15 core or 61 browser-safe tools | 15 chat tools + 61 WebMCP tools | Application-selected | Runtime toolsets |
| **Best for** | Agent-ready websites | Evaluation and demonstrations | Product AI assistants | MCP ecosystem integration |
| **Start here** | [WebMCP guide](/guide/webmcp) | [Live demo](https://cesium-browser-agent.pages.dev/) | [Browser Agent source](https://github.com/gaopengbin/cesium-mcp/tree/main/examples/browser-agent) | [Getting Started](/guide/getting-started) |

## Path 1: WebMCP

Install `cesium-mcp-webmcp` in the page and register the tools on `document.modelContext`. A compatible browser agent discovers and executes them without a backend MCP server.

Choose this when:

- You want your website itself to expose Cesium capabilities to browser agents.
- You do not want to run `cesium-mcp-runtime` for each user.
- Your application will remain useful in browsers without WebMCP support.

WebMCP does not provide an AI model or chat interface. See the [WebMCP browser integration guide](/guide/webmcp).

## Path 2: Hosted Browser Agent

Try the [Cesium Agent Lab](https://cesium-browser-agent.pages.dev/) to experience natural-language map control without installing a local MCP service. Its built-in AI chat and WebMCP registration are independent features.

Choose this for product evaluation, teaching, demonstrations, and a reference deployment.

## Path 3: Bridge + function calling

Use `cesium-mcp-bridge` as the execution layer and connect it to the model provider and agent loop owned by your application.

Choose this when you need full control over prompts, model selection, authentication, tool selection, logs, and usage limits. Keep model API keys behind your own server-side `/api/chat` endpoint instead of exposing them in the browser.

## Path 4: MCP runtime

```bash
npx cesium-mcp-runtime
npx cesium-mcp-runtime --transport http --port 3211
```

Choose this for Claude Desktop, Cursor, VS Code, Dify, n8n, or any external MCP client. This path runs a Node.js MCP service and connects to the browser bridge over WebSocket.

## Still unsure?

Try the [hosted demo](https://cesium-browser-agent.pages.dev/) first. If your goal is to make your own website discoverable to browser agents, continue with [WebMCP](/guide/webmcp). If an external MCP client must control the globe, use the [MCP runtime](/guide/getting-started).
