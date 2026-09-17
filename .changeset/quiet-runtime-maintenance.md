---
'cesium-mcp-bridge': patch
'cesium-mcp-runtime': patch
---

Omit absent optional layer references from tool results, including the fix from PR #45. Rebuild the browser Bridge bundled with Runtime.

Default Runtime to loopback networking. Add configurable exact host/origin allowlists and token authentication for network clients, with authenticated WebSocket connections and local relay support.

Refresh compatible dependency versions for the Runtime HTTP adapter and Cesium HTML sanitization.
