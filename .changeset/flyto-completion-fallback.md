---
'cesium-mcp-bridge': patch
'cesium-mcp-runtime': patch
'cesium-mcp-dev': patch
---

fix(view): resolve flyTo/zoomToExtent promises on cancel and via a fallback timer

`viewer.camera.flyToBoundingSphere` / `flyTo` may fire neither `complete` nor
`cancel` when the camera is already near the target or the flight is preempted
by a subsequent camera command. This left the awaited promise pending forever
and surfaced as `浏览器响应超时（30000ms）` on the runtime side.

Both handlers now also resolve on `cancel` and install a `duration + 1s`
fallback timer as a last resort, so the WebSocket reply is always sent back
to the runtime.
