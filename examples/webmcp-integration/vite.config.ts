import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { defineConfig, normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const require = createRequire(import.meta.url)
const cesiumBuild = join(dirname(require.resolve('cesium/package.json')), 'Build', 'Cesium')

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  plugins: [
    viteStaticCopy({
      targets: ['Assets', 'ThirdParty', 'Widgets', 'Workers'].map(directory => ({
        src: normalizePath(join(cesiumBuild, directory, '**', '*')),
        dest: `cesium/${directory}`,
      })),
    }),
  ],
})
