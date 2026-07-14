---
'cesium-mcp-bridge': minor
'cesium-mcp-runtime': minor
'cesium-mcp-dev': minor
---

Add transport-neutral Cesium tool contracts and a separate native WebMCP
adapter package, then wire both into the browser-agent example without coupling
WebMCP to the Cesium execution bridge or backend runtime. Provide 61 browser-safe
contracts across 12 selectable WebMCP toolsets while keeping a 15-tool core mode.
Update the tested
CesiumJS baseline to 1.143 and refresh the MCP v1 SDK and WebSocket runtime
dependencies to patched versions.
