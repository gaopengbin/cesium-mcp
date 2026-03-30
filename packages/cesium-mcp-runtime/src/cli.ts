#!/usr/bin/env node
import { main } from './index.js'

main(process.argv.slice(2)).catch((err) => {
  console.error('[cesium-mcp-runtime] Fatal:', err)
  process.exit(1)
})
