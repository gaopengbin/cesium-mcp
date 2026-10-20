import { defineConfig } from 'tsup'
import pkg from './package.json'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/viewer.ts'],
    define: { __VERSION__: JSON.stringify(pkg.version) },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    clean: true,
    external: ['cesium', 'cesium-mcp-bridge', 'cesium-mcp-contracts'],
    treeshake: true,
  },
  {
    entry: { 'cesium-mcp-webmcp.browser': 'src/index.ts' },
    format: ['iife'],
    globalName: 'CesiumMcpWebMcp',
    define: { __VERSION__: JSON.stringify(pkg.version) },
    splitting: false,
    noExternal: ['cesium-mcp-contracts', 'cesium-mcp-telemetry'],
    treeshake: true,
  },
])
