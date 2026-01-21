/**
 * Agentic QE v3 - Test Counter
 *
 * Counts tests using actual test runners (vitest, jest, cargo, pytest, go).
 * Part of RM-003 implementation for real metric measurement.
 *
 * Detection priority by project type:
 * 1. Node.js: vitest > jest > fallback pattern matching
 * 2. Rust: cargo test --list
 * 3. Python: pytest --collect-only
 * 4. Go: go test -list
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 5, RM-003
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import {
  TestMetrics,
  TestSource,
  ToolAvailability,
  MetricCollectorConfig,
  DEFAULT_METRIC_CONFIG,
} from './interfaces.js';

// ============================================================================
// Main Test Counting Function
// ============================================================================

/**
 * Count tests using the appropriate test runner
 * Automatically detects the project type and uses the correct runner.
 *
 * @param projectPath - Absolute path to project root
 * @param config - Optional configuration overrides
 * @returns TestMetrics with accurate test counts
 */
export async function countTests(
  projectPath: string,
  config: Partial<MetricCollectorConfig> = {}
): Promise<TestMetrics> {
  const mergedConfig = { ...DEFAULT_METRIC_CONFIG, ...config };
  const runner = detectTestRunner(projectPath);

  switch (runner) {
    case 'vitest':
      return countVitestTests(projectPath, mergedConfig);
    case 'jest':
      return countJestTests(projectPath, mergedConfig);
    case 'cargo':
      return countCargoTests(projectPath, mergedConfig);
    case 'pytest':
      return countPytestTests(projectPath, mergedConfig);
    case 'go':
      return countGoTests(projectPath, mergedConfig);
    default:
      return countTestsByFilePattern(projectPath, mergedConfig);
  }
}

/**
 * Detect which test runner a project uses
 */
export function detectTestRunner(projectPath: string): TestSource {
  // Check for Node.js project (package.json)
  const packageJsonPath = join(projectPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      // Vitest takes priority (faster, modern)
      if (allDeps.vitest) return 'vitest';
      if (allDeps.jest) return 'jest';

      // Check test scripts for runner hints
      const testScript = pkg.scripts?.test || '';
      if (testScript.includes('vitest')) return 'vitest';
      if (testScript.includes('jest')) return 'jest';
    } catch {
      // Invalid package.json, continue checking
    }
  }

  // Check for Rust project (Cargo.toml)
  if (existsSync(join(projectPath, 'Cargo.toml'))) {
    return 'cargo';
  }

  // Check for Python project
  if (
    existsSync(join(projectPath, 'pyproject.toml')) ||
    existsSync(join(projectPath, 'setup.py')) ||
    existsSync(join(projectPath, 'pytest.ini')) ||
    existsSync(join(projectPath, 'requirements.txt'))
  ) {
    return 'pytest';
  }

  // Check for Go project
  if (existsSync(join(projectPath, 'go.mod'))) {
    return 'go';
  }

  return 'fallback';
}

/**
 * Check which test runners are available on the system
 */
export function checkTestRunners(projectPath: string): ToolAvailability[] {
  const tools: ToolAvailability[] = [];

  // Check npx vitest
  try {
    const result = spawnSync('npx', ['vitest', '--version'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000,
    });
    if (result.status === 0) {
      tools.push({ name: 'vitest', available: true, version: result.stdout.trim() });
    } else {
      tools.push({ name: 'vitest', available: false });
    }
  } catch {
    tools.push({ name: 'vitest', available: false });
  }

  // Check npx jest
  try {
    const result = spawnSync('npx', ['jest', '--version'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000,
    });
    if (result.status === 0) {
      tools.push({ name: 'jest', available: true, version: result.stdout.trim() });
    } else {
      tools.push({ name: 'jest', available: false });
    }
  } catch {
    tools.push({ name: 'jest', available: false });
  }

  // Check cargo
  try {
    const result = spawnSync('cargo', ['--version'], { encoding: 'utf-8', timeout: 5000 });
    if (result.status === 0) {
      tools.push({ name: 'cargo', available: true, version: result.stdout.trim() });
    } else {
      tools.push({ name: 'cargo', available: false });
    }
  } catch {
    tools.push({ name: 'cargo', available: false });
  }

  // Check pytest
  try {
    const result = spawnSync('pytest', ['--version'], { encoding: 'utf-8', timeout: 5000 });
    if (result.status === 0) {
      tools.push({ name: 'pytest', available: true, version: result.stdout.trim() });
    } else {
      tools.push({ name: 'pytest', available: false });
    }
  } catch {
    tools.push({ name: 'pytest', available: false });
  }

  // Check go
  try {
    const result = spawnSync('go', ['version'], { encoding: 'utf-8', timeout: 5000 });
    if (result.status === 0) {
      tools.push({ name: 'go', available: true, version: result.stdout.trim() });
    } else {
      tools.push({ name: 'go', available: false });
    }
  } catch {
    tools.push({ name: 'go', available: false });
  }

  return tools;
}

