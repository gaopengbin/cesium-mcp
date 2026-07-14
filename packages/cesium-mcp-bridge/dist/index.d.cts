import * as Cesium from 'cesium';

/**
 * 颜色输入格式：CSS 字符串或 RGBA 对象 (0-1 范围)
 */
type ColorInput = string | {
    red: number;
    green: number;
    blue: number;
    alpha?: number;
};

interface BridgeCommand {
    action: string;
    params: Record<string, unknown>;
}
interface BridgeResult {
    success: boolean;
    data?: unknown;
    error?: string;
    message?: string;
}
interface FlyToParams {
    longitude: number;
    latitude: number;
    height?: number;
    heading?: number;
    pitch?: number;
    roll?: number;
    duration?: number;
}
interface SetViewParams {
    longitude: number;
    latitude: number;
    height?: number;
    heading?: number;
    pitch?: number;
    roll?: number;
}
interface ViewState {
    longitude: number;
    latitude: number;
    height: number;
    heading: number;
    pitch: number;
    roll: number;
}
interface ZoomToExtentParams {
    bbox: [number, number, number, number];
    duration?: number;
}
interface LayerInfo {
    id: string;
    name: string;
    type: string;
    visible: boolean;
    color: string;
    dataRefId?: string;
}
interface ChoroplethStyle {
    field: string;
    breaks: number[];
    colors: string[];
}
interface CategoryStyle {
    field: string;
    colors?: string[];
}
interface LayerStyle {
    color?: string;
    opacity?: number;
    pointSize?: number;
    strokeWidth?: number;
    /** Thematic styles are mutually exclusive: randomColor, gradient, choropleth, category. */
    /** 每个面/实体随机颜色 */
    randomColor?: boolean;
    /** 按索引渐变填充，指定色系起止色如 ['#FF0000', '#0000FF'] */
    gradient?: [string, string];
    choropleth?: ChoroplethStyle;
    category?: CategoryStyle;
}
interface ImageryLayerStyle {
    /** Alpha in range 0-1. Visibility is controlled by setLayerVisibility. */
    alpha?: number;
    brightness?: number;
    contrast?: number;
    hue?: number;
    saturation?: number;
    gamma?: number;
}
interface PrimitiveLayerStyle {
    color?: string;
    /** Updates the current fill alpha even when color is omitted. */
    opacity?: number;
    outlineColor?: string;
    outlineWidth?: number;
    pointSize?: number;
    lineWidth?: number;
}
interface AddGeoJsonLayerParams {
    id?: string;
    name?: string;
    data?: Record<string, unknown>;
    url?: string;
    style?: LayerStyle;
    dataRefId?: string;
    labelField?: string;
    labelStyle?: {
        font?: string;
        fillColor?: string;
        outlineColor?: string;
        outlineWidth?: number;
        pixelOffset?: [number, number];
        scale?: number;
    };
}
interface AddGeoJsonPrimitiveParams {
    id?: string;
    name?: string;
    data?: any;
    url?: string;
    allowPicking?: boolean;
    show?: boolean;
}
interface AddHeatmapParams {
    id?: string;
    name?: string;
    data: Record<string, unknown>;
    radius?: number;
    gradient?: Record<number, string>;
    blur?: number;
    maxOpacity?: number;
    minOpacity?: number;
    resolution?: number;
}
interface SetBasemapParams {
    basemap: 'dark' | 'satellite' | 'standard' | 'osm' | 'arcgis' | 'light' | 'tianditu_vec' | 'tianditu_img' | 'amap' | 'amap_satellite' | string;
    /** Token for providers that require authentication (e.g. tianditu) */
    token?: string;
    /** Custom URL template with {x},{y},{z} placeholders. When provided, basemap type is ignored. */
    url?: string;
}
interface Load3dTilesParams {
    id?: string;
    name?: string;
    url?: string;
    ionAssetId?: number;
    maximumScreenSpaceError?: number;
    heightOffset?: number;
}
interface AddGaussianSplatParams {
    id?: string;
    name?: string;
    url: string;
    maximumScreenSpaceError?: number;
    show?: boolean;
}
interface LoadTerrainParams {
    provider: 'cesiumion' | 'arcgis' | 'flat';
    url?: string;
    cesiumIonAssetId?: number;
}
interface LoadImageryServiceParams {
    id?: string;
    name?: string;
    url?: string;
    ionAssetId?: number;
    serviceType?: 'wms' | 'wmts' | 'xyz' | 'arcgis_mapserver' | 'ion';
    layerName?: string;
    opacity?: number;
}
interface LoadCzmlParams {
    id?: string;
    name?: string;
    data?: unknown[];
    url?: string;
    sourceUri?: string;
    clampToGround?: boolean;
    flyTo?: boolean;
}
interface LoadKmlParams {
    id?: string;
    name?: string;
    url?: string;
    data?: string;
    sourceUri?: string;
    clampToGround?: boolean;
    flyTo?: boolean;
}
interface PlayTrajectoryParams {
    id?: string;
    name?: string;
    coordinates: number[][];
    durationSeconds?: number;
    trailSeconds?: number;
    label?: string;
}
interface AddLabelParams {
    dataRefId?: string;
    data?: Record<string, unknown>;
    field: string;
    style?: {
        font?: string;
        fillColor?: string;
        outlineColor?: string;
        outlineWidth?: number;
        backgroundColor?: string;
        showBackground?: boolean;
        pixelOffset?: [number, number];
        scale?: number;
    };
}
interface AddMarkerParams {
    longitude: number;
    latitude: number;
    label?: string;
    color?: ColorInput;
    size?: number;
}
interface AddPolylineParams {
    coordinates: number[][];
    color?: ColorInput;
    width?: number;
    clampToGround?: boolean;
    label?: string;
}
interface AddPolygonParams {
    coordinates: number[][];
    color?: ColorInput;
    outlineColor?: ColorInput;
    opacity?: number;
    extrudedHeight?: number;
    clampToGround?: boolean;
    label?: string;
}
interface AddModelParams {
    longitude: number;
    latitude: number;
    height?: number;
    url: string;
    scale?: number;
    heading?: number;
    pitch?: number;
    roll?: number;
    label?: string;
}
interface UpdateEntityParams {
    entityId: string;
    position?: {
        longitude: number;
        latitude: number;
        height?: number;
    };
    label?: string;
    color?: ColorInput;
    scale?: number;
    show?: boolean;
}
interface RemoveEntityParams {
    entityId: string;
}
interface UpdateLayerStyleParams {
    layerId: string;
    labelStyle?: {
        font?: string;
        fillColor?: string;
        outlineColor?: string;
        outlineWidth?: number;
        backgroundColor?: string;
        showBackground?: boolean;
        pixelOffset?: [number, number];
        scale?: number;
        fontSize?: number;
    };
    layerStyle?: LayerStyle;
    imageryStyle?: ImageryLayerStyle;
    primitiveStyle?: PrimitiveLayerStyle;
    tileStyle?: {
        color?: string;
        show?: string;
        pointSize?: string;
        meta?: Record<string, string>;
    };
}
interface ScreenshotResult {
    dataUrl: string;
    width: number;
    height: number;
}
interface HighlightParams {
    layerId?: string;
    featureIndex?: number;
    color?: ColorInput;
    clear?: boolean;
}
interface MeasureParams {
    mode: 'distance' | 'area';
    positions: [number, number, number?][];
    showOnMap?: boolean;
    id?: string;
}
interface MeasureResult {
    mode: 'distance' | 'area';
    value: number;
    unit: string;
    segments?: number[];
    id?: string;
}
interface ClearAllResult {
    removedLayers: number;
    removedEntities: number;
}
interface GetEntityPropertiesParams {
    entityId: string;
}
interface EntityPropertiesResult {
    entityId: string;
    name?: string;
    type: string;
    position?: {
        longitude: number;
        latitude: number;
        height: number;
    };
    properties: Record<string, unknown>;
    graphicProperties: Record<string, unknown>;
    description?: string;
}
interface ExportSceneResult {
    view: ViewState;
    layers: LayerInfo[];
    entities: QueryEntityResult[];
    timestamp: string;
}
interface GetLayerSchemaParams {
    layerId: string;
}
interface LayerSchemaField {
    name: string;
    type: string;
    sample?: unknown;
}
interface LayerSchemaResult {
    layerId: string;
    layerName: string;
    entityCount: number;
    fields: LayerSchemaField[];
    /** 3D Tiles / Ion 资产元数据 */
    metadata?: {
        assetVersion?: string;
        tilesetVersion?: string;
        ionAssetId?: number;
        geometricError?: number;
        boundingSphere?: {
            longitude: number;
            latitude: number;
            height: number;
            radius: number;
        };
        extras?: Record<string, unknown>;
    };
}
type BridgeEventType = 'layerAdded' | 'layerRemoved' | 'viewChanged' | 'error';
interface BridgeEvent {
    type: BridgeEventType;
    data: unknown;
}
type BridgeEventHandler = (event: BridgeEvent) => void;
interface LookAtTransformParams {
    longitude: number;
    latitude: number;
    height?: number;
    heading?: number;
    pitch?: number;
    range?: number;
}
interface StartOrbitParams {
    speed?: number;
    clockwise?: boolean;
}
interface SetCameraOptionsParams {
    enableRotate?: boolean;
    enableTranslate?: boolean;
    enableZoom?: boolean;
    enableTilt?: boolean;
    enableLook?: boolean;
    minimumZoomDistance?: number;
    maximumZoomDistance?: number;
    enableInputs?: boolean;
}
interface MaterialSpec {
    type: 'color' | 'image' | 'checkerboard' | 'stripe' | 'grid';
    color?: ColorInput;
    image?: string;
    repeat?: {
        x: number;
        y: number;
    };
    evenColor?: ColorInput;
    oddColor?: ColorInput;
    orientation?: 'horizontal' | 'vertical';
    cellAlpha?: number;
    lineCount?: {
        x: number;
        y: number;
    };
}
type MaterialInput = ColorInput | MaterialSpec;
interface OrientationInput {
    heading: number;
    pitch: number;
    roll: number;
}
interface AddBillboardParams {
    longitude: number;
    latitude: number;
    height?: number;
    name?: string;
    image: string;
    scale?: number;
    color?: ColorInput;
    pixelOffset?: {
        x: number;
        y: number;
    };
    horizontalOrigin?: 'CENTER' | 'LEFT' | 'RIGHT';
    verticalOrigin?: 'CENTER' | 'TOP' | 'BOTTOM' | 'BASELINE';
    heightReference?: 'NONE' | 'CLAMP_TO_GROUND' | 'RELATIVE_TO_GROUND';
}
interface AddBoxParams {
    longitude: number;
    latitude: number;
    height?: number;
    name?: string;
    dimensions: {
        width: number;
        length: number;
        height: number;
    };
    material?: MaterialInput;
    outline?: boolean;
    outlineColor?: ColorInput;
    fill?: boolean;
    orientation?: OrientationInput;
    heightReference?: 'NONE' | 'CLAMP_TO_GROUND' | 'RELATIVE_TO_GROUND';
}
interface PositionDegrees {
    longitude: number;
    latitude: number;
    height?: number;
}
interface AddCorridorParams {
    name?: string;
    positions: PositionDegrees[];
    width: number;
    material?: MaterialInput;
    cornerType?: 'ROUNDED' | 'MITERED' | 'BEVELED';
    height?: number;
    extrudedHeight?: number;
    outline?: boolean;
    outlineColor?: ColorInput;
}
interface AddCylinderParams {
    longitude: number;
    latitude: number;
    height?: number;
    name?: string;
    length: number;
    topRadius: number;
    bottomRadius: number;
    material?: MaterialInput;
    outline?: boolean;
    outlineColor?: ColorInput;
    fill?: boolean;
    orientation?: OrientationInput;
    numberOfVerticalLines?: number;
    slices?: number;
}
interface AddEllipseParams {
    longitude: number;
    latitude: number;
    height?: number;
    name?: string;
    semiMajorAxis: number;
    semiMinorAxis: number;
    material?: MaterialInput;
    extrudedHeight?: number;
    rotation?: number;
    outline?: boolean;
    outlineColor?: ColorInput;
    fill?: boolean;
    stRotation?: number;
    numberOfVerticalLines?: number;
}
interface AddRectangleParams {
    name?: string;
    west: number;
    south: number;
    east: number;
    north: number;
    material?: MaterialInput;
    height?: number;
    extrudedHeight?: number;
    rotation?: number;
    outline?: boolean;
    outlineColor?: ColorInput;
    fill?: boolean;
    stRotation?: number;
}
interface AddWallParams {
    name?: string;
    positions: PositionDegrees[];
    minimumHeights?: number[];
    maximumHeights?: number[];
    material?: MaterialInput;
    outline?: boolean;
    outlineColor?: ColorInput;
    fill?: boolean;
}
interface AnimationWaypoint {
    longitude: number;
    latitude: number;
    height?: number;
    time: string;
}
interface CreateAnimationParams {
    name?: string;
    waypoints: AnimationWaypoint[];
    modelUri?: string;
    showPath?: boolean;
    pathWidth?: number;
    pathColor?: string;
    pathLeadTime?: number;
    pathTrailTime?: number;
    multiplier?: number;
    shouldAnimate?: boolean;
}
interface ControlAnimationParams {
    action: 'play' | 'pause';
}
interface RemoveAnimationParams {
    entityId: string;
}
interface UpdateAnimationPathParams {
    entityId: string;
    width?: number;
    color?: string;
    leadTime?: number;
    trailTime?: number;
    show?: boolean;
}
interface TrackEntityParams {
    entityId?: string;
    heading?: number;
    pitch?: number;
    range?: number;
}
interface ControlClockParams {
    action: 'configure' | 'setTime' | 'setMultiplier';
    startTime?: string;
    stopTime?: string;
    currentTime?: string;
    time?: string;
    multiplier?: number;
    shouldAnimate?: boolean;
    clockRange?: 'UNBOUNDED' | 'CLAMPED' | 'LOOP_STOP';
}
interface SetGlobeLightingParams {
    enableLighting?: boolean;
    dynamicAtmosphereLighting?: boolean;
    dynamicAtmosphereLightingFromSun?: boolean;
}
interface SetSceneOptionsParams {
    fogEnabled?: boolean;
    fogDensity?: number;
    fogMinimumBrightness?: number;
    skyAtmosphereShow?: boolean;
    skyAtmosphereHueShift?: number;
    skyAtmosphereSaturationShift?: number;
    skyAtmosphereBrightnessShift?: number;
    groundAtmosphereShow?: boolean;
    shadowsEnabled?: boolean;
    shadowsSoftShadows?: boolean;
    shadowsDarkness?: number;
    sunShow?: boolean;
    sunGlowFactor?: number;
    moonShow?: boolean;
    depthTestAgainstTerrain?: boolean;
    backgroundColor?: string;
}
interface SetPostProcessParams {
    bloom?: boolean;
    bloomContrast?: number;
    bloomBrightness?: number;
    bloomDelta?: number;
    bloomSigma?: number;
    bloomStepSize?: number;
    bloomGlowOnly?: boolean;
    ambientOcclusion?: boolean;
    aoIntensity?: number;
    aoBias?: number;
    aoLengthCap?: number;
    aoStepSize?: number;
    fxaa?: boolean;
}
interface SetEdgeDisplayModeParams {
    tilesetId?: string;
    mode: 'surfaces_only' | 'surfaces_and_edges' | 'edges_only';
}
interface SetEdgeDisplayModeResult {
    applied: number;
}
interface AnimationInfo {
    entityId: string;
    name?: string;
    startTime: string;
    stopTime: string;
    exists: boolean;
}
interface BatchEntityDef {
    type: 'marker' | 'polyline' | 'polygon' | 'model' | 'billboard' | 'box' | 'cylinder' | 'ellipse' | 'rectangle' | 'wall' | 'corridor';
    [key: string]: unknown;
}
interface BatchAddEntitiesParams {
    entities: BatchEntityDef[];
}
interface QueryEntitiesParams {
    name?: string;
    type?: string;
    bbox?: [number, number, number, number];
}
interface QueryEntityResult {
    entityId: string;
    name?: string;
    type: string;
    position?: {
        longitude: number;
        latitude: number;
        height: number;
    };
}
interface SaveViewpointParams {
    name: string;
}
interface LoadViewpointParams {
    name: string;
    duration?: number;
}

