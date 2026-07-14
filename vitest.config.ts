import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'examples/browser-agent/_worker.test.ts',
      'examples/browser-agent/index.test.ts',
      'examples/browser-agent/functions/**/*.test.ts',
    ],
  },
})