// ============================================================================
// Runner-Specific Implementations
// ============================================================================

/**
 * Count tests using Vitest
 * Uses `vitest list` for accurate test discovery WITHOUT execution.
 *
 * IMPORTANT: We use `vitest list` (not `vitest --run`) because:
 * - `vitest --run` EXECUTES tests, causing OOM in test-of-tests scenarios
 * - `vitest list` only enumerates tests without running them
 */
function countVitestTests(
  projectPath: string,
  config: MetricCollectorConfig
): TestMetrics {
  try {
    // Use vitest list for safe enumeration (NO execution)
    // --reporter=json gives structured output we can parse
    const output = execSync(
      'npx vitest list --reporter=json 2>/dev/null',
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: Math.min(config.timeout, 30000), // Cap at 30s for listing
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer (reduced from 50MB)
      }
    );

    // Parse JSON output from vitest list
    try {
      const data = JSON.parse(output);

      // vitest list --reporter=json returns array of test files with tests
      if (Array.isArray(data)) {
        let total = 0;
        for (const file of data) {
          // Each file entry has a `tests` array
          if (file.tests && Array.isArray(file.tests)) {
            total += countTestsRecursive(file.tests);
          }
        }
        return classifyTests(total, 'vitest', projectPath);
      }

      // Alternative format: object with numTotalTests
      if (data && typeof data.numTotalTests === 'number') {
        return classifyTests(data.numTotalTests, 'vitest', projectPath);
      }
    } catch {
      // JSON parse failed, try line counting
    }

    // Fallback: count test entries from text output
    // vitest list outputs lines like "✓ test name" or "○ test name"
    const lines = output.split('\n');
    const testLines = lines.filter(line =>
      line.trim().startsWith('✓') ||
      line.trim().startsWith('○') ||
      line.includes(' > ') // nested test format: "describe > test name"
    );

    if (testLines.length > 0) {
      return classifyTests(testLines.length, 'vitest', projectPath);
    }

    // If vitest list produced no usable output, fall back to file pattern
    return countTestsByFilePattern(projectPath, config);
  } catch (error) {
    // vitest list failed (not installed, timeout, etc.) - fall back to file pattern
    return countTestsByFilePattern(projectPath, config);
  }
}

/**
 * Recursively count tests in vitest's nested test structure
 */
function countTestsRecursive(tests: unknown[]): number {
  let count = 0;
  for (const test of tests) {
    if (typeof test === 'object' && test !== null) {
      const t = test as Record<string, unknown>;
      // Count this test if it has a name (actual test, not describe block)
      if (t.type === 'test' || t.mode === 'run' || t.mode === 'skip') {
        count++;
      }
      // Recurse into children (nested describes)
      if (Array.isArray(t.tests)) {
        count += countTestsRecursive(t.tests);
      }
      if (Array.isArray(t.children)) {
        count += countTestsRecursive(t.children);
      }
    }
  }
  return count;
}

/**
 * Count tests using Jest
 * Uses `jest --listTests` for accurate test file discovery WITHOUT execution.
 * Then parses the test files to count individual tests.
 */
function countJestTests(
  projectPath: string,
  config: MetricCollectorConfig
): TestMetrics {
  try {
    // Use jest --listTests for safe enumeration (NO execution)
    const output = execSync(
      'npx jest --listTests 2>/dev/null',
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: Math.min(config.timeout, 30000), // Cap at 30s for listing
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer (reduced from 50MB)
      }
    );

    // Output is one test file path per line
    const testFiles = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && existsSync(line));

    if (testFiles.length > 0) {
      // Count tests by parsing test files
      let total = 0;
      for (const file of testFiles) {
        total += countTestsInJSFile(file);
      }
      return classifyTests(total, 'jest', projectPath);
    }

    // If jest --listTests produced no files, fall back to file pattern
    return countTestsByFilePattern(projectPath, config);
  } catch (error) {
    // jest --listTests failed - fall back to file pattern
    return countTestsByFilePattern(projectPath, config);
  }
}

