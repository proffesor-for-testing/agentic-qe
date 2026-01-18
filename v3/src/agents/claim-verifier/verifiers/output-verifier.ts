/**
 * Agentic QE v3 - Output-Based Verifier
 * CV-005: Verify claims about command output
 *
 * This verifier validates claims related to command execution:
 * - Build success/failure
 * - Command output patterns
 * - Error/warning detection
 *
 * @module agents/claim-verifier/verifiers
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  Claim,
  Evidence,
  VerificationResult,
  VerificationOptions,
} from '../interfaces';
import { generateContentHash } from '../index';

const execAsync = promisify(exec);

/**
 * Configuration for output-based verification.
 */
export interface OutputVerifierConfig {
  /**
   * Root directory for command execution
   */
  readonly rootDir: string;

  /**
   * Timeout for command execution (milliseconds)
   * @default 60000
   */
  readonly timeout?: number;

  /**
   * Maximum output size to capture (bytes)
   * @default 1MB
   */
  readonly maxOutputSize?: number;

  /**
   * Environment variables for command execution
   */
  readonly env?: Record<string, string>;
}

/**
 * Parsed command result.
 */
interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly duration: number;
  readonly success: boolean;
}

/**
 * Output pattern to search for.
 */
interface OutputPattern {
  readonly pattern: string | RegExp;
  readonly type: 'success' | 'error' | 'warning' | 'info';
  readonly location: 'stdout' | 'stderr' | 'both';
}

/**
 * OutputBasedVerifier verifies claims about command execution output.
 *
 * Verification methods:
 * 1. Command execution: Run commands and capture output
 * 2. Pattern matching: Search for success/error patterns
 * 3. Exit code validation: Verify command success/failure
 *
 * @example
 * ```typescript
 * const verifier = new OutputBasedVerifier({
 *   rootDir: '/workspace/project',
 *   timeout: 30000
 * });
 *
 * const result = await verifier.verify(claim);
 * ```
 */
export class OutputBasedVerifier {
  private readonly config: Required<OutputVerifierConfig>;

  /**
   * Common patterns for build/command success and errors.
   */
  private readonly patterns: Record<string, OutputPattern[]> = {
    build: [
      { pattern: /build successful/i, type: 'success', location: 'stdout' },
      { pattern: /compiled successfully/i, type: 'success', location: 'stdout' },
      { pattern: /done in/i, type: 'success', location: 'stdout' },
      { pattern: /error/i, type: 'error', location: 'stderr' },
      { pattern: /failed/i, type: 'error', location: 'both' },
      { pattern: /warning/i, type: 'warning', location: 'both' },
    ],
    lint: [
      { pattern: /no problems found/i, type: 'success', location: 'stdout' },
      { pattern: /✔.*\d+ problems?/i, type: 'success', location: 'stdout' },
      { pattern: /✖.*\d+ problems?/i, type: 'error', location: 'stdout' },
      { pattern: /error/i, type: 'error', location: 'both' },
    ],
  };

  constructor(config: OutputVerifierConfig) {
    this.config = {
      rootDir: config.rootDir,
      timeout: config.timeout ?? 60000,
      maxOutputSize: config.maxOutputSize ?? 1024 * 1024, // 1MB
      env: config.env ?? {},
    };
  }

