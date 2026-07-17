// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { AsyncLocalStorage } from "async_hooks";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// src/locales/en.ts
var toolDescriptions = {
  // — view
  flyTo: "Fly to a specific longitude/latitude position (with animation transition)",
  setView: "Instantly switch to specified longitude/latitude view (no animation)",
  getView: "Get current camera view info (longitude, latitude, height, angles)",
  zoomToExtent: "Zoom to specified geographic extent",
  saveViewpoint: "Save current view as bookmark (name \u2192 view state), restore via loadViewpoint",
  loadViewpoint: "Restore a saved viewpoint bookmark (with fly animation), returns saved view state",
  listViewpoints: "List all saved viewpoint bookmarks",
  // — entity
  addMarker: "Add a marker point at specified coordinates, returns layerId for later operations",
  addLabel: "Add text labels to GeoJSON features (display attribute values)",
  addModel: "Place a 3D model (glTF/GLB) at specified coordinates, returns entityId",
  addPolygon: "Add a polygon area on the map (area/boundary), returns entityId",
  addPolyline: "Add a polyline on the map (path/line segment), returns entityId",
  updateEntity: "Update properties of an existing entity (position, color, label, scale, visibility)",
  removeEntity: "Remove a single entity by entityId",
  batchAddEntities: "Batch add multiple entities (create multiple markers/polylines/polygons/models in one call), returns all entityIds",
  queryEntities: "Query existing entities \u2014 filter by name, type, spatial extent, returns entityId/name/type/position list",
  // — layer
  addGeoJsonLayer: "Add GeoJSON layer to map (supports Point/Line/Polygon, configurable color/choropleth/category rendering). data and url are mutually exclusive",
  addGeoJsonPrimitive: "High-performance GeoJSON loading for massive datasets (100k+ features). Bypasses Entity system, renders directly via Primitives. data and url are mutually exclusive",
  listLayers: "Get current layer list (with ID, name, type, visibility)",
  getLayerSchema: "Get layer field schema \u2014 returns field names, types, sample values. Works with GeoJSON/CZML/KML/3D Tiles layers",
  removeLayer: "Remove a layer from map by layer ID",
  setLayerVisibility: "Set layer visibility",
  updateLayerStyle: "Update layer style (color, opacity, label style, 3D Tiles style, etc.)",
  setBasemap: "Switch basemap style (dark/satellite/standard/osm/arcgis/light/tianditu/amap)",
  // — camera
  lookAtTransform: "Look at a specific position from a given heading/pitch/range (orbit-style camera)",
  startOrbit: "Start orbiting the camera around the current view center",
  stopOrbit: "Stop the camera orbit animation",
  setCameraOptions: "Configure camera controller options (enable/disable rotation, zoom, tilt, etc.)",
  // — entity-ext
  addBillboard: "Add a billboard (image icon) at a position on the globe",
  addBox: "Add a 3D box entity at a position",
  addCorridor: "Add a corridor (path with width) entity",
  addCylinder: "Add a cylinder or cone entity at a position",
  addEllipse: "Add an ellipse (oval) entity at a position",
  addRectangle: "Add a rectangle entity defined by geographic bounds",
  addWall: "Add a wall entity along a series of positions",
  // — animation
  createAnimation: "Create a time-based animation with waypoints (moving entity along a path)",
  controlAnimation: "Play or pause the current animation",
  removeAnimation: "Remove an animation entity",
  listAnimations: "List all active animations",
  updateAnimationPath: "Update the visual properties of an animation path",
  trackEntity: "Track (follow) an entity with the camera, or stop tracking",
  controlClock: "Configure the Cesium clock (time range, speed, animation state)",
  setGlobeLighting: "Enable/disable globe lighting and atmospheric effects",
  // — scene
  setSceneOptions: "Configure scene environment (fog, atmosphere, shadows, sun, moon, background color, depth testing)",
  setPostProcess: "Configure post-processing effects (bloom glow, ambient occlusion SSAO, anti-aliasing FXAA)",
  // — tiles
  load3dTiles: "Load 3D Tiles dataset (e.g. building white models, city models)",
  loadTerrain: "Load or switch terrain (flat/ArcGIS/CesiumIon/custom URL)",
  loadImageryService: "Load imagery service layer (WMS/WMTS/XYZ/ArcGIS MapServer)",
  loadCzml: "Load CZML time-dynamic data source (CesiumJS native format, supports time-varying position/style/animation). data and url are mutually exclusive",
  loadKml: "Load KML/KMZ data source (Google Earth format). data and url are mutually exclusive",
  // — interaction
  screenshot: "Capture current map view (returns base64 PNG)",
  highlight: "Highlight features in a layer",
  measure: "Measure distance or area (coordinate-based calculation, optionally displayed on map)",
  // — clear
  clearAll: "Clear all layers, entities, animations, and trajectories from the map (reset scene)",
  // — entity inspection
  getEntityProperties: "Get detailed properties of a specific entity \u2014 type, position, custom properties, and graphic properties",
  // — scene export
  exportScene: "Export current scene snapshot \u2014 includes camera view, layer list, entity list, and timestamp",
  // — trajectory
  playTrajectory: "Play a moving trajectory animation",
  // — heatmap
  addHeatmap: "Add heatmap layer (generate heat visualization from GeoJSON point data)",
  // — geolocation
  geocode: "Convert address, landmark, or place name to geographic coordinates (longitude/latitude). Uses OpenStreetMap Nominatim free service, no API key required."
};
var paramDescriptions = {
  flyTo: {
    longitude: "Longitude (-180 to 180)",
    latitude: "Latitude (-90 to 90)",
    height: "Camera height (meters), default 50000",
    heading: "Heading angle (degrees), 0 = North",
    pitch: "Pitch angle (degrees), -90 = straight down",
    duration: "Flight animation duration (seconds)"
  },
  setView: {
    longitude: "Longitude (-180 to 180)",
    latitude: "Latitude (-90 to 90)",
    height: "Height (meters)",
    heading: "Heading angle (degrees)",
    pitch: "Pitch angle (degrees)",
    roll: "Roll angle (degrees)"
  },
  zoomToExtent: {
    west: "West boundary longitude (degrees)",
    south: "South boundary latitude (degrees)",
    east: "East boundary longitude (degrees)",
    north: "North boundary latitude (degrees)",
    duration: "Animation duration (seconds)"
  },
  saveViewpoint: {
    name: "Bookmark name (unique identifier, overwrites if duplicate)"
  },
  loadViewpoint: {
    name: "Bookmark name",
    duration: "Fly animation duration (seconds), 0 = instant"
  },
  addMarker: {
    longitude: "Longitude (-180 to 180)",
    latitude: "Latitude (-90 to 90)",
    label: "Label text",
    color: "Marker color (CSS format)",
    size: "Point size (pixels)",
    id: "Custom layer ID (auto-generated if omitted)"
  },
  addLabel: {
    data: "GeoJSON FeatureCollection object",
    field: 'Attribute field name for label text (e.g. "name", "population")',
    style: "Label style (font, fillColor, outlineColor, scale, etc.)"
  },
  addModel: {
    longitude: "Longitude (-180 to 180)",
    latitude: "Latitude (-90 to 90)",
    height: "Placement height (meters)",
    url: "glTF/GLB model file URL",
    scale: "Model scale factor",
    heading: "Heading angle (degrees), 0=North",
    pitch: "Pitch angle (degrees)",
    roll: "Roll angle (degrees)",
    label: "Model label text"
  },
  addPolygon: {
    coordinates: "Polygon outer ring coordinates [[lon, lat, height?], ...]",
    color: "Fill color (CSS format)",
    outlineColor: "Outline color",
    opacity: "Fill opacity (0-1)",
    extrudedHeight: "Extruded height (meters), for 3D effect",
    clampToGround: "Whether to clamp to ground",
    label: "Polygon label text"
  },
  addPolyline: {
    coordinates: "Polyline coordinates array [[lon, lat, height?], ...]",
    color: "Line color (CSS format)",
    width: "Line width (pixels)",
    clampToGround: "Whether to clamp to ground",
    label: "Polyline label text"
  },
  updateEntity: {
    entityId: "Entity ID (returned by addMarker/addPolyline etc.)",
    position: "New position coordinates",
    label: "New label text",
    color: "New color (CSS format)",
    scale: "New scale factor",
    show: "Whether to show"
  },
  removeEntity: {
    entityId: "Entity ID to remove"
  },
  batchAddEntities: {
    entities: "Array of entity definitions, each containing a type field and parameters for that type"
  },
  queryEntities: {
    name: "Name fuzzy match (case-insensitive)",
    type: "Filter by entity type",
    bbox: "Spatial extent filter [west, south, east, north] (degrees)"
  },
  addGeoJsonLayer: {
    id: "Layer ID (auto-generated if omitted)",
    name: "Layer display name",
    data: "GeoJSON FeatureCollection object (mutually exclusive with url)",
    url: "GeoJSON file URL (mutually exclusive with data, fetched in browser)",
    style: "Style config (color, opacity, pointSize, choropleth, category)"
  },
  addGeoJsonPrimitive: {
    id: "Layer ID (auto-generated if omitted)",
    name: "Layer display name",
    data: "GeoJSON object (mutually exclusive with url)",
    url: "GeoJSON file URL (mutually exclusive with data)",
    allowPicking: "Allow picking (default true, disable for better performance)",
    show: "Whether to show (default true)"
  },
  listLayers: {},
  getLayerSchema: {
    layerId: "Layer ID (get via listLayers)"
  },
  removeLayer: {
    id: "Layer ID to remove (get via listLayers)"
  },
  setLayerVisibility: {
    id: "Layer ID",
    visible: "Whether visible"
  },
  updateLayerStyle: {
    layerId: "Layer ID",
    labelStyle: "Label style (font, fillColor, outlineColor, outlineWidth, scale, etc.)",
    layerStyle: "Entity layer style (color, opacity, strokeWidth, pointSize; GeoJSON thematic styles choropleth/category/randomColor/gradient are mutually exclusive)",
    imageryStyle: "Imagery visual style (alpha, brightness, contrast, hue, saturation, gamma); use setLayerVisibility for show/hide",
    primitiveStyle: "GeoJSON Primitive material style (color, opacity, outlineColor, outlineWidth, pointSize, lineWidth); use setLayerVisibility for show/hide",
    tileStyle: "3D Tiles style (Cesium3DTileStyle expressions: color, show, pointSize, meta)"
  },
  setBasemap: {
    basemap: "Basemap type: dark=dark theme, satellite=satellite imagery, standard=standard, osm=OpenStreetMap, arcgis=ArcGIS streets, light=light theme, tianditu_vec=Tianditu vector, tianditu_img=Tianditu imagery, amap=Amap roads, amap_satellite=Amap satellite",
    token: "Token for providers requiring authentication (e.g. Tianditu)",
    url: "Custom URL template with {x},{y},{z} placeholders. When provided, basemap param is ignored."
  },
  highlight: {
    layerId: "Layer ID",
    featureIndex: "Feature index (highlights all if omitted)",
    color: "Highlight color (CSS format)"
  },
  measure: {
    mode: "Measurement mode: distance or area",
    positions: "Coordinate array [[lon, lat, alt?], ...]",
    showOnMap: "Whether to display measurement result on map",
    id: "Custom measurement entity ID"
  },
  getEntityProperties: {
    entityId: "Entity ID (obtainable via queryEntities)"
  },
  lookAtTransform: {
    longitude: "Target longitude (degrees)",
    latitude: "Target latitude (degrees)",
    height: "Target height (meters)",
    heading: "Camera heading (degrees), 0=North",
    pitch: "Camera pitch (degrees), -90=straight down",
    range: "Distance from target (meters)"
  },
  startOrbit: {
    speed: "Rotation speed (radians per tick)",
    clockwise: "Orbit direction"
  },
  setCameraOptions: {
    enableRotate: "Enable camera rotation",
    enableTranslate: "Enable camera translation",
    enableZoom: "Enable camera zoom",
    enableTilt: "Enable camera tilt",
    enableLook: "Enable camera look",
    minimumZoomDistance: "Minimum zoom distance (meters)",
    maximumZoomDistance: "Maximum zoom distance (meters)",
    enableInputs: "Enable/disable all camera inputs"
  },
  addBillboard: {
    longitude: "Longitude (degrees)",
    latitude: "Latitude (degrees)",
    height: "Height (meters)",
    name: "Billboard name",
    image: "Image URL for the billboard",
    scale: "Scale factor",
    color: "Tint color",
    pixelOffset: "Pixel offset from position",
    horizontalOrigin: "Horizontal origin",
    verticalOrigin: "Vertical origin",
    heightReference: "Height reference"
  },
  addBox: {
    longitude: "Longitude (degrees)",
    latitude: "Latitude (degrees)",
    height: "Height (meters)",
    name: "Box name",
    dimensions: "Box dimensions",
    material: "Material (color string, RGBA object, or material spec)",
    outline: "Show outline",
    outlineColor: "Outline color",
    fill: "Show fill",
    orientation: "Orientation (heading/pitch/roll in degrees)",
    heightReference: "Height reference"
  },
  addCorridor: {
    name: "Corridor name",
    positions: "Array of positions along the corridor",
    width: "Corridor width in meters",
    material: "Material",
    cornerType: "Corner type",
    height: "Height above ground (meters)",
    extrudedHeight: "Extruded height (meters)",
    outline: "Show outline",
    outlineColor: "Outline color"
  },
  addCylinder: {
    longitude: "Longitude (degrees)",
    latitude: "Latitude (degrees)",
    height: "Height (meters)",
    name: "Cylinder name",
    length: "Cylinder length/height in meters",
    topRadius: "Top radius in meters",
    bottomRadius: "Bottom radius in meters",
    material: "Material",
    outline: "Show outline",
    outlineColor: "Outline color",
    fill: "Show fill",
    orientation: "Orientation (heading/pitch/roll in degrees)",
    numberOfVerticalLines: "Number of vertical lines",
    slices: "Number of slices"
  },
  addEllipse: {
    longitude: "Center longitude (degrees)",
    latitude: "Center latitude (degrees)",
    height: "Height (meters)",
    name: "Ellipse name",
    semiMajorAxis: "Semi-major axis in meters",
    semiMinorAxis: "Semi-minor axis in meters",
    material: "Material",
    extrudedHeight: "Extruded height (meters)",
    rotation: "Rotation (radians)",
    outline: "Show outline",
    outlineColor: "Outline color",
    fill: "Show fill",
    stRotation: "Texture rotation (radians)",
    numberOfVerticalLines: "Number of vertical lines"
  },
  addRectangle: {
    name: "Rectangle name",
    west: "West longitude (degrees)",
    south: "South latitude (degrees)",
    east: "East longitude (degrees)",
    north: "North latitude (degrees)",
    material: "Material",
    height: "Height (meters)",
    extrudedHeight: "Extruded height (meters)",
    rotation: "Rotation (radians)",
    outline: "Show outline",
    outlineColor: "Outline color",
    fill: "Show fill",
    stRotation: "Texture rotation (radians)"
  },
  addWall: {
    name: "Wall name",
    positions: "Array of positions along the wall",
    minimumHeights: "Minimum heights at each position",
    maximumHeights: "Maximum heights at each position",
    material: "Material",
    outline: "Show outline",
    outlineColor: "Outline color",
    fill: "Show fill"
  },
  createAnimation: {
    name: "Animation name",
    waypoints: "Array of waypoints with positions and timestamps",
    modelUri: "glTF/GLB model URL, or preset: cesium_man, cesium_air, ground_vehicle, cesium_drone",
    showPath: "Show trail path",
    pathWidth: "Path width (pixels)",
    pathColor: "Path color (CSS)",
    pathLeadTime: "Path lead time (seconds)",
    pathTrailTime: "Path trail time (seconds)",
    multiplier: "Clock speed multiplier",
    shouldAnimate: "Auto-start animation"
  },
  controlAnimation: {
    action: "Play or pause"
  },
  removeAnimation: {
    entityId: "Entity ID of the animation to remove"
  },
  updateAnimationPath: {
    entityId: "Entity ID of the animation",
    width: "New path width (pixels)",
    color: "New path color (CSS)",
    leadTime: "New lead time (seconds)",
    trailTime: "New trail time (seconds)",
    show: "Show/hide path"
  },
  trackEntity: {
    entityId: "Entity ID to track (omit to stop tracking)",
    heading: "Camera heading (degrees)",
    pitch: "Camera pitch (degrees)",
    range: "Camera distance from entity (meters)"
  },
  controlClock: {
    action: "Clock action",
    startTime: "ISO 8601 start time (for configure)",
    stopTime: "ISO 8601 stop time (for configure)",
    currentTime: "ISO 8601 current time (for configure)",
    time: "ISO 8601 time to jump to (for setTime)",
    multiplier: "Clock speed multiplier (for configure/setMultiplier)",
    shouldAnimate: "Whether clock should animate (for configure)",
    clockRange: "Clock range mode (for configure)"
  },
  setGlobeLighting: {
    enableLighting: "Enable globe lighting",
    dynamicAtmosphereLighting: "Enable dynamic atmosphere lighting",
    dynamicAtmosphereLightingFromSun: "Use sun position for atmosphere lighting"
  },
  setSceneOptions: {
    fogEnabled: "Enable/disable fog",
    fogDensity: "Fog density (0.0~1.0, default ~0.0002)",
    fogMinimumBrightness: "Minimum fog brightness (0.0~1.0)",
    skyAtmosphereShow: "Show sky atmosphere",
    skyAtmosphereHueShift: "Sky hue shift (-1.0~1.0)",
    skyAtmosphereSaturationShift: "Sky saturation shift (-1.0~1.0)",
    skyAtmosphereBrightnessShift: "Sky brightness shift (-1.0~1.0)",
    groundAtmosphereShow: "Show ground atmosphere",
    shadowsEnabled: "Enable shadows",
    shadowsSoftShadows: "Use soft shadows",
    shadowsDarkness: "Shadow darkness (0.0=no shadow, 1.0=fully dark)",
    sunShow: "Show the sun",
    sunGlowFactor: "Sun glow factor (default 1.0)",
    moonShow: "Show the moon",
    depthTestAgainstTerrain: "Enable depth test against terrain (entities behind terrain are hidden)",
    backgroundColor: 'Scene background color (CSS format, e.g. "#000000")'
  },
  setPostProcess: {
    bloom: "Enable bloom glow effect",
    bloomContrast: "Bloom contrast (default 128)",
    bloomBrightness: "Bloom brightness (default -0.3)",
    bloomDelta: "Bloom delta (default 1.0)",
    bloomSigma: "Bloom sigma (default 3.78)",
    bloomStepSize: "Bloom step size (default 5.0)",
    bloomGlowOnly: "Show only the glow (no base scene)",
    ambientOcclusion: "Enable ambient occlusion (SSAO)",
    aoIntensity: "AO intensity (default 3.0)",
    aoBias: "AO bias (default 0.1)",
    aoLengthCap: "AO length cap (default 0.26)",
    aoStepSize: "AO step size (default 1.95)",
    fxaa: "Enable FXAA anti-aliasing"
  },
  load3dTiles: {
    id: "Layer ID",
    name: "Layer name",
    url: "tileset.json URL",
    maximumScreenSpaceError: "Maximum screen space error (lower = more detailed)",
    heightOffset: "Height offset (meters)"
  },
  loadTerrain: {
    provider: "Terrain provider type",
    url: "Custom terrain service URL",
    cesiumIonAssetId: "Cesium Ion asset ID (required when provider=cesiumion)"
  },
  loadImageryService: {
    id: "Layer ID",
    name: "Layer name",
    url: "Imagery service URL",
    serviceType: "Service type",
    layerName: "WMS/WMTS layer name",
    opacity: "Opacity (0-1)"
  },
  loadCzml: {
    id: "Layer ID (auto-generated if omitted)",
    name: "Data source display name",
    data: "CZML packet array (mutually exclusive with url)",
    url: "CZML file URL (mutually exclusive with data, browser-side fetch)",
    sourceUri: "Base URI for resolving relative references in CZML",
    clampToGround: "Clamp entities to ground surface",
    flyTo: "Fly to data extent after loading (default true)"
  },
  loadKml: {
    id: "Layer ID (auto-generated if omitted)",
    name: "Data source display name",
    url: "KML/KMZ file URL (mutually exclusive with data, browser-side fetch)",
    data: "KML XML string (mutually exclusive with url)",
    sourceUri: "Base URI for resolving relative references in KML",
    clampToGround: "Clamp entities to ground surface",
    flyTo: "Fly to data extent after loading (default true)"
  },
  playTrajectory: {
    id: "Trajectory layer ID",
    name: "Trajectory name",
    coordinates: "Trajectory coordinates array [[lon, lat, alt?], ...]",
    durationSeconds: "Animation duration (seconds)",
    trailSeconds: "Trail length (seconds)",
    label: "Moving object label"
  },
  addHeatmap: {
    data: "GeoJSON Point FeatureCollection",
    radius: "Heat influence radius (pixels)"
  },
  geocode: {
    address: 'Address, landmark, or place name, e.g. "\u6545\u5BAB", "Eiffel Tower", "\u6771\u4EAC\u30BF\u30EF\u30FC"',
    countryCode: 'Two-letter ISO country code to restrict search scope (e.g. "CN", "US", "JP")'
  }
};

