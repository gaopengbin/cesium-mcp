# CesiumJS AI Agent — Browser Only Demo

A minimal demo showing how to control CesiumJS with natural language without a backend MCP server. The browser-side agent loop uses OpenAI's function calling to map user intent to CesiumJS operations via [cesium-mcp-bridge](../../packages/cesium-mcp-bridge). On browsers with WebMCP support, [cesium-mcp-webmcp](../../packages/cesium-mcp-webmcp) registers the shared contracts from [cesium-mcp-contracts](../../packages/cesium-mcp-contracts) on `document.modelContext`.

**[Live Demo](https://cesium-browser-agent.pages.dev/)** — open it, click Start, type "fly to Tokyo". Self-host steps below.

## Architecture

```
User Input → Chat UI → fetch('/api/chat') → Cloudflare Pages Worker
                                                  ↓
                                   Workers AI GLM-4.7-Flash (with CesiumJS tool schemas)
                                                  ↓ tool_calls / text
                                             Response → Browser
                                                  ↓
                                  tool_calls → bridge.execute() → CesiumJS Viewer
                                  text → display in chat
                                  (loop until no more tool_calls)
```

**Key insight**: The Pages Worker invokes Cloudflare Workers AI through a server-side binding, so visitors do not provide or receive a model API key. All agent logic — tool definitions, message history, and tool-call execution — runs in the browser. No backend MCP transport is required.

The reusable core is `cesium-mcp-bridge`'s command dispatcher (`bridge.execute()`), which maps structured commands to CesiumJS API calls regardless of where they come from.

## WebMCP (Chrome 149+ Origin Trial)

When `document.modelContext` is available, the demo uses `registerCesiumWebMcp(..., { toolsets: 'all' })` to register all 61 browser-safe contracts across 12 toolsets. Registration happens before CesiumJS and the bridge runtime load, so WebMCP scanners and browser agents can discover the tools without waiting for 3D rendering. The adapter is Cesium-free; tools initialize the live viewer lazily when an operation needs it. The built-in chat independently routes each request to a relevant toolset bundle.

The registered surface includes structured result schemas, bounded geographic coordinates, typed GeoJSON FeatureCollections, and explicit label and layer style objects from `cesium-mcp-contracts`, so the built-in agent and WebMCP surface do not maintain separate schemas.

Tool registration runs before CesiumJS and WebGL initialization. This keeps the tools discoverable to remote scanners and headless agents even when rendering the globe is slow or unavailable; tool execution waits for the viewer when it needs map state.

The status bar directly below the header reports whether WebMCP is waiting for the viewer, unavailable, registering, or ready. Expand it for a three-step Chrome testing guide. The built-in chat remains the progressive fallback when WebMCP is unavailable.

To test it:

1. Enable `chrome://flags/#enable-webmcp-testing` for local development. Enable `chrome://flags/#devtools-webmcp-support` to use the DevTools Application panel.
2. Serve this example over HTTPS or localhost.
3. Open the page and confirm the status reads **WebMCP ready — 61 page tools registered**.
4. Inspect and execute the tools with the Model Context Tool Inspector or DevTools → Application → WebMCP.

Unsupported browsers simply skip registration and continue using the built-in function-calling agent.

## Tool Surfaces

The WebMCP surface exposes 61 tools in the `view`, `entity`, `layer`, `camera`, `entity-ext`, `animation`, `scene`, `tiles`, `interaction`, `trajectory`, `heatmap`, and `geolocation` toolsets. `setIonToken` is intentionally application-owned and is not exposed to page agents.

The built-in chat defaults to automatic routing. It matches English and Chinese intent to a task bundle, for example:

| Request | Routed toolsets | Tools sent |
|---------|-----------------|------------|
| Load 3D Tiles, terrain, imagery, CZML, or KML | `tiles`, `view`, `interaction`, `geolocation` | 19 |
| Add or style GeoJSON layers | `layer`, `view`, `geolocation` | 18 |
| Create time-dynamic entities | `animation`, `entity`, `geolocation` | 19 |
| Add markers, models, or shapes | `entity`, `view`, `geolocation` | 19 |

The selector above the prompt also offers the 15-tool core set, each individual toolset, and an advanced all-61 mode. WebMCP registration always remains all 61 regardless of this chat selection.

## HTTPS asset proxy

The hosted page is HTTPS, so browsers block HTTP tilesets as mixed content. The Pages Worker exposes a path-preserving proxy for explicitly approved sources:

```text
http://jojo1986.cn:8888/data/.../tileset.json
→ https://cesium-browser-agent.pages.dev/api/assets/jojo/data/.../tileset.json
```

Both the built-in chat and WebMCP execution path apply this rewrite automatically for `load3dTiles` and `load3dGaussianSplat`. Relative child tile URLs continue through the same proxy path. The Worker allows only `GET`, `HEAD`, and `OPTIONS`, forwards range and cache validators, blocks redirects and path traversal, and never accepts an arbitrary target URL.

Add new sources only by extending the matching allowlists in `_worker.js` and `index.html`. A public `?url=` proxy would create an SSRF and bandwidth-abuse risk.

## Run Locally

### Prerequisites

- Node.js 22+
- A Cloudflare account with Workers AI access
- (Optional) A [Cesium Ion token](https://ion.cesium.com/tokens)

### Option A: Cloudflare Wrangler (recommended)

```bash
cd examples/browser-agent
npx wrangler pages dev .
```

Open `http://localhost:8788`. The included `wrangler.toml` handles the rest.

> First run will download `wrangler` (~30s). Subsequent runs are instant.

## Deploy to Cloudflare Pages

1. Create a Cloudflare Pages project pointing to the `examples/browser-agent` directory.
2. Apply `schema.sql` to the configured D1 database.
3. Deploy with Wrangler so the `AI` and `RATE_LIMIT_DB` bindings in `wrangler.toml` are applied.
4. Register the final HTTPS origin in the Chrome WebMCP Origin Trial.
5. Set the returned public token as `WEBMCP_ORIGIN_TRIAL_TOKEN` in the Pages project settings.

```bash
npx wrangler d1 execute cesium-browser-agent-rate-limit --remote --file schema.sql
```

The advanced-mode `_worker.js` handles `/api/chat`, invokes the fixed `@cf/zai-org/glm-4.7-flash` model, validates request size and shape, restricts browser origins, and applies a per-client D1-backed rate limit. Client addresses are SHA-256 hashed before storage. `/api/usage` exposes only aggregate daily estimates; no client identifiers are returned.

The worker reserves part of Cloudflare's daily free allocation with a 9,000-neuron safety budget. At 70% it shows a warning, at 85% it reduces history and completion size, and at 100% it pauses the hosted AI while leaving all WebMCP page tools available. Set `AI_DAILY_NEURON_BUDGET` to a smaller positive value when a fork needs a tighter cap. Estimates use the current GLM-4.7-Flash input/output rates and should be compared with the Cloudflare dashboard for billing decisions.

Static assets are served with `Origin-Agent-Cluster: ?1` and, when configured, the `Origin-Trial` header. Forks must register their own exact origin; do not reuse a token issued for another domain.

## How It Works

1. **Browser registers** WebMCP tools without loading the 3D runtime
2. **First user interaction or map tool call** loads CesiumJS + cesium-mcp-bridge (IIFE bundle)
3. **User types** a message (e.g., "fly to the Eiffel Tower and add a red marker")
4. **Browser sends** message history to `/api/chat` (Pages Worker)
5. **Pages Worker** invokes Workers AI with the tool schemas
6. **Workers AI returns** tool calls (e.g., `geocode("Eiffel Tower")` → `flyTo(48.86, 2.29)` → `addMarker(...)`)
7. **Browser executes** each tool call via `bridge.execute()` on the live CesiumJS viewer
8. **Browser sends** tool results back to Workers AI for the next step
9. **Loop continues** until OpenAI returns a text response (no more tool calls)
10. **AI's text** is displayed in the chat

## Why Not a Backend MCP Server?

MCP (Model Context Protocol) solves **cross-process tool discovery** — it lets a generic host (Claude Desktop, Cursor) discover and use tools it doesn't know about. But in a browser app, the app **already knows its tools**. The tool schemas are defined inline, and execution happens in the same process. MCP's transport layer adds no value here.

The browser-only pattern uses tool schemas as the capability declaration and the command dispatcher as the execution layer. WebMCP can expose those same page-local tools to a compatible browser agent without adding a server-side transport.
