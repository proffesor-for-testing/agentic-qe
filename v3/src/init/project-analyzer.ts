/**
 * Project Analyzer
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Analyzes a project to detect frameworks, languages, tests, and configuration.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, basename, extname, relative } from 'path';
import type {
  ProjectAnalysis,
  DetectedFramework,
  DetectedLanguage,
  ExistingTests,
  CodeComplexity,
  CoverageMetrics,
} from './types.js';

// ============================================================================
// Framework Detection
// ============================================================================

interface FrameworkDetector {
  name: string;
  detect: (projectRoot: string) => DetectedFramework | null;
}

const frameworkDetectors: FrameworkDetector[] = [
  {
    name: 'jest',
    detect: (root) => {
      const configs = ['jest.config.js', 'jest.config.ts', 'jest.config.mjs', 'jest.config.cjs'];
      for (const config of configs) {
        if (existsSync(join(root, config))) {
          const version = getPackageVersion(root, 'jest');
          return { name: 'jest', version, configFile: config, confidence: 1.0 };
        }
      }
      // Check package.json for jest config
      const pkg = readPackageJson(root);
      if (pkg?.jest) {
        const version = getPackageVersion(root, 'jest');
        return { name: 'jest', version, configFile: 'package.json', confidence: 0.9 };
      }
      // Check if jest is in devDependencies
      if (pkg?.devDependencies?.jest || pkg?.dependencies?.jest) {
        return { name: 'jest', version: pkg.devDependencies?.jest || pkg.dependencies?.jest, confidence: 0.7 };
      }
      return null;
    },
  },
  {
    name: 'vitest',
    detect: (root) => {
      const configs = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts', 'vite.config.ts'];
      for (const config of configs) {
        if (existsSync(join(root, config))) {
          const version = getPackageVersion(root, 'vitest');
          return { name: 'vitest', version, configFile: config, confidence: 1.0 };
        }
      }
      const pkg = readPackageJson(root);
      if (pkg?.devDependencies?.vitest || pkg?.dependencies?.vitest) {
        return { name: 'vitest', version: pkg.devDependencies?.vitest, confidence: 0.8 };
      }
      return null;
    },
  },
  {
    name: 'mocha',
    detect: (root) => {
      const configs = ['.mocharc.js', '.mocharc.json', '.mocharc.yaml', '.mocharc.yml'];
      for (const config of configs) {
        if (existsSync(join(root, config))) {
          const version = getPackageVersion(root, 'mocha');
          return { name: 'mocha', version, configFile: config, confidence: 1.0 };
        }
      }
      const pkg = readPackageJson(root);
      if (pkg?.devDependencies?.mocha) {
        return { name: 'mocha', version: pkg.devDependencies?.mocha, confidence: 0.8 };
      }
      return null;
    },
  },
  {
    name: 'pytest',
    detect: (root) => {
      const configs = ['pytest.ini', 'pyproject.toml', 'setup.cfg'];
      for (const config of configs) {
        const configPath = join(root, config);
        if (existsSync(configPath)) {
          try {
            const content = readFileSync(configPath, 'utf-8');
            if (content.includes('[pytest]') || content.includes('[tool.pytest]')) {
              return { name: 'pytest', configFile: config, confidence: 1.0 };
            }
          } catch {
            // Ignore read errors
          }
        }
      }
      // Check requirements.txt
      const reqPath = join(root, 'requirements.txt');
      if (existsSync(reqPath)) {
        try {
          const content = readFileSync(reqPath, 'utf-8');
          if (content.includes('pytest')) {
            return { name: 'pytest', configFile: 'requirements.txt', confidence: 0.8 };
          }
        } catch {
          // Ignore
        }
      }
      return null;
    },
  },
  {
    name: 'playwright',
    detect: (root) => {
      const configs = ['playwright.config.ts', 'playwright.config.js'];
      for (const config of configs) {
        if (existsSync(join(root, config))) {
          const version = getPackageVersion(root, '@playwright/test');
          return { name: 'playwright', version, configFile: config, confidence: 1.0 };
        }
      }
      const pkg = readPackageJson(root);
      if (pkg?.devDependencies?.['@playwright/test']) {
        return { name: 'playwright', version: pkg.devDependencies['@playwright/test'], confidence: 0.8 };
      }
      return null;
    },
  },
  {
    name: 'cypress',
    detect: (root) => {
      const configs = ['cypress.config.ts', 'cypress.config.js', 'cypress.json'];
      for (const config of configs) {
        if (existsSync(join(root, config))) {
          const version = getPackageVersion(root, 'cypress');
          return { name: 'cypress', version, configFile: config, confidence: 1.0 };
        }
      }
      if (existsSync(join(root, 'cypress'))) {
        return { name: 'cypress', configFile: 'cypress/', confidence: 0.9 };
      }
      return null;
    },
  },
];

// ============================================================================
// Language Detection
// ============================================================================

interface LanguagePattern {
  name: string;
  extensions: string[];
}

const languagePatterns: LanguagePattern[] = [
  { name: 'typescript', extensions: ['.ts', '.tsx', '.mts', '.cts'] },
  { name: 'javascript', extensions: ['.js', '.jsx', '.mjs', '.cjs'] },
  { name: 'python', extensions: ['.py', '.pyw'] },
  { name: 'java', extensions: ['.java'] },
  { name: 'go', extensions: ['.go'] },
  { name: 'rust', extensions: ['.rs'] },
  { name: 'csharp', extensions: ['.cs'] },
  { name: 'ruby', extensions: ['.rb'] },
  { name: 'php', extensions: ['.php'] },
  { name: 'kotlin', extensions: ['.kt', '.kts'] },
  { name: 'swift', extensions: ['.swift'] },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Package.json structure for type safety
 */
