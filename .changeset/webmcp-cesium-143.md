---
'cesium-mcp-bridge': minor
'cesium-mcp-runtime': minor
'cesium-mcp-dev': minor
---

Add a transport-free WebMCP adapter for registering Cesium Bridge commands on
`document.modelContext`, wire it into the browser-agent example, and update the
tested CesiumJS baseline to 1.143. Refresh the MCP v1 SDK and WebSocket runtime
dependencies to patched versions.
