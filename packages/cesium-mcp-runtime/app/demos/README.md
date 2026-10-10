# Live map covers

These JPEGs come from the MCP `screenshot` tool on the real Cesium Viewer after running each US demo and waiting for satellite imagery to load. They show the same synthetic overlays that the cards execute. They are not generated illustrations or photographs of actual buildings/events.

`captures.json` records the original PNG hash, JPEG hash, camera state, scene name and demo-source hash. The App build rejects stale demo plans and changed cover bytes. JPEG conversion only compresses the real screenshots; it does not alter their map content.

To refresh: build and open the local preview, run each demo, save its host context, call `screenshot` with that same session, inspect the pixels, convert to JPEG and update the capture record. Keep any raw PNGs and MCP property/schema evidence with the work artifacts. Normalize the demo source to LF before computing its SHA256.

Satellite basemap: Esri World Imagery and its imagery contributors. Demo overlays: this project's built-in synthetic data.
