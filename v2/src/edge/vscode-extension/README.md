# Agentic QE Companion

AI-powered Quality Engineering assistant for VS Code with test suggestions, coverage analysis, and pattern recognition.

![Version](https://img.shields.io/visual-studio-marketplace/v/agentic-qe.agentic-qe-companion)
![Installs](https://img.shields.io/visual-studio-marketplace/i/agentic-qe.agentic-qe-companion)
![Rating](https://img.shields.io/visual-studio-marketplace/r/agentic-qe.agentic-qe-companion)

## Features

### Test Suggestions

Get intelligent test suggestions based on your code patterns. The extension analyzes your functions and classes to recommend relevant test cases.

![Test Suggestions](https://raw.githubusercontent.com/proffesor-for-testing/agentic-qe/main/docs/images/vscode-test-suggestions.png)

- **Inline Hints**: See test suggestions directly in your editor
- **Pattern Matching**: Leverages learned patterns from successful tests
- **Multi-Framework**: Supports Jest, Vitest, Mocha, Playwright, Cypress

### Coverage Analysis

Visualize test coverage directly in your editor with highlighted gaps.

- **Coverage Overlay**: Toggle coverage highlighting on/off
- **Gap Detection**: Identify untested code paths
- **Gutter Indicators**: Quick visual status per line

### Code Analysis

Analyze your code for testability and complexity.

- **Testability Scoring**: Get a score (0-100) for how testable your code is
- **Complexity Metrics**: Cyclomatic and cognitive complexity
- **Refactoring Suggestions**: Recommendations to improve testability

## Commands

Access commands via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `Agentic QE: Analyze Current File` | Analyze the current file for patterns |
| `Agentic QE: Generate Tests for Selection` | Generate tests for selected code |
| `Agentic QE: Generate Test (Multi-Step)` | Step-by-step test generation wizard |
| `Agentic QE: Suggest Tests for Function` | Get test suggestions for a function |
| `Agentic QE: Toggle Coverage Overlay` | Show/hide coverage highlighting |
| `Agentic QE: Show Coverage Gaps` | Display uncovered code sections |
| `Agentic QE: View Stored Patterns` | Browse learned test patterns |
| `Agentic QE: Clear Pattern Cache` | Reset stored patterns |

## Context Menu

Right-click in the editor to access:

- **Generate Tests for Selection** - When text is selected
- **Analyze Current File** - Analyze the open file
- **Generate Test (Multi-Step)** - Guided test creation
- **Toggle Coverage Overlay** - Quick coverage toggle

## Settings

Configure the extension in VS Code Settings (`Ctrl+,`):

| Setting | Default | Description |
|---------|---------|-------------|
| `aqe.enableAutoAnalysis` | `true` | Automatically analyze files on save |
| `aqe.showCoverageDecorations` | `true` | Show coverage decorations in gutter |
| `aqe.showTestSuggestions` | `true` | Show test suggestions as code actions |
| `aqe.showInlineHints` | `true` | Show inline hints after functions |
| `aqe.showCoverageOverlay` | `false` | Enable coverage overlay by default |
| `aqe.lowTestabilityThreshold` | `50` | Threshold for testability warnings |
| `aqe.defaultTestFramework` | `jest` | Default test framework |
| `aqe.defaultTestType` | `unit` | Default test type |
| `aqe.vectorDimension` | `384` | Vector dimension for pattern matching |
| `aqe.debugMode` | `false` | Enable debug logging |

## How It Works

The extension uses WASM-accelerated vector search (`@ruvector/edge`) to:

1. **Extract Patterns**: Parse your code to identify functions, classes, and patterns
2. **Generate Embeddings**: Create vector representations of code patterns
3. **Search Similar**: Find similar patterns from the learned database
4. **Suggest Tests**: Recommend tests based on successful patterns

### Pattern Learning

The extension learns from:
- Your existing test files
- Successful test patterns across projects
- Community-shared patterns (via P2P, optional)

## Requirements

- VS Code 1.85.0 or higher
- TypeScript/JavaScript projects

## Companion CLI

This extension is part of the [Agentic QE](https://www.npmjs.com/package/agentic-qe) quality engineering toolkit.

```bash
# Install CLI for full agent capabilities
npm install -g agentic-qe
aqe init
```

## Privacy

- All pattern analysis runs **locally** using WASM
- No code is sent to external servers
- P2P pattern sharing is **opt-in** and encrypted

## Links

- [Documentation](https://github.com/proffesor-for-testing/agentic-qe)
- [Report Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)
- [Changelog](CHANGELOG.md)

## License

MIT License - see [LICENSE](LICENSE) for details.
