import { defineConfig } from 'tsup'
import pkg from './package.json'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node20',
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
})
