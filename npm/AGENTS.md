# NPM Dependencies Updater - Agent Guide

## Project Overview

This is a **VS Code Extension** that provides smart version management for `package.json` files. It displays inline version hints and enables one-click updates with breaking change detection.

- **Extension Name**: NPM Dependencies Updater
- **Publisher**: cookabc
- **Version**: 0.2.1
- **License**: MIT
- **Repository**: https://github.com/cookabc/npm-dependencies-updater

## Technology Stack

- **Language**: TypeScript 5.3.2
- **Target**: ES2020, CommonJS modules
- **Runtime**: Node.js (VS Code Extension Host)
- **VS Code Engine**: ^1.85.0

### Dependencies

- `jsonc-parser` (^3.2.0) - Robust JSON/JSONC parsing for package.json
- `semver` (^7.5.4) - Semantic versioning utilities

### Dev Dependencies

- `typescript` (^5.3.2)
- `eslint` (^8.54.0) with `@typescript-eslint/*` plugins
- `mocha` (^10.2.0) + `chai` (^4.3.10) - Unit testing
- `ts-node` (^10.9.2) - TypeScript execution for tests
- `@types/vscode` (1.85.0, pinned) - VS Code API types. The types minor must not exceed the `engines.vscode` minor (`^1.85.0`). A newer minor fails `vsce package`, and a `^` range drifts back to a newer minor on install.

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
│   ├── cache.ts             # In-memory cache with TTL for NPM data
│   ├── packageJsonParser.ts # package.json parser using jsonc-parser
│   └── versionResolver.ts   # Version comparison and risk analysis
├── providers/               # Service providers
│   ├── codeLensProvider.ts  # VS Code CodeLens provider (main UI)
│   ├── npmClient.ts         # NPM Registry API client
│   └── versionService.ts    # Coordinates cache, client, and resolver
├── utils/                   # Utility functions
│   └── statusBar.ts         # Status bar manager
├── types/                   # TypeScript type definitions
│   └── index.ts
└── extension.ts             # Extension entry point (activate/deactivate)
```

### Output Structure

```
out/                         # Compiled JavaScript (gitignored)
├── extension.js             # Main entry point
├── core/
├── providers/
├── utils/
├── types/
└── test/
```

## Architecture

### Extension Activation

1. `extension.ts` exports `activate()` and `deactivate()` functions
2. Registers CodeLens provider for `json` and `jsonc` languages
3. Registers commands: `npmDeps.updateVersion`, `npmDeps.updateAllVersions`, `npmDeps.showUpToDate`, `npmDeps.openOnNpm`
4. Initializes `StatusBarManager` for update summaries

### Data Flow

1. `NpmCodeLensProvider` scans `package.json` for dependencies
2. Calls `VersionService` to get the latest version for each package
3. `VersionService` checks `Cache` first, then uses `NpmClient` if needed
4. `NpmClient` fetches metadata from `registry.npmjs.org`
5. `VersionResolver` compares current vs latest and determines risk (major/minor/patch)
6. CodeLenses are rendered with appropriate icons and labels
7. Users can trigger updates via CodeLens or Status Bar, which uses `vscode.WorkspaceEdit` to safely update `package.json`
