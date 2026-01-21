/**
 * QE-Specific Extension: Test Case Embeddings
 *
 * Per ADR-040, extends base EmbeddingGenerator with QE-specific logic.
 * Specialized for:
 * - Test case similarity detection
 * - Test deduplication
 * - Test pattern recognition
 *
 * Performance target: <15ms per test embedding
 *
 * @module integrations/embeddings/extensions/TestEmbedding
 */

import {
  EmbeddingGenerator,
  type IEmbedding,
  type IEmbeddingOptions,
  type ISearchOptions,
} from '../base/EmbeddingGenerator.js';
import type { IEmbeddingModelConfig } from '../base/types.js';
import { cosineSimilarity } from '../../../shared/utils/vector-math.js';

/**
 * Type guard to check if an embedding is a test case embedding
 */
function isTestCaseEmbedding(embedding: IEmbedding): embedding is ITestCaseEmbedding {
  return (
    embedding.namespace === 'test' &&
    embedding.metadata !== undefined &&
    typeof embedding.metadata === 'object' &&
    'testFile' in embedding.metadata &&
    'testName' in embedding.metadata &&
    'testType' in embedding.metadata
  );
}

/**
 * Test case metadata
 */
export interface TestCaseMetadata extends Record<string, unknown> {
  /** Test file path */
  testFile: string;
  /** Test name */
  testName: string;
  /** Test type (unit, integration, e2e) */
  testType: 'unit' | 'integration' | 'e2e';
  /** Domain/bounded context */
  domain?: string;
  /** Coverage */
  coverage?: number;
  /** Flaky status */
  flaky?: boolean;
  /** Tags */
  tags?: string[];
}

/**
 * Test case embedding with metadata
 */
export interface ITestCaseEmbedding extends IEmbedding {
  /** Test-specific metadata */
  metadata: TestCaseMetadata;
}

/**
 * Similar test detection result
 */
export interface ISimilarTestResult {
  /** Target test */
  testFile: string;
  testName: string;
  /** Similarity score */
  score: number;
  /** Type of similarity */
  similarityType: 'exact' | 'semantic' | 'partial';
  /** Overlapping assertions */
  overlappingAssertions?: string[];
}

/**
 * Test embedding options
 */
export interface ITestEmbeddingOptions extends IEmbeddingOptions {
  /** Include assertions in embedding */
  includeAssertions?: boolean;
  /** Include setup/teardown */
  includeSetupTeardown?: boolean;
  /** Weight assertions higher */
  weightAssertions?: boolean;
}

/**
 * Test case embedding generator
 *
 * Extends base EmbeddingGenerator with QE-specific logic for test cases.
 */
export class TestEmbeddingGenerator extends EmbeddingGenerator {
  constructor(config: Partial<IEmbeddingModelConfig> = {}) {
    super({
      ...config,
    });
  }

  /**
   * Generate embedding for a test case
   */
  async embedTestCase(
    testCode: string,
    metadata: TestCaseMetadata,
    options: ITestEmbeddingOptions = {}
  ): Promise<ITestCaseEmbedding> {
    // Prepare text for embedding
    const text = this.prepareTestText(testCode, metadata, options);

    // Generate base embedding
    const embedding = await this.embed(text, {
      namespace: 'test',
      ...options,
    });

    // Add test-specific metadata
    return {
      ...embedding,
      metadata,
    };
  }

  /**
   * Generate embeddings for multiple test cases
   */
  async embedTestBatch(
    testCases: Array<{ code: string; metadata: TestCaseMetadata }>,
    options: ITestEmbeddingOptions = {}
  ): Promise<ITestCaseEmbedding[]> {
    const results: ITestCaseEmbedding[] = [];

    for (const testCase of testCases) {
      const embedding = await this.embedTestCase(testCase.code, testCase.metadata, options);
      results.push(embedding);
    }

    return results;
  }

  /**
   * Find similar tests
   */
  async findSimilarTests(
    queryTest: string | ITestCaseEmbedding,
    options: ISearchOptions & {
      testType?: 'unit' | 'integration' | 'e2e';
      domain?: string;
    } = {}
  ): Promise<ISimilarTestResult[]> {
    // Generate query embedding if needed
    const queryEmbedding =
      typeof queryTest === 'string'
        ? await this.embed(queryTest, { namespace: 'test' })
        : queryTest;

    // Get all test embeddings and filter using type guard
    const allTests = this.cache.getAll('test').filter(isTestCaseEmbedding);

    // Filter by test type/domain if specified
    let filteredTests = allTests;
    if (options.testType) {
      filteredTests = filteredTests.filter(
        (t) => t.metadata.testType === options.testType
      );
    }
    if (options.domain) {
      filteredTests = filteredTests.filter(
        (t) => t.metadata.domain === options.domain
      );
    }

    // Calculate similarities
    const similarities: ISimilarTestResult[] = filteredTests
      .map((test) => {
        const score = cosineSimilarity(
          queryEmbedding.vector as number[],
          test.vector as number[]
        );

        let similarityType: 'exact' | 'semantic' | 'partial' = 'semantic';
        if (score > 0.95) similarityType = 'exact';
        else if (score < 0.7) similarityType = 'partial';

        return {
          testFile: test.metadata.testFile,
          testName: test.metadata.testName,
          score,
          similarityType,
        };
      })
      .filter((result) => result.score >= (options.threshold || 0.7))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 10);

    return similarities;
  }

  /**
   * Detect duplicate tests
   */
  async detectDuplicates(
    threshold: number = 0.95
  ): Promise<Array<{ test: string; duplicate: string; score: number }>> {
    const allTests = this.cache.getAll('test').filter(isTestCaseEmbedding);
    const duplicates: Array<{ test: string; duplicate: string; score: number }> = [];

    for (let i = 0; i < allTests.length; i++) {
      for (let j = i + 1; j < allTests.length; j++) {
        const score = cosineSimilarity(
          allTests[i].vector as number[],
          allTests[j].vector as number[]
        );

        if (score >= threshold) {
          duplicates.push({
            test: `${allTests[i].metadata.testFile}::${allTests[i].metadata.testName}`,
            duplicate: `${allTests[j].metadata.testFile}::${allTests[j].metadata.testName}`,
            score,
          });
        }
      }
    }

    return duplicates;
  }

  /**
   * Get test coverage recommendations
   */
  async getCoverageRecommendations(
    coverageThreshold: number = 80
  ): Promise<Array<{ domain: string; recommendedTests: string[] }>> {
    const allTests = this.cache.getAll('test').filter(isTestCaseEmbedding);

    // Group by domain
    const byDomain = new Map<string, ITestCaseEmbedding[]>();
    for (const test of allTests) {
      const domain = test.metadata.domain || 'unknown';
      if (!byDomain.has(domain)) {
        byDomain.set(domain, []);
      }
      byDomain.get(domain)!.push(test);
    }

    const recommendations: Array<{ domain: string; recommendedTests: string[] }> = [];

    // Check coverage per domain
    for (const [domain, tests] of byDomain.entries()) {
      const avgCoverage =
        tests.reduce((sum, t) => sum + (t.metadata.coverage || 0), 0) / tests.length;

      if (avgCoverage < coverageThreshold) {
        // Find under-tested areas by analyzing test similarities
        const testNames = tests
          .filter((t) => (t.metadata.coverage || 0) < coverageThreshold)
          .map((t) => `${t.metadata.testFile}::${t.metadata.testName}`);

        recommendations.push({
          domain,
          recommendedTests: testNames,
        });
      }
    }

    return recommendations;
  }

  /**
   * Prepare test text for embedding
   */
  private prepareTestText(
    testCode: string,
    metadata: TestCaseMetadata,
    options: ITestEmbeddingOptions
  ): string {
    let text = '';

    // Add test name and type
    text += `Test: ${metadata.testName}\n`;
    text += `Type: ${metadata.testType}\n`;

    if (metadata.domain) {
      text += `Domain: ${metadata.domain}\n`;
    }

    if (metadata.tags && metadata.tags.length > 0) {
      text += `Tags: ${metadata.tags.join(', ')}\n`;
    }

    // Add assertions (high priority)
    if (options.includeAssertions !== false) {
      const assertions = this.extractAssertions(testCode);
      if (assertions.length > 0) {
        text += '\nAssertions:\n';
        for (const assertion of assertions) {
          text += `  ${assertion}\n`;
        }
      }
    }

    // Add test code
    text += '\nCode:\n';
    text += testCode;

    // Add setup/teardown if requested
    if (options.includeSetupTeardown) {
      const setup = this.extractSetupTeardown(testCode, 'beforeEach');
      const teardown = this.extractSetupTeardown(testCode, 'afterEach');
      if (setup) text += `\nSetup: ${setup}`;
      if (teardown) text += `\nTeardown: ${teardown}`;
    }

    return text;
  }

  /**
   * Extract assertions from test code
   */
  private extractAssertions(testCode: string): string[] {
    const assertions: string[] = [];

    // Common assertion patterns
    const patterns = [
      /expect\((.*?)\)\.(.*?)\((.*?)\)/g,
      /assert\((.*?)\)/g,
      /to(Equal|Be|Contain|Match)\((.*?)\)/g,
      /\.should\.(.*?)\((.*?)\)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(testCode)) !== null) {
        assertions.push(match[0]);
      }
    }

    return assertions;
  }

  /**
   * Extract setup/teardown code
   */
  private extractSetupTeardown(testCode: string, hookName: string): string | null {
    const pattern = new RegExp(`${hookName}\\(\\s*async\\s*\\(\\)\\s*=>\\s*{([^}]+)}`, 's');
    const match = pattern.exec(testCode);
    return match ? match[1].trim() : null;
  }
}
