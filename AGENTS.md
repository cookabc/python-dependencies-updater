# Python Dependencies Updater - Agent Guide

## Project Overview

This is a **VS Code Extension** that provides smart version management for Python dependency files (`requirements.txt` and `pyproject.toml`). It displays inline version hints and enables one-click updates with breaking change detection.

- **Extension Name**: Python Dependencies Updater
- **Publisher**: cookabc
- **Version**: 1.5.0
- **License**: MIT
- **Repository**: https://github.com/cookabc/python-dependencies-updater

## Technology Stack

- **Language**: TypeScript 5.3.2
- **Target**: ES2022, CommonJS modules
- **Runtime**: Node.js (VS Code Extension Host)
- **VS Code Engine**: ^1.85.0

### Dependencies
- `@iarna/toml` (^2.2.5) - TOML parsing for pyproject.toml files

### Dev Dependencies
- `typescript` (^5.3.2)
- `eslint` (^8.54.0) with `@typescript-eslint/*` plugins
- `mocha` (^10.2.0) + `chai` (^4.3.10) - Unit testing
- `fast-check` (^3.14.0) - Property-based testing
- `ts-node` (^10.9.2) - TypeScript execution for tests
- `@types/vscode` (^1.85.0) - VS Code API types

## Build and Development Commands

```bash
# Install dependencies
npm install

# Compile TypeScript to JavaScript (outputs to out/)
npm run compile

# Watch mode - auto-recompile on changes
npm run watch

# Run tests
npm test

# Lint code
npm run lint

# Pre-publish (runs automatically before packaging)
npm run vscode:prepublish

# Package extension (requires vsce)
npx vsce package
```

## Project Structure

```
src/
├── core/                    # Core business logic
│   ├── cache.ts             # In-memory cache with TTL for PyPI data
│   ├── parser.ts            # requirements.txt parser
│   ├── pyprojectParser.ts   # pyproject.toml parser
│   ├── unifiedParser.ts     # Unified interface for both formats
│   ├── versionAnalyzer.ts   # Risk analysis (major/minor/patch)
│   └── versionResolver.ts   # Version comparison and constraint resolution
├── providers/               # Service providers
│   ├── codeLensProvider.ts  # VS Code CodeLens provider (main UI)
│   ├── pypiClient.ts        # PyPI API client with concurrency limiting
│   └── versionService.ts    # Coordinates cache, client, and resolver
├── utils/                   # Utility functions
│   ├── configuration.ts     # VS Code configuration management
│   ├── i18n.ts              # Internationalization (9 languages)
│   └── statusBar.ts         # Status bar manager
├── types/                   # TypeScript type definitions
│   └── index.ts
├── test/                    # Test utilities
│   └── setup.ts             # Mocha/Chai test configuration
└── extension.ts             # Extension entry point (activate/deactivate)
```

### Output Structure
```
out/                         # Compiled JavaScript (gitignored)
├── extension.js             # Main entry point
├── extension.js.map         # Source map
├── core/
├── providers/
├── utils/
├── types/
└── test/
```

## Architecture

### Extension Activation
1. `extension.ts` exports `activate()` and `deactivate()` functions
2. Registers CodeLens provider for `pip-requirements` and `toml` languages
3. Registers commands: `updateVersion`, `updateAllVersions`, `showUpToDate`
4. Sets up event listeners for document changes (with 300ms debounce)
5. Initializes status bar manager

### Data Flow
1. User opens `requirements.txt` or `pyproject.toml`
2. `PyDepsCodeLensProvider.provideCodeLenses()` is triggered
3. `unifiedParser.parseDependencies()` detects file type and parses dependencies
4. For each dependency:
   - `versionService.getLatestCompatible()` checks cache first
   - If miss, `pypiClient.fetchVersions()` calls PyPI API (with concurrency limit of 5)
   - `versionResolver.resolve()` finds latest compatible version
   - `versionAnalyzer.analyzeVersionUpdate()` determines risk level
5. CodeLens items are rendered with appropriate icons and commands

### File Type Support

**requirements.txt**
- Parsed by `parser.ts`
- Supports: `package==version`, `package>=version`, extras like `package[extra]`
- Skips: comments, editable installs (`-e`), URLs, local paths

