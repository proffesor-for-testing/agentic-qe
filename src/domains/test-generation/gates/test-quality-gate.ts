/**
 * Test Quality Gate - Mock Detector & Mutation Detector
 * Inspired by loki-mode Gates 8 & 9
 *
 * Validates generated test code quality by detecting:
 * 1. No source imports - test never imports from the source file
 * 2. Tautological assertions - expect(true).toBe(true), expect(x).toBe(x)
 * 3. Empty test bodies - it('...', () => {}) with no assertions
 * 4. Mirrored assertions - expected values copy-pasted from source literals
 *
 * All detection is regex-based, no LLM calls.
 */

// ============================================================================
// Types
// ============================================================================

export type TestQualityIssueType =
  | 'no-source-import'
  | 'tautological-assertion'
  | 'empty-test-body'
  | 'mirrored-assertion';

export interface TestQualityIssue {
  type: TestQualityIssueType;
  severity: 'error' | 'warning';
  line?: number;
  description: string;
  suggestion: string;
}

export interface TestQualityGateResult {
  passed: boolean;
  issues: TestQualityIssue[];
  score: number; // 0-100, 100 = perfect
}

export interface TestQualityGateConfig {
  /** Check for missing source imports (default: true) */
  checkSourceImports: boolean;
  /** Check for tautological assertions (default: true) */
  checkTautologicalAssertions: boolean;
  /** Check for empty test bodies (default: true) */
  checkEmptyTestBodies: boolean;
  /** Check for mirrored assertion values (default: true) */
  checkMirroredAssertions: boolean;
  /** Minimum score to pass (default: 60) */
  minPassScore: number;
}

const DEFAULT_CONFIG: TestQualityGateConfig = {
  checkSourceImports: true,
  checkTautologicalAssertions: true,
  checkEmptyTestBodies: true,
  checkMirroredAssertions: true,
  minPassScore: 60,
};

// ============================================================================
// TestQualityGate
// ============================================================================

export class TestQualityGate {
  private readonly config: TestQualityGateConfig;

  constructor(config?: Partial<TestQualityGateConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate generated test code quality.
   *
   * @param testCode - The generated test source code
   * @param sourceFilePath - Path to the source file under test
   * @param sourceCode - Optional source code content for mirrored assertion check
   * @returns Gate result with pass/fail, issues, and score
   */
  validate(
    testCode: string,
    sourceFilePath: string,
    sourceCode?: string
  ): TestQualityGateResult {
    const issues: TestQualityIssue[] = [];

    if (this.config.checkSourceImports) {
      issues.push(...this.detectMissingSourceImports(testCode, sourceFilePath));
    }

    if (this.config.checkTautologicalAssertions) {
      issues.push(...this.detectTautologicalAssertions(testCode));
    }

    if (this.config.checkEmptyTestBodies) {
      issues.push(...this.detectEmptyTestBodies(testCode));
    }

    if (this.config.checkMirroredAssertions && sourceCode) {
      issues.push(...this.detectMirroredAssertions(testCode, sourceCode));
    }

    const score = this.calculateScore(issues);
    const passed = score >= this.config.minPassScore;

    return { passed, issues, score };
  }

  // ============================================================================
  // Detection Methods
  // ============================================================================

  /**
   * Check whether the test code imports from the source file.
   * If no import/require statement references the source file basename, flag an error.
   */
  private detectMissingSourceImports(
    testCode: string,
    sourceFilePath: string
  ): TestQualityIssue[] {
    // Extract basename without extension for matching
    const parts = sourceFilePath.replace(/\\/g, '/').split('/');
    const fileName = parts[parts.length - 1];
    const baseName = fileName.replace(/\.(ts|js|tsx|jsx|mts|mjs|py)$/, '');

    // Collect all import/require paths from the test code
    const importPaths: string[] = [];

    // ES import: import ... from '...'
    const esImportRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = esImportRegex.exec(testCode)) !== null) {
      importPaths.push(match[1]);
    }

    // CommonJS require: require('...')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(testCode)) !== null) {
      importPaths.push(match[1]);
    }

    // Check if any import path references the source file
    const hasSourceImport = importPaths.some((importPath) => {
      const importBaseName = importPath
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        ?.replace(/\.(ts|js|tsx|jsx|mts|mjs)$/, '')
        ?.replace(/\.js$/, '');
      return importBaseName === baseName;
    });

    if (!hasSourceImport && importPaths.length >= 0) {
      return [
        {
          type: 'no-source-import',
          severity: 'error',
          description: `Test does not import from source file "${baseName}". Tests that never reference the source under test are likely mock-only or dead code.`,
          suggestion: `Add an import statement that references the source module, e.g.: import { ... } from './${baseName}.js'`,
        },
      ];
    }

    return [];
  }

  /**
   * Detect tautological assertions where the expected and actual values are identical.
   * Examples: expect(true).toBe(true), expect(x).toBe(x), expect('a').toEqual('a')
   */
  private detectTautologicalAssertions(testCode: string): TestQualityIssue[] {
    const issues: TestQualityIssue[] = [];
    const lines = testCode.split('\n');
    const matchers = ['toBe', 'toEqual', 'toStrictEqual'];
    const matcherPattern = matchers.join('|');

    // Pattern 1: Literal boolean/null/undefined on both sides
    // expect(true).toBe(true), expect(false).toEqual(false), etc.
    const literalPattern = new RegExp(
      `expect\\s*\\(\\s*(true|false|null|undefined)\\s*\\)\\s*\\.\\s*(?:${matcherPattern})\\s*\\(\\s*\\1\\s*\\)`,
    );

    // Pattern 2: Same numeric literal on both sides
    // expect(1).toBe(1), expect(42).toEqual(42)
    const numericPattern = new RegExp(
      `expect\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*\\)\\s*\\.\\s*(?:${matcherPattern})\\s*\\(\\s*\\1\\s*\\)`,
    );

    // Pattern 3: Same string literal on both sides (single or double quotes)
    // expect('hello').toBe('hello'), expect("foo").toEqual("foo")
    const singleQuotePattern = new RegExp(
      `expect\\s*\\(\\s*'([^']*)'\\s*\\)\\s*\\.\\s*(?:${matcherPattern})\\s*\\(\\s*'\\1'\\s*\\)`,
    );
    const doubleQuotePattern = new RegExp(
      `expect\\s*\\(\\s*"([^"]*)"\\s*\\)\\s*\\.\\s*(?:${matcherPattern})\\s*\\(\\s*"\\1"\\s*\\)`,
    );

    // Pattern 4: Same identifier on both sides
    // expect(x).toBe(x), expect(result).toEqual(result)
    const identifierPattern = new RegExp(
      `expect\\s*\\(\\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\)\\s*\\.\\s*(?:${matcherPattern})\\s*\\(\\s*\\1\\s*\\)`,
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (literalPattern.test(line)) {
        const literalMatch = line.match(literalPattern);
        issues.push({
          type: 'tautological-assertion',
          severity: 'error',
          line: lineNum,
          description: `Tautological assertion: expect(${literalMatch?.[1]}) always equals itself.`,
          suggestion: 'Replace with a meaningful assertion that tests actual behavior, e.g.: expect(myFunction()).toBe(expectedValue)',
        });
      } else if (numericPattern.test(line)) {
        const numMatch = line.match(numericPattern);
        issues.push({
          type: 'tautological-assertion',
          severity: 'error',
          line: lineNum,
          description: `Tautological assertion: expect(${numMatch?.[1]}) always equals itself.`,
          suggestion: 'Replace with a meaningful assertion that tests actual behavior.',
        });
      } else if (singleQuotePattern.test(line)) {
        const strMatch = line.match(singleQuotePattern);
        issues.push({
          type: 'tautological-assertion',
          severity: 'error',
          line: lineNum,
          description: `Tautological assertion: expect('${strMatch?.[1]}') always equals itself.`,
          suggestion: 'Replace with a meaningful assertion that tests actual behavior.',
        });
      } else if (doubleQuotePattern.test(line)) {
        const strMatch = line.match(doubleQuotePattern);
        issues.push({
          type: 'tautological-assertion',
          severity: 'error',
          line: lineNum,
          description: `Tautological assertion: expect("${strMatch?.[1]}") always equals itself.`,
          suggestion: 'Replace with a meaningful assertion that tests actual behavior.',
        });
      } else if (identifierPattern.test(line)) {
        const idMatch = line.match(identifierPattern);
        // Avoid false positives with common non-tautological patterns
        // like expect(result).toBe(result) where result is a computed value
        // We flag it anyway since same-variable assertions are always suspicious
        issues.push({
          type: 'tautological-assertion',
          severity: 'error',
          line: lineNum,
          description: `Tautological assertion: expect(${idMatch?.[1]}).toBe(${idMatch?.[1]}) compares a value to itself.`,
          suggestion: 'Compute expected value independently from the actual value.',
        });
      }
    }

    return issues;
  }

  /**
   * Detect empty test bodies - test/it blocks with no assertions or meaningful code.
   * Matches: it('...', () => {}), test('...', () => { /* comment * / })
   */
  private detectEmptyTestBodies(testCode: string): TestQualityIssue[] {
    const issues: TestQualityIssue[] = [];
    const lines = testCode.split('\n');

    // Match it(...) or test(...) blocks with empty or comment-only bodies
    // We look for patterns like:
    //   it('desc', () => {})
    //   it('desc', () => { })
    //   it('desc', () => { /* comment */ })
    //   it('desc', function() {})
    //   test('desc', () => {})
    //
    // Two-phase approach to avoid ReDoS: first match the block structure,
    // then check if the body contains only whitespace and comments.
    const testBlockRegex = /(?:it|test)\s*\(\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*,\s*(?:async\s+)?(?:\(\)\s*=>|function\s*\(\))\s*\{([^}]*)\}\s*\)/;
    const isEmptyOrCommentOnly = (body: string): boolean => {
      // Strip block comments, then line comments, then check if only whitespace remains
      const stripped = body.replace(/\/\*[^*]*\*\//g, '').replace(/\/\/[^\n]*/g, '');
      return stripped.trim().length === 0;
    };
    for (let i = 0; i < lines.length; i++) {
      // Only check lines that start a test block
      if (!/(?:it|test)\s*\(/.test(lines[i])) continue;

      // Build a multi-line window to catch bodies that span 1-3 lines
      const window = lines.slice(i, i + 4).join(' ');
      const match = testBlockRegex.exec(window);
      if (match && isEmptyOrCommentOnly(match[1])) {
        issues.push({
          type: 'empty-test-body',
          severity: 'error',
          line: i + 1,
          description: 'Empty test body: this test has no assertions or meaningful code.',
          suggestion: 'Add assertions that verify the expected behavior of the code under test.',
        });
      }
    }

    return issues;
  }

  /**
   * Detect mirrored assertions - expected values that appear to be copy-pasted
   * from source code literals rather than independently computed.
   */
  private detectMirroredAssertions(
    testCode: string,
    sourceCode: string
  ): TestQualityIssue[] {
    const issues: TestQualityIssue[] = [];

    // Extract non-trivial literals from source code
    const sourceLiterals = this.extractNonTrivialLiterals(sourceCode);
    if (sourceLiterals.length === 0) return issues;

    const lines = testCode.split('\n');
    const matcherPattern = /\.(?:toBe|toEqual|toStrictEqual)\s*\(\s*(.+?)\s*\)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const assertionMatch = line.match(matcherPattern);
      if (!assertionMatch) continue;

      const expectedValue = assertionMatch[1].trim();

      // Check if the expected value matches a source literal
      for (const literal of sourceLiterals) {
        if (this.literalMatches(expectedValue, literal)) {
          issues.push({
            type: 'mirrored-assertion',
            severity: 'warning',
            line: i + 1,
            description: `Assertion expected value "${expectedValue}" mirrors a literal from the source code. This may indicate the test was generated by copying source values rather than computing expected results independently.`,
            suggestion: 'Verify the expected value is derived from requirements, not copied from the implementation.',
          });
          break; // One warning per line is enough
        }
      }
    }

    return issues;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Extract non-trivial string and number literals from source code.
   * Trivial values (true, false, null, undefined, 0, 1, '', "") are excluded.
   */
  private extractNonTrivialLiterals(sourceCode: string): string[] {
    const literals = new Set<string>();
    const trivialValues = new Set([
      'true', 'false', 'null', 'undefined',
      '0', '1', '-1', '""', "''", '``',
    ]);

    // Extract string literals (single and double quoted)
    const stringRegex = /(?:=|return|:)\s*(['"])(.+?)\1/g;
    let match: RegExpExecArray | null;
    while ((match = stringRegex.exec(sourceCode)) !== null) {
      const value = match[2];
      if (value.length >= 2 && !trivialValues.has(value)) {
        literals.add(`'${value}'`);
        literals.add(`"${value}"`);
      }
    }

    // Extract number literals (non-trivial: > 1 or decimals)
    const numberRegex = /(?:=|return|:)\s*(\d+(?:\.\d+)?)\b/g;
    while ((match = numberRegex.exec(sourceCode)) !== null) {
      const value = match[1];
      if (!trivialValues.has(value)) {
        literals.add(value);
      }
    }

    return Array.from(literals);
  }

  /**
   * Check if an assertion expected value matches a source literal.
   */
  private literalMatches(expectedValue: string, sourceLiteral: string): boolean {
    // Direct match
    if (expectedValue === sourceLiteral) return true;

    // Strip quotes for comparison
    const stripped = expectedValue.replace(/^['"`]|['"`]$/g, '');
    const sourceStripped = sourceLiteral.replace(/^['"`]|['"`]$/g, '');

    return stripped === sourceStripped && stripped.length >= 2;
  }

  /**
   * Calculate quality score from issues.
   * Start at 100, subtract per issue (error: -20, warning: -5), clamp to 0.
   */
  private calculateScore(issues: TestQualityIssue[]): number {
    let score = 100;

    for (const issue of issues) {
      if (issue.severity === 'error') {
        score -= 20;
      } else {
        score -= 5;
      }
    }

    return Math.max(0, score);
  }
}
