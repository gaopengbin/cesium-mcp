---
"cesium-mcp-bridge": minor
"cesium-mcp-runtime": minor
"cesium-mcp-dev": minor
"cesium-mcp-webmcp": minor
"cesium-mcp-telemetry": patch
---

Add default-on usage counters with a startup/console disclosure and documented opt-out. Respect CESIUM_TELEMETRY_DISABLED, DO_NOT_TRACK, browser DNT/GPC and Node CI/test environments. Collect only random installation identifiers, package/version, OS family, known events/tools, outcomes, coarse latency and counts; never tool arguments/results, map data or credentials. Add a separate, bounded collector and authenticated aggregate reporting. Provision the collector and privacy documentation before publishing these clients.
