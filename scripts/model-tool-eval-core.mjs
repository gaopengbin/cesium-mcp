export function toFunctionTools(contracts) {
  return contracts.map(contract => ({
    type: 'function',
    function: {
      name: contract.name,
      description: contract.description,
      parameters: contract.inputSchema,
    },
  }))
}

export async function runModelToolScenario(options) {
  const {
    scenario,
    contracts,
    systemPrompt,
    callCompletion,
    validateInput,
    createToolResult = defaultToolResult,
    maxRounds = 4,
  } = options
  const selectedNames = new Set(contracts.map(contract => contract.name))
  const allowedNames = new Set(scenario.allowedTools || scenario.requiredTools)
  const validRequiredNames = new Set()
  const calledTools = []
  const invalidToolCalls = []
  const unexpectedTools = new Set()
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: scenario.prompt },
  ]
  const usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  }
  let rounds = 0
  let validToolCalls = 0
  let lastText = ''

  for (let round = 0; round < maxRounds; round += 1) {
    rounds += 1
    const response = await callCompletion({
      messages: structuredClone(messages),
      tools: toFunctionTools(contracts),
      round: round + 1,
      scenario,
    })
    addUsage(usage, response?.usage)

    const choice = response?.choices?.[0]
    if (!choice?.message || typeof choice.message !== 'object') {
      throw new Error('Provider response did not contain choices[0].message')
    }

    const message = choice.message
    messages.push(normalizeAssistantMessage(message))
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
    if (toolCalls.length === 0) {
      lastText = typeof message.content === 'string' ? message.content : ''
      break
    }

    for (let index = 0; index < toolCalls.length; index += 1) {
      const toolCall = toolCalls[index]
      const id = typeof toolCall?.id === 'string'
        ? toolCall.id
        : `eval-${round + 1}-${index + 1}`
      const name = typeof toolCall?.function?.name === 'string'
        ? toolCall.function.name
        : ''
      const parsed = parseArguments(toolCall?.function?.arguments)
      const issues = []

      calledTools.push(name || '<missing>')
      if (!allowedNames.has(name)) unexpectedTools.add(name || '<missing>')
      if (!name) issues.push('missing function name')
      if (!selectedNames.has(name)) issues.push('tool was not in the selected tool set')
      if (!parsed.valid) issues.push(parsed.error)

      let validation
      if (issues.length === 0) {
        validation = validateInput(name, parsed.value)
        if (validation?.knownTool === false) issues.push('tool is not in the canonical contract inventory')
        if (validation?.valid === false) {
          const validationIssues = (validation.issues || []).map(issue => (
            `${issue.path || '$'} ${issue.message || 'is invalid'}`
          ))
          issues.push(...(validationIssues.length > 0 ? validationIssues : ['arguments failed schema validation']))
        }
      }

      const valid = issues.length === 0
      if (valid) {
        validToolCalls += 1
        if (scenario.requiredTools.includes(name)) validRequiredNames.add(name)
      } else {
        invalidToolCalls.push({
          name: name || '<missing>',
          arguments: toolCall?.function?.arguments,
          issues,
        })
      }

      const result = valid
        ? await createToolResult(name, parsed.value, scenario)
        : { success: false, error: issues.join('; ') }
      messages.push({
        role: 'tool',
        tool_call_id: id,
        content: JSON.stringify(result),
      })
    }

    if (scenario.requiredTools.every(name => validRequiredNames.has(name))) break
  }

  const routingMissingTools = scenario.requiredTools.filter(name => !selectedNames.has(name))
  const missingRequiredTools = scenario.requiredTools.filter(name => !validRequiredNames.has(name))

  return {
    id: scenario.id,
    locale: scenario.locale,
    prompt: scenario.prompt,
    passed: routingMissingTools.length === 0 && missingRequiredTools.length === 0,
    requiredTools: [...scenario.requiredTools],
    validRequiredTools: [...validRequiredNames],
    missingRequiredTools,
    routingMissingTools,
    selectedToolCount: contracts.length,
    selectedTools: contracts.map(contract => contract.name),
    calledTools,
    unexpectedTools: [...unexpectedTools],
    unexpectedToolCalls: calledTools.filter(name => !allowedNames.has(name)).length,
    invalidToolCalls,
    toolCalls: calledTools.length,
    validToolCalls,
    noToolResponse: calledTools.length === 0,
    rounds,
    lastText,
    usage,
  }
}

