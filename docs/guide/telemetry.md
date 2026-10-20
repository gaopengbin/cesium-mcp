# Usage statistics

Executable Cesium MCP packages collect limited usage statistics **by default**. The CLI writes a disclosure to **stderr** before requesting an installation ID or sending data; browser integrations show it in the developer console. Importing a package alone does not send anything. There is no install/postinstall tracking.

## Turn statistics off

Set `CESIUM_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1` in the environment that starts the Runtime or Dev server. These variables must be included in the MCP client's server environment when the server is launched by an IDE. Runtime and Dev also accept `--no-telemetry`.

```json
{
  "env": { "CESIUM_TELEMETRY_DISABLED": "1" }
}
```

For browser applications, set this **before** creating the Bridge or registering WebMCP:

```js
globalThis.CESIUM_MCP_TELEMETRY_DISABLED = true
```

Or disable a particular integration:

```js
const bridge = new CesiumBridge(viewer, { telemetry: false })
await registerCesiumWebMcp(executor, { telemetry: false })
await registerCesiumViewerWebMcp(viewer, { telemetry: false })
```

Browser Do Not Track and Global Privacy Control are respected. Node CI environments and `NODE_ENV=test` are excluded. When disabled before use, no ID is read/created and no delivery timer or request is created. Disabling the global switch after use discards queued counters at delivery; it cannot undo a request already sent. Existing local IDs remain until you delete them.

## What is sent

The fixed schema contains a random installation ID, a random batch ID, product (`runtime`, `dev`, `bridge`, `webmcp`), package version, OS family (`win32`, `darwin`, `linux`, `browser`, `other`), and aggregate counters. Counters contain only a known event/tool name, success/failure, a coarse latency bucket, and count. Unknown tool names are discarded.

Prompt text, tool arguments/results, coordinates, GeoJSON, asset IDs, data URLs, file paths, account IDs, tokens and raw error messages are not event fields. The collector rejects extra fields. Application code does not read or store IP addresses; Cloudflare handles network traffic and may process request metadata under its own infrastructure policies.

The destination is `https://cesium-browser-agent.pages.dev/api/package-telemetry`. Node IDs are stored under `%LOCALAPPDATA%/cesium-mcp/telemetry-id`, or `$XDG_STATE_HOME/cesium-mcp/telemetry-id`, falling back to `~/.local/state/cesium-mcp/telemetry-id`. Browser IDs use the current origin's `localStorage` key `cesium-mcp.telemetry-id`; unavailable storage produces a page-lifetime random ID. IDs are not machine fingerprints or user accounts. The collector persists a SHA-256 hash rather than the raw installation ID.

Delivery is best effort: the first batch is scheduled after one second, later counters are aggregated for up to one minute, with at most 32 counter groups per batch and a two-second network timeout. Requests omit credentials and referrers and reject redirects. Failures drop that batch and do not affect tools. Processes/pages that close early, blocked requests, and disabled clients are not represented.

## Coverage and interpretation

- Runtime: successful server startup, browser/App connection, and registered command completions. App transport polling is excluded. Its built-in map does not also report as a Bridge installation.
- Dev: CLI startup and its three tool handlers.
- Bridge: construction and `execute()` command completions. Direct typed method calls are not individually measured.
- WebMCP: successful `registerCesiumWebMcp` / `registerCesiumViewerWebMcp` registration and executor calls. Low-level pure builders and the contracts package do not report. The Viewer convenience API disables the extra Bridge reporter.

An existing app using its own Bridge plus WebMCP should set the underlying Bridge's `telemetry: false` if WebMCP owns its counters. Different products, browser origins, and server installations must not be added together as unique people. A shared server is one installation; a user with multiple machines may be several. Public client reports can be forged. These are observed installation metrics, not verified users or complete retention measurements.

## Collector operations

Before publishing telemetry-enabled clients, deploy the new browser-agent Worker route and apply `examples/browser-agent/package-telemetry.sql` to its existing D1 binding. This creates separate `npm_usage*` tables and does not migrate chat/AI usage. Configure a private `TELEMETRY_ADMIN_TOKEN` as a Worker secret. Do not publish a secret in the clients.

POST accepts at most 16 KiB and validates every field. Duplicate batch IDs are ignored and one installation is limited to 2,000 submissions per UTC day. GET requires the administrator bearer token and returns only aggregate products, active installations, tool counts/failures, versions/platforms, daily activity, and returning active installations across the last two seven-day windows. There is no public list of installation IDs. Reports span 7, 30 or 90 days; rows older than 90 UTC dates are removed on the next accepted submission, not by a scheduled deletion job.

Set `CESIUM_TELEMETRY_ADMIN_TOKEN` locally and run `node scripts/read-package-telemetry.mjs --days 30` to read aggregates. For local testing or self-hosting, Node supports `CESIUM_TELEMETRY_ENDPOINT` and browser options support `telemetry: { endpoint }`. HTTPS and loopback HTTP are accepted; URLs with credentials, query strings or fragments disable reporting rather than silently falling back elsewhere.

The npm download API, these runtime counters, GitHub traffic and browser chat inference usage remain separate sources. A missing/failed collector response is unavailable data, not zero users.
