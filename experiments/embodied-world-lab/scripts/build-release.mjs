import { build } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

process.env.VITE_BASE_PATH = '/cesium-jev/'
await build()
await build({
  configFile: false,
  build: {
    ssr: 'server/public-server.ts', outDir: 'release-server',
    rolldownOptions: { output: { entryFileNames: 'server.mjs' } },
  },
})
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
await mkdir('release-server', { recursive: true })
await writeFile(resolve('release-server/build.json'), JSON.stringify({ revision, builtAt: new Date().toISOString() }) + '\n')
