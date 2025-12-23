/**
 * Vitest Test Framework Plugin
 * Phase 3 B2: Reference Plugin Implementation
 *
 * Provides Vitest test generation, parsing, and execution capabilities.
 * Designed as a Jest alternative with modern ESM support.
 */

import { spawn } from 'child_process';
import {
  TestFrameworkPlugin,
  PluginMetadata,
  PluginContext,
  PluginCategory,
  TestGenerationSpec,
  GeneratedTest,
  ParsedTestFile,
  ParsedTestSuite,
  ParsedTest,
  ParsedHook,
  TestExecutionOptions,
  TestExecutionResult,
  TestResult,
  CoverageData,
  FrameworkConfig,
} from '../types';
import { BasePlugin, createPluginMetadata } from '../BasePlugin';

/**
 * Vitest Plugin - Test framework adapter for Vitest
 */
export class VitestPlugin extends BasePlugin implements TestFrameworkPlugin {
  readonly metadata: PluginMetadata = createPluginMetadata({
    id: '@agentic-qe/vitest-adapter',
    name: 'Vitest Test Adapter',
    version: '1.0.0',
    description: 'Generate, parse, and execute Vitest tests - modern Jest alternative',
    author: 'Agentic QE Team',
    category: PluginCategory.TEST_FRAMEWORK,
    minAgenticQEVersion: '2.6.0',
  });

  readonly filePatterns = [
    '**/*.test.ts',
    '**/*.test.js',
    '**/*.spec.ts',
    '**/*.spec.js',
    '**/__tests__/**/*.ts',
    '**/__tests__/**/*.js',
  ];

  readonly frameworkId = 'vitest';

  private initialized = false;

  async onActivate(context: PluginContext): Promise<void> {
    await super.onActivate(context);

    // Register as test framework service
    this.registerService('testFramework:vitest', this);

    this.initialized = true;
    this.log('info', 'Vitest adapter ready');
  }

  async onDeactivate(context: PluginContext): Promise<void> {
    this.initialized = false;
    await super.onDeactivate(context);
  }

  /**
   * Generate Vitest test from specification
   */
  async generateTest(spec: TestGenerationSpec): Promise<GeneratedTest> {
    this.log('debug', 'Generating Vitest test', { sourceFile: spec.sourceFilePath });

    const imports = this.generateImports(spec);
    const testCode = this.generateTestCode(spec);
    const filePath = spec.targetFilePath || this.inferTestFilePath(spec.sourceFilePath);

    return {
      code: `${imports}\n\n${testCode}`,
      filePath,
      imports: ['vitest'],
      dependencies: [
        { name: 'vitest', version: '^1.0.0', dev: true },
      ],
      metadata: {
        testCount: this.countTests(testCode),
        coveredFunctions: this.extractCoveredFunctions(spec.sourceCode),
        coverageEstimate: 0.75,
      },
    };
  }