export function summarizeModelToolEval(results) {
  const scenarios = results.length
  const passedScenarios = results.filter(result => result.passed).length
  const requiredTools = sum(results, result => result.requiredTools.length)
  const validRequiredTools = sum(results, result => result.validRequiredTools.length)
  const toolCalls = sum(results, result => result.toolCalls)
  const validToolCalls = sum(results, result => result.validToolCalls)
  const unexpectedToolCalls = sum(results, result => result.unexpectedToolCalls)
  const routingRequiredTools = requiredTools
  const routingAvailableTools = routingRequiredTools
    - sum(results, result => result.routingMissingTools.length)

  return {
    scenarios,
    passedScenarios,
    scenarioPassRate: ratio(passedScenarios, scenarios),
    requiredToolRecall: ratio(validRequiredTools, requiredTools),
    argumentValidityRate: ratio(validToolCalls, toolCalls),
    unexpectedToolCallRate: ratio(unexpectedToolCalls, toolCalls),
    noToolResponseRate: ratio(
      results.filter(result => result.noToolResponse).length,
      scenarios,
    ),
    providerErrorRate: ratio(
      results.filter(result => result.providerError).length,
      scenarios,
    ),
    routingRequiredToolRecall: ratio(routingAvailableTools, routingRequiredTools),
    averageToolsSent: average(results, result => result.selectedToolCount),
    averageRounds: average(results, result => result.rounds),
    averageToolCalls: average(results, result => result.toolCalls),
    totalToolCalls: toolCalls,
    validToolCalls,
    promptTokens: sum(results, result => result.usage?.promptTokens || 0),
    completionTokens: sum(results, result => result.usage?.completionTokens || 0),
    totalTokens: sum(results, result => result.usage?.totalTokens || 0),
  }
}

function normalizeAssistantMessage(message) {
  return {
    role: 'assistant',
    content: typeof message.content === 'string' ? message.content : null,
    ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls } : {}),
  }
}

function parseArguments(value) {
  if (typeof value !== 'string') {
    return { valid: false, value: {}, error: 'arguments must be a JSON string' }
  }
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, value: {}, error: 'arguments must decode to an object' }
    }
    return { valid: true, value: parsed, error: '' }
  } catch (error) {
    return { valid: false, value: {}, error: `arguments are not valid JSON: ${error.message}` }
  }
}

function defaultToolResult(name) {
  return {
    success: true,
    message: `${name} completed in the evaluation harness`,
  }
}

function addUsage(target, source) {
  if (!source || typeof source !== 'object') return
  const promptTokens = numberFrom(source.prompt_tokens, source.input_tokens)
  const completionTokens = numberFrom(source.completion_tokens, source.output_tokens)
  const totalTokens = numberFrom(source.total_tokens, promptTokens + completionTokens)
  target.promptTokens += promptTokens
  target.completionTokens += completionTokens
  target.totalTokens += totalTokens
}

function numberFrom(...values) {
  const value = values.find(candidate => Number.isFinite(Number(candidate)))
  return value === undefined ? 0 : Number(value)
}

function sum(items, read) {
  return items.reduce((total, item) => total + read(item), 0)
}

function average(items, read) {
  return ratio(sum(items, read), items.length)
}

function ratio(numerator, denominator) {
  if (denominator === 0) return 0
  return numerator / denominator
}
