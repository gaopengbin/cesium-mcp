import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const cesiumBuild = join(dirname(require.resolve('cesium/package.json')), 'Build', 'Cesium')

export default defineConfig({
  build: {
    assetsDir: 'app-assets',
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify('/'),
    global: 'globalThis',
  },
  publicDir: cesiumBuild,
  server: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true,
  },
})