interface PackageJson {
  name?: string;
  main?: string;
  module?: string;
  exports?: unknown;
  workspaces?: unknown;
  jest?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

function readPackageJson(root: string): PackageJson | null {
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson;
  } catch {
    return null;
  }
}

function getPackageVersion(root: string, packageName: string): string | undefined {
  const pkg = readPackageJson(root);
  if (!pkg) return undefined;
  return pkg.devDependencies?.[packageName] || pkg.dependencies?.[packageName];
}

function walkDir(
  dir: string,
  callback: (filePath: string) => void,
  options: { maxDepth?: number; exclude?: string[] } = {}
): void {
  const { maxDepth = 10, exclude = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '__pycache__'] } = options;

  function walk(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (exclude.includes(entry)) continue;

      const fullPath = join(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (stat.isFile()) {
        callback(fullPath);
      }
    }
  }

  walk(dir, 0);
}

// ============================================================================
// Project Analyzer Class
// ============================================================================

export class ProjectAnalyzer {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Perform complete project analysis
   */
  async analyze(): Promise<ProjectAnalysis> {
    const startTime = Date.now();

    const [frameworks, languages, existingTests, codeComplexity, coverage] = await Promise.all([
      this.detectFrameworks(),
      this.detectLanguages(),
      this.detectExistingTests(),
      this.analyzeComplexity(),
      this.measureCoverage(),
    ]);

    const pkg = readPackageJson(this.projectRoot);
    const projectName = (pkg?.name as string) || basename(this.projectRoot);

    return {
      projectName,
      projectRoot: this.projectRoot,
      projectType: this.detectProjectType(),

      frameworks,
      languages,
      existingTests,
      codeComplexity,
      coverage,

      packageManager: this.detectPackageManager(),
      hasTypeScript: existsSync(join(this.projectRoot, 'tsconfig.json')),
      hasCIConfig: this.detectCIConfig(),
      ciProvider: this.detectCIProvider(),

      analysisTimestamp: new Date(),
      analysisDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Detect test frameworks in the project
   */
  async detectFrameworks(): Promise<DetectedFramework[]> {
    const detected: DetectedFramework[] = [];

    for (const detector of frameworkDetectors) {
      const result = detector.detect(this.projectRoot);
      if (result) {
        detected.push(result);
      }
    }

    // Sort by confidence
    return detected.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Detect programming languages used
   */
  async detectLanguages(): Promise<DetectedLanguage[]> {
    const fileCounts = new Map<string, { count: number; extensions: Set<string> }>();
    let totalFiles = 0;

    walkDir(this.projectRoot, (filePath) => {
      const ext = extname(filePath).toLowerCase();
      if (!ext) return;

      for (const pattern of languagePatterns) {
        if (pattern.extensions.includes(ext)) {
          const existing = fileCounts.get(pattern.name) || { count: 0, extensions: new Set() };
          existing.count++;
          existing.extensions.add(ext);
          fileCounts.set(pattern.name, existing);
          totalFiles++;
          break;
        }
      }
    });

    const languages: DetectedLanguage[] = [];
    for (const [name, data] of fileCounts) {
      languages.push({
        name,
        percentage: totalFiles > 0 ? Math.round((data.count / totalFiles) * 100) : 0,
        fileCount: data.count,
        extensions: Array.from(data.extensions),
      });
    }

    return languages.sort((a, b) => b.fileCount - a.fileCount);
  }

  /**
   * Detect existing tests
   */
  async detectExistingTests(): Promise<ExistingTests> {
    const tests: ExistingTests = {
      totalCount: 0,
      byFramework: {},
      byType: { unit: 0, integration: 0, e2e: 0, unknown: 0 },
      directories: [],
    };

    const testDirs = new Set<string>();
    const testPatterns = [
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /_test\.[jt]sx?$/,
      /test_.*\.py$/,
      /.*_test\.py$/,
      /.*_test\.go$/,
      /.*Test\.java$/,
    ];

    walkDir(this.projectRoot, (filePath) => {
      const fileName = basename(filePath);
      const isTest = testPatterns.some((p) => p.test(fileName));

      if (isTest) {
        tests.totalCount++;

        // Detect test type from path
        const relPath = relative(this.projectRoot, filePath).toLowerCase();
        if (relPath.includes('e2e') || relPath.includes('cypress') || relPath.includes('playwright')) {
          tests.byType.e2e++;
        } else if (relPath.includes('integration') || relPath.includes('int-test')) {
          tests.byType.integration++;
        } else if (relPath.includes('unit') || relPath.includes('__tests__') || relPath.includes('test/')) {
          tests.byType.unit++;
        } else {
          tests.byType.unknown++;
        }

        // Track test directories
        const dir = relative(this.projectRoot, join(filePath, '..'));
        testDirs.add(dir);
      }
    });

    tests.directories = Array.from(testDirs).slice(0, 10); // Limit to 10

    return tests;
  }

  /**
   * Analyze code complexity using McCabe's cyclomatic complexity
   *
   * Cyclomatic complexity = 1 + number of decision points
   * Decision points: if, else if, for, while, case, catch, &&, ||, ternary
   *
   * This implementation:
   * - Strips comments and strings to avoid false positives
   * - Identifies function boundaries for per-function analysis
   * - Counts logical operators as decision points
   * - Avoids double-counting (e.g., else if)
   */
  async analyzeComplexity(): Promise<CodeComplexity> {
    const complexFiles: string[] = [];
    const functionComplexities: number[] = [];
    let maxComplexity = 0;
    let fileCount = 0;

    walkDir(this.projectRoot, (filePath) => {
      const ext = extname(filePath);
      if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go'].includes(ext)) return;

      try {
        const content = readFileSync(filePath, 'utf-8');
        const result = this.calculateFileComplexity(content, ext);

        functionComplexities.push(...result.functionComplexities);
        if (result.maxComplexity > maxComplexity) {
          maxComplexity = result.maxComplexity;
        }
        fileCount++;

        // Flag files with any function exceeding threshold
        if (result.maxComplexity > 10) {
          complexFiles.push(relative(this.projectRoot, filePath));
        }
      } catch {
        // Ignore read errors
      }
    });

    // Calculate average across all functions
    const totalComplexity = functionComplexities.reduce((a, b) => a + b, 0);
    const avg = functionComplexities.length > 0
      ? totalComplexity / functionComplexities.length
      : 0;

    return {
      averageCyclomatic: Math.round(avg * 10) / 10,
      maxCyclomatic: maxComplexity,
      totalFiles: fileCount,
      complexFiles: complexFiles.slice(0, 20),
      recommendation: avg < 5 ? 'simple' : avg < 15 ? 'medium' : 'complex',
    };
  }

  /**
   * Calculate complexity for a single file
   * Returns file-level complexity (per-function requires AST which we don't have)
   *
   * Note: For accurate per-function complexity, use a proper AST parser.
   * This implementation provides file-level aggregate complexity which is
   * still useful for identifying complex files that need attention.
   */
  private calculateFileComplexity(
    content: string,
    ext: string
  ): { functionComplexities: number[]; maxComplexity: number } {
    // Strip comments and strings to avoid false positives
    const strippedContent = this.stripCommentsAndStrings(content, ext);

    // Calculate file-level complexity
    // Without a proper AST parser, per-function analysis is unreliable
    const complexity = this.calculateComplexity(strippedContent);

    return {
      functionComplexities: [complexity],
      maxComplexity: complexity,
    };
  }

  /**
   * Remove delimited blocks (like multi-line comments or strings) without regex
   * to avoid ReDoS vulnerabilities
   */
  private removeDelimitedBlocks(text: string, startDelim: string, endDelim: string): string {
    let result = '';
    let i = 0;
    while (i < text.length) {
      const startIdx = text.indexOf(startDelim, i);
      if (startIdx === -1) {
        result += text.slice(i);
        break;
      }
      result += text.slice(i, startIdx);
      const endIdx = text.indexOf(endDelim, startIdx + startDelim.length);
      if (endIdx === -1) {
        // No closing delimiter, skip the rest
        break;
      }
      i = endIdx + endDelim.length;
    }
    return result;
  }

  /**
   * Strip comments and string literals from code
   * Prevents false positives from commented-out code or strings containing keywords
   */
  private stripCommentsAndStrings(content: string, ext: string): string {
    let result = content;

    if (['.ts', '.tsx', '.js', '.jsx', '.java', '.go'].includes(ext)) {
      // Remove single-line comments - process line by line to avoid ReDoS
      result = result.split('\n').map(line => {
        const idx = line.indexOf('//');
        return idx >= 0 ? line.slice(0, idx) : line;
      }).join('\n');
      // Remove multi-line comments using safe iterative approach
      result = this.removeDelimitedBlocks(result, '/*', '*/');
      // Remove template literals using safe iterative approach
      result = this.removeDelimitedBlocks(result, '`', '`');
      // Remove double-quoted strings (simple removal, not perfect but safe)
      result = this.removeDelimitedBlocks(result, '"', '"');
      // Remove single-quoted strings
      result = this.removeDelimitedBlocks(result, "'", "'");
    } else if (ext === '.py') {
      // Remove single-line comments - process line by line to avoid ReDoS
      result = result.split('\n').map(line => {
        const idx = line.indexOf('#');
        return idx >= 0 ? line.slice(0, idx) : line;
      }).join('\n');
      // Remove triple-quoted strings (docstrings) using safe iterative approach
      result = this.removeDelimitedBlocks(result, '"""', '"""');
      result = this.removeDelimitedBlocks(result, "'''", "'''");
      // Remove regular strings
      result = this.removeDelimitedBlocks(result, '"', '"');
      result = this.removeDelimitedBlocks(result, "'", "'");
    }

    return result;
  }

  /**
   * Calculate cyclomatic complexity for a code block
   *
   * McCabe's formula: M = 1 + number of decision points
   * Decision points:
   * - if (but not else if, to avoid double counting)
   * - else if
   * - for / foreach
   * - while
   * - case (in switch)
   * - catch
   * - && (logical AND)
   * - || (logical OR)
   * - ?: (ternary conditional)
   */
  private calculateComplexity(code: string): number {
    let complexity = 1; // Base complexity

    // Decision point patterns - each adds 1 to complexity
    const decisionPatterns: Array<{ pattern: RegExp; name: string }> = [
      // if statement (not preceded by "else")
      { pattern: /(?<![a-zA-Z])if\s*\(/g, name: 'if' },
      // for loops (for, foreach, for...of, for...in)
      { pattern: /\bfor\s*\(/g, name: 'for' },
      // while loops
      { pattern: /\bwhile\s*\(/g, name: 'while' },
      // case statements (each case is a decision point)
      { pattern: /\bcase\s+[^:]+:/g, name: 'case' },
      // catch blocks
      { pattern: /\bcatch\s*\(/g, name: 'catch' },
      // Logical AND - each is a short-circuit decision
      { pattern: /&&/g, name: '&&' },
      // Logical OR - each is a short-circuit decision
      { pattern: /\|\|/g, name: '||' },
      // Ternary operator (match ? followed by something and :)
      { pattern: /\?[^?:]+:/g, name: 'ternary' },
      // Python: elif
      { pattern: /\belif\s+/g, name: 'elif' },
      // Python: except
      { pattern: /\bexcept\s*(?:\w+)?:/g, name: 'except' },
      // Python: for/while
      { pattern: /\bfor\s+\w+\s+in\s+/g, name: 'for-in' },
      // Go: select case
      { pattern: /\bselect\s*\{/g, name: 'select' },
    ];

    for (const { pattern } of decisionPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    // Note: We intentionally do NOT subtract else-if.
    // Each 'if' and 'else if' is a separate decision point.
    // The 'if' pattern matches both, which is correct:
    //   if (x > 0) { }       -> 1 decision point
    //   else if (x < 0) { }  -> 1 decision point (the 'if' part)
    // Total: 2 decision points, complexity = 3

    return complexity;
  }

  /**
   * Measure existing coverage
   */
  async measureCoverage(): Promise<CoverageMetrics> {
    const coveragePaths = [
      'coverage/lcov-report/index.html',
      'coverage/coverage-summary.json',
      'coverage/clover.xml',
      'coverage/lcov.info',
      'htmlcov/index.html',
    ];

    for (const coveragePath of coveragePaths) {
      const fullPath = join(this.projectRoot, coveragePath);
      if (existsSync(fullPath)) {
        // Try to read coverage summary
        if (coveragePath.endsWith('.json')) {
          try {
            const content = JSON.parse(readFileSync(fullPath, 'utf-8'));
            const total = content.total || {};
            return {
              lines: total.lines?.pct || 0,
              branches: total.branches?.pct || 0,
              functions: total.functions?.pct || 0,
              statements: total.statements?.pct || 0,
              hasReport: true,
              reportPath: coveragePath,
            };
          } catch {
            // Ignore parse errors
          }
        }

        return {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
          hasReport: true,
          reportPath: coveragePath,
        };
      }
    }

    return {
      lines: 0,
      branches: 0,
      functions: 0,
      statements: 0,
      hasReport: false,
    };
  }

  /**
   * Detect project type
   */
  private detectProjectType(): 'monorepo' | 'single' | 'library' | 'unknown' {
    // Check for monorepo indicators
    if (existsSync(join(this.projectRoot, 'lerna.json'))) return 'monorepo';
    if (existsSync(join(this.projectRoot, 'pnpm-workspace.yaml'))) return 'monorepo';
    if (existsSync(join(this.projectRoot, 'packages'))) return 'monorepo';

    const pkg = readPackageJson(this.projectRoot);
    if (pkg?.workspaces) return 'monorepo';

    // Check for library indicators
    if (pkg?.main || pkg?.module || pkg?.exports) return 'library';

    return 'single';
  }

  /**
   * Detect package manager
   */
  private detectPackageManager(): 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown' {
    if (existsSync(join(this.projectRoot, 'bun.lockb'))) return 'bun';
    if (existsSync(join(this.projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(join(this.projectRoot, 'yarn.lock'))) return 'yarn';
    if (existsSync(join(this.projectRoot, 'package-lock.json'))) return 'npm';
    return 'unknown';
  }

  /**
   * Detect if CI configuration exists
   */
  private detectCIConfig(): boolean {
    const ciFiles = [
      '.github/workflows',
      '.gitlab-ci.yml',
      'Jenkinsfile',
      '.circleci/config.yml',
      '.travis.yml',
      'azure-pipelines.yml',
    ];

    return ciFiles.some((f) => existsSync(join(this.projectRoot, f)));
  }

  /**
   * Detect CI provider
   */
  private detectCIProvider(): 'github-actions' | 'gitlab-ci' | 'jenkins' | 'circleci' | 'other' | undefined {
    if (existsSync(join(this.projectRoot, '.github/workflows'))) return 'github-actions';
    if (existsSync(join(this.projectRoot, '.gitlab-ci.yml'))) return 'gitlab-ci';
    if (existsSync(join(this.projectRoot, 'Jenkinsfile'))) return 'jenkins';
    if (existsSync(join(this.projectRoot, '.circleci/config.yml'))) return 'circleci';
    if (this.detectCIConfig()) return 'other';
    return undefined;
  }
}

/**
 * Factory function to create a project analyzer
 */
export function createProjectAnalyzer(projectRoot: string): ProjectAnalyzer {
  return new ProjectAnalyzer(projectRoot);
}
