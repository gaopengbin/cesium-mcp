# Which Mode Should I Use?

cesium-mcp gives you **three ways to wire AI into CesiumJS**, all sharing the same `cesium-mcp-bridge` core (60+ tools). This page picks one for you in 30 seconds.

## Decision tree

```
What are you trying to do?
│
├─ Just want to try it / personal demo / no backend
│   └─→ Path 0: Browser Agent (recommended)
│
├─ Embedding an AI assistant into an existing web app
│   ├─ Want full control over prompts, model, tool-call logs
│   │   └─→ Path 1: function calling (recommended)
│   └─ Want to reuse existing MCP client tooling
│       └─→ Path 2: MCP runtime + HTTP transport
│
└─ Calling Cesium from Claude Desktop / Cursor / Dify
    └─→ Path 2: MCP runtime (stdio transport)
```

## Side-by-side

| Aspect | Path 0: Browser Agent | Path 1: function calling | Path 2: MCP runtime |
|---|---|---|---|
| **Backend** | Static host only | None | Node.js process |
| **AI model** | Any OpenAI-compatible API | Any OpenAI / Anthropic / local | Decided by MCP client |
| **API key exposure** | Browser, needs proxy | Browser, needs proxy | Managed by MCP client |
| **First-deploy cost** | Lowest (fork + paste key) | Medium (write agent loop) | Medium-high (install client + stdio config) |
| **Visibility into AI calls** | Full | Full | Depends on MCP client |
| **Typical use** | Personal projects, POC, teaching demos | Existing product gaining AI | Productivity tools with Claude / Cursor |
| **Example** | [examples/browser-agent](../../examples/browser-agent/) | The agent loop in examples/browser-agent | [packages/cesium-mcp-runtime](../../packages/cesium-mcp-runtime/) |

## Why not just MCP?

MCP solves "how does an AI client discover and call external capabilities". But when **Cesium itself runs in the browser**, the model can hit the bridge through plain function calling — one less IPC layer, one less protocol wrapper, easier to debug.

The bridge is designed protocol-agnostic on purpose: wrap it in MCP, or just import it. Whatever fits.

## Path details

### Path 0: Browser Agent

See [examples/browser-agent](../../examples/browser-agent/) or try the [live demo](https://cesium-browser-agent.pages.dev/).

Good for:
- Solo developers wanting a quick taste of "AI + Cesium"
- Teaching, demos, blog companion projects
- Zero server — deploys to Cloudflare Pages / Vercel / GitHub Pages

### Path 1: function calling embed

Use the bridge as a regular browser SDK:

```js
import { CesiumBridge } from 'cesium-mcp-bridge';

const bridge = new CesiumBridge(viewer);
const tools = bridge.getToolsSchema('openai'); // tool schemas

const response = await yourLLM.chat({ messages, tools });

for (const call of response.tool_calls ?? []) {
  await bridge.execute(call.name, call.params);
}
```

Good for:
- Existing Cesium product adding an AI assistant
- Teams that want custom prompt engineering or tool selection
- Using non-OpenAI models (DeepSeek, Zhipu, Qwen, etc.)

### Path 2: MCP runtime

```bash
npx cesium-mcp-runtime           # stdio
npx cesium-mcp-runtime --transport http --port 3000  # HTTP
```

Good for:
- Claude Desktop / Cursor / VS Code with MCP support
- Workflow platforms like Dify / n8n
- Exposing Cesium to third-party AI apps

## Still unsure?

Pick **Path 0**. Zero cost, runs in 10 minutes — once it's running you'll know what you actually want.
