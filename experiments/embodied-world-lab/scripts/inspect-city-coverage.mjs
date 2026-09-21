import { readFile, writeFile } from 'node:fs/promises'

const source = await readFile(new URL('./prepare-city-colliders.mjs', import.meta.url), 'utf8')
const url = source.match(/const TILESET_URL = '([^']+)'/)[1]
const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
if (!response.ok) throw new Error(`Tileset: ${response.status}`)
const tileset = await response.json()
const bbox = [139.758, 35.676, 139.7678, 35.692]
const leaves = []
function visit(tile) {
  if (!tile.children?.length && tile.content) {
    const region = (tile.content.boundingVolume?.region ?? tile.boundingVolume.region).map((value, index) => index < 4 ? value * 180 / Math.PI : value)
    if (region[2] >= bbox[0] && region[0] <= bbox[2] && region[3] >= bbox[1] && region[1] <= bbox[3]) leaves.push({ uri: tile.content.uri ?? tile.content.url, region })
  }
  for (const child of tile.children ?? []) visit(child)
}
visit(tileset.root)
let next = 0
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < leaves.length) {
    const index = next++
    const response = await fetch(new URL(leaves[index].uri, url), { method: 'HEAD', signal: AbortSignal.timeout(60000) })
    if (!response.ok) throw new Error(`HEAD ${response.status}: ${leaves[index].uri}`)
    leaves[index].bytes = Number(response.headers.get('content-length'))
    if (!leaves[index].bytes) throw new Error(`No size: ${leaves[index].uri}`)
  }
}))
const result = { bbox, leafCount: leaves.length, totalBytes: leaves.reduce((sum, leaf) => sum + leaf.bytes, 0), leaves }
await writeFile(new URL('../../../artifacts/plateau-large-coverage-preflight.json', import.meta.url), JSON.stringify(result, null, 2))
console.log(JSON.stringify({ bbox, leafCount: result.leafCount, totalBytes: result.totalBytes, largestBytes: Math.max(...leaves.map(leaf => leaf.bytes)) }))
