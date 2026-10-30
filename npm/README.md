# NPM Dependencies Updater

**English** · [简体中文](README.zh-CN.md)

Inline version hints and one-click upgrades for `package.json`, with breaking
change detection and a status bar summary.

[![Marketplace Version](https://vsmarketplacebadges.dev/version/cookabc.npm-dependencies-updater.svg)](https://marketplace.visualstudio.com/items?itemName=cookabc.npm-dependencies-updater)
[![Downloads](https://vsmarketplacebadges.dev/downloads-short/cookabc.npm-dependencies-updater.svg)](https://marketplace.visualstudio.com/items?itemName=cookabc.npm-dependencies-updater)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/cookabc/npm-dependencies-updater/actions/workflows/ci.yml/badge.svg)](https://github.com/cookabc/npm-dependencies-updater/actions/workflows/ci.yml)

## Features

- **Version detection** — scanning `package.json` shows each dependency's real status against the registry.
- **Risk analysis** — patch and minor updates are marked safe; major updates are flagged instead of silently offered.
- **One-click updates** — CodeLens entries update a single dependency in place.
- **Batch updates** — the status bar and command palette update every safe package at once, with a confirmation step for majors.
- **peerDependencies aware** — peer ranges appear but are excluded from "Update All", because they express host compatibility windows rather than pins.
- **Resilient checks** — failed lookups are negative-cached briefly and retried on demand instead of re-hit on every scroll.
- **Smart caching** — registry responses are cached, so editing and scrolling stay off the network.
- **Scoped registries** — private scopes can carry their own registry URL and token.
- **Precise edits** — updates target the dependency's current position; compound ranges keep their upper bound and only the first alternative of an `OR` range is bumped.
- **Ten locales** — the interface is localized through `package.nls.*.json`.

## Installation

```bash
code --install-extension cookabc.npm-dependencies-updater
```

Or search for "NPM Dependencies Updater" in the Extensions view (Ctrl+Shift+X).

## Usage

1. Open any `package.json`.
2. Each dependency shows its status:
   - `✓ Up to date` — already at the latest version.
   - `$(sync~spin) Checking...` — a registry lookup is in flight.
   - `$(arrow-up) Update to X.X.X` — a safe update is available.
   - `$(warning) Update to X.X.X Major` — a major version update.
3. The status bar summarizes how many packages can move.
4. Run "Update All" from the status bar or the command palette to upgrade the safe ones (peerDependencies are skipped).
5. If a lookup fails, the CodeLens shows the error — click it to retry.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `npmDeps.enabled` | `true` | Enable or disable the extension |
| `npmDeps.showPrerelease` | `false` | Include pre-release versions when picking the latest |
| `npmDeps.cacheTTLMinutes` | `60` | Cache TTL in minutes |
| `npmDeps.registryUrl` | `https://registry.npmjs.org` | Custom registry URL |

## Project structure

```
src/
├── core/
│   ├── cache.ts             # Registry response cache
│   ├── dependencySpec.ts    # Range parsing and bump rules
│   ├── locateDependency.ts  # Finds a dependency's current position in the document
│   ├── packageJsonParser.ts # package.json parsing
│   ├── registryConfig.ts    # Scoped registry URLs and tokens
│   └── versionResolver.ts   # Version risk analysis and resolution
├── providers/
│   ├── codeLensProvider.ts  # CodeLens entries
│   ├── hoverProvider.ts     # Hover summaries
│   ├── npmClient.ts         # Registry client
│   └── versionService.ts    # Version service
├── utils/
│   ├── i18n.ts              # Locale lookup
│   ├── logger.ts            # Output channel logging
│   └── statusBar.ts         # Status bar management
├── types/index.ts
├── test/                    # Mocha unit tests
└── extension.ts             # Entry point
```

## Development

```bash
npm install
npm run compile   # tsc
npm test          # mocha 'out/test/unit/**/*.test.js'
npm run lint      # biome check --write src
npm run uat       # end-to-end pass against scripts/uat-fixture
```

## Publishing

Pushing a version tag runs tests, publishes to both marketplaces and attaches
the VSIX to a GitHub Release:

```bash
git tag v<package.json version> && git push origin v<package.json version>
```

Publishing uses OIDC trusted publishing — register the repository and workflow
once on each marketplace, and no token needs to be stored as a secret.
`VSCE_PAT` / `OVSX_PAT` secrets still work as a fallback.

Manual local publish (reads `.env` with `VSCE_PAT` / `OVSX_PAT`):

```bash
./publish.sh all    # both marketplaces
./publish.sh vsx    # VS Code Marketplace only
./publish.sh ovsx   # OpenVSX only
```

## License

MIT. See [LICENSE](LICENSE).
