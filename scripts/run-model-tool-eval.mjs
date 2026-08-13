import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

import {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsets,
  cesiumCoreToolContracts,
  validateCesiumToolInput,
} from 'cesium-mcp-contracts'

import { modelToolEvalCases } from '../examples/browser-agent/model-tool-eval-cases.mjs'
import {
  runModelToolScenario,
  summarizeModelToolEval,
} from './model-tool-eval-core.mjs'

const WORKERS_AI_ENDPOINT = 'https://cesium-browser-agent.pages.dev/api/chat'
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-v4-flash'
const DEFAULT_MAX_REQUESTS = 24
const DEFAULT_MAX_ROUNDS = 4
const DEFAULT_TIMEOUT_MS = 90_000

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  printHelp()
  process.exit(0)
}
if (options.live && options.provider === 'openai' && (!options.endpoint || !options.model)) {
  throw new Error('OpenAI-compatible live evaluation requires both --endpoint and --model')
}

const router = await loadToolRouter()
const scenarios = selectScenarios(modelToolEvalCases, options)
if (scenarios.length === 0) throw new Error('No model evaluation scenarios matched the selection')

const prepared = scenarios.map((scenario) => {
  const selection = router.resolveToolSelection(scenario.prompt, 'auto', {
    cesiumBrowserToolContracts,
    cesiumBrowserToolsets,
    cesiumCoreToolContracts,
  })
  const selectedNames = new Set(selection.tools.map(tool => tool.name))
  return {
    scenario,
    selection,
    routingMissingTools: scenario.requiredTools.filter(name => !selectedNames.has(name)),
  }
})
const jobs = Array.from({ length: options.repeats }, (_, repetition) => (
  prepared.map(item => ({ ...item, repetition: repetition + 1 }))
)).flat()

printPreflight(prepared, router.MAX_AUTO_TOOLS, options.repeats)
if (!options.live) {
  console.log('\nPreflight only. Add --live to send model requests.')
  process.exit(prepared.some(item => item.routingMissingTools.length > 0) ? 1 : 0)
}

const provider = createProvider(options)
const usageBefore = options.provider === 'workers-ai'
  ? await readWorkersUsage(options.endpoint)
  : null
if (usageBefore?.state === 'paused') {
  throw new Error('Hosted Workers AI budget is paused; live evaluation was not started')
}
if (usageBefore) {
  console.log(`\nWorkers AI usage before run: ${usageBefore.percent}% (${usageBefore.state})`)
}

const results = []
for (const [index, item] of jobs.entries()) {
  const { scenario, selection, routingMissingTools, repetition } = item
  const runLabel = options.repeats > 1 ? ` run ${repetition}/${options.repeats}` : ''
  process.stdout.write(`[${index + 1}/${jobs.length}] ${scenario.id}${runLabel} ... `)
  if (routingMissingTools.length > 0) {
    const result = createFailedResult(scenario, selection.tools, {
      error: `router omitted: ${routingMissingTools.join(', ')}`,
      routingMissingTools,
    })
    results.push({ ...result, repetition })
    console.log('routing miss')
    continue
  }

  try {
    const result = await runModelToolScenario({
      scenario,
      contracts: selection.tools,
      systemPrompt: createSystemPrompt(scenario.locale, selection.toolsetNames),
      callCompletion: provider.callCompletion,
      validateInput: validateCesiumToolInput,
      createToolResult: createSyntheticToolResult,
      maxRounds: options.maxRounds,
    })
    results.push({ ...result, repetition })
    const status = result.passed ? 'pass' : 'fail'
    console.log(`${status} (${result.calledTools.join(' -> ') || 'no tool'})`)
  } catch (error) {
    results.push({ ...createFailedResult(scenario, selection.tools, {
      error: error.message,
      routingMissingTools,
    }), repetition })
    console.log(`provider error (${error.message})`)
  }
}

const summary = summarizeModelToolEval(results)
const report = {
  createdAt: new Date().toISOString(),
  provider: options.provider,
  model: provider.model,
  endpoint: provider.endpoint,
  requestCount: provider.requestCount(),
  usageBefore,
  options: {
    maxRounds: options.maxRounds,
    maxRequests: options.maxRequests,
    delayMs: options.delayMs,
    repeats: options.repeats,
    scenarioIds: scenarios.map(scenario => scenario.id),
  },
  summary,
  results,
}

