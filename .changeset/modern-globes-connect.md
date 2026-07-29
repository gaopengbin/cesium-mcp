---
"cesium-mcp-runtime": patch
---

Upgrade the runtime to the stable MCP TypeScript SDK v2 while preserving
2025-era client compatibility and adding MCP `2026-07-28` HTTP and stdio
support. The runtime now uses canonical JSON Schema validation, exposes the
real `/mcp` network route, and runs the official stateless server conformance
scenario in CI.
