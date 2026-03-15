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

见 [unified-bridge-design.md](unified-bridge-design.md)（997行完整技术方案）

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

## 当前状态

| 指标 | 值 |
|------|-----|
| Bridge execute() 命令 | 25 (目标 44) |
| Runtime MCP tools | 24 (目标 43) |
| IIFE 包体积 | 56.18 KB |
| 单元测试 | 62/62 通过 |
| 未提交修改 | 24 文件, +642/-588 行 |