// src/locales/zh-CN.ts
var toolDescriptions2 = {
  // — view
  flyTo: "\u98DE\u884C\u5230\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u4F4D\u7F6E\uFF08\u5E26\u52A8\u753B\u8FC7\u6E21\uFF09",
  setView: "\u77AC\u95F4\u5207\u6362\u5230\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u89C6\u89D2\uFF08\u65E0\u52A8\u753B\uFF09",
  getView: "\u83B7\u53D6\u5F53\u524D\u76F8\u673A\u89C6\u89D2\u4FE1\u606F\uFF08\u7ECF\u7EAC\u5EA6\u3001\u9AD8\u5EA6\u3001\u89D2\u5EA6\uFF09",
  zoomToExtent: "\u7F29\u653E\u5230\u6307\u5B9A\u5730\u7406\u8303\u56F4",
  saveViewpoint: "\u4FDD\u5B58\u5F53\u524D\u89C6\u89D2\u4E3A\u4E66\u7B7E\uFF08\u540D\u79F0 \u2192 \u89C6\u89D2\u72B6\u6001\uFF09\uFF0C\u53EF\u901A\u8FC7 loadViewpoint \u6062\u590D",
  loadViewpoint: "\u6062\u590D\u5DF2\u4FDD\u5B58\u7684\u89C6\u89D2\u4E66\u7B7E\uFF08\u5E26\u98DE\u884C\u52A8\u753B\uFF09\uFF0C\u8FD4\u56DE\u4FDD\u5B58\u7684\u89C6\u89D2\u72B6\u6001",
  listViewpoints: "\u5217\u51FA\u6240\u6709\u5DF2\u4FDD\u5B58\u7684\u89C6\u89D2\u4E66\u7B7E",
  // — entity
  addMarker: "\u5728\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u6DFB\u52A0\u6807\u6CE8\u70B9\uFF0C\u8FD4\u56DE layerId \u4F9B\u540E\u7EED\u64CD\u4F5C",
  addLabel: "\u4E3A GeoJSON \u8981\u7D20\u6DFB\u52A0\u6587\u672C\u6807\u6CE8\uFF08\u663E\u793A\u5C5E\u6027\u503C\uFF09",
  addModel: "\u5728\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u653E\u7F6E 3D \u6A21\u578B\uFF08glTF/GLB\uFF09\uFF0C\u8FD4\u56DE entityId",
  addPolygon: "\u5728\u5730\u56FE\u4E0A\u6DFB\u52A0\u591A\u8FB9\u5F62\u533A\u57DF\uFF08\u9762\u79EF\u3001\u8FB9\u754C\uFF09\uFF0C\u8FD4\u56DE entityId",
  addPolyline: "\u5728\u5730\u56FE\u4E0A\u6DFB\u52A0\u6298\u7EBF\uFF08\u8DEF\u5F84\u3001\u7EBF\u6BB5\uFF09\uFF0C\u8FD4\u56DE entityId",
  updateEntity: "\u66F4\u65B0\u5DF2\u6709\u5B9E\u4F53\u7684\u5C5E\u6027\uFF08\u4F4D\u7F6E\u3001\u989C\u8272\u3001\u6807\u7B7E\u3001\u7F29\u653E\u3001\u53EF\u89C1\u6027\uFF09",
  removeEntity: "\u79FB\u9664\u5355\u4E2A\u5B9E\u4F53\uFF08\u901A\u8FC7 entityId\uFF09",
  batchAddEntities: "\u6279\u91CF\u6DFB\u52A0\u591A\u4E2A\u5B9E\u4F53\uFF08\u4E00\u6B21\u8C03\u7528\u521B\u5EFA\u591A\u4E2A marker/polyline/polygon/model \u7B49\uFF09\uFF0C\u8FD4\u56DE\u6240\u6709 entityId",
  queryEntities: "\u67E5\u8BE2\u5DF2\u6709\u5B9E\u4F53 \u2014 \u6309\u540D\u79F0\u3001\u7C7B\u578B\u3001\u7A7A\u95F4\u8303\u56F4\u8FC7\u6EE4\uFF0C\u8FD4\u56DE entityId/name/type/position \u5217\u8868",
  // — layer
  addGeoJsonLayer: "\u6DFB\u52A0 GeoJSON \u56FE\u5C42\u5230\u5730\u56FE\uFF08\u652F\u6301 Point/Line/Polygon\uFF0C\u53EF\u914D\u7F6E\u989C\u8272/\u5206\u7EA7/\u5206\u7C7B\u6E32\u67D3\uFF09\u3002data \u548C url \u4E8C\u9009\u4E00",
  addGeoJsonPrimitive: "\u9AD8\u6027\u80FD\u52A0\u8F7D\u5927\u89C4\u6A21 GeoJSON \u6570\u636E\uFF0810\u4E07+ \u8981\u7D20\uFF09\u3002\u7ED5\u8FC7 Entity \u7CFB\u7EDF\uFF0C\u76F4\u63A5\u4F7F\u7528 Primitive \u6E32\u67D3\uFF0C\u9002\u5408\u6D77\u91CF\u6570\u636E\u53EF\u89C6\u5316\u3002data \u548C url \u4E8C\u9009\u4E00",
  listLayers: "\u83B7\u53D6\u5F53\u524D\u6240\u6709\u56FE\u5C42\u5217\u8868\uFF08\u542B ID\u3001\u540D\u79F0\u3001\u7C7B\u578B\u3001\u53EF\u89C1\u6027\uFF09",
  getLayerSchema: "\u83B7\u53D6\u56FE\u5C42\u7684\u5C5E\u6027\u5B57\u6BB5\u7ED3\u6784 \u2014 \u8FD4\u56DE\u5B57\u6BB5\u540D\u3001\u7C7B\u578B\u3001\u793A\u4F8B\u503C\uFF0C\u9002\u7528\u4E8E GeoJSON/CZML/KML/3D Tiles \u56FE\u5C42",
  removeLayer: "\u4ECE\u5730\u56FE\u4E0A\u79FB\u9664\u6307\u5B9A\u56FE\u5C42\uFF08\u6309\u56FE\u5C42ID\uFF09",
  setLayerVisibility: "\u8BBE\u7F6E\u56FE\u5C42\u53EF\u89C1\u6027",
  updateLayerStyle: "\u4FEE\u6539\u5DF2\u6709\u56FE\u5C42\u7684\u6837\u5F0F\uFF08\u989C\u8272\u3001\u900F\u660E\u5EA6\u3001\u6807\u6CE8\u6837\u5F0F\u30013D Tiles \u6837\u5F0F\u7B49\uFF09",
  setBasemap: "\u5207\u6362\u5E95\u56FE\u98CE\u683C\uFF08\u6697\u8272/\u536B\u661F/\u6807\u51C6/OSM/ArcGIS/\u6D45\u8272/\u5929\u5730\u56FE/\u9AD8\u5FB7\u7B49\uFF09",
  // — camera
  lookAtTransform: "\u4ECE\u6307\u5B9A\u822A\u5411/\u4FEF\u4EF0/\u8DDD\u79BB\u89C2\u5BDF\u7279\u5B9A\u4F4D\u7F6E\uFF08\u73AF\u7ED5\u5F0F\u76F8\u673A\uFF09",
  startOrbit: "\u5F00\u59CB\u56F4\u7ED5\u5F53\u524D\u89C6\u56FE\u4E2D\u5FC3\u65CB\u8F6C\u76F8\u673A",
  stopOrbit: "\u505C\u6B62\u76F8\u673A\u73AF\u7ED5\u52A8\u753B",
  setCameraOptions: "\u914D\u7F6E\u76F8\u673A\u63A7\u5236\u5668\u9009\u9879\uFF08\u542F\u7528/\u7981\u7528\u65CB\u8F6C\u3001\u7F29\u653E\u3001\u503E\u659C\u7B49\uFF09",
  // — entity-ext
  addBillboard: "\u5728\u5730\u7403\u4E0A\u6307\u5B9A\u4F4D\u7F6E\u6DFB\u52A0\u5E7F\u544A\u724C\uFF08\u56FE\u7247\u56FE\u6807\uFF09",
  addBox: "\u5728\u6307\u5B9A\u4F4D\u7F6E\u6DFB\u52A0 3D \u76D2\u5B50\u5B9E\u4F53",
  addCorridor: "\u6DFB\u52A0\u8D70\u5ECA\uFF08\u5E26\u5BBD\u5EA6\u7684\u8DEF\u5F84\uFF09\u5B9E\u4F53",
  addCylinder: "\u5728\u6307\u5B9A\u4F4D\u7F6E\u6DFB\u52A0\u5706\u67F1\u4F53\u6216\u5706\u9525\u4F53\u5B9E\u4F53",
  addEllipse: "\u5728\u6307\u5B9A\u4F4D\u7F6E\u6DFB\u52A0\u692D\u5706\u5F62\u5B9E\u4F53",
  addRectangle: "\u6DFB\u52A0\u7531\u5730\u7406\u8FB9\u754C\u5B9A\u4E49\u7684\u77E9\u5F62\u5B9E\u4F53",
  addWall: "\u6CBF\u4E00\u7CFB\u5217\u4F4D\u7F6E\u6DFB\u52A0\u5899\u4F53\u5B9E\u4F53",
  // — animation
  createAnimation: "\u521B\u5EFA\u57FA\u4E8E\u65F6\u95F4\u7684\u822A\u70B9\u52A8\u753B\uFF08\u5B9E\u4F53\u6CBF\u8DEF\u5F84\u79FB\u52A8\uFF09",
  controlAnimation: "\u64AD\u653E\u6216\u6682\u505C\u5F53\u524D\u52A8\u753B",
  removeAnimation: "\u79FB\u9664\u52A8\u753B\u5B9E\u4F53",
  listAnimations: "\u5217\u51FA\u6240\u6709\u6D3B\u52A8\u52A8\u753B",
  updateAnimationPath: "\u66F4\u65B0\u52A8\u753B\u8DEF\u5F84\u7684\u89C6\u89C9\u5C5E\u6027",
  trackEntity: "\u7528\u76F8\u673A\u8DDF\u8E2A\uFF08\u8DDF\u968F\uFF09\u5B9E\u4F53\uFF0C\u6216\u505C\u6B62\u8DDF\u8E2A",
  controlClock: "\u914D\u7F6E Cesium \u65F6\u949F\uFF08\u65F6\u95F4\u8303\u56F4\u3001\u901F\u5EA6\u3001\u52A8\u753B\u72B6\u6001\uFF09",
  setGlobeLighting: "\u542F\u7528/\u7981\u7528\u5730\u7403\u5149\u7167\u548C\u5927\u6C14\u6548\u679C",
  // — scene
  setSceneOptions: "\u914D\u7F6E\u573A\u666F\u73AF\u5883\uFF08\u96FE\u3001\u5927\u6C14\u3001\u9634\u5F71\u3001\u592A\u9633\u3001\u6708\u4EAE\u3001\u80CC\u666F\u8272\u3001\u6DF1\u5EA6\u6D4B\u8BD5\uFF09",
  setPostProcess: "\u914D\u7F6E\u540E\u5904\u7406\u7279\u6548\uFF08\u6CDB\u5149\u3001\u73AF\u5883\u5149\u906E\u853D SSAO\u3001\u6297\u952F\u9F7F FXAA\uFF09",
  // — tiles
  load3dTiles: "\u52A0\u8F7D 3D Tiles \u6570\u636E\u96C6\uFF08\u5982\u5EFA\u7B51\u767D\u819C\u3001\u57CE\u5E02\u6A21\u578B\uFF09",
  loadTerrain: "\u52A0\u8F7D\u6216\u5207\u6362\u5730\u5F62\uFF08\u5E73\u5766/ArcGIS/CesiumIon/\u81EA\u5B9A\u4E49 URL\uFF09",
  loadImageryService: "\u52A0\u8F7D\u5F71\u50CF\u670D\u52A1\u56FE\u5C42\uFF08WMS/WMTS/XYZ/ArcGIS MapServer\uFF09",
  loadCzml: "\u52A0\u8F7D CZML \u65F6\u5E8F\u6570\u636E\u6E90\uFF08CesiumJS \u539F\u751F\u683C\u5F0F\uFF0C\u652F\u6301\u65F6\u53D8\u4F4D\u7F6E/\u6837\u5F0F/\u52A8\u753B\uFF09\u3002data \u548C url \u4E8C\u9009\u4E00",
  loadKml: "\u52A0\u8F7D KML/KMZ \u6570\u636E\u6E90\uFF08Google Earth \u683C\u5F0F\uFF09\u3002data \u548C url \u4E8C\u9009\u4E00",
  // — interaction
  screenshot: "\u622A\u53D6\u5F53\u524D\u5730\u56FE\u89C6\u56FE\uFF08\u8FD4\u56DE base64 PNG\uFF09",
  highlight: "\u9AD8\u4EAE\u6307\u5B9A\u56FE\u5C42\u7684\u8981\u7D20",
  measure: "\u6D4B\u91CF\u8DDD\u79BB\u6216\u9762\u79EF\uFF08\u57FA\u4E8E\u5750\u6807\u8BA1\u7B97\uFF0C\u53EF\u5728\u5730\u56FE\u4E0A\u663E\u793A\uFF09",
  // — clear
  clearAll: "\u6E05\u9664\u5730\u56FE\u4E0A\u7684\u6240\u6709\u56FE\u5C42\u3001\u5B9E\u4F53\u3001\u52A8\u753B\u548C\u8F68\u8FF9\uFF08\u4E00\u952E\u91CD\u7F6E\u573A\u666F\uFF09",
  // — entity inspection
  getEntityProperties: "\u83B7\u53D6\u6307\u5B9A\u5B9E\u4F53\u7684\u8BE6\u7EC6\u5C5E\u6027 \u2014 \u5305\u62EC\u7C7B\u578B\u3001\u4F4D\u7F6E\u3001\u81EA\u5B9A\u4E49\u5C5E\u6027\u548C\u56FE\u5F62\u5C5E\u6027",
  // — scene export
  exportScene: "\u5BFC\u51FA\u5F53\u524D\u573A\u666F\u5FEB\u7167 \u2014 \u5305\u542B\u89C6\u89D2\u3001\u56FE\u5C42\u5217\u8868\u3001\u5B9E\u4F53\u5217\u8868\u548C\u65F6\u95F4\u6233",
  // — trajectory
  playTrajectory: "\u64AD\u653E\u79FB\u52A8\u8F68\u8FF9\u52A8\u753B",
  // — heatmap
  addHeatmap: "\u6DFB\u52A0\u70ED\u529B\u56FE\u56FE\u5C42\uFF08\u57FA\u4E8E GeoJSON \u70B9\u6570\u636E\u751F\u6210\u70ED\u529B\u53EF\u89C6\u5316\uFF09",
  // — geolocation
  geocode: "\u5C06\u5730\u5740\u3001\u5730\u6807\u6216\u5730\u540D\u8F6C\u6362\u4E3A\u5730\u7406\u5750\u6807\uFF08\u7ECF\u7EAC\u5EA6\uFF09\u3002\u4F7F\u7528 OpenStreetMap Nominatim \u514D\u8D39\u670D\u52A1\uFF0C\u65E0\u9700 API Key\u3002"
};
var paramDescriptions2 = {
  flyTo: {
    longitude: "\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09",
    latitude: "\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09",
    height: "\u76F8\u673A\u9AD8\u5EA6\uFF08\u7C73\uFF09\uFF0C\u9ED8\u8BA4 50000",
    heading: "\u822A\u5411\u89D2\uFF08\u5EA6\uFF09\uFF0C0 \u4E3A\u6B63\u5317",
    pitch: "\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09\uFF0C-90 \u4E3A\u6B63\u4E0B\u65B9",
    duration: "\u98DE\u884C\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09"
  },
  setView: {
    longitude: "\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09",
    latitude: "\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09",
    height: "\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    heading: "\u822A\u5411\u89D2\uFF08\u5EA6\uFF09",
    pitch: "\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09",
    roll: "\u7FFB\u6EDA\u89D2\uFF08\u5EA6\uFF09"
  },
  zoomToExtent: {
    west: "\u897F\u8FB9\u754C\u7ECF\u5EA6\uFF08\u5EA6\uFF09",
    south: "\u5357\u8FB9\u754C\u7EAC\u5EA6\uFF08\u5EA6\uFF09",
    east: "\u4E1C\u8FB9\u754C\u7ECF\u5EA6\uFF08\u5EA6\uFF09",
    north: "\u5317\u8FB9\u754C\u7EAC\u5EA6\uFF08\u5EA6\uFF09",
    duration: "\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09"
  },
  saveViewpoint: {
    name: "\u4E66\u7B7E\u540D\u79F0\uFF08\u552F\u4E00\u6807\u8BC6\uFF0C\u91CD\u590D\u5219\u8986\u76D6\uFF09"
  },
  loadViewpoint: {
    name: "\u4E66\u7B7E\u540D\u79F0",
    duration: "\u98DE\u884C\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09\uFF0C0 \u8868\u793A\u77AC\u79FB"
  },
  addMarker: {
    longitude: "\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09",
    latitude: "\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09",
    label: "\u6807\u6CE8\u6587\u672C",
    color: "\u6807\u6CE8\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09",
    size: "\u70B9\u5927\u5C0F\uFF08\u50CF\u7D20\uFF09",
    id: "\u81EA\u5B9A\u4E49\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09"
  },
  addLabel: {
    data: "GeoJSON FeatureCollection \u5BF9\u8C61",
    field: '\u7528\u4F5C\u6807\u6CE8\u6587\u672C\u7684\u5C5E\u6027\u5B57\u6BB5\u540D\uFF08\u5982 "name"\u3001"population"\uFF09',
    style: "\u6807\u6CE8\u6837\u5F0F\uFF08font, fillColor, outlineColor, scale \u7B49\uFF09"
  },
  addModel: {
    longitude: "\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09",
    latitude: "\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09",
    height: "\u653E\u7F6E\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    url: "glTF/GLB \u6A21\u578B\u6587\u4EF6 URL",
    scale: "\u6A21\u578B\u7F29\u653E\u6BD4\u4F8B",
    heading: "\u822A\u5411\u89D2\uFF08\u5EA6\uFF09\uFF0C0=\u6B63\u5317",
    pitch: "\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09",
    roll: "\u7FFB\u6EDA\u89D2\uFF08\u5EA6\uFF09",
    label: "\u6A21\u578B\u6807\u6CE8\u6587\u672C"
  },
  addPolygon: {
    coordinates: "\u591A\u8FB9\u5F62\u5916\u73AF\u5750\u6807 [[lon, lat, height?], ...]",
    color: "\u586B\u5145\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09",
    outlineColor: "\u63CF\u8FB9\u989C\u8272",
    opacity: "\u586B\u5145\u900F\u660E\u5EA6\uFF080~1\uFF09",
    extrudedHeight: "\u62C9\u4F38\u9AD8\u5EA6\uFF08\u7C73\uFF09\uFF0C\u53EF\u7528\u4E8E\u521B\u5EFA\u7ACB\u4F53\u6548\u679C",
    clampToGround: "\u662F\u5426\u8D34\u5730",
    label: "\u591A\u8FB9\u5F62\u6807\u6CE8\u6587\u672C"
  },
  addPolyline: {
    coordinates: "\u6298\u7EBF\u5750\u6807\u6570\u7EC4 [[lon, lat, height?], ...]",
    color: "\u7EBF\u6761\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09",
    width: "\u7EBF\u6761\u5BBD\u5EA6\uFF08\u50CF\u7D20\uFF09",
    clampToGround: "\u662F\u5426\u8D34\u5730",
    label: "\u6298\u7EBF\u6807\u6CE8\u6587\u672C"
  },
  updateEntity: {
    entityId: "\u5B9E\u4F53ID\uFF08addMarker/addPolyline \u7B49\u8FD4\u56DE\u7684 entityId\uFF09",
    position: "\u65B0\u4F4D\u7F6E\u5750\u6807",
    label: "\u65B0\u6807\u6CE8\u6587\u672C",
    color: "\u65B0\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09",
    scale: "\u65B0\u7F29\u653E\u6BD4\u4F8B",
    show: "\u662F\u5426\u663E\u793A"
  },
  removeEntity: {
    entityId: "\u8981\u79FB\u9664\u7684\u5B9E\u4F53ID"
  },
  batchAddEntities: {
    entities: "\u5B9E\u4F53\u5B9A\u4E49\u6570\u7EC4\uFF0C\u6BCF\u4E2A\u5143\u7D20\u5305\u542B type \u5B57\u6BB5\u548C\u8BE5\u7C7B\u578B\u6240\u9700\u7684\u53C2\u6570"
  },
  queryEntities: {
    name: "\u540D\u79F0\u6A21\u7CCA\u5339\u914D\uFF08\u4E0D\u533A\u5206\u5927\u5C0F\u5199\uFF09",
    type: "\u6309\u5B9E\u4F53\u7C7B\u578B\u8FC7\u6EE4",
    bbox: "\u7A7A\u95F4\u8303\u56F4\u8FC7\u6EE4 [west, south, east, north]\uFF08\u5EA6\uFF09"
  },
  addGeoJsonLayer: {
    id: "\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09",
    name: "\u56FE\u5C42\u663E\u793A\u540D\u79F0",
    data: "GeoJSON FeatureCollection \u5BF9\u8C61\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09",
    url: "GeoJSON \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF0C\u6D4F\u89C8\u5668\u7AEF fetch \u52A0\u8F7D\uFF09",
    style: "\u6837\u5F0F\u914D\u7F6E\uFF08color, opacity, pointSize, choropleth, category\uFF09"
  },
  addGeoJsonPrimitive: {
    id: "\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09",
    name: "\u56FE\u5C42\u663E\u793A\u540D\u79F0",
    data: "GeoJSON \u5BF9\u8C61\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09",
    url: "GeoJSON \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF09",
    allowPicking: "\u662F\u5426\u5141\u8BB8\u62FE\u53D6\uFF08\u9ED8\u8BA4 true\uFF0C\u5173\u95ED\u53EF\u63D0\u5347\u6027\u80FD\uFF09",
    show: "\u662F\u5426\u663E\u793A\uFF08\u9ED8\u8BA4 true\uFF09"
  },
  listLayers: {},
  getLayerSchema: {
    layerId: "\u56FE\u5C42ID\uFF08\u53EF\u901A\u8FC7 listLayers \u83B7\u53D6\uFF09"
  },
  removeLayer: {
    id: "\u8981\u79FB\u9664\u7684\u56FE\u5C42ID\uFF08\u53EF\u901A\u8FC7 listLayers \u83B7\u53D6\uFF09"
  },
  setLayerVisibility: {
    id: "\u56FE\u5C42ID",
    visible: "\u662F\u5426\u53EF\u89C1"
  },
  updateLayerStyle: {
    layerId: "\u56FE\u5C42ID",
    labelStyle: "\u6807\u6CE8\u6837\u5F0F\uFF08font, fillColor, outlineColor, outlineWidth, scale \u7B49\uFF09",
    layerStyle: "\u5B9E\u4F53\u56FE\u5C42\u6837\u5F0F\uFF08color, opacity, strokeWidth, pointSize\uFF1BGeoJSON \u4E3B\u9898\u6837\u5F0F choropleth/category/randomColor/gradient \u4E92\u65A5\uFF09",
    imageryStyle: "\u5F71\u50CF\u56FE\u5C42\u89C6\u89C9\u6837\u5F0F\uFF08alpha, brightness, contrast, hue, saturation, gamma\uFF09\uFF1B\u663E\u9690\u8BF7\u4F7F\u7528 setLayerVisibility",
    primitiveStyle: "GeoJSON Primitive \u6750\u8D28\u6837\u5F0F\uFF08color, opacity, outlineColor, outlineWidth, pointSize, lineWidth\uFF09\uFF1B\u663E\u9690\u8BF7\u4F7F\u7528 setLayerVisibility",
    tileStyle: "3D Tiles \u6837\u5F0F\uFF08Cesium3DTileStyle \u8868\u8FBE\u5F0F\uFF1Acolor, show, pointSize, meta\uFF09"
  },
  setBasemap: {
    basemap: "\u5E95\u56FE\u7C7B\u578B\uFF1Adark=\u6697\u8272, satellite=\u536B\u661F\u5F71\u50CF, standard=\u6807\u51C6, osm=OpenStreetMap, arcgis=ArcGIS\u8857\u9053, light=\u6D45\u8272, tianditu_vec=\u5929\u5730\u56FE\u77E2\u91CF, tianditu_img=\u5929\u5730\u56FE\u5F71\u50CF, amap=\u9AD8\u5FB7\u5730\u56FE, amap_satellite=\u9AD8\u5FB7\u536B\u661F",
    token: "\u5E95\u56FE\u670D\u52A1\u4EE4\u724C\uFF08\u5929\u5730\u56FE\u7B49\u9700\u8981\u8BA4\u8BC1\u7684\u670D\u52A1\u5FC5\u586B\uFF09",
    url: "\u81EA\u5B9A\u4E49URL\u6A21\u677F\uFF08{x},{y},{z}\u5360\u4F4D\u7B26\uFF09\uFF0C\u63D0\u4F9B\u65F6\u5FFD\u7565basemap\u53C2\u6570"
  },
  highlight: {
    layerId: "\u56FE\u5C42ID",
    featureIndex: "\u8981\u7D20\u7D22\u5F15\uFF08\u4E0D\u4F20\u5219\u9AD8\u4EAE\u5168\u90E8\uFF09",
    color: "\u9AD8\u4EAE\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"
  },
  measure: {
    mode: "\u6D4B\u91CF\u6A21\u5F0F\uFF1Adistance=\u8DDD\u79BB, area=\u9762\u79EF",
    positions: "\u5750\u6807\u6570\u7EC4 [[\u7ECF\u5EA6, \u7EAC\u5EA6, \u9AD8\u5EA6?], ...]",
    showOnMap: "\u662F\u5426\u5728\u5730\u56FE\u4E0A\u663E\u793A\u6D4B\u91CF\u7ED3\u679C",
    id: "\u81EA\u5B9A\u4E49\u6D4B\u91CF\u5B9E\u4F53ID"
  },
  getEntityProperties: {
    entityId: "\u5B9E\u4F53ID\uFF08\u53EF\u901A\u8FC7 queryEntities \u83B7\u53D6\uFF09"
  },
  lookAtTransform: {
    longitude: "\u76EE\u6807\u7ECF\u5EA6\uFF08\u5EA6\uFF09",
    latitude: "\u76EE\u6807\u7EAC\u5EA6\uFF08\u5EA6\uFF09",
    height: "\u76EE\u6807\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    heading: "\u76F8\u673A\u822A\u5411\u89D2\uFF08\u5EA6\uFF09\uFF0C0=\u6B63\u5317",
    pitch: "\u76F8\u673A\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09\uFF0C-90=\u6B63\u4E0B\u65B9",
    range: "\u8DDD\u76EE\u6807\u8DDD\u79BB\uFF08\u7C73\uFF09"
  },
  startOrbit: {
    speed: "\u65CB\u8F6C\u901F\u5EA6\uFF08\u5F27\u5EA6/\u5E27\uFF09",
    clockwise: "\u65CB\u8F6C\u65B9\u5411"
  },
  setCameraOptions: {
    enableRotate: "\u542F\u7528\u76F8\u673A\u65CB\u8F6C",
    enableTranslate: "\u542F\u7528\u76F8\u673A\u5E73\u79FB",
    enableZoom: "\u542F\u7528\u76F8\u673A\u7F29\u653E",
    enableTilt: "\u542F\u7528\u76F8\u673A\u503E\u659C",
    enableLook: "\u542F\u7528\u76F8\u673A\u73AF\u89C6",
    minimumZoomDistance: "\u6700\u5C0F\u7F29\u653E\u8DDD\u79BB\uFF08\u7C73\uFF09",
    maximumZoomDistance: "\u6700\u5927\u7F29\u653E\u8DDD\u79BB\uFF08\u7C73\uFF09",
    enableInputs: "\u542F\u7528/\u7981\u7528\u6240\u6709\u76F8\u673A\u8F93\u5165"
  },
  addBillboard: {
    longitude: "\u7ECF\u5EA6\uFF08\u5EA6\uFF09",
    latitude: "\u7EAC\u5EA6\uFF08\u5EA6\uFF09",
    height: "\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    name: "\u5E7F\u544A\u724C\u540D\u79F0",
    image: "\u5E7F\u544A\u724C\u56FE\u7247 URL",
    scale: "\u7F29\u653E\u6BD4\u4F8B",
    color: "\u7740\u8272\u989C\u8272",
    pixelOffset: "\u4F4D\u7F6E\u50CF\u7D20\u504F\u79FB",
    horizontalOrigin: "\u6C34\u5E73\u539F\u70B9",
    verticalOrigin: "\u5782\u76F4\u539F\u70B9",
    heightReference: "\u9AD8\u5EA6\u53C2\u8003"
  },
  addBox: {
    longitude: "\u7ECF\u5EA6\uFF08\u5EA6\uFF09",
    latitude: "\u7EAC\u5EA6\uFF08\u5EA6\uFF09",
    height: "\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    name: "\u76D2\u5B50\u540D\u79F0",
    dimensions: "\u76D2\u5B50\u5C3A\u5BF8",
    material: "\u6750\u8D28\uFF08\u989C\u8272\u5B57\u7B26\u4E32\u3001RGBA \u5BF9\u8C61\u6216\u6750\u8D28\u89C4\u683C\uFF09",
    outline: "\u663E\u793A\u8F6E\u5ED3\u7EBF",
    outlineColor: "\u8F6E\u5ED3\u7EBF\u989C\u8272",
    fill: "\u663E\u793A\u586B\u5145",
    orientation: "\u671D\u5411\uFF08\u822A\u5411/\u4FEF\u4EF0/\u7FFB\u6EDA\u89D2\u5EA6\uFF09",
    heightReference: "\u9AD8\u5EA6\u53C2\u8003"
  },
  addCorridor: {
    name: "\u8D70\u5ECA\u540D\u79F0",
    positions: "\u8D70\u5ECA\u6CBF\u7EBF\u4F4D\u7F6E\u6570\u7EC4",
    width: "\u8D70\u5ECA\u5BBD\u5EA6\uFF08\u7C73\uFF09",
    material: "\u6750\u8D28",
    cornerType: "\u62D0\u89D2\u7C7B\u578B",
    height: "\u79BB\u5730\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    extrudedHeight: "\u62C9\u4F38\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    outline: "\u663E\u793A\u8F6E\u5ED3\u7EBF",
    outlineColor: "\u8F6E\u5ED3\u7EBF\u989C\u8272"
  },
  addCylinder: {
    longitude: "\u7ECF\u5EA6\uFF08\u5EA6\uFF09",
    latitude: "\u7EAC\u5EA6\uFF08\u5EA6\uFF09",
    height: "\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    name: "\u5706\u67F1\u4F53\u540D\u79F0",
    length: "\u5706\u67F1\u4F53\u957F\u5EA6/\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    topRadius: "\u9876\u90E8\u534A\u5F84\uFF08\u7C73\uFF09",
    bottomRadius: "\u5E95\u90E8\u534A\u5F84\uFF08\u7C73\uFF09",
    material: "\u6750\u8D28",
    outline: "\u663E\u793A\u8F6E\u5ED3\u7EBF",
    outlineColor: "\u8F6E\u5ED3\u7EBF\u989C\u8272",
    fill: "\u663E\u793A\u586B\u5145",
    orientation: "\u671D\u5411\uFF08\u822A\u5411/\u4FEF\u4EF0/\u7FFB\u6EDA\u89D2\u5EA6\uFF09",
    numberOfVerticalLines: "\u5782\u76F4\u7EBF\u6761\u6570",
    slices: "\u5206\u7247\u6570"
  },
  addEllipse: {
    longitude: "\u4E2D\u5FC3\u7ECF\u5EA6\uFF08\u5EA6\uFF09",
    latitude: "\u4E2D\u5FC3\u7EAC\u5EA6\uFF08\u5EA6\uFF09",
    height: "\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    name: "\u692D\u5706\u540D\u79F0",
    semiMajorAxis: "\u534A\u957F\u8F74\uFF08\u7C73\uFF09",
    semiMinorAxis: "\u534A\u77ED\u8F74\uFF08\u7C73\uFF09",
    material: "\u6750\u8D28",
    extrudedHeight: "\u62C9\u4F38\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    rotation: "\u65CB\u8F6C\u89D2\uFF08\u5F27\u5EA6\uFF09",
    outline: "\u663E\u793A\u8F6E\u5ED3\u7EBF",
    outlineColor: "\u8F6E\u5ED3\u7EBF\u989C\u8272",
    fill: "\u663E\u793A\u586B\u5145",
    stRotation: "\u7EB9\u7406\u65CB\u8F6C\u89D2\uFF08\u5F27\u5EA6\uFF09",
    numberOfVerticalLines: "\u5782\u76F4\u7EBF\u6761\u6570"
  },
  addRectangle: {
    name: "\u77E9\u5F62\u540D\u79F0",
    west: "\u897F\u8FB9\u754C\u7ECF\u5EA6\uFF08\u5EA6\uFF09",
    south: "\u5357\u8FB9\u754C\u7EAC\u5EA6\uFF08\u5EA6\uFF09",
    east: "\u4E1C\u8FB9\u754C\u7ECF\u5EA6\uFF08\u5EA6\uFF09",
    north: "\u5317\u8FB9\u754C\u7EAC\u5EA6\uFF08\u5EA6\uFF09",
    material: "\u6750\u8D28",
    height: "\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    extrudedHeight: "\u62C9\u4F38\u9AD8\u5EA6\uFF08\u7C73\uFF09",
    rotation: "\u65CB\u8F6C\u89D2\uFF08\u5F27\u5EA6\uFF09",
    outline: "\u663E\u793A\u8F6E\u5ED3\u7EBF",
    outlineColor: "\u8F6E\u5ED3\u7EBF\u989C\u8272",
    fill: "\u663E\u793A\u586B\u5145",
    stRotation: "\u7EB9\u7406\u65CB\u8F6C\u89D2\uFF08\u5F27\u5EA6\uFF09"
  },
  addWall: {
    name: "\u5899\u4F53\u540D\u79F0",
    positions: "\u5899\u4F53\u6CBF\u7EBF\u4F4D\u7F6E\u6570\u7EC4",
    minimumHeights: "\u5404\u4F4D\u7F6E\u6700\u5C0F\u9AD8\u5EA6",
    maximumHeights: "\u5404\u4F4D\u7F6E\u6700\u5927\u9AD8\u5EA6",
    material: "\u6750\u8D28",
    outline: "\u663E\u793A\u8F6E\u5ED3\u7EBF",
    outlineColor: "\u8F6E\u5ED3\u7EBF\u989C\u8272",
    fill: "\u663E\u793A\u586B\u5145"
  },
  createAnimation: {
    name: "\u52A8\u753B\u540D\u79F0",
    waypoints: "\u5E26\u4F4D\u7F6E\u548C\u65F6\u95F4\u6233\u7684\u822A\u70B9\u6570\u7EC4",
    modelUri: "glTF/GLB \u6A21\u578B URL\uFF0C\u6216\u9884\u8BBE\uFF1Acesium_man, cesium_air, ground_vehicle, cesium_drone",
    showPath: "\u663E\u793A\u8F68\u8FF9\u8DEF\u5F84",
    pathWidth: "\u8DEF\u5F84\u5BBD\u5EA6\uFF08\u50CF\u7D20\uFF09",
    pathColor: "\u8DEF\u5F84\u989C\u8272\uFF08CSS\uFF09",
    pathLeadTime: "\u8DEF\u5F84\u524D\u5BFC\u65F6\u95F4\uFF08\u79D2\uFF09",
    pathTrailTime: "\u8DEF\u5F84\u5C3E\u8FF9\u65F6\u95F4\uFF08\u79D2\uFF09",
    multiplier: "\u65F6\u949F\u901F\u7387\u500D\u6570",
    shouldAnimate: "\u81EA\u52A8\u5F00\u59CB\u52A8\u753B"
  },
  controlAnimation: {
    action: "\u64AD\u653E\u6216\u6682\u505C"
  },
  removeAnimation: {
    entityId: "\u8981\u79FB\u9664\u7684\u52A8\u753B\u5B9E\u4F53 ID"
  },
  updateAnimationPath: {
    entityId: "\u52A8\u753B\u5B9E\u4F53 ID",
    width: "\u65B0\u8DEF\u5F84\u5BBD\u5EA6\uFF08\u50CF\u7D20\uFF09",
    color: "\u65B0\u8DEF\u5F84\u989C\u8272\uFF08CSS\uFF09",
    leadTime: "\u65B0\u524D\u5BFC\u65F6\u95F4\uFF08\u79D2\uFF09",
    trailTime: "\u65B0\u5C3E\u8FF9\u65F6\u95F4\uFF08\u79D2\uFF09",
    show: "\u663E\u793A/\u9690\u85CF\u8DEF\u5F84"
  },
  trackEntity: {
    entityId: "\u8981\u8DDF\u8E2A\u7684\u5B9E\u4F53 ID\uFF08\u7701\u7565\u5219\u505C\u6B62\u8DDF\u8E2A\uFF09",
    heading: "\u76F8\u673A\u822A\u5411\u89D2\uFF08\u5EA6\uFF09",
    pitch: "\u76F8\u673A\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09",
    range: "\u76F8\u673A\u8DDD\u5B9E\u4F53\u8DDD\u79BB\uFF08\u7C73\uFF09"
  },
  controlClock: {
    action: "\u65F6\u949F\u64CD\u4F5C",
    startTime: "ISO 8601 \u5F00\u59CB\u65F6\u95F4\uFF08\u7528\u4E8E configure\uFF09",
    stopTime: "ISO 8601 \u7ED3\u675F\u65F6\u95F4\uFF08\u7528\u4E8E configure\uFF09",
    currentTime: "ISO 8601 \u5F53\u524D\u65F6\u95F4\uFF08\u7528\u4E8E configure\uFF09",
    time: "ISO 8601 \u8DF3\u8F6C\u65F6\u95F4\uFF08\u7528\u4E8E setTime\uFF09",
    multiplier: "\u65F6\u949F\u901F\u7387\u500D\u6570\uFF08\u7528\u4E8E configure/setMultiplier\uFF09",
    shouldAnimate: "\u662F\u5426\u64AD\u653E\u52A8\u753B\uFF08\u7528\u4E8E configure\uFF09",
    clockRange: "\u65F6\u949F\u8303\u56F4\u6A21\u5F0F\uFF08\u7528\u4E8E configure\uFF09"
  },
  setGlobeLighting: {
    enableLighting: "\u542F\u7528\u5730\u7403\u5149\u7167",
    dynamicAtmosphereLighting: "\u542F\u7528\u52A8\u6001\u5927\u6C14\u5149\u7167",
    dynamicAtmosphereLightingFromSun: "\u4F7F\u7528\u592A\u9633\u4F4D\u7F6E\u8FDB\u884C\u5927\u6C14\u5149\u7167"
  },
  setSceneOptions: {
    fogEnabled: "\u542F\u7528/\u7981\u7528\u96FE\u6548",
    fogDensity: "\u96FE\u7684\u5BC6\u5EA6\uFF080.0~1.0\uFF0C\u9ED8\u8BA4\u7EA6 0.0002\uFF09",
    fogMinimumBrightness: "\u96FE\u7684\u6700\u4F4E\u4EAE\u5EA6\uFF080.0~1.0\uFF09",
    skyAtmosphereShow: "\u663E\u793A\u5929\u7A7A\u5927\u6C14",
    skyAtmosphereHueShift: "\u5929\u7A7A\u8272\u8C03\u504F\u79FB\uFF08-1.0~1.0\uFF09",
    skyAtmosphereSaturationShift: "\u5929\u7A7A\u9971\u548C\u5EA6\u504F\u79FB\uFF08-1.0~1.0\uFF09",
    skyAtmosphereBrightnessShift: "\u5929\u7A7A\u4EAE\u5EA6\u504F\u79FB\uFF08-1.0~1.0\uFF09",
    groundAtmosphereShow: "\u663E\u793A\u5730\u9762\u5927\u6C14",
    shadowsEnabled: "\u542F\u7528\u9634\u5F71",
    shadowsSoftShadows: "\u4F7F\u7528\u8F6F\u9634\u5F71",
    shadowsDarkness: "\u9634\u5F71\u6697\u5EA6\uFF080.0=\u65E0\u9634\u5F71\uFF0C1.0=\u5168\u6697\uFF09",
    sunShow: "\u663E\u793A\u592A\u9633",
    sunGlowFactor: "\u592A\u9633\u5149\u6655\u7CFB\u6570\uFF08\u9ED8\u8BA4 1.0\uFF09",
    moonShow: "\u663E\u793A\u6708\u4EAE",
    depthTestAgainstTerrain: "\u542F\u7528\u5730\u5F62\u6DF1\u5EA6\u6D4B\u8BD5\uFF08\u5730\u5F62\u540E\u65B9\u5B9E\u4F53\u5C06\u88AB\u9690\u85CF\uFF09",
    backgroundColor: '\u573A\u666F\u80CC\u666F\u8272\uFF08CSS \u683C\u5F0F\uFF0C\u5982 "#000000"\uFF09'
  },
  setPostProcess: {
    bloom: "\u542F\u7528\u6CDB\u5149\u7279\u6548",
    bloomContrast: "\u6CDB\u5149\u5BF9\u6BD4\u5EA6\uFF08\u9ED8\u8BA4 128\uFF09",
    bloomBrightness: "\u6CDB\u5149\u4EAE\u5EA6\uFF08\u9ED8\u8BA4 -0.3\uFF09",
    bloomDelta: "\u6CDB\u5149 delta\uFF08\u9ED8\u8BA4 1.0\uFF09",
    bloomSigma: "\u6CDB\u5149 sigma\uFF08\u9ED8\u8BA4 3.78\uFF09",
    bloomStepSize: "\u6CDB\u5149\u6B65\u957F\uFF08\u9ED8\u8BA4 5.0\uFF09",
    bloomGlowOnly: "\u4EC5\u663E\u793A\u53D1\u5149\u6548\u679C\uFF08\u4E0D\u663E\u793A\u57FA\u7840\u573A\u666F\uFF09",
    ambientOcclusion: "\u542F\u7528\u73AF\u5883\u5149\u906E\u853D\uFF08SSAO\uFF09",
    aoIntensity: "AO \u5F3A\u5EA6\uFF08\u9ED8\u8BA4 3.0\uFF09",
    aoBias: "AO \u504F\u5DEE\uFF08\u9ED8\u8BA4 0.1\uFF09",
    aoLengthCap: "AO \u957F\u5EA6\u4E0A\u9650\uFF08\u9ED8\u8BA4 0.26\uFF09",
    aoStepSize: "AO \u6B65\u957F\uFF08\u9ED8\u8BA4 1.95\uFF09",
    fxaa: "\u542F\u7528 FXAA \u6297\u952F\u9F7F"
  },
  load3dTiles: {
    id: "\u56FE\u5C42ID",
    name: "\u56FE\u5C42\u540D\u79F0",
    url: "tileset.json \u7684 URL",
    maximumScreenSpaceError: "\u6700\u5927\u5C4F\u5E55\u7A7A\u95F4\u8BEF\u5DEE\uFF08\u503C\u8D8A\u5C0F\u8D8A\u7CBE\u7EC6\uFF09",
    heightOffset: "\u9AD8\u5EA6\u504F\u79FB\uFF08\u7C73\uFF09"
  },
  loadTerrain: {
    provider: "\u5730\u5F62\u63D0\u4F9B\u8005\u7C7B\u578B",
    url: "\u81EA\u5B9A\u4E49\u5730\u5F62\u670D\u52A1 URL",
    cesiumIonAssetId: "Cesium Ion \u8D44\u4EA7ID\uFF08provider=cesiumion \u65F6\u9700\u8981\uFF09"
  },
  loadImageryService: {
    id: "\u56FE\u5C42ID",
    name: "\u56FE\u5C42\u540D\u79F0",
    url: "\u5F71\u50CF\u670D\u52A1 URL",
    serviceType: "\u670D\u52A1\u7C7B\u578B",
    layerName: "WMS/WMTS \u56FE\u5C42\u540D",
    opacity: "\u900F\u660E\u5EA6\uFF080~1\uFF09"
  },
  loadCzml: {
    id: "\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09",
    name: "\u6570\u636E\u6E90\u663E\u793A\u540D\u79F0",
    data: "CZML \u6570\u636E\u5305\u6570\u7EC4\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09",
    url: "CZML \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF0C\u6D4F\u89C8\u5668\u7AEF fetch \u52A0\u8F7D\uFF09",
    sourceUri: "CZML \u4E2D\u76F8\u5BF9\u5F15\u7528\u7684\u57FA\u7840 URI",
    clampToGround: "\u5C06\u5B9E\u4F53\u8D34\u5730\u663E\u793A",
    flyTo: "\u52A0\u8F7D\u540E\u81EA\u52A8\u98DE\u884C\u5230\u6570\u636E\u8303\u56F4\uFF08\u9ED8\u8BA4 true\uFF09"
  },
  loadKml: {
    id: "\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09",
    name: "\u6570\u636E\u6E90\u663E\u793A\u540D\u79F0",
    url: "KML/KMZ \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF0C\u6D4F\u89C8\u5668\u7AEF fetch \u52A0\u8F7D\uFF09",
    data: "KML XML \u5B57\u7B26\u4E32\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09",
    sourceUri: "KML \u4E2D\u76F8\u5BF9\u5F15\u7528\u7684\u57FA\u7840 URI",
    clampToGround: "\u5C06\u5B9E\u4F53\u8D34\u5730\u663E\u793A",
    flyTo: "\u52A0\u8F7D\u540E\u81EA\u52A8\u98DE\u884C\u5230\u6570\u636E\u8303\u56F4\uFF08\u9ED8\u8BA4 true\uFF09"
  },
  playTrajectory: {
    id: "\u8F68\u8FF9\u56FE\u5C42ID",
    name: "\u8F68\u8FF9\u540D\u79F0",
    coordinates: "\u8F68\u8FF9\u5750\u6807\u6570\u7EC4 [[lon, lat, alt?], ...]",
    durationSeconds: "\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09",
    trailSeconds: "\u5C3E\u8FF9\u957F\u5EA6\uFF08\u79D2\uFF09",
    label: "\u79FB\u52A8\u4F53\u6807\u7B7E"
  },
  addHeatmap: {
    data: "GeoJSON Point FeatureCollection",
    radius: "\u70ED\u529B\u5F71\u54CD\u534A\u5F84\uFF08\u50CF\u7D20\uFF09"
  },
  geocode: {
    address: '\u5730\u5740\u3001\u5730\u6807\u6216\u5730\u540D\uFF0C\u4F8B\u5982 "\u6545\u5BAB"\u3001"Eiffel Tower"\u3001"\u4E1C\u4EAC\u5854"',
    countryCode: '\u4E24\u4F4D ISO \u56FD\u5BB6\u4EE3\u7801\u9650\u5236\u641C\u7D22\u8303\u56F4\uFF08\u5982 "CN"\u3001"US"\u3001"JP"\uFF09'
  }
};

