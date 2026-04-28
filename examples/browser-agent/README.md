# CesiumJS AI Agent — Browser Only Demo

A minimal demo showing how to control CesiumJS with natural language **without MCP**. The browser-side agent loop uses OpenAI's function calling to map user intent to CesiumJS operations via [cesium-mcp-bridge](../../packages/cesium-mcp-bridge).

**[Live Demo](https://cesium-browser-agent.pages.dev/)** · **[Deploy your own](https://deploy.workers.cloudflare.com/?url=https://github.com/gaopengbin/cesium-mcp/tree/main/examples/browser-agent)**

## Architecture

```
User Input → Chat UI → fetch('/api/chat') → Cloudflare Pages Function (API key proxy)
                                                  ↓
                                             OpenAI gpt-4o-mini (with 15 CesiumJS tool schemas)
                                                  ↓ tool_calls / text
                                             Response → Browser
                                                  ↓
                                  tool_calls → bridge.execute() → CesiumJS Viewer
                                  text → display in chat
                                  (loop until no more tool_calls)
```

**Key insight**: The Pages Function is a stateless API key proxy (< 70 lines). All agent logic — tool definitions, message history, tool call execution — runs entirely in the browser. **No MCP protocol is involved.**

The reusable core is `cesium-mcp-bridge`'s command dispatcher (`bridge.execute()`), which maps structured commands to CesiumJS API calls regardless of where they come from.

## Available Tools (15)

| Category | Tools |
|----------|-------|
| Camera | `flyTo`, `setView`, `getView` |
| Entities | `addMarker`, `addPolyline`, `addPolygon`, `addLabel` |
| Layers | `addGeoJsonLayer`, `setBasemap` |
| Cleanup | `removeEntity`, `clearAll` |
| Utility | `geocode`, `highlight`, `measure`, `screenshot` |

## Run Locally

### Prerequisites

- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- (Optional) A [Cesium Ion token](https://ion.cesium.com/tokens)

### Option A: Cloudflare Wrangler (recommended)

```bash
cd examples/browser-agent
cp .dev.vars.example .dev.vars   # then edit .dev.vars and put in your key
npx wrangler pages dev .
```

Open `http://localhost:8788`. The included `wrangler.toml` handles the rest.

### Option B: Direct API key in browser

1. Serve the directory with any static server:
   ```bash
   cd examples/browser-agent
   npx serve .
   ```
2. In the Setup dialog, enter your OpenAI API key directly.
   
   > Note: This calls OpenAI's API from the browser. Works for local dev but not recommended for production (key exposure + CORS).

## Deploy to Cloudflare Pages

1. Create a Cloudflare Pages project pointing to the `examples/browser-agent` directory.
2. Set the environment variable `OPENAI_API_KEY` in the Pages project settings.
3. Deploy.

The `functions/api/chat.js` file is automatically detected as a Pages Function.

## Telemetry

The Pages Function emits one structured `console.log` per request with **no PII and no message content** — only `{ event, model, msgCount, toolCount, lastRole, ts }`. Tail it with:

```bash
npx wrangler pages deployment tail
```

Remove the `console.log(...)` block in `functions/api/chat.js` if you don't want it.

## How It Works

1. **Browser loads** CesiumJS + cesium-mcp-bridge (IIFE bundle)
2. **User types** a message (e.g., "fly to the Eiffel Tower and add a red marker")
3. **Browser sends** message history to `/api/chat` (Pages Function)
4. **Pages Function** proxies to OpenAI with the 15 tool schemas
5. **OpenAI returns** tool calls (e.g., `geocode("Eiffel Tower")` → `flyTo(48.86, 2.29)` → `addMarker(...)`)
6. **Browser executes** each tool call via `bridge.execute()` on the live CesiumJS viewer
7. **Browser sends** tool results back to OpenAI for the next step
8. **Loop continues** until OpenAI returns a text response (no more tool calls)
9. **AI's text** is displayed in the chat

## Why Not MCP?

MCP (Model Context Protocol) solves **cross-process tool discovery** — it lets a generic host (Claude Desktop, Cursor) discover and use tools it doesn't know about. But in a browser app, the app **already knows its tools**. The tool schemas are defined inline, and execution happens in the same process. MCP's transport layer adds no value here.

The browser-only pattern is: **LLM function calling IS the protocol.** Tool schemas are the capability declaration. The command dispatcher is the execution layer. No intermediary needed.
