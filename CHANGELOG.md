# Change Log

All notable changes to the "Python Dependencies Updater" extension will be documented in this file.

## [Unreleased]

### Added

- A private registry can be authenticated. **Set Registry Token** stores the
  token in SecretStorage and it is sent as a `Bearer` header, so mirrors such
  as Artifactory, devpi and GitLab work instead of returning 401.
- Dependencies pinned to an exact version are checked against OSV.dev. A
  shield hint marks the ones with known advisories, the status bar turns red,
  and clicking lists each advisory with its severity. Only exact pins are
  checked: a range states which versions are allowed, not which one is
  installed. Disable with `pyDepsHint.checkVulnerabilities`.
- `[dependency-groups]` (PEP 735) is parsed, so uv and pip projects that keep
  development dependencies there get hints. `@iarna/toml` rejects the mixed
  array PEP 735 allows (`[{include-group = "dev"}, "pytest>=7"]`) and that
  error used to drop every hint in the file; parsing now retries around it.
- Poetry tables are parsed: `[tool.poetry.dependencies]`,
  `[tool.poetry.dev-dependencies]` and
  `[tool.poetry.group.<name>.dependencies]`. `^`/`~` constraints are
  translated to their PEP 440 ranges, git/path-only sources are skipped, and
  `python` is ignored. A Poetry-only `pyproject.toml` with no `[project]`
  table is now recognized instead of being treated as unparseable.

### Fixed

- The extension no longer contributes `id: "toml"` with
  `extensions: [".toml"]`, which routed every TOML file (Cargo.toml,
  config.toml) to this extension's language configuration. That configuration
  declared empty bracket and auto-closing pairs, removing them for those
  files, and the id collided with installed TOML syntax extensions. It is now
  scoped to the `pyproject.toml` filename, and its language configuration
  carries real TOML brackets.
- "Update All" plans safe updates from the document text after the registry
  requests return. Inserting or deleting lines while versions load no longer
  makes a patch bump land on the wrong line. Risky updates use that same
  relocation, including edits made during the confirmation dialog.
- Removed the `[UAT-PROBE]` log that `resolveCodeLens` wrote on every lens.
- A requirements file whose lines all use extras (`requests[security]>=2.0`)
  is parsed again. Brackets in an extra are not treated as a TOML table.
- Version ordering follows PEP 440. `1.0.0rc1.post1` is less than `1.0.0`,
  an epoch such as `1!1.0` sorts above `2.0`, and `1.0rc1+cpu` is a
  pre-release. An epoch change is reported as a major update.
- Package cache keys are PEP 503-normalized, so `foo_bar` and `foo-bar`
  share one entry. Closing a requirements file drops it from the dependency
  cache and from the status-bar total. Hover uses the same specifier-aware
  resolution as the CodeLens.

- Upgrading a multi-constraint requirement now bumps only the lower bound or
  pin. `requests>=2.0,<3.0` keeps its upper bound, `foo!=1.5,>=1.0` keeps the
  exclusion, and `django~=4.2` keeps two-component precision instead of
  becoming `~=4.2.16`.
- Updating `pytest` in a one-line `pyproject.toml` array no longer rewrites
  `pytest-cov` when the names share a prefix.
- Bare packages, marker-only lines (`requests ; python_version >= "3.8"`) and
  PEP 508 direct references (`pkg @ https://...`) no longer show an Update
  lens, and a marker's comparison is never written as the package version.
- `@types/vscode` is pinned to 1.85.0 so packaging succeeds with
  `engines.vscode` `^1.85.0`. CI runs `vsce package`.

## [1.5.1] - 2026-10-11

### Fixed

- Updating a dependency inside a TOML single-line array no longer corrupts the
  file (the whole-line regex used to match the `=` of the assignment first).
- Files like `Cargo.toml` or `rust-toolchain.toml` are no longer misread as
  Python dependency manifests; only `pyproject.toml` with a `[project]`
  section is parsed.
- Update suggestions now respect each dependency's own specifier
  (`>=2.0,<3.0` stays below 3.0); wildcard constraints (`==1.2.*`), arbitrary
  equality (`===`), and environment markers are handled.
- Post-releases (`1.0.1.post1`) are no longer filtered out as pre-releases.
- Releases with no files or only yanked files are never suggested.
- "Update All" re-locates dependencies when the document changed while
  versions were being fetched, so edits land on the right lines.
- Failed version checks retry after 5 minutes instead of staying stuck;
  changing settings (registry, prerelease, …) takes effect immediately.
