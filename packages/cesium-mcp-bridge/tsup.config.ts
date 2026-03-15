import { defineConfig } from 'tsup'

export default defineConfig([
  // Node package (ESM + CJS + DTS)
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    clean: true,
    external: ['cesium'],
    treeshake: true,
  },
  // Browser bundle (IIFE, relies on global Cesium)
  {
    entry: { 'cesium-mcp-bridge.browser': 'src/index.ts' },
    format: ['iife'],
    globalName: 'CesiumMcpBridge',
    splitting: false,
    treeshake: true,
    esbuildPlugins: [{
      name: 'cesium-global',
      setup(build) {
        build.onResolve({ filter: /^cesium$/ }, () => ({
          path: 'cesium',
          namespace: 'cesium-global',
        }))
        build.onLoad({ filter: /.*/, namespace: 'cesium-global' }, () => ({
          contents: 'module.exports = globalThis.Cesium',
          loader: 'js',
        }))
      },
    }],
  },
])
