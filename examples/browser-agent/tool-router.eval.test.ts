import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'
import {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsetNames,
  cesiumBrowserToolsets,
  cesiumCoreToolContracts,
} from '../../packages/cesium-mcp-contracts/src/index.js'
import { toolRoutingEvalCases } from './tool-routing-eval-cases.js'

interface ToolRouterSelection {
  toolsetNames: string[]
  tools: Array<{ name: string }>
}

interface ToolRouter {
  MAX_AUTO_TOOLS: number
  resolveToolSelection: (
    prompt: string,
    mode: string,
    contracts: typeof contracts,
  ) => ToolRouterSelection
}

const context: Record<string, unknown> = {}
context.globalThis = context
context.URL = URL
runInNewContext(
  readFileSync(new URL('./tool-router.js', import.meta.url), 'utf8'),
  context,
)

const contracts = {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsets,
  cesiumCoreToolContracts,
}
const router = context.CesiumToolRouter as ToolRouter

const results = toolRoutingEvalCases.map((scenario) => {
  const selection = router.resolveToolSelection(scenario.prompt, 'auto', contracts)
  const selectedTools = new Set<string>(selection.tools.map((tool: { name: string }) => tool.name))
  const selectedToolsets = new Set<string>(selection.toolsetNames)
  const missingTools = scenario.requiredTools.filter(tool => !selectedTools.has(tool))
  const missingToolsets = scenario.expectedToolsets.filter(toolset => !selectedToolsets.has(toolset))

  return {
    ...scenario,
    missingTools,
    missingToolsets,
    selectedToolCount: selectedTools.size,
  }
})

describe('browser-agent tool routing evaluation', () => {
  it.each(results)('$id exposes the required toolsets and tools', (result) => {
    expect(result.missingToolsets, `${result.id} missing toolsets`).toEqual([])
    expect(result.missingTools, `${result.id} missing tools`).toEqual([])
    expect(result.selectedToolCount, `${result.id} exceeded the automatic tool budget`)
      .toBeLessThanOrEqual(router.MAX_AUTO_TOOLS)
  })

  it('covers every browser toolset in the bilingual scenario set', () => {
    const covered = new Set(toolRoutingEvalCases.flatMap(scenario => scenario.expectedToolsets))
    expect([...covered].sort()).toEqual([...cesiumBrowserToolsetNames].sort())
  })

  it('reports routing availability metrics', () => {
    const scenarioPasses = results.filter(result => (
      result.missingToolsets.length === 0
      && result.missingTools.length === 0
      && result.selectedToolCount <= router.MAX_AUTO_TOOLS
    )).length
    const requiredToolCount = results.reduce(
      (count, result) => count + result.requiredTools.length,
      0,
    )
    const missingToolCount = results.reduce(
      (count, result) => count + result.missingTools.length,
      0,
    )
    const averageToolCount = results.reduce(
      (count, result) => count + result.selectedToolCount,
      0,
    ) / results.length
    const maxToolCount = Math.max(...results.map(result => result.selectedToolCount))
    const routedToolsets = new Set(results.flatMap(result => (
      result.expectedToolsets.filter(toolset => !result.missingToolsets.includes(toolset))
    )))

    const summary = {
      scenarios: `${scenarioPasses}/${results.length}`,
      scenarioPassRate: scenarioPasses / results.length,
      requiredToolRecall: (requiredToolCount - missingToolCount) / requiredToolCount,
      toolsetCoverage: `${routedToolsets.size}/${cesiumBrowserToolsetNames.length}`,
      averageToolsSent: Number(averageToolCount.toFixed(1)),
      maxToolsSent: maxToolCount,
      toolBudget: router.MAX_AUTO_TOOLS,
    }

    console.info(`[routing-eval] ${JSON.stringify(summary)}`)
    expect(summary.scenarioPassRate).toBe(1)
    expect(summary.requiredToolRecall).toBe(1)
  })
})
