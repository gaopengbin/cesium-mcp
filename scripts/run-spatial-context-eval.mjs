import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runEmergencyResponseEvaluation } from '../packages/cesium-mcp-spatial/dist/index.js'

const rootDirectory = fileURLToPath(new URL('..', import.meta.url))
const outputFlagIndex = process.argv.indexOf('--output')
const outputArgument = outputFlagIndex >= 0 ? process.argv[outputFlagIndex + 1] : undefined
const outputPath = resolve(
  rootDirectory,
  outputArgument ?? 'artifacts/spatial-context-eval.json',
)

const report = runEmergencyResponseEvaluation()
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

const assertionCount = report.stages.reduce(
  (total, stage) => total + stage.assertions.length,
  0,
)
const passedAssertionCount = report.stages.reduce(
  (total, stage) => total + stage.assertions.filter(assertion => assertion.passed).length,
  0,
)

console.log(`Spatial context evaluation: ${passedAssertionCount}/${assertionCount} assertions passed`)
console.log(`Report: ${outputPath}`)

if (!report.passed) process.exitCode = 1
