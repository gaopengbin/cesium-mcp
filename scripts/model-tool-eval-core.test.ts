import { describe, expect, it, vi } from 'vitest'

import {
  runModelToolScenario,
  summarizeModelToolEval,
  toFunctionTools,
} from './model-tool-eval-core.mjs'

const contracts = [
  {
    name: 'geocode',
    description: 'Resolve a place name.',
    inputSchema: {
      type: 'object',
      properties: { address: { type: 'string' } },
      required: ['address'],
      additionalProperties: false,
    },
  },
  {
    name: 'addMarker',
    description: 'Add a marker.',
    inputSchema: {
      type: 'object',
      properties: {
        longitude: { type: 'number' },
        latitude: { type: 'number' },
      },
      required: ['longitude', 'latitude'],
      additionalProperties: false,
    },
  },
]

function choice(name?: string, args: Record<string, unknown> = {}) {
  return {
    choices: [{
      finish_reason: name ? 'tool_calls' : 'stop',
      message: name
        ? {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: `call-${name}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            }],
          }
        : { role: 'assistant', content: 'Done.' },
    }],
  }
}

function validateInput(name: string, input: unknown) {
  if (name === 'geocode') {
    return { knownTool: true, valid: typeof (input as any)?.address === 'string', issues: [] }
  }
  if (name === 'addMarker') {
    const args = input as any
    return {
      knownTool: true,
      valid: typeof args?.longitude === 'number' && typeof args?.latitude === 'number',
      issues: [],
    }
  }
  return { knownTool: false, valid: true, issues: [] }
}

describe('model tool evaluation core', () => {
  it('converts canonical contracts to OpenAI-compatible tools', () => {
    expect(toFunctionTools(contracts)).toEqual([
      {
        type: 'function',
        function: {
          name: 'geocode',
          description: 'Resolve a place name.',
          parameters: contracts[0].inputSchema,
        },
      },
      {
        type: 'function',
        function: {
          name: 'addMarker',
          description: 'Add a marker.',
          parameters: contracts[1].inputSchema,
        },
      },
    ])
  })

  it('scores a sequential multi-turn tool workflow', async () => {
    const callCompletion = vi.fn()
      .mockResolvedValueOnce(choice('geocode', { address: 'Forbidden City' }))
      .mockResolvedValueOnce(choice('addMarker', { longitude: 116.397, latitude: 39.916 }))

    const result = await runModelToolScenario({
      scenario: {
        id: 'geocode-marker',
        locale: 'en',
        prompt: 'Find the Forbidden City and add a marker there.',
        requiredTools: ['geocode', 'addMarker'],
      },
      contracts,
      systemPrompt: 'Use tools.',
      callCompletion,
      validateInput,
      createToolResult: name => name === 'geocode'
        ? { success: true, longitude: 116.397, latitude: 39.916 }
        : { success: true, data: { entityId: 'eval-marker' } },
    })

    expect(result.passed).toBe(true)
    expect(result.rounds).toBe(2)
    expect(result.calledTools).toEqual(['geocode', 'addMarker'])
    expect(result.missingRequiredTools).toEqual([])
    expect(callCompletion.mock.calls[1][0].messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'tool', tool_call_id: 'call-geocode' }),
    ]))
  })

  it('allows a corrected call while retaining argument-validity evidence', async () => {
    const callCompletion = vi.fn()
      .mockResolvedValueOnce(choice('addMarker', { longitude: 116.397 }))
      .mockResolvedValueOnce(choice('addMarker', { longitude: 116.397, latitude: 39.916 }))

    const result = await runModelToolScenario({
      scenario: {
        id: 'marker-retry',
        locale: 'en',
        prompt: 'Add a marker.',
        requiredTools: ['addMarker'],
      },
      contracts,
      systemPrompt: 'Use tools.',
      callCompletion,
      validateInput,
    })

    expect(result.passed).toBe(true)
    expect(result.invalidToolCalls).toHaveLength(1)
    expect(result.validToolCalls).toBe(1)
    expect(result.toolCalls).toBe(2)
  })

  it('fails a scenario that answers without required tool calls', async () => {
    const result = await runModelToolScenario({
      scenario: {
        id: 'no-tool',
        locale: 'en',
        prompt: 'Add a marker.',
        requiredTools: ['addMarker'],
      },
      contracts,
      systemPrompt: 'Use tools.',
      callCompletion: async () => choice(),
      validateInput,
    })

    expect(result.passed).toBe(false)
    expect(result.noToolResponse).toBe(true)
    expect(result.missingRequiredTools).toEqual(['addMarker'])
  })

  it('summarizes model choice separately from routing coverage', () => {
    const summary = summarizeModelToolEval([
      {
        passed: true,
        requiredTools: ['geocode', 'addMarker'],
        validRequiredTools: ['geocode', 'addMarker'],
        toolCalls: 2,
        validToolCalls: 2,
        unexpectedToolCalls: 0,
        noToolResponse: false,
        selectedToolCount: 16,
        rounds: 2,
        routingMissingTools: [],
      },
      {
        passed: false,
        requiredTools: ['screenshot'],
        validRequiredTools: [],
        toolCalls: 1,
        validToolCalls: 0,
        unexpectedToolCalls: 1,
        noToolResponse: false,
        selectedToolCount: 12,
        rounds: 1,
        routingMissingTools: [],
      },
    ])

    expect(summary).toMatchObject({
      scenarios: 2,
      scenarioPassRate: 0.5,
      requiredToolRecall: 2 / 3,
      argumentValidityRate: 2 / 3,
      unexpectedToolCallRate: 1 / 3,
      routingRequiredToolRecall: 1,
      averageToolsSent: 14,
    })
  })
})
