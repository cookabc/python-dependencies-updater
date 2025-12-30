# Change Log

All notable changes to the "Python Requirements Updater" extension will be documented in this file.

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