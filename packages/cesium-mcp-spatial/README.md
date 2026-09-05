# cesium-mcp-spatial

## 共享世界记忆（实验）

`WorldMemory` 复用现有 `WorldObservation` / Belief 更新规则，保存可解析的证据记录，并向不同任务提供同一份认知。可以接收场景查询、射线或 `createVisualGroundingObservation()` 的输出。

```ts
const memory = new WorldMemory({
  beliefId: 'agent-1', worldId: 'scene-1', createdAt: new Date().toISOString(), regions: [],
})
memory.observe(observation)
memory.checkpoint('before', observation.completedAt)
const result = memory.execute({
  kind: 'find', query: { name: '桥' }, at: new Date().toISOString(),
})
// 同一入口还支持 describe，以及 changes + checkpointId。
// result.citations 可追溯到传感器、时间、basis 和 evidence reference。
```

这是结构化任务接口，不是自然语言理解模型。`supported` 仅表示所返回匹配对象有当前可解析证据，不代表场景已完整覆盖或模型结论已校准。缺少目标返回 `insufficient-evidence`；变化比较描述认知变化，不推定对象生成或删除。

当前为会话内内存：由调用方控制会话生命周期，尚无磁盘持久化、自动裁剪或跨 ID 的身份关联。图像只保存引用，不保存 base64；图片本身不自动成为对象事实。查询时间不得早于当前认知更新时间，历史比较请使用检查点。

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
- strict visual-grounding reports that bind evidence to an image digest, reject
  invented object IDs, and keep clear or incomplete imagery unknown;
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
action trace semantics. The separate Himalaya experiment now exercises a live
visual-model path: a fast ray loop commits a safe maneuver immediately, while
up to three independent observer frames revise one persistent belief. Cesium
forward rays can corroborate corridor occupancy, positive first-contact evidence
may invoke a planning model, short-lived evidence becomes stale, and invalid
visual output safely degrades to unknown.

### Background world tasks

`WorldTaskRuntime` is the protocol- and domain-neutral scheduler used by the
live experiment for slow world updates. A task is identified by a stable key
and a world/plan revision. Consumers of the same revision share one in-flight
or completed result; a newer revision aborts the obsolete task before its
result can commit. Callers receive a cooperative `checkpoint()` so CPU-side
work can yield within a configurable frame budget, while each caller may stop
waiting without cancelling work still needed by another consumer.

`WorldTaskRuntime` remains a same-thread cooperative scheduler. For work that
cannot be split at checkpoints, `WorldWorkerExecutor` adds an optional real
Worker boundary with request correlation, transferable payloads, error
serialization, disposal, and revision cancellation. Cancellation terminates
the owned Worker before it can publish stale results and recreates it lazily for
the next request. `executeWorldWorkerMessage` implements the matching
Worker-side protocol.

Neither runtime contains Cesium, terrain, flight, or model semantics. Adapters
remain responsible for selecting the Worker module, sampling policy, safety
constraints, and evidence quality.

### Embodied actuation boundary

`EmbodiedActuator` is the protocol- and engine-neutral boundary between world
awareness and a continuously controlled character, vehicle, or aircraft. It
accepts normalized movement and look axes, exposes a serializable pose/velocity/grounding
observation with an optional physics-world center-ray hit, and provides an explicit neutral
stop. The core does not own a render loop, physics engine, input listener, or
vehicle implementation.

The spatial-context experiment contains a structural adapter for the public
`cesium-player-controller` input and state surface. The example page does not
instantiate that controller; its adapter tests use a fake controller and
synthetic observations. The third-party package is deliberately absent from the
root npm workspace, so the protocol-neutral core does not acquire Rapier,
Cesium, or controller dependencies.

The executable consumer is
[`experiments/embodied-world-lab`](../../experiments/embodied-world-lab/README.md).
It is outside the root workspace and keeps its own package and lockfile, while
still importing this package's source directly. It pins `cesium@~1.143.0`,
`cesium-player-controller@0.2.1`, and Cesium's engine/widget subpackages inside
that isolated lock. The controller only declares `cesium >=1.120.0`; the
engine/widget overrides prevent Cesium's own caret ranges from floating and
must not be presented as controller-required versions.

On 2026-09-04, `npm audit --omit=dev` in the lab reported five high-severity
findings with no available fix in the transitive loader path
`cesium-player-controller -> @loaders.gl/gltf -> @loaders.gl/textures ->
texture-compressor -> image-size@0.7.5`. This is a lockfile dependency finding,
not evidence that the controller itself is directly exploitable. The current
lab loads only the bundled Fox asset, which narrows the input surface but does
not resolve those advisories. The controller's separate `streaming-terrain`
path also reads Cesium private internals; this lab uses its bounded static
`terrain` mode and does not exercise that path.

At runtime, the lab throttles its local safety pass to at most once every 50 ms
from Cesium `preUpdate` (up to about 20 Hz). ArcGIS elevation is sampled once
into a 13 x 13 grid and interpolated; terrain failure degrades to an ellipsoid
and a flat height field. Pose, velocity, grounding, actor-space Rapier ray hits,
and the executed path come from the running scene. Start, goal, and landslide
geometry are deterministic fixture configuration, and landslide discovery is a
bearing/range test against that known fixture, not Rapier or visual-model
detection. The hosted planner receives only a bounded structured snapshot; a
local fallback plan is active provisionally while the request is pending, and
the local safety loop may override either plan.

A manual browser run on 2026-09-04 reached the target, reported a rounded closest
landslide-boundary clearance of 6 m, and produced no observed browser errors.
That is one verification record, not a guarantee that every run or environment
will reach the target.
