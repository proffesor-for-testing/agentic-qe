/**
 * Batch Test Generation Example
 *
 * Demonstrates using the BatchOperationManager to generate tests
 * for multiple files in parallel with automatic retry and timeout handling.
 *
 * Performance Improvement:
 * - Sequential: 3 files × 2s = 6s
 * - Batched: max(2s) with 5 concurrent = ~2s
 * - Speedup: 3x faster
 *
 * @module agents/examples/batchGenerate
 */

import { BatchOperationManager, type BatchResult } from '../../utils/batch-operations';
import type { TestGenerationRequest, TestGenerationResult } from '../TestGeneratorAgent';

/**
 * Configuration for batch test generation
 */
export interface BatchGenerateConfig {
  /**
   * Test framework to use
   */
  framework: 'jest' | 'vitest' | 'mocha';

  /**
   * Target coverage percentage
   */
  targetCoverage?: number;

  /**
   * Maximum concurrent file processing
   * @default 5
   */
  maxConcurrent?: number;

  /**
   * Timeout per file in milliseconds
   * @default 60000 (60 seconds)
   */
  timeout?: number;

  /**
   * Enable retry on failure
   * @default true
   */
  retryOnError?: boolean;

  /**
   * Progress callback
   */
  onProgress?: (completed: number, total: number, file: string) => void;
}

/**
 * Single file test generation input
 */
export interface FileGenerationInput {
  /**
   * Path to source file
   */
  filePath: string;

  /**
   * File content (optional, will read if not provided)
   */
  content?: string;

  /**
   * Custom configuration for this file
   */
  config?: Partial<TestGenerationRequest>;
}

/**
 * Result for a single file
 */
export interface FileGenerationResult {
  /**
   * Source file path
   */
  filePath: string;

  /**
   * Generated test file path
   */
  testFilePath: string;

  /**
   * Test generation result
   */
  result: TestGenerationResult;

  /**
   * Generation time in milliseconds
   */
  generationTime: number;
}

/**
 * Batch test generation for multiple files
 *
 * @example
 * ```typescript
 * const files = [
 *   { filePath: 'src/utils/parser.ts' },
 *   { filePath: 'src/utils/validator.ts' },
 *   { filePath: 'src/utils/formatter.ts' }
 * ];
 *
 * const result = await generateTestsForFiles(files, {
 *   framework: 'jest',
 *   targetCoverage: 80,
 *   maxConcurrent: 5,
 *   onProgress: (completed, total, file) => {
 *     console.log(`Progress: ${completed}/${total} - ${file}`);
 *   }
 * });
 *
 * console.log(`Generated ${result.results.length} test files`);
 * console.log(`Success rate: ${result.successRate * 100}%`);
 * console.log(`Total time: ${result.totalTime}ms`);
 * ```
 */
export async function generateTestsForFiles(
  files: FileGenerationInput[],
  config: BatchGenerateConfig
): Promise<BatchResult<FileGenerationResult>> {
  const batchManager = new BatchOperationManager();

  const {
    framework,
    targetCoverage = 80,
    maxConcurrent = 5,
    timeout = 60000,
    retryOnError = true,
    onProgress,
  } = config;

  // Handler function for single file generation
  const generateForFile = async (
    input: FileGenerationInput
  ): Promise<FileGenerationResult> => {
    const startTime = Date.now();

    // This would call your actual test generation service
    // For now, this is a placeholder that shows the integration pattern
    const result = await generateUnitTestsForFile({
      filePath: input.filePath,
      content: input.content,
      framework,
      targetCoverage,
      ...input.config,
    });

    const generationTime = Date.now() - startTime;

    return {
      filePath: input.filePath,
      testFilePath: getTestFilePath(input.filePath, framework),
      result,
      generationTime,
    };
  };

  // Execute batch generation
  return batchManager.batchExecute(files, generateForFile, {
    maxConcurrent,
    timeout,
    retryOnError,
    maxRetries: 3,
    failFast: false,
    onProgress: (completed, total) => {
      const currentFile = files[completed - 1]?.filePath || 'unknown';
      onProgress?.(completed, total, currentFile);
    },
  });
}

