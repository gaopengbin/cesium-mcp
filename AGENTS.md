# AGENTS.md — cesium-mcp

AI agent integration for CesiumJS. A monorepo providing an MCP server that lets AI agents control a 3D globe (CesiumJS) in the browser via WebSocket, plus IDE tooling for Cesium API doc lookup and code generation.

## Monorepo Structure

```
packages/
  cesium-mcp-bridge/    # SDK — command execution layer (browser-side, controls Cesium viewer)
  cesium-mcp-runtime/   # MCP stdio/HTTP server — bridges AI agents to browser via WebSocket
  cesium-mcp-dev/       # IDE assistant — Cesium API doc queries and code generation
examples/               # browser-agent, dify-integration, emergency-response, minimal, video
docs/                   # VitePress site (guide, api, design, examples, zh-CN)
.Codex-plugin/         # Codex plugin manifest
hooks/                  # Plugin hooks (SessionStart, etc.)
skills/                 # Plugin skills (/cesium-quickstart)
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Build all packages (tsup) |
| `npm test` / `npx vitest run` | Run tests |
| `npm run lint` | ESLint all packages |
| `npm run typecheck` | tsc --noEmit across workspaces |
| `npm run clean` | Remove all dist/ |
| `npm run build -w packages/cesium-mcp-bridge` | Build one package |
| `npm run changeset` | Add a changeset for versioning |

Install: `npm ci` at root (workspaces + patch-package postinstall).

## Code Conventions

- **No semicolons.** Single quotes. Trailing commas on multi-line.
- 2-space indent. ESM throughout.
- `import type { ... }` separate from value imports.
- Files: kebab-case. Symbols: camelCase functions/vars, PascalCase types/classes.
- Type suffixes: `XxxParams`, `XxxResult`.
- One file per domain under `src/commands/` (camera.ts, layer.ts, scene.ts, etc.).
- Commands are plain functions `(viewer: Cesium.Viewer, params: XxxParams) => result`, not classes.
- Tests: Vitest, colocated as `*.test.ts`. Import source via `./foo.js` (NodeNext ESM).
- Types in `types.ts` with `// ========== Section ==========` banners. No zod in bridge.

## Adding a New Tool

1. **Bridge command** — Add a function in `packages/cesium-mcp-bridge/src/commands/`. Export from `index.ts`.
2. **Runtime tool** — In `packages/cesium-mcp-runtime/src/index.ts`, call `_registerTool()` with:
   - Name, description, Zod schema shape (params), MCP annotations, async handler.
   - Handler calls `sendToBrowser(sessionId, { action, params })` and awaits the response.
3. **Toolset** — Add the tool to an existing toolset array or create a new one. Default-enabled toolsets: view, entity, layer, interaction.

Meta-tools `list_toolsets` / `enable_toolset` let agents discover and activate toolsets at runtime.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CESIUM_WS_PORT` | WebSocket server port | 9100 |
| `CESIUM_TOOLSETS` | Enabled toolsets (comma-sep or "all") | view,entity,layer,interaction |
| `CESIUM_LOCALE` | Locale (en / zh-CN) | en |
| `CESIUM_ION_TOKEN` | Cesium Ion access token | — |
| `DEFAULT_SESSION_ID` | Multi-browser session routing | — |
| `MCP_TRANSPORT` | Transport mode (stdio / http) | stdio |
| `MCP_HTTP_PORT` | HTTP transport port | WS_PORT + 100 |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` | Proxy for geocode | — |
| `OSM_USER_AGENT` | User-Agent for OSM Nominatim | — |

## Do NOT

- Commit `.env` files, `.vscode/mcp.json`, or any Ion tokens / API keys.
- Use `npm` or `yarn` — this repo uses **npm workspaces** with `npm ci`.
- Modify hardcoded Ion tokens in `examples/` without replacing them with env-var references.
- Commit the `.codegraph/` directory (local-only, gitignored).
- Report security vulnerabilities in public issues (use GitHub Security Advisories).
- Bump CesiumJS beyond `~1.139.x` without checking peer dependency constraints (`^1.114.0`).

## Working Principles

- **Think first.** State assumptions. Surface tradeoffs. Ask when uncertain.
- **Simplicity.** Minimum code that solves the problem. No speculative abstractions.
- **Surgical changes.** Touch only what you must. Match existing style. Remove only orphans your changes created.
- **Goal-driven.** Define success criteria, verify each step. Write a failing test, then make it pass.
