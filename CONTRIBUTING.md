# Contributing to cesium-mcp

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/gaopengbin/cesium-mcp.git
cd cesium-mcp
npm install
npm run build
```

## Running Tests

```bash
npx vitest        # watch mode
npx vitest run    # single run
```

## Project Structure

```
packages/
├── cesium-mcp-bridge/    # Browser SDK (embeds in CesiumJS apps)
├── cesium-mcp-runtime/   # MCP Server (stdio, connects to AI agents)
└── cesium-mcp-dev/       # IDE MCP Server (CesiumJS API helper)
```

## Making Changes

1. Fork the repository and create a feature branch from `main`
2. Make your changes
3. Add a changeset: `npx changeset` — describe what changed and pick the semver bump
4. Ensure tests pass: `npx vitest run`
5. Ensure build succeeds: `npm run build`
6. Open a Pull Request

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `test:` — adding tests
- `chore:` — maintenance
- `ci:` — CI/CD changes

## Changesets

We use [Changesets](https://github.com/changesets/changesets) for version management. When you make a user-facing change, run `npx changeset` and follow the prompts. This creates a markdown file in `.changeset/` that describes your change.

## Code Style

- TypeScript for all source code
- No trailing semicolons (follow existing style)
- Use `tsup` for building

## Releasing

Version numbers are managed centrally. Source code files read version dynamically; JSON/config files are synced by script.

**Steps:**

```bash
# 1. Bump version in root package.json
npm version patch   # or minor / major

# 2. Sync version to all satellite files (server.json, server-card.json, etc.)
node scripts/sync-version.mjs

# 3. Build all packages (version injected at compile time via tsup define)
npm run build

# 4. Run tests
npx vitest run

# 5. Publish to npm
cd packages/cesium-mcp-bridge && npm publish && cd ../..
cd packages/cesium-mcp-dev && npm publish && cd ../..
cd packages/cesium-mcp-runtime && npm publish && cd ../..

# 6. Commit, tag, and push
git add -A
git commit -m "chore: release vX.Y.Z"
git push origin main

# 7. Create GitHub Release
gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes
```

**How version auto-sync works:**

| File | Mechanism |
|------|-----------|
| `packages/*/src/index.ts` | `tsup define __VERSION__` — compiled from `package.json` |
| `worker/src/index.js` | Reads from imported `server-card.json` |
| `docs/.vitepress/config.mts` | `createRequire` reads root `package.json` |
| `Dockerfile` | `ARG VERSION=latest` — pass `--build-arg VERSION=X.Y.Z` |
| JSON config files | `node scripts/sync-version.mjs` |

### MCP Registry synchronization

The **Publish to MCP Registry** workflow (`.github/workflows/publish-mcp.yml`) runs after a successful `Release` workflow for a push to `main`. It checks out the exact revision used by that release and synchronizes only `io.github.gaopengbin/cesium-mcp-runtime`. It does not rebuild or republish npm packages, and a Registry failure does not change the completed npm release.

Before publishing, it verifies that the runtime's `package.json`, `mcpName`, and `server.json` agree, waits for the exact npm version to be available, and checks the Registry for that version. Existing versions are skipped; unexpected HTTP errors or mismatched metadata fail instead of being treated as a missing entry. Keep the Registry description within the schema's 100-character limit. The existing `npm run version` command runs `scripts/sync-version.mjs` to synchronize versions after Changesets.

Authentication uses [GitHub OIDC](https://modelcontextprotocol.io/registry/github-actions) with job-scoped `id-token: write`; no additional PAT or MCP secret is required. The publisher binary is version-pinned and SHA-256 checked before execution. Update both its download version and checksum when upgrading the publisher.

To backfill the current version or retry a Registry-only failure, open **Actions → Publish to MCP Registry → Run workflow**, select **main**, and run it. Alternatively:

```bash
gh workflow run publish-mcp.yml --ref main
```

The manual run uses the version declared on `main`, not npm's moving `latest` tag. That exact version must already be published to npm with the matching `mcpName`. Runs from forks, pull requests, and non-main branches cannot publish. See the workflow's job summary for whether the version was published or skipped. This registers the server in the official MCP Registry; it does not automatically apply for inclusion in GitHub's curated MCP directory.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