- The persisted cache survives window reloads again and is pruned after
  30 days.

### Changed

- Tests run against compiled output (`npm test`), fixing the suite on
  current Node versions; CI runs `npm ci`, biome check and the tests.
- Major-update dialogs and the "skipped" notice are localized.

## [1.5.0] - 2026-02-28

### Added

- `activationEvents` in `package.json` for explicit, faster extension startup.
- Status bar now fully localized across all 10 supported languages.
- vscode mock for unit tests, enabling all test files to run outside the extension host.
- 4 new i18n keys for status bar messages across all 10 locales.

### Improved

- Test runner now uses glob pattern (`**/*.test.ts`) instead of explicit file list. All test files (including previously excluded `cache.test.ts`, `hoverProvider.test.ts`, `i18n.test.ts`) now run.
- Cache `saveToStorage()` is now debounced (1s), preventing excessive writes during batch operations.
- Status bar updates are driven by CodeLens provider cache, eliminating duplicate PyPI fetches on document change.
- Fixed `any` types in `riskyUpdates` array to use proper `AnyDependency` and `VersionAnalysis` types.
- Removed duplicate `FileType` interface from `types/index.ts` (enum in `unifiedParser.ts` is authoritative).
- Updated `AGENTS.md` to reflect correct version (1.5.0).

### Fixed

- Fixed double-fetch issue: status bar + CodeLens were independently fetching all package versions on every document change.
- Test count increased from 87 to 98 (previously 11 tests existed but were invisible to `npm test`).

## [1.4.0] - 2026-02-14

### Added

- Replaced custom TOML parser with `@iarna/toml` for more robust `pyproject.toml` parsing.
- Improved handling of inline tables and arrays in TOML files.

### Fixed

- Fixed build scripts and `lint-staged` configuration.

## [1.3.0] - 2026-02-14

- Maintenance release.

## [1.2.0] - 2026-02-06

### Added

- ⏳ Loading indicator while fetching version information
- ❌ Error state display for failed version checks (connection failed, package not found)
- 🌍 Added `checking` and `checkFailed` translations for all 9 supported languages

### Improved

- 🔧 Refactored PyPI client to use Node.js native https module for better compatibility
- 🚀 Improved async version fetching with automatic cache and refresh pattern
- 📝 Better error messages and tooltips for troubleshooting

### Fixed

- Fixed issue where loading state would hang indefinitely
- Fixed VS Code not calling resolveCodeLens when command was already set

## [1.1.0] - 2026-01-07

### Added

- 📦 Full `pyproject.toml` support for modern Python projects
- 🔍 Smart file type detection (requirements.txt, pyproject.toml)
- 🧩 Support for `[project.optional-dependencies]` sections
- 🎯 Consistent version checking across both formats
- 🔧 Configuration option to enable/disable pyproject.toml support

### Features

- Automatic detection of both `requirements.txt` and `pyproject.toml` files
- Support for main dependencies in `[project]` section
- Support for optional dependencies in `[project.optional-dependencies]` sections
- Handles packages with extras (e.g., `uvicorn[standard]`)
- Correct parsing of all version operators (==, >=, <=, !=, ~=)
- Always shows latest PyPI version regardless of current constraint
- Preserves TOML formatting (quotes, operators) during updates

### Fixes

- Fixed version comparison for pyproject.toml files
- Fixed missing quotes after version updates
- Fixed incorrect "Update to" prompts when already at latest version
- Proper extraction of package names with extras

## [1.0.0] - 2025-01-01

### Added

- 🎯 Smart version detection with risk analysis
- 🖱️ One-click package updates via CodeLens
- ⚠️ Breaking change warnings for major version updates
- 📊 Status bar showing update count
- 🌍 Multi-language support (English, Chinese, Japanese, Korean, French, German, Spanish, Russian)
- 💾 Intelligent caching to reduce network requests
- 🔄 Batch update with safety confirmation
- ✅ Visual distinction between safe and risky updates

### Features

- Automatic detection of `requirements.txt` files
- Real-time version checking against PyPI
- Support for all pip version specifiers (==, !=, >=, <=, >, <, ~=)
- Handles package extras (e.g., `uvicorn[standard]`)
- Debounced file change detection
- Configurable cache TTL and pre-release inclusion

### Security

- Confirmation dialogs for major version updates
- Separate handling of safe vs. risky updates in batch mode
- No automatic updates without user consent
