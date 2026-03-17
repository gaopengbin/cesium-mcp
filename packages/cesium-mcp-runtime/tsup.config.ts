import { defineConfig } from 'tsup'
import pkg from './package.json'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node18',
  external: ['undici'],
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
})
