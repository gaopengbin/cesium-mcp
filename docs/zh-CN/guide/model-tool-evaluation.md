# 模型工具评测

Cesium MCP 将工具选择拆成两层独立评测：

1. **确定性路由**：检查有限的模型工具上下文中是否包含所需的规范工具。
2. **真实模型评测**：检查指定模型是否真正选对工具、生成符合 schema 的参数，并完成有依赖关系的多轮任务。

分开统计后，问题更容易定位：路由遗漏不会归咎于模型，模型选错工具也不会被完美的路由覆盖率掩盖。

## Provider Schema 兼容门禁

在评测模型是否选对工具前，先验证各类 Provider 能否接受发布的工具 Schema：

```bash
npm run test:schema-compat
```

门禁会审计全部 61 个浏览器安全工具在四个对外入口中的最终结构：规范 Contracts、MCP Runtime 元数据、WebMCP 注册对象，以及 OpenAI 格式的 Function Calling 定义。规则来自 VS Code 与 Azure/OpenAI 的真实兼容问题：

- 输入 Schema 根级必须是 `type: "object"`
- 根级不能出现 `oneOf`、`anyOf` 或 `allOf`
- 所有数组必须声明 `items`，包括同时使用 `prefixItems` 的坐标元组
- 对外 Schema 不能携带 `$schema` 元 Schema 指针
- Schema 必须可以 JSON 序列化

失败信息会给出入口、工具名称、受影响 Provider、规则和准确的 JSON Schema 路径。该测试同时纳入 `npm run test:contracts` 和全量 Vitest CI。

## 确定性基线

```bash
npm run test:routing
```

基线包含 30 条英文、中文和多意图场景，覆盖全部 12 个浏览器工具集，不访问网络，并强制自动路由不超过 20 个工具。

## 模型评测预检

```bash
npm run eval:model-tools
```

该命令会构建规范契约，并检查所有可执行评测提示词的路由结果。除非显式添加 `--live`，否则不会请求任何模型。

15 条可执行场景提供了明确的坐标、URL、样式和 GeoJSON，覆盖全部 12 个工具集，也包含 `geocode` 后调用 `addMarker`、`createAnimation` 后调用 `trackEntity` 等有依赖关系的流程。

## Workers AI

在线演示当前使用 Cloudflare 支持函数调用的 `@cf/zai-org/glm-4.7-flash`。通过相同的 `/api/chat` 路径运行一组小规模真实评测：

```bash
npm run eval:model-tools -- --provider workers-ai --live --limit 6
```

需要完整范围时显式提高数量，并可把详细报告保存到已忽略的 `work-logs` 目录：

```bash
npm run eval:model-tools -- --provider workers-ai --live --limit 15 --max-requests 30 --output work-logs/model-tool-eval-workers-ai.json
```

模型输出具有随机性。在把分数作为稳定基线前，应重复运行：

```bash
npm run eval:model-tools -- --provider workers-ai --live --limit 15 --repeats 3 --max-requests 90
```

运行器会在开始前查询 `/api/usage`，在线额度暂停时拒绝启动；请求间隔会避开演示站的分钟限速，并受单进程硬上限保护。公开演示使用共享额度，日常检查应保持较小的 `limit`。

参考 Cloudflare 官方的 [GLM-4.7-Flash 模型说明](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/)和[函数调用指南](https://developers.cloudflare.com/workers-ai/features/function-calling/)。

## DeepSeek

在进程环境变量中设置 API Key；运行器不会保存或打印它。默认使用当前支持工具调用的 `deepseek-v4-flash`，并关闭思考模式以降低评测波动和开销。

```powershell
$env:DEEPSEEK_API_KEY = 'your-key'
npm run eval:model-tools -- --provider deepseek --live --limit 15 --output work-logs/model-tool-eval-deepseek.json
Remove-Item Env:DEEPSEEK_API_KEY
```

适配器使用 DeepSeek 的 OpenAI 格式 `/chat/completions` 接口。参考官方[对话补全 API](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)和[模型信息](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)。

## 其他 OpenAI 兼容服务

```powershell
$env:MODEL_EVAL_API_KEY = 'your-key'
npm run eval:model-tools -- --provider openai --live `
  --endpoint https://provider.example/v1/chat/completions `
  --model tool-capable-model `
  --limit 6
Remove-Item Env:MODEL_EVAL_API_KEY
```

目标模型需要支持 OpenAI 格式的 `tools`、助手 `tool_calls` 和 `tool` 结果消息。

## 指标

| 指标 | 含义 |
|---|---|
| `scenarioPassRate` | 成功调用全部必需工具的场景比例 |
| `requiredToolRecall` | 至少有一次参数合法调用的必需工具比例 |
| `argumentValidityRate` | 所有模型工具调用中，通过规范契约校验的比例 |
| `unexpectedToolCallRate` | 超出场景预期工具集合的调用比例 |
| `noToolResponseRate` | 操作请求完全没有产生工具调用的比例 |
| `providerErrorRate` | 因端点、超时或请求预算错误而中断的场景比例 |
| `routingRequiredToolRecall` | 调用模型前已进入上下文的必需工具比例 |
| `averageToolsSent` | 确定性路由后发送给模型的平均工具数 |
| `averageRounds` | 每条场景平均使用的模型轮数 |

评测器使用小型确定性结果模拟工具执行，只衡量模型选工具和生成参数的质量，不混入浏览器渲染差异。真实 Viewer 行为继续由打包后的 Runtime-WebSocket-Bridge E2E 和浏览器 UI 检查覆盖。

## 常用参数

```text
--case id1,id2       只运行指定场景
--repeats N          重复运行每个选中场景
--max-rounds N       限制多轮递归次数
--max-requests N     限制本进程的网络请求总数
--delay-ms N         设置两次请求的最小间隔
--timeout-ms N       设置单次请求超时
--output PATH        保存完整 JSON 报告
```
