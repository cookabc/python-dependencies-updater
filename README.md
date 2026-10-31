# Python Dependencies Updater

**English** · [简体中文](README.zh-CN.md)

Inline version hints and one-click upgrades for `requirements.txt` and
`pyproject.toml`, with a status bar summary and known-vulnerability checks.

[![Marketplace Version](https://vsmarketplacebadges.dev/version/cookabc.python-dependencies-updater.svg)](https://marketplace.visualstudio.com/items?itemName=cookabc.python-dependencies-updater)
[![Downloads](https://vsmarketplacebadges.dev/downloads-short/cookabc.python-dependencies-updater.svg)](https://marketplace.visualstudio.com/items?itemName=cookabc.python-dependencies-updater)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/cookabc/python-dependencies-updater/actions/workflows/ci.yml/badge.svg)](https://github.com/cookabc/python-dependencies-updater/actions/workflows/ci.yml)

Upgrade policies, lockfile reports and isolated validation: [guide](docs/UPGRADES.md).

## Features

- **Both formats** — reads `requirements.txt` and `pyproject.toml`.
- **PEP 621, PEP 735 and Poetry** — `[project.dependencies]`,
  `[project.optional-dependencies]`, `[dependency-groups]` and
  `[tool.poetry.dependencies]` (including dev and group tables) all work.
- **Version detection** — each dependency shows its real status against PyPI.
- **Version-change review** — major and 0.x minor changes require confirmation; other version changes are heuristics, not proof of compatibility.
- **One-click updates** — click a version hint to move that dependency to the latest allowed version.
- **Constraint-aware suggestions** — the dependency's own specifier is respected (`==`, `>=`, `~=`, `==1.2.*` wildcards, environment markers, Poetry `^`/`~`).
- **Vulnerability check** — exact pins are checked against OSV.dev and flagged in place.
- **Hover details** — hover a dependency for its PyPI summary and latest release.
- **Batch updates** — review high-risk version changes separately; every destination is checked for known vulnerabilities when enabled.
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
   - `↗ Update to X.X.X` — a version update is available.
   - `⚠️ Update to X.X.X Major` — a major version update.

### pyproject.toml

PEP 621 `[project]` dependencies, `[project.optional-dependencies]` groups and
PEP 735 `[dependency-groups]` are all supported, with the same status hints and
update actions.

Poetry projects work too: `[tool.poetry.dependencies]`,
`[tool.poetry.dev-dependencies]` and `[tool.poetry.group.<name>.dependencies]`
are read, and Poetry's `^`/`~` constraints are translated to their PEP 440
ranges before the version is resolved. A dependency given only as a `git` or
`path` source is skipped, and `python` is ignored because it constrains the
interpreter rather than naming a package.

Multi-line and single-line dependency arrays both work, and each dependency is
rewritten in place without touching its neighbours on the line.

### Vulnerability check

Every dependency pinned to an exact version (`==1.2.3`) is checked against
[OSV.dev](https://osv.dev). When advisories exist, a shield hint appears next
to the dependency and the status bar turns red; clicking it lists the
advisories with their severity and opens the chosen one on osv.dev.

Only exact pins are checked. A range such as `>=2.0` or `~=4.2` states which
versions are allowed, not which one is installed, so checking it would report
vulnerabilities the user may never run into. Disable the whole check with
`pyDepsHint.checkVulnerabilities`.

### Batch updates

Run "Update All Packages" from the command palette, or click the status bar
notification. Major and 0.x minor changes require explicit confirmation.
Version classification does not replace project checks.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `pyDepsHint.enabled` | `true` | Enable or disable the extension |
| `pyDepsHint.showPrerelease` | `false` | Include pre-release versions |
| `pyDepsHint.cacheTTLMinutes` | `60` | Cache TTL in minutes |
| `pyDepsHint.supportPyProject` | `true` | Enable or disable `pyproject.toml` support |
| `pyDepsHint.registryUrl` | `https://pypi.org` | Custom registry exposing the PyPI JSON API |
| `pyDepsHint.checkVulnerabilities` | `true` | Check exact pins against OSV.dev |

### Private registries

`pyDepsHint.registryUrl` points the extension at a mirror such as Artifactory,
devpi or GitLab. When that mirror needs authentication, run **Set Registry
Token** from the command palette. The token is stored in VS Code's
SecretStorage and sent as a `Bearer` header — never in `settings.json`, which
syncs across machines and is readable as plain text.

## Project structure

```
src/
├── core/
│   ├── batchUpdate.ts     # Batch update orchestration
│   ├── cache.ts           # Response cache
│   ├── packageName.ts     # Distribution name normalisation
│   ├── parser.ts          # requirements.txt parsing
│   ├── pep440.ts          # PEP 440 version comparison
│   ├── pyprojectParser.ts # pyproject.toml parsing (PEP 621/735, Poetry)
│   ├── unifiedParser.ts   # One interface over both formats
│   ├── versionAnalyzer.ts # Version risk analysis
│   ├── versionResolver.ts # Version resolution
│   └── vulnerabilityScan.ts # Which pins can be checked against OSV
├── providers/
│   ├── codeLensProvider.ts # CodeLens entries
│   ├── hoverProvider.ts    # Hover summaries
│   ├── osvClient.ts        # OSV.dev client
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
