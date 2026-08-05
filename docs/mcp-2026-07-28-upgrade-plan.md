# MCP 2026-07-28 升级计划

> 状态：升级完成，bridge、runtime、dev `1.143.4` 已发布到 npm `latest`
> 工作分支：`codex/mcp-2026-07-28-upgrade`
> 基线：`@modelcontextprotocol/sdk ^1.29.0`、MCP `2025-11-25` 兼容行为

> 2026-08-05 收口：`cesium-mcp-dev` 也已迁移到稳定版 SDK v2，并新增
> modern/legacy stdio 对照测试；根目录旧 HTTP 启动脚本改为委托 Runtime
> 正式入口。相关改动随下一次稳定版发布。

## 实施进度（2026-07-29）

已完成：

- 升级到 TypeScript SDK stable `2.0.0` 的 server、node 和测试 client。
- 抽取 `buildMcpServer()`，统一工具、资源、Prompt 和 browser session 注册。
- HTTP 使用 `createMcpHandler()`，同一 `/mcp` 端点兼容 legacy 与 modern。
- stdio 使用 `serveStdio()`，支持 legacy handshake 与 `2026-07-28` pin。
- canonical JSON Schema 改用 SDK v2 `fromJsonSchema()` 和 AJV 验证。
- 保留原 Zod adapter 的默认值行为，并增加 JSON Schema 2020-12 组合测试。
- 增加 modern discovery、tools/list、tools/call、header mismatch、legacy initialize
  和双时代 stdio 自动化测试。
- 修复实际 HTTP 服务器未把 `/mcp` 路由交给 SDK handler 的问题。
- 精确锁定官方 conformance `0.2.0-alpha.10`，`server-stateless`
  场景达到 28/28 通过、0 失败；2 个 list-changed SHOULD 项保留为 warning。
- 将一致性测试专用诊断工具限制在 `CESIUM_MCP_CONFORMANCE=1`，不混入生产工具列表。
- 已合并到 `main`，并通过 GitHub Actions 将 bridge、runtime、dev
  `1.143.4` 发布到 npm `latest`；`next` 保留 `1.143.4-next.1`。
- 已更新根 README、runtime README 和官网中英文安装/兼容性文档。

发布验证已完成：

- npm 全新安装的 `next.1` 已完成真实 Chrome → MCP HTTP → WebSocket → Cesium
  闭环：
  官方 SDK v2 Client 以 `2026-07-28` modern 模式执行
  `getView → flyTo → getView`，Chrome Viewer 实际飞到悉尼。
- 内置 Viewer 的 `/?session=...` 和 `/index.html?session=...` 均返回 200。
- Runtime `/bridge.js` 与 npm 安装的 `bridge@next` 浏览器包完全一致。
- 从空目录安装三个 `latest` 包，版本均为 `1.143.4`；官方 SDK v2 Client
  固定 `2026-07-28` 后发现 63 个工具，Runtime 报告版本 `1.143.4`。
- 正式版内置 Viewer query 路由返回 200，`/bridge.js` 与安装的
  `cesium-mcp-bridge` 浏览器 bundle SHA-256 一致。

## 1. 目标

在不破坏现有 MCP 客户端、Cesium 浏览器桥接和 WebMCP 接入的前提下，将
`cesium-mcp-runtime` 升级到官方 TypeScript SDK v2，并同时支持：

- MCP `2025-11-25` 及更早的 2025-era 客户端
- MCP `2026-07-28` 无状态协议
- stdio 和 Streamable HTTP 两种传输
- 现有基于 `sessionId` 的 Cesium 浏览器实例路由
- `cesium-mcp-contracts` 提供的单一工具契约

升级完成后，同一个工具工厂、同一份 Schema 和同一个 `/mcp` 地址服务两代协议，
不维护两套工具实现。

## 2. 外部前提

正式实施和发布必须同时满足：

