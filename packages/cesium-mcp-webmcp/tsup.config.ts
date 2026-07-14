import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    clean: true,
    external: ['cesium-mcp-contracts'],
    treeshake: true,
  },
  {
    entry: { 'cesium-mcp-webmcp.browser': 'src/index.ts' },
    format: ['iife'],
    globalName: 'CesiumMcpWebMcp',
    splitting: false,
    noExternal: ['cesium-mcp-contracts'],
    treeshake: true,
  },
])
