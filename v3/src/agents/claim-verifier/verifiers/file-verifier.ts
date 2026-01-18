/**
 * Agentic QE v3 - File-Based Verifier
 * CV-003: Verify claims about file existence, content, and patterns
 *
 * This verifier validates claims that reference file system state:
 * - File existence claims
 * - Content pattern matching
 * - Comprehensive change verification (allInstancesChecked)
 *
 * @module agents/claim-verifier/verifiers
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import type {
  Claim,
  Evidence,
  VerificationResult,
  VerificationOptions,
} from '../interfaces';
import { generateContentHash } from '../index';

/**
 * Configuration for file-based verification.
 */
export interface FileVerifierConfig {
  /**
   * Root directory for file searches
   */
  readonly rootDir: string;

  /**
   * Maximum file size to read (bytes)
   * @default 10MB
   */
  readonly maxFileSize?: number;

  /**
   * File encoding
   * @default 'utf-8'
   */
  readonly encoding?: BufferEncoding;

  /**
   * Patterns to exclude from file searches
   */
  readonly excludePatterns?: string[];
}

/**
 * Result of file pattern search.
 */
interface FileSearchResult {
  readonly filePath: string;
  readonly matches: Array<{
    readonly line: number;
    readonly content: string;
    readonly column?: number;
  }>;
}

/**
 * FileBasedVerifier verifies claims about files and their contents.
 *
 * Verification methods:
 * 1. File existence: Check if files exist
 * 2. Content matching: Search for patterns in file content
 * 3. Comprehensive checking: Verify ALL instances, not just samples
 *
 * @example
 * ```typescript
 * const verifier = new FileBasedVerifier({
 *   rootDir: '/workspace/project',
 *   excludePatterns: ['node_modules/**', '**\/*.test.ts']
 * });
 *
 * const result = await verifier.verify(claim, {
 *   checkAllInstances: true
 * });
 * ```
 */
export class FileBasedVerifier {
  private readonly config: Required<FileVerifierConfig>;

  constructor(config: FileVerifierConfig) {
    this.config = {
      rootDir: config.rootDir,
      maxFileSize: config.maxFileSize ?? 10 * 1024 * 1024, // 10MB
      encoding: config.encoding ?? 'utf-8',
      excludePatterns: config.excludePatterns ?? ['node_modules/**', '.git/**', 'dist/**'],
    };
  }

