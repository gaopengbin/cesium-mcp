# Embodied World Lab

一个隔离的 CesiumJS 具身控制实验。它把本地快速安全控制、异步结构化模型规划和确定性风险 fixture 放进同一个可执行山地场景，但不把三者混称为“模型看见了真实危险”。

## 运行

需要 Node.js 22 或更高版本。从仓库根目录执行：

```bash
cd experiments/embodied-world-lab
npm ci
npm run dev
```

打开 <http://127.0.0.1:4185/>。Vite 固定监听 `127.0.0.1:4185`，并启用 `strictPort`；端口被占用时会直接失败，不会自动换端口。

真实 ArcGIS 高程、Esri 影像和托管规划端点需要网络。ArcGIS 高程失败时，场景会明确降级为椭球地面和零高程场；模型请求失败或超时时，本地 fallback 继续工作。Esri 影像只用于画面展示，不是规划器证据。

## Workspace 隔离与验证

该实验不在根 `package.json` 的 `workspaces` 列表中，并保留自己的 `package-lock.json`。因此根目录的 `npm run build` 和 `npm run typecheck` 不会构建或检查它。依赖和锁文件是隔离的，但实验会直接导入 `packages/cesium-mcp-spatial/src`，所以它不是完全独立的仓库或可发布包。

在实验目录验证类型和构建：

```bash
npm run typecheck
npm run build
```

根 Vitest 配置包含实验单元测试。回到仓库根目录执行：

```bash
cd ../..
npx vitest run experiments/embodied-world-lab/src
```

这些测试使用 fake controller、合成 snapshot 和确定性输入；它们不会启动真实 Cesium 浏览器场景、访问托管模型，也不能证明端到端必然到达。

## 执行链路

1. 启动时请求 ArcGIS World Elevation，并把 13 x 13 个、间距 35 米的高程样本缓存为局部网格；后续高程与坡度候选来自该网格的双线性插值。
2. `cesium-player-controller` 与 Rapier 驱动未修改的 Fox 角色、静态地形碰撞和角色坐标系射线。
3. Cesium `preUpdate` 每帧更新控制器；感知/安全处理最多每 50 ms 执行一次，即“约 20 Hz”是上限描述，不是固定调度保证。
4. 新世界版本或短时计划到期时，先启用本地 provisional 计划，再异步请求托管规划器；本地安全状态机可以覆盖模型和 fallback 意图。
5. 配置风险进入有限探测窗口后，旧计划按世界 revision 失效，本地控制执行制动、原地扫描、稳定验证和绕行提交。
6. 风险出现时切换的是同一个应用相机的高位展示视角，不是 flight 实验中的独立 Observer Viewer。到达后记录实际轨迹距配置风险边界的最小净距。

## 真实证据与 fixture 边界

这个场景同时包含运行时证据、远程数据和确定性 fixture：

- **运行时证据**：角色位姿、ENU 速度、grounding 状态、Rapier 角色坐标系扇形射线命中，以及实际执行轨迹。
- **有界远程高程**：ArcGIS 只在启动阶段形成 169 点局部网格。控制循环中的地形高程和候选坡度是网格插值结果，不是每次 tick 都重新向 ArcGIS 取样。
- **展示数据**：Esri World Imagery 只影响底图外观，不进入 `EmbodiedWorldSnapshot` 或安全判定。
- **确定性 fixture**：起点、目标点、落石中心、22 米半径和 105 米传感范围都写在 `scenario.ts`。落石“发现”由当前位置、朝向、距离和该已知配置做几何判断；不是 Rapier 射线、Cesium 像素或视觉模型独立发现了未知对象。
- **融合边界**：风险可见后，候选净距会取解析式风险边界净距与 Rapier actor-ray 净距的更保守值。Rapier 可以约束通行方向，但不提供落石 fixture 的语义发现。
- **结果指标**：目标距离、风险边界净距和到达状态都相对于上述配置计算。它们能证明该次执行发生了什么，不能把 fixture 结果外推为任意场景能力。

## 模型调用、provisional 与 fallback

托管请求发往 `https://cesium-browser-agent.pages.dev/api/chat`。实验不固定具体模型名；实际名称只在服务通过响应头或响应体返回时展示。

