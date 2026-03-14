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

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
