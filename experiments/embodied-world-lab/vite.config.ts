import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { defineConfig, loadEnv } from 'vite'
import { jevApiPlugin } from './server/jev-api.js'

const require = createRequire(import.meta.url)
const cesiumBuild = join(dirname(require.resolve('cesium/package.json')), 'Build', 'Cesium')

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [jevApiPlugin({ apiKey: process.env.TYPESAFE_API_KEY ?? loadEnv(mode, process.cwd(), '').TYPESAFE_API_KEY })],
  resolve: {
    dedupe: ['cesium', 'heatmap.js'],
    alias: {
      'cesium-mcp-contracts': join(import.meta.dirname, '../../packages/cesium-mcp-contracts/src/index.ts'),
      'cesium-mcp-spatial': join(import.meta.dirname, '../../packages/cesium-mcp-spatial/src/index.ts'),
    },
  },
  build: {
    assetsDir: 'app-assets',
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify(process.env.VITE_BASE_PATH || '/'),
    global: 'globalThis',
  },
  publicDir: cesiumBuild,
  server: {
    host: '127.0.0.1',
    port: 4192,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4192,
    strictPort: true,
  },
}))