/**
 * Count tests using Cargo (Rust)
 * Uses `cargo test --list` for accurate test enumeration
 */
function countCargoTests(
  projectPath: string,
  config: MetricCollectorConfig
): TestMetrics {
  try {
    const output = execSync(
      'cargo test --list 2>/dev/null || echo ""',
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: config.timeout,
      }
    );

    // Count lines ending with ": test"
    const testLines = output.split('\n').filter(line => line.endsWith(': test'));
    const total = testLines.length;

    // Classify by test path patterns
    const unit = testLines.filter(t =>
      !t.includes('integration') && !t.includes('e2e')
    ).length;
    const integration = testLines.filter(t => t.includes('integration')).length;
    const e2e = testLines.filter(t => t.includes('e2e')).length;

    return {
      total,
      unit,
      integration,
      e2e,
      source: 'cargo',
    };
  } catch {
    return {
      total: 0,
      unit: 0,
      integration: 0,
      e2e: 0,
      source: 'cargo',
    };
  }
}

/**
 * Count tests using pytest (Python)
 * Uses `pytest --collect-only` for test discovery
 */
function countPytestTests(
  projectPath: string,
  config: MetricCollectorConfig
): TestMetrics {
  try {
    const output = execSync(
      'pytest --collect-only -q 2>/dev/null || echo ""',
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: config.timeout,
      }
    );

    // Count test function lines (format: "tests/test_foo.py::test_bar")
    const testLines = output.split('\n').filter(line =>
      line.includes('::test_') || line.includes('::Test')
    );
    const total = testLines.length;

    // Classify by path patterns
    const unit = testLines.filter(t =>
      t.includes('unit') || (!t.includes('integration') && !t.includes('e2e'))
    ).length;
    const integration = testLines.filter(t =>
      t.includes('integration') || t.includes('_integration')
    ).length;
    const e2e = testLines.filter(t =>
      t.includes('e2e') || t.includes('end_to_end')
    ).length;

    return {
      total,
      unit: unit - integration - e2e, // Exclude overlap
      integration,
      e2e,
      source: 'pytest',
    };
  } catch {
    return {
      total: 0,
      unit: 0,
      integration: 0,
      e2e: 0,
      source: 'pytest',
    };
  }
}

/**
 * Count tests using Go test
 * Uses `go test -list` for test discovery
 */
function countGoTests(
  projectPath: string,
  config: MetricCollectorConfig
): TestMetrics {
  try {
    const output = execSync(
      'go test -list ".*" ./... 2>/dev/null || echo ""',
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: config.timeout,
      }
    );

    // Count lines starting with "Test" (Go test naming convention)
    const testLines = output.split('\n').filter(line =>
      line.startsWith('Test') || line.startsWith('Example') || line.startsWith('Benchmark')
    );
    const total = testLines.filter(l => l.startsWith('Test')).length;

    // Classify by test name patterns
    const unit = testLines.filter(t =>
      t.startsWith('Test') && !t.includes('Integration') && !t.includes('E2E')
    ).length;
    const integration = testLines.filter(t => t.includes('Integration')).length;
    const e2e = testLines.filter(t => t.includes('E2E')).length;

    return {
      total,
      unit,
      integration,
      e2e,
      source: 'go',
    };
  } catch {
    return {
      total: 0,
      unit: 0,
      integration: 0,
      e2e: 0,
      source: 'go',
    };
  }
}

// ============================================================================
// Fallback Pattern Matching
// ============================================================================

/**
 * Count tests by parsing test files (fallback method)
 */
