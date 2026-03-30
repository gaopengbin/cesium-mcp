# Dify + Cesium MCP 集成指南

本教程演示如何在 [Dify](https://dify.ai) 中配置 Cesium MCP 工具，实现通过自然语言控制 CesiumJS 3D 地图。

## 环境要求

- Docker Desktop（用于运行 Dify）
- Node.js 18+
- 支持 Function Calling 的 LLM（如 Ollama qwen3、OpenAI GPT-4 等）

## 架构概览

```
用户输入 → Dify Agent → LLM → MCP 工具调用
                              ↓
                        cesium-mcp-runtime (HTTP)
                              ↓
                        WebSocket Bridge
                              ↓
                        CesiumJS 浏览器
```

## 配置步骤

### 1. 启动 Cesium MCP Runtime

```bash
# 安装
npm install -g cesium-mcp-runtime

# 启动 HTTP 模式
npx cesium-mcp-runtime --transport http --port 3211

# 输出示例：
# [cesium-mcp-runtime] HTTP + WebSocket server on http://localhost:9100
# [cesium-mcp-runtime] MCP Server running (Streamable HTTP), 58 tools available
# [cesium-mcp-runtime] MCP endpoint: http://localhost:3211/mcp
```

### 2. 打开 CesiumJS Demo 页面

1. 在浏览器中打开：`http://localhost:9100/demo/index.html`
2. 修改 WebSocket URL 为：`ws://localhost:9100?session=default`
3. 点击「连接」，确认显示"已连接"

> **重要**：session 必须设为 `default`，这是 MCP 工具的默认会话标识。

### 3. 配置 Dify MCP 插件

#### 3.1 安装 MCP SSE Agent 插件

在 Dify「插件」页面搜索并安装：
- **junjiem/mcp_sse_agent** (v0.4+)

#### 3.2 配置 MCP 服务

在「工具」→「安装的工具」→「MCP Agent SSE」中配置：

```json
{
  "cesium-mcp": {
    "transport": "streamable_http",
    "url": "http://host.docker.internal:3211/mcp",
    "timeout": 60
  }
}
```

> **Docker 网络说明**：
> - `host.docker.internal` 是 Docker 容器访问宿主机的特殊域名
> - Windows/Mac Docker Desktop 默认支持
> - Linux 需要额外配置 `--add-host=host.docker.internal:host-gateway`

#### 3.3 配置 Windows 防火墙（如需）

如果遇到网络连接问题，添加防火墙入站规则：

```powershell
# PowerShell (管理员)
New-NetFirewallRule -DisplayName "Dify MCP Access" -Direction Inbound -Protocol TCP -LocalPort 3211 -Action Allow
```

### 4. 创建 Dify Workflow

#### 4.1 新建工作流

1. 工作室 → 创建空白应用 → 选择"工作流"
2. 配置开始节点：添加 `query` 字段（类型：字符串，必填）

#### 4.2 添加 Agent 节点

1. 拖入 Agent 节点，连接到开始节点
2. **策略**：选择 `mcp_sse_function_calling`
3. **模型**：选择支持 Function Calling 的模型（如 `qwen3:8b`）
4. **输入**：绑定 `{{#用户输入/query}}`
5. **工具**：勾选 `MCP Agent SSE` 工具集

#### 4.3 发布工作流

点击"发布"按钮

### 5. 测试

#### 5.1 工作流测试

在 Dify 工作流编辑器中：
1. 点击「测试运行」
2. 输入：`飞到北京`
3. 等待执行完成

#### 5.2 验证结果

切换到 CesiumJS 页面，查看：
- 地图是否飞到了北京
- 命令日志是否显示 `flyTo` 和 `success`

### 6. 高级用法

#### 多指令链式调用

```
飞到上海，添加一个红色标注
```

Agent 会解析为两个工具调用：
1. `flyTo` (longitude: 121.47, latitude: 31.23)
2. `addMarker` (longitude: 121.47, latitude: 31.23, color: #FF0000)

#### 支持的工具列表

| 工具 | 功能 |
|------|------|
| `flyTo` | 相机飞行到指定位置 |
| `setView` | 设置相机视角 |
| `getView` | 获取当前视角 |
| `addMarker` | 添加标注点 |
| `addPolyline` | 添加折线 |
| `addPolygon` | 添加多边形 |
| `addGeoJsonLayer` | 加载 GeoJSON |
| `setBasemap` | 切换底图 |
| `screenshot` | 截取地图图片 |
| ... | 共 58 个工具 |

完整工具列表参见 [API 文档](../../docs/api/runtime.md)

## 故障排除

### 问题：Agent 返回"无浏览器连接"

**原因**：WebSocket session 不匹配

**解决**：
1. 确保 CesiumJS 页面连接时使用 `session=default`
2. 或设置环境变量 `DEFAULT_SESSION_ID=demo`

### 问题：Docker 容器无法访问 MCP 服务

**原因**：防火墙阻止或网络配置错误

**解决**：
1. 添加防火墙规则（见上文）
2. 验证连接：
   ```bash
   docker exec -it dify-plugin_daemon-1 curl -X POST http://host.docker.internal:3211/mcp
   ```
   应返回 JSON 错误而非连接拒绝

### 问题：LLM 不调用工具

**原因**：模型不支持 Function Calling 或提示词不足

**解决**：
1. 使用支持工具调用的模型（qwen3:8b+, gpt-4, claude-3）
2. 检查 Agent 节点是否正确绑定了 MCP 工具集

## 参考

- [Cesium MCP Runtime 文档](../../docs/api/runtime.md)
- [Dify 官方文档](https://docs.dify.ai/zh)
- [MCP SSE Agent 插件](https://github.com/junjiem/mcp_sse_agent)
