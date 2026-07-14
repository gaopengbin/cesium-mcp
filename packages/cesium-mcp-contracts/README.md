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

Selections can be `core` (15 lightweight contracts), `all` (61 browser-safe contracts), one toolset name, or an array of toolset names. The 12 domain toolsets mirror the runtime capability groups. Sixty contracts execute directly through the Bridge; `geocode` is an application-provided browser service. `setIonToken` is intentionally excluded because page agents must not receive application credentials.

Consumers are responsible for adapting these contracts to their protocol or model provider. Execution remains outside this package.
