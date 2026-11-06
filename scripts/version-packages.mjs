import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertVersionPolicy, assertUnusedAlignedVersions } from './version-policy.mjs'
import { readVersionPolicy, repositoryRoot } from './check-version-policy.mjs'

const cli = join(dirname(fileURLToPath(import.meta.resolve('@changesets/cli'))), '..', 'bin.js')
const directory = mkdtempSync(join(tmpdir(), 'cesium-version-plan-'))
const planPath = join(directory, 'plan.json')
const run = args => execFileSync(process.execPath, args, { cwd: repositoryRoot, stdio: 'inherit' })
try {
  run([cli, 'status', '--output', planPath])
  const plan = JSON.parse(readFileSync(planPath, 'utf8'))
  assertVersionPolicy({ ...readVersionPolicy(), releases: plan.releases })
  await assertUnusedAlignedVersions(plan.releases, async (name, version) => {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, { signal: AbortSignal.timeout(15000) })
    await response.body?.cancel()
    return response.status
  })
  run([cli, 'version'])
  run(['scripts/sync-version.mjs'])
  assertVersionPolicy(readVersionPolicy())
} finally {
  // Only our single temporary plan file and empty directory are removed.
  rmSync(planPath, { force: true })
  rmdirSync(directory)
}
