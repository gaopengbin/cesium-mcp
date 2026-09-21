import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'cesium-mcp-contracts': join(import.meta.dirname, '../../packages/cesium-mcp-contracts/src/index.ts'),
      'cesium-mcp-spatial': join(import.meta.dirname, '../../packages/cesium-mcp-spatial/src/index.ts'),
      'cesium': join(import.meta.dirname, 'node_modules/cesium/Source/Cesium.js'),
      'heatmap.js': join(import.meta.dirname, 'node_modules/heatmap.js/build/heatmap.js'),
    },
  },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
})
