# cesium-mcp-telemetry

Shared, bounded usage counters for Cesium MCP Runtime, Dev, Bridge and WebMCP. Importing this module has no side effects. Executable integrations enable reporting by default and disclose it before identity or network access.

Set `CESIUM_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1` for Node applications. For browsers set `globalThis.CESIUM_MCP_TELEMETRY_DISABLED=true` before initialization, or pass `telemetry: false` to the integration. DNT/GPC and Node CI/test environments are respected.

Events contain random IDs, package/version, OS family and fixed aggregate counters. Tool parameters/results, prompts, map data, coordinates, URLs, accounts and tokens are excluded. This is observed installation activity, not unique people.

Destination, identity storage, retention, collector setup and all limitations: [Usage statistics](https://gaopengbin.github.io/cesium-mcp/guide/telemetry.html), [中文](https://gaopengbin.github.io/cesium-mcp/zh-CN/guide/telemetry.html).
