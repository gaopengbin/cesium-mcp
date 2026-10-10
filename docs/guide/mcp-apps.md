# MCP Apps map panel

The Runtime can serve a real Cesium Viewer inside an MCP Apps host. Call `openCesiumMap` to open the panel, then pass its returned `sessionId` to map tools such as `flyTo`, `addMarker`, and `addGeoJsonLayer`.

The panel uses the existing Bridge executor. App-only MCP tools exchange commands and results with the Runtime, so the embedded panel does not need browser access to a local WebSocket. External Viewer pages continue using WebSocket routing.

## Try the local preview

From the repository root:

```sh
npm ci
npm run build
npm run app:preview -w packages/cesium-mcp-runtime
```

Open **http://127.0.0.1:19311/**. The preview uses real Streamable HTTP MCP and the official MCP Apps `AppBridge`. Its theme and language controls simulate host context changes; the diagnostics record standard `ui/message` requests. The map app contains no conversation composer or history. In Codex, use the existing native chat for questions and follow-up replies. The host controls chat placement.

**Expand map**, **Back to scenes** and **Return to map** change layout without recreating the Viewer. Objects, selection, camera and session are retained. Escape restores the previous layout. Hosts advertising fullscreen support receive a standard display-mode request.

The scene picker contains three runnable US demos: 24 choropleth cells in San Francisco, 18 synthetic planning buildings in Manhattan, and 72 weighted events with four service sites and illustrative connections in Los Angeles. Covers are real screenshots of the scenes. Demo progress, legends and object details follow the host locale. Switching or clearing a demo removes only its own resources. **Analyze in Codex** and **Ask in Codex** send the map context to native host chat.

In native Codex chat, try “extrude the selected building to 300 meters”, “analyze this scene”, or “fly to San Francisco”. The app publishes the current view, layers and selected-object properties through `ui/update-model-context`. It never renders a second chat sidebar. Host theme, semantic CSS variables, fonts and locale are applied initially and through live host-context notifications. Missing host preferences fall back to system theme and browser language; Chinese locales use Chinese, and other locales use English. The map is not recreated when these preferences change. Narrow panels and reduced motion are supported.

The local preview records message delivery rather than impersonating native Codex chat. A developer-only `/chat` endpoint remains available for testing the signed-in CLI tool loop; it is not a product conversation interface. Local preview verification does not prove the running desktop has loaded the updated resource. Restart the plugin client before testing installed changes.

1. Use **Add marker** to create and select a New York marker through MCP.
2. Click **Ask in Codex** to send its properties and map session to the preview host.
3. Use **Locate San Francisco** in the preview header to verify commands from a separate host connection.
4. Open a second preview tab to verify that map sessions stay separate.
5. Close a map to release its Viewer, MCP session, listeners and timers.

The map starts over Manhattan with Esri satellite imagery and ellipsoid terrain; no Cesium ion token is required. Map tiles require network access to Esri; demo datasets and real screenshot covers are bundled. The build checks cover hashes and rejects stale screenshots after demo plans change. Cesium 1.143 JavaScript, its Worker module graph and the Bridge are bundled into the HTML resource. Workers start from Blob URLs. Cesium styles and bootstrap assets load from `cesium.com`; the local preview serves those assets from the installed version.

| Preview service | Default port | Override |
| --- | --- | --- |
| Map WebSocket and Runtime API | 19310 | `CESIUM_WS_PORT` |
| Preview host | 19311 | `CESIUM_APP_PREVIEW_PORT` |
| Separate map sandbox and local Cesium assets | 19312 | `CESIUM_APP_SANDBOX_PORT` |
| Runtime MCP HTTP endpoint | 19410 | `MCP_HTTP_PORT` |

The preview and map sandbox listen on loopback. The sandbox uses a different origin from the host, blocks WebSocket connections and permits only Blob workers. Opaque UI origins are rejected with a visible explanation.

## Connect an MCP Apps host

### Install the local development plugin

The repository includes a standalone `Cesium Map` plugin with portable `plugin.json`, `mcp.json` and `skills/` components, exposed by `.agents/plugins/marketplace.json`.

Run at the repository root:

```sh
npm run build
npm run plugin:build
npm run plugin:check
codex plugin marketplace add .
codex plugin add cesium-map@cesium-local
```

