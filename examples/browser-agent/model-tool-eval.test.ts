import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'
import {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsetNames,
  cesiumBrowserToolsets,
  cesiumCoreToolContracts,
} from '../../packages/cesium-mcp-contracts/src/index.js'
import { modelToolEvalCases } from './model-tool-eval-cases.mjs'

const context: Record<string, unknown> = { URL }
context.globalThis = context
runInNewContext(
  readFileSync(new URL('./tool-router.js', import.meta.url), 'utf8'),
  context,
)

const router = context.CesiumToolRouter as {
  MAX_AUTO_TOOLS: number
  resolveToolSelection: (
    prompt: string,
    mode: string,
    contracts: typeof contracts,
  ) => { toolsetNames: string[], tools: Array<{ name: string }> }
}
const contracts = {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsets,
  cesiumCoreToolContracts,
}

describe('model tool evaluation scenarios', () => {
  it.each(modelToolEvalCases)('$id routes every required tool within budget', (scenario) => {
    const selection = router.resolveToolSelection(scenario.prompt, 'auto', contracts)
    const selectedNames = new Set(selection.tools.map(tool => tool.name))

    expect(
      scenario.requiredTools.filter(name => !selectedNames.has(name)),
      `${scenario.id} routing misses`,
    ).toEqual([])
    expect(selection.tools.length).toBeLessThanOrEqual(router.MAX_AUTO_TOOLS)
  })

  it('covers all browser toolsets with executable prompts', () => {
    const covered = new Set(modelToolEvalCases.flatMap(scenario => scenario.expectedToolsets))
    expect([...covered].sort()).toEqual([...cesiumBrowserToolsetNames].sort())
  })

  it('uses unique stable scenario ids', () => {
    const ids = modelToolEvalCases.map(scenario => scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
