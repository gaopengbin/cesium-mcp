import { readFile } from 'node:fs/promises'
import { createUrbanNavigation } from '../src/urban-navigation.ts'

// Node.js 22.18+ supports the type-only TypeScript syntax used by the navigation module.
const mesh = JSON.parse(await readFile(new URL('../src/assets/tokyo-colliders.json', import.meta.url), 'utf8'))
const start = performance.now()
const navigation = createUrbanNavigation(mesh)
console.log(JSON.stringify({
  preparationMilliseconds: performance.now() - start,
  grid: navigation.grid,
  challenge: navigation.defaultChallenge,
  source: 'PLATEAU 2025 building triangle projection; conservative 2 m radius and 34 m coverage margin',
}, null, 2))
