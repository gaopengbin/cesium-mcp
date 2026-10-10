import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const runtime = new URL('../packages/cesium-mcp-runtime/', import.meta.url)
const workersFolder = new URL('../node_modules/cesium/Build/Cesium/Workers/', import.meta.url)
const workerNames = (await readdir(workersFolder)).filter(name => name.endsWith('.js') && !name.startsWith('chunk-'))
// One shared bundle avoids duplicating Cesium geometry code for every worker.
const workerBundle = await build({
  stdin: {
    contents: `const workers = {${workerNames.map(name => `${JSON.stringify(name.slice(0, -3))}: () => import(${JSON.stringify(fileURLToPath(new URL(name, workersFolder)).replaceAll('\\', '/'))})`).join(',')}}; await workers["__CESIUM_MCP_WORKER_ID__"]()`,
    resolveDir: fileURLToPath(workersFolder),
  },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  legalComments: 'inline',
})
const workerCode = workerBundle.outputFiles[0].text
if (!workerCode.includes('__CESIUM_MCP_WORKER_ID__')) throw new Error('Cesium worker selector was removed by the bundler')
const bundle = async name => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`app/${name}.ts`, runtime))],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'inline',
    plugins: [{
      name: 'cesium-knockout-csp',
      setup(builder) {
        builder.onResolve({ filter: /^cesium-map-worker-code$/ }, () => ({ path: 'worker-code', namespace: 'cesium-map' }))
        builder.onLoad({ filter: /.*/, namespace: 'cesium-map' }, () => ({
          contents: `export default ${JSON.stringify(workerCode)}`, loader: 'js',
        }))
        builder.onLoad({ filter: /[\\/]Core[\\/]TaskProcessor\.js$/ }, async ({ path }) => {
          const source = await readFile(path, 'utf8')
          const workerEntry = 'function createWorker(url) {'
          if (!source.includes(workerEntry)) throw new Error('Cesium Worker creation changed; review MCP App blob-worker compatibility')
          // No external module imports in the worker startup path: only the permitted blob URL.
          const embeddedWorker = `${workerEntry}
  const embeddedId = url.replace(/\\.js$/, "");
  if (${JSON.stringify(workerNames.map(name => name.slice(0, -3)))}.includes(embeddedId)) {
    const workerUrl = urlFromScript(cesiumMapWorkerCode.replace('__CESIUM_MCP_WORKER_ID__', embeddedId));
    const worker = new Worker(workerUrl, { type: "module" });
    const release = () => URL.revokeObjectURL(workerUrl);
    worker.addEventListener("message", release, { once: true });
    worker.addEventListener("error", release, { once: true });
    return worker;
  }`
          return { contents: `import cesiumMapWorkerCode from 'cesium-map-worker-code'\n${source.replace(workerEntry, embeddedWorker)}`, loader: 'js' }
        })
        builder.onLoad({ filter: /knockout-3\.5\.1\.js$/ }, async ({ path }) => {
          const source = await readFile(path, 'utf8')
          const globalLookup = 'this||(0,eval)("this")'
          if (!source.includes(globalLookup)) throw new Error('Cesium Knockout global lookup changed; review the MCP App CSP compatibility patch')
          // Keep observable support without evaluating JavaScript to find window.
          return { contents: source.replace(globalLookup, 'globalThis'), loader: 'js' }
        })
      },
    }],
  })
  return result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
}

const template = await readFile(new URL('app/map.html', runtime), 'utf8')
const style = await readFile(new URL('app/style.css', runtime), 'utf8')
const app = await bundle('main')
let mapHtml = template
  .replace('/* APP_STYLE */', () => style)
  .replace('/* APP_SCRIPT */', () => app)
for (const name of ['search', 'map-pin', 'globe', 'arrow-up', 'plus', 'locate-fixed', 'arrow-up-right', 'arrow-left', 'messages-square', 'maximize', 'minimize']) {
  const svg = (await readFile(new URL(`app/icons/${name}.svg`, runtime), 'utf8'))
    .replace('<svg', '<svg aria-hidden="true" focusable="false"')
  mapHtml = mapHtml.replaceAll(`<!-- ICON_${name.toUpperCase().replaceAll('-', '_')} -->`, svg)
}
const captures = JSON.parse(await readFile(new URL('app/demos/captures.json', runtime), 'utf8'))
const demoSource = (await readFile(new URL('app/demos.ts', runtime), 'utf8')).replaceAll('\r\n', '\n')
if (createHash('sha256').update(demoSource).digest('hex') !== captures.demoSourceSha256) throw new Error('Demo plans changed; recapture the actual map covers before building')
for (const name of ['choropleth', 'buildings', 'heatmap']) {
  const capture = captures.covers.find(item => item.id === name)
  if (!capture || capture.file !== `${name}.jpg`) throw new Error(`Missing actual map capture for ${name}`)
  const pixels = await readFile(new URL(`app/demos/${name}.jpg`, runtime))
  if (pixels[0] !== 0xff || pixels[1] !== 0xd8 || createHash('sha256').update(pixels).digest('hex') !== capture.sha256) throw new Error(`Map cover integrity check failed: ${name}`)
  mapHtml = mapHtml.replace(`<!-- DEMO_${name.toUpperCase()} -->`, `<img src="data:image/jpeg;base64,${pixels.toString('base64')}" alt="" loading="lazy" decoding="async">`)
}
const iconLicense = await readFile(new URL('app/icons/LICENSE', runtime), 'utf8')
mapHtml += `\n<!-- Lucide Icons license\n${iconLicense.replaceAll('--', '—')}\n-->`
if (/<!-- (ICON_|DEMO_)/.test(mapHtml)) throw new Error('Map UI contains an unresolved asset')
// Keep serialized resource responses below the MCP SDK's default 10 MiB stdio limit.
if (Buffer.byteLength(JSON.stringify(mapHtml)) > 9 * 1024 * 1024) throw new Error('Map resource is too large for standard MCP clients')
await writeFile(new URL('dist/map-app.html', runtime), mapHtml)
await writeFile(new URL('dist/map-preview.js', runtime), await bundle('preview'))
await writeFile(new URL('dist/map-preview.html', runtime), await readFile(new URL('app/preview.html', runtime)))
console.log('Built Cesium MCP App and local preview host')
