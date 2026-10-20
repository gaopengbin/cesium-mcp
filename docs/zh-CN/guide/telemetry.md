# 使用统计

Cesium MCP 的可执行入口**默认开启使用统计**。CLI 在读取随机安装标识或发送请求前，向 stderr 输出告知；浏览器集成在开发者控制台输出告知。仅导入包不会发送数据，安装阶段也没有统计脚本。

## 关闭方法

在启动 Runtime／Dev 的环境中设置 `CESIUM_TELEMETRY_DISABLED=1` 或 `DO_NOT_TRACK=1`。由 IDE 启动 MCP 时，将开关放入该服务的环境配置。两个 CLI 也支持 `--no-telemetry`。

```json
{ "env": { "CESIUM_TELEMETRY_DISABLED": "1" } }
```

浏览器应用在创建 Bridge 或注册 WebMCP **之前**设置：

```js
globalThis.CESIUM_MCP_TELEMETRY_DISABLED = true
```

也可以只关闭某个集成：

```js
const bridge = new CesiumBridge(viewer, { telemetry: false })
await registerCesiumWebMcp(executor, { telemetry: false })
await registerCesiumViewerWebMcp(viewer, { telemetry: false })
```

浏览器的 Do Not Track、Global Privacy Control，以及 Node 的 CI 环境、`NODE_ENV=test` 都会关闭统计。预先关闭时，不读取或创建标识，不创建发送定时器，也不发送请求。运行中打开全局关闭开关会在发送时丢弃排队计数，无法撤回已经发出的请求。已有本地标识不会自动删除。

## 收集范围

固定字段只有随机安装标识、随机批次标识、入口名称、包版本、系统大类、事件／已知工具名、成功或失败、耗时区间及次数。未知工具名直接忽略。

不上传提示词、工具参数与结果、坐标、GeoJSON、资产 ID、数据地址、文件路径、账号、token 或原始报错。接收端拒绝额外字段。应用代码不读取或保存 IP；请求经过 Cloudflare，其基础设施可能按自身策略处理网络元数据。

默认接收地址为 `https://cesium-browser-agent.pages.dev/api/package-telemetry`。Node 标识保存在 `%LOCALAPPDATA%/cesium-mcp/telemetry-id`，或 `$XDG_STATE_HOME/cesium-mcp/telemetry-id`，后备位置为 `~/.local/state/cesium-mcp/telemetry-id`。浏览器使用当前来源站点的 `localStorage` 键 `cesium-mcp.telemetry-id`；存储不可用时仅使用本页有效的随机标识，不生成机器指纹。服务端保存安装标识的 SHA-256 摘要。

首批延迟一秒发送，之后最多聚合一分钟；每批最多 32 组计数，请求两秒超时，不携带 cookie 或 referrer，也不跟随重定向。失败批次直接丢弃，不影响地图或工具。提前退出、离线、拦截或关闭统计都会造成遗漏。

## 统计口径

- Runtime：启动成功、浏览器／地图面板连接、已注册指令的执行结果；不统计面板轮询。内置地图不再重复作为 Bridge 上报。
- Dev：CLI 启动和三个开发工具的调用。
- Bridge：实例初始化及 `execute()` 调用；直接调用类型化方法不逐项计数。
- WebMCP：`registerCesiumWebMcp`／`registerCesiumViewerWebMcp` 注册成功及执行器调用。纯工具构建函数、contracts 数据包不触发统计；Viewer 便捷接口自动关闭附属 Bridge 的重复上报。

自行创建 Bridge 再交给 WebMCP 的应用，可以将底层 Bridge 设置为 `telemetry: false`，由 WebMCP 负责计数。不同入口、浏览器来源和服务实例不能相加当作人数。共享服务器是一个安装实例，一个人多台设备可能是多个实例。公开客户端事件可被伪造；这些是已观测的安装活动，不能证明真实人数或完整留存。

## 接收端与查询

发布新 npm 客户端之前，先部署浏览器 Agent Worker 的新路由，对现有 D1 绑定执行 `examples/browser-agent/package-telemetry.sql`，并配置私有 Worker secret `TELEMETRY_ADMIN_TOKEN`。新建的 `npm_usage*` 表独立于聊天／AI 用量，不修改原有数据。

接收端限制每批 16 KiB、校验字段白名单、按批次去重，并限制单个安装实例每天最多 2,000 次提交。查询必须提供管理员 bearer token，只返回产品、活跃安装实例、工具调用／失败、版本／系统、每日活动及最近两周均使用过的实例数；不公开安装标识列表。查询窗口为 7、30、90 天，早于 90 个 UTC 日期的记录在下次接受上报时清理，没有独立定时删除任务。

本地设置 `CESIUM_TELEMETRY_ADMIN_TOKEN` 后，运行 `node scripts/read-package-telemetry.mjs --days 30` 查询。自托管或本地验证可配置 `CESIUM_TELEMETRY_ENDPOINT`，浏览器可传 `telemetry: { endpoint }`；只接受 HTTPS 或本地 HTTP，包含账号密码、查询参数或片段的地址会关闭上报，不会回退到其他地址。

npm 下载、包运行统计、GitHub 访问和演示站聊天用量始终分开。接收端不可用或查询失败代表数据不可用，不代表零用户。