The check copies the plugin to an independent temporary directory containing spaces, starts a real stdio MCP client, and reads its tools, map resource and browser Bridge. That directory has no `node_modules`. The plugin bundles Runtime production dependencies and needs only Node.js 22 or later on PATH to start after installation.

The plugin uses WebSocket/built-in Viewer port **19320**, separate from preview port 19310. Start a new chat after installation to load its tools and skill. Restart the desktop app if its plugin directory has not refreshed. Use `openCesiumMap` in an MCP Apps host; clients with tools only can use **http://127.0.0.1:19320/** and target the Viewer found by `listSessions`.

After editing, rerun `npm run plugin:build` and `codex plugin add cesium-map@cesium-local`, then check the installed cache. Installation, stdio, resource loading and map commands can be verified independently; each client's native global/thread placement needs its own acceptance test.

This is a local development package. ChatGPT web developer-mode connections need a reachable HTTPS MCP endpoint. Local installation does not publish a plugin to the public directory. See the [OpenAI packaging guide](https://developers.openai.com/plugins/build/plugins) and [connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

### Configure an MCP server manually

Build the repository, then configure your local MCP Apps host to run the existing Runtime CLI:

```json
{
  "mcpServers": {
    "cesium": {
      "command": "node",
      "args": ["/absolute/path/to/cesium-mcp/packages/cesium-mcp-runtime/dist/cli.js"],
      "env": {
        "CESIUM_TOOLSETS": "view,entity,layer,interaction"
      }
    }
  }
}
```

Call `openCesiumMap`, wait for the panel's connected context, and use that context's `sessionId` in subsequent tool calls. Each new open call creates a new map session. Supplying an existing `sessionId` reopens that session; it replaces its earlier browser connection.

The `ui://cesium-mcp/map-v10.html` resource uses `text/html;profile=mcp-app`. Tool metadata declares standard `_meta.ui.resourceUri` and OpenAI `_meta["openai/ui"].entrypoints` for global and thread panels. Entry placement depends on the client's support. A versioned resource URI prevents hosts from reusing older map HTML.

## Network and host requirements

The host must support MCP Apps, WebGL, module workers, WebAssembly compilation, `tools/call`, and model context updates. The preview CSP permits `wasm-unsafe-eval` for Cesium's decoders while blocking JavaScript eval. The bundle replaces the legacy Knockout wrapper's global lookup with `globalThis`; the panel uses its own selection UI rather than Knockout HTML bindings. Sending an object also requires the host's message capability; the button stays disabled if unavailable.

The embedded map connects using `connectCesiumMap`, `exchangeCesiumMap` and `disconnectCesiumMap`, which are visible only to the app. Connection tokens isolate results and invalidate replaced panels. Exchanges wait up to one second for commands; a missing heartbeat expires the session after 60 seconds. Connection failures produce a visible error within ten seconds. These calls use the host's existing MCP connection. Remote MCP deployment still requires its own authentication and session authorization.

If the process owning the shared local port stops, a relay instance takes over the port when the next request fails. Existing maps reconnect their missing sessions and keep their current view. A replaced session with an invalid token stops instead of taking over another panel. Agent commands are never replayed automatically during recovery because they may already have executed. Run `npm run plugin:check-relay` after building to verify recovery using two real MCP processes.

Set `CESIUM_APP_DOMAIN` when the host needs a dedicated UI origin. It accepts an HTTPS origin, or loopback HTTP for development, and is returned as `_meta.ui.domain`. The host provides and isolates that origin; this value does not host the HTML itself. ChatGPT's documented default is `https://web-sandbox.oaiusercontent.com`.

The resource declares the Cesium CDN, exact origins for the built-in Esri, CARTO, OSM, Tianditu and Amap basemaps, and Blob resources in its network policy. Hosts must allow Blob module workers. The bundled Worker graph avoids external imports during startup. See the [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx) and [OpenAI UI metadata reference](https://developers.openai.com/plugins/reference).

Inline GeoJSON can use the existing tools. Remote layer URLs and Cesium ion assets require their provider origins to be allowed by the host's resource policy; custom service origins still need an explicit policy update.

## Current scope

Implemented: the interactive map, standard MCP Apps resource, global/thread entrypoint hints, explicit session routing, camera/layer/selection context, object messages, connection timeout and teardown.

File viewers, composer mentions, settings pages and deep links are separate extensions. They are not declared by this version. Local browser and MCP tests do not establish availability or successful installation in a particular ChatGPT account.
