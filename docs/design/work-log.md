# cesium-mcp 工作记录

> 持续更新

---

## 参考仓库

| 仓库 | 本地路径 | 远程地址 |
|------|---------|---------|
| cesium-mcp (本项目) | `G:\code\cesium-mcp` | https://github.com/gaopengbin/cesium-mcp |
| cesium-ai-integrations (官方) | `G:\code\cesium-ai-integrations` | https://github.com/CesiumGS/cesium-ai-integrations |

## 社区互动

### Issue #19 (已提交, Open)
- **链接**: https://github.com/CesiumGS/cesium-ai-integrations/issues/19
- **标题**: Feature Request: Add 3D Tiles, Terrain, and Imagery Management Tools
- **提交时间**: 2026-03-15
- **内容**: 向官方提议新增 3D Tiles(4 tools) + Terrain(3 tools) + Imagery(4 tools) 共 11 个管理工具
- **关键提议**:
  - `tileset_load/remove/style/list` — 3D Tiles 管理
  - `terrain_set/get/configure` — 地形管理
  - `imagery_add/remove/list/configure` — 影像图层管理
- **附带**: 介绍了 cesium-mcp 项目，表示愿意贡献 PR
- **状态**: Open, 尚无官方回复

### PR (待提交)
- **目标**: 向官方 README 的 "Community MCP Servers: TBA" 处添加 cesium-mcp 链接
- **状态**: 尚未提交

### 论坛回复 (待发)
- **目标**: 官方 Announcement 帖介绍 cesium-mcp

## 官方仓库情报

### 核心人物
- **Margarita Kartaviciute** (@MKartaviciute): 主力开发者，CesiumGS DevRel 团队
- **Justin Dehorty** (@jdehorty): PR 审核者

### 仓库状态
- 22 个远程分支，零外部贡献者
- 所有版本 1.0.0，无 CHANGELOG，无 npm 发布配置
- CI: 3 个 job (cesium-js lint+build+test, geolocation lint+build, mcp-apps lint+build)

### 隐藏方向 (.vscode/mcp.json)
- `aec-architectural-design` (port 3002) — AEC 建筑设计
- `imodel-mesh-export` (port 3003) — Bentley iTwin/iModel 网格导出

### 活跃分支
- `maka/search-tool` — search_tools (动态工具发现，3级详情)
- `maka/discourse-mcp-for-cesium-community` — Discourse 论坛 MCP

### 我们有而官方没有的功能
- entity_update (官方只能 delete+recreate)
- LayerManager (分组/可见性)
- GeoJSON 加载 + 热力图
- 3D Tiles / Terrain / Imagery 管理
- 场景截图

---

## 2025-07 官方功能融合分析

### 背景