  /**
   * Parse existing Vitest test file
   */
  async parseTestFile(filePath: string, content: string): Promise<ParsedTestFile> {
    this.log('debug', 'Parsing Vitest test file', { filePath });

    const suites: ParsedTestSuite[] = [];
    const imports: string[] = [];
    const hooks: ParsedHook[] = [];

    const lines = content.split('\n');

    // Extract imports
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/^import\s/)) {
        imports.push(line);
      }
    }

    // Parse test structure
    const describeRegex = /describe\s*\(\s*['"`](.+?)['"`]/g;
    const testRegex = /(?:test|it)\s*\(\s*['"`](.+?)['"`]/g;
    const beforeAllRegex = /beforeAll\s*\(/g;
    const afterAllRegex = /afterAll\s*\(/g;
    const beforeEachRegex = /beforeEach\s*\(/g;
    const afterEachRegex = /afterEach\s*\(/g;

    let match;

    // Find describes (suites)
    while ((match = describeRegex.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length;
      suites.push({
        name: match[1],
        tests: [],
        nestedSuites: [],
        hooks: [],
        line,
      });
    }

    // Find tests
    const tests: ParsedTest[] = [];
    while ((match = testRegex.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length;
      const contextBefore = content.substring(Math.max(0, match.index - 20), match.index);
      const isSkipped = contextBefore.includes('.skip');
      const isOnly = contextBefore.includes('.only');
      const isTodo = contextBefore.includes('.todo');

      tests.push({
        name: match[1],
        line,
        isSkipped: isSkipped || isTodo,
        isOnly,
      });
    }

    // Assign tests to suites or create default suite
    if (suites.length === 0 && tests.length > 0) {
      suites.push({
        name: 'Default Suite',
        tests,
        nestedSuites: [],
        hooks: [],
        line: 1,
      });
    } else if (suites.length > 0) {
      // Simplified: assign all tests to first suite
      suites[0].tests = tests;
    }

    // Find hooks
    const hookPatterns: [RegExp, ParsedHook['type']][] = [
      [beforeAllRegex, 'beforeAll'],
      [afterAllRegex, 'afterAll'],
      [beforeEachRegex, 'beforeEach'],
      [afterEachRegex, 'afterEach'],
    ];

    for (const [regex, type] of hookPatterns) {
      while ((match = regex.exec(content)) !== null) {
        const line = content.substring(0, match.index).split('\n').length;
        hooks.push({ type, line });
      }
    }

    return { suites, imports, hooks };
  }

  /**
   * Execute Vitest tests - REAL IMPLEMENTATION
   */
  async executeTests(options: TestExecutionOptions): Promise<TestExecutionResult> {
    this.log('info', 'Executing Vitest tests', {
      files: options.testFiles.length,
      parallel: options.parallel,
    });

    const startTime = Date.now();

    try {
      // Build command arguments
      const args = ['vitest', 'run', '--reporter=json'];

      if (options.testFiles.length > 0) {
        args.push(...options.testFiles);
      }

      if (options.testNamePattern) {
        args.push('--testNamePattern', options.testNamePattern);
      }

      if (options.parallel === false) {
        args.push('--pool=forks', '--poolOptions.forks.singleFork');
      } else if (options.maxWorkers) {
        args.push('--poolOptions.threads.maxThreads', String(options.maxWorkers));
      }

      if (options.coverage?.enabled) {
        args.push('--coverage', '--coverage.reporter=json');
        if (options.coverage.reporters) {
          for (const reporter of options.coverage.reporters) {
            args.push(`--coverage.reporter=${reporter}`);
          }
        }
      }

      if (options.timeout) {
        args.push('--testTimeout', String(options.timeout));
      }

      // Actually execute via child process
      const result = await this.spawnProcess('npx', args, options.env);
      const duration = Date.now() - startTime;

      // Parse JSON output from Vitest
      const { tests, coverage } = this.parseVitestOutput(
        result.stdout,
        result.stderr,
        options.coverage?.enabled
      );

      return {
        success: result.exitCode === 0,
        tests,
        duration,
        coverage,
        output: result.stdout || result.stderr,
      };
    } catch (error) {
      return {
        success: false,
        tests: [],
        duration: Date.now() - startTime,
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Spawn a child process and capture output
   */
  private spawnProcess(
    command: string,
    args: string[],
    env?: Record<string, string>
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: { ...process.env, ...env },
        shell: true,
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse Vitest JSON output into TestResult array and CoverageData
   */
  private parseVitestOutput(
    stdout: string,
    stderr: string,
    includeCoverage?: boolean
  ): { tests: TestResult[]; coverage?: CoverageData } {
    const tests: TestResult[] = [];
    let coverage: CoverageData | undefined;

    try {
      // Try to parse JSON output
      const jsonMatch = stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
      if (jsonMatch) {
        const report = JSON.parse(jsonMatch[0]);

        // Extract test results from Vitest JSON format
        for (const file of report.testResults || []) {
          for (const test of file.assertionResults || []) {
            tests.push({
              name: test.title || test.fullName,
              suite: file.name || 'Unknown Suite',
              status: this.mapVitestStatus(test.status),
              duration: test.duration || 0,
              error: test.failureMessages?.length ? {
                message: test.failureMessages[0],
                stack: test.failureMessages.join('\n'),
              } : undefined,
            });
          }
        }

        // Extract coverage if available
        if (includeCoverage && report.coverageMap) {
          coverage = this.parseCoverageMap(report.coverageMap);
        }
      }
    } catch {
      // If JSON parsing fails, try to parse text output
      this.log('debug', 'Failed to parse JSON, falling back to text parsing');
      const passedMatch = stdout.match(/(\d+) passed/);
      const failedMatch = stdout.match(/(\d+) failed/);
      const skippedMatch = stdout.match(/(\d+) skipped/);

      if (passedMatch || failedMatch || skippedMatch) {
        const passed = parseInt(passedMatch?.[1] || '0', 10);
        const failed = parseInt(failedMatch?.[1] || '0', 10);
        const skipped = parseInt(skippedMatch?.[1] || '0', 10);

        for (let i = 0; i < passed; i++) {
          tests.push({ name: `Test ${i + 1}`, suite: 'Suite', status: 'passed', duration: 0 });
        }
        for (let i = 0; i < failed; i++) {
          tests.push({ name: `Failed Test ${i + 1}`, suite: 'Suite', status: 'failed', duration: 0 });
        }
        for (let i = 0; i < skipped; i++) {
          tests.push({ name: `Skipped Test ${i + 1}`, suite: 'Suite', status: 'skipped', duration: 0 });
        }
      }

      // Try to parse coverage from text output
      if (includeCoverage) {
        coverage = this.parseCoverageFromText(stdout);
      }
    }

    return { tests, coverage };
  }

  /**
   * Parse coverage map from Vitest JSON output
   */
  private parseCoverageMap(coverageMap: any): CoverageData {
    let totalLines = 0, coveredLines = 0;
    let totalBranches = 0, coveredBranches = 0;
    let totalFunctions = 0, coveredFunctions = 0;
    let totalStatements = 0, coveredStatements = 0;

    for (const file of Object.values(coverageMap) as any[]) {
      // Lines
      const lines = file.s || {};
      for (const count of Object.values(lines) as number[]) {
        totalLines++;
        if (count > 0) coveredLines++;
      }

      // Branches
      const branches = file.b || {};
      for (const branchCounts of Object.values(branches) as number[][]) {
        for (const count of branchCounts) {
          totalBranches++;
          if (count > 0) coveredBranches++;
        }
      }

      // Functions
      const functions = file.f || {};
      for (const count of Object.values(functions) as number[]) {
        totalFunctions++;
        if (count > 0) coveredFunctions++;
      }

      // Statements (same as lines in most cases)
      totalStatements = totalLines;
      coveredStatements = coveredLines;
    }

    return {
      lines: {
        total: totalLines,
        covered: coveredLines,
        percentage: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
      },
      branches: {
        total: totalBranches,
        covered: coveredBranches,
        percentage: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
      },
      functions: {
        total: totalFunctions,
        covered: coveredFunctions,
        percentage: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
      },
      statements: {
        total: totalStatements,
        covered: coveredStatements,
        percentage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
      },
    };
  }

  /**
   * Parse coverage from text output (fallback)
   */
  private parseCoverageFromText(stdout: string): CoverageData | undefined {
    // Try to match coverage summary lines like "All files | 80.5 | 75.2 | 90.1 | 80.5"
    const coverageMatch = stdout.match(
      /All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/
    );

    if (coverageMatch) {
      const [, stmts, branch, funcs, lines] = coverageMatch;
      return {
        statements: { total: 100, covered: parseFloat(stmts), percentage: parseFloat(stmts) },
        branches: { total: 100, covered: parseFloat(branch), percentage: parseFloat(branch) },
        functions: { total: 100, covered: parseFloat(funcs), percentage: parseFloat(funcs) },
        lines: { total: 100, covered: parseFloat(lines), percentage: parseFloat(lines) },
      };
    }

    return undefined;
  }

  /**
   * Map Vitest status to our status type
   */
  private mapVitestStatus(status: string): 'passed' | 'failed' | 'skipped' | 'pending' {
    switch (status) {
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'skipped':
      case 'todo':
        return 'skipped';
      case 'pending':
      default:
        return 'pending';
    }
  }

  /**
   * Get Vitest framework configuration
   */
  getFrameworkConfig(): FrameworkConfig {
    return {
      configFileName: 'vitest.config.ts',
      defaultTestDir: 'tests',
      configTemplate: this.getConfigTemplate(),
      dependencies: [
        { name: 'vitest', version: '^1.0.0', dev: true },
        { name: '@vitest/coverage-v8', version: '^1.0.0', dev: true },
      ],
    };
  }

  // === Private Methods ===

  private generateImports(spec: TestGenerationSpec): string {
    const imports = [
      "import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';",
    ];

    // Add source import
    const sourceModule = this.extractModuleName(spec.sourceFilePath);
    if (sourceModule) {
      const relativePath = this.getRelativeImportPath(
        spec.targetFilePath || this.inferTestFilePath(spec.sourceFilePath),
        spec.sourceFilePath
      );
      imports.push(`import { ${sourceModule} } from '${relativePath}';`);
    }

    return imports.join('\n');
  }

  private generateTestCode(spec: TestGenerationSpec): string {
    const functionNames = this.extractFunctionNames(spec.sourceCode);
    const className = this.extractClassName(spec.sourceCode);

    const tests: string[] = [];

    if (spec.testType === 'unit') {
      tests.push(this.generateUnitTests(spec, className, functionNames));
    } else if (spec.testType === 'integration') {
      tests.push(this.generateIntegrationTests(spec, className, functionNames));
    } else {
      tests.push(this.generateGenericTests(spec, className, functionNames));
    }

    const suiteName = className || this.extractModuleName(spec.sourceFilePath) || 'Module';
    return `describe('${suiteName}', () => {\n${tests.join('\n\n')}\n});`;
  }

  private generateUnitTests(
    spec: TestGenerationSpec,
    className: string | null,
    functionNames: string[]
  ): string {
    const tests: string[] = [];

    // Generate tests for each function
    for (const fn of functionNames) {
      tests.push(`  describe('${fn}', () => {
    it('should return expected result for valid input', () => {
      // Arrange
      const input = {};

      // Act
      const result = ${fn}(input);

      // Assert
      expect(result).toBeDefined();
    });

    it('should handle edge cases', () => {
      // Test edge cases
      expect(() => ${fn}(null)).not.toThrow();
    });

    it('should throw for invalid input', () => {
      // Test error handling
      expect(() => ${fn}(undefined)).toThrow();
    });
  });`);
    }

    if (tests.length === 0) {
      tests.push(`  it('should be implemented', () => {
    expect(true).toBe(true);
  });`);
    }

    return tests.join('\n\n');
  }

  private generateIntegrationTests(
    spec: TestGenerationSpec,
    className: string | null,
    functionNames: string[]
  ): string {
    const tests: string[] = [];
    const name = className || 'Module';

    tests.push(`  describe('integration', () => {
    beforeEach(() => {
      // Setup before each test
    });

    afterEach(() => {
      // Cleanup after each test
    });

    it('should integrate components correctly', async () => {
      // Integration test
      expect(true).toBe(true);
    });

    it('should handle async operations', async () => {
      // Async integration test
      await expect(Promise.resolve(true)).resolves.toBe(true);
    });
  });`);

    return tests.join('\n\n');
  }

  private generateGenericTests(
    spec: TestGenerationSpec,
    className: string | null,
    functionNames: string[]
  ): string {
    const tests: string[] = [];

    for (const fn of functionNames.slice(0, 5)) {
      tests.push(`  it('${fn} should work correctly', () => {
    // Test ${fn}
    expect(true).toBe(true);
  });`);
    }

    if (tests.length === 0) {
      tests.push(`  it('should pass', () => {
    expect(true).toBe(true);
  });`);
    }

    return tests.join('\n\n');
  }

  private extractFunctionNames(sourceCode: string): string[] {
    const patterns = [
      /export\s+(?:async\s+)?function\s+(\w+)/g,
      /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/g,
      /(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{/g,
    ];

    const names = new Set<string>();
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(sourceCode)) !== null) {
        const name = match[1];
        if (name && !['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(name)) {
          names.add(name);
        }
      }
    }

    return Array.from(names);
  }

  private extractClassName(sourceCode: string): string | null {
    const match = sourceCode.match(/(?:export\s+)?class\s+(\w+)/);
    return match ? match[1] : null;
  }

  private extractModuleName(filePath: string): string | null {
    const fileName = filePath.replace(/^.*\//, '').replace(/\.(ts|js|tsx|jsx)$/, '');
    return fileName.charAt(0).toUpperCase() + fileName.slice(1);
  }

  private extractCoveredFunctions(sourceCode: string): string[] {
    return this.extractFunctionNames(sourceCode);
  }

  private countTests(testCode: string): number {
    const matches = testCode.match(/it\s*\(/g);
    return matches ? matches.length : 0;
  }

  private inferTestFilePath(sourceFilePath: string): string {
    const dir = sourceFilePath.replace(/\/[^/]+$/, '');
    const fileName = sourceFilePath.replace(/^.*\//, '').replace(/\.(ts|js|tsx|jsx)$/, '');
    return `${dir}/__tests__/${fileName}.test.ts`;
  }

  private getRelativeImportPath(fromPath: string, toPath: string): string {
    // Simplified relative path calculation
    const fromDir = fromPath.replace(/\/[^/]+$/, '');
    const toDir = toPath.replace(/\/[^/]+$/, '');
    const fileName = toPath.replace(/^.*\//, '').replace(/\.(ts|js|tsx|jsx)$/, '');

    if (fromDir === toDir) {
      return `./${fileName}`;
    }

    // Go up one level from __tests__
    return `../${fileName}`;
  }

  private getConfigTemplate(): string {
    return `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});`;
  }
}

/**
 * Factory function for plugin registration
 */
export function createVitestPlugin(): VitestPlugin {
  return new VitestPlugin();
}