// src/tool-manifest.ts
import {
  cesiumBrowserToolsetDefinitions,
  cesiumBrowserToolsetNames,
  cesiumSharedToolNames
} from "cesium-mcp-contracts";
var cesiumRuntimeOnlyToolNames = ["setIonToken"];
var cesiumRuntimeToolsets = Object.fromEntries(cesiumBrowserToolsetNames.map((name) => [
  name,
  name === "scene" ? [...cesiumBrowserToolsetDefinitions[name].names, ...cesiumRuntimeOnlyToolNames] : [...cesiumBrowserToolsetDefinitions[name].names]
]));
var cesiumRuntimeCommandToolNames = [
  ...cesiumSharedToolNames,
  ...cesiumRuntimeOnlyToolNames
];

// src/index.ts
var WS_PORT = parseInt(process.env.CESIUM_WS_PORT ?? "9100");
var MAX_PORT_RETRIES = 10;
var browserClients = /* @__PURE__ */ new Map();
var pendingRequests = /* @__PURE__ */ new Map();
var requestIdCounter = 0;
var _relayPort = 0;
var DEFAULT_SESSION_ID = process.env.DEFAULT_SESSION_ID ?? "default";
var _httpSessionStore = new AsyncLocalStorage();
function getDefaultBrowser() {
  if (browserClients.size === 0) return null;
  const preferred = browserClients.get(DEFAULT_SESSION_ID);
  if (preferred && preferred.readyState === WebSocket.OPEN) return preferred;
  return browserClients.values().next().value ?? null;
}
function sendToBrowser(action, params, timeoutMs = 3e4) {
  const { sessionId: paramSessionId, ...cleanParams } = params;
  const sessionId = paramSessionId ?? _httpSessionStore.getStore();
  if (_relayPort > 0) return _sendViaRelay(action, cleanParams, timeoutMs, sessionId);
  return new Promise((resolve, reject) => {
    const ws = sessionId ? browserClients.get(sessionId) ?? getDefaultBrowser() : getDefaultBrowser();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("\u65E0\u6D4F\u89C8\u5668\u8FDE\u63A5\u3002\u8BF7\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u5305\u542B CesiumJS \u7684\u9875\u9762\u5E76\u8FDE\u63A5 WebSocket\u3002\u793A\u4F8B\uFF1Ahttp://localhost:9100/demo/"));
      return;
    }
    const reqId = `req_${++requestIdCounter}`;
    const timer = setTimeout(() => {
      pendingRequests.delete(reqId);
      reject(new Error(`\u6D4F\u89C8\u5668\u54CD\u5E94\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09`));
    }, timeoutMs);
    pendingRequests.set(reqId, { resolve, reject, timer });
    ws.send(JSON.stringify({
      jsonrpc: "2.0",
      id: reqId,
      method: action,
      params: cleanParams
    }));
  });
}
function pushToBrowser(sessionId, command) {
  if (_relayPort > 0) {
    _pushViaRelay(sessionId, command);
    return true;
  }
  const ws = browserClients.get(sessionId) ?? getDefaultBrowser();
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify({
    jsonrpc: "2.0",
    id: `push_${++requestIdCounter}`,
    method: command.action,
    params: command.params
  }));
  return true;
}
async function _sendViaRelay(action, params, timeoutMs, sessionId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`http://127.0.0.1:${_relayPort}/api/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, params, sessionId }),
      signal: controller.signal
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error ?? "Relay failed");
    return data.result;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`\u6D4F\u89C8\u5668\u54CD\u5E94\u8D85\u65F6\uFF08${timeoutMs}ms, via relay\uFF09`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
function _pushViaRelay(sessionId, command) {
  fetch(`http://127.0.0.1:${_relayPort}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, command })
  }).catch(() => {
  });
}
function zodShapeToJsonSchema(shape) {
  const properties = {};
  const required = [];
  for (const [key, zodType] of Object.entries(shape)) {
    const prop = {};
    let innerType = zodType;
    let isOptional = false;
    let defaultValue = void 0;
    while (innerType) {
      if (innerType._def?.typeName === "ZodDefault") {
        defaultValue = innerType._def.defaultValue();
        innerType = innerType._def.innerType;
      } else if (innerType._def?.typeName === "ZodOptional") {
        isOptional = true;
        innerType = innerType._def.innerType;
      } else if (innerType._def?.typeName === "ZodEffects") {
        innerType = innerType._def.schema;
      } else {
        break;
      }
    }
    const typeName = innerType?._def?.typeName ?? "";
    switch (typeName) {
      case "ZodNumber":
        prop.type = "number";
        break;
      case "ZodString":
        prop.type = "string";
        break;
      case "ZodBoolean":
        prop.type = "boolean";
        break;
      case "ZodEnum":
        prop.type = "string";
        prop.enum = innerType._def.values;
        break;
      case "ZodArray":
        prop.type = "array";
        break;
      case "ZodObject":
        prop.type = "object";
        break;
      case "ZodRecord":
        prop.type = "object";
        break;
      default:
        prop.type = "string";
        break;
    }
    if (defaultValue !== void 0) prop.default = defaultValue;
    if (zodType.description) prop.description = zodType.description;
    properties[key] = prop;
    if (!isOptional && defaultValue === void 0) required.push(key);
  }
  return { type: "object", properties, required: required.length ? required : void 0 };
}
var SERVER_SIDE_TOOLS = /* @__PURE__ */ new Set(["geocode"]);
async function _invokeServerSideTool(action, params) {
  const def = _toolDefs.get(action);
  if (!def) throw new Error(`Server-side tool "${action}" not found`);
  const handler = def[def.length - 1];
  const mcpResult = await handler(params);
  const text = mcpResult?.content?.[0]?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return mcpResult;
}
async function handleHttpRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "POST" && req.url?.startsWith("/api/command")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const sessionId = payload.sessionId ?? "default";
        const commands = Array.isArray(payload.commands) ? payload.commands : [payload.command];
        let sent = 0;
        for (const cmd of commands) {
          if (!cmd) continue;
          if (SERVER_SIDE_TOOLS.has(cmd.action) && _toolDefs.has(cmd.action)) {
            _invokeServerSideTool(cmd.action, cmd.params ?? {}).catch(() => {
            });
            sent++;
          } else if (pushToBrowser(sessionId, cmd)) {
            sent++;
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, sent, total: commands.length }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
      }
    });
    return;
  }
  if (req.method === "POST" && req.url?.startsWith("/api/relay")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { action, params, sessionId } = JSON.parse(body);
        let result;
        if (SERVER_SIDE_TOOLS.has(action) && _toolDefs.has(action)) {
          result = await _invokeServerSideTool(action, params ?? {});
        } else {
          const routedParams = sessionId ? { ...params, sessionId } : params;
          result = await sendToBrowser(action, routedParams);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/api/status")) {
    const sessions = Array.from(browserClients.keys());
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, server: "cesium-mcp-runtime", sessions, connections: sessions.length }));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/api/tools")) {
    const parsedToolsUrl = new URL(req.url, "http://localhost");
    const tsParam = parsedToolsUrl.searchParams.get("toolsets")?.trim();
    const allowedTools = tsParam ? new Set(tsParam.split(",").flatMap((s) => TOOLSETS[s.trim()] ?? [])) : null;
    const tools = [];
    for (const [name, args] of _toolDefs.entries()) {
      if (allowedTools ? !allowedTools.has(name) : !_enabledTools.has(name)) continue;
      const description = args[1];
      const zodShape = args[2];
      const jsonSchema = zodShape ? zodShapeToJsonSchema(zodShape) : { type: "object", properties: {} };
      const toolset = TOOL_TO_TOOLSET.get(name);
      tools.push({ name, description, inputSchema: jsonSchema, ...toolset ? { _meta: { toolset } } : {} });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, tools }));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/proxy")) {
    const parsed = new URL(req.url, `http://localhost:${WS_PORT}`);
    const targetUrl = parsed.searchParams.get("url");
    if (!targetUrl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing ?url= parameter" }));
      return;
    }
    try {
      const proxyResp = await fetch(targetUrl);
      const contentType = proxyResp.headers.get("content-type") || "application/octet-stream";
      const buffer = Buffer.from(await proxyResp.arrayBuffer());
      res.writeHead(proxyResp.status, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*"
      });
      res.end(buffer);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Proxy failed: ${err instanceof Error ? err.message : String(err)}` }));
    }
    return;
  }
  if (req.method === "GET" && req.url === "/bridge.js") {
    const bundle = _findLocalBridgeBundle();
    if (bundle) {
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(bundle);
      return;
    }
    res.writeHead(404);
    res.end("// local bridge bundle not found");
    return;
  }
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const token = process.env.CESIUM_ION_TOKEN || "";
    const html = _getViewerHtml(token, WS_PORT);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
}
var _bridgeBundleCache;
function _findLocalBridgeBundle() {
  if (_bridgeBundleCache !== void 0) return _bridgeBundleCache;
  const here = dirname(fileURLToPath(import.meta.url));
  const file = "cesium-mcp-bridge.browser.global.js";
  const candidates = [
    // monorepo: runtime/dist → ../../cesium-mcp-bridge/dist
    join(here, "..", "..", "cesium-mcp-bridge", "dist", file),
    // npm install: node_modules/cesium-mcp-runtime/dist → node_modules/cesium-mcp-bridge/dist
    join(here, "..", "..", "..", "cesium-mcp-bridge", "dist", file),
    join(here, "..", "node_modules", "cesium-mcp-bridge", "dist", file)
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      _bridgeBundleCache = readFileSync(c, "utf-8");
      return _bridgeBundleCache;
    }
  }
  _bridgeBundleCache = null;
  return null;
}
function _getViewerHtml(token, wsPort) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cesium MCP Viewer</title>
<script src="https://cesium.com/downloads/cesiumjs/releases/1.143/Build/Cesium/Cesium.js"></script>
<link href="https://cesium.com/downloads/cesiumjs/releases/1.143/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
<script src="/bridge.js" onerror="var s=document.createElement('script');s.src='https://unpkg.com/cesium-mcp-bridge@latest/dist/cesium-mcp-bridge.browser.global.js';document.head.appendChild(s)"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#c{width:100%;height:100%;overflow:hidden}
#s{position:fixed;top:12px;right:12px;z-index:999;padding:6px 12px;border-radius:6px;font:13px/1.4 -apple-system,sans-serif;backdrop-filter:blur(8px);transition:all .3s}
.c0{background:rgba(255,170,0,.85);color:#333}
.c1{background:rgba(0,180,80,.85);color:#fff}
.c2{background:rgba(220,50,50,.85);color:#fff}
</style>
</head>
<body>
<div id="c"></div><div id="s" class="c0">Connecting...</div>
<script>
var WS=${wsPort},TOK='${token}',SE=new URLSearchParams(location.search).get('session')||'default';
if(TOK)Cesium.Ion.defaultAccessToken=TOK;
var v=new Cesium.Viewer('c',{terrain:Cesium.Terrain.fromWorldTerrain(),baseLayerPicker:!0,geocoder:!0,animation:!0,timeline:!0});
var b=new CesiumMcpBridge.CesiumBridge(v),el=document.getElementById('s');
function conn(){var ws=new WebSocket('ws://localhost:'+WS+'?session='+SE);
ws.onopen=function(){el.className='c1';el.textContent='Connected'};
ws.onmessage=function(e){var m=JSON.parse(e.data);b.execute({action:m.method,params:m.params||{}}).then(function(r){if(m.id)ws.send(JSON.stringify({id:m.id,result:r||{success:!0}}))})};
ws.onclose=function(){el.className='c2';el.textContent='Disconnected';setTimeout(conn,3000)};
ws.onerror=function(){ws.close()}}
conn();
</script>
</body></html>`;
}
async function _probeExistingInstance(port) {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(1500) });
    const data = await resp.json();
    return data.server === "cesium-mcp-runtime";
  } catch {
    return false;
  }
}
function _tryListen(httpServer, port) {
  return new Promise((resolve) => {
    const onError = (err) => {
      httpServer.removeListener("listening", onListening);
      if (err.code === "EADDRINUSE") resolve(false);
      else {
        console.error("[cesium-mcp-runtime] HTTP server error:", err.message);
        resolve(false);
      }
    };
    const onListening = () => {
      httpServer.removeListener("error", onError);
      resolve(true);
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(port);
  });
}
async function startServer() {
  const httpServer = createServer(handleHttpRequest);
  const wss = new WebSocketServer({ server: httpServer, noServer: false });
  wss.on("error", () => {
  });
  _setupWss(wss);
  if (await _tryListen(httpServer, WS_PORT)) {
    console.error(`[cesium-mcp-runtime] HTTP + WebSocket server on http://localhost:${WS_PORT}`);
    console.error("[cesium-mcp-runtime] POST /api/command \u2014 \u63A8\u9001\u5730\u56FE\u547D\u4EE4");
    console.error("[cesium-mcp-runtime] POST /api/relay   \u2014 \u547D\u4EE4\u4E2D\u7EE7\uFF08request-response\uFF09");
    console.error("[cesium-mcp-runtime] GET  /api/status  \u2014 \u8FDE\u63A5\u72B6\u6001");
    return;
  }
  httpServer.close();
  if (await _probeExistingInstance(WS_PORT)) {
    _relayPort = WS_PORT;
    console.error(`[cesium-mcp-runtime] Port ${WS_PORT} occupied by existing cesium-mcp-runtime \u2014 relay mode enabled`);
    console.error(`[cesium-mcp-runtime] Commands will be forwarded to http://127.0.0.1:${WS_PORT}`);
    return;
  }
  for (let offset = 1; offset <= MAX_PORT_RETRIES; offset++) {
    const tryPort = WS_PORT + offset;
    const altServer = createServer(handleHttpRequest);
    const altWss = new WebSocketServer({ server: altServer });
    altWss.on("error", () => {
    });
    _setupWss(altWss);
    if (await _tryListen(altServer, tryPort)) {
      console.error(`[cesium-mcp-runtime] Port ${WS_PORT} occupied by another service, using port ${tryPort}`);
      console.error(`[cesium-mcp-runtime] HTTP + WebSocket server on http://localhost:${tryPort}`);
      return;
    }
    altServer.close();
  }
  console.error(`[cesium-mcp-runtime] Could not find available port (tried ${WS_PORT}-${WS_PORT + MAX_PORT_RETRIES}), WebSocket server disabled`);
}
function _setupWss(wss) {
  wss.on("connection", (ws, req) => {
    const sessionId = new URL(req.url ?? "/", "http://localhost").searchParams.get("session") ?? "default";
    const oldWs = browserClients.get(sessionId);
    if (oldWs && oldWs.readyState === WebSocket.OPEN) {
      console.error(`[ws] \u540C\u540D session=${sessionId} \u5DF2\u5B58\u5728\uFF0C\u5173\u95ED\u65E7\u8FDE\u63A5`);
      oldWs.removeAllListeners("close");
      oldWs.close(1e3, "replaced by new connection");
    }
    console.error(`[ws] \u6D4F\u89C8\u5668\u8FDE\u63A5: session=${sessionId}`);
    browserClients.set(sessionId, ws);
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id && pendingRequests.has(msg.id)) {
          const pending = pendingRequests.get(msg.id);
          pendingRequests.delete(msg.id);
          clearTimeout(pending.timer);
          if (msg.error) {
            pending.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
          } else {
            pending.resolve(msg.result);
          }
        }
      } catch {
      }
    });
    ws.on("close", () => {
      console.error(`[ws] \u6D4F\u89C8\u5668\u65AD\u5F00: session=${sessionId}`);
      browserClients.delete(sessionId);
    });
  });
}
var server = new McpServer({
  name: "cesium-mcp-runtime",
  version: "1.143.0",
  title: "Cesium MCP Runtime",
  description: "AI-powered 3D globe control via MCP \u2014 camera, layers, entities, animation, and interaction with CesiumJS.",
  websiteUrl: "https://github.com/gaopengbin/cesium-mcp"
}, {
  instructions: "Cesium MCP Runtime provides tools for controlling a CesiumJS 3D globe via AI. A browser with cesium-mcp-bridge must be connected via WebSocket for command execution. Use view tools (flyTo, setView) to navigate, entity tools to add markers/polygons/models, layer tools to manage GeoJSON/3D Tiles, and animation tools for time-based animations."
});
server.resource(
  "camera",
  "cesium://scene/camera",
  { description: "\u5F53\u524D\u76F8\u673A\u72B6\u6001\uFF08\u7ECF\u7EAC\u5EA6\u3001\u9AD8\u5EA6\u3001\u89D2\u5EA6\uFF09", mimeType: "application/json" },
  async () => {
    try {
      const result = await sendToBrowser("getView", {});
      return { contents: [{ uri: "cesium://scene/camera", text: JSON.stringify(result), mimeType: "application/json" }] };
    } catch {
      return { contents: [{ uri: "cesium://scene/camera", text: '{"error":"no browser connected"}', mimeType: "application/json" }] };
    }
  }
);
server.resource(
  "layers",
  "cesium://scene/layers",
  { description: "\u5F53\u524D\u5DF2\u52A0\u8F7D\u7684\u56FE\u5C42\u5217\u8868\uFF08ID\u3001\u540D\u79F0\u3001\u7C7B\u578B\u3001\u53EF\u89C1\u6027\uFF09", mimeType: "application/json" },
  async () => {
    try {
      const result = await sendToBrowser("listLayers", {});
      return { contents: [{ uri: "cesium://scene/layers", text: JSON.stringify(result), mimeType: "application/json" }] };
    } catch {
      return { contents: [{ uri: "cesium://scene/layers", text: '{"error":"no browser connected"}', mimeType: "application/json" }] };
    }
  }
);
var TOOLSETS = cesiumRuntimeToolsets;
var TOOLSET_DESCRIPTIONS = {
  view: "Camera view controls (flyTo, setView, getView, zoomToExtent), viewpoint bookmarks (save, load, list), and scene export",
  entity: "Core entity operations (marker, label, model, polygon, polyline, update, remove) plus batch add, query, and property inspection",
  layer: "Layer management (GeoJSON, list, remove, clear all, visibility, style, basemap)",
  camera: "Advanced camera controls (lookAt, orbit, camera options)",
  "entity-ext": "Extended entity types (billboard, box, corridor, cylinder, ellipse, rectangle, wall)",
  animation: "Animation system (create/control animations, track entities, clock, lighting)",
  scene: "Scene environment and post-processing (fog, atmosphere, shadows, bloom, SSAO, FXAA)",
  tiles: "3D Tiles, terrain, imagery services, CZML and KML/KMZ data sources",
  interaction: "User interaction (screenshot, highlight, measure)",
  trajectory: "Trajectory playback",
  heatmap: "Heatmap visualization",
  geolocation: "Geocoding \u2014 convert address/place name to coordinates (Nominatim/OSM)"
};
var DEFAULT_TOOLSETS = ["view", "entity", "layer", "interaction"];
var _tsEnv = process.env.CESIUM_TOOLSETS?.trim();
var _allMode = _tsEnv === "all";
var _enabledSets = new Set(
  _allMode ? Object.keys(TOOLSETS) : _tsEnv ? _tsEnv.split(",").map((s) => s.trim()).filter((s) => s in TOOLSETS) : DEFAULT_TOOLSETS
);
var _enabledTools = /* @__PURE__ */ new Set();
for (const setName of _enabledSets) {
  for (const tool of TOOLSETS[setName]) {
    _enabledTools.add(tool);
  }
}
var TOOL_TO_TOOLSET = /* @__PURE__ */ new Map();
for (const [setName, tools] of Object.entries(TOOLSETS)) {
  for (const tool of tools) TOOL_TO_TOOLSET.set(tool, setName);
}
var _toolDefs = /* @__PURE__ */ new Map();
var _localeKey = process.env.CESIUM_LOCALE?.trim().toLowerCase();
var _toolDesc = _localeKey === "zh-cn" ? toolDescriptions2 : toolDescriptions;
var _paramDesc = _localeKey === "zh-cn" ? paramDescriptions2 : paramDescriptions;
function _applyToolDef(s, args) {
  const name = args[0];
  const toolset = TOOL_TO_TOOLSET.get(name);
  if (toolset) {
    ;
    s.registerTool(name, {
      description: args[1],
      inputSchema: args[2],
      annotations: args[3],
      _meta: { toolset }
    }, args[4]);
  } else {
    ;
    s.tool.apply(s, args);
  }
}
var _registerTool = ((...args) => {
  const name = args[0];
  if (_toolDesc[name]) args[1] = _toolDesc[name];
  const paramOverrides = _paramDesc[name];
  if (paramOverrides && typeof args[2] === "object" && args[2] !== null) {
    const schema = args[2];
    for (const [key, desc] of Object.entries(paramOverrides)) {
      if (schema[key]) schema[key] = schema[key].describe(desc);
    }
  }
  if (typeof args[2] === "object" && args[2] !== null) {
    const schema = args[2];
    schema.sessionId = z.string().optional().describe(
      _localeKey === "zh-cn" ? "\u76EE\u6807\u6D4F\u89C8\u5668 session ID\uFF08\u591A\u6D4F\u89C8\u5668\u8DEF\u7531\uFF0C\u53EF\u9009\uFF09" : "Target browser session ID for multi-browser routing (optional)"
    );
  }
  _toolDefs.set(name, args);
  if (_enabledTools.has(name)) {
    _applyToolDef(server, args);
  }
});
function _enableToolset(setName) {
  const tools = TOOLSETS[setName];
  if (!tools) return [];
  const added = [];
  for (const toolName of tools) {
    if (!_enabledTools.has(toolName)) {
      _enabledTools.add(toolName);
      const def = _toolDefs.get(toolName);
      if (def) {
        _applyToolDef(server, def);
        added.push(toolName);
      }
    }
  }
  _enabledSets.add(setName);
  return added;
}
_registerTool(
  "flyTo",
  "\u98DE\u884C\u5230\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u4F4D\u7F6E\uFF08\u5E26\u52A8\u753B\u8FC7\u6E21\uFF09",
  {
    longitude: z.number().describe("\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09"),
    latitude: z.number().describe("\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09"),
    height: z.number().default(5e4).describe("\u76F8\u673A\u9AD8\u5EA6\uFF08\u7C73\uFF09\uFF0C\u9ED8\u8BA4 50000"),
    heading: z.number().default(0).describe("\u822A\u5411\u89D2\uFF08\u5EA6\uFF09\uFF0C0 \u4E3A\u6B63\u5317"),
    pitch: z.number().default(-45).describe("\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09\uFF0C-90 \u4E3A\u6B63\u4E0B\u65B9"),
    duration: z.number().default(2).describe("\u98DE\u884C\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Fly To Location" },
  async (params) => {
    const result = await sendToBrowser("flyTo", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addGeoJsonLayer",
  "\u6DFB\u52A0 GeoJSON \u56FE\u5C42\u5230\u5730\u56FE\uFF08\u652F\u6301 Point/Line/Polygon\uFF0C\u53EF\u914D\u7F6E\u989C\u8272/\u5206\u7EA7/\u5206\u7C7B\u6E32\u67D3\uFF09\u3002data \u548C url \u4E8C\u9009\u4E00",
  {
    id: z.string().optional().describe("\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09"),
    name: z.string().optional().describe("\u56FE\u5C42\u663E\u793A\u540D\u79F0"),
    data: z.record(z.unknown()).optional().describe("GeoJSON FeatureCollection \u5BF9\u8C61\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    url: z.string().optional().describe("GeoJSON \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF0C\u6D4F\u89C8\u5668\u7AEF fetch \u52A0\u8F7D\uFF09"),
    style: z.record(z.unknown()).optional().describe("\u6837\u5F0F\u914D\u7F6E\uFF08color, opacity, pointSize, choropleth, category\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add GeoJSON Layer" },
  async (params) => {
    const result = await sendToBrowser("addGeoJsonLayer", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addGeoJsonPrimitive",
  "\u9AD8\u6027\u80FD\u52A0\u8F7D\u5927\u89C4\u6A21 GeoJSON \u6570\u636E\uFF0810\u4E07+ \u8981\u7D20\uFF09\u3002\u7ED5\u8FC7 Entity \u7CFB\u7EDF\uFF0C\u76F4\u63A5\u4F7F\u7528 Primitive \u6E32\u67D3\uFF0C\u9002\u5408\u6D77\u91CF\u6570\u636E\u53EF\u89C6\u5316\u3002data \u548C url \u4E8C\u9009\u4E00",
  {
    id: z.string().optional().describe("\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09"),
    name: z.string().optional().describe("\u56FE\u5C42\u663E\u793A\u540D\u79F0"),
    data: z.any().optional().describe("GeoJSON \u5BF9\u8C61\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    url: z.string().optional().describe("GeoJSON \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF09"),
    allowPicking: z.boolean().optional().describe("\u662F\u5426\u5141\u8BB8\u62FE\u53D6\uFF08\u9ED8\u8BA4 true\uFF0C\u5173\u95ED\u53EF\u63D0\u5347\u6027\u80FD\uFF09"),
    show: z.boolean().optional().describe("\u662F\u5426\u663E\u793A\uFF08\u9ED8\u8BA4 true\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add GeoJSON Primitive" },
  async (params) => {
    const result = await sendToBrowser("addGeoJsonPrimitive", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addLabel",
  "\u4E3A GeoJSON \u8981\u7D20\u6DFB\u52A0\u6587\u672C\u6807\u6CE8\uFF08\u663E\u793A\u5C5E\u6027\u503C\uFF09",
  {
    data: z.record(z.unknown()).describe("GeoJSON FeatureCollection \u5BF9\u8C61"),
    field: z.string().describe('\u7528\u4F5C\u6807\u6CE8\u6587\u672C\u7684\u5C5E\u6027\u5B57\u6BB5\u540D\uFF08\u5982 "name"\u3001"population"\uFF09'),
    style: z.record(z.unknown()).optional().describe("\u6807\u6CE8\u6837\u5F0F\uFF08font, fillColor, outlineColor, scale \u7B49\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Label" },
  async (params) => {
    const result = await sendToBrowser("addLabel", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addHeatmap",
  "\u6DFB\u52A0\u70ED\u529B\u56FE\u56FE\u5C42\uFF08\u57FA\u4E8E GeoJSON \u70B9\u6570\u636E\u751F\u6210\u70ED\u529B\u53EF\u89C6\u5316\uFF0C\u8D34\u56FE\u5230\u5730\u9762\uFF09",
  {
    data: z.record(z.unknown()).describe("GeoJSON Point FeatureCollection"),
    radius: z.number().default(30).describe("\u70ED\u529B\u5F71\u54CD\u534A\u5F84\uFF08\u50CF\u7D20\uFF09"),
    blur: z.number().default(0.85).describe("\u70ED\u529B\u6A21\u7CCA\u7A0B\u5EA6 0-1"),
    maxOpacity: z.number().default(0.8).describe("\u6700\u5927\u4E0D\u900F\u660E\u5EA6 0-1"),
    resolution: z.number().default(512).describe("\u70ED\u529B\u56FE\u5206\u8FA8\u7387\uFF08\u50CF\u7D20\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Heatmap" },
  async (params) => {
    const result = await sendToBrowser("addHeatmap", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "removeLayer",
  "\u4ECE\u5730\u56FE\u4E0A\u79FB\u9664\u6307\u5B9A\u56FE\u5C42\uFF08\u6309\u56FE\u5C42ID\uFF09",
  { id: z.string().describe("\u8981\u79FB\u9664\u7684\u56FE\u5C42ID\uFF08\u53EF\u901A\u8FC7 listLayers \u83B7\u53D6\uFF09") },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Remove Layer" },
  async (params) => {
    const result = await sendToBrowser("removeLayer", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "clearAll",
  "\u6E05\u9664\u5730\u56FE\u4E0A\u7684\u6240\u6709\u56FE\u5C42\u3001\u5B9E\u4F53\u3001\u52A8\u753B\u548C\u8F68\u8FF9\uFF08\u4E00\u952E\u91CD\u7F6E\u573A\u666F\uFF09",
  {},
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Clear All" },
  async () => {
    const result = await sendToBrowser("clearAll", {});
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setBasemap",
  "\u5207\u6362\u5E95\u56FE\u98CE\u683C",
  {
    basemap: z.enum(["dark", "satellite", "standard", "osm", "arcgis", "light", "tianditu_vec", "tianditu_img", "amap", "amap_satellite"]).describe("\u5E95\u56FE\u7C7B\u578B\uFF1Adark=\u6697\u8272, satellite=\u536B\u661F\u5F71\u50CF, standard=\u6807\u51C6, osm=OpenStreetMap, arcgis=ArcGIS\u8857\u9053, light=\u6D45\u8272, tianditu_vec=\u5929\u5730\u56FE\u77E2\u91CF, tianditu_img=\u5929\u5730\u56FE\u5F71\u50CF, amap=\u9AD8\u5FB7\u5730\u56FE, amap_satellite=\u9AD8\u5FB7\u536B\u661F"),
    token: z.string().optional().describe("\u5E95\u56FE\u670D\u52A1\u4EE4\u724C\uFF08\u5929\u5730\u56FE\u7B49\u9700\u8981\u8BA4\u8BC1\u7684\u670D\u52A1\u5FC5\u586B\uFF09"),
    url: z.string().optional().describe("\u81EA\u5B9A\u4E49URL\u6A21\u677F\uFF08{x},{y},{z}\u5360\u4F4D\u7B26\uFF09\uFF0C\u63D0\u4F9B\u65F6\u5FFD\u7565basemap\u53C2\u6570")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Basemap" },
  async (params) => {
    const result = await sendToBrowser("setBasemap", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "screenshot",
  "\u622A\u53D6\u5F53\u524D\u5730\u56FE\u89C6\u56FE\uFF08\u8FD4\u56DE base64 PNG\uFF09",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Screenshot" },
  async () => {
    const result = await sendToBrowser("screenshot", {});
    const data = result;
    if (data?.dataUrl) {
      return { content: [{ type: "image", data: data.dataUrl.replace(/^data:image\/\w+;base64,/, ""), mimeType: "image/png" }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "highlight",
  "\u9AD8\u4EAE\u6307\u5B9A\u56FE\u5C42\u7684\u8981\u7D20\uFF08\u652F\u6301\u6E05\u9664\u6062\u590D\u539F\u59CB\u6837\u5F0F\uFF09",
  {
    layerId: z.string().optional().describe("\u56FE\u5C42ID\uFF08\u6E05\u9664\u6240\u6709\u9AD8\u4EAE\u65F6\u53EF\u4E0D\u4F20\uFF09"),
    featureIndex: z.number().optional().describe("\u8981\u7D20\u7D22\u5F15\uFF08\u4E0D\u4F20\u5219\u9AD8\u4EAE/\u6E05\u9664\u5168\u90E8\uFF09"),
    color: z.string().default("#FFFF00").describe("\u9AD8\u4EAE\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"),
    clear: z.boolean().optional().describe("\u4F20 true \u6E05\u9664\u9AD8\u4EAE\u3001\u6062\u590D\u539F\u59CB\u6837\u5F0F")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Highlight" },
  async (params) => {
    const result = await sendToBrowser("highlight", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "measure",
  "\u6D4B\u91CF\u8DDD\u79BB\u6216\u9762\u79EF\uFF08\u57FA\u4E8E\u5750\u6807\u8BA1\u7B97\uFF0C\u53EF\u5728\u5730\u56FE\u4E0A\u663E\u793A\uFF09",
  {
    mode: z.enum(["distance", "area"]).describe("\u6D4B\u91CF\u6A21\u5F0F\uFF1Adistance=\u8DDD\u79BB, area=\u9762\u79EF"),
    positions: z.array(z.array(z.number()).min(2).max(3)).min(2).describe("\u5750\u6807\u6570\u7EC4 [[lon,lat,alt?], ...]"),
    showOnMap: z.boolean().optional().default(true).describe("\u662F\u5426\u5728\u5730\u56FE\u4E0A\u663E\u793A\u6D4B\u91CF\u7ED3\u679C"),
    id: z.string().optional().describe("\u81EA\u5B9A\u4E49\u6D4B\u91CF\u5B9E\u4F53ID")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Measure" },
  async (params) => {
    const result = await sendToBrowser("measure", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setView",
  "\u77AC\u95F4\u5207\u6362\u5230\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u89C6\u89D2\uFF08\u65E0\u52A8\u753B\uFF09",
  {
    longitude: z.number().describe("\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09"),
    latitude: z.number().describe("\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09"),
    height: z.number().optional().default(5e4).describe("\u9AD8\u5EA6\uFF08\u7C73\uFF09"),
    heading: z.number().optional().default(0).describe("\u822A\u5411\u89D2\uFF08\u5EA6\uFF09"),
    pitch: z.number().optional().default(-90).describe("\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09"),
    roll: z.number().optional().default(0).describe("\u7FFB\u6EDA\u89D2\uFF08\u5EA6\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set View" },
  async (params) => {
    const result = await sendToBrowser("setView", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "getView",
  "\u83B7\u53D6\u5F53\u524D\u76F8\u673A\u89C6\u89D2\u4FE1\u606F\uFF08\u7ECF\u7EAC\u5EA6\u3001\u9AD8\u5EA6\u3001\u89D2\u5EA6\uFF09",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Get View" },
  async () => {
    const result = await sendToBrowser("getView", {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
_registerTool(
  "zoomToExtent",
  "\u7F29\u653E\u5230\u6307\u5B9A\u5730\u7406\u8303\u56F4",
  {
    west: z.number().describe("\u897F\u8FB9\u754C\u7ECF\u5EA6\uFF08\u5EA6\uFF09"),
    south: z.number().describe("\u5357\u8FB9\u754C\u7EAC\u5EA6\uFF08\u5EA6\uFF09"),
    east: z.number().describe("\u4E1C\u8FB9\u754C\u7ECF\u5EA6\uFF08\u5EA6\uFF09"),
    north: z.number().describe("\u5317\u8FB9\u754C\u7EAC\u5EA6\uFF08\u5EA6\uFF09"),
    duration: z.number().optional().default(2).describe("\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Zoom to Extent" },
  async (params) => {
    const result = await sendToBrowser("zoomToExtent", { bbox: [params.west, params.south, params.east, params.north], duration: params.duration });
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addMarker",
  "\u5728\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u6DFB\u52A0\u6807\u6CE8\u70B9\uFF0C\u8FD4\u56DE layerId \u4F9B\u540E\u7EED\u64CD\u4F5C",
  {
    longitude: z.number().describe("\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09"),
    latitude: z.number().describe("\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09"),
    label: z.string().optional().describe("\u6807\u6CE8\u6587\u672C"),
    color: z.string().optional().default("#3B82F6").describe("\u6807\u6CE8\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"),
    size: z.number().optional().default(12).describe("\u70B9\u5927\u5C0F\uFF08\u50CF\u7D20\uFF09"),
    id: z.string().optional().describe("\u81EA\u5B9A\u4E49\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Marker" },
  async (params) => {
    const result = await sendToBrowser("addMarker", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addPolyline",
  "\u5728\u5730\u56FE\u4E0A\u6DFB\u52A0\u6298\u7EBF\uFF08\u8DEF\u5F84\u3001\u7EBF\u6BB5\uFF09\uFF0C\u8FD4\u56DE entityId",
  {
    coordinates: z.array(z.array(z.number())).describe("\u6298\u7EBF\u5750\u6807\u6570\u7EC4 [[lon, lat, height?], ...]"),
    color: z.string().optional().default("#3B82F6").describe("\u7EBF\u6761\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"),
    width: z.number().optional().default(3).describe("\u7EBF\u6761\u5BBD\u5EA6\uFF08\u50CF\u7D20\uFF09"),
    clampToGround: z.boolean().optional().default(true).describe("\u662F\u5426\u8D34\u5730"),
    label: z.string().optional().describe("\u6298\u7EBF\u6807\u6CE8\u6587\u672C")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Polyline" },
  async (params) => {
    const result = await sendToBrowser("addPolyline", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addPolygon",
  "\u5728\u5730\u56FE\u4E0A\u6DFB\u52A0\u591A\u8FB9\u5F62\u533A\u57DF\uFF08\u9762\u79EF\u3001\u8FB9\u754C\uFF09\uFF0C\u8FD4\u56DE entityId",
  {
    coordinates: z.array(z.array(z.number())).describe("\u591A\u8FB9\u5F62\u5916\u73AF\u5750\u6807 [[lon, lat, height?], ...]"),
    color: z.string().optional().default("#3B82F6").describe("\u586B\u5145\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"),
    outlineColor: z.string().optional().default("#FFFFFF").describe("\u63CF\u8FB9\u989C\u8272"),
    opacity: z.number().optional().default(0.6).describe("\u586B\u5145\u900F\u660E\u5EA6\uFF080~1\uFF09"),
    extrudedHeight: z.number().optional().describe("\u62C9\u4F38\u9AD8\u5EA6\uFF08\u7C73\uFF09\uFF0C\u53EF\u7528\u4E8E\u521B\u5EFA\u7ACB\u4F53\u6548\u679C"),
    clampToGround: z.boolean().optional().default(true).describe("\u662F\u5426\u8D34\u5730"),
    label: z.string().optional().describe("\u591A\u8FB9\u5F62\u6807\u6CE8\u6587\u672C")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Polygon" },
  async (params) => {
    const result = await sendToBrowser("addPolygon", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addModel",
  "\u5728\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u653E\u7F6E 3D \u6A21\u578B\uFF08glTF/GLB\uFF09\uFF0C\u8FD4\u56DE entityId",
  {
    longitude: z.number().describe("\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09"),
    latitude: z.number().describe("\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09"),
    height: z.number().optional().default(0).describe("\u653E\u7F6E\u9AD8\u5EA6\uFF08\u7C73\uFF09"),
    url: z.string().describe("glTF/GLB \u6A21\u578B\u6587\u4EF6 URL"),
    scale: z.number().optional().default(1).describe("\u6A21\u578B\u7F29\u653E\u6BD4\u4F8B"),
    heading: z.number().optional().default(0).describe("\u822A\u5411\u89D2\uFF08\u5EA6\uFF09\uFF0C0=\u6B63\u5317"),
    pitch: z.number().optional().default(0).describe("\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09"),
    roll: z.number().optional().default(0).describe("\u7FFB\u6EDA\u89D2\uFF08\u5EA6\uFF09"),
    label: z.string().optional().describe("\u6A21\u578B\u6807\u6CE8\u6587\u672C")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Model" },
  async (params) => {
    const result = await sendToBrowser("addModel", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "updateEntity",
  "\u66F4\u65B0\u5DF2\u6709\u5B9E\u4F53\u7684\u5C5E\u6027\uFF08\u4F4D\u7F6E\u3001\u989C\u8272\u3001\u6807\u7B7E\u3001\u7F29\u653E\u3001\u53EF\u89C1\u6027\uFF09",
  {
    entityId: z.string().describe("\u5B9E\u4F53ID\uFF08addMarker/addPolyline \u7B49\u8FD4\u56DE\u7684 entityId\uFF09"),
    position: z.object({
      longitude: z.number().describe("\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09"),
      latitude: z.number().describe("\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09"),
      height: z.number().optional().describe("\u9AD8\u5EA6\uFF08\u7C73\uFF09")
    }).optional().describe("\u65B0\u4F4D\u7F6E\u5750\u6807"),
    label: z.string().optional().describe("\u65B0\u6807\u6CE8\u6587\u672C"),
    color: z.string().optional().describe("\u65B0\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"),
    scale: z.number().optional().describe("\u65B0\u7F29\u653E\u6BD4\u4F8B"),
    show: z.boolean().optional().describe("\u662F\u5426\u663E\u793A")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Update Entity" },
  async (params) => {
    const result = await sendToBrowser("updateEntity", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "removeEntity",
  "\u79FB\u9664\u5355\u4E2A\u5B9E\u4F53\uFF08\u901A\u8FC7 entityId\uFF09",
  {
    entityId: z.string().describe("\u8981\u79FB\u9664\u7684\u5B9E\u4F53ID")
  },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Remove Entity" },
  async (params) => {
    const result = await sendToBrowser("removeEntity", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "batchAddEntities",
  "\u6279\u91CF\u6DFB\u52A0\u591A\u4E2A\u5B9E\u4F53\uFF08\u4E00\u6B21\u8C03\u7528\u521B\u5EFA\u591A\u4E2A marker/polyline/polygon/model \u7B49\uFF09\uFF0C\u8FD4\u56DE\u6240\u6709 entityId",
  {
    entities: z.array(z.object({
      type: z.enum(["marker", "polyline", "polygon", "model", "billboard", "box", "cylinder", "ellipse", "rectangle", "wall", "corridor"]).describe("\u5B9E\u4F53\u7C7B\u578B")
    }).passthrough()).describe("\u5B9E\u4F53\u5B9A\u4E49\u6570\u7EC4\uFF0C\u6BCF\u4E2A\u5143\u7D20\u5305\u542B type \u5B57\u6BB5\u548C\u8BE5\u7C7B\u578B\u6240\u9700\u7684\u53C2\u6570")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Batch Add Entities" },
  async (params) => {
    const result = await sendToBrowser("batchAddEntities", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "queryEntities",
  "\u67E5\u8BE2\u5DF2\u6709\u5B9E\u4F53 \u2014 \u6309\u540D\u79F0\u3001\u7C7B\u578B\u3001\u7A7A\u95F4\u8303\u56F4\u8FC7\u6EE4\uFF0C\u8FD4\u56DE entityId/name/type/position \u5217\u8868",
  {
    name: z.string().optional().describe("\u540D\u79F0\u6A21\u7CCA\u5339\u914D\uFF08\u4E0D\u533A\u5206\u5927\u5C0F\u5199\uFF09"),
    type: z.enum(["marker", "polyline", "polygon", "model", "billboard", "box", "cylinder", "ellipse", "rectangle", "wall", "corridor", "label", "unknown"]).optional().describe("\u6309\u5B9E\u4F53\u7C7B\u578B\u8FC7\u6EE4"),
    bbox: z.array(z.number()).length(4).optional().describe("\u7A7A\u95F4\u8303\u56F4\u8FC7\u6EE4 [west, south, east, north]\uFF08\u5EA6\uFF09")
  },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Query Entities" },
  async (params) => {
    const result = await sendToBrowser("queryEntities", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "getEntityProperties",
  "\u83B7\u53D6\u6307\u5B9A\u5B9E\u4F53\u7684\u8BE6\u7EC6\u5C5E\u6027 \u2014 \u5305\u62EC\u7C7B\u578B\u3001\u4F4D\u7F6E\u3001\u81EA\u5B9A\u4E49\u5C5E\u6027\u548C\u56FE\u5F62\u5C5E\u6027",
  {
    entityId: z.string().describe("\u5B9E\u4F53ID\uFF08\u53EF\u901A\u8FC7 queryEntities \u83B7\u53D6\uFF09")
  },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Get Entity Properties" },
  async (params) => {
    const result = await sendToBrowser("getEntityProperties", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "saveViewpoint",
  "\u4FDD\u5B58\u5F53\u524D\u89C6\u89D2\u4E3A\u4E66\u7B7E\uFF08\u540D\u79F0 \u2192 \u89C6\u89D2\u72B6\u6001\uFF09\uFF0C\u53EF\u901A\u8FC7 loadViewpoint \u6062\u590D",
  {
    name: z.string().describe("\u4E66\u7B7E\u540D\u79F0\uFF08\u552F\u4E00\u6807\u8BC6\uFF0C\u91CD\u590D\u5219\u8986\u76D6\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Save Viewpoint" },
  async (params) => {
    const result = await sendToBrowser("saveViewpoint", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "loadViewpoint",
  "\u6062\u590D\u5DF2\u4FDD\u5B58\u7684\u89C6\u89D2\u4E66\u7B7E\uFF08\u5E26\u98DE\u884C\u52A8\u753B\uFF09\uFF0C\u8FD4\u56DE\u4FDD\u5B58\u7684\u89C6\u89D2\u72B6\u6001",
  {
    name: z.string().describe("\u4E66\u7B7E\u540D\u79F0"),
    duration: z.number().optional().default(2).describe("\u98DE\u884C\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09\uFF0C0 \u8868\u793A\u77AC\u79FB")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Load Viewpoint" },
  async (params) => {
    const result = await sendToBrowser("loadViewpoint", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "listViewpoints",
  "\u5217\u51FA\u6240\u6709\u5DF2\u4FDD\u5B58\u7684\u89C6\u89D2\u4E66\u7B7E",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Viewpoints" },
  async () => {
    const result = await sendToBrowser("listViewpoints", {});
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "exportScene",
  "\u5BFC\u51FA\u5F53\u524D\u573A\u666F\u5FEB\u7167 \u2014 \u5305\u542B\u89C6\u89D2\u3001\u56FE\u5C42\u5217\u8868\u3001\u5B9E\u4F53\u5217\u8868\u548C\u65F6\u95F4\u6233",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Export Scene" },
  async () => {
    const result = await sendToBrowser("exportScene", {});
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setLayerVisibility",
  "\u8BBE\u7F6E\u56FE\u5C42\u53EF\u89C1\u6027",
  {
    id: z.string().describe("\u56FE\u5C42ID"),
    visible: z.boolean().describe("\u662F\u5426\u53EF\u89C1")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Layer Visibility" },
  async (params) => {
    const result = await sendToBrowser("setLayerVisibility", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "listLayers",
  "\u83B7\u53D6\u5F53\u524D\u6240\u6709\u56FE\u5C42\u5217\u8868\uFF08\u542B ID\u3001\u540D\u79F0\u3001\u7C7B\u578B\u3001\u53EF\u89C1\u6027\uFF09",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Layers" },
  async () => {
    const result = await sendToBrowser("listLayers", {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
_registerTool(
  "getLayerSchema",
  "\u83B7\u53D6\u56FE\u5C42\u7684\u5C5E\u6027\u5B57\u6BB5\u7ED3\u6784 \u2014 \u8FD4\u56DE\u5B57\u6BB5\u540D\u3001\u7C7B\u578B\u3001\u793A\u4F8B\u503C\uFF0C\u9002\u7528\u4E8E GeoJSON/CZML/KML/3D Tiles \u56FE\u5C42",
  {
    layerId: z.string().describe("\u56FE\u5C42ID\uFF08\u53EF\u901A\u8FC7 listLayers \u83B7\u53D6\uFF09")
  },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Get Layer Schema" },
  async (params) => {
    const result = await sendToBrowser("getLayerSchema", params);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
var choroplethStyleSchema = z.object({
  field: z.string().min(1).describe("Property field used for choropleth classification"),
  breaks: z.array(z.number()).min(2).describe("Ascending class break values; colors length must be breaks length minus one"),
  colors: z.array(z.string()).min(1).describe("CSS colors for each choropleth interval")
}).superRefine((value, ctx) => {
  if (value.colors.length !== value.breaks.length - 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["colors"],
      message: "colors length must equal breaks length minus one"
    });
  }
  for (let i = 1; i < value.breaks.length; i++) {
    if (value.breaks[i] <= value.breaks[i - 1]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breaks", i],
        message: "breaks must be strictly ascending"
      });
    }
  }
});
var categoryStyleSchema = z.object({
  field: z.string().min(1).describe("Property field used for category styling"),
  colors: z.array(z.string()).min(1).optional().describe("Optional CSS color palette")
});
var layerStyleSchema = z.object({
  color: z.string().optional().describe("CSS color for entity layer features"),
  opacity: z.number().min(0).max(1).optional().describe("Opacity in range 0-1"),
  strokeWidth: z.number().min(0).optional().describe("Polyline or polygon outline width"),
  pointSize: z.number().min(0).optional().describe("Point or billboard size"),
  randomColor: z.boolean().optional().describe("Apply random colors to original GeoJSON entities"),
  gradient: z.tuple([z.string(), z.string()]).optional().describe("Two CSS colors used as index gradient"),
  choropleth: choroplethStyleSchema.optional().describe("GeoJSON choropleth style"),
  category: categoryStyleSchema.optional().describe("GeoJSON category style")
}).superRefine((value, ctx) => {
  const enabled = [
    value.choropleth !== void 0,
    value.category !== void 0,
    value.randomColor === true,
    value.gradient !== void 0
  ].filter(Boolean).length;
  if (enabled > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only one thematic style is allowed: choropleth, category, randomColor, or gradient"
    });
  }
});
var imageryStyleSchema = z.object({
  alpha: z.number().min(0).max(1).optional().describe("Imagery alpha in range 0-1"),
  brightness: z.number().optional().describe("Imagery brightness multiplier"),
  contrast: z.number().optional().describe("Imagery contrast multiplier"),
  hue: z.number().optional().describe("Imagery hue shift in radians"),
  saturation: z.number().optional().describe("Imagery saturation multiplier"),
  gamma: z.number().optional().describe("Imagery gamma correction")
}).refine((value) => Object.values(value).some((v) => v !== void 0), {
  message: "At least one imagery style field is required"
});
var primitiveStyleSchema = z.object({
  color: z.string().optional().describe("CSS fill color for GeoJSON Primitive materials"),
  opacity: z.number().min(0).max(1).optional().describe("Fill alpha in range 0-1"),
  outlineColor: z.string().optional().describe("CSS outline color for GeoJSON Primitive materials"),
  outlineWidth: z.number().min(0).max(255).optional().describe("Outline width in range 0-255"),
  pointSize: z.number().min(0).max(255).optional().describe("Point size in range 0-255"),
  lineWidth: z.number().min(0).max(255).optional().describe("Polyline width in range 0-255")
}).refine((value) => Object.values(value).some((v) => v !== void 0), {
  message: "At least one primitive style field is required"
});
_registerTool(
  "updateLayerStyle",
  "\u4FEE\u6539\u5DF2\u6709\u56FE\u5C42\u7684\u6837\u5F0F\uFF08\u989C\u8272\u3001\u900F\u660E\u5EA6\u3001\u6807\u6CE8\u6837\u5F0F\u30013D Tiles \u6837\u5F0F\u7B49\uFF09",
  {
    layerId: z.string().describe("\u56FE\u5C42ID"),
    labelStyle: z.record(z.unknown()).optional().describe("\u6807\u6CE8\u6837\u5F0F\uFF08font, fillColor, outlineColor, outlineWidth, scale \u7B49\uFF09"),
    layerStyle: layerStyleSchema.optional().describe("Entity layer style. Thematic fields are GeoJSON-only and mutually exclusive."),
    imageryStyle: imageryStyleSchema.optional().describe("Imagery layer visual style. Visibility is controlled by setLayerVisibility."),
    primitiveStyle: primitiveStyleSchema.optional().describe("GeoJSON Primitive material style. Visibility is controlled by setLayerVisibility."),
    tileStyle: z.object({
      color: z.string().optional().describe(`3D Tiles \u989C\u8272\u8868\u8FBE\u5F0F\uFF0C\u5982 "color('red')" \u6216\u6761\u4EF6\u8868\u8FBE\u5F0F`),
      show: z.string().optional().describe('3D Tiles \u663E\u793A\u6761\u4EF6\u8868\u8FBE\u5F0F\uFF0C\u5982 "${Height} > 50"'),
      pointSize: z.string().optional().describe("3D Tiles \u70B9\u5927\u5C0F\u8868\u8FBE\u5F0F"),
      meta: z.record(z.string()).optional().describe("3D Tiles meta \u5C5E\u6027")
    }).optional().describe("3D Tiles \u6837\u5F0F\uFF08Cesium3DTileStyle \u8868\u8FBE\u5F0F\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Update Layer Style" },
  async (params) => {
    const result = await sendToBrowser("updateLayerStyle", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "playTrajectory",
  "\u64AD\u653E\u79FB\u52A8\u8F68\u8FF9\u52A8\u753B",
  {
    id: z.string().optional().describe("\u8F68\u8FF9\u56FE\u5C42ID"),
    name: z.string().optional().describe("\u8F68\u8FF9\u540D\u79F0"),
    coordinates: z.array(z.array(z.number())).describe("\u8F68\u8FF9\u5750\u6807\u6570\u7EC4 [[lon, lat, alt?], ...]"),
    durationSeconds: z.number().optional().default(10).describe("\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09"),
    trailSeconds: z.number().optional().default(2).describe("\u5C3E\u8FF9\u957F\u5EA6\uFF08\u79D2\uFF09"),
    label: z.string().optional().describe("\u79FB\u52A8\u4F53\u6807\u7B7E")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Play Trajectory" },
  async (params) => {
    const result = await sendToBrowser("playTrajectory", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "load3dTiles",
  "\u52A0\u8F7D 3D Tiles \u6570\u636E\u96C6\uFF08\u652F\u6301 URL \u6216 Cesium Ion \u8D44\u4EA7 ID\uFF09",
  {
    id: z.string().optional().describe("\u56FE\u5C42ID"),
    name: z.string().optional().describe("\u56FE\u5C42\u540D\u79F0"),
    url: z.string().optional().describe("tileset.json \u7684 URL\uFF08\u4E0E ionAssetId \u4E8C\u9009\u4E00\uFF09"),
    ionAssetId: z.number().optional().describe("Cesium Ion \u8D44\u4EA7 ID\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    maximumScreenSpaceError: z.number().optional().default(16).describe("\u6700\u5927\u5C4F\u5E55\u7A7A\u95F4\u8BEF\u5DEE\uFF08\u503C\u8D8A\u5C0F\u8D8A\u7CBE\u7EC6\uFF09"),
    heightOffset: z.number().optional().describe("\u9AD8\u5EA6\u504F\u79FB\uFF08\u7C73\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Load 3D Tiles" },
  async (params) => {
    const result = await sendToBrowser("load3dTiles", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "load3dGaussianSplat",
  "\u52A0\u8F7D 3D \u9AD8\u65AF\u6CFC\u6E85\uFF08Gaussian Splat\uFF09\u6570\u636E\u96C6",
  {
    id: z.string().optional().describe("\u56FE\u5C42ID"),
    name: z.string().optional().describe("\u56FE\u5C42\u540D\u79F0"),
    url: z.string().describe("\u9AD8\u65AF\u6CFC\u6E85 tileset.json \u7684 URL"),
    maximumScreenSpaceError: z.number().optional().default(16).describe("\u6700\u5927\u5C4F\u5E55\u7A7A\u95F4\u8BEF\u5DEE\uFF08\u503C\u8D8A\u5C0F\u8D8A\u7CBE\u7EC6\uFF09"),
    show: z.boolean().optional().default(true).describe("\u662F\u5426\u663E\u793A")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Load 3D Gaussian Splat" },
  async (params) => {
    const result = await sendToBrowser("load3dGaussianSplat", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "loadTerrain",
  "\u52A0\u8F7D\u6216\u5207\u6362\u5730\u5F62\uFF08\u5E73\u5766/ArcGIS/CesiumIon/\u81EA\u5B9A\u4E49 URL\uFF09",
  {
    provider: z.enum(["flat", "arcgis", "cesiumion"]).describe("\u5730\u5F62\u63D0\u4F9B\u8005\u7C7B\u578B"),
    url: z.string().optional().describe("\u81EA\u5B9A\u4E49\u5730\u5F62\u670D\u52A1 URL"),
    cesiumIonAssetId: z.number().optional().describe("Cesium Ion \u8D44\u4EA7ID\uFF08provider=cesiumion \u65F6\u9700\u8981\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Load Terrain" },
  async (params) => {
    const result = await sendToBrowser("loadTerrain", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "loadImageryService",
  "\u52A0\u8F7D\u5F71\u50CF\u670D\u52A1\u56FE\u5C42\uFF08WMS/WMTS/XYZ/ArcGIS MapServer/Cesium Ion\uFF09",
  {
    id: z.string().optional().describe("\u56FE\u5C42ID"),
    name: z.string().optional().describe("\u56FE\u5C42\u540D\u79F0"),
    url: z.string().optional().describe("\u5F71\u50CF\u670D\u52A1 URL\uFF08\u4E0E ionAssetId \u4E8C\u9009\u4E00\uFF09"),
    ionAssetId: z.number().optional().describe("Cesium Ion \u5F71\u50CF\u8D44\u4EA7 ID\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    serviceType: z.enum(["wms", "wmts", "xyz", "arcgis_mapserver", "ion"]).optional().describe("\u670D\u52A1\u7C7B\u578B\uFF08\u4F7F\u7528 ionAssetId \u65F6\u53EF\u4E0D\u586B\uFF09"),
    layerName: z.string().optional().describe("WMS/WMTS \u56FE\u5C42\u540D"),
    opacity: z.number().optional().default(1).describe("\u900F\u660E\u5EA6\uFF080~1\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Load Imagery Service" },
  async (params) => {
    const result = await sendToBrowser("loadImageryService", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "loadCzml",
  "\u52A0\u8F7D CZML \u65F6\u5E8F\u6570\u636E\u6E90\uFF08CesiumJS \u539F\u751F\u683C\u5F0F\uFF0C\u652F\u6301\u65F6\u53D8\u4F4D\u7F6E/\u6837\u5F0F/\u52A8\u753B\uFF09\u3002data \u548C url \u4E8C\u9009\u4E00",
  {
    id: z.string().optional().describe("\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09"),
    name: z.string().optional().describe("\u6570\u636E\u6E90\u663E\u793A\u540D\u79F0"),
    data: z.array(z.unknown()).optional().describe("CZML \u6570\u636E\u5305\u6570\u7EC4\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    url: z.string().optional().describe("CZML \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF0C\u6D4F\u89C8\u5668\u7AEF fetch \u52A0\u8F7D\uFF09"),
    sourceUri: z.string().optional().describe("CZML \u4E2D\u76F8\u5BF9\u5F15\u7528\u7684\u57FA\u7840 URI"),
    clampToGround: z.boolean().optional().describe("\u5C06\u5B9E\u4F53\u8D34\u5730\u663E\u793A"),
    flyTo: z.boolean().optional().describe("\u52A0\u8F7D\u540E\u81EA\u52A8\u98DE\u884C\u5230\u6570\u636E\u8303\u56F4\uFF08\u9ED8\u8BA4 true\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Load CZML" },
  async (params) => {
    const result = await sendToBrowser("loadCzml", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "loadKml",
  "\u52A0\u8F7D KML/KMZ \u6570\u636E\u6E90\uFF08Google Earth \u683C\u5F0F\uFF09\u3002url \u548C data \u4E8C\u9009\u4E00",
  {
    id: z.string().optional().describe("\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09"),
    name: z.string().optional().describe("\u6570\u636E\u6E90\u663E\u793A\u540D\u79F0"),
    url: z.string().optional().describe("KML/KMZ \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF0C\u6D4F\u89C8\u5668\u7AEF fetch \u52A0\u8F7D\uFF09"),
    data: z.string().optional().describe("KML XML \u5B57\u7B26\u4E32\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    sourceUri: z.string().optional().describe("KML \u4E2D\u76F8\u5BF9\u5F15\u7528\u7684\u57FA\u7840 URI"),
    clampToGround: z.boolean().optional().describe("\u5C06\u5B9E\u4F53\u8D34\u5730\u663E\u793A"),
    flyTo: z.boolean().optional().describe("\u52A0\u8F7D\u540E\u81EA\u52A8\u98DE\u884C\u5230\u6570\u636E\u8303\u56F4\uFF08\u9ED8\u8BA4 true\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Load KML/KMZ" },
  async (params) => {
    const result = await sendToBrowser("loadKml", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setEdgeDisplayMode",
  "\u8BBE\u7F6E 3D Tiles \u8FB9\u7F18\u663E\u793A\u6A21\u5F0F\uFF08\u4EC5\u8868\u9762 / \u8868\u9762+\u8FB9\u7F18 / \u4EC5\u8FB9\u7F18\u7EBF\u6846\uFF09",
  {
    tilesetId: z.string().optional().describe("\u76EE\u6807\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u5E94\u7528\u4E8E\u573A\u666F\u4E2D\u6240\u6709 3D Tiles\uFF09"),
    mode: z.enum(["surfaces_only", "surfaces_and_edges", "edges_only"]).describe("\u8FB9\u7F18\u663E\u793A\u6A21\u5F0F\uFF1Asurfaces_only=\u4EC5\u8868\u9762, surfaces_and_edges=\u8868\u9762+\u8FB9\u7F18, edges_only=\u4EC5\u7EBF\u6846")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Edge Display Mode" },
  async (params) => {
    const result = await sendToBrowser("setEdgeDisplayMode", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "lookAtTransform",
  "Look at a specific position from a given heading/pitch/range (orbit-style camera)",
  {
    longitude: z.number().describe("Target longitude (degrees)"),
    latitude: z.number().describe("Target latitude (degrees)"),
    height: z.number().optional().default(0).describe("Target height (meters)"),
    heading: z.number().optional().default(0).describe("Camera heading (degrees), 0=North"),
    pitch: z.number().optional().default(-45).describe("Camera pitch (degrees), -90=straight down"),
    range: z.number().optional().default(1e3).describe("Distance from target (meters)")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Look At Transform" },
  async (params) => {
    const result = await sendToBrowser("lookAtTransform", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "startOrbit",
  "Start orbiting the camera around the current view center",
  {
    speed: z.number().optional().default(5e-3).describe("Rotation speed (radians per tick)"),
    clockwise: z.boolean().optional().default(true).describe("Orbit direction")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Start Orbit" },
  async (params) => {
    const result = await sendToBrowser("startOrbit", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "stopOrbit",
  "Stop the camera orbit animation",
  {},
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Stop Orbit" },
  async () => {
    const result = await sendToBrowser("stopOrbit", {});
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setCameraOptions",
  "Configure camera controller options (enable/disable rotation, zoom, tilt, etc.)",
  {
    enableRotate: z.boolean().optional().describe("Enable camera rotation"),
    enableTranslate: z.boolean().optional().describe("Enable camera translation"),
    enableZoom: z.boolean().optional().describe("Enable camera zoom"),
    enableTilt: z.boolean().optional().describe("Enable camera tilt"),
    enableLook: z.boolean().optional().describe("Enable camera look"),
    minimumZoomDistance: z.number().optional().describe("Minimum zoom distance (meters)"),
    maximumZoomDistance: z.number().optional().describe("Maximum zoom distance (meters)"),
    enableInputs: z.boolean().optional().describe("Enable/disable all camera inputs")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Camera Options" },
  async (params) => {
    const result = await sendToBrowser("setCameraOptions", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
var colorSchema = z.union([
  z.string().describe('CSS color string (e.g. "#FF0000", "red")'),
  z.object({ red: z.number().describe("Red channel (0-1)"), green: z.number().describe("Green channel (0-1)"), blue: z.number().describe("Blue channel (0-1)"), alpha: z.number().optional().describe("Alpha channel (0-1)") }).describe("RGBA color object")
]).optional();
var materialSchema = z.union([
  z.string().describe("CSS color string"),
  z.object({ red: z.number().describe("Red (0-1)"), green: z.number().describe("Green (0-1)"), blue: z.number().describe("Blue (0-1)"), alpha: z.number().optional().describe("Alpha (0-1)") }).describe("RGBA color"),
  z.object({
    type: z.enum(["color", "image", "checkerboard", "stripe", "grid"]).describe("Material type"),
    color: z.union([z.string(), z.object({ red: z.number().describe("Red (0-1)"), green: z.number().describe("Green (0-1)"), blue: z.number().describe("Blue (0-1)"), alpha: z.number().optional().describe("Alpha (0-1)") })]).optional().describe("Base color"),
    image: z.string().optional().describe("Image URL"),
    evenColor: z.union([z.string(), z.object({ red: z.number().describe("Red (0-1)"), green: z.number().describe("Green (0-1)"), blue: z.number().describe("Blue (0-1)"), alpha: z.number().optional().describe("Alpha (0-1)") })]).optional().describe("Even color for checkerboard/stripe"),
    oddColor: z.union([z.string(), z.object({ red: z.number().describe("Red (0-1)"), green: z.number().describe("Green (0-1)"), blue: z.number().describe("Blue (0-1)"), alpha: z.number().optional().describe("Alpha (0-1)") })]).optional().describe("Odd color for checkerboard/stripe"),
    orientation: z.enum(["horizontal", "vertical"]).optional().describe("Stripe orientation"),
    cellAlpha: z.number().optional().describe("Cell alpha for grid material")
  }).describe("Complex material specification")
]).optional();
var orientationSchema = z.object({
  heading: z.number().describe("Heading (degrees)"),
  pitch: z.number().describe("Pitch (degrees)"),
  roll: z.number().describe("Roll (degrees)")
}).optional();
var positionDegreesSchema = z.object({
  longitude: z.number().describe("Longitude (degrees)"),
  latitude: z.number().describe("Latitude (degrees)"),
  height: z.number().optional().describe("Height above ground (meters)")
});
_registerTool(
  "addBillboard",
  "Add a billboard (image icon) at a position on the globe",
  {
    longitude: z.number().describe("Longitude (degrees)"),
    latitude: z.number().describe("Latitude (degrees)"),
    height: z.number().optional().default(0).describe("Height (meters)"),
    name: z.string().optional().describe("Billboard name"),
    image: z.string().describe("Image URL for the billboard"),
    scale: z.number().optional().default(1).describe("Scale factor"),
    color: colorSchema.describe("Tint color"),
    pixelOffset: z.object({ x: z.number(), y: z.number() }).optional().describe("Pixel offset from position"),
    horizontalOrigin: z.enum(["CENTER", "LEFT", "RIGHT"]).optional().describe("Horizontal origin"),
    verticalOrigin: z.enum(["CENTER", "TOP", "BOTTOM", "BASELINE"]).optional().describe("Vertical origin"),
    heightReference: z.enum(["NONE", "CLAMP_TO_GROUND", "RELATIVE_TO_GROUND"]).optional().describe("Height reference")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Billboard" },
  async (params) => {
    const result = await sendToBrowser("addBillboard", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addBox",
  "Add a 3D box entity at a position",
  {
    longitude: z.number().describe("Longitude (degrees)"),
    latitude: z.number().describe("Latitude (degrees)"),
    height: z.number().optional().default(0).describe("Height (meters)"),
    name: z.string().optional().describe("Box name"),
    dimensions: z.object({
      width: z.number().describe("Width in meters (X)"),
      length: z.number().describe("Length in meters (Y)"),
      height: z.number().describe("Height in meters (Z)")
    }).describe("Box dimensions"),
    material: materialSchema.describe("Material (color string, RGBA object, or material spec)"),
    outline: z.boolean().optional().default(true).describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color"),
    fill: z.boolean().optional().default(true).describe("Show fill"),
    orientation: orientationSchema.describe("Orientation (heading/pitch/roll in degrees)"),
    heightReference: z.enum(["NONE", "CLAMP_TO_GROUND", "RELATIVE_TO_GROUND"]).optional().describe("Height reference")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Box" },
  async (params) => {
    const result = await sendToBrowser("addBox", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addCorridor",
  "Add a corridor (path with width) entity",
  {
    name: z.string().optional().describe("Corridor name"),
    positions: z.array(positionDegreesSchema).describe("Array of positions along the corridor"),
    width: z.number().describe("Corridor width in meters"),
    material: materialSchema.describe("Material"),
    cornerType: z.enum(["ROUNDED", "MITERED", "BEVELED"]).optional().describe("Corner type"),
    height: z.number().optional().describe("Height above ground (meters)"),
    extrudedHeight: z.number().optional().describe("Extruded height (meters)"),
    outline: z.boolean().optional().describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Corridor" },
  async (params) => {
    const result = await sendToBrowser("addCorridor", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addCylinder",
  "Add a cylinder or cone entity at a position",
  {
    longitude: z.number().describe("Longitude (degrees)"),
    latitude: z.number().describe("Latitude (degrees)"),
    height: z.number().optional().default(0).describe("Height (meters)"),
    name: z.string().optional().describe("Cylinder name"),
    length: z.number().describe("Cylinder length/height in meters"),
    topRadius: z.number().describe("Top radius in meters"),
    bottomRadius: z.number().describe("Bottom radius in meters"),
    material: materialSchema.describe("Material"),
    outline: z.boolean().optional().default(true).describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color"),
    fill: z.boolean().optional().default(true).describe("Show fill"),
    orientation: orientationSchema.describe("Orientation (heading/pitch/roll in degrees)"),
    numberOfVerticalLines: z.number().optional().default(16).describe("Number of vertical lines"),
    slices: z.number().optional().default(128).describe("Number of slices")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Cylinder" },
  async (params) => {
    const result = await sendToBrowser("addCylinder", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addEllipse",
  "Add an ellipse (oval) entity at a position",
  {
    longitude: z.number().describe("Center longitude (degrees)"),
    latitude: z.number().describe("Center latitude (degrees)"),
    height: z.number().optional().default(0).describe("Height (meters)"),
    name: z.string().optional().describe("Ellipse name"),
    semiMajorAxis: z.number().describe("Semi-major axis in meters"),
    semiMinorAxis: z.number().describe("Semi-minor axis in meters"),
    material: materialSchema.describe("Material"),
    extrudedHeight: z.number().optional().describe("Extruded height (meters)"),
    rotation: z.number().optional().describe("Rotation (radians)"),
    outline: z.boolean().optional().describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color"),
    fill: z.boolean().optional().default(true).describe("Show fill"),
    stRotation: z.number().optional().describe("Texture rotation (radians)"),
    numberOfVerticalLines: z.number().optional().describe("Number of vertical lines")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Ellipse" },
  async (params) => {
    const result = await sendToBrowser("addEllipse", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addRectangle",
  "Add a rectangle entity defined by geographic bounds",
  {
    name: z.string().optional().describe("Rectangle name"),
    west: z.number().describe("West longitude (degrees)"),
    south: z.number().describe("South latitude (degrees)"),
    east: z.number().describe("East longitude (degrees)"),
    north: z.number().describe("North latitude (degrees)"),
    material: materialSchema.describe("Material"),
    height: z.number().optional().describe("Height (meters)"),
    extrudedHeight: z.number().optional().describe("Extruded height (meters)"),
    rotation: z.number().optional().describe("Rotation (radians)"),
    outline: z.boolean().optional().describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color"),
    fill: z.boolean().optional().default(true).describe("Show fill"),
    stRotation: z.number().optional().describe("Texture rotation (radians)")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Rectangle" },
  async (params) => {
    const result = await sendToBrowser("addRectangle", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addWall",
  "Add a wall entity along a series of positions",
  {
    name: z.string().optional().describe("Wall name"),
    positions: z.array(positionDegreesSchema).describe("Array of positions along the wall"),
    minimumHeights: z.array(z.number()).optional().describe("Minimum heights at each position"),
    maximumHeights: z.array(z.number()).optional().describe("Maximum heights at each position"),
    material: materialSchema.describe("Material"),
    outline: z.boolean().optional().describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color"),
    fill: z.boolean().optional().default(true).describe("Show fill")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Wall" },
  async (params) => {
    const result = await sendToBrowser("addWall", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "createAnimation",
  "Create a time-based animation with waypoints (moving entity along a path)",
  {
    name: z.string().optional().describe("Animation name"),
    waypoints: z.array(z.object({
      longitude: z.number().describe("Longitude (degrees)"),
      latitude: z.number().describe("Latitude (degrees)"),
      height: z.number().optional().describe("Height (meters)"),
      time: z.string().describe("ISO 8601 timestamp")
    })).describe("Array of waypoints with positions and timestamps"),
    modelUri: z.string().optional().describe("glTF/GLB model URL, or preset: cesium_man, cesium_air, ground_vehicle, cesium_drone"),
    showPath: z.boolean().optional().default(true).describe("Show trail path"),
    pathWidth: z.number().optional().default(2).describe("Path width (pixels)"),
    pathColor: z.string().optional().default("#00FF00").describe("Path color (CSS)"),
    pathLeadTime: z.number().optional().default(0).describe("Path lead time (seconds)"),
    pathTrailTime: z.number().optional().default(1e10).describe("Path trail time (seconds)"),
    multiplier: z.number().optional().default(1).describe("Clock speed multiplier"),
    shouldAnimate: z.boolean().optional().default(true).describe("Auto-start animation")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Create Animation" },
  async (params) => {
    const result = await sendToBrowser("createAnimation", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "controlAnimation",
  "Play or pause the current animation",
  {
    action: z.enum(["play", "pause"]).describe("Play or pause")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Control Animation" },
  async (params) => {
    const result = await sendToBrowser("controlAnimation", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "removeAnimation",
  "Remove an animation entity",
  {
    entityId: z.string().describe("Entity ID of the animation to remove")
  },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Remove Animation" },
  async (params) => {
    const result = await sendToBrowser("removeAnimation", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "listAnimations",
  "List all active animations",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Animations" },
  async () => {
    const result = await sendToBrowser("listAnimations", {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
_registerTool(
  "updateAnimationPath",
  "Update the visual properties of an animation path",
  {
    entityId: z.string().describe("Entity ID of the animation"),
    width: z.number().optional().describe("New path width (pixels)"),
    color: z.string().optional().describe("New path color (CSS)"),
    leadTime: z.number().optional().describe("New lead time (seconds)"),
    trailTime: z.number().optional().describe("New trail time (seconds)"),
    show: z.boolean().optional().describe("Show/hide path")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Update Animation Path" },
  async (params) => {
    const result = await sendToBrowser("updateAnimationPath", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "trackEntity",
  "Track (follow) an entity with the camera, or stop tracking",
  {
    entityId: z.string().optional().describe("Entity ID to track (omit to stop tracking)"),
    heading: z.number().optional().describe("Camera heading (degrees)"),
    pitch: z.number().optional().default(-30).describe("Camera pitch (degrees)"),
    range: z.number().optional().default(500).describe("Camera distance from entity (meters)")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Track Entity" },
  async (params) => {
    const result = await sendToBrowser("trackEntity", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "controlClock",
  "Configure the Cesium clock (time range, speed, animation state)",
  {
    action: z.enum(["configure", "setTime", "setMultiplier"]).describe("Clock action"),
    startTime: z.string().optional().describe("ISO 8601 start time (for configure)"),
    stopTime: z.string().optional().describe("ISO 8601 stop time (for configure)"),
    currentTime: z.string().optional().describe("ISO 8601 current time (for configure)"),
    time: z.string().optional().describe("ISO 8601 time to jump to (for setTime)"),
    multiplier: z.number().optional().describe("Clock speed multiplier (for configure/setMultiplier)"),
    shouldAnimate: z.boolean().optional().describe("Whether clock should animate (for configure)"),
    clockRange: z.enum(["UNBOUNDED", "CLAMPED", "LOOP_STOP"]).optional().describe("Clock range mode (for configure)")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Control Clock" },
  async (params) => {
    const result = await sendToBrowser("controlClock", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setGlobeLighting",
  "Enable/disable globe lighting and atmospheric effects",
  {
    enableLighting: z.boolean().optional().describe("Enable globe lighting"),
    dynamicAtmosphereLighting: z.boolean().optional().describe("Enable dynamic atmosphere lighting"),
    dynamicAtmosphereLightingFromSun: z.boolean().optional().describe("Use sun position for atmosphere lighting")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Globe Lighting" },
  async (params) => {
    const result = await sendToBrowser("setGlobeLighting", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setSceneOptions",
  "Configure scene environment (fog, atmosphere, shadows, sun, moon, background color, depth testing)",
  {
    fogEnabled: z.boolean().optional().describe("Enable/disable fog"),
    fogDensity: z.number().optional().describe("Fog density (0.0~1.0, default ~0.0002)"),
    fogMinimumBrightness: z.number().optional().describe("Minimum fog brightness (0.0~1.0)"),
    skyAtmosphereShow: z.boolean().optional().describe("Show sky atmosphere"),
    skyAtmosphereHueShift: z.number().optional().describe("Sky hue shift (-1.0~1.0)"),
    skyAtmosphereSaturationShift: z.number().optional().describe("Sky saturation shift (-1.0~1.0)"),
    skyAtmosphereBrightnessShift: z.number().optional().describe("Sky brightness shift (-1.0~1.0)"),
    groundAtmosphereShow: z.boolean().optional().describe("Show ground atmosphere"),
    shadowsEnabled: z.boolean().optional().describe("Enable shadows"),
    shadowsSoftShadows: z.boolean().optional().describe("Use soft shadows"),
    shadowsDarkness: z.number().optional().describe("Shadow darkness (0.0=no shadow, 1.0=fully dark)"),
    sunShow: z.boolean().optional().describe("Show the sun"),
    sunGlowFactor: z.number().optional().describe("Sun glow factor (default 1.0)"),
    moonShow: z.boolean().optional().describe("Show the moon"),
    depthTestAgainstTerrain: z.boolean().optional().describe("Enable depth test against terrain (entities behind terrain are hidden)"),
    backgroundColor: z.string().optional().describe('Scene background color (CSS format, e.g. "#000000")')
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Scene Options" },
  async (params) => {
    const result = await sendToBrowser("setSceneOptions", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setPostProcess",
  "Configure post-processing effects (bloom glow, ambient occlusion SSAO, anti-aliasing FXAA)",
  {
    bloom: z.boolean().optional().describe("Enable bloom glow effect"),
    bloomContrast: z.number().optional().describe("Bloom contrast (default 128)"),
    bloomBrightness: z.number().optional().describe("Bloom brightness (default -0.3)"),
    bloomDelta: z.number().optional().describe("Bloom delta (default 1.0)"),
    bloomSigma: z.number().optional().describe("Bloom sigma (default 3.78)"),
    bloomStepSize: z.number().optional().describe("Bloom step size (default 5.0)"),
    bloomGlowOnly: z.boolean().optional().describe("Show only the glow (no base scene)"),
    ambientOcclusion: z.boolean().optional().describe("Enable ambient occlusion (SSAO)"),
    aoIntensity: z.number().optional().describe("AO intensity (default 3.0)"),
    aoBias: z.number().optional().describe("AO bias (default 0.1)"),
    aoLengthCap: z.number().optional().describe("AO length cap (default 0.26)"),
    aoStepSize: z.number().optional().describe("AO step size (default 1.95)"),
    fxaa: z.boolean().optional().describe("Enable FXAA anti-aliasing")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Post-Processing" },
  async (params) => {
    const result = await sendToBrowser("setPostProcess", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setIonToken",
  "Set Cesium Ion access token for loading Ion assets (3D Tiles, imagery, terrain). Must be called before loading private Ion resources.",
  { token: z.string().describe("Cesium Ion access token") },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Ion Token" },
  async (params) => {
    const result = await sendToBrowser("setIonToken", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
var _lastGeocodeTime = 0;
var _proxyDispatcher;
var _proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
if (_proxyUrl) {
  import("undici").then(({ ProxyAgent }) => {
    _proxyDispatcher = new ProxyAgent(_proxyUrl);
  }).catch(() => {
  });
}
_registerTool(
  "geocode",
  "\u5C06\u5730\u5740\u3001\u5730\u6807\u6216\u5730\u540D\u8F6C\u6362\u4E3A\u5730\u7406\u5750\u6807\uFF08\u7ECF\u7EAC\u5EA6\uFF09\u3002\u4F7F\u7528 OpenStreetMap Nominatim \u514D\u8D39\u670D\u52A1\uFF0C\u65E0\u9700 API Key\u3002",
  {
    address: z.string().min(1).describe('\u5730\u5740\u3001\u5730\u6807\u6216\u5730\u540D\uFF0C\u4F8B\u5982 "\u6545\u5BAB"\u3001"Eiffel Tower"\u3001"\u4E1C\u4EAC\u5854"'),
    countryCode: z.string().length(2).optional().describe('\u4E24\u4F4D ISO \u56FD\u5BB6\u4EE3\u7801\u9650\u5236\u641C\u7D22\u8303\u56F4\uFF08\u5982 "CN"\u3001"US"\u3001"JP"\uFF09')
  },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: "Geocode Address" },
  async ({ address, countryCode }) => {
    const now = Date.now();
    const wait = 1100 - (now - _lastGeocodeTime);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    _lastGeocodeTime = Date.now();
    const params = new URLSearchParams({
      q: address,
      format: "json",
      addressdetails: "1",
      limit: "1"
    });
    if (countryCode) params.set("countrycodes", countryCode);
    const ua = process.env.OSM_USER_AGENT || "cesium-mcp-runtime/1.0";
    const fetchOptions = {
      headers: { "User-Agent": ua }
    };
    if (_proxyDispatcher) fetchOptions.dispatcher = _proxyDispatcher;
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, fetchOptions);
    if (!resp.ok) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `Nominatim API error: ${resp.status}` }) }], isError: true };
    }
    const data = await resp.json();
    if (!data.length) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `No results found for: ${address}` }) }] };
    }
    const item = data[0];
    const result = {
      success: true,
      longitude: parseFloat(item.lon),
      latitude: parseFloat(item.lat),
      displayName: item.display_name,
      boundingBox: item.boundingbox ? {
        south: parseFloat(item.boundingbox[0]),
        north: parseFloat(item.boundingbox[1]),
        west: parseFloat(item.boundingbox[2]),
        east: parseFloat(item.boundingbox[3])
      } : void 0
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
server.prompt(
  "cesium-quickstart",
  "Quick reference for using Cesium MCP tools",
  async () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Cesium MCP Quick Start Guide:

1. **Camera**: flyTo(lng, lat) to navigate, setView for instant move, getView to read current position
2. **Entities**: addMarker for points, addPolygon/addPolyline for shapes, addModel for 3D models
3. **Layers**: addGeoJsonLayer for vector data, load3dTiles for 3D city models, loadImageryService for WMS/WMTS
4. **Animation**: createAnimation with waypoints for moving entities, controlAnimation to play/pause
5. **Interaction**: screenshot to capture view, highlight to emphasize features
6. **Discovery**: list_toolsets to see available tool groups, enable_toolset to activate more tools

All entity/layer operations return an ID for subsequent updates or removal.`
      }
    }]
  })
);
if (!_allMode) {
  server.tool(
    "list_toolsets",
    "List all available tool groups and their enabled status. Call this to discover additional capabilities before asking the user to configure anything.",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Toolsets" },
    async () => {
      const groups = Object.entries(TOOLSETS).map(([name, tools]) => ({
        name,
        description: TOOLSET_DESCRIPTIONS[name] ?? "",
        tools: tools.length,
        enabled: _enabledSets.has(name),
        toolNames: tools
      }));
      return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
    }
  );
  server.tool(
    "enable_toolset",
    "Enable a tool group to make its tools available. Call list_toolsets first to see available groups.",
    {
      toolset: z.string().describe('Name of the toolset to enable (e.g. "camera", "animation", "entity-ext")')
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Enable Toolset" },
    async ({ toolset }) => {
      if (!(toolset in TOOLSETS)) {
        return {
          content: [{ type: "text", text: `Unknown toolset "${toolset}". Available: ${Object.keys(TOOLSETS).join(", ")}` }],
          isError: true
        };
      }
      if (_enabledSets.has(toolset)) {
        return { content: [{ type: "text", text: `Toolset "${toolset}" is already enabled.` }] };
      }
      const added = _enableToolset(toolset);
      server.sendToolListChanged?.();
      return {
        content: [{
          type: "text",
          text: `Enabled toolset "${toolset}" \u2014 ${added.length} new tools available: ${added.join(", ")}`
        }]
      };
    }
  );
}
server.tool(
  "listSessions",
  _localeKey === "zh-cn" ? "\u5217\u51FA\u5F53\u524D\u6240\u6709\u5DF2\u8FDE\u63A5\u7684\u6D4F\u89C8\u5668 session\uFF08ID \u548C\u8FDE\u63A5\u72B6\u6001\uFF09\uFF0C\u7528\u4E8E\u591A\u6D4F\u89C8\u5668\u8DEF\u7531" : "List all connected browser sessions (ID and connection state) for multi-browser routing",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Sessions" },
  async () => {
    const sessions = Array.from(browserClients.entries()).map(([id, ws]) => ({
      sessionId: id,
      connected: ws.readyState === WebSocket.OPEN,
      isDefault: id === DEFAULT_SESSION_ID
    }));
    return { content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }] };
  }
);
function _createHttpMcpServer(filterToolsets) {
  const s = new McpServer({
    name: "cesium-mcp-runtime",
    version: "1.143.0",
    title: "Cesium MCP Runtime",
    description: "AI-powered 3D globe control via MCP \u2014 camera, layers, entities, animation, and interaction with CesiumJS.",
    websiteUrl: "https://github.com/gaopengbin/cesium-mcp"
  }, {
    instructions: "Cesium MCP Runtime provides tools for controlling a CesiumJS 3D globe via AI. A browser with cesium-mcp-bridge must be connected via WebSocket for command execution. Use view tools (flyTo, setView) to navigate, entity tools to add markers/polygons/models, layer tools to manage GeoJSON/3D Tiles, and animation tools for time-based animations."
  });
  s.resource(
    "camera",
    "cesium://scene/camera",
    { description: "\u5F53\u524D\u76F8\u673A\u72B6\u6001\uFF08\u7ECF\u7EAC\u5EA6\u3001\u9AD8\u5EA6\u3001\u89D2\u5EA6\uFF09", mimeType: "application/json" },
    async () => {
      try {
        const result = await sendToBrowser("getView", {});
        return { contents: [{ uri: "cesium://scene/camera", text: JSON.stringify(result), mimeType: "application/json" }] };
      } catch {
        return { contents: [{ uri: "cesium://scene/camera", text: '{"error":"no browser connected"}', mimeType: "application/json" }] };
      }
    }
  );
  s.resource(
    "layers",
    "cesium://scene/layers",
    { description: "\u5F53\u524D\u5DF2\u52A0\u8F7D\u7684\u56FE\u5C42\u5217\u8868\uFF08ID\u3001\u540D\u79F0\u3001\u7C7B\u578B\u3001\u53EF\u89C1\u6027\uFF09", mimeType: "application/json" },
    async () => {
      try {
        const result = await sendToBrowser("listLayers", {});
        return { contents: [{ uri: "cesium://scene/layers", text: JSON.stringify(result), mimeType: "application/json" }] };
      } catch {
        return { contents: [{ uri: "cesium://scene/layers", text: '{"error":"no browser connected"}', mimeType: "application/json" }] };
      }
    }
  );
  const allowedToolsets = filterToolsets ?? new Set(Object.keys(TOOLSETS));
  const allowedTools = /* @__PURE__ */ new Set();
  for (const setName of allowedToolsets) {
    if (TOOLSETS[setName]) {
      for (const tool of TOOLSETS[setName]) allowedTools.add(tool);
    }
  }
  for (const [name, args] of _toolDefs.entries()) {
    if (allowedTools.has(name)) {
      _applyToolDef(s, args);
    }
  }
  s.tool(
    "listSessions",
    _localeKey === "zh-cn" ? "\u5217\u51FA\u5F53\u524D\u6240\u6709\u5DF2\u8FDE\u63A5\u7684\u6D4F\u89C8\u5668 session\uFF08ID \u548C\u8FDE\u63A5\u72B6\u6001\uFF09\uFF0C\u7528\u4E8E\u591A\u6D4F\u89C8\u5668\u8DEF\u7531" : "List all connected browser sessions (ID and connection state) for multi-browser routing",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Sessions" },
    async () => {
      const sessions = Array.from(browserClients.entries()).map(([id, ws]) => ({
        sessionId: id,
        connected: ws.readyState === WebSocket.OPEN,
        isDefault: id === DEFAULT_SESSION_ID
      }));
      return { content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }] };
    }
  );
  return s;
}
async function _handleMcpRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  if (parsedUrl.pathname !== "/mcp") {
    res.writeHead(404);
    res.end("Not Found \u2014 MCP endpoint is POST /mcp");
    return;
  }
  const urlSession = parsedUrl.searchParams.get("session") ?? void 0;
  const urlToolsets = parsedUrl.searchParams.get("toolsets")?.trim();
  const filterToolsets = urlToolsets ? new Set(urlToolsets.split(",").map((s) => s.trim()).filter((s) => s in TOOLSETS)) : void 0;
  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      const run = async () => {
        try {
          const parsedBody = JSON.parse(body);
          const mcpServer = _createHttpMcpServer(filterToolsets);
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: void 0
            // stateless
          });
          res.on("close", () => {
            transport.close().catch(() => {
            });
          });
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, parsedBody);
        } catch {
          if (!res.headersSent) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
          }
        }
      };
      if (urlSession) {
        await _httpSessionStore.run(urlSession, run);
      } else {
        await run();
      }
    });
    return;
  }
  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32e3, message: "Method not allowed in stateless mode" }, id: null }));
}
function createSandboxServer() {
  for (const setName of Object.keys(TOOLSETS)) {
    if (!_enabledSets.has(setName)) _enableToolset(setName);
  }
  return server;
}
async function main(argv = []) {
  const transportArg = _parseArg(argv, "--transport") ?? process.env.MCP_TRANSPORT ?? "stdio";
  const mcpPortArg = parseInt(_parseArg(argv, "--port") ?? process.env.MCP_HTTP_PORT ?? "0");
  await startServer();
  if (transportArg === "http") {
    const port = mcpPortArg || WS_PORT + 100;
    const mcpHttpServer = createServer(_handleMcpRequest);
    mcpHttpServer.listen(port, () => {
      const allToolCount = _toolDefs.size;
      console.error(`[cesium-mcp-runtime] MCP Server running (Streamable HTTP), ${allToolCount} tools available`);
      console.error(`[cesium-mcp-runtime] MCP endpoint: http://localhost:${port}/mcp`);
      console.error("[cesium-mcp-runtime] All toolsets enabled for HTTP mode");
      if (_relayPort > 0) {
        console.error(`[cesium-mcp-runtime] Relay mode active \u2192 commands forwarded to port ${_relayPort}`);
      }
    });
    return;
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const metaCount = _allMode ? 0 : 2;
  console.error(`[cesium-mcp-runtime] MCP Server running (stdio), ${_enabledTools.size + metaCount} tools registered (toolsets: ${[..._enabledSets].join(", ")})`);
  if (_relayPort > 0) {
    console.error(`[cesium-mcp-runtime] Relay mode active \u2192 commands forwarded to port ${_relayPort}`);
  }
}
function _parseArg(argv, key) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === key && i + 1 < argv.length) return argv[i + 1];
    if (argv[i]?.startsWith(key + "=")) return argv[i].slice(key.length + 1);
  }
  return void 0;
}

export {
  createSandboxServer,
  main
};
