import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

const context: Record<string, any> = {}
context.globalThis = context
runInNewContext(
  readFileSync(new URL('./agent-response.js', import.meta.url), 'utf8'),
  context,
)

const responseGuard = context.CesiumAgentResponse

describe('browser-agent response guard', () => {
  it('rejects completions stopped by the output token limit', () => {
    expect(responseGuard.inspectAssistantChoice({
      finish_reason: 'length',
      message: { role: 'assistant', content: '{"partial":' },
    })).toEqual({ valid: false, reason: 'truncated' })
  })

  it('rejects tool markup emitted as ordinary assistant text', () => {
    expect(responseGuard.inspectAssistantChoice({
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: '<tool_call>loadCzml<arg_key>data</arg_key>',
      },
    })).toEqual({ valid: false, reason: 'leaked_tool_markup' })
  })

  it('rejects malformed structured tool arguments before execution', () => {
    expect(responseGuard.inspectAssistantChoice({
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        tool_calls: [{
          id: 'call-1',
          function: { name: 'loadCzml', arguments: '{"data":' },
        }],
      },
    })).toEqual({ valid: false, reason: 'malformed_tool_call' })
  })

  it('accepts complete structured tool calls and normal text', () => {
    expect(responseGuard.inspectAssistantChoice({
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        tool_calls: [{
          id: 'call-1',
          function: { name: 'addPolyline', arguments: '{"coordinates":[[116,39],[121,31]]}' },
        }],
      },
    })).toEqual({ valid: true, reason: null })

    expect(responseGuard.inspectAssistantChoice({
      finish_reason: 'stop',
      message: { role: 'assistant', content: 'Done.' },
    })).toEqual({ valid: true, reason: null })
  })

  it('requests decomposition instead of executing oversized inline CZML', () => {
    const data = 'x'.repeat(responseGuard.MAX_INLINE_CZML_ARGUMENT_CHARS)

    expect(responseGuard.inspectAssistantChoice({
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        tool_calls: [{
          id: 'call-large',
          function: { name: 'loadCzml', arguments: JSON.stringify({ data }) },
        }],
      },
    })).toEqual({ valid: false, reason: 'oversized_inline_czml' })
  })

  it('builds a compact retry instruction that avoids inline CZML', () => {
    const prompt = responseGuard.createRecoveryPrompt('zh-CN', 'truncated')

    expect(prompt).toContain('结构化工具调用')
    expect(prompt).toContain('不要生成大段内联 CZML')
    expect(prompt).toContain('拆分')
  })

  it('retries once without retaining the invalid assistant response', async () => {
    const prompts: string[] = []
    const responses = [
      {
        choices: [{
          finish_reason: 'length',
          message: { role: 'assistant', content: '<tool_call>loadCzml' },
        }],
      },
      {
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            tool_calls: [{
              id: 'call-2',
              function: { name: 'addPolyline', arguments: '{"coordinates":[[116,39],[121,31]]}' },
            }],
          },
        }],
      },
    ]

    const choice = await responseGuard.requestValidChoice((prompt: string) => {
      prompts.push(prompt)
      return responses.shift()
    }, { locale: 'zh-CN', maxRetries: 1 })

    expect(choice.message.tool_calls[0].function.name).toBe('addPolyline')
    expect(prompts[0]).toBe('')
    expect(prompts[1]).toContain('不要生成大段内联 CZML')
  })

  it('fails safely after the retry is also incomplete', async () => {
    const invalidResponse = {
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '<tool_call>loadCzml' },
      }],
    }

    await expect(responseGuard.requestValidChoice(
      () => invalidResponse,
      { locale: 'en', maxRetries: 1 },
    )).rejects.toMatchObject({
      code: 'INCOMPLETE_TOOL_RESPONSE',
      reason: 'leaked_tool_markup',
    })
  })
})