interface CesiumRefs {
    dataSource?: Cesium.GeoJsonDataSource | Cesium.CzmlDataSource | Cesium.KmlDataSource;
    entity?: Cesium.Entity;
    labelEntities?: Cesium.Entity[];
    tileset?: Cesium.Cesium3DTileset;
    primitive?: any;
    imageryLayer?: Cesium.ImageryLayer;
    styleEntities?: Cesium.Entity[];
    polygonOutlines?: Map<Cesium.Entity, Cesium.Entity[]>;
    movingEntity?: Cesium.Entity;
    trailEntity?: Cesium.Entity;
    trajectoryId?: string;
}
declare class LayerManager {
    private _layers;
    private _cesiumRefs;
    private _viewer;
    constructor(viewer: Cesium.Viewer);
    get layers(): LayerInfo[];
    getCesiumRefs(layerId: string): CesiumRefs | undefined;
    setCesiumRefs(layerId: string, refs: Partial<CesiumRefs>): void;
    addGeoJsonLayer(params: AddGeoJsonLayerParams): Promise<LayerInfo>;
    addGeoJsonPrimitive(params: AddGeoJsonPrimitiveParams): Promise<LayerInfo>;
    addHeatmap(params: AddHeatmapParams): Promise<LayerInfo>;
    removeLayer(id: string): void;
    /** 根据 Cesium Entity 引用反查并移除对应图层记录（不再删除 entity 本身） */
    untrackByEntity(entity: Cesium.Entity): string | undefined;
    setLayerVisibility(id: string, visible: boolean): void;
    toggleLayer(id: string): void;
    zoomToLayer(id: string): void;
    updateLayerStyle(params: UpdateLayerStyleParams): boolean;
    listLayers(): LayerInfo[];
    getLayerSchema(params: GetLayerSchemaParams): LayerSchemaResult;
    private _getTilesetSchema;
    clearAll(): {
        removedLayers: number;
        removedEntities: number;
    };
    /** 更新图层列表引用（供外部响应式框架使用） */
    setLayersRef(layers: LayerInfo[]): void;
    load3dTiles(params: Load3dTilesParams): Promise<LayerInfo>;
    addGaussianSplat(params: AddGaussianSplatParams): Promise<LayerInfo>;
    loadTerrain(params: LoadTerrainParams): void;
    loadImageryService(params: LoadImageryServiceParams): Promise<LayerInfo>;
    loadCzml(params: LoadCzmlParams): Promise<LayerInfo>;
    loadKml(params: LoadKmlParams): Promise<LayerInfo>;
    setBasemap(params: SetBasemapParams): string;
}

