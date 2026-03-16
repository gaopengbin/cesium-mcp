# cesium-mcp 推广进度记录

## 2026-03-15 — 全平台上架完成

### 平台覆盖

| 平台 | 链接 | 状态 |
|------|------|------|
| npm Registry | [cesium-mcp-runtime](https://www.npmjs.com/package/cesium-mcp-runtime) / [cesium-mcp-dev](https://www.npmjs.com/package/cesium-mcp-dev) | v1.139.2 ✅ |
| MCP Official Registry | `io.github.gaopengbin/cesium-mcp-runtime` / `io.github.gaopengbin/cesium-mcp-dev` | ✅ |
| awesome-mcp-servers | [PR #3227](https://github.com/punkpeye/awesome-mcp-servers/pull/3227) | ✅ 已提交 |
| Smithery | [runtime](https://smithery.ai/servers/gaopengbin/cesium-mcp-runtime) (24 tools) / [dev](https://smithery.ai/servers/gaopengbin/cesium-mcp-dev) (3 tools) | ✅ |
| Glama | [cesium-mcp](https://glama.ai/mcp/servers/gaopengbin/cesium-mcp) | ✅ 已审核通过 |
| mcp.so | [cesium-mcp-runtime](https://mcp.so/server/cesium-mcp-runtime/gaopengbin) / [cesium-mcp-dev](https://mcp.so/server/cesium-mcp-dev/gaopengbin) | ✅ 已提交 |

### Smithery 部署架构

- **Cloudflare Worker**: 单个 Worker `cesium-mcp`，通过域名路由区分服务
  - `mcp.gpb.cc` → cesium-mcp-runtime（24 tools + 2 resources）
  - `dev-mcp.gpb.cc` → cesium-mcp-dev（3 tools）
- **Smithery Gateway URLs**:
  - `https://cesium-mcp-runtime--gaopengbin.run.tools`
  - `https://cesium-mcp-dev--gaopengbin.run.tools`
- Worker 仅暴露元数据（工具描述/schema），不执行实际操作，使用时需本地安装

### 关键技术决策

1. **cli.ts 分离**：将 `main()` 从 `index.ts` 分离到 `cli.ts`，使 `index.ts` 无副作用，兼容 Smithery 扫描器
2. **Cloudflare Worker 方案**：Smithery 要求 HTTPS URL 注册，cesium-mcp 是 stdio 服务器，通过 Worker 提供 MCP Streamable HTTP 元数据端点解决
3. **域名路由**：同一个 Worker 服务两个 MCP 包，通过 `hostname` 区分（`mcp.gpb.cc` vs `dev-mcp.gpb.cc`）

### Git 提交记录

- `d49596d` — refactor: separate cli.ts entry from index.ts for Smithery compatibility
- `2e8e41c` — feat: add Cloudflare Worker for MCP Streamable HTTP endpoint
- `3b9e54a` — feat: add dev endpoint to Worker, dual domain support

### 推广渠道进度

| 渠道 | 状态 | 备注 |
|------|------|------|
| 掘金 | ✅ 已发布 | 文章见 articles/juejin-promotion.md |
| 知乎 | ✅ 已发布 | 含 Mermaid 截图 |
| 微信公众号 | ✅ 已发布 | 43工具版，文章见 articles/wechat-promotion.md |
| mcp.so | ✅ 已提交 | runtime + dev 均已收录 |
| Twitter/X | ✅ 已发推 | @pengbingao，带 demo GIF |
| Reddit r/MCP | ❌ 被过滤 | 新账号(0天)，需等 2-3 天 |
| Reddit r/ClaudeAI | ❌ 被过滤 | 同上 |
| Hacker News | ❌ 被限制 | Show HN 暂时限制新用户 |
| CesiumJS Discord | ❌ 不存在 | CesiumJS 无公开 Discord |
| Cesium Community Forum | ✅ 已发帖 | community.cesium.com，社区友好风格 |
| mcpservers.org | ✅ 已提交 | 免费提交，等待审核 |
| PulseMCP | ✅ 已收录 | cesium-mcp-dev 已自动同步，runtime 待后续批次 |
| CSDN | ✅ 已发布 | 支持 Markdown+Mermaid |
| CesiumGS 官方 README | ✅ PR 已提交 | [PR #21](https://github.com/CesiumGS/cesium-ai-integrations/pull/21) Community MCP Servers |

### Smithery 质量评分优化

**当前分数: 32/100**

| 维度 | 得分 | 扣分原因 |
|------|------|---------|
| Tool Quality | 24/75 | 3 个参数缺描述、0/24 工具有 annotations、工具名扣分 |
| Server Capabilities | /10 | 无 Prompts |
| Server Metadata | 1/10 | 缺 Description、Homepage、Icon |
| Configuration UX | 9 | 缺 configSchema |

**优化方向：**
1. 为 24 个 tool 添加 `annotations`（`readOnlyHint`、`destructiveHint` 等）
2. 补全 3 个缺失的参数描述
3. server.json 添加 `description`、`homepage`、`icon` 字段
4. 提供 `configSchema`

### 待办

- [ ] npm 发布 v1.139.3（含 cli.ts 重构）
- [x] 推广文章（掘金/知乎）— 已完成
- [ ] Smithery 质量评分优化（32→目标 80+）
- [x] Glama 注册 — 已通过审核并上架
- [x] awesome-mcp-servers PR Glama 徽章 — 已添加（commit 80ff543）
- [ ] awesome-mcp-servers PR 合并跟踪
- [ ] 清理临时文件（tools-meta.json）
- [ ] Cesium Community Forum 发帖
- [ ] mcpservers.org / PulseMCP 提交
- [ ] Reddit 重发（账号满 3 天后）
- [ ] Hacker News 重发（积累社区参与度后）
