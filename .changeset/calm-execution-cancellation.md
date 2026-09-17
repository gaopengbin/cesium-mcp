---
"cesium-mcp-bridge": patch
"cesium-mcp-webmcp": minor
---

Forward WebMCP execution signals through Bridge executors. Cancel pending camera and screenshot work, prevent cancelled layer and terrain loads from attaching late, and release late disposable resources. Terrain commands now await completion and report failures. Viewer registrations drain in-flight calls on unregister; use dispose() to cancel work before destroying the Viewer.
