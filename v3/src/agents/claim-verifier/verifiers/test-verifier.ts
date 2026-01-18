/**
 * Agentic QE v3 - Test-Based Verifier
 * CV-004: Verify claims about test results and coverage
 *
 * This verifier validates claims related to testing:
 * - Test pass/fail counts
 * - Coverage percentages
 * - Test suite execution results
 *
 * @module agents/claim-verifier/verifiers
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Claim,
  Evidence,
  VerificationResult,
  VerificationOptions,
} from '../interfaces';

const execAsync = promisify(exec);

/**
 * Configuration for test-based verification.
 */
export interface TestVerifierConfig {
  /**
   * Root directory for test execution
   */
  readonly rootDir: string;

  /**
   * Test command to execute
   * @default 'npm test'
   */
  readonly testCommand?: string;

  /**
   * Coverage command to execute
   * @default 'npm run test:coverage'
   */
  readonly coverageCommand?: string;

  /**
   * Path to coverage report (relative to rootDir)
   * @default 'coverage/coverage-summary.json'
   */
  readonly coverageReportPath?: string;

  /**
   * Timeout for test execution (milliseconds)
   * @default 60000
   */
  readonly timeout?: number;
}

/**
 * Parsed test results.
 */
interface TestResults {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped?: number;
  readonly duration?: number;
  readonly rawOutput: string;
}

/**
 * Parsed coverage data.
 */
interface CoverageData {
  readonly lines: number;
  readonly statements: number;
  readonly functions: number;
  readonly branches: number;
  readonly rawData: Record<string, unknown>;
}

/**
 * TestBasedVerifier verifies claims about test execution and coverage.
 *
 * Verification methods:
 * 1. Test execution: Run tests and parse results
 * 2. Coverage analysis: Parse coverage reports
 * 3. Metric validation: Verify claimed counts match actual results
 *
 * @example
 * ```typescript
 * const verifier = new TestBasedVerifier({
 *   rootDir: '/workspace/project',
 *   testCommand: 'npm run test:unit',
 *   coverageCommand: 'npm run test:coverage'
 * });
 *
 * const result = await verifier.verify(claim);
 * ```
 */
export class TestBasedVerifier {
  private readonly config: Required<TestVerifierConfig>;

  constructor(config: TestVerifierConfig) {
    this.config = {
      rootDir: config.rootDir,
      testCommand: config.testCommand ?? 'npm test',
      coverageCommand: config.coverageCommand ?? 'npm run test:coverage',
      coverageReportPath: config.coverageReportPath ?? 'coverage/coverage-summary.json',
      timeout: config.timeout ?? 60000,
    };
  }