/**
 * CesiumBridge — AI Agent 操控 Cesium 的统一执行层
 *
 * 所有 Cesium 操作通过此类暴露，支持两种调用方式：
 * 1. 类型安全的方法调用：bridge.flyTo({...})
 * 2. 命令分发（兼容 MCP/SSE）：bridge.execute({ action: 'flyTo', params: {...} })
 */
declare class CesiumBridge {
    private _viewer;
    private _layerManager;
    private _eventHandlers;
    private _orbitHandler;
    private _animations;
    constructor(viewer: Cesium.Viewer);
    get viewer(): Cesium.Viewer;
    get layerManager(): LayerManager;
    execute(cmd: BridgeCommand): Promise<BridgeResult>;
    flyTo(params: FlyToParams): Promise<void>;
    setView(params: SetViewParams): void;
    getView(): ViewState;
    zoomToExtent(params: ZoomToExtentParams): Promise<void>;
    addGeoJsonLayer(params: AddGeoJsonLayerParams): Promise<LayerInfo>;
    addGeoJsonPrimitive(params: AddGeoJsonPrimitiveParams): Promise<LayerInfo>;
    addHeatmap(params: AddHeatmapParams): Promise<LayerInfo>;
    removeLayer(id: string): void;
    clearAll(): {
        removedLayers: number;
        removedEntities: number;
    };
    setLayerVisibility(id: string, visible: boolean): void;
    toggleLayer(id: string): void;
    zoomToLayer(id: string): void;
    updateLayerStyle(params: UpdateLayerStyleParams): boolean;
    listLayers(): LayerInfo[];
    getLayerSchema(params: GetLayerSchemaParams): LayerSchemaResult;
    setBasemap(params: SetBasemapParams): string;
    load3dTiles(params: Load3dTilesParams): Promise<LayerInfo>;
    load3dGaussianSplat(params: AddGaussianSplatParams): Promise<LayerInfo>;
    loadTerrain(params: LoadTerrainParams): void;
    loadImageryService(params: LoadImageryServiceParams): Promise<LayerInfo>;
    loadCzml(params: LoadCzmlParams): Promise<LayerInfo>;
    loadKml(params: LoadKmlParams): Promise<LayerInfo>;
    private _activeTrajectories;
    playTrajectory(params: PlayTrajectoryParams): {
        entityId: string;
        stop: () => void;
    };
    stopTrajectory(id: string): void;
    pauseTrajectory(id: string): void;
    resumeTrajectory(id: string): void;
    toggleTrajectory(id: string): boolean;
    isTrajectoryPlaying(id: string): boolean;
    addLabel(params: AddLabelParams & {
        data?: Record<string, unknown>;
    }): number;
    /** 将标注附加到现有 GeoJsonDataSource 的实体上（圆点+文字同图层） */
    private _attachLabelsToDataSource;
    addMarker(params: AddMarkerParams): Cesium.Entity;
    addPolyline(params: AddPolylineParams): Cesium.Entity;
    addPolygon(params: AddPolygonParams): Cesium.Entity;
    addModel(params: AddModelParams): Cesium.Entity;
    updateEntity(params: UpdateEntityParams): boolean;
    removeEntity(entityId: string): boolean;
    getEntityProperties(params: GetEntityPropertiesParams): EntityPropertiesResult;
    screenshot(): Promise<ScreenshotResult>;
    highlight(params: HighlightParams): void;
    measure(params: MeasureParams): MeasureResult;
    lookAtTransform(params: LookAtTransformParams): void;
    startOrbit(params: StartOrbitParams): void;
    stopOrbit(): void;
    setCameraOptions(params: SetCameraOptionsParams): void;
    private _registerEntityLayer;
    addBillboard(params: AddBillboardParams): Cesium.Entity;
    addBox(params: AddBoxParams): Cesium.Entity;
    addCorridor(params: AddCorridorParams): Cesium.Entity;
    addCylinder(params: AddCylinderParams): Cesium.Entity;
    addEllipse(params: AddEllipseParams): Cesium.Entity;
    addRectangle(params: AddRectangleParams): Cesium.Entity;
    addWall(params: AddWallParams): Cesium.Entity;
    createAnimation(params: CreateAnimationParams): Cesium.Entity;
    controlAnimation(action: 'play' | 'pause'): void;
    removeAnimation(entityId: string): boolean;
    listAnimations(): AnimationInfo[];
    updateAnimationPath(params: UpdateAnimationPathParams): boolean;
    trackEntity(params: TrackEntityParams): void;
    controlClock(params: ControlClockParams): void;
    setGlobeLighting(params: SetGlobeLightingParams): void;
    setSceneOptions(params: SetSceneOptionsParams): void;
    setPostProcess(params: SetPostProcessParams): void;
    setEdgeDisplayMode(params: SetEdgeDisplayModeParams): SetEdgeDisplayModeResult;
    batchAddEntities(params: BatchAddEntitiesParams): {
        entityIds: string[];
        errors: string[];
    };
    queryEntities(params: QueryEntitiesParams): QueryEntityResult[];
    saveViewpoint(params: SaveViewpointParams): ViewState;
    loadViewpoint(params: LoadViewpointParams): ViewState | null;
    listViewpoints(): {
        name: string;
        state: ViewState;
    }[];
    exportScene(): ExportSceneResult;
    on(event: BridgeEventType, handler: BridgeEventHandler): () => void;
    private _emit;
}