function countTestsByFilePattern(
  projectPath: string,
  config: MetricCollectorConfig
): TestMetrics {
  let total = 0;
  let unit = 0;
  let integration = 0;
  let e2e = 0;

  function walkDirectory(dirPath: string): void {
    if (!existsSync(dirPath)) {
      return;
    }

    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (config.excludeDirs.includes(entry.name)) {
          continue;
        }
        walkDirectory(fullPath);
      } else if (entry.isFile()) {
        // Check if it's a test file
        if (isTestFile(entry.name)) {
          const ext = extname(entry.name).toLowerCase();
          let fileTests = 0;

          if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
            fileTests = countTestsInJSFile(fullPath);
          } else if (ext === '.py') {
            fileTests = countTestsInPythonFile(fullPath);
          } else if (ext === '.rs') {
            fileTests = countTestsInRustFile(fullPath);
          } else if (ext === '.go') {
            fileTests = countTestsInGoFile(fullPath);
          }

          total += fileTests;

          // Classify by path
          const path = fullPath.toLowerCase();
          if (path.includes('e2e') || path.includes('end-to-end')) {
            e2e += fileTests;
          } else if (path.includes('integration')) {
            integration += fileTests;
          } else {
            unit += fileTests;
          }
        }
      }
    }
  }

  walkDirectory(projectPath);

  return {
    total,
    unit,
    integration,
    e2e,
    source: 'fallback',
  };
}

/**
 * Check if a file is a test file based on naming conventions
 */
function isTestFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('_test.') ||
    lower.startsWith('test_') ||
    lower.endsWith('_test.ts') ||
    lower.endsWith('_test.js') ||
    lower.endsWith('_test.py') ||
    lower.endsWith('_test.go') ||
    lower.endsWith('_test.rs')
  );
}

/**
 * Count test functions in a JS/TS test file
 */
function countTestsInJSFile(filePath: string): number {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Count it(), test(), describe blocks
    const itMatches = content.match(/\bit\s*\(/g) || [];
    const testMatches = content.match(/\btest\s*\(/g) || [];

    // Don't count describe as tests, they're containers
    return itMatches.length + testMatches.length;
  } catch {
    return 0;
  }
}

/**
 * Count test functions in a Python test file
 */
function countTestsInPythonFile(filePath: string): number {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Count def test_ functions and async def test_ functions
    const funcMatches = content.match(/\bdef\s+test_\w+\s*\(/g) || [];
    const asyncMatches = content.match(/\basync\s+def\s+test_\w+\s*\(/g) || [];

    return funcMatches.length + asyncMatches.length;
  } catch {
    return 0;
  }
}

/**
 * Count test functions in a Rust test file
 */
function countTestsInRustFile(filePath: string): number {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Count #[test] and #[tokio::test] attributes
    const testAttrs = content.match(/#\[test\]/g) || [];
    const tokioTests = content.match(/#\[tokio::test\]/g) || [];
    const asyncTests = content.match(/#\[async_std::test\]/g) || [];

    return testAttrs.length + tokioTests.length + asyncTests.length;
  } catch {
    return 0;
  }
}

/**
 * Count test functions in a Go test file
 */
function countTestsInGoFile(filePath: string): number {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Count func TestXxx(t *testing.T) patterns
    const testFuncs = content.match(/\bfunc\s+Test\w+\s*\(/g) || [];

    return testFuncs.length;
  } catch {
    return 0;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Classify total tests into unit/integration/e2e based on project structure
 */
function classifyTests(
  total: number,
  source: TestSource,
  projectPath: string
): TestMetrics {
  // Estimate distribution by checking directory structure
  let unit = total;
  let integration = 0;
  let e2e = 0;

  // Check for integration test directories
  if (
    existsSync(join(projectPath, 'tests', 'integration')) ||
    existsSync(join(projectPath, 'test', 'integration')) ||
    existsSync(join(projectPath, '__tests__', 'integration'))
  ) {
    // Rough estimate: 20% integration tests if directory exists
    integration = Math.floor(total * 0.2);
    unit -= integration;
  }

  // Check for e2e test directories
  if (
    existsSync(join(projectPath, 'tests', 'e2e')) ||
    existsSync(join(projectPath, 'test', 'e2e')) ||
    existsSync(join(projectPath, 'e2e')) ||
    existsSync(join(projectPath, 'cypress'))
  ) {
    // Rough estimate: 10% e2e tests if directory exists
    e2e = Math.floor(total * 0.1);
    unit -= e2e;
  }

  return {
    total,
    unit: Math.max(0, unit),
    integration,
    e2e,
    source,
  };
}
