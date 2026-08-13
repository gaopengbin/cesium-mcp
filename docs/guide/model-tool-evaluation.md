# Model Tool Evaluation

Cesium MCP measures two different parts of tool selection independently:

1. **Deterministic routing** checks whether the required canonical tools are included in the model's bounded tool context.
2. **Live model evaluation** checks whether a specific model actually chooses those tools, produces schema-valid arguments, and completes dependent multi-turn work.

Keeping these scores separate makes a failure diagnosable. A routing miss is not blamed on the model, and a model-choice failure is not hidden by perfect routing coverage.

## Deterministic baseline

```bash
npm run test:routing
```

The baseline contains 30 English, Chinese, and multi-intent cases across all 12 browser toolsets. It makes no network requests and enforces the 20-tool automatic-routing budget.

## Model evaluation preflight

```bash
npm run eval:model-tools
```

This command builds the canonical contracts and checks all executable evaluation prompts against the router. It does not contact a model unless `--live` is supplied.

The 15 executable scenarios contain concrete coordinates, URLs, styles, and GeoJSON. They cover all 12 toolsets plus dependent flows such as `geocode` followed by `addMarker` and `createAnimation` followed by `trackEntity`.

## Workers AI

The hosted demo currently uses Cloudflare's function-calling `@cf/zai-org/glm-4.7-flash` model. Run a small real sample through the same `/api/chat` path:

```bash
npm run eval:model-tools -- --provider workers-ai --live --limit 6
```

Increase the scope explicitly and optionally write the full report to the ignored `work-logs` directory:

```bash
npm run eval:model-tools -- --provider workers-ai --live --limit 15 --max-requests 30 --output work-logs/model-tool-eval-workers-ai.json
```

Model output is probabilistic. Use repeated runs before treating a score as a stable baseline:

```bash
npm run eval:model-tools -- --provider workers-ai --live --limit 15 --repeats 3 --max-requests 90
```

The runner checks `/api/usage` before starting, stops if the hosted budget is paused, spaces requests to stay below the demo's per-minute guard, and applies a hard per-process request cap. A public demo run consumes the shared hosted allowance, so use a small limit for routine checks.

See Cloudflare's [GLM-4.7-Flash model card](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/) and [function-calling guide](https://developers.cloudflare.com/workers-ai/features/function-calling/).

## DeepSeek

Set the API key in the process environment; the runner never writes or prints it. The default model is the current tool-capable `deepseek-v4-flash` in non-thinking mode.

```powershell
$env:DEEPSEEK_API_KEY = 'your-key'
npm run eval:model-tools -- --provider deepseek --live --limit 15 --output work-logs/model-tool-eval-deepseek.json
Remove-Item Env:DEEPSEEK_API_KEY
```

The adapter uses DeepSeek's OpenAI-format `/chat/completions` API. See the official [Chat Completion API](https://api-docs.deepseek.com/api/create-chat-completion/) and [model information](https://api-docs.deepseek.com/quick_start/pricing/).

## Other OpenAI-compatible providers

```powershell
$env:MODEL_EVAL_API_KEY = 'your-key'
npm run eval:model-tools -- --provider openai --live `
  --endpoint https://provider.example/v1/chat/completions `
  --model tool-capable-model `
  --limit 6
Remove-Item Env:MODEL_EVAL_API_KEY
```

Use a model that supports OpenAI-format `tools`, assistant `tool_calls`, and `tool` result messages.

## Metrics

| Metric | Meaning |
|---|---|
| `scenarioPassRate` | Scenarios in which every required tool was called successfully |
| `requiredToolRecall` | Required tools reached by at least one schema-valid call |
| `argumentValidityRate` | All emitted calls whose JSON arguments passed the canonical contract |
| `unexpectedToolCallRate` | Calls outside the scenario's expected tool set |
| `noToolResponseRate` | Action requests that produced no tool call |
| `providerErrorRate` | Scenarios interrupted by endpoint, timeout, or request-budget errors |
| `routingRequiredToolRecall` | Required tools made available before the model was called |
| `averageToolsSent` | Average tool-context size after deterministic routing |
| `averageRounds` | Average provider turns used by a scenario |

Tool execution is simulated with small deterministic results. This isolates model selection and argument quality from browser rendering. Real Viewer behavior remains covered by the packed Runtime-WebSocket-Bridge E2E test and browser UI checks.

## Useful options

```text
--case id1,id2       Run named scenarios
--repeats N          Repeat each selected scenario
--max-rounds N       Limit multi-turn recursion
--max-requests N     Hard network request cap
--delay-ms N         Minimum delay between requests
--timeout-ms N       Per-request timeout
--output PATH        Save the full JSON report
```
