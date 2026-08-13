---
'cesium-mcp-contracts': minor
'cesium-mcp-bridge': minor
'cesium-mcp-runtime': minor
---

Close the canonical output-contract loop across Contracts, Bridge, and MCP Runtime. Shared tools now advertise their canonical output schemas, return MCP structured content alongside legacy text content, and validate browser execution results with an opt-out for custom integrations. Screenshot calls also preserve their PNG image content while exposing structured metadata.
