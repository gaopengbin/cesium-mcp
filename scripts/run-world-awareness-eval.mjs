import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runHiddenCorridorEvaluation } from '../packages/cesium-mcp-spatial/dist/index.js'

const rootDirectory = fileURLToPath(new URL('..', import.meta.url))
const outputFlagIndex = process.argv.indexOf('--output')
const outputArgument = outputFlagIndex >= 0 ? process.argv[outputFlagIndex + 1] : undefined
const outputPath = resolve(
  rootDirectory,
  outputArgument ?? 'artifacts/world-awareness-eval.json',
)

const report = runHiddenCorridorEvaluation()
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

const activeRuns = report.cases.map(item => item.runs['active-next-best-view'])
const observationCount = activeRuns.reduce(
  (total, run) => total + run.metrics.observationCount,
  0,
)

console.log(
  `World awareness evaluation: ${report.cases.filter(item => item.passed).length}`
  + `/${report.cases.length} active-perception cases passed`,
)
console.log(
  `Safety: ${report.summary.activeConstraintViolations} violations, `
  + `${report.summary.activeFalseFreeRate} false-free rate`,
)
console.log(
  `Observations: ${observationCount} total, `
  + `${report.summary.activeObservationEfficiency} mean efficiency`,
)
console.log(`Report: ${outputPath}`)

if (!report.passed) process.exitCode = 1
