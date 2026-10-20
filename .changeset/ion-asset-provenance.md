---
"cesium-mcp-bridge": patch
---

Preserve the original ion asset ID in layer schema metadata for 3D Tiles and vector tiles. Keep provenance unchanged on failed replacement and clear it when replacing the layer with a URL source, without reading private IonResource fields or exposing resource credentials.