  /**
   * Verify a claim using output-based verification.
   *
   * @param claim - The claim to verify
   * @param options - Verification options
   * @returns Verification result with command output evidence
   */
  async verify(
    claim: Claim,
    options?: VerificationOptions
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      // Extract command from claim or evidence
      const command = this.extractCommand(claim);

      if (!command) {
        // Verify based on existing evidence
        const evidenceResults = await this.verifyExistingEvidence(claim.evidence);
        const verificationTimeMs = Date.now() - startTime;

        return {
          claimId: claim.id,
          verified: evidenceResults.verified,
          confidence: evidenceResults.confidence,
          method: 'execution',
          reasoning: evidenceResults.reasoning,
          allInstancesChecked: true,
          instancesChecked: evidenceResults.evidence.length,
          instancesPassed: evidenceResults.verified ? evidenceResults.evidence.length : 0,
          verificationTimeMs,
          verifiedAt: new Date(),
          requiresHumanReview: evidenceResults.confidence < 0.7,
        };
      }

      // Execute command and verify output
      const result = await this.executeCommand(command);
      const evidence = this.createEvidence(command, result);

      // Determine if claim is verified based on output
      const verification = this.analyzeOutput(claim, result);

      const verificationTimeMs = Date.now() - startTime;

      return {
        claimId: claim.id,
        verified: verification.verified,
        confidence: verification.confidence,
        method: 'execution',
        reasoning: verification.reasoning,
        allInstancesChecked: true,
        instancesChecked: 1,
        instancesPassed: verification.verified ? 1 : 0,
        verificationTimeMs,
        verifiedAt: new Date(),
        requiresHumanReview: verification.confidence < 0.8,
        counterEvidence: verification.verified ? undefined : evidence,
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
   * Extract command from claim statement or evidence.
   */
  private extractCommand(claim: Claim): string | null {
    // Check evidence for command-output
    for (const evidence of claim.evidence) {
      if (evidence.type === 'command-output' && evidence.location) {
        return evidence.location;
      }
    }

    // Try to extract from statement
    const statement = claim.statement.toLowerCase();

    if (statement.includes('build')) {
      return 'npm run build';
    }
    if (statement.includes('lint')) {
      return 'npm run lint';
    }
    if (statement.includes('test')) {
      return 'npm test';
    }
    if (statement.includes('typecheck') || statement.includes('type check')) {
      return 'npm run typecheck';
    }

    // Look for command in backticks or quotes
    const commandMatch = statement.match(/`([^`]+)`|"([^"]+)"/);
    if (commandMatch) {
      return commandMatch[1] || commandMatch[2];
    }

    return null;
  }

  /**
   * Execute a command and capture output.
   */
  private async executeCommand(command: string): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.config.rootDir,
        timeout: this.config.timeout,
        maxBuffer: this.config.maxOutputSize,
        env: { ...process.env, ...this.config.env },
      });

      const duration = Date.now() - startTime;

      return {
        stdout: this.truncateOutput(stdout),
        stderr: this.truncateOutput(stderr),
        exitCode: 0,
        duration,
        success: true,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;

      if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
        const execError = error as {
          stdout: string;
          stderr: string;
          code?: number
        };

        return {
          stdout: this.truncateOutput(execError.stdout || ''),
          stderr: this.truncateOutput(execError.stderr || ''),
          exitCode: execError.code ?? 1,
          duration,
          success: false,
        };
      }

      throw error;
    }
  }

  /**
   * Create evidence from command result.
   */
  private createEvidence(command: string, result: CommandResult): Evidence[] {
    const evidence: Evidence[] = [];

    if (result.stdout) {
      evidence.push({
        type: 'command-output',
        location: command,
        content: result.stdout,
        verified: result.success,
        timestamp: new Date(),
        contentHash: generateContentHash(result.stdout),
        context: {
          stream: 'stdout',
          exitCode: result.exitCode,
          duration: result.duration,
        },
      });
    }

    if (result.stderr) {
      evidence.push({
        type: 'command-output',
        location: command,
        content: result.stderr,
        verified: result.success,
        timestamp: new Date(),
        contentHash: generateContentHash(result.stderr),
        context: {
          stream: 'stderr',
          exitCode: result.exitCode,
          duration: result.duration,
        },
      });
    }

    return evidence;
  }

  /**
   * Analyze command output to verify claim.
   */
  private analyzeOutput(
    claim: Claim,
    result: CommandResult
  ): {
    verified: boolean;
    confidence: number;
    reasoning: string;
  } {
    const statement = claim.statement.toLowerCase();
    const commandType = this.inferCommandType(statement);

    // Get relevant patterns
    const patterns = commandType ? this.patterns[commandType] : [];

    // Check for success/error patterns
    let hasSuccessPattern = false;
    let hasErrorPattern = false;
    let hasWarningPattern = false;

    for (const pattern of patterns) {
      const searchIn = pattern.location === 'both'
        ? result.stdout + result.stderr
        : pattern.location === 'stdout'
          ? result.stdout
          : result.stderr;

      const regex = typeof pattern.pattern === 'string'
        ? new RegExp(pattern.pattern, 'i')
        : pattern.pattern;

      if (regex.test(searchIn)) {
        if (pattern.type === 'success') hasSuccessPattern = true;
        if (pattern.type === 'error') hasErrorPattern = true;
        if (pattern.type === 'warning') hasWarningPattern = true;
      }
    }

    // Determine verification based on claim intent
    const claimExpectsSuccess = statement.includes('success') ||
                                 statement.includes('pass') ||
                                 statement.includes('complete');
    const claimExpectsFailure = statement.includes('fail') ||
                                statement.includes('error');

    let verified: boolean;
    let confidence: number;
    let reasoning: string;

    if (claimExpectsSuccess) {
      verified = result.success && hasSuccessPattern && !hasErrorPattern;
      confidence = verified ? 0.95 : hasWarningPattern ? 0.7 : 0.3;
      reasoning = verified
        ? 'Command executed successfully with expected output'
        : result.success
          ? 'Command succeeded but output patterns do not match'
          : 'Command failed with exit code ' + result.exitCode;
    } else if (claimExpectsFailure) {
      verified = !result.success || hasErrorPattern;
      confidence = verified ? 0.95 : 0.3;
      reasoning = verified
        ? 'Command failed as claimed'
        : 'Command succeeded, contradicting the claim';
    } else {
      // Generic verification based on exit code
      verified = result.exitCode === 0;
      confidence = 0.8;
      reasoning = verified
        ? 'Command completed successfully'
        : 'Command exited with error code ' + result.exitCode;
    }

    return { verified, confidence, reasoning };
  }

  /**
   * Infer command type from statement.
   */
  private inferCommandType(statement: string): string | null {
    if (statement.includes('build')) return 'build';
    if (statement.includes('lint')) return 'lint';
    return null;
  }

  /**
   * Verify existing command output evidence.
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
      e => e.type === 'command-output'
    );

    if (evidence.length === 0) {
      return {
        evidence: [],
        verified: false,
        reasoning: 'No command output evidence provided',
        confidence: 0,
      };
    }

    // Analyze existing evidence for success/error patterns
    const hasErrors = evidence.some(e =>
      /error|failed/i.test(e.content)
    );
    const hasSuccess = evidence.some(e =>
      /success|passed|done/i.test(e.content)
    );

    const verified = hasSuccess && !hasErrors;
    const confidence = verified ? 0.8 : 0.3;
    const reasoning = verified
      ? `Found ${evidence.length} evidence items indicating success`
      : hasErrors
        ? 'Evidence contains error indicators'
        : 'Evidence does not indicate success';

    return { evidence, verified, reasoning, confidence };
  }

  /**
   * Truncate output if it exceeds max size.
   */
  private truncateOutput(output: string): string {
    if (output.length <= this.config.maxOutputSize) {
      return output;
    }

    const truncated = output.substring(0, this.config.maxOutputSize);
    return truncated + '\n\n... [output truncated]';
  }
}
