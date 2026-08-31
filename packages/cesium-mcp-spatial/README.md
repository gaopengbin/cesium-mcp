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

## World Awareness experiment

The opt-in World Awareness core keeps evaluator truth separate from the Agent's
belief. Unknown space stays unknown until a ready, complete observation supports
a free-space claim; occupied evidence remains conservative; stale knowledge is
preserved with an explicit freshness state. The package also provides:

- deterministic belief updates and revision invalidation;
- next-best-view scoring under an observation budget;
- belief-only corridor planning with safe aborts;
- semantic traces with event-state validation, exact belief reconstruction, and
  replay-ready structured observations;
- an eight-case Hidden Corridor Harness comparing an oracle upper bound, a fixed
  forward sensor, and active next-best-view selection.

Run `npm run eval:world-awareness` from the repository root to generate
`artifacts/world-awareness-eval.json`. The evaluation and its test suite reject
policy inputs that expose case identifiers, low-confidence free-space claims,
occupied-corridor traversal, false-free updates from incomplete coverage,
missed revision replans, budget overruns, inferior information gain, route or
next-best-view regret, and non-repeatable traces.

The Harness executes a deterministic, segment-checked corridor simulation over
versioned fixture state. It validates sensing, belief, planning, replanning, and
action trace semantics; it is not yet a rendered Cesium or live visual-model
end-to-end test.