/**
 * Placeholder for actual test generation implementation
 * Replace this with your actual TestGeneratorAgent call
 */
async function generateUnitTestsForFile(params: {
  filePath: string;
  content?: string;
  framework: string;
  targetCoverage: number;
}): Promise<TestGenerationResult> {
  // This would integrate with your TestGeneratorAgent
  // For demonstration purposes only
  throw new Error('Not implemented - integrate with TestGeneratorAgent');
}

/**
 * Get test file path based on source file path
 */
function getTestFilePath(sourcePath: string, framework: string): string {
  const extension = framework === 'jest' || framework === 'vitest' ? '.test.ts' : '.spec.ts';
  return sourcePath.replace(/\.(ts|js)$/, extension);
}

/**
 * Batch generate tests for an entire directory
 *
 * @example
 * ```typescript
 * const result = await generateTestsForDirectory('src/utils', {
 *   framework: 'jest',
 *   pattern: '**\/*.ts',
 *   exclude: ['**\/*.test.ts', '**\/*.spec.ts'],
 *   maxConcurrent: 5
 * });
 * ```
 */
export async function generateTestsForDirectory(
  directory: string,
  config: BatchGenerateConfig & {
    pattern?: string;
    exclude?: string[];
  }
): Promise<BatchResult<FileGenerationResult>> {
  const { pattern = '**/*.ts', exclude = ['**/*.test.ts', '**/*.spec.ts'] } = config;

  // Find all matching files (would use glob or similar)
  const files = await findSourceFiles(directory, pattern, exclude);

  return generateTestsForFiles(files, config);
}

/**
 * Placeholder for file discovery
 * Replace with actual glob implementation
 */
async function findSourceFiles(
  directory: string,
  pattern: string,
  exclude: string[]
): Promise<FileGenerationInput[]> {
  // This would use glob or a similar file discovery mechanism
  throw new Error('Not implemented - integrate with file system utilities');
}

/**
 * Batch generate tests with intelligent prioritization
 *
 * Prioritizes files by:
 * 1. Code complexity (higher first)
 * 2. Current test coverage (lower first)
 * 3. Change frequency (higher first)
 *
 * @example
 * ```typescript
 * const result = await generateTestsWithPriority(
 *   [
 *     { filePath: 'src/complex.ts', complexity: 15, coverage: 20 },
 *     { filePath: 'src/simple.ts', complexity: 3, coverage: 80 },
 *   ],
 *   { framework: 'jest' }
 * );
 * ```
 */
export async function generateTestsWithPriority(
  files: Array<
    FileGenerationInput & {
      complexity?: number;
      coverage?: number;
      changeFrequency?: number;
    }
  >,
  config: BatchGenerateConfig
): Promise<BatchResult<FileGenerationResult>> {
  // Sort by priority score
  const prioritized = [...files].sort((a, b) => {
    const scoreA = calculatePriorityScore(a);
    const scoreB = calculatePriorityScore(b);
    return scoreB - scoreA; // Higher score first
  });

  return generateTestsForFiles(prioritized, config);
}

/**
 * Calculate priority score for a file
 * Higher score = higher priority
 */
function calculatePriorityScore(
  file: {
    complexity?: number;
    coverage?: number;
    changeFrequency?: number;
  }
): number {
  const complexity = file.complexity || 5;
  const coverage = file.coverage || 50;
  const changeFrequency = file.changeFrequency || 1;

  // Normalize to 0-100 scale and weight
  const complexityScore = Math.min(complexity * 5, 100) * 0.4;
  const coverageScore = (100 - coverage) * 0.4; // Invert: lower coverage = higher priority
  const changeScore = Math.min(changeFrequency * 10, 100) * 0.2;

  return complexityScore + coverageScore + changeScore;
}
