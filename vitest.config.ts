import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'cesium-mcp-contracts': fileURLToPath(new URL('./packages/cesium-mcp-contracts/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'examples/browser-agent/_worker.test.ts',
      'examples/browser-agent/agent-response.test.ts',
      'examples/browser-agent/index.test.ts',
      'examples/browser-agent/tool-router.test.ts',
      'examples/browser-agent/functions/**/*.test.ts',
    ],
  },
})