1. MCP `2026-07-28` 正式规范发布，不再引用 `schema/draft`。
2. `@modelcontextprotocol/server` 和 `@modelcontextprotocol/node` 发布稳定 v2。
3. 官方迁移指南与最终 SDK API 一致。
4. v1 基线测试全部通过，工作区无无关改动。

在上述条件满足前，可以完成 PoC 和测试准备，但不得将 beta SDK 发布到 npm
的 `latest` 标签。

官方依据：

- [MCP 2026-07-28 Release Candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- [TypeScript SDK v1 → v2 migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2)
- [TypeScript SDK 2026-07-28 protocol support](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)
- [TypeScript SDK protocol versions](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions)

## 3. 已确认的架构决策

### 3.1 保留 v1 稳定线

- `main` 在升级验证完成前继续使用 v1 SDK。
- 升级工作只在 `codex/mcp-2026-07-28-upgrade` 开展。
- 合并升级前记录最后一个 v1 稳定提交和 npm 版本。
- 若 v2 合并后仍需修复 v1，再从最后一个 v1 稳定提交建立 `release/1.x`。

### 3.2 使用 v2 自带的双协议入口

- HTTP 使用 `createMcpHandler(buildMcpServer)`。
- 保持默认 `legacy: 'stateless'`，由一个入口同时处理 modern 和 legacy 请求。
- Node HTTP 适配使用 `toNodeHandler`，不自行复制协议识别逻辑。
- stdio 使用 `serveStdio(() => buildMcpServer())`，允许连接在打开时选择协议时代。
- 不保留当前手写的“每个 POST 创建 v1 transport”实现作为第二套长期路径。

### 3.3 Cesium 会话与 MCP 会话分离

MCP `Mcp-Session-Id` 的移除不影响现有 Cesium `sessionId`。后者是显式的应用层
浏览器路由，继续保留：

- 工具参数中的 `sessionId`
- HTTP 查询参数中的 `?session=...`
- `AsyncLocalStorage` 到 `sendToBrowser` 的路由链路

代码、测试和文档中统一称其为“browser session”，避免与 MCP protocol session
混淆。

### 3.4 单一工具契约继续作为事实来源

`cesium-mcp-contracts` 继续负责工具名、输入/输出 Schema、默认值、注释、工具集和
中英文元数据。Bridge、MCP 和 WebMCP 只消费契约，不互相依赖具体传输代码。

SDK v2 中优先使用 `fromJsonSchema()` 直接注册已有 JSON Schema，由官方 JSON
Schema validator 处理完整的 JSON Schema 2020-12。迁移后删除 runtime 对自制
JSON Schema → Zod 转换器的协议层依赖，但必须先证明以下行为不变：

- 默认值仍然应用
- 经纬度、颜色和数组边界仍然校验
- `additionalProperties` 行为不变
- `oneOf`、`anyOf`、`allOf`、`$ref` 和 `$defs` 正确处理
- 传入 handler 的参数与现有工具预期一致

如果 SDK 默认 validator 不应用 Schema 默认值，则在契约执行层增加统一的输入
规范化步骤，不在每个工具 handler 内重复补默认值。

### 3.5 WebMCP 保持独立

本次升级只修改 `cesium-mcp-runtime` 的 MCP server 协议适配。以下内容不混入：

- `cesium-mcp-webmcp` 的 Chrome WebMCP 注册方式
- 在线体验页面的 AI 调度和 UI
- CesiumJS 本身的版本升级
- MCP Apps 或 Tasks 的业务功能实现

MCP Apps 和 Tasks 只作为升级完成后的独立增强项。

## 4. 目标结构

```text
cesium-mcp-contracts
        │
        ▼
buildMcpServer(options)
  ├─ 注册 tools/resources/meta-tools
  ├─ 注入 locale、toolsets、browser session
  └─ 绑定 sendToBrowser handlers
        │
        ├─ serveStdio(factory)
        │    ├─ 2025-era
        │    └─ 2026-07-28
        │
        └─ createMcpHandler(factory)
             ├─ legacy stateless fallback
             └─ modern per-request protocol
```

`buildMcpServer` 必须是唯一的工具和资源装配入口，防止当前全局 stdio server 与
HTTP fresh server 的注册逻辑继续分叉。

## 5. 实施阶段

### 阶段 0：冻结基线

工作内容：

- 保存当前 `tools/list` 快照，包括工具名、描述、input/output Schema、annotations
  和 `_meta.toolset`。
- 保存默认工具集和 `CESIUM_TOOLSETS=all` 两种清单。
- 增加 v1 stdio 与 v1 stateless HTTP 的冒烟测试。
- 记录 `list_toolsets`、`enable_toolset`、resources 和 `createSandboxServer` 行为。
- 记录浏览器未连接、默认浏览器、多 browser session 三类执行结果。

退出条件：

- 当前分支在未换 SDK 前通过 `npm test`、`npm run typecheck`、`npm run lint` 和
  `npm run build`。
- 测试能够发现工具缺失、Schema 漂移和 browser session 路由回归。

### 阶段 1：抽取单一 Server Factory

工作内容：

- 将 server 创建、资源注册、meta-tools 注册和工具回放抽成
  `buildMcpServer(options)`。
- `options` 至少包含 locale、启用工具集、请求 URL 和协议时代所需上下文。
- 移除 stdio 与 HTTP 之间重复的 `McpServer` 初始化和资源定义。
- 保持 v1 SDK 和现有对外行为不变，先完成结构重构。

退出条件：

- 阶段 0 的所有快照和执行测试不变。
- stdio、HTTP 和 Smithery sandbox 均由同一注册入口产生相同工具元数据。

### 阶段 2：迁移 SDK v2 与 Schema 注册

工作内容：

- 并行安装 v2 packages，暂时保留 `@modelcontextprotocol/sdk` 便于逐步迁移。
- 根据稳定版迁移指南更新 import 和 handler 签名。
- 将 Zod 升级到 v2 要求的稳定版本；只在仍需要 Zod 的 runtime-only/meta tools
  中使用它。
- 共享工具改用 `fromJsonSchema(contract.inputSchema)`。
- 将 `sessionId` 以 JSON Schema 组合或统一包装方式加入 MCP 输入 Schema。
- 验证并保留契约默认值行为。
- 所有 v1 SDK import 清零后再删除 `@modelcontextprotocol/sdk`。

退出条件：

- `rg '@modelcontextprotocol/sdk' packages/cesium-mcp-runtime` 无结果。
- 全部 canonical tool contracts 能被 v2 validator 编译和执行。
- 工具 handler 收到的参数、默认值和错误语义与 v1 基线一致。

### 阶段 3：HTTP 双协议入口

工作内容：

- 用 `createMcpHandler(buildMcpServer)` 替换当前
  `StreamableHTTPServerTransport` 手写入口。
- 用 factory context 的 `requestInfo` 解析 `?toolsets=`；在 handler 外层保留
  `?session=` 的 `AsyncLocalStorage` 路由作用域。
- 通过 `toNodeHandler` 接入现有 `node:http` server。
- 更新 CORS，使浏览器客户端能发送 2026 协议头，同时保留 legacy 所需头。
- 保持 `/mcp` 地址、端口环境变量和 CLI 参数不变。
- 保持默认 `legacy: 'stateless'`，不引入第二个 modern-only URL。

退出条件：

- 同一个 `/mcp` 地址通过 2025-era `initialize` 流程。
- 同一个 `/mcp` 地址通过 modern `server/discover` 流程。
- 两代客户端得到相同工具清单并能执行同一个 Cesium 命令。
- GET/DELETE、错误状态和 Content-Type 符合对应协议时代。

### 阶段 4：stdio 双协议入口

工作内容：

- 用 `serveStdio(() => buildMcpServer())` 替换直接连接
  `StdioServerTransport` 的启动方式。
- 验证 modern 探测、legacy fallback 和进程退出行为。
- 确保日志只写 stderr，不污染 JSON-RPC stdout。

退出条件：

- v1 客户端可继续连接和调用。
- v2 `auto` 客户端可选择 modern 协议。
- v2 legacy 模式和 modern pin 模式均有自动化测试。

### 阶段 5：兼容性与协议测试矩阵

必须覆盖：

| Server | Client | Transport | 预期 |
|---|---|---|---|
| v2 dual-era | v1 SDK | HTTP | legacy 成功 |
| v2 dual-era | v2 legacy | HTTP | legacy 成功 |
| v2 dual-era | v2 auto | HTTP | modern 成功 |
| v2 dual-era | v2 modern pin | HTTP | modern 成功 |
| v2 dual-era | v1 SDK | stdio | legacy 成功 |
| v2 dual-era | v2 auto | stdio | modern 成功 |
| v2 dual-era | v2 modern pin | stdio | modern 成功 |

协议负向测试至少包括：

- modern header 与 body 不一致
- 不支持的协议版本
- POST 缺少或使用错误的 `Content-Type`
- malformed per-request `_meta`
- modern 请求错误携带 `Mcp-Session-Id`
- browser session 不存在或浏览器断线
- `?toolsets=` 为空、未知或重复
- CORS preflight 请求包含 modern MCP headers

业务回归至少包括：

- 默认工具集、动态启用工具集和全量工具集
- camera、entity、layer 各执行一个真实 browser command
- resource read
- structured output 与文本 content
- 中英文工具描述
- WebMCP 契约清单不受影响

### 阶段 6：文档与预发布

工作内容：

- 更新 runtime README、中文 README、API 文档、架构文档和环境变量说明。
- 明确列出支持的协议版本和客户端兼容策略。
- 记录 `sessionId` 是 browser session，而不是 MCP protocol session。
- 添加 changeset。
- 先发布 npm `next` 预发布版本，不移动 `latest`。
- 使用至少一个真实主流 MCP Host 做 stdio 和 HTTP 验证。

稳定发布门槛：

- 官方规范和 SDK v2 已稳定发布。
- 所有自动化门槛通过。
- `next` 预发布无阻断问题。
- v1 客户端回归通过。
- README 示例可按原配置继续运行。

## 6. 回滚策略

- 在升级稳定前，npm `latest` 保持指向 v1 稳定版本。
- 升级提交按阶段拆分，factory 重构、SDK 迁移、HTTP、stdio、文档分别提交。
- 每个阶段均要求测试通过，禁止把不可运行的中间状态合入 `main`。
- 若 v2 发布后出现阻断问题，恢复 npm `latest` 到最后一个 v1 稳定版本，并从
  最后一个 v1 提交建立维护分支。
- Bridge、contracts 和 WebMCP 不随 runtime 协议回滚，除非契约快照证明它们发生
  了不兼容变化。

## 7. 完成定义

只有同时满足以下条件，升级才算完成：

- runtime 不再依赖 v1 SDK。
- 一个 server factory 同时服务 stdio、HTTP、legacy 和 modern。
- `2025-11-25` 与 `2026-07-28` 自动化兼容矩阵全部通过。
- 工具清单、Schema、默认值、annotations、resources 和 browser session 行为无回归。
- WebMCP 和 Bridge 测试无回归。
- 完成中英文文档、changeset、npm `next` 验证和回滚演练。
- 在上述结果确认前，不合并到 `main`，不发布到 npm `latest`。

## 8. 升级后的后续事项

以下项目不阻塞协议升级，单独立项：

1. MCP Apps：为 Cesium 工具返回可交互地图或结果面板。
2. Tasks extension：用于长时间 3D Tiles、地形或大数据加载任务。
3. Remote MCP OAuth/OIDC：仅在公开托管 runtime 时实施。
4. `tools/list` cache hints：工具集稳定后评估 `ttlMs` 和 `cacheScope`。
