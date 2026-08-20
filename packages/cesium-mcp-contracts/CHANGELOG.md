# cesium-mcp-contracts

## 0.6.1

### Patch Changes

- [#37](https://github.com/gaopengbin/cesium-mcp/pull/37) [`fc03921`](https://github.com/gaopengbin/cesium-mcp/commit/fc03921936689e3306aa26fa851a2220e48d8426) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Add `items` to every advertised input array schema for VS Code and other strict MCP clients while preserving tuple constraints through `prefixItems`.

## 0.6.0

### Minor Changes

- [`33daff9`](https://github.com/gaopengbin/cesium-mcp/commit/33daff93c32e74d5476dd8d9461b33bf3ad88139) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Close the canonical output-contract loop across Contracts, Bridge, and MCP Runtime. Shared tools now advertise their canonical output schemas, return MCP structured content alongside legacy text content, and validate browser execution results with an opt-out for custom integrations. Screenshot calls also preserve their PNG image content while exposing structured metadata.

## 0.5.0

### Minor Changes

- [`b2b9c92`](https://github.com/gaopengbin/cesium-mcp/commit/b2b9c92db6034e8ecb6c17f5a139ec6bf960bb30) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Add shared runtime input validation, per-command Bridge executor overrides, per-Viewer state isolation, and an idempotent Bridge lifecycle cleanup API.

## 0.4.0

### Minor Changes

- [`2c9bfd9`](https://github.com/gaopengbin/cesium-mcp/commit/2c9bfd958503cb6d6eedaecc694bc4ac497a80ea) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Use the shared JSON Schemas as the executable source for Runtime validation and defaults, align contract fields with Bridge support and CesiumJS 1.143 behavior, and expose the corrected schemas through WebMCP.

## 0.3.0

### Minor Changes

- [`e1f3eaf`](https://github.com/gaopengbin/cesium-mcp/commit/e1f3eaffc009284ea67da6de2cba39f0aa419b67) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Publish canonical tool titles, MCP behavior annotations, and complete English and Chinese descriptions and parameter hints from the shared contracts package. Runtime tool and toolset registration now consumes that metadata while keeping Runtime-only credential tools separate.

## 0.2.0

### Minor Changes

- [`d92a2bb`](https://github.com/gaopengbin/cesium-mcp/commit/d92a2bb0b7d55499174b596f9a41d7b92636f7ea) Thanks [@gaopengbin](https://github.com/gaopengbin)! - Publish the canonical shared tool inventory and toolset definitions, re-export them from the WebMCP adapter, and derive the Runtime toolset manifest from those contracts while keeping credential and MCP discovery tools explicitly separated.
