# cesium-mcp-telemetry

## 0.1.2

### Patch Changes

- Updated dependencies [[`96e04ab`](https://github.com/gaopengbin/cesium-mcp/commit/96e04ab54b56bf969f9b5e4004e16648b0d63712), [`96e04ab`](https://github.com/gaopengbin/cesium-mcp/commit/96e04ab54b56bf969f9b5e4004e16648b0d63712)]:
  - cesium-mcp-contracts@0.9.0

## 0.1.1

### Patch Changes

- [#59](https://github.com/gaopengbin/cesium-mcp/pull/59) [`311b219`](https://github.com/gaopengbin/cesium-mcp/commit/311b21938c4021af34a9daa49c2f2a256cbb666e) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Add default-on usage counters with a startup/console disclosure and documented opt-out. Respect CESIUM_TELEMETRY_DISABLED, DO_NOT_TRACK, browser DNT/GPC and Node CI/test environments. Collect only random installation identifiers, package/version, OS family, known events/tools, outcomes, coarse latency and counts; never tool arguments/results, map data or credentials. Add a separate, bounded collector and authenticated aggregate reporting. Provision the collector and privacy documentation before publishing these clients.
