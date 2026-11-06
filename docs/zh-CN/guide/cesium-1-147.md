# CesiumJS 1.147 适配

开发分支已升级至 **CesiumJS ~1.147.0**，固定 engine 26.5.0、widgets 16.3.1、core/gltf 0.1.1，要求 **Node >=22.17.0**。本项目 npm 包版本与 CesiumJS 版本独立。新版本收紧 peer dependency，集成方需要一起升级 Viewer，不继续宣称兼容旧渲染器。

通过 `enable_toolset` 启用 `bim` 与 `geometry` 工具组，Bridge、MCP 和 WebMCP 使用同一契约。

| 官方新增能力 | 接入方式 |
| --- | --- |
| 构件查询、工程量统计 | 保留有界 REST 请求，并与原生 IonAssetElementService 做结果一致性验证 |
| 模型树 | getBimTree 获取根或子节点，getBimElementParents 获取构件层级路径 |
| 服务端精确吸附 | snapBimElement 调用原生 IonSnapService，无损转换十进制 ID 为十六进制 |
| 本地几何吸附、精确测量 | snapToGeometry、measureSnappedDistance；返回真实命中，未命中不伪造近似结果 |
| 矢量混合模式、瓦片缓存、环境光、点云背面剔除 | setTilesetOptions，GeoJSON 缓冲集合还支持单独调整 blendOption |
| pickObject | addGeoJsonPrimitive 的 pickMetadata 在首次渲染前设置，点击后通过 getSelectedTileFeature 读取 |
| setPositions 批量更新 | updateVectorCollection 更新本地受管 GeoJSON 点、线、面缓冲，保持顶点数量及拓扑 |
| 多边形裁剪和孔洞 | setClippingPolygons 支持地球或受管瓦片图层，支持反向裁剪、孔洞及清除 |
| 发光强度扩展 | 新引擎加载 KHR_materials_emissive_strength，已做实际像素亮度对比 |
| 缓存抖动、光照、点云、GLSL 修复 | 采用官方固定引擎版本；零缓存预算下可见瓦片不反复卸载已单独检查 |
| core/gltf 拆包 | 更新依赖与锁文件，继续从公共 cesium 入口导入，不引用私有 GltfPipeline 路径 |

批量编辑仅针对我们持有的 GeoJSON 缓冲图层，不修改服务器流式瓦片的数据。坐标使用经纬度和可选高度；不能通过 setPositions 增删顶点或改变环结构。范围或顶点数量不符时，坐标和混合模式都保持原样。

pickObject 首次渲染后由 Cesium 锁定，因此点选元数据在创建图层时设置。屏幕吸附使用相对画布的 CSS 像素；测量结果是米制三维直线距离。GPU 吸附需要对应 WebGL 能力。服务端精确吸附需要有权限的地理定位 BIM 数据库；额外 modelMatrix/heightOffset 会使精度基准失效，工具会拒绝该情况。

## 本地验收范围

`npm run test:bim` 使用明确标注的本地模型，实际经过 MCP HTTP/stdio、WebMCP、Cesium 渲染与原生 SDK，验证模型树、吸附测量、批量坐标、点选属性、带孔裁剪、瓦片重载高亮、零缓存预算以及发光强度像素对比。

河流另用公有领域 Natural Earth 数据回归 MVT、矢量 3D Tiles、贴附、属性拾取、样式修改和 MCP Apps。贴附拾取兼容层已针对 1.147 重新验证，仍只处理当前显示瓦片，并保留 200,000 顶点预算。

混合点、面的点选测试在椭球上运行。MVT 点保留原生高程，并非贴附点；将高程 0 的点放到线面贴附测试使用的 100 km 人工地形下，会按实际深度被遮挡，不能把这一测试标志组合当作点贴地测试。

光照、点云、GLSL 修复来自官方新引擎，并非每个上游缺陷都有独立复现场景。云端精确吸附目前验证的是原生 SDK 与本地接口契约，仍不能代替授权真实模型联测。

ion 的 **Clipping Assist 云端资产生成**及版本差异任务属于独立云服务，不等同于本地裁剪；本次工具不会创建云端资产。尚未获取可访问的真实 BIM 资产 ID，资产列表失败不代表空账号。