- 发送内容只有有界的结构化 `EmbodiedWorldSnapshot` 和 `commit_motion_intent` 工具 schema。场景截图和对话框文本不会发送给模型。
- 对话框支持本地证据命令：`查看场景`、`查找角色`、`查找观察点`、`记录现场`、`比较变化`。明确的开始/前往命令触发固定导航；不支持的输入返回说明，不会意外启动角色。仍不是开放式模型对话。
- 证据命令按需读取当前角色位姿、已授权目标及已发现的测试障碍，写入共享 `WorldMemory`，显示来源与证据编号。查询不调用模型，也不增加 20 Hz 循环工作；隐藏障碍不会被查询入口提前暴露。
- `记录现场` 建立会话内检查点，`比较变化` 对比后续观测属性。新记录到的对象不等于新生成，未再次看到不等于删除。内存只在当前页面会话中保留，刷新后清空；暂未做长期持久化或自动跨视角对象关联。
- 每次托管请求发出前，本地 fallback 会先作为 16 秒 provisional 计划生效，因此角色不等待网络才开始执行。
- revision 匹配且相对请求基准的目标距离漂移不超过 10 米、方位误差漂移不超过 20° 的模型结果才可替换 provisional；超界结果会被丢弃并保留当前本地计划。模型短时意图最长 8 秒。
- 请求 15 秒超时。失败后提交 8 秒本地 fallback，并进入 30 秒托管重试冷却；冷却期间直接提交 8 秒本地 fallback。
- 无论计划来源是什么，紧急净距、未知地形、扫描和稳定验证都由本地快速循环决定，模型不是安全授权源。

## 版本与审计边界

独立包直接锁定或约束：

- `cesium@~1.143.0`
- `cesium-player-controller@0.2.1`
- `@dimforge/rapier3d-compat@^0.14.0`
- override：`@cesium/engine@26.1.0`
- override：`@cesium/widgets@16.1.0`

`cesium-player-controller@0.2.1` 对 Cesium 的 peer 范围只是 `>=1.120.0`。engine/widgets override 是为了阻止 `cesium@1.143.0` 自身的 caret 子依赖继续漂移，不应描述成 controller 强制要求这两个版本。

2026-09-04 在本实验目录执行 `npm audit --omit=dev`，结果为 **5 个 high severity，No fix available**。锁文件中的链路是：

```text
cesium-player-controller
  -> @loaders.gl/gltf
  -> @loaders.gl/textures
  -> texture-compressor
  -> image-size@0.7.5
```

对应 [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) 和 [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)。这是对当前解析依赖树的审计结果，不等于已经证明 controller 本身存在可利用路径。当前实验只加载仓库内固定的 Fox 二进制，缩小了输入面，但没有修复或消除 advisories。

controller 的 `streaming-terrain` 实现会访问 Cesium 私有内部状态；本实验传入的是有界静态 `type: 'terrain'` 配置，没有执行该 streaming 路径。发布或扩大模型输入前，需要重新审计 lockfile、loader 输入面和 controller/Cesium 兼容性。

## 2026-09-04 手工浏览器验证

当前修复后的真实浏览器运行记录如下：

- 到达目标；
- 页面按米取整后报告的轨迹风险边界最近净距为 6 米；
- 未观察到浏览器错误。

这是一次特定代码、网络和浏览器状态下的手工证据，不承诺每次运行都能到达，也不替代可重复的浏览器 E2E 测试。

## Fox 资产许可

`src/assets/Fox.glb` 是从 KhronosGroup [glTF Sample Assets 的 Fox canonical source](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox) 复制的**未修改二进制**。官方归属映射为：

- 模型：PixelMannen，CC0-1.0；
- rigging 和 animation：tomkranis，CC-BY-4.0；
- glTF 转换：AsoboStudio 和 scurest，CC-BY-4.0。

上游作者说明见 [Fox README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/Fox/README.md)，仓库内许可集合见 [`src/assets/Fox.LICENSE.md`](src/assets/Fox.LICENSE.md)，分发归属文本见 [`public/THIRD_PARTY_NOTICES.md`](public/THIRD_PARTY_NOTICES.md)。Fox 资产继续受各自 CC 条款约束，**不因仓库顶层 MIT 许可证而被重新授权**。

入口通过 Vite 静态资源 URL 引用 `public/THIRD_PARTY_NOTICES.md`，生产构建会把完整 notice 以内嵌 `data:text/markdown` 资源保留，并在地图页脚提供长期可访问的 `Fox asset credits` 链接。

## 当前定位

这是世界感知运行时的可执行实验，不是新的正式产品入口。稳定后应沉淀的是协议无关能力：

- embodiment observation / actuation contract
- 快慢双循环调度
- revision-bound 异步任务
- 主动观察与局部安全接管
- 可追溯的证据、计划与执行结果

场景 UI、controller/Rapier 依赖和第三方版本风险仍留在实验层。