export { type AddBillboardParams, type AddBoxParams, type AddCorridorParams, type AddCylinderParams, type AddEllipseParams, type AddGaussianSplatParams, type AddGeoJsonLayerParams, type AddGeoJsonPrimitiveParams, type AddHeatmapParams, type AddLabelParams, type AddMarkerParams, type AddModelParams, type AddPolygonParams, type AddPolylineParams, type AddRectangleParams, type AddWallParams, type AnimationInfo, type AnimationWaypoint, type BatchAddEntitiesParams, type BatchEntityDef, type BridgeCommand, type BridgeEvent, type BridgeEventHandler, type BridgeEventType, type BridgeResult, type CategoryStyle, CesiumBridge, type ChoroplethStyle, type ClearAllResult, type ColorInput, type ControlAnimationParams, type ControlClockParams, type CreateAnimationParams, type EntityPropertiesResult, type ExportSceneResult, type FlyToParams, type GetEntityPropertiesParams, type HighlightParams, type ImageryLayerStyle, type LayerInfo, LayerManager, type LayerStyle, type Load3dTilesParams, type LoadCzmlParams, type LoadImageryServiceParams, type LoadKmlParams, type LoadTerrainParams, type LoadViewpointParams, type LookAtTransformParams, type MaterialInput, type MaterialSpec, type MeasureParams, type MeasureResult, type OrientationInput, type PlayTrajectoryParams, type PositionDegrees, type PrimitiveLayerStyle, type QueryEntitiesParams, type QueryEntityResult, type RemoveAnimationParams, type RemoveEntityParams, type SaveViewpointParams, type ScreenshotResult, type SetBasemapParams, type SetCameraOptionsParams, type SetEdgeDisplayModeParams, type SetEdgeDisplayModeResult, type SetGlobeLightingParams, type SetPostProcessParams, type SetSceneOptionsParams, type SetViewParams, type StartOrbitParams, type TrackEntityParams, type UpdateAnimationPathParams, type UpdateEntityParams, type UpdateLayerStyleParams, type ViewState, type ZoomToExtentParams };
