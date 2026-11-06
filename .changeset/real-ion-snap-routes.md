---
"cesium-mcp-bridge": patch
"cesium-mcp-runtime": patch
---

Fix precise BIM snapping to use the live ion unversioned /assets/{id}/ecef and /assets/{id}/elements/{hexId}/snap routes, while keeping element queries and model trees under /v1/assets. This difference was found by real read-only acceptance on the official public Snowdon Towers RVT/IFC assets, not synthetic fixtures. Add an opt-in live MCP/browser acceptance runner and regression checks that distinguish both route families. No account assets are created or modified.
