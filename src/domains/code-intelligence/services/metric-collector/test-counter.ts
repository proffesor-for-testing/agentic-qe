/**
 * Agentic QE v3 - Test Counter
 *
 * Counts tests using actual test runners (vitest, jest, cargo, pytest, go).
 * Part of RM-003 implementation for real metric measurement.
 *
 * Detection priority by project type:
 * 1. Node.js: vitest > jest > fallback pattern matching
 * 2. Rust: cargo test -- --list
 * 3. Python: pytest --collect-only
 * 4. Go: go test -list
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 5, RM-003
 */

import { execSync, spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, extname, resolve } from 'path';
import {
  TestMetrics,
  TestSource,
  ToolAvailability,
  MetricCollectorConfig,
  DEFAULT_METRIC_CONFIG,
} from './interfaces.js';
import { safeJsonParse } from '@shared/safe-json.js';

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
      const pkg = safeJsonParse(readFileSync(packageJsonPath, 'utf-8'));
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
 * Uses `vitest list` for accurate test discovery without executing test callbacks.
 *
 * IMPORTANT: We use `vitest list` (not `vitest --run`) because:
 * - `vitest --run` EXECUTES tests, causing OOM in test-of-tests scenarios
 * - Collection imports test modules but does not run test callbacks
 */
async function countVitestTests(
  projectPath: string,
  config: MetricCollectorConfig
): Promise<TestMetrics> {
  let listingDirectory: string | undefined;
  try {
    let supportsStaticParse = false;
    try {
      const projectRequire = createRequire(resolve(projectPath, 'package.json'));
      const pkg = safeJsonParse(readFileSync(projectRequire.resolve('vitest/package.json'), 'utf-8'));
      const [major, minor] = String(pkg.version).split('.').map(Number);
      supportsStaticParse = major > 4 || (major === 4 && minor >= 1);
    } catch {
      // Retain native listing without new flags for unresolved/older runners.
    }
    listingDirectory = mkdtempSync(join(tmpdir(), 'aqe-vitest-list-'));
    const readListing = (file: string): number | undefined => {
      try {
        if (statSync(file).size > 10 * 1024 * 1024) return undefined;
        const data = safeJsonParse(readFileSync(file, 'utf-8'));
        if (Array.isArray(data) && data.every(test =>
          test && typeof test.name === 'string' && typeof test.file === 'string'
        )) return data.length;
        if (data && typeof data.numTotalTests === 'number') return data.numTotalTests;
      } catch { /* Missing/invalid artifacts are not authoritative counts. */ }
      return undefined;
    };
    const listTests = async (mode: 'static' | 'collection' | 'legacy'): Promise<number | undefined> => {
      // Separate artifacts prevent a failed attempt from contaminating recovery.
      const file = join(listingDirectory!, `${mode}.json`);
      const args = ['vitest', 'list', `--json=${file}`];
      if (mode !== 'legacy') args.push(mode === 'static' ? '--static-parse' : '--no-static-parse');
      const succeeded = await new Promise<boolean>((resolveAttempt) => {
        const windows = process.platform === 'win32';
        // Keep Windows artifact paths in a quoted environment expansion;
        // interpolating a caller-controlled temporary path into cmd is unsafe.
        const flag = mode === 'legacy' ? ''
          : mode === 'static' ? ' --static-parse' : ' --no-static-parse';
        const command = windows ? `npx vitest list --json="%AQE_VITEST_LIST_JSON%"${flag}` : 'npx';
        const child = spawn(command, windows ? [] : args, {
          cwd: projectPath, detached: !windows, shell: windows,
          env: { ...process.env, AQE_VITEST_LIST_JSON: file },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stopped = false;
        let bytes = 0;
        const stopTree = () => {
          if (!child.pid) return;
          try {
            if (windows) {
              // Windows has no POSIX process groups; terminate this owned tree.
              spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
                stdio: 'ignore', timeout: 5000,
              });
            } else {
              process.kill(-child.pid, 'SIGKILL');
            }
          } catch { /* The process group may already have exited. */ }
        };
        const timer = setTimeout(() => { stopped = true; stopTree(); }, Math.min(config.timeout, 30000));
        const consume = (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 10 * 1024 * 1024) { stopped = true; stopTree(); }
        };
        child.stdout?.on('data', consume);
        child.stderr?.on('data', consume);
        child.once('error', () => { clearTimeout(timer); stopTree(); resolveAttempt(false); });
        child.once('close', (code) => {
          clearTimeout(timer);
          // A wrapper may exit while its descendants are still importing modules.
          stopTree();
          resolveAttempt(!stopped && code === 0);
        });
      });
      return succeeded ? readListing(file) : undefined;
    };
    if (!supportsStaticParse) {
      const total = await listTests('legacy');
      return total === undefined ? countTestsByFilePattern(projectPath, config)
        : classifyTests(total, 'vitest', projectPath);
    }
    // Inspect cheap static discovery before importing project test modules.
    // Above 1,000 static declarations or 100 files, retain the native static
    // count instead of paying the collection timeout for every metrics call.
    const staticTotal = await listTests('static');
    const staticFile = join(listingDirectory, 'static.json');
    let staticFiles = 0;
    if (staticTotal !== undefined) {
      try {
        const data = safeJsonParse(readFileSync(staticFile, 'utf-8'));
        if (Array.isArray(data)) staticFiles = new Set(data.map(test => test.file)).size;
      } catch { /* The validated count remains usable. */ }
      if (staticTotal > 1000 || staticFiles > 100) {
        return classifyTests(staticTotal, 'vitest', projectPath);
      }
    }
    // Collection expands parameterized/computed declarations but imports every
    // test module (with setup/describe side effects). One throwing import loses
    // expansion for the whole suite; preserve its static count when available.
    const collectedTotal = await listTests('collection');
    const total = collectedTotal ?? staticTotal;
    return total === undefined ? countTestsByFilePattern(projectPath, config)
      : classifyTests(total, 'vitest', projectPath);
  } catch {
    return countTestsByFilePattern(projectPath, config);
  } finally {
    if (listingDirectory) {
      try { rmSync(listingDirectory, { recursive: true, force: true }); }
      catch { /* Cleanup failure must not change an otherwise valid count. */ }
    }
  }
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
      'npx jest --listTests',
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
  } catch {
    // jest --listTests failed - fall back to file pattern
    return countTestsByFilePattern(projectPath, config);
  }
}

