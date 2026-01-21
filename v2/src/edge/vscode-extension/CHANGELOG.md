# Changelog

All notable changes to the Agentic QE Companion extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-01-03

### Added
- **WASM-accelerated vector search** via `@ruvector/edge` for fast pattern matching
- **Fallback mode** when WASM is unavailable (brute-force cosine similarity)
- **Coverage overlay** with toggle command and gutter decorations
- **Testability scoring** with inline warnings for low-testability code
- **Multi-step test generation wizard** with framework and type selection
- **Pattern storage** with VS Code workspace persistence
- **15+ editor commands** for test generation, analysis, and coverage
- **Context menu integration** for quick access to common actions
- **Inline hints** showing test suggestions after function declarations
- **Hover previews** for test suggestions

### Changed
- Improved pattern extraction with better function/class detection
- Enhanced embedding generation for more accurate similarity matching
- Updated to VS Code API 1.85.0+

### Fixed
- Extension activation when `@ruvector/edge` module is bundled in VSIX

## [0.1.0] - 2025-01-02

### Added
- Initial release
- Basic code analysis for TypeScript/JavaScript
- Simple test suggestion based on function signatures
- VS Code sidebar panel for QE dashboard
- Configuration options for test frameworks