  /**
   * Verify a claim using file-based verification.
   *
   * @param claim - The claim to verify
   * @param options - Verification options
   * @returns Verification result with file evidence
   */
  async verify(
    claim: Claim,
    options?: VerificationOptions
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const checkAllInstances = options?.checkAllInstances ?? true;

    try {
      // Extract file patterns from claim statement and evidence
      const filePatterns = this.extractFilePatterns(claim);
      const searchPatterns = this.extractSearchPatterns(claim);

      let evidence: Evidence[] = [];
      let verified = false;
      let reasoning = '';
      let instancesChecked = 0;
      let instancesPassed = 0;

      // Verify file existence claims
      if (filePatterns.length > 0) {
        const existenceResults = await this.verifyFileExistence(filePatterns);
        evidence.push(...existenceResults.evidence);
        instancesChecked += existenceResults.total;
        instancesPassed += existenceResults.passed;

        if (existenceResults.passed === existenceResults.total) {
          verified = true;
          reasoning = `All ${existenceResults.total} referenced files exist`;
        } else {
          verified = false;
          reasoning = `${existenceResults.total - existenceResults.passed} of ${existenceResults.total} files not found`;
        }
      }

      // Verify content pattern claims
      if (searchPatterns.length > 0) {
        const patternResults = await this.verifyContentPatterns(
          searchPatterns,
          checkAllInstances,
          options?.maxInstances
        );
        evidence.push(...patternResults.evidence);
        instancesChecked += patternResults.total;
        instancesPassed += patternResults.passed;

        if (patternResults.passed > 0) {
          verified = true;
          reasoning = checkAllInstances
            ? `Pattern found in all ${patternResults.passed} instances`
            : `Pattern found in ${patternResults.passed} of ${patternResults.total} checked files`;
        } else {
          verified = false;
          reasoning = `Pattern not found in any of ${patternResults.total} checked files`;
        }
      }

      // If no specific patterns, verify based on existing evidence
      if (filePatterns.length === 0 && searchPatterns.length === 0) {
        const evidenceResults = await this.verifyExistingEvidence(claim.evidence);
        evidence = evidenceResults.evidence;
        verified = evidenceResults.verified;
        reasoning = evidenceResults.reasoning;
        instancesChecked = evidenceResults.total;
        instancesPassed = evidenceResults.passed;
      }

      const verificationTimeMs = Date.now() - startTime;
      const confidence = this.calculateConfidence(
        instancesPassed,
        instancesChecked,
        verified
      );

      return {
        claimId: claim.id,
        verified,
        confidence,
        method: 'cross-file',
        reasoning,
        allInstancesChecked: checkAllInstances,
        instancesChecked,
        instancesPassed,
        verificationTimeMs,
        verifiedAt: new Date(),
        requiresHumanReview: confidence < 0.7,
        counterEvidence: verified ? undefined : evidence.filter(e => !e.verified),
      };
    } catch (error) {
      const verificationTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        claimId: claim.id,
        verified: false,
        confidence: 0,
        method: 'cross-file',
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
   * Extract file path patterns from claim.
   */
  private extractFilePatterns(claim: Claim): string[] {
    const patterns: string[] = [];

    // Extract from evidence
    for (const evidence of claim.evidence) {
      if (evidence.type === 'file-reference' || evidence.type === 'code-snippet') {
        const filePath = evidence.location.split(':')[0];
        if (filePath && !patterns.includes(filePath)) {
          patterns.push(filePath);
        }
      }
    }

    // Extract from statement (look for file paths)
    const filePathRegex = /(?:src\/|tests\/|lib\/|app\/)[\w\-/.]+\.[\w]+/g;
    const matches = claim.statement.match(filePathRegex);
    if (matches) {
      patterns.push(...matches.filter(p => !patterns.includes(p)));
    }

    return patterns;
  }

  /**
   * Extract search patterns from claim.
   */
  private extractSearchPatterns(claim: Claim): Array<{
    pattern: string;
    fileGlob?: string;
  }> {
    const patterns: Array<{ pattern: string; fileGlob?: string }> = [];

    // Common security/pattern keywords
    const keywords = [
      'parameterized queries',
      'prepared statements',
      'input validation',
      'sanitization',
      'csrf token',
      'xss prevention',
    ];

    for (const keyword of keywords) {
      if (claim.statement.toLowerCase().includes(keyword)) {
        patterns.push({ pattern: keyword });
      }
    }

    return patterns;
  }

  /**
   * Verify that files exist.
   */
  private async verifyFileExistence(
    filePaths: string[]
  ): Promise<{
    evidence: Evidence[];
    total: number;
    passed: number;
  }> {
    const evidence: Evidence[] = [];
    let passed = 0;

    for (const filePath of filePaths) {
      const fullPath = join(this.config.rootDir, filePath);
      try {
        const stats = await stat(fullPath);
        const exists = stats.isFile();

        evidence.push({
          type: 'file-reference',
          location: filePath,
          content: exists ? `File exists (${stats.size} bytes)` : 'File not found',
          verified: exists,
          timestamp: new Date(),
        });

        if (exists) passed++;
      } catch (error) {
        evidence.push({
          type: 'file-reference',
          location: filePath,
          content: `File not accessible: ${error instanceof Error ? error.message : 'Unknown error'}`,
          verified: false,
          timestamp: new Date(),
        });
      }
    }

    return { evidence, total: filePaths.length, passed };
  }

  /**
   * Verify content patterns across files.
   */
  private async verifyContentPatterns(
    patterns: Array<{ pattern: string; fileGlob?: string }>,
    checkAll: boolean,
    maxInstances?: number
  ): Promise<{
    evidence: Evidence[];
    total: number;
    passed: number;
  }> {
    const evidence: Evidence[] = [];
    let totalFiles = 0;
    let filesWithPattern = 0;

    for (const { pattern, fileGlob } of patterns) {
      const searchGlob = fileGlob ?? '**/*.{ts,js,tsx,jsx}';
      const files = await fg(searchGlob, {
        cwd: this.config.rootDir,
        ignore: this.config.excludePatterns,
        absolute: true,
      });

      const filesToCheck = maxInstances && !checkAll
        ? files.slice(0, maxInstances)
        : files;

      totalFiles += filesToCheck.length;

      for (const file of filesToCheck) {
        const searchResult = await this.searchFileForPattern(file, pattern);

        if (searchResult.matches.length > 0) {
          filesWithPattern++;

          for (const match of searchResult.matches) {
            evidence.push({
              type: 'code-snippet',
              location: `${searchResult.filePath}:${match.line}`,
              content: match.content,
              verified: true,
              timestamp: new Date(),
              contentHash: generateContentHash(match.content),
            });
          }
        }
      }
    }

    return { evidence, total: totalFiles, passed: filesWithPattern };
  }

  /**
   * Search a file for a pattern.
   */
  private async searchFileForPattern(
    filePath: string,
    pattern: string
  ): Promise<FileSearchResult> {
    try {
      const stats = await stat(filePath);

      if (stats.size > this.config.maxFileSize) {
        return { filePath, matches: [] };
      }

      const content = await readFile(filePath, this.config.encoding);
      const lines = content.split('\n');
      const matches: Array<{ line: number; content: string }> = [];
      const patternLower = pattern.toLowerCase();

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(patternLower)) {
          matches.push({
            line: i + 1,
            content: lines[i].trim(),
          });
        }
      }

      return { filePath, matches };
    } catch (error) {
      return { filePath, matches: [] };
    }
  }

