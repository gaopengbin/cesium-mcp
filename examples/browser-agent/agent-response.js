(function attachCesiumAgentResponse(global) {
  const TRUNCATED_FINISH_REASONS = new Set(['length', 'max_tokens'])
  const TOOL_MARKUP_PATTERN = /<\s*\/?\s*(?:tool_call|arg_key|arg_value|function)\b/i
  const MAX_INLINE_CZML_ARGUMENT_CHARS = 6000

  function inspectAssistantChoice(choice) {
    if (!choice || typeof choice !== 'object' || !choice.message) {
      return invalid('missing_message')
    }

    if (TRUNCATED_FINISH_REASONS.has(choice.finish_reason)) {
      return invalid('truncated')
    }

    const message = choice.message
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const issue = inspectToolCall(toolCall)
        if (issue) return invalid(issue)
      }
      return valid()
    }

    if (typeof message.content === 'string' && TOOL_MARKUP_PATTERN.test(message.content)) {
      return invalid('leaked_tool_markup')
    }

    if (typeof message.content !== 'string' || message.content.trim().length === 0) {
      return invalid('empty_message')
    }

    return valid()
  }

  function inspectToolCall(toolCall) {
    if (!toolCall || typeof toolCall !== 'object') return 'malformed_tool_call'
    if (!toolCall.function || typeof toolCall.function.name !== 'string') return 'malformed_tool_call'
    if (toolCall.function.name.trim().length === 0) return 'malformed_tool_call'
    if (typeof toolCall.function.arguments !== 'string') return 'malformed_tool_call'

    try {
      const args = JSON.parse(toolCall.function.arguments)
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        return 'malformed_tool_call'
      }
      if (
        toolCall.function.name === 'loadCzml'
        && Object.hasOwn(args, 'data')
        && toolCall.function.arguments.length > MAX_INLINE_CZML_ARGUMENT_CHARS
      ) {
        return 'oversized_inline_czml'
      }
      return null
    } catch {
      return 'malformed_tool_call'
    }
  }

  function createRecoveryPrompt(locale, reason) {
    if (locale === 'zh-CN') {
      return `上一次回复不完整（${reason}）。请重新完成当前请求：只使用 API 的结构化工具调用，不要在文本中输出 <tool_call>、XML 或工具 JSON。保持参数紧凑，不要生成大段内联 CZML；优先使用 addPolyline、addLabel 等原子工具或加载已有 URL。内容较多时拆分为多个较小的工具调用。`
    }

    return `The previous completion was invalid (${reason}). Retry the current request using only structured API tool calls. Do not print <tool_call>, XML, or tool JSON as text. Keep arguments compact and never generate large inline CZML; prefer atomic tools such as addPolyline and addLabel, or load an existing URL. Split large work into multiple smaller tool calls.`
  }

  async function requestValidChoice(callCompletion, options = {}) {
    const locale = options.locale || 'en'
    const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 1
    let recoveryPrompt = ''
    let lastReason = 'missing_message'

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const response = await callCompletion(recoveryPrompt)
      const choice = response?.choices?.[0]
      const inspection = inspectAssistantChoice(choice)
      if (inspection.valid) return choice

      lastReason = inspection.reason
      options.onInvalid?.({ attempt, reason: lastReason })
      recoveryPrompt = createRecoveryPrompt(locale, lastReason)
    }

    const error = new Error(`Incomplete assistant tool response: ${lastReason}`)
    error.code = 'INCOMPLETE_TOOL_RESPONSE'
    error.reason = lastReason
    throw error
  }

  function valid() {
    return { valid: true, reason: null }
  }

  function invalid(reason) {
    return { valid: false, reason }
  }

  global.CesiumAgentResponse = Object.freeze({
    MAX_INLINE_CZML_ARGUMENT_CHARS,
    createRecoveryPrompt,
    inspectAssistantChoice,
    requestValidChoice,
  })
})(globalThis)
