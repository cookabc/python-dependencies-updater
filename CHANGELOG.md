# Change Log

All notable changes to the "Python Dependencies Updater" extension will be documented in this file.

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