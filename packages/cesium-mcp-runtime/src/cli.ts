#!/usr/bin/env node
import { main } from './index.js'

main().catch((err) => {
  console.error('[cesium-mcp-runtime] Fatal:', err)
  process.exit(1)
})