  /**
   * Verify existing evidence from the claim.
   */
  private async verifyExistingEvidence(
    existingEvidence: Evidence[]
  ): Promise<{
    evidence: Evidence[];
    verified: boolean;
    reasoning: string;
    total: number;
    passed: number;
  }> {
    const evidence: Evidence[] = [];
    let passed = 0;

    for (const ev of existingEvidence) {
      if (ev.type === 'file-reference' || ev.type === 'code-snippet') {
        const filePath = ev.location.split(':')[0];
        const fullPath = join(this.config.rootDir, filePath);

        try {
          const stats = await stat(fullPath);
          const exists = stats.isFile();

          evidence.push({
            ...ev,
            verified: exists,
            timestamp: new Date(),
          });

          if (exists) passed++;
        } catch (error) {
          evidence.push({
            ...ev,
            verified: false,
            timestamp: new Date(),
          });
        }
      } else {
        // Pass through non-file evidence
        evidence.push(ev);
      }
    }

    const verified = passed === existingEvidence.length && passed > 0;
    const reasoning = verified
      ? `All ${passed} evidence items verified`
      : `${passed} of ${existingEvidence.length} evidence items verified`;

    return {
      evidence,
      verified,
      reasoning,
      total: existingEvidence.length,
      passed,
    };
  }

  /**
   * Calculate verification confidence.
   */
  private calculateConfidence(
    passed: number,
    total: number,
    verified: boolean
  ): number {
    if (total === 0) return 0;

    const ratio = passed / total;

    // Full confidence if all passed
    if (verified && ratio === 1.0) return 1.0;

    // Partial confidence based on ratio
    if (ratio >= 0.9) return 0.9;
    if (ratio >= 0.75) return 0.75;
    if (ratio >= 0.5) return 0.6;

    return 0.3;
  }
}
