# cesium-mcp-contracts

## 0.4.0

### Minor Changes

- [`2c9bfd9`](https://github.com/gaopengbin/cesium-mcp/commit/2c9bfd958503cb6d6eedaecc694bc4ac497a80ea) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Use the shared JSON Schemas as the executable source for Runtime validation and defaults, align contract fields with Bridge support and CesiumJS 1.143 behavior, and expose the corrected schemas through WebMCP.

## 0.3.0

### Minor Changes

- [`e1f3eaf`](https://github.com/gaopengbin/cesium-mcp/commit/e1f3eaffc009284ea67da6de2cba39f0aa419b67) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Publish canonical tool titles, MCP behavior annotations, and complete English and Chinese descriptions and parameter hints from the shared contracts package. Runtime tool and toolset registration now consumes that metadata while keeping Runtime-only credential tools separate.

## 0.2.0

### Minor Changes

- [`d92a2bb`](https://github.com/gaopengbin/cesium-mcp/commit/d92a2bb0b7d55499174b596f9a41d7b92636f7ea) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Publish the canonical shared tool inventory and toolset definitions, re-export them from the WebMCP adapter, and derive the Runtime toolset manifest from those contracts while keeping credential and MCP discovery tools explicitly separated.
