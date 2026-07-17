#!/usr/bin/env node
import {
  main
} from "./chunk-V42WGNXY.js";

// src/cli.ts
main(process.argv.slice(2)).catch((err) => {
  console.error("[cesium-mcp-runtime] Fatal:", err);
  process.exit(1);
});