/**
 * Count tests using Cargo (Rust)
 * Uses `cargo test -- --list` for accurate test enumeration
 */
function countCargoTests(
  projectPath: string,
  config: MetricCollectorConfig
): TestMetrics {
  try {
    const output = execSync(
      'cargo test -- --list',
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
      'pytest --collect-only -q',
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

    // Match fallback classification precedence so every collected test belongs
    // to exactly one category, even when its path names multiple categories.
    const e2e = testLines.filter(t =>
      t.includes('e2e') || t.includes('end_to_end')
    ).length;
    const integration = testLines.filter(t =>
      !t.includes('e2e') && !t.includes('end_to_end') && t.includes('integration')
    ).length;
    const unit = total - integration - e2e;

    return {
      total,
      unit,
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
      'go test -list ".*" ./...',
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: config.timeout,
      }
    );

    // Benchmarks and examples are listed too, but are not included in the
    // test total. Apply that same selection to every category.
    const testLines = output.split('\n').filter(line => line.startsWith('Test'));
    const total = testLines.length;

    // Use disjoint categories, with e2e taking precedence over integration.
    const e2e = testLines.filter(t => t.includes('E2E')).length;
    const integration = testLines.filter(t =>
      !t.includes('E2E') && t.includes('Integration')
    ).length;
    const unit = total - integration - e2e;

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

    // The def pattern also matches async def; every declaration counts once.
    return funcMatches.length;
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
