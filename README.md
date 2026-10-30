# Python Dependencies Updater

**English** · [简体中文](README.zh-CN.md)

Inline version hints and one-click upgrades for `requirements.txt` and
`pyproject.toml`, with breaking change detection and a status bar summary.

[![Marketplace Version](https://vsmarketplacebadges.dev/version/cookabc.python-dependencies-updater.svg)](https://marketplace.visualstudio.com/items?itemName=cookabc.python-dependencies-updater)
[![Downloads](https://vsmarketplacebadges.dev/downloads-short/cookabc.python-dependencies-updater.svg)](https://marketplace.visualstudio.com/items?itemName=cookabc.python-dependencies-updater)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/cookabc/python-dependencies-updater/actions/workflows/ci.yml/badge.svg)](https://github.com/cookabc/python-dependencies-updater/actions/workflows/ci.yml)

## Features

- **Both formats** — reads `requirements.txt` and PEP 621 `pyproject.toml`.
- **Version detection** — each dependency shows its real status against PyPI.
- **Risk analysis** — patch and minor updates are marked safe; major updates are flagged separately.
- **One-click updates** — click a version hint to move that dependency to the latest allowed version.
- **Constraint-aware suggestions** — the dependency's own specifier is respected (`==`, `>=`, `~=`, `==1.2.*` wildcards, environment markers).
- **Hover details** — hover a dependency for its PyPI summary and latest release.
- **Batch updates** — the status bar and command palette upgrade every safe package at once, with a confirmation step for majors.
- **Smart caching** — PyPI responses are cached, so editing stays off the network.
- **Ten locales** — the interface is localized through `package.nls.*.json`.

## Installation

```bash
code --install-extension cookabc.python-dependencies-updater
```

Or search for "Python Dependencies Updater" in the Extensions view (Ctrl+Shift+X).

## Usage

### requirements.txt

1. Open any `requirements.txt`.
2. Each dependency shows its status:
   - `✓ Up to date` — already at the latest version.
   - `↗ Update to X.X.X` — a safe update is available.
   - `⚠️ Update to X.X.X Major` — a major version update.

### pyproject.toml

Both `[project]` dependencies and `[project.optional-dependencies]` groups are
supported, with the same status hints and update actions.

Only PEP 621 tables are parsed. Poetry's `[tool.poetry.dependencies]` is not
supported yet. Multi-line and single-line dependency arrays both work, and each
dependency is rewritten in place without touching its neighbours on the line.

### Batch updates

Run "Update All Packages" from the command palette, or click the status bar
notification. Safe updates and major updates are separated, so the majors need
an explicit confirmation.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `pyDepsHint.enabled` | `true` | Enable or disable the extension |
| `pyDepsHint.showPrerelease` | `false` | Include pre-release versions |
| `pyDepsHint.cacheTTLMinutes` | `60` | Cache TTL in minutes |
| `pyDepsHint.supportPyProject` | `true` | Enable or disable `pyproject.toml` support |
| `pyDepsHint.registryUrl` | `https://pypi.org` | Custom registry exposing the PyPI JSON API |

## Project structure

```
src/
├── core/
│   ├── batchUpdate.ts     # Batch update orchestration
│   ├── cache.ts           # Response cache
│   ├── packageName.ts     # Distribution name normalisation
│   ├── parser.ts          # requirements.txt parsing
│   ├── pep440.ts          # PEP 440 version comparison
│   ├── pyprojectParser.ts # pyproject.toml parsing
│   ├── unifiedParser.ts   # One interface over both formats
│   ├── versionAnalyzer.ts # Version risk analysis
│   └── versionResolver.ts # Version resolution
├── providers/
│   ├── codeLensProvider.ts # CodeLens entries
│   ├── hoverProvider.ts    # Hover summaries
│   ├── pypiClient.ts       # PyPI client
│   └── versionService.ts   # Version service
├── utils/
│   ├── configuration.ts    # Settings access
│   ├── dependencyUtils.ts  # Shared dependency helpers
│   ├── i18n.ts             # Locale lookup
│   ├── logger.ts           # Output channel logging
│   ├── statusBar.ts        # Status bar management
│   └── url-validator.ts    # Registry URL validation
├── types/index.ts
├── test/                  # Mocha unit tests
└── extension.ts           # Entry point

npm/                       # the npm ecosystem, shipped as its own extension
```

## Development

```bash
npm install
npm run compile   # tsc
npm test          # mocha 'out/test/unit/**/*.test.js'
npm run lint      # biome check --write src
npm run uat       # end-to-end pass against scripts/uat-fixture
```

The npm ecosystem lives in `npm/` as a separate package with its own
dependencies and test suite. It is published as its own extension, so it is
not bundled into this one:

```bash
npm run npm:install   # npm ci inside npm/
npm run npm:check     # lint and test the npm package
npm run check:all     # both packages
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
