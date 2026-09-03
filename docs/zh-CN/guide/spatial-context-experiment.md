# 空间上下文实验

Spatial Context 路线让 AI Agent 在决定操作前，先获得有依据的 Cesium 场景描述。它暂时不做宽泛的“世界模型”，首个垂直切片只负责标准化受管图层与实体、回答边界明确的空间问题，并说明每个结论的证据来源。

> 这是实验 API，不会进入稳定的 61 个工具，也不会被 `toolsets: 'all'` 自动启用。

## 运行真实评测场景

仓库内提供了一个不依赖在线底图的城市内涝实验页，包含学校、医院、避难点、
消防站、泵站、水位监测站、桥梁、社区、河道、两条疏散路线和洪水预测范围。
页面通过资源句柄加载 12 个真实 GeoJSON 要素、注册 6 个 perception 工具和
1 个独立观察相机工具，
并在浏览器中自动执行 9 项断言：

```bash
npm run dev -w examples/spatial-context-experiment
```

打开 <http://127.0.0.1:4175/>。点击“模拟洪水范围扩大”，设施位置保持固定，
预测范围发生变化，实时 `within` 结果会从 `false` 变为 `true`。页面还会检查
证据质量、当前视野上下文，以及 `resourceId -> layerId -> objectId` 数据血缘。

面向用户的页面现在只保留全屏地图和一个对话框。原来的评测仪表盘仍作为自动化
测试挂点存在，但不会出现在正常界面。对话会真实请求托管模型，并把模型选择的
地图工具逐条显示出来。250 ms 射线安全环发现障碍后立即提交绕行，飞行不会等待
视觉推理；另一个事件驱动慢环会在首次接触、绕行复核和退出复核时最多拍摄三张
受限 JPEG。同一次飞行只维护一个持续信念，revision 会随观察递增，短时 occupied
证据会过期为 stale。只有首次“可见对象 + 匹配射线”正向融合才调用规划模型；后续
复核只更新信念。视觉模型输出不合契约时安全降级为 unknown，不会形成空间结论。

