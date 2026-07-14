# CesiumJS AI Agent — Browser Only Demo

A minimal demo showing how to control CesiumJS with natural language without a backend MCP server. The browser-side agent loop uses OpenAI's function calling to map user intent to CesiumJS operations via [cesium-mcp-bridge](../../packages/cesium-mcp-bridge). On browsers with WebMCP support, the same tools are also registered on `document.modelContext` for browser agents.

**[Live Demo](https://cesium-browser-agent.pages.dev/)** — open it, click Start, type "fly to Tokyo". Self-host steps below.

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

**Key insight**: The Pages Function is a stateless API key proxy (< 70 lines). All agent logic — tool definitions, message history, tool call execution — runs entirely in the browser. No backend MCP transport is required.

The reusable core is `cesium-mcp-bridge`'s command dispatcher (`bridge.execute()`), which maps structured commands to CesiumJS API calls regardless of where they come from.

## WebMCP (Chrome 149+ Origin Trial)

When `document.modelContext` is available, the demo automatically registers all 15 tools through `registerWebMcpTools()`. This lets a WebMCP-capable browser agent control the same live Cesium viewer while the built-in chat remains available.

The status bar directly below the header reports whether WebMCP is waiting for the viewer, unavailable, registering, or ready. Expand it for a three-step Chrome testing guide. The built-in chat remains the progressive fallback when WebMCP is unavailable.

To test it:

1. Enable `chrome://flags/#enable-webmcp-testing` for local development. Enable `chrome://flags/#devtools-webmcp-support` to use the DevTools Application panel.
2. Serve this example over HTTPS or localhost.
3. Start the viewer and confirm the status reads **WebMCP ready — 15 page tools registered**.
4. Inspect and execute the tools with the Model Context Tool Inspector or DevTools → Application → WebMCP.

Unsupported browsers simply skip registration and continue using the built-in function-calling agent.

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

- Node.js 22+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- (Optional) A [Cesium Ion token](https://ion.cesium.com/tokens)

### Option A: Cloudflare Wrangler (recommended)

```bash
cd examples/browser-agent
cp .dev.vars.example .dev.vars   # then edit .dev.vars and put in your key
npx wrangler pages dev .
```

Open `http://localhost:8788`. The included `wrangler.toml` handles the rest.

> First run will download `wrangler` (~30s). Subsequent runs are instant.

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
3. Register the final HTTPS origin in the Chrome WebMCP Origin Trial.
4. Set the returned public token as `WEBMCP_ORIGIN_TRIAL_TOKEN` in the Pages project settings.
5. Deploy.

The `functions/api/chat.js` file is automatically detected as a Pages Function. The root middleware adds `Origin-Agent-Cluster: ?1` and, when configured, the `Origin-Trial` header. Forks must register their own exact origin; do not reuse a token issued for another domain.

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

## Why Not a Backend MCP Server?

MCP (Model Context Protocol) solves **cross-process tool discovery** — it lets a generic host (Claude Desktop, Cursor) discover and use tools it doesn't know about. But in a browser app, the app **already knows its tools**. The tool schemas are defined inline, and execution happens in the same process. MCP's transport layer adds no value here.

The browser-only pattern uses tool schemas as the capability declaration and the command dispatcher as the execution layer. WebMCP can expose those same page-local tools to a compatible browser agent without adding a server-side transport.
