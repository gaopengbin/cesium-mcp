import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'

async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await compress(path)
    else if (/\.(js|css|html|json|bin|svg|wasm)$/.test(path)) {
      const bytes = await readFile(path)
      if (bytes.length > 1024) await writeFile(path + '.gz', gzipSync(bytes, { level: 9 }))
    }
  }
}
await compress('dist')
execFileSync('tar', ['-czf', '../../artifacts/cesium-jev-site.tgz', 'dist', 'release-server'], { stdio: 'inherit' })
