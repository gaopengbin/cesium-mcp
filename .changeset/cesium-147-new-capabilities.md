---
"cesium-mcp-bridge": major
"cesium-mcp-runtime": major
"cesium-mcp-dev": major
"cesium-mcp-webmcp": major
"cesium-mcp-contracts": minor
---

Raise the tested renderer and peer dependency baseline to CesiumJS ~1.147.0 (Node >=22.17.0), pin engine/core/gltf/widgets, and update built-in Viewer and example URLs. Add BIM model tree/lineage and native precise snap integration, owned vector batch setPositions and pre-render pickObject metadata, native vector blending/cache/point-cloud/environment options, GPU snapping/measurement and clipping polygons with holes. Adopt the release's emissive materials and rendering/cache fixes. Older Cesium peer ranges are intentionally removed; upgrade before using this release. Local fixtures verify SDK parity, rendered behavior, river draping and MCP/WebMCP compatibility; private ion asset validation remains separate.