**pyproject.toml**
- Parsed by `pyprojectParser.ts`
- Supports: `[project]` dependencies, `[project.optional-dependencies]`
- Text-based parsing for reliability (not using full TOML parser for dependency extraction)

### Caching Strategy
- In-memory Map with TTL (configurable, default 60 minutes)
- Keys are lowercase package names
- Cache is cleared on extension deactivation

### Concurrency Control
- PyPI client uses `ConcurrencyLimiter` class
- Max 5 concurrent requests to PyPI API
- 10-second timeout per request

### Risk Analysis
Version updates are classified by risk:
- **Patch** (same major.minor): Low risk, green icon
- **Minor** (same major): Medium risk, blue info icon
- **Major** (different major): High risk, warning icon with confirmation dialog

## Configuration

Configuration section: `pyDepsHint`

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the extension |
| `showPrerelease` | boolean | `false` | Include pre-release versions |
| `cacheTTLMinutes` | number | `60` | Cache time-to-live in minutes |
| `supportPyProject` | boolean | `true` | Enable pyproject.toml support |

## Internationalization

Supported languages (9):
- English (en) - default
- Simplified Chinese (zh-cn)
- Traditional Chinese (zh-tw)
- Japanese (ja)
- Korean (ko)
- French (fr)
- German (de)
- Spanish (es)
- Russian (ru)

Locale detection uses `vscode.env.language`, with fallback to English.

## Testing

- **Framework**: Mocha with Chai assertions
- **Property Testing**: fast-check for generative testing
- **Test Files**: `src/test/**/*.test.ts`
- **Setup**: `src/test/setup.ts` configures Chai
- **Timeout**: 10 seconds per test

```bash
# Run tests
npm test

# Tests use ts-node to run TypeScript directly
```

## Code Style Guidelines

### TypeScript Configuration
- Strict mode enabled
- Source maps and declaration maps generated
- Consistent file casing enforced
- ES Module interop enabled

### Naming Conventions
- PascalCase for classes and interfaces
- camelCase for functions and variables
- Descriptive names with full words

### Comments
- JSDoc comments for all exported functions
- Reference to requirement IDs in module headers (e.g., `Validates: Requirements 1.1, 1.2`)

### Error Handling
- Try-catch blocks for async operations
- Graceful degradation (skip failed packages rather than fail entire operation)
- User-friendly error messages via VS Code notifications

## Security Considerations

1. **No Automatic Updates**: All updates require explicit user action
2. **Major Version Confirmation**: Modal dialogs for high-risk updates
3. **Batch Update Safety**: Separates safe and risky updates, requires confirmation for risky ones
4. **Network Safety**: Timeout on PyPI requests, concurrency limiting to prevent abuse
5. **Input Validation**: Package name validation against regex before API calls

## Deployment Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Run `npm run vscode:prepublish` (compiles)
4. Use `publish.sh` (macOS/Linux) or `publish.bat` (Windows), or:
   ```bash
   npx vsce login cookabc
   npx vsce publish
   ```

### Required for Publishing
- Azure DevOps account with Marketplace permissions
- Personal Access Token with Marketplace scope
- Public GitHub repository matching `package.json` URLs

## VS Code Contribution Points

### Commands
- `pyDepsHint.updateVersion` - Update single package
- `pyDepsHint.updateAllVersions` - Batch update all packages
- `pyDepsHint.showUpToDate` - No-op for styling up-to-date packages

### Languages
- `pip-requirements` - requirements.txt files
- `toml` - pyproject.toml files

### Colors
- `pyDepsHint.upToDate` - Green for up-to-date packages
- `pyDepsHint.updateAvailable` - Orange for update available

## Key Implementation Notes

1. **Debounced Updates**: Document changes trigger CodeLens refresh after 300ms delay
2. **Version Parsing**: Supports semver with pre-release identifiers (a, alpha, b, beta, rc, dev, pre, post)
3. **Constraint Support**: Handles `==`, `!=`, `>=`, `<=`, `>`, `<`, `~=` operators
4. **Extras Handling**: Package names with extras (e.g., `uvicorn[standard]`) are properly parsed
5. **TOML Preservation**: Updates preserve original formatting including quotes and operators
