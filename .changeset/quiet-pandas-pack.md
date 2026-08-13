---
'cesium-mcp-runtime': patch
---

Ship the browser Bridge bundle inside the Runtime npm package so the built-in Viewer no longer depends on an unpkg fallback. Add a clean-install E2E that packs and installs the public artifacts, opens the real Cesium Viewer, connects its WebSocket bridge, and verifies a camera command round trip.
