/**
 * Unit tests for FileBasedVerifier (CV-003)
 * Tests file existence verification, content pattern matching,
 * error handling, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Claim } from '../../../../src/agents/claim-verifier/interfaces';

// Mock external dependencies before importing the module under test
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('fast-glob', () => ({
  default: vi.fn(),
}));

vi.mock('../../../../src/agents/claim-verifier/index', () => ({
  generateContentHash: vi.fn((content: string) => `hash-${content.length}`),
}));

import { readFile, stat } from 'node:fs/promises';
import fg from 'fast-glob';
import { FileBasedVerifier } from '../../../../src/agents/claim-verifier/verifiers/file-verifier';

const mockedStat = vi.mocked(stat);
const mockedReadFile = vi.mocked(readFile);
const mockedFg = vi.mocked(fg);

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-001',
    type: 'pattern-implementation',
    statement: 'Pattern applied consistently',
    evidence: [],
    sourceAgent: 'test-agent',
    severity: 'medium',
    timestamp: new Date(),
    ...overrides,
  };
}

describe('FileBasedVerifier', () => {
  let verifier: FileBasedVerifier;

  beforeEach(() => {
    vi.clearAllMocks();
    verifier = new FileBasedVerifier({ rootDir: '/workspace/project' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor defaults', () => {
    it('should apply default config values when optional fields are omitted', () => {
      // Arrange & Act
      const v = new FileBasedVerifier({ rootDir: '/test' });

      // Assert
      expect(v).toBeDefined();
    });

    it('should accept custom config values', () => {
      // Arrange & Act
      const custom = new FileBasedVerifier({
        rootDir: '/custom',
        maxFileSize: 1024,
        encoding: 'ascii',
        excludePatterns: ['*.log'],
      });

      // Assert
      expect(custom).toBeDefined();
    });
  });

  describe('file existence verification', () => {
    it('should verify claim as true when all referenced files exist', async () => {
      // Arrange - statement references a file path but does NOT contain security keywords
      const claim = makeClaim({
        statement: 'Updated src/auth/login.ts with new logic',
        evidence: [
          {
            type: 'file-reference',
            location: 'src/auth/login.ts:42',
            content: 'validateInput(username)',
          },
        ],
      });
      // stat is called for the file-reference evidence AND for the file path in statement
      // Both resolve to the same path, so only one call (deduped in extractFilePatterns)
      mockedStat.mockResolvedValue({ isFile: () => true, size: 512 } as any);

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.claimId).toBe('claim-001');
      expect(result.method).toBe('cross-file');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should reject claim when referenced files do not exist', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Fixed src/db/query.ts for SQL safety',
        evidence: [
          {
            type: 'file-reference',
            location: 'src/db/query.ts:10',
            content: 'db.query(sql, params)',
          },
        ],
      });
      mockedStat.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.reasoning).toContain('not found');
    });

    it('should handle mixed results when some files exist and others do not', async () => {
      // Arrange - use evidence with two distinct file-reference paths
      const claim = makeClaim({
        statement: 'Updated multiple files',
        evidence: [
          { type: 'file-reference', location: 'src/auth/login.ts:1', content: 'code' },
          { type: 'file-reference', location: 'src/auth/register.ts:1', content: 'code' },
        ],
      });
      mockedStat
        .mockResolvedValueOnce({ isFile: () => true, size: 100 } as any)
        .mockRejectedValueOnce(new Error('ENOENT'));

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.reasoning).toContain('1 of 2');
    });
  });

  describe('content pattern verification', () => {
    it('should verify claim when search pattern is found in files', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'All database queries use parameterized queries',
        evidence: [],
      });
      mockedFg.mockResolvedValue(['/workspace/project/src/db.ts'] as any);
      mockedStat.mockResolvedValue({ size: 500 } as any);
      mockedReadFile.mockResolvedValue(
        'const result = db.query(sql, params); // parameterized queries\n'
      );

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.reasoning).toContain('Pattern found');
    });

    it('should reject claim when search pattern is not found in any file', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Input validation applied across the codebase',
        evidence: [],
      });
      mockedFg.mockResolvedValue(['/workspace/project/src/handler.ts'] as any);
      mockedStat.mockResolvedValue({ size: 200 } as any);
      mockedReadFile.mockResolvedValue('function handler(req) { return req.body; }\n');

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.reasoning).toContain('not found');
    });
  });

  describe('existing evidence verification', () => {
    it('should verify existing file-reference evidence when files exist', async () => {
      // Arrange - evidence type is file-reference so extractFilePatterns picks it up
      // and verifyFileExistence is called. Statement has no security keywords.
      const claim = makeClaim({
        statement: 'Changes applied correctly',
        evidence: [
          { type: 'file-reference', location: 'config/app.json:1', content: '{}' },
        ],
      });
      mockedStat.mockResolvedValue({ isFile: () => true, size: 64 } as any);

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.reasoning).toContain('files exist');
    });

    it('should return unverified when no evidence and no patterns exist', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Everything looks good',
        evidence: [],
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      // With empty evidence array, verifyExistingEvidence returns passed=0, total=0
      // verified = (0 === 0 && 0 > 0) = false
      expect(result.verified).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should return a safe error result when file stat rejects in existence check', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'Check src/broken/file.ts for patterns',
        evidence: [
          { type: 'file-reference', location: 'src/broken/file.ts:1', content: 'x' },
        ],
      });
      mockedStat.mockRejectedValue(new Error('Permission denied'));

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.reasoning).toContain('not found');
    });
  });

  describe('confidence calculation', () => {
    it('should return confidence 1.0 when all instances pass', async () => {
      // Arrange
      const claim = makeClaim({
        statement: 'File src/index.ts is present',
        evidence: [
          { type: 'file-reference', location: 'src/index.ts:1', content: 'export {}' },
        ],
      });
      mockedStat.mockResolvedValue({ isFile: () => true, size: 256 } as any);

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.confidence).toBe(1.0);
    });

    it('should flag requiresHumanReview when confidence is below 0.7', async () => {
      // Arrange - claim with no patterns and no evidence gives 0 confidence
      const claim = makeClaim({
        statement: 'Vague claim with no actionable data',
        evidence: [],
      });

      // Act
      const result = await verifier.verify(claim);

      // Assert
      expect(result.requiresHumanReview).toBe(true);
    });
  });
});