console.log(`\n[model-tool-eval] ${JSON.stringify(summary)}`)
if (options.output) {
  const outputPath = resolve(options.output)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Report written to ${outputPath}`)
}

if (results.every(result => result.providerError)) process.exitCode = 1

function createProvider(config) {
  let requests = 0
  let lastRequestAt = 0
  let actualModel = config.model

  async function callCompletion(input) {
    if (requests >= config.maxRequests) {
      throw new Error(`live request budget exceeded (${config.maxRequests})`)
    }
    const waitMs = Math.max(0, config.delayMs - (Date.now() - lastRequestAt))
    if (waitMs > 0) await delay(waitMs)

    requests += 1
    lastRequestAt = Date.now()
    const body = createRequestBody(config, input)
    const headers = { 'Content-Type': 'application/json' }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
    const rawBody = await response.text()
    if (!response.ok) {
      throw new Error(`${config.provider} returned ${response.status}: ${rawBody.slice(0, 500)}`)
    }

    let data
    try {
      data = JSON.parse(rawBody)
    } catch {
      throw new Error(`${config.provider} returned invalid JSON`)
    }
    actualModel = response.headers.get('X-AI-Model') || data.model || actualModel
    return data
  }

  return {
    callCompletion,
    endpoint: config.endpoint,
    get model() {
      return actualModel
    },
    requestCount: () => requests,
  }
}

function createRequestBody(config, input) {
  const common = {
    messages: input.messages,
    tools: input.tools,
  }
  if (config.provider === 'workers-ai') return common

  return {
    ...common,
    model: config.model,
    tool_choice: 'auto',
    max_tokens: config.maxTokens,
    ...(config.provider === 'deepseek'
      ? { thinking: { type: 'disabled' }, user_id: 'cesium_mcp_model_eval' }
      : {}),
  }
}

function createSystemPrompt(locale, toolsetNames) {
  const scope = toolsetNames.join(', ')
  if (locale === 'zh-CN') {
    return `你是一个 CesiumJS 三维地球助手，通过控制浏览器中的实时 CesiumJS Viewer 帮助用户完成任务。

当用户要求操作地图时，必须使用提供的结构化工具完成任务；可以多轮调用工具。遇到地名时先使用 geocode，再把返回的坐标用于后续工具。不要在文本中输出工具 JSON，不要声称已完成未调用工具的操作。只使用用户明确给出的值、工具结果或 schema 中的默认值。

本轮已启用工具范围：${scope}。只根据当前提供的工具判断可执行能力。使用简体中文回复。`
  }

  return `You are a CesiumJS 3D globe assistant controlling a live CesiumJS viewer in the browser.

When the user asks for a map action, you must use the provided structured tools to complete it and may call tools across multiple turns. For place names, call geocode first and pass its returned coordinates to later tools. Never print tool JSON in text or claim an action completed without a tool call. Use only values supplied by the user, returned by tools, or defined as schema defaults.

Active tool scope for this turn: ${scope}. Judge executable capabilities only from the tools provided. Reply in English.`
}

function createSyntheticToolResult(name, args) {
  if (name === 'geocode') {
    return {
      success: true,
      longitude: 116.3972,
      latitude: 39.9163,
      displayName: args.address || 'Evaluation location',
    }
  }
  if (['addMarker', 'addPolyline', 'addPolygon', 'addRectangle', 'createAnimation', 'playTrajectory'].includes(name)) {
    return { success: true, data: { entityId: `eval-${name}` } }
  }
  if (name === 'addGeoJsonLayer') {
    return {
      success: true,
      data: { id: args.id || 'eval-layer', name: args.name || 'Evaluation layer', type: 'geojson', visible: true },
    }
  }
  if (name === 'load3dTiles') {
    return { success: true, data: { id: args.id || 'eval-tileset', type: '3d-tiles', visible: true } }
  }
  if (name === 'measure') {
    return { success: true, data: { mode: args.mode, value: 1234, unit: 'meters' } }
  }
  if (name === 'screenshot') {
    return { success: true, data: { dataUrl: 'data:image/png;base64,ZXZhbA==', width: 1280, height: 720 } }
  }
  return { success: true, message: `${name} completed in the evaluation harness` }
}

async function loadToolRouter() {
  const source = await readFile(new URL('../examples/browser-agent/tool-router.js', import.meta.url), 'utf8')
  const context = { URL }
  context.globalThis = context
  runInNewContext(source, context)
  return context.CesiumToolRouter
}

async function readWorkersUsage(chatEndpoint) {
  const usageEndpoint = new URL(chatEndpoint)
  usageEndpoint.pathname = usageEndpoint.pathname.replace(/\/api\/chat$/, '/api/usage')
  try {
    const response = await fetch(usageEndpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

function selectScenarios(allScenarios, config) {
  let selected = allScenarios
  if (config.caseIds.length > 0) {
    const requested = new Set(config.caseIds)
    selected = selected.filter(scenario => requested.has(scenario.id))
  }
  return selected.slice(0, config.limit)
}

function createFailedResult(scenario, tools, details) {
  return {
    id: scenario.id,
    locale: scenario.locale,
    prompt: scenario.prompt,
    passed: false,
    providerError: details.error,
    requiredTools: [...scenario.requiredTools],
    validRequiredTools: [],
    missingRequiredTools: [...scenario.requiredTools],
    routingMissingTools: details.routingMissingTools || [],
    selectedToolCount: tools.length,
    selectedTools: tools.map(tool => tool.name),
    calledTools: [],
    unexpectedTools: [],
    unexpectedToolCalls: 0,
    invalidToolCalls: [],
    toolCalls: 0,
    validToolCalls: 0,
    noToolResponse: true,
    rounds: 0,
    lastText: '',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  }
}

function printPreflight(items, toolBudget, repeats) {
  const repeatLabel = repeats > 1 ? `, ${repeats} live repetitions` : ''
  console.log(`Model tool evaluation preflight: ${items.length} scenarios, auto-routing budget ${toolBudget}${repeatLabel}`)
  for (const item of items) {
    const missing = item.routingMissingTools.length > 0
      ? ` missing=${item.routingMissingTools.join(',')}`
      : ''
    console.log(`- ${item.scenario.id}: ${item.selection.tools.length} tools [${item.selection.toolsetNames.join(', ')}]${missing}`)
  }
}

function parseArgs(args) {
  const values = new Map()
  const flags = new Set()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`)
    if (['--live', '--help'].includes(arg)) {
      flags.add(arg)
      continue
    }
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
    values.set(arg, value)
    index += 1
  }

  const provider = values.get('--provider') || 'workers-ai'
  if (!['workers-ai', 'deepseek', 'openai'].includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`)
  }
  const live = flags.has('--live')
  const apiKey = provider === 'deepseek'
    ? process.env.DEEPSEEK_API_KEY || process.env.MODEL_EVAL_API_KEY
    : process.env.MODEL_EVAL_API_KEY
  if (live && provider !== 'workers-ai' && !apiKey) {
    throw new Error(`${provider} live evaluation requires MODEL_EVAL_API_KEY${provider === 'deepseek' ? ' or DEEPSEEK_API_KEY' : ''}`)
  }

  return {
    help: flags.has('--help'),
    live,
    provider,
    apiKey,
    endpoint: values.get('--endpoint') || (
      provider === 'workers-ai' ? WORKERS_AI_ENDPOINT : provider === 'deepseek' ? DEEPSEEK_ENDPOINT : ''
    ),
    model: values.get('--model') || (provider === 'deepseek' ? DEEPSEEK_MODEL : process.env.MODEL_EVAL_MODEL || ''),
    caseIds: (values.get('--case') || '').split(',').filter(Boolean),
    limit: readPositiveInteger(values.get('--limit'), live ? 6 : modelToolEvalCases.length, '--limit'),
    maxRounds: readPositiveInteger(values.get('--max-rounds'), DEFAULT_MAX_ROUNDS, '--max-rounds'),
    repeats: readPositiveInteger(values.get('--repeats'), 1, '--repeats'),
    maxRequests: readPositiveInteger(values.get('--max-requests'), DEFAULT_MAX_REQUESTS, '--max-requests'),
    maxTokens: readPositiveInteger(values.get('--max-tokens'), 1024, '--max-tokens'),
    delayMs: readNonNegativeInteger(
      values.get('--delay-ms'),
      provider === 'workers-ai' ? 2200 : 0,
      '--delay-ms',
    ),
    timeoutMs: readPositiveInteger(values.get('--timeout-ms'), DEFAULT_TIMEOUT_MS, '--timeout-ms'),
    output: values.get('--output') || '',
  }
}

function readPositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}

function readNonNegativeInteger(value, fallback, name) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`)
  return parsed
}