切换到“实时 GIS”会运行一条独立的非确定性集成链路。页面读取
[USGS 过去 24 小时 M2.5+ GeoJSON Feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)，
并通过 WMS 加载 [NASA GIBS](https://earthdata.nasa.gov/gibs) Blue Marble 影像，
不需要 API Key。浏览器会执行 8 项实时断言，验证两个服务图层已经进入 Viewer、
USGS 事件完成标准化与索引、最强事件具有稳定 `objectId`、震源深度保留为独立的
`depthKm` 而不会误当成 Cesium 高程，并检查视野上下文、数据血缘与 Feed 新鲜度。
远程请求会在切换场景前完成，因此网络或服务失败时仍保留确定性场景。

切换到“AI 闭环飞行”会运行第三条集成链路。页面先沿喜马拉雅走廊采样
ArcGIS World Elevation，建立满足地形净空的基准路线；实际播放时，5 条有限距离
射线通过 `Globe.pick` 探测当前已经加载的地形，并通过
`IntersectionTests.raySphere` 探测临时禁飞区以及已加载 3D Tiles/Model 的包围体。
禁飞区会在起飞后才注入，因此飞行器必须在进入 15 km 探测范围后发现它，比较
左右净空、执行局部绕行，再回到原路线。绿色线是原计划，蓝色线是闭环实际轨迹。

这里演示的是有边界的世界感知，不是“全知”。对话会并列显示快速
`SENSE -> ACT` 安全路径和慢速 `SENSE -> VISION -> BELIEF -> PLAN/VERIFY` 路径。
原始像素只在有界事件循环中按严格大小限制提交，信念与规划阶段只保留 SHA-256
证据引用。视觉判定 clear、对象缺失、场景
未完全加载或射线没有命中同一对象时，走廊都保持 unknown，不会被提升为安全空间。
系统不会声称发现尚未加载的几何，也不会把任意像素解释当成世界真值。

慢速走廊构建现在通过通用 `WorldTaskRuntime` 调度。任务由稳定 key 与规划 revision
共同标识：同一 revision 的首次探测和后续复核共享一份进行中或已完成的结果，新
revision 会取消已过期任务，阻止旧结果提交。喜马拉雅适配器串行构建左右候选，
并在 CPU 侧走廊构建过程中主动让出主线程；固定 Level 12 的 ArcGIS 真实 DEM
切片获取、LERC 解码与高程插值则通过通用 `WorldWorkerExecutor` 在独立 Worker
中执行。坐标与高程使用可转移 TypedArray 传递，避免大数组复制。快速飞行与射线
安全环不会等待这项慢任务。

这套任务生命周期、revision 失效、协作式时间预算和 Worker 请求关联属于通用世界
感知运行时；DEM 层级、ArcGIS 切片协议、飞行走廊、禁飞区和证书规则仍属于飞行
适配器。revision 取消会终止正在运行的 Worker，防止不支持协作取消的第三方解码器
继续发布过期结果；下次任务再惰性创建 Worker。

独立 Observer 使用 Cesium 按需渲染模式，只在事件驱动的视觉采集需要新证据时
渲染；CPU 走廊构建以小批次检查协作式帧预算，UI 进度则固定为 10 Hz 发布，而不是
每个渲染帧都更新。这样快速相机和本地射线安全环不会等待隐藏渲染、视觉推理或诊断
DOM 更新。

同一套两阶段场景还提供机器可读评测：

```bash
npm run eval:spatial-context
```

命令会写出 `artifacts/spatial-context-eval.json`。只要初始或扩大后的任一阶段
违反预期契约，命令就会失败；CI 也会运行相同评测。

## 通过 WebMCP 体验

单包 Viewer API 可以显式启用实验性的 `perception` 与 `observer` 工具集：

```ts
import { registerCesiumViewerWebMcp } from 'cesium-mcp-webmcp'

const registration = await registerCesiumViewerWebMcp(viewer, {
  experimentalToolsets: ['perception', 'observer'],
})
```

它会增加 6 个只读工具：

- `observeScene`：一次返回结构化场景事实、加载状态、快照新鲜度和可选独立视角图像。
- `describeScene`：汇总场景，并可返回标准化空间对象。
- `querySpatialObjects`：按语义、来源、图层、范围、距离或属性查询对象。
- `getObjectContext`：查看单个对象及其邻近对象。
- `querySpatialRelation`：计算 `distance`、`near`、`intersects`、`within`、`contains` 或 `overlaps`。
- `getViewContext`：描述当前相机视域及与视域相交的受管对象。

普通 WebMCP 注册方式不受影响。只有传入 `experimentalToolsets` 时才会暴露这些工具。

### 创建一次有依据的统一观察

`observeScene` 是建议 Agent 优先使用的入口。它把已有空间快照和独立 Observer
组合成一次调用，避免 Agent 自己协调两个彼此分离的工具：

```ts
await observeScene({
  scope: 'view',
  includeObjects: true,
  imageMode: 'auto',
})
```

它始终优先返回结构化事实。`imageMode: 'auto'` 只在指定了明确目标，或局部视野
缺少足够的结构化对象身份时拍摄 PNG；`always` 用于强制视觉检查，`never` 用于
低成本结构化观察。每次结果还会明确返回：

- 场景 `readiness`：`ready`、`partial`、`loading` 或 `unknown`，并列出尚未就绪的
  DataSource、地球瓦片与受管 3D Tiles；
- 稳定的 `snapshotRevision`，以及拍摄视觉证据期间场景是否发生变化；
- 视觉证据的 `captured`、`skipped` 或 `unavailable` 状态；
- 整体证据质量：加载不完整时降为 `unknown`，观察过程中发生变化时降为
  `approximate`。

因此视觉拍摄超时不会丢弃已经获取的结构化事实，场景尚未加载完成时也不会被
误报成一次完整观察。

### 拍下 AI 看到的画面

`captureObserverView` 会延迟创建一个隐藏的 Cesium Viewer。它拥有独立相机与
Canvas，不会移动用户正在操作的地图视角。工具会把当前空间快照中的受管点、线、
面镜像到 Observer Viewer，并在可用时复用 Bridge 管理的影像 Provider。
拍摄目标既可以是经纬度，也可以直接使用感知工具返回的
稳定空间 `objectId`：

```ts
await captureObserverView({
  targetObjectId: 'entity:urban-flood-response:school_1',
  preset: 'detail',
})
```

工具提供 `overview`、`detail` 和 `eye-level` 三种起始视角；显式传入的
`range`、`heading`、`pitch` 或 `targetHeight` 会覆盖预设值。返回内容包括：

- 供 WebMCP Host 使用的 PNG Data URL；
- MCP Runtime 原生的 `image/png` 内容块和简短文本证据，文本上下文不会重复
  整段 base64；
- 观察相机、目标点和拍摄时间元数据；
- 观察视域范围与落入视域的空间对象 ID；
- 拍摄前后核验得到的 `userCameraUnchanged: true`。

实验页中的“执行一次 AI 现场观察”按钮会通过学校的空间对象 ID 和 `detail` 预设直接
展示这份图片证据。实时 GIS 模式则会定位 USGS 最强事件，使用 650 km 区域视角，
等待 NASA WMS 瓦片就绪，并继续核验 `userCameraUnchanged: true`。结果仍明确标记为
`quality: 'derived'`：目前还没有同步 3D Tiles、地形、后处理与像素级应用样式。

## 通过 MCP Runtime 体验

Runtime 的普通模式和 `all` 模式都不会自动包含 perception 与 observer，需要显式启用：

```powershell
$env:CESIUM_TOOLSETS = 'view,entity,layer,interaction,perception,observer'
npx cesium-mcp-runtime
```

Streamable HTTP 可以按端点选择：

```text
http://localhost:9200/mcp?toolsets=perception,observer
```

## 带证据的空间结论

每个空间关系结果都有两个不能忽略的字段：

| 字段 | 含义 |
| --- | --- |
| `quality` | `exact`（精确）、`derived`（推导）、`approximate`（近似）或 `unknown`（未知） |
| `basis` | 实际计算依据，例如 `point-in-polygon`、`geodesic-point` 或 `bounding-box` |

例如，使用真实实体坐标进行点面包含判断时结果为 `exact`；首版的道路与多边形相交暂时使用包围盒，因此会明确标记为 `approximate`。

## 架构

```text
Cesium Viewer
  -> cesium-mcp-bridge 场景适配器
  -> cesium-mcp-spatial 对象模型与索引
  -> 带加载状态与快照版本的统一 observeScene 契约
  -> 可选的延迟独立 Observer Viewer 与 PNG 证据
  -> 本地候选 ID 的严格视觉落地
  -> 信念融合：可见对象 + 匹配的前向 Cesium 射线
  -> 带短时证据有效期的持续信念 revision
  -> revision 绑定的通用后台任务与协作式时间预算
  -> 立即本地安全执行 + 慢速规划/复核
  -> WebMCP 或 MCP Runtime（显式启用）
```

对象模型和契约本身与协议无关。WebMCP 与 MCP Runtime 使用相同的 6 个
perception 契约、1 个 observer 契约和稳定 Bridge action。

## 当前覆盖与边界

首版已支持：

- Bridge 管理的 Entity，以及 GeoJSON/CZML DataSource 中的实体；
- Point、LineString、Polygon 和由 Rectangle 转换的几何；
- 可用时保留 `resourceId -> layerId -> objectId` 来源链；
- 从 `semanticType`、`category`、`class` 或 `kind` 属性提取语义类型；
- 基于快照的查询和带证据的空间关系；
- 场景加载状态、稳定快照版本与观察期间变化检测；
- 优先结构化事实、可选视觉证据的一次性统一观察结果；
- 可重复运行的应急响应评测场景。
- NASA GIBS WMS 与 USGS GeoJSON 的实时浏览器集成及安全降级；
- 独立 Observer Viewer 对受管影像 Provider 的复用。
- 独立视角、5 条有限射线、立即本地安全执行、最多三次视觉信念 revision、保守
  多传感器融合与实际轨迹分离展示组成的双速闭环飞行实验。

当前不声称支持：

- 超出候选边界框的像素级精确可见性与遮挡判断；
- 尚未加载的 3D Tiles 要素发现；
- 精确的线面与面面拓扑；
- 任意外部场景变更下的永久对象身份；
- 跨越 180 度经线的视域范围。
- 对任意像素的语义理解，以及对已加载场景和有限探测范围之外障碍物的发现。

## 后续阶段

1. ✅ 已通过两阶段评测稳定对象 ID、来源链和 6 个感知契约。
2. ✅ 增加独立 Observer Viewer，输出不影响用户相机的 PNG 证据。
3. ✅ 在统一观察闭环中加入加载状态、稳定快照版本与变化检测；下一步实现增量失效，并测量大场景下的刷新成本。
4. ✅ 已在观察视图复用受管影像 Provider；下一步镜像 3D Tiles 与地形。
5. ✅ 增加由立即射线安全、持续多观察信念、独立视角、Cesium 公共射线相交、
   有界视觉规划/复核和可见执行证据组成的双速 Grounded Flight Loop。
6. ✅ 增加通用 `WorldTaskRuntime` 与可插拔 `WorldWorkerExecutor`，支持同 revision
   去重、更新失效、调用方取消、协作式时间预算，以及不可切分任务的独立 Worker
   执行；喜马拉雅适配器已将 ArcGIS LERC 地形解码接入该执行器。
7. 只有真实场景需要跨场景记忆时，再考虑持久化 World Graph。
