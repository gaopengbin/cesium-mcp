# cesium-mcp-contracts

Transport-neutral Cesium tool contracts shared by browser agents, WebMCP adapters, and model function-calling integrations.

The package contains names, descriptions, JSON input schemas, JSON output schemas, and behavioral annotations. It does not depend on CesiumJS, Zod, MCP SDKs, browser APIs, or any transport.

## Install

```bash
npm install cesium-mcp-contracts
```

## Usage

```typescript
import {
  cesiumBrowserToolsets,
  selectCesiumToolContracts,
} from 'cesium-mcp-contracts'

const tools = selectCesiumToolContracts(['view', 'entity', 'layer'])
for (const tool of tools) {
  console.log(tool.name, tool.inputSchema, tool.outputSchema)
}

console.log(cesiumBrowserToolsets.animation.description)
```

`cesiumBrowserToolsetDefinitions` and `cesiumSharedToolNames` are the canonical inventory used by protocol adapters. Runtime-only credential tools and MCP discovery meta-tools remain outside this shared browser-safe inventory.

Selections can be `core` (15 lightweight contracts), `all` (61 browser-safe contracts), one toolset name, or an array of toolset names. The 12 domain toolsets mirror the runtime capability groups. Sixty contracts execute directly through the Bridge; `geocode` is an application-provided browser service. `setIonToken` is intentionally excluded because page agents must not receive application credentials.

Consumers are responsible for adapting these contracts to their protocol or model provider. Execution remains outside this package.

## CesiumJS compatibility

This package is transport-neutral and does not depend on CesiumJS directly. Executable compatibility is defined by `cesium-mcp-bridge`, currently tested with the peer dependency `cesium@~1.143.0`. A newer official CesiumJS release is reviewed before the Bridge baseline and affected contracts are updated; contracts do not automatically claim compatibility with every latest release.
