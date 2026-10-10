import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(root, 'plugins', 'cesium-map')
const output = join(plugin, 'dist')
await mkdir(output, { recursive: true })

// Bundle production dependencies so a copied plugin needs Node, not npm install.
const result = await build({
  entryPoints: [join(root, 'packages', 'cesium-mcp-runtime', 'src', 'cli.ts')],
  outfile: join(output, 'cli.mjs'),
  platform: 'node',
  target: 'node22',
  format: 'esm',
  bundle: true,
  minify: true,
  legalComments: 'eof',
  metafile: true,
  banner: { js: "import { createRequire } from 'node:module'\nconst require = createRequire(import.meta.url)" },
  define: {
    'process.env.WS_NO_BUFFER_UTIL': '"1"',
    'process.env.WS_NO_UTF_8_VALIDATE': '"1"',
  },
})

for (const name of ['map-app.html', 'map-icon.svg', 'cesium-mcp-bridge.browser.global.js']) {
  await copyFile(join(root, 'packages', 'cesium-mcp-runtime', 'dist', name), join(output, name))
}
await copyFile(join(root, 'LICENSE'), join(plugin, 'LICENSE'))

const icon = await readFile(join(output, 'map-icon.svg'), 'utf8')
const assets = join(plugin, 'assets')
await mkdir(assets, { recursive: true })
for (const [name, color] of [
  ['icon.svg', '#202123'],
  ['icon-dark.svg', '#F3F3F3'],
  ['logo.svg', '#16866B'],
  ['logo-dark.svg', '#70E1B4'],
]) {
  await writeFile(join(assets, name), icon
    .replace('width="20" height="20"', 'width="64" height="64"')
    .replaceAll('currentColor', color))
}

const packageRoots = new Set()
for (const name of ['cesium', '@cesium/engine', '@cesium/widgets']) {
  packageRoots.add(dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`))))
}
for (const input of Object.keys(result.metafile.inputs)) {
  let folder = dirname(resolve(root, input))
  while (folder.startsWith(root) && folder !== root) {
    try {
      const metadata = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'))
      if (metadata.name) packageRoots.add(folder)
      break
    } catch {
      folder = dirname(folder)
    }
  }
}
const notices = []
for (const folder of [...packageRoots].sort()) {
  const metadata = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'))
  let license = metadata.license ?? 'See package license'
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT', 'license', 'license.md', 'LICENSE.MIT']) {
    try {
      license = await readFile(join(folder, name), 'utf8')
      break
    } catch {
      // Package license naming varies.
    }
  }
  notices.push(`${metadata.name} ${metadata.version}\n${license}`)
}
notices.push(`Lucide Icons\n${await readFile(join(root, 'packages/cesium-mcp-runtime/app/icons/LICENSE'), 'utf8')}`)
await writeFile(join(output, 'THIRD_PARTY_LICENSES.txt'), notices.join('\n\n==========\n\n'))
console.log(`Built standalone Cesium Map plugin: ${plugin}`)
