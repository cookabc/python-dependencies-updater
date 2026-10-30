# Changelog

All notable changes to the "npm-dependencies-updater" extension will be documented in this file.

## [0.2.1] - 2026-10-11

### Fixed

- Hover summaries and homepage links work again: they read from the full
  registry document, because the abbreviated (corgi) response used since
  0.2.0 carries neither `description` nor `homepage`.
- Packages that fail to fetch (404, network errors) are negative-cached for
  5 minutes with a retry action on the CodeLens, instead of re-requesting on
  every scroll or hover with the lens stuck on "Checking...".
- Updates aim at the dependency's current position: single updates re-locate
  the version string and "Update All" re-matches the document when it changed
  during the scan, so edits never land on stale offsets.
- Compound version ranges keep their upper bound (">=1.2 <2.0" style), and
  only the first alternative of an OR range is bumped.

### Changed

- `peerDependencies` are excluded from "Update All" — they express host
  compatibility windows, not pins.
- `npmDeps.showPrerelease` is now actually implemented (it picks the newest
  version including pre-releases from the registry document).
- Cache keys include the registry host; switching registries no longer
  serves data from the previous one. Scoped package requests encode the
  slash and requests carry a User-Agent.
- CI runs `npm ci`, biome check and the tests on every push/PR.

## [0.2.0] - 2026-02-28

### Added

- `npmDeps.enabled` setting now actively controls extension behavior.
- Configuration change listener — settings take effect immediately without reload.
- Typed `DependencyCodeLens` subclass, eliminating unsafe `as any` casts.

### Improved

- Parallelized "Update All" command using `Promise.allSettled` for significant speed improvement.
- Uses abbreviated NPM registry metadata endpoint (`application/vnd.npm.install-v1+json`) for smaller responses.
- Type-safe `updates` array with proper `ParsedDependency` and `PackageVersionInfo` types.
- `getVersionRange` returns `undefined` instead of a zero-range fallback, preventing silent corruption.
- Fixed `zh-tw`/`zh-hk` locale falling back to non-existent messages (now correctly falls back to `zh-cn`).
- Updated `AGENTS.md` to reflect correct version and TypeScript target.

### Removed

- Removed `test-manual.js` compiled file from repository.

## [0.1.1] - 2026-02-14

### Fixed

- Fixed extension bundling issue where `jsonc-parser` was not correctly included.
- Fixed `lint-staged` configuration.

## [0.0.1] - 2026-02-13

- Initial release of NPM Dependencies Updater.
- Support for scanning `package.json` and checking version status.
- Support for one-click updates with risk detection (major/minor/patch).
- Status bar integration for dependency summary.
- Multi-language support (English/Chinese).
- NPM registry integration.
