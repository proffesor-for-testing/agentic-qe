# Contributing to Agentic QE

Thank you for your interest in contributing to Agentic QE! We're excited to have you join our community of developers building the future of AI-driven quality engineering.

This document provides guidelines for contributing to the project. Following these guidelines helps maintain code quality and makes the contribution process smooth for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Message Convention](#commit-message-convention)
- [Pull Request Process](#pull-request-process)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project adheres to a Code of Conduct that we expect all contributors to follow. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description** - Summarize the issue concisely
- **Steps to reproduce** - Detailed steps to recreate the bug
- **Expected vs actual behavior** - What should happen vs what happens
- **Environment details** - OS, Node.js version, package version
- **Code samples** - Minimal reproducible example if possible
- **Screenshots** - If applicable, add visual evidence

**Example Bug Report:**

```markdown
**Bug:** Test generation fails for async functions with try-catch blocks

**Environment:**
- OS: Ubuntu 22.04
- Node.js: 18.17.0
- Agentic QE: 1.2.3

**Steps to Reproduce:**
1. Run `aqe test src/async-handler.ts`
2. Observe error in console

**Expected:** Tests generated successfully
**Actual:** TypeError: Cannot read property 'body' of undefined

**Code Sample:**
\`\`\`typescript
async function fetchData() {
  try {
    const response = await fetch('/api/data');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
}
\`\`\`
```

### Suggesting Features

Feature suggestions are welcome! Please provide:

- **Clear use case** - Why is this feature needed?
- **Proposed solution** - How should it work?
- **Alternatives considered** - Other approaches you've thought about
- **Implementation ideas** - Technical approach if you have thoughts

**Example Feature Request:**

```markdown
**Feature:** Visual regression testing agent

**Use Case:**
Teams need to catch UI regressions automatically. Manual visual testing
is time-consuming and error-prone.

**Proposed Solution:**
Add `qe-visual-tester` agent that:
- Captures screenshots during test execution
- Compares against baseline images
- Highlights visual differences
- Integrates with existing test suite

**Alternatives:**
- Manual visual testing (current state)
- Separate visual testing tools (adds complexity)

**Implementation Ideas:**
- Use Playwright for screenshot capture
- Leverage pixelmatch for image comparison
- Store baselines in project .visual-baselines/ directory
```

### Code Contributions

We love code contributions! Here's how to get started:

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a feature branch** from `main`
4. **Make your changes** following coding standards
5. **Write or update tests** for your changes
6. **Run the test suite** to ensure nothing breaks
7. **Commit your changes** using conventional commits
8. **Push to your fork** and submit a pull request

### Documentation Improvements

Documentation is crucial! You can contribute by:

- Fixing typos or clarifying existing docs
- Adding examples and use cases
- Writing tutorials or guides
- Improving API documentation
- Translating documentation (future)

## Development Setup

### Prerequisites

Before contributing to Agentic QE, you must have:

#### Required
- **Claude Code**: Install from [claude.ai/code](https://claude.ai/code) - Required for agent execution
- **Node.js** >= 18.0.0 (LTS recommended)
- **npm** >= 9.0.0 or **pnpm** >= 8.0.0
- **Git** >= 2.30.0
- **TypeScript** >= 5.0.0 (installed via npm)

#### Optional (Advanced Development)
- **Claude Flow**: For advanced coordination
  ```bash
  npm install -g @claude/flow
  # or
  npx claude-flow@alpha setup
  ```

### Understanding the Agent Execution Model

**Important**: Agentic QE agents are NOT standalone Node.js processes. They are:
- **Claude Code agent definitions** (markdown files in `.claude/agents/`)
- **Executed via Claude Code's Task tool**: `Task("description", "prompt", "agent-type")`
- **Integrated via MCP** (Model Context Protocol)
- **Coordinated through hooks** for cross-agent communication

When developing agents, you're creating:
1. Agent definition files (`.claude/agents/qe-*.md`)
2. TypeScript implementations in `src/agents/`
3. MCP handlers in `src/mcp/handlers/`
4. Tests in `tests/agents/` and `tests/integration/`

### Installation Steps

1. **Clone the repository:**

```bash
git clone https://github.com/proffesor-for-testing/agentic-qe-cf.git
cd agentic-qe-cf/agentic-qe
```

2. **Install dependencies:**

```bash
npm install
# or
pnpm install
```

3. **Build the project:**

```bash
npm run build
```

4. **Verify installation:**

```bash
npm run test
./bin/aqe --version
```

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm run test -- tests/agents/TestGeneratorAgent.test.ts

# Run integration tests only
npm run test:integration
```

### Development Workflow

```bash
# Start development mode (watch for changes)
npm run dev

# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Type checking
npm run typecheck

# Format code
npm run format

# Run all checks (lint + typecheck + test)
npm run validate
```

## Coding Standards

### TypeScript Style Guide

We follow strict TypeScript conventions for type safety and code quality:

**Naming Conventions:**

```typescript
// Classes: PascalCase
class TestGeneratorAgent { }

// Interfaces: PascalCase with 'I' prefix (optional but preferred)
interface IAgentConfig { }
interface AgentConfig { } // Also acceptable

// Types: PascalCase
type TestFramework = 'jest' | 'mocha' | 'vitest';

// Functions and methods: camelCase
function generateTests() { }
async function analyzeCode() { }

// Variables and constants: camelCase
const maxRetries = 3;
let currentAttempt = 0;

// Constants (truly immutable): UPPER_SNAKE_CASE
const DEFAULT_TIMEOUT = 5000;
const MAX_AGENTS = 16;

// Private class members: prefix with underscore
class Agent {
  private _internalState: State;
  private _config: Config;
}

// File names: kebab-case
// test-generator-agent.ts
// coverage-analyzer.ts
```

**Code Organization:**

```typescript
// 1. Imports (grouped and sorted)
import { readFile } from 'fs/promises';
import path from 'path';

import type { AgentConfig } from '../types';
import { BaseAgent } from './base-agent';
import { Logger } from '../utils/logger';

// 2. Type definitions and interfaces
interface GeneratorOptions {
  framework: TestFramework;
  coverage: boolean;
}

// 3. Constants
const DEFAULT_OPTIONS: GeneratorOptions = {
  framework: 'jest',
  coverage: true,
};

// 4. Class implementation
export class TestGeneratorAgent extends BaseAgent {
  // Public properties first
  public readonly name = 'TestGenerator';

  // Private properties
  private _options: GeneratorOptions;

  // Constructor
  constructor(options?: Partial<GeneratorOptions>) {
    super();
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  // Public methods
  async generate(filePath: string): Promise<string> {
    // Implementation
  }

  // Private methods
  private async _analyzeFile(path: string): Promise<Analysis> {
    // Implementation
  }
}

// 5. Helper functions (if any)
function formatTestName(name: string): string {
  return name.replace(/([A-Z])/g, ' $1').trim();
}
```

**Best Practices:**

```typescript
// ✅ DO: Use async/await over promises
async function fetchData(): Promise<Data> {
  const response = await fetch('/api/data');
  return await response.json();
}

// ❌ DON'T: Use promise chains
function fetchData(): Promise<Data> {
  return fetch('/api/data')
    .then(response => response.json());
}

// ✅ DO: Use type guards
function isError(value: unknown): value is Error {
  return value instanceof Error;
}

// ✅ DO: Use optional chaining and nullish coalescing
const config = userConfig?.timeout ?? DEFAULT_TIMEOUT;

// ✅ DO: Prefer readonly for immutable data
interface Config {
  readonly timeout: number;
  readonly retries: number;
}

// ✅ DO: Use discriminated unions for state
type AgentState =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'error'; error: Error };

// ✅ DO: Document complex logic
/**
 * Analyzes test coverage using sublinear algorithms.
 *
 * Implements O(log n) coverage analysis through:
 * 1. Binary search over test execution traces
 * 2. Sparse matrix representation of code paths
 * 3. Probabilistic coverage estimation
 *
 * @param testResults - Array of test execution results
 * @returns Coverage analysis with gap identification
 */
async function analyzeCoverage(testResults: TestResult[]): Promise<CoverageAnalysis> {
  // Implementation
}
```

### File Size Limits

- Keep files under **500 lines** when possible
- Extract large functions into separate modules
- Use the single responsibility principle

### Testing Requirements

Every contribution must include tests:

- **Unit tests** for new functions/classes (required)
- **Integration tests** for new features (required)
- **Edge cases** and error conditions (required)
- Aim for **80%+ code coverage** (enforced)

```typescript
// Example test structure
describe('TestGeneratorAgent', () => {
  let agent: TestGeneratorAgent;

  beforeEach(() => {
    agent = new TestGeneratorAgent();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generate', () => {
    it('should generate tests for a simple function', async () => {
      // Arrange
      const filePath = '/path/to/file.ts';
      const expectedTests = expect.stringContaining('describe');

      // Act
      const result = await agent.generate(filePath);

      // Assert
      expect(result).toBe(expectedTests);
    });

    it('should handle async functions', async () => {
      // Test async behavior
    });

    it('should throw error for invalid file path', async () => {
      // Test error handling
      await expect(agent.generate('/invalid')).rejects.toThrow();
    });
  });
});
```

### Documentation Requirements

- **JSDoc comments** for all public APIs
- **Inline comments** for complex logic
- **README updates** for new features
- **Type definitions** with descriptions

```typescript
/**
 * Base agent class providing core functionality for all AQE agents.
 *
 * All specialized agents (TestGenerator, CoverageAnalyzer, etc.) extend
 * this class to inherit coordination, memory, and lifecycle management.
 *
 * @example
 * ```typescript
 * class CustomAgent extends BaseAgent {
 *   constructor() {
 *     super({ name: 'CustomAgent', version: '1.0.0' });
 *   }
 *
 *   async execute() {
 *     await this.storeMemory('key', 'value');
 *     return { success: true };
 *   }
 * }
 * ```
 */
export abstract class BaseAgent {
  /**
   * Unique identifier for this agent instance.
   * Generated automatically on instantiation.
   */
  readonly id: string;

  /**
   * Stores data in the shared memory system for cross-agent communication.
   *
   * @param key - Memory key (use 'aqe/agent-name/key' convention)
   * @param value - Data to store (must be JSON-serializable)
   * @throws {MemoryError} If storage fails or quota exceeded
   */
  protected async storeMemory(key: string, value: unknown): Promise<void> {
    // Implementation
  }
}
```

## Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) for clear, structured commit history.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, semicolons, etc.)
- **refactor**: Code refactoring without behavior change
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (dependencies, build, etc.)
- **ci**: CI/CD changes
- **revert**: Reverting previous commits

### Scopes

Use component names as scopes:

- **agent**: Agent-related changes
- **mcp**: MCP server/handler changes
- **cli**: CLI command changes
- **core**: Core framework changes
- **test**: Test infrastructure changes

### Examples

```bash
# Feature
feat(agent): add visual regression testing agent

Implements new agent for visual testing with screenshot comparison.

- Captures screenshots using Playwright
- Compares against baseline images
- Highlights visual differences
- Integrates with existing test suite

Closes #123

# Bug fix
fix(mcp): handle undefined agent configs gracefully

Fixes crash when agent config is missing optional fields.

Fixes #456

# Documentation
docs(readme): update installation instructions

Add prerequisite versions and troubleshooting section.

# Refactoring
refactor(agent): extract common test generation logic

Moves shared test generation code to base class to reduce duplication.

# Performance
perf(coverage): optimize O(log n) coverage analysis

Implements sparse matrix representation reducing memory usage by 40%.
```

### Rules

- Use imperative mood ("add feature" not "added feature")
- Keep subject line under 72 characters
- Capitalize first letter of subject
- No period at end of subject
- Separate subject from body with blank line
- Wrap body at 72 characters
- Use body to explain what and why, not how

## Pull Request Process

### Branch Naming

Use descriptive branch names with prefixes:

```bash
# Features
git checkout -b feat/visual-testing-agent
git checkout -b feat/add-playwright-integration

# Bug fixes
git checkout -b fix/async-test-generation
git checkout -b fix/memory-leak-in-analyzer

# Documentation
git checkout -b docs/contributing-guide
git checkout -b docs/api-reference-update

# Refactoring
git checkout -b refactor/test-generator-cleanup
```

### Before Submitting

1. **Update your branch** with latest main:
   ```bash
   git checkout main
   git pull origin main
   git checkout your-branch
   git rebase main
   ```

2. **Run all checks**:
   ```bash
   npm run validate  # Runs lint, typecheck, and tests
   npm run test:coverage  # Ensure 80%+ coverage
   ```

3. **Update documentation** if needed

4. **Write clear commit messages** following conventions

### Pull Request Template

When creating a PR, include:

```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] All tests passing locally
- [ ] Coverage maintained at 80%+

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Dependent changes merged and published

## Related Issues
Closes #123
Related to #456

## Screenshots (if applicable)
Add screenshots for UI changes.

## Additional Context
Any other relevant information.
```

### Review Process

1. **Automated checks** must pass (CI/CD pipeline)
2. **At least one maintainer** review required
3. **Address feedback** promptly and professionally
4. **Squash commits** if requested to maintain clean history
5. **Update branch** if main has advanced

### Merge Criteria

PRs will be merged when:

- ✅ All CI checks pass
- ✅ Code review approved by maintainer(s)
- ✅ Test coverage maintained (80%+)
- ✅ Documentation updated
- ✅ No merge conflicts
- ✅ Conventional commits followed

## Testing Guidelines

### Unit Tests

Test individual functions and classes in isolation:

```typescript
// tests/agents/test-generator.test.ts
import { TestGeneratorAgent } from '../../src/agents/TestGeneratorAgent';

describe('TestGeneratorAgent', () => {
  describe('generateTestSuite', () => {
    it('should generate Jest test suite for simple function', async () => {
      const agent = new TestGeneratorAgent({ framework: 'jest' });
      const sourceCode = `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `;

      const result = await agent.generateTestSuite(sourceCode);

      expect(result).toContain('describe');
      expect(result).toContain('it(');
      expect(result).toContain('expect');
    });

    it('should handle edge cases correctly', async () => {
      // Test edge cases
    });

    it('should throw ValidationError for invalid input', async () => {
      const agent = new TestGeneratorAgent();

      await expect(agent.generateTestSuite('')).rejects.toThrow(ValidationError);
    });
  });
});
```

### Integration Tests

Test component interactions and end-to-end workflows:

```typescript
// tests/integration/test-generation-flow.test.ts
describe('Test Generation Flow', () => {
  it('should generate and execute tests for real project', async () => {
    // Arrange
    const projectPath = '/path/to/sample-project';
    const generator = new TestGeneratorAgent();
    const executor = new TestExecutorAgent();

    // Act - Generate tests
    const tests = await generator.generateForProject(projectPath);

    // Act - Execute tests
    const results = await executor.execute(tests);

    // Assert
    expect(results.passed).toBeGreaterThan(0);
    expect(results.coverage).toBeGreaterThanOrEqual(80);
  });
});
```

### Test Organization

```
tests/
├── agents/                    # Unit tests for agents
│   ├── TestGeneratorAgent.test.ts
│   ├── CoverageAnalyzerAgent.test.ts
│   └── ...
├── mcp/                       # Unit tests for MCP handlers
│   ├── test-generate.test.ts
│   └── test-execute.test.ts
├── integration/               # Integration tests
│   ├── test-generation-flow.test.ts
│   ├── coverage-analysis-flow.test.ts
│   └── ...
└── fixtures/                  # Test fixtures and mocks
    ├── sample-code.ts
    └── mock-data.json
```

### Coverage Expectations

- **Overall coverage**: 80%+
- **Critical paths**: 95%+
- **New code**: 100% (or justify exceptions)
- **Edge cases**: Well tested

Run coverage report:

```bash
npm run test:coverage

# View HTML report
open coverage/lcov-report/index.html
```

### Mocking Best Practices

```typescript
// Use Jest mocks for external dependencies
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

// Mock implementations
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
mockReadFile.mockResolvedValue('file content');

// Verify mock calls
expect(mockReadFile).toHaveBeenCalledWith('/path/to/file', 'utf-8');
```

## Documentation

### Code Comments

```typescript
// ✅ Good: Explains WHY, not what
// Use binary search because array is pre-sorted by timestamp
const index = binarySearch(items, timestamp);

// ❌ Bad: Explains what code already shows
// Search the array for the timestamp
const index = binarySearch(items, timestamp);

// ✅ Good: Documents complex algorithm
/**
 * Implements sublinear coverage analysis using probabilistic sampling.
 *
 * Algorithm complexity: O(log n)
 * Memory usage: O(1) for sparse matrices
 *
 * Trade-offs:
 * - 99.9% accuracy with 0.1% false positive rate
 * - 40% faster than full coverage analysis
 * - Suitable for projects with 10K+ test cases
 */
```

### API Documentation

Use JSDoc for all public APIs:

```typescript
/**
 * Analyzes test coverage and identifies gaps using sublinear algorithms.
 *
 * @param options - Configuration options
 * @param options.projectPath - Path to project root
 * @param options.threshold - Minimum coverage threshold (0-100)
 * @param options.algorithms - Sublinear algorithms to use
 * @returns Coverage analysis with gap identification
 * @throws {ValidationError} If project path is invalid
 * @throws {AnalysisError} If coverage analysis fails
 *
 * @example
 * ```typescript
 * const analyzer = new CoverageAnalyzerAgent();
 * const analysis = await analyzer.analyze({
 *   projectPath: '/path/to/project',
 *   threshold: 80,
 *   algorithms: ['binary-search', 'sparse-matrix']
 * });
 *
 * console.log(`Coverage: ${analysis.percentage}%`);
 * console.log(`Gaps: ${analysis.gaps.length}`);
 * ```
 */
```

### README Updates

When adding features, update relevant README sections:

- Installation steps if dependencies change
- Usage examples for new commands
- Configuration options for new settings
- Troubleshooting for common issues

## Community

### Getting Help

- **GitHub Discussions**: Ask questions and share ideas
- **Discord Server**: Real-time chat with maintainers and community
- **Stack Overflow**: Tag questions with `agentic-qe`
- **GitHub Issues**: Bug reports and feature requests

### Communication Channels

- **GitHub Discussions**: https://github.com/agentic-qe/agentic-qe-cf/discussions
- **Discord**: [Join our server](#) (link TBD)
- **Twitter**: [@AgenticQE](#) (link TBD)
- **Blog**: [blog.agentic-qe.dev](#) (link TBD)

### Recognition

We value all contributions! Contributors are recognized in:

- **CONTRIBUTORS.md**: All contributors listed
- **Release notes**: Significant contributions highlighted
- **GitHub profile**: Contribution graph and badges
- **Monthly spotlight**: Featured contributors in blog posts

### Mentorship

New to open source? We're here to help!

- **Good first issues**: Tagged for beginners
- **Mentorship program**: Pair with experienced contributors
- **Documentation**: Extensive guides and examples
- **Code reviews**: Constructive feedback to learn and grow

## Questions?

Don't hesitate to ask! Open a discussion or reach out to maintainers. We're here to help and excited to have you contribute to Agentic QE.

Thank you for contributing! 🎉

---

**License**: By contributing, you agree that your contributions will be licensed under the project's license.

**Attribution**: This contributing guide was inspired by open-source best practices from projects like TypeScript, Jest, and Playwright.
