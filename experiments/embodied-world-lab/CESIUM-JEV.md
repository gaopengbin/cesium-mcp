# Cesium × cesium-mcp × Jev 场景实验

本实验让 Fox 角色在 Cesium 场景中根据局部结构化观测行动：cesium-mcp Bridge SDK 传递观测与运动意图，Jev 选择动作，Rapier 与本地控制器执行。当前工作重点是减少等待模型导致的停走，并接入东京丸之内的真实纹理建筑。

开发分支：`codex/cesium-jev-demo`。本地新入口：[东京建筑区](http://127.0.0.1:4192/?planner=jev&scene=city)。原 `4186` 演示保留，当前版本尚未部署公网。

## 本地运行

需要 Node.js 22 或更新版本。仅安装实验自己的依赖，在仓库根目录运行：

```powershell
rtk npm --prefix experiments/embodied-world-lab ci
```

在实验目录被 Git 忽略的 `.env.local` 中配置 `TYPESAFE_API_KEY`，然后启动：

```powershell
rtk npm --prefix experiments/embodied-world-lab run dev
```

页面默认选择 `city` 场景。等待场景、角色和碰撞数据就绪后再开始；加载页面不会自动导航。碰撞 JSON 已随实验保存，首次运行不必重新下载生成。建筑显示、影像和模型接口仍需要联网。密钥由本地 Vite 服务端读取，浏览器通过同源 `/api/jev/plan` 请求规划；不要将密钥放入前端配置或 Git。模型调用产生 API 用量，纯静态部署不包含服务端代理。

碰撞数据的准备脚本为 [`scripts/prepare-city-colliders.mjs`](scripts/prepare-city-colliders.mjs)。可先运行不联网、不改输出的坐标变换自测：

```powershell
rtk npm --prefix experiments/embodied-world-lab run prepare:city -- --self-test
```

需要重新生成数据时，运行不带 `--self-test` 的 `prepare:city`。该操作会从固定 PLATEAU 源下载选定叶节点、检查坐标与射线，并覆盖 `src/assets/tokyo-colliders.json`；不是每次启动的必需步骤。

## 连续行动怎样调整

旧版本的一段动作约两秒，到期后才等待下一次模型结果，因此会出现“走一段、停下来、再走”的节奏。当前循环在有效动作继续执行时提前请求下一段计划：

- 本实验配置提前最多 **3,000 毫秒**规划，提前窗口不超过当前动作时长的一半。
- 有效动作在等待响应期间继续执行；单次 `advance` 最长 **6 秒**。
- 转向已经对齐目标方向时，可提前结束转向，不必等满整段时长。
- 本地 **20 Hz** 安全循环继续检查风险、碰撞、计划有效性和停止请求，必要时干预动作。

这些调整消除了“必须等动作到期才请求”的安排。下文记录的城市回合未出现续期停顿；模型超时、过期响应或安全干预仍可能使角色停止。

## 城市场景与数据边界

默认城市位于东京站西侧的丸之内街区，建筑来自 **国土交通省 Project PLATEAU 千代田区 2025 年度带纹理 LOD2 3D Tiles**。已纳入版本控制的 [`src/assets/tokyo-colliders.json`](src/assets/tokyo-colliders.json) 保存源地址、瓦片哈希、建筑标识、坐标编码与验证记录；生成过程见[准备脚本](scripts/prepare-city-colliders.mjs)。这是真实城市建筑数据，不是随机生成的楼群。

渲染建筑不会自动成为 Rapier 碰撞体。本实验已从同源 **16 个叶节点、132 个唯一源建筑标识**提取 **57,426 个三角形**并加载为碰撞网格，JSON 约 **5.19 MB**。转换保留源建筑几何，省去纹理与材质，应用源坐标变换后存为局部 ECEF 偏移；没有使用 OSM footprint 拉伸或建筑高程偏移。坐标变换、源包围区域、射线检查与下文的沿街回合已通过；尚未遍历所有建筑边缘或复杂绕楼路线。

碰撞覆盖范围为 `[139.7630, 35.6790, 139.7665, 35.6830]`。与该范围相交的叶节点保留完整几何，范围之外不保证覆盖完整。数据仅包含建筑，不将建筑底面当成真实道路表面。

城市地面明确采用 **38 米椭球高的局部平面近似**，不是实测道路地形。东京附近 ArcGIS 高程样本约为 2.9 米，但服务声明使用正高；其基准与建筑数据存在差异，不能将该数值静默当作椭球高。建筑 mesh 不做高程偏移。角色、平面地面与碰撞的垂直对齐仍需结合渲染结果检查，不能据此声称具有测量精度。

| 数据或组件 | 来源及作用 |
| --- | --- |
| 城市纹理建筑 | PLATEAU / 国土交通省，千代田区 2025；用于建筑显示与同源碰撞数据处理 |
| 底图影像 | Esri World Imagery，仅用于显示，不传给 Jev 作为视觉证据 |
| 旧山地场景高程 | ArcGIS World Elevation，用于旧山地预设；不作为城市 38 米平面的测量来源 |
| Fox 角色 | Khronos glTF Sample Assets 的未修改资产；作者与许可见 [第三方归属](public/THIRD_PARTY_NOTICES.md) 和 [Fox 许可](src/assets/Fox.LICENSE.md) |
| 任务与控制 | 本实验添加的角色行为、目标、局部观测、安全控制及碰撞处理 |
| 决策服务 | TypeSafe 的 Jev API；本实验不是其官方产品 |

PLATEAU 数据需保留来源并标注实验所做处理。其[一般使用政策](https://www.mlit.go.jp/plateau/site-policy/)已核对；来源记录说明，数据集专属页面的条款尚未独立核验，不能将一般政策表述为已确认不存在额外权利说明。Fox 和各地图数据继续遵守各自条款，不因仓库许可证而重新授权。

## 观测、控制与其他场景

Bridge SDK 使用 `observeWorld`、`commitMotionIntent` 和 `stopEmbodied` 连接观测、运动意图与停止操作。当前页面直接调用 `CesiumBridge` 执行通道，**尚未串联独立 MCP stdio/HTTP 客户端与 runtime 服务**。

Jev 接收目标距离、方位差、接地状态、速度和候选方向等结构化观测，返回类型化动作。请求使用 `jev-latest`，实际模型名以当次记录为准。没有将截图送给模型，也没有实现真实无人机、车辆控制或视觉识别。本地安全动作不能记为模型推理结果。

| `scene` | 配置 |
| --- | --- |
| `city` | 默认：东京丸之内真实纹理建筑区 |
| `inspection` | 旧山坡巡检起点、目标与人工风险布局 |
| `wide-detour` | 旧山地场景，扩大前方风险圆 |
| `near-risk` | 旧山地场景，将风险圆移近起点 |
| `random` | 在旧山地场景中按种子改变目标与人工风险圆 |

例如 [山坡巡检](http://127.0.0.1:4192/?planner=jev&scene=inspection&seed=260921) 与 [随机配置](http://127.0.0.1:4192/?planner=jev&scene=random&seed=846641)。随机化的是实验配置，不是东京建筑或真实地形；同种子重现布局，不保证同一行动序列。

历史滑块查看已记录的位置与观测，不调用模型，也不移动当前活角色；它不是重新执行物理模拟。浏览器已验证回放、请求期间停止、停止后重启，以及 390×844 手机布局。运行记录通过“查看记录”打开只读 JSON，可全选后手动复制，无需浏览器下载或自动剪贴板支持。

## 验证状态

截至当前修改，实验 **87 项测试、类型检查与生产构建通过**。2026-09-21 的城市完整回合使用 `jev-1.13.0`，接受 11 个决策，记录 22 次 Bridge 调用，目标距离从 116.4626 米降至 7.9950 米，进入 8 米到达范围后停止。

连续性按相邻 ECEF 坐标的实际水平位移测量，不采用前进输入或控制器期望速度冒充运动。本轮测得实际行程 108.113 米；后台规划期间持续移动 4.002 秒；续期静止次数与最长续期静止时间均为 0，未出现超过 500 毫秒的采样缺口。请求耗时 268–791 毫秒；第一次等待模型与到达停止不计作续期停顿。当前视野建筑加载完成，失败瓦片数为 0。本地完整证据为 Git 忽略的 `artifacts/cesium-jev-city-continuous-run.json`，这是一条沿街短路线的实测，不代表任意路线成功率或复杂自主驾驶能力。

另一次请求中停止后重启的完整回合也接受 11 个 Jev 决策，最终距目标 7.9098 米，续期静止为 0。终点保存修复后，回放最后一帧与停止位置一致，记录弹窗包含完整 70 帧；证据为 `artifacts/cesium-jev-city-restart-run.json`。这两次沿街任务没有要求绕过挡在正前方的建筑，不能据此声称已完成复杂绕楼规划验收。

调优对照：城市首轮 8 个 Jev 决策也完成抵达，但最后一次请求耗时 2,373 毫秒，超过当时的两秒提前窗口，出现约 0.4 秒续期等待。随后将窗口改为最多三秒，并加入上述实际位移统计。首轮记录为 Git 忽略的 `artifacts/cesium-jev-city-first-run.json`；网络延迟仍会波动，不能用后续较快的单轮证明任意延迟下都无停顿。

在仓库根目录可复查：

```powershell
rtk npm --prefix experiments/embodied-world-lab test
rtk npm --prefix experiments/embodied-world-lab run typecheck
rtk npm --prefix experiments/embodied-world-lab run build
```

旧版归档：2026-09-21 的 `inspection` 停走版本曾接受 29 个 Jev 决策，目标距离从 197.230 米降至 7.96359 米并停止。本地安全控制器参与其中，证据为 Git 忽略的 `artifacts/cesium-jev-inspection-run.json`。这只能说明旧版本该次回合的结果，不能证明当前连续版或真实城市版已经完成验收，也不作为导航成功率。

此前 Three.js 网格原型 `G:/code/jev-world-lab` 仍独立保留；这里继续使用 Cesium 与 cesium-mcp 的组合。