function delay(milliseconds) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))
}

function printHelp() {
  console.log(`Usage: npm run eval:model-tools -- [options]

Runs a provider-specific tool-choice evaluation after deterministic tool routing.
Without --live, the command performs routing preflight only and sends no model requests.

Options:
  --provider workers-ai|deepseek|openai  Provider adapter (default: workers-ai)
  --live                                 Allow real model requests
  --limit N                              Evaluate the first N selected scenarios
  --case id1,id2                         Evaluate named scenarios only
  --max-rounds N                         Maximum model turns per scenario (default: 4)
  --repeats N                            Repeat every selected scenario N times (default: 1)
  --max-requests N                       Hard cap for this process (default: 24)
  --delay-ms N                           Minimum delay between requests
  --endpoint URL                         Override the chat-completions endpoint
  --model NAME                           Model for DeepSeek/OpenAI-compatible APIs
  --max-tokens N                         Completion cap for external APIs (default: 1024)
  --timeout-ms N                         Per-request timeout (default: 90000)
  --output PATH                          Write the full JSON report
  --help                                 Show this help

Environment:
  DEEPSEEK_API_KEY                       DeepSeek credential
  MODEL_EVAL_API_KEY                     Generic OpenAI-compatible credential
  MODEL_EVAL_MODEL                       Generic OpenAI-compatible model name`)
}
