# cesium-mcp-contracts

## 0.8.0

### Minor Changes

- Add vector 3D Tiles and native MVT loading, metadata from clicked managed features, and expression-based layer styling including line widths. Share selection across browser and MCP Apps integrations, clear stale selection during layer lifecycle changes, and declare configurable custom data origins for map panels.

  Require CesiumJS 1.145 and support vector draping on terrain, 3D Tiles or both. Bound excessive MVT tile hierarchies, preserve existing layers on failed replacement, return applied styles with layer schemas, and preserve expressions during partial updates. Report failed browser commands as MCP errors so agents can correct their arguments. Accept Codex turns that complete after reconnect notifications and use an ephemeral HTTPS provider for the local preview.

### Patch Changes

- Add an interactive MCP Apps map resource and openCesiumMap tool with OpenAI global/thread entrypoint metadata. Map controls use existing MCP tools with isolated browser sessions; camera state, layers and selected-object properties flow back through model context, and selections can be sent to the conversation. Include a local preview host with a separate map origin for Cesium workers.

  Replace place-only search with a context-aware conversation composer. Native Apps send messages to the host conversation; local preview uses the signed-in Codex CLI for follow-up questions and real map tool execution, with visible replies and cancellation. Add polygon extrusion-height editing, including GeoJSON data-source entities, to the canonical updateEntity contract and Bridge.

  Preserve explicit browser sessions across parameterless Runtime handlers and omit absent optional layer and entity mutation fields so inline GeoJSON, updateEntity and removeEntity results satisfy their output contracts.

  Include a standalone local development plugin with bundled Runtime dependencies, map operation guidance and a repo marketplace.

  Carry embedded-map commands through app-only MCP exchanges, bundle Cesium workers for Blob startup, and version the UI resource to invalidate the earlier WebSocket-based page. This supports desktop sandbox policies that block local WebSockets and external Worker entry scripts. Preserve session discovery through secondary Runtime relays.

  Replace location-only starter cards with runnable GeoJSON choropleth, batch extruded-building and weighted-heatmap demos. Track demo-owned resources for safe switching and removal, expose their IDs in model context, and send analysis requests through the host conversation. Add an optional GeoJSON flyTo flag so multi-step workflows can control the final camera without competing automatic flights.

  Move the map defaults and demos to the United States. Add San Francisco hexagon styling, a more detailed Manhattan planning scene and Los Angeles heatmap overlays. Use genuine live Viewer screenshots as bundled card covers, with capture provenance and build-time hash checks to keep the images in sync with demo plans.

## 0.7.0

### Minor Changes

- [#53](https://github.com/gaopengbin/cesium-mcp/pull/53) [`298232d`](https://github.com/gaopengbin/cesium-mcp/commit/298232d626012bc597d07146be0e545c024d0c05) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Separate model-facing tool names from stable browser Bridge actions across the canonical contracts, MCP Runtime, WebMCP, and browser function-calling adapter. Existing public tool names and actions remain unchanged. Add a bilingual 61-tool naming audit and a compatibility-first migration policy for future naming improvements.

- [#53](https://github.com/gaopengbin/cesium-mcp/pull/53) [`298232d`](https://github.com/gaopengbin/cesium-mcp/commit/298232d626012bc597d07146be0e545c024d0c05) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Add session-scoped resource handles for storing GeoJSON and CZML once, then resolving `resourceId` across MCP, WebMCP, and the hosted function-calling agent.

## 0.6.1

### Patch Changes

- [#37](https://github.com/gaopengbin/cesium-mcp/pull/37) [`fc03921`](https://github.com/gaopengbin/cesium-mcp/commit/fc03921936689e3306aa26fa851a2220e48d8426) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Add `items` to every advertised input array schema for VS Code and other strict MCP clients while preserving tuple constraints through `prefixItems`.

## 0.6.0

### Minor Changes

- [`33daff9`](https://github.com/gaopengbin/cesium-mcp/commit/33daff93c32e74d5476dd8d9461b33bf3ad88139) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Close the canonical output-contract loop across Contracts, Bridge, and MCP Runtime. Shared tools now advertise their canonical output schemas, return MCP structured content alongside legacy text content, and validate browser execution results with an opt-out for custom integrations. Screenshot calls also preserve their PNG image content while exposing structured metadata.

## 0.5.0

### Minor Changes

- [`b2b9c92`](https://github.com/gaopengbin/cesium-mcp/commit/b2b9c92db6034e8ecb6c17f5a139ec6bf960bb30) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Add shared runtime input validation, per-command Bridge executor overrides, per-Viewer state isolation, and an idempotent Bridge lifecycle cleanup API.

## 0.4.0

### Minor Changes

- [`2c9bfd9`](https://github.com/gaopengbin/cesium-mcp/commit/2c9bfd958503cb6d6eedaecc694bc4ac497a80ea) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Use the shared JSON Schemas as the executable source for Runtime validation and defaults, align contract fields with Bridge support and CesiumJS 1.143 behavior, and expose the corrected schemas through WebMCP.

## 0.3.0

### Minor Changes

- [`e1f3eaf`](https://github.com/gaopengbin/cesium-mcp/commit/e1f3eaffc009284ea67da6de2cba39f0aa419b67) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Publish canonical tool titles, MCP behavior annotations, and complete English and Chinese descriptions and parameter hints from the shared contracts package. Runtime tool and toolset registration now consumes that metadata while keeping Runtime-only credential tools separate.

## 0.2.0

### Minor Changes

- [`d92a2bb`](https://github.com/gaopengbin/cesium-mcp/commit/d92a2bb0b7d55499174b596f9a41d7b92636f7ea) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Publish the canonical shared tool inventory and toolset definitions, re-export them from the WebMCP adapter, and derive the Runtime toolset manifest from those contracts while keeping credential and MCP discovery tools explicitly separated.
