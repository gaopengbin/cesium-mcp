# cesium-mcp-spatial

Experimental, protocol-neutral spatial context core for Cesium MCP.

The package normalizes scene objects, provides compact scene summaries, filters objects by spatial context, and returns relation results with explicit evidence and quality. It does not depend on CesiumJS, MCP, WebMCP, or an AI model.

This package is experimental and is not enabled by the stable tool surface yet.

```ts
import { createSpatialContext } from 'cesium-mcp-spatial'

const context = createSpatialContext(objects)
const schools = context.query({ types: ['school'] })
const relation = context.relate('school_1', 'flood_zone_1', 'within')
```

`cesium-mcp-bridge` adapts managed Viewer content into this model. WebMCP and
MCP Runtime expose the resulting perception contracts only through explicit
experimental opt-in.

The recommended experimental agent entry point is `observeScene`. It combines
the normalized snapshot with scene readiness, a stable snapshot revision, and
optional independent Observer imagery. Structured evidence remains available
when visual capture is skipped or unavailable, while incomplete loading is
reported explicitly instead of being treated as a complete observation.

The package also exports the deterministic two-stage urban-flood fixture used by
the live experiment and CI. Run `npm run eval:spatial-context` from the
repository root to generate `artifacts/spatial-context-eval.json`.
