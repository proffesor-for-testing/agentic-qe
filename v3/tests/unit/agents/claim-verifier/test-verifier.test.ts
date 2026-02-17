/**
 * Unit tests for TestBasedVerifier (CV-004)
 * Tests claim classification, test count verification, test execution
 * verification, coverage verification, error handling, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Claim } from '../../../../src/agents/claim-verifier/interfaces';

// Use vi.hoisted() so the mock fn is available when vi.mock factory runs (hoisted above imports).
const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: vi.fn(() => mockExecAsync),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { TestBasedVerifier } from '../../../../src/agents/claim-verifier/verifiers/test-verifier';

const mockedReadFile = vi.mocked(readFile);

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-020',
    type: 'metric-count',
    statement: 'All 50 tests pass',
    evidence: [],
    sourceAgent: 'test-runner-agent',
    severity: 'medium',
    timestamp: new Date(),
    ...overrides,
  };
}

describe('TestBasedVerifier', () => {
  let verifier: TestBasedVerifier;

  beforeEach(() => {
    vi.clearAllMocks();
    verifier = new TestBasedVerifier({ rootDir: '/workspace/project' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor defaults', () => {
    it('should apply default config values when optional fields are omitted', () => {
      // Arrange & Act
      const v = new TestBasedVerifier({ rootDir: '/test' });

      // Assert
      expect(v).toBeDefined();
    });

    it('should accept custom config values', () => {
      // Arrange & Act
      const v = new TestBasedVerifier({
        rootDir: '/custom',
        testCommand: 'npx vitest run',
        coverageCommand: 'npx vitest run --coverage',
        coverageReportPath: 'coverage/lcov.json',
        timeout: 120000,
      });

      // Assert
      expect(v).toBeDefined();
    });
  });

  describe('claim classification and test-results verification', () => {
    it('should classify claim with "pass" as test-results and verify when all pass', async () => {
      // Arrange
      const claim = makeClaim({ statement: 'All tests pass' });
      mockExecAsync.mockResolvedValue({
        stdout: '42 passed',
        stderr: '',
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.method).toBe('execution');
      expect(result.reasoning).toContain('All 42 tests passed');
    });

    it('should classify claim with percentage as coverage type', async () => {
      // Arrange
      const claim = makeClaim({ statement: 'Coverage is at 85%' });
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          total: {
            lines: { pct: 85 },
            statements: { pct: 84 },
            functions: { pct: 80 },
            branches: { pct: 75 },
          },
        })
      );

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.confidence).toBe(0.95);
    });

    it('should classify claim with test + number as test-count type', async () => {
      // Arrange
      const claim = makeClaim({ statement: 'There are 100 tests in the suite' });
      mockExecAsync.mockResolvedValue({
        stdout: '150 passed',
        stderr: '',
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.reasoning).toContain('Claimed 100');
    });
  });

  describe('test count verification', () => {
    it('should verify when actual test count meets claimed count', async () => {
      // Arrange
      const claim = makeClaim({ statement: 'Project has 30 tests' });
      mockExecAsync.mockResolvedValue({
        stdout: '35 passed',
        stderr: '',
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.confidence).toBe(0.95);
    });

    it('should reject when actual count is below claimed count', async () => {
      // Arrange
      const claim = makeClaim({ statement: 'Project has 200 tests' });
      mockExecAsync.mockResolvedValue({
        stdout: '50 passed',
        stderr: '',
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.reasoning).toContain('only 50');
    });
  });

  describe('test execution verification', () => {
    it('should reject pass claim when some tests fail', async () => {
      // Arrange
      const claim = makeClaim({ statement: 'All tests pass' });
      mockExecAsync.mockResolvedValue({
        stdout: '20 passed | 5 failed',
        stderr: '',
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.reasoning).toContain('5 of 25 tests failed');
    });

    it('should handle test execution failure gracefully', async () => {
      // Arrange - runTests calls execAsync which throws
      const claim = makeClaim({ statement: 'All tests pass' });
      mockExecAsync.mockRejectedValue(new Error('npm test: command not found'));

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('command not found');
    });
  });

  describe('coverage verification', () => {
    it('should verify when actual coverage meets claimed percentage', async () => {
      // Arrange
      const claim = makeClaim({ statement: 'Test coverage is 80%' });
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          total: {
            lines: { pct: 82 },
            statements: { pct: 80 },
            functions: { pct: 78 },
            branches: { pct: 70 },
          },
        })
      );

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
    });

    it('should reject when actual coverage is below claimed percentage', async () => {
      // Arrange
      const claim = makeClaim({ statement: 'We achieved 95% coverage' });
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          total: {
            lines: { pct: 60 },
            statements: { pct: 58 },
            functions: { pct: 55 },
            branches: { pct: 45 },
          },
        })
      );

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.reasoning).toContain('only 60%');
    });

    it('should handle missing coverage report gracefully', async () => {
      // Arrange
      const claim = makeClaim({ statement: 'Coverage is 90%' });
      mockedReadFile.mockRejectedValue(new Error('ENOENT: no such file'));

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('ENOENT');
    });
  });

  describe('existing evidence verification', () => {
    it('should verify when all existing test-result evidence is verified', async () => {
      // Arrange - statement does not match any classifyTestClaim pattern
      const claim = makeClaim({
        statement: 'Checks completed',
        evidence: [
          {
            type: 'test-result' as const,
            location: 'test-run',
            content: '10 passed',
            verified: true,
            timestamp: new Date(),
          },
        ],
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.confidence).toBe(0.8);
    });

    it('should reject when existing evidence is not all verified', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Checks completed',
        evidence: [
          {
            type: 'test-result' as const,
            location: 'test-run',
            content: '5 failed',
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

    it('should return unverified when no test or coverage evidence exists', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Random claim without context',
        evidence: [
          {
            type: 'file-reference' as const,
            location: 'some-file.ts',
            content: 'irrelevant',
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

  describe('error handling', () => {
    it('should return safe error result when verify throws unexpectedly', async () => {
      // Arrange - runTests throws synchronously
      const claim = makeClaim({ statement: 'All tests pass' });
      mockExecAsync.mockImplementation(() => {
        throw new Error('Segmentation fault');
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Segmentation fault');
      expect(result.requiresHumanReview).toBe(true);
    });
  });
});
