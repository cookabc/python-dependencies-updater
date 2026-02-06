# Copilot Instructions

## Build & Test Commands

```bash
npm run compile        # TypeScript → out/
npm run watch          # Auto-recompile on changes
npm test               # Run all tests
npm run lint           # ESLint

# Run a single test file
npx mocha --require ts-node/register src/test/unit/parser.test.ts

# Run tests matching a pattern
npx mocha --require ts-node/register --grep "pattern" 'src/test/**/*.test.ts'
```

## Architecture

This is a VS Code extension that shows inline CodeLens hints on Python dependency files (`requirements.txt` and `pyproject.toml`), displaying version status and enabling one-click updates.

### Data Flow

1. **Activation** (`extension.ts`): Registers a `CodeLensProvider` for `pip-requirements` and `toml` language IDs, plus three commands (`updateVersion`, `updateAllVersions`, `showUpToDate`).
2. **Parsing** (`core/unifiedParser.ts`): Detects file type and delegates to `parser.ts` (requirements.txt) or `pyprojectParser.ts` (pyproject.toml). Both return `ParsedDependency` or `PyProjectDependency` arrays.
3. **Version Resolution** (`providers/versionService.ts`): Orchestrates cache → PyPI fetch → version resolution. Cache is an in-memory Map with configurable TTL.
4. **PyPI Client** (`providers/pypiClient.ts`): Fetches from `https://pypi.org/pypi/{package}/json` with a `ConcurrencyLimiter` (max 5 parallel, 10s timeout).
5. **Risk Analysis** (`core/versionAnalyzer.ts`): Classifies updates as patch/minor/major. Major updates trigger a confirmation dialog.
6. **CodeLens Rendering** (`providers/codeLensProvider.ts`): Assembles CodeLens items with risk-appropriate icons and click-to-update commands.

### Key Types

All interfaces are in `types/index.ts`: `ParsedDependency`, `PyProjectDependency`, `VersionInfo`, `VersionAnalysis`, `ExtensionConfig`. The unified parser uses `AnyDependency = ParsedDependency | PyProjectDependency` and discriminates via `"section" in dep`.

## Conventions

- **Configuration namespace**: All VS Code settings use the `pyDepsHint.` prefix. The configuration section is `pyDepsHint`.
- **Commands namespace**: All commands use `pyDepsHint.` prefix (e.g., `pyDepsHint.updateVersion`).
- **i18n**: All user-facing strings go through `t()` from `utils/i18n.ts`. 9 locales are supported inline (no external files). Add new keys to the `Messages` interface and all locale objects.
- **Module headers**: Each source file has a JSDoc comment referencing requirement IDs (e.g., `Validates: Requirements 1.1, 1.2`).
- **Error handling**: Async operations use try-catch with graceful degradation — failed packages are skipped, never crash the extension.
- **File type discrimination**: `PyProjectDependency` vs `ParsedDependency` is determined by checking `"section" in dep` (duck typing on the union type).
- **Testing**: Mocha + Chai for unit tests, fast-check for property-based tests. Tests live in `src/test/` and run via ts-node (no compile step needed). 10-second timeout per test.
- **pyproject.toml parsing**: Uses text-based regex parsing (not the `@iarna/toml` dependency) for dependency extraction to preserve formatting on updates.
