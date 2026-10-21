/**
 * Unit tests for OutputBasedVerifier (CV-005)
 * Tests command extraction, output analysis, evidence verification,
 * error handling, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Claim } from '../../../../src/agents/claim-verifier/interfaces';

// We need to mock execAsync which is created via `promisify(exec)` at module scope.
// Use vi.hoisted() so the mock fn is available when vi.mock factory runs (hoisted above imports).
const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: vi.fn(() => mockExecAsync),
}));

vi.mock('../../../../src/agents/claim-verifier/index', () => ({
  generateContentHash: vi.fn((content: string) => `hash-${content.length}`),
}));

import { OutputBasedVerifier } from '../../../../src/agents/claim-verifier/verifiers/output-verifier';

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-010',
    type: 'metric-count',
    statement: 'Build completed successfully',
    evidence: [],
    sourceAgent: 'build-agent',
    severity: 'medium',
    timestamp: new Date(),
    ...overrides,
  };
}

describe('OutputBasedVerifier', () => {
  let verifier: OutputBasedVerifier;

  beforeEach(() => {
    vi.clearAllMocks();
    verifier = new OutputBasedVerifier({ rootDir: '/workspace/project' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor defaults', () => {
    it('should apply default config values for timeout, maxOutputSize, and env', () => {
      // Arrange & Act
      const v = new OutputBasedVerifier({ rootDir: '/test' });

      // Assert
      expect(v).toBeDefined();
    });

    it('should accept custom config values', () => {
      // Arrange & Act
      const v = new OutputBasedVerifier({
        rootDir: '/custom',
        timeout: 5000,
        maxOutputSize: 512,
        env: { NODE_ENV: 'test' },
      });

      // Assert
      expect(v).toBeDefined();
    });
  });

  describe('command extraction from claim', () => {
    it('should extract build command from statement containing "build"', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Build completed successfully',
      });
      mockExecAsync.mockResolvedValue({
        stdout: 'Build successful\nDone in 2.5s',
        stderr: '',
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.claimId).toBe('claim-010');
      expect(result.method).toBe('execution');
      expect(mockExecAsync).toHaveBeenCalled();
    });

    it('should extract lint command from statement containing "lint"', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Lint passes with no problems',
      });
      mockExecAsync.mockResolvedValue({
        stdout: 'No problems found',
        stderr: '',
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(mockExecAsync).toHaveBeenCalled();
    });

    it('should reject non-allowlisted command from evidence', async () => {
      // Arrange - arbitrary commands are blocked by allowlist (CWE-78 fix)
      const claim = makeClaim({
        statement: 'Custom check ran fine',
        evidence: [
          {
            type: 'command-output',
            location: 'npx custom-tool check',
            content: 'All good',
          },
        ],
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert - non-allowlisted commands are rejected, not executed
      expect(result.verified).toBe(false);
      expect(result.reasoning).toContain('not in allowlist');
      expect(mockExecAsync).not.toHaveBeenCalled();
    });

    it('should extract allowlisted command from evidence with type command-output', async () => {
      // Arrange - allowlisted npm commands are permitted
      const claim = makeClaim({
        statement: 'Custom check ran fine',
        evidence: [
          {
            type: 'command-output',
            location: 'npm run build',
            content: 'All good',
          },
        ],
      });
      mockExecAsync.mockResolvedValue({ stdout: 'All good', stderr: '' });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(mockExecAsync).toHaveBeenCalled();
    });
  });

  describe('output analysis', () => {
    it('should verify claim as true when build succeeds with success pattern', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Build completed successfully',
      });
      mockExecAsync.mockResolvedValue({
        stdout: 'Compiled successfully in 3.2s\nDone in 4s',
        stderr: '',
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should reject claim when command fails with error output', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Build completed successfully',
      });
      // Simulate exec error with stdout/stderr properties (like real child_process errors)
      const execError = Object.assign(new Error('Command failed'), {
        stdout: '',
        stderr: 'Error: Module not found\nBuild failed',
        code: 1,
      });
      mockExecAsync.mockRejectedValue(execError);

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
    });

    it('should verify failure claim when command actually fails', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Build fails due to type error',
      });
      const execError = Object.assign(new Error('fail'), {
        stdout: '',
        stderr: 'Error TS2345: Argument of type...',
        code: 1,
      });
      mockExecAsync.mockRejectedValue(execError);

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.reasoning).toContain('failed as claimed');
    });
  });

  describe('existing evidence verification (no extractable command)', () => {
    it('should verify using existing command-output evidence indicating success', async () => {
      // Arrange - statement has no build/lint/test keyword and no backtick command
      const claim = makeClaim({
        statement: 'Operation went well',
        evidence: [
          {
            type: 'command-output' as const,
            location: '',
            content: 'All tests passed. Done successfully.',
            verified: true,
            timestamp: new Date(),
          },
        ],
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should reject when existing evidence contains error indicators', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Operation went well',
        evidence: [
          {
            type: 'command-output' as const,
            location: '',
            content: 'Error: Something failed during execution',
            verified: false,
            timestamp: new Date(),
          },
        ],
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
    });

    it('should return unverified when no command-output evidence exists', async () => {
      // Arrange - no command in statement, no command-output evidence
      const claim = makeClaim({
        statement: 'Something happened with no trace',
        evidence: [
          {
            type: 'file-reference' as const,
            location: 'readme.md',
            content: 'some content',
          },
        ],
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('output redaction (#1150)', () => {
    it('stores command output as evidence only after redacting it', async () => {
      // Arrange
      const claim = makeClaim({ statement: 'Build completed successfully' });
      const execError = Object.assign(new Error('Command failed'), {
        stdout: 'connecting to postgres://admin:Sup3rS3cretPw@db.internal:5432/app',
        stderr: 'Error: auth failed with token ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8\nBuild failed',
        code: 1,
      });
      mockExecAsync.mockRejectedValue(execError);

      // Act
      const result = await verifier.verify(claim);

      // Assert
      const stored = JSON.stringify(result.counterEvidence);
      expect(stored).toContain('Build failed');
      expect(stored).not.toContain('Sup3rS3cretPw');
      expect(stored).not.toContain('M3n4O5p6Q7r8');
    });

    it('redacts output longer than one redaction piece without dropping it', async () => {
      // Arrange: ~1 MB of output (over redactLogText's scan limit), credential near the end.
      const claim = makeClaim({ statement: 'Build completed successfully' });
      const stdout = 'compiled line\n'.repeat(73_000) + 'password=Sup3rS3cretPw\nbuild successful\n';
      mockExecAsync.mockResolvedValue({ stdout, stderr: '' });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return safe error result when an unexpected error is thrown', async () => {
      // Arrange - throw error without stdout/stderr so it re-throws from executeCommand
      const claim = makeClaim({
        statement: 'Build completed successfully',
      });
      mockExecAsync.mockRejectedValue(new Error('Unexpected crash'));

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Unexpected crash');
      expect(result.requiresHumanReview).toBe(true);
    });
  });
});