CesiumGS 官方发布了 [cesium-ai-integrations](https://github.com/CesiumGS/cesium-ai-integrations) 仓库，包含 4 个 MCP Server。我方 cesium-mcp-bridge 计划原生融合官方全部功能，成为功能超集。

### 官方仓库分析结果

官方共 3 个浏览器交互服务器 + 1 个纯 stdio 服务器：

| 服务器 | MCP Tools | 端口 | 核心能力 |
|--------|----------|------|---------|
| camera-server | 7 | 3002 | 飞行/视角/lookAt/环绕/控制器选项 |
| entity-server | 14 | 3003 | 12种实体创建 + 列表 + 删除 |
| animation-server | 8 | 3004 | 时间采样动画/时钟/光照/跟踪 |
| geolocation-server | 3 | stdio | 地理编码(无浏览器交互) |

**关键发现**：
- Entity Server 是 14 个独立 MCP tool（每种实体一个），非 3 命令分发 12 类型
- Animation 使用 `SampledPositionProperty` + `VelocityOrientationProperty` + `PathGraphics(PolylineGlowMaterialProperty)` 体系
- Camera 环绕用 `clock.onTick` + `camera.rotateRight(speed)`
- 颜色支持双格式: CSS hex + RGBA对象
- 材质支持判别联合类型: color/image/checkerboard/stripe/grid

### 融合方案

**策略**: 原生实现，不依赖官方服务器运行

| 类别 | 新增命令 | 数量 |
|------|---------|------|
| Camera | lookAtTransform, startOrbit, stopOrbit, setCameraOptions | 4 |
| Entity | addBillboard, addBox, addCorridor, addCylinder, addEllipse, addRectangle, addWall | 7 |
| Animation | createAnimation, controlAnimation, removeAnimation, listAnimations, updateAnimationPath, trackEntity, controlClock, setGlobeLighting | 8 |
| **合计** | | **19** |

融合后 bridge execute() 总命令数: 25 → 44

### 实施阶段

| 阶段 | 内容 | 命令数变化 |
|------|------|-----------|
| Phase 1 | Camera(4) + Entity(7) | 25 → 36 |
| Phase 2 | Animation(8) | 36 → 44 |
| Phase 3 | Runtime 19个MCP tool注册 + Toolsets 分组 | 44 tools |
| Phase 4 | 文档 + 发布 | npm publish |

### 工具数量管理

融合后 44+ tools 需要解决 LLM 工具选择困难。采用两层同步实现方案（Phase 3）：

- **第一层 - 静态 Toolsets 分组**: 环境变量 `CESIUM_TOOLSETS` 控制启用组，默认核心组 ~19 tools
- **第二层 - Dynamic Discovery**: `list_toolsets` + `enable_toolset` 两个元工具，LLM 按需激活更多组
- 两层共存互补: 用户不配置时默认核心组 + LLM 自主扩展，`CESIUM_TOOLSETS=all` 时全开
- 不采用 search_tools 方案（多一次交互，对小模型不友好）

### 详细设计

见 `unified-bridge-design.md`（997行完整技术方案）

---

## 2025-07 Bug 修复与优化

### removeEntity 图层同步 Bug

**问题**: `removeEntity` 删除了 Cesium 实体但未清理 LayerManager 的 `_layers` 和 `_cesiumRefs`，导致 `listLayers` 返回已删除的图层。

**修复**:
- `LayerManager` 新增 `untrackByEntity(entity)` 方法
- `Bridge.removeEntity()` 先获取实体引用 → 删除 → 调用 `untrackByEntity` → 触发 `layerRemoved` 事件

**文件**: bridge.ts, commands/layer.ts

### Bridge IIFE 浏览器构建

- 新增 `tsup.config.ts` IIFE 输出: `cesium-mcp-bridge.browser.global.js`
- 全局变量: `window.CesiumMcpBridge`
- 体积: 56.18 KB

### Minimal 页面重构

- `examples/minimal/index.html`: 1189行 → 666行 (-44%)
- 使用 bridge IIFE 替代内联实现
- UI 自动刷新通过 bridge 事件: `layerAdded` / `layerRemoved`

---

## 2025-07 Phase 1-3 实施完成

### Phase 1: Camera (4) + Entity Types (7)

**Camera 命令** (`commands/camera.ts`):
- `lookAtTransform` — HeadingPitchRange 锁定目标
- `startOrbit` — `clock.onTick` + `camera.rotateRight(speed)` 环绕
- `stopOrbit` — 停止环绕 (`_orbitHandler` 清理)
- `setCameraOptions` — 控制器选项 (enableRotate/Zoom/Tilt/Look)

**扩展实体类型** (`commands/entity-types.ts`):
- addBillboard, addBox, addCorridor, addCylinder, addEllipse, addRectangle, addWall
- 通用材质解析: `resolveMaterial()` 支持 color/image/checkerboard/stripe/grid
- 方向解析: `resolveOrientation()` 支持 HPR 角度

### Phase 2: Animation (8)

**动画命令** (`commands/animation.ts`):
- `createAnimation` — `SampledPositionProperty` + `VelocityOrientationProperty` + `PathGraphics`
- `controlAnimation` — play/pause/stop/speed
- `removeAnimation` / `listAnimations`
- `updateAnimationPath` — 运行时更新路径点
- `trackEntity` — `viewer.trackedEntity`
- `controlClock` — 时钟控制 (startTime/stopTime/multiplier/shouldAnimate)
- `setGlobeLighting` — 全球光照 (enableLighting/shadows/fog/skyAtmosphere)

**模型预设** (`MODEL_PRESETS`):
- cesium_man, cesium_air, ground_vehicle, cesium_drone

### Phase 3: Runtime 注册 + Toolsets

**Toolsets 系统** (10 组):
| 组 | 默认 | 工具数 |
|----|------|--------|
| core-view | 是 | 2 |
| core-layers | 是 | 6 |
| core-entities | 是 | 5 |
| drawing | 是 | 1 |
| analysis | 是 | 5 |
| camera | 否 | 4 |
| entity-ext | 否 | 7 |
| animation | 否 | 8 |
| scene | 否 | 3 |
| interaction | 否 | 2 |

**Dynamic Discovery**: `list_toolsets` + `enable_toolset` 两个元工具
**环境变量**: `CESIUM_TOOLSETS=all` 启用全部 43 tools

**技术要点**:
- `_registerTool` 使用 `(server.tool as typeof server.tool)` 解决类型推断丢失
- `sendToolListChanged()` 通知客户端工具列表变更

---

## 2025-07 Phase 4: 文档 + 发布

### 文档更新 (commits 8183e0b, b107db3, 7a05ca2)
- 更新全部 11 个文档文件，覆盖 43 工具、10 toolsets、动态发现

### npm 发布
- npm v1.139.4 (bridge, runtime, dev 三个包)
- npx VS Code 崩溃修复

### GitHub Release
- v1.139.4 Release 创建并发布

### PR #1
- 关闭 + badge 添加

### Glama 优化
- Dockerfile 创建
- Glama Release v1.139.4 发布
- Score: 7/10, 三个 A 评级 (Security, License, Quality)
- 21 tools 检测到

### Worker 部署
- Cloudflare Worker 部署到 mcp.gpb.cc
- 43 tools via Streamable HTTP MCP

---

## 2025-07 Smithery 质量评分改进 (29 → 54)

### 背景
Smithery Quality Score 从 32 降到 29，需要改进。

### 改进内容 (commits 5b5d5b6, 432076d, c616766)

1. **McpServer metadata**: 添加 title ("Cesium MCP Runtime"), description, websiteUrl, version 1.139.4
2. **Server instructions**: 添加 MCP 服务器使用引导文本
3. **嵌套 schema 描述**: 修复 positionDegreesSchema, colorSchema, materialSchema, updateEntity 内部字段缺失的 `.describe()`
4. **Tool annotations**: 45 个工具全部添加 annotations
   - `title`: 每个工具的人类可读标题
   - `readOnlyHint`: getView, listLayers, listAnimations, screenshot → true
   - `destructiveHint`: removeLayer, removeEntity, removeAnimation → true
   - `idempotentHint`: flyTo, setView, setBasemap, updateEntity 等 → true
   - `openWorldHint`: 全部 false
5. **Prompt**: 添加 `cesium-quickstart` prompt (Camera/Entity/Layer/Animation/Interaction/Discovery 快速参考)
6. **Worker 更新**: TOOL_ANNOTATIONS 映射表(45条), prompts/list, prompts/get handlers
7. **Config schema**: config-schema.json (toolsets 可选参数)
8. **Smithery 重新发布**: CLI build + publish (Release 2b141fe8)

### 最终状态
| 指标 | 值 |
|------|-----|
| Smithery Score | 54/100 |
| Glama Score | 7/10 |
| 总工具数 | 45 (43 bridge + 2 meta) |
| 测试 | 71/71 通过 |
| TS 错误 | 0 |
| npm 版本 | 1.139.4 |
| Git | main @ c616766 |
- bridge 新增 `_orbitHandler` 和 `_animations` Map 字段

### Phase 3 测试

- 单元测试: 71/71 通过 (Vitest v4.1.0)
- E2E 测试: 16+ 测试全部通过 (真实 Cesium 浏览器)
- TypeScript: 0 errors

### Git 提交
- `477396b` — feat: fuse CesiumGS official tools - camera, entity-types, animation + toolsets

---

## 2025-07 Phase 4 文档更新

### 更新文件 (11个)

**Root README**:
- README.md + README.zh-CN.md — "43 Available Tools", toolsets 表格, CesiumGS 关系说明

**Runtime 包**:
- packages/cesium-mcp-runtime/README.md + README.zh-CN.md — Toolsets Overview, Dynamic Discovery, 43 tools 分类

**Bridge 包**:
- packages/cesium-mcp-bridge/README.md + README.zh-CN.md — 43 commands (9 categories), 扩展类型导出

**VitePress 文档**:
- docs/api/runtime.md + docs/zh-CN/api/runtime.md — 43 tools + Toolsets + Dynamic Discovery
- docs/api/bridge.md + docs/zh-CN/api/bridge.md — 43 commands + Key Parameters

**工具元数据**:
- tools-meta.json — 新增 19 个 tool JSON Schema 定义

### Git 提交
- `8183e0b` — docs: update all documentation to reflect 43 tools, 10 toolsets, dynamic discovery
- `b107db3` — docs: add relationship note with CesiumGS official MCP servers

---

## 2025-07 仓库维护

### docs/design/ 排除
- 开发过程文档不展示到仓库
- `git rm --cached -r docs/design/` + `.gitignore` 添加 `docs/design/`
- 提交: `7a05ca2`

### PR #1 处理 (punkpeye: Glama badge)
- 内容: 添加 Glama MCP 目录 badge
- 决定: 自行添加 badge 到 badges 区域, 关闭 PR 并评论致谢
- 提交: `abf00cd`

### Glama 评分优化
- 添加 `glama.json` (maintainers: gaopengbin)
- 添加 `SECURITY.md` (漏洞报告流程)
- 提交: `9dba60e`

### GitHub Release
- 创建 v1.139.2 release (43 Tools, 10 Toolsets, Dynamic Discovery)
- 含完整 release notes

---

## 2025-07 社区推广与注册

### awesome-mcp-servers

**PR #3227 (已合并)**:
- 初始提交 cesium-mcp 到 punkpeye/awesome-mcp-servers
- 列入 Location Services 分类
- 评论 Discord 用户名 "laogao" (comment ID: 4064710724)

**PR #3292 (Open, 等待审核)**:
- 更新 cesium-mcp 条目: 19 → 43 tools
- 添加 ☁️ 云端 badge (Streamable HTTP at mcp.gpb.cc)
- 更新描述: 新增实体管理、轨迹动画等
- 分支: `update-cesium-mcp-43-tools`
- commit: `325b0f3f`
- mergeable_state: clean
- Bot 标签 `duplicate` / `missing-glama` 为误报，已发澄清评论

### Glama Connector

- 注册页面: https://glama.ai/mcp/connectors/cc.gpb.mcp/cesium-mcp
- 状态: 已审核通过（即时批准）
- 所有权验证: `/.well-known/glama.json` endpoint 部署到 Worker

### Worker 更新 (commit ade93b0)

- 新增 `/.well-known/glama.json` 路由 (Glama Connector 所有权验证)

### CesiumGS 官方 README PR

**PR #21 (Open, 等待审核)**:
- 仓库: CesiumGS/cesium-ai-integrations
- 内容: 将 "Community MCP Servers: TBA" 替换为 cesium-mcp 链接
- 分支: `add-community-mcp-server`
- commit: `17f68c36`
- 链接: https://github.com/CesiumGS/cesium-ai-integrations/pull/21
- 使用 `env.GLAMA_EMAIL` 环境变量, fallback `gaopengbin@gmail.com`
- 部署版本: `1d548909-c332-4be0-aa1d-ccf6b0225f0a`
- 验证: `https://mcp.gpb.cc/.well-known/glama.json` 返回正确 schema

---

## 2025-07 Geocode 工具融合

### 官方功能审计

对比 CesiumGS/cesium-ai-integrations 官方仓库（33 个工具）：
- 29 个浏览器交互工具已全部融合
- 剩余 4 个：geolocation（geocode/search/route）+ codegen（1）
- 评估后决定融合 geocode（地址→坐标，与 flyTo 形成完整管线）

### geocode 工具实现

- 新增 `geolocation` 工具集（第 11 个），包含 `geocode` 工具（第 44 个）
- 使用 OpenStreetMap Nominatim 免费服务，无需 API Key
- 1.1 秒速率限制（Nominatim 使用政策）
- HTTP 代理支持：`HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` 环境变量
  - 使用 Node.js 内置 `undici.ProxyAgent` 作为 fetch dispatcher
  - 动态导入，graceful fallback（undici 不可用时跳过代理）
- 自定义 User-Agent：`OSM_USER_AGENT` 环境变量
- tsup 配置：`external: ['undici']` 避免 941KB 打包膨胀
- 参数：`address`（必填）、`countryCode`（可选 2 位 ISO）
- 返回：`{ success, longitude, latitude, displayName, boundingBox }`

### 文档更新

- 21 个文件修改，43→44 tools、10→11 toolsets
- runtime API 文档（EN + ZH）添加 geocode 工具说明和 `OSM_USER_AGENT` 环境变量
- tools-meta.json 添加 geocode schema
- README、architecture、FAQ、server.json 等全量更新

### 提交

- `c9fc6f4` — feat: add geocode tool with Nominatim/OSM integration and proxy support

---

---

## 2025-07 文档第三轮改进 (commit a6c78eb)

### API 侧边栏细化
- VitePress config.mts 中 API 侧边栏从 3 个平铺项 → 28 个可折叠子项
- 每个工具类别一个子组: bridge(11), runtime(14), dev(3)
- 全部使用锚点链接 (`#section-slug`) 定位到页面内具体段落
- EN + ZH-CN 双语同步

### Runtime API 参数表
- 全部 43 工具添加 h4 级标题 + 详细参数表 (5列: 参数/类型/必填/默认/描述)
- 参数信息来源于 zod schema 定义 (`packages/cesium-mcp-runtime/src/index.ts`)
- 分 10 个类别: View(4), Entity(7), Layer(6), Camera(4), Entity Types(7), Animation(8), 3D Data(3), Interaction(2), Other(2)
- 新增 Common Types 段: `ColorInput`, `MaterialInput`, `PositionDegrees` TypeScript 类型定义
- EN + ZH-CN 双语, 14 files, +1995/-205 lines

### 架构图 SVG 化
- 4 个页面的架构图全部从 ASCII/emoji 替换为 HTML/CSS + SVG 矢量图标
  - `docs/index.md` (EN 首页)
  - `docs/zh-CN/index.md` (ZH-CN 首页)
  - `docs/guide/architecture.md` (EN 架构概览)
  - `docs/zh-CN/guide/architecture.md` (ZH-CN 架构概览)
- 图标: SVG 矢量 (机器人/终端/桥梁/地球), 无 emoji
- 箭头: SVG marker 矢量箭头 + 协议标签
- 布局: flex 弹性, `min-width: 0; max-width: 180px`, 无滚动条溢出
- 响应式: 640px 以下竖向排列

### 新增页面
- `docs/guide/faq.md` + `docs/zh-CN/guide/faq.md` — 常见问题
- `docs/zh-CN/examples/index.md` — 中文示例页

### Git
- commit: `a6c78eb` — docs: refine API reference with detailed params, update architecture diagrams
- 已推送: `ade93b0..a6c78eb main -> main`

---

## 2026-03 v1.139.5 发布

### Geocode 工具增强
- 新增 `geocode` 地理编码工具 (Nominatim/OSM, 无需 API Key)
- 支持 `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` 代理配置
- 新增 `geolocation` 工具集 (1 tool)

### GitHub Release v1.139.5
- 发布: https://github.com/gaopengbin/cesium-mcp/releases/tag/v1.139.5
- npm 三包同步发布

---

## 2026-03 P0 功能四件套 (44 → 49 tools)

### 需求来源
产品分析 Top 10 功能建议中 P0 级别四个方向:
1. **批量实体操作** — 减少多次调用开销
2. **实体查询** — 支持场景中已有实体的搜索/筛选
3. **视点书签** — 保存/恢复/列出相机位置
4. **GeoJSON URL 加载** — 从 URL 加载 GeoJSON (浏览器端 fetch)

### 新增工具 (5 个)

| 工具 | 工具集 | 说明 |
|------|--------|------|
| `batchAddEntities` | entity | 批量添加多种类型实体，返回 `{entityIds, errors}` |
| `queryEntities` | entity | 按名称(模糊)/类型/bbox 搜索场景实体 |
| `saveViewpoint` | view | 保存当前相机状态为命名书签 |
| `loadViewpoint` | view | 恢复已保存的视点书签 (支持 duration) |
| `listViewpoints` | view | 列出所有视点书签 |

### 增强工具 (1 个)
- `addGeoJsonLayer`: `data` 参数改为可选，新增 `url` 参数 (浏览器端 fetch)

### 工具集变化
| 工具集 | 变化 | 新数量 |
|--------|------|--------|
| view | +3 (viewpoint 书签三件套) | 4 → 7 |
| entity | +2 (batch + query) | 7 → 9 |
| 默认工具总数 | +5 | ~19 → ~24 |
| **总工具数** | **+5** | **44 → 49** |

### 修改文件 (28 个)

**Bridge 包** (6 文件):
- `types.ts` — 6 新接口 + AddGeoJsonLayerParams.data 可选 + url 字段
- `commands/entity.ts` — `batchAddEntities()` + `queryEntities()`
- `commands/view.ts` — `saveViewpoint()` + `loadViewpoint()` + `listViewpoints()` + `_viewpoints` Map
- `commands/layer.ts` — URL 加载支持 + `detectGeometryTypeFromDataSource()`
- `bridge.ts` — 5 新 switch case + 5 新方法 + 导入
- `index.ts` — 7 新类型导出

**Runtime 包** (1 文件):
- `index.ts` — TOOLSETS 扩展, TOOLSET_DESCRIPTIONS 更新, addGeoJsonLayer schema 更新, 5 新 `_registerTool()` 调用

**文档** (20+ 文件):
- 全量计数更新 (44→49, view 4→7, entity 7→9, ~19→~24)
- runtime API: 5 新工具详细参数表 + addGeoJsonLayer url 参数
- bridge API: 5 新命令条目
- README 工具集表格更新
- tools-meta.json: 5 新工具 JSON Schema

**测试** (2 文件):
- `entity.test.ts` — +13 测试 (batchAddEntities 6 + queryEntities 7), `vi.mock('cesium')` 完整 mock
- `view.test.ts` — +7 测试 (viewpoint bookmarks 完整覆盖)

### 验证
- TypeScript: bridge + runtime 零错误
- 测试: 91/91 通过 (71 → 91)
- 构建: bridge ESM 77KB / CJS 81KB / IIFE 84KB, runtime 59KB

### Git
- `ebffb01` — feat: add batch entities, entity query, viewpoint bookmarks, GeoJSON URL loading (49 tools)
- `4457c04` — test: add functional tests for batchAddEntities, queryEntities, viewpoint bookmarks (91 tests)
- 已推送至 origin/main

---

## 2026-03 v1.139.6 发布

### 功能验证 (E2E)
- 启动 minimal 测试页面 + 本地 MCP 服务器
- 通过 HTTP API (`POST /api/command`) 绕过 Copilot 工具缓存限制，直接向浏览器推送命令
- `batchAddEntities`: 5 个北京地标批量创建 ✅
- `saveViewpoint`/`loadViewpoint`: 保存"北京鸟瞰"→ 飞到上海 → 加载书签恢复视角 ✅
- `queryEntities`/`listViewpoints`: 命令推送成功 ✅
- `addMarker` + `flyTo`: 原有功能正常 ✅

### 版本号更新 (20 个文件)
- 3 个 `package.json` (bridge/dev/runtime): 1.139.5 → 1.139.6
- 根 `package.json`: 1.139.0 → 1.139.6 (补齐)
- 2 个 `server.json` (runtime: 1.139.4→1.139.6, dev: 1.139.2→1.139.6)
- `Dockerfile`: cesium-mcp-runtime@1.139.6
- `runtime/src/index.ts` McpServer version: 1.139.6
- `worker/src/index.js`: runtime + dev 版本→1.139.6
- `docs/.vitepress/config.mts`: v1.139.6
- `tools-meta.json`: 0.1.0→1.139.6
- `worker/server-card.json` + `worker/dev-server-card.json`
- Smithery manifest + module.js

### CHANGELOG 更新
- runtime: feat: P0 feature pack — 5 new tools, enhanced addGeoJsonLayer, 49 tools
- bridge: feat: P0 feature pack — batchAddEntities, queryEntities, viewpoint bookmarks, GeoJSON URL
- dev: chore: version bump

### 发布
- npm: 3 包发布 (cesium-mcp-bridge/dev/runtime@1.139.6)
- GitHub Release: [v1.139.6](https://github.com/gaopengbin/cesium-mcp/releases/tag/v1.139.6)
- Git: `15a6d2a` — release: v1.139.6

---

## 当前状态

| 指标 | 值 |
|------|-----|
| Bridge execute() 命令 | 49 |
| Runtime MCP tools | 49 + 2 meta |
| Toolset 分组 | 11 |
| IIFE 包体积 | 83.71 KB |
| 单元测试 | 91/91 通过 |
| TypeScript 错误 | 0 |
| Git 最新提交 | `15a6d2a` on main |
| npm 版本 | v1.139.6 |
| GitHub Release | v1.139.6 |