  /**
   * Verify a claim using test-based verification.
   *
   * @param claim - The claim to verify
   * @param options - Verification options
   * @returns Verification result with test evidence
   */
  async verify(
    claim: Claim,
    options?: VerificationOptions
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      // Determine what type of test claim this is
      const claimType = this.classifyTestClaim(claim);

      let evidence: Evidence[] = [];
      let verified = false;
      let reasoning = '';
      let confidence = 0;

      switch (claimType) {
        case 'test-count':
          const testResults = await this.verifyTestCount(claim);
          evidence = testResults.evidence;
          verified = testResults.verified;
          reasoning = testResults.reasoning;
          confidence = testResults.confidence;
          break;

        case 'test-results':
          const executionResults = await this.verifyTestExecution(claim);
          evidence = executionResults.evidence;
          verified = executionResults.verified;
          reasoning = executionResults.reasoning;
          confidence = executionResults.confidence;
          break;

        case 'coverage':
          const coverageResults = await this.verifyCoverage(claim);
          evidence = coverageResults.evidence;
          verified = coverageResults.verified;
          reasoning = coverageResults.reasoning;
          confidence = coverageResults.confidence;
          break;

        default:
          // Check existing evidence
          const existingResults = await this.verifyExistingEvidence(claim.evidence);
          evidence = existingResults.evidence;
          verified = existingResults.verified;
          reasoning = existingResults.reasoning;
          confidence = existingResults.confidence;
      }

      const verificationTimeMs = Date.now() - startTime;

      return {
        claimId: claim.id,
        verified,
        confidence,
        method: 'execution',
        reasoning,
        allInstancesChecked: true, // Test execution checks all tests
        instancesChecked: 1,
        instancesPassed: verified ? 1 : 0,
        verificationTimeMs,
        verifiedAt: new Date(),
        requiresHumanReview: confidence < 0.8,
      };
    } catch (error) {
      const verificationTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        claimId: claim.id,
        verified: false,
        confidence: 0,
        method: 'execution',
        reasoning: `Verification failed: ${errorMessage}`,
        allInstancesChecked: false,
        instancesChecked: 0,
        instancesPassed: 0,
        verificationTimeMs,
        verifiedAt: new Date(),
        requiresHumanReview: true,
      };
    }
  }

  /**
   * Classify the type of test claim.
   */
  private classifyTestClaim(claim: Claim): 'test-count' | 'test-results' | 'coverage' | 'unknown' {
    const statement = claim.statement.toLowerCase();

    if (
      statement.includes('coverage') ||
      statement.includes('%') ||
      statement.includes('percent')
    ) {
      return 'coverage';
    }

    if (
      statement.includes('test') &&
      (statement.includes('pass') || statement.includes('fail'))
    ) {
      return 'test-results';
    }

    if (
      statement.includes('test') &&
      /\d+/.test(statement)
    ) {
      return 'test-count';
    }

    return 'unknown';
  }

  /**
   * Verify test count claims.
   */
  private async verifyTestCount(
    claim: Claim
  ): Promise<{
    evidence: Evidence[];
    verified: boolean;
    reasoning: string;
    confidence: number;
  }> {
    try {
      const testResults = await this.runTests();
      const claimedCount = this.extractNumber(claim.statement);

      const evidence: Evidence[] = [
        {
          type: 'test-result',
          location: 'test-execution',
          content: `Total tests: ${testResults.total}, Passed: ${testResults.passed}, Failed: ${testResults.failed}`,
          verified: true,
          timestamp: new Date(),
          context: {
            total: testResults.total,
            passed: testResults.passed,
            failed: testResults.failed,
            skipped: testResults.skipped,
          },
        },
        {
          type: 'command-output',
          location: this.config.testCommand,
          content: testResults.rawOutput,
          verified: true,
          timestamp: new Date(),
        },
      ];

      const verified = claimedCount !== null && testResults.total >= claimedCount;
      const reasoning = verified
        ? `Claimed ${claimedCount} tests, found ${testResults.total} tests`
        : claimedCount === null
          ? 'Could not extract test count from claim'
          : `Claimed ${claimedCount} tests, but only ${testResults.total} exist`;

      const confidence = verified ? 0.95 : 0.3;

      return { evidence, verified, reasoning, confidence };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        evidence: [{
          type: 'command-output',
          location: this.config.testCommand,
          content: `Test execution failed: ${errorMessage}`,
          verified: false,
          timestamp: new Date(),
        }],
        verified: false,
        reasoning: `Failed to run tests: ${errorMessage}`,
        confidence: 0,
      };
    }
  }

  /**
   * Verify test execution results.
   */
  private async verifyTestExecution(
    claim: Claim
  ): Promise<{
    evidence: Evidence[];
    verified: boolean;
    reasoning: string;
    confidence: number;
  }> {
    try {
      const testResults = await this.runTests();

      const evidence: Evidence[] = [
        {
          type: 'test-result',
          location: 'test-execution',
          content: `Tests passed: ${testResults.passed}/${testResults.total}`,
          verified: testResults.failed === 0,
          timestamp: new Date(),
          context: {
            total: testResults.total,
            passed: testResults.passed,
            failed: testResults.failed,
          },
        },
        {
          type: 'command-output',
          location: this.config.testCommand,
          content: testResults.rawOutput,
          verified: true,
          timestamp: new Date(),
        },
      ];

      const allPassed = testResults.failed === 0 && testResults.total > 0;
      const verified = claim.statement.toLowerCase().includes('pass')
        ? allPassed
        : !allPassed;

      const reasoning = allPassed
        ? `All ${testResults.total} tests passed`
        : `${testResults.failed} of ${testResults.total} tests failed`;

      const confidence = testResults.total > 0 ? 0.95 : 0.3;

      return { evidence, verified, reasoning, confidence };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        evidence: [{
          type: 'command-output',
          location: this.config.testCommand,
          content: `Test execution failed: ${errorMessage}`,
          verified: false,
          timestamp: new Date(),
        }],
        verified: false,
        reasoning: `Failed to run tests: ${errorMessage}`,
        confidence: 0,
      };
    }
  }

  /**
   * Verify coverage claims.
   */
  private async verifyCoverage(
    claim: Claim
  ): Promise<{
    evidence: Evidence[];
    verified: boolean;
    reasoning: string;
    confidence: number;
  }> {
    try {
      const coverage = await this.getCoverageData();
      const claimedCoverage = this.extractPercentage(claim.statement);

      const evidence: Evidence[] = [
        {
          type: 'coverage-data',
          location: this.config.coverageReportPath,
          content: `Lines: ${coverage.lines}%, Statements: ${coverage.statements}%, Functions: ${coverage.functions}%, Branches: ${coverage.branches}%`,
          verified: true,
          timestamp: new Date(),
          context: coverage.rawData,
        },
      ];

      // Use the most relevant coverage metric
      const actualCoverage = coverage.lines;
      const verified = claimedCoverage !== null && actualCoverage >= claimedCoverage;

      const reasoning = verified
        ? `Claimed ${claimedCoverage}% coverage, actual coverage is ${actualCoverage}%`
        : claimedCoverage === null
          ? 'Could not extract coverage percentage from claim'
          : `Claimed ${claimedCoverage}% coverage, but actual is only ${actualCoverage}%`;

      const confidence = verified ? 0.95 : 0.3;

      return { evidence, verified, reasoning, confidence };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        evidence: [{
          type: 'coverage-data',
          location: this.config.coverageReportPath,
          content: `Coverage data unavailable: ${errorMessage}`,
          verified: false,
          timestamp: new Date(),
        }],
        verified: false,
        reasoning: `Failed to get coverage data: ${errorMessage}`,
        confidence: 0,
      };
    }
  }

  /**
   * Run tests and parse results.
   */
  private async runTests(): Promise<TestResults> {
    const { stdout, stderr } = await execAsync(this.config.testCommand, {
      cwd: this.config.rootDir,
      timeout: this.config.timeout,
    });

    const output = stdout + stderr;

    // Parse test results (supports common formats)
    const results = this.parseTestOutput(output);

    return {
      ...results,
      rawOutput: output,
    };
  }

  /**
   * Parse test output for results.
   */
  private parseTestOutput(output: string): Omit<TestResults, 'rawOutput'> {
    // Try Vitest format first
    let match = output.match(/(\d+) passed(?:\s+\|\s+(\d+) failed)?/);
    if (match) {
      const passed = parseInt(match[1], 10);
      const failed = match[2] ? parseInt(match[2], 10) : 0;
      return {
        total: passed + failed,
        passed,
        failed,
      };
    }

    // Try Jest format
    match = output.match(/Tests:\s+(\d+) failed.*?(\d+) passed.*?(\d+) total/);
    if (match) {
      return {
        total: parseInt(match[3], 10),
        passed: parseInt(match[2], 10),
        failed: parseInt(match[1], 10),
      };
    }

    // Default: assume all passed if no failures found
    return {
      total: 0,
      passed: 0,
      failed: 0,
    };
  }

  /**
   * Get coverage data from report.
   */
  private async getCoverageData(): Promise<CoverageData> {
    const reportPath = join(this.config.rootDir, this.config.coverageReportPath);
    const content = await readFile(reportPath, 'utf-8');
    const data = JSON.parse(content);

    // Handle common coverage report formats
    const total = data.total || data;

    return {
      lines: total.lines?.pct ?? 0,
      statements: total.statements?.pct ?? 0,
      functions: total.functions?.pct ?? 0,
      branches: total.branches?.pct ?? 0,
      rawData: data,
    };
  }

  /**
   * Verify existing test evidence.
   */
  private async verifyExistingEvidence(
    existingEvidence: Evidence[]
  ): Promise<{
    evidence: Evidence[];
    verified: boolean;
    reasoning: string;
    confidence: number;
  }> {
    const evidence = existingEvidence.filter(
      e => e.type === 'test-result' || e.type === 'coverage-data'
    );

    if (evidence.length === 0) {
      return {
        evidence: [],
        verified: false,
        reasoning: 'No test or coverage evidence provided',
        confidence: 0,
      };
    }

    const allVerified = evidence.every(e => e.verified);

    return {
      evidence,
      verified: allVerified,
      reasoning: allVerified
        ? `All ${evidence.length} evidence items verified`
        : 'Some evidence items failed verification',
      confidence: allVerified ? 0.8 : 0.3,
    };
  }

  /**
   * Extract a number from claim statement.
   */
  private extractNumber(statement: string): number | null {
    const match = statement.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  /**
   * Extract a percentage from claim statement.
   */
  private extractPercentage(statement: string): number | null {
    const match = statement.match(/(\d+)%/);
    return match ? parseInt(match[1], 10) : null;
  }
}
