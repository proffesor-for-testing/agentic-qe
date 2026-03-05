/**
 * Blind Review Orchestrator for Test Generation
 * Inspired by loki-mode blind review pattern
 *
 * Runs N independent test generation passes in parallel with varied
 * temperatures, then deduplicates using Jaccard similarity on tokenized
 * assertions to maximize test diversity.
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type { ITestGenerationService } from '../services/test-generator.js';
import type {
  IGenerateTestsRequest,
  IGeneratedTest,
} from '../interfaces.js';

// ============================================================================
// Configuration
// ============================================================================

export interface BlindReviewConfig {
  /** Number of independent reviewers to run in parallel */
  reviewerCount: number;
  /** Jaccard similarity threshold for deduplication (0-1) */
  deduplicationThreshold: number;
  /** Timeout per reviewer in milliseconds */
  timeoutMs: number;
  /** Whether to vary temperatures across reviewers */
  varyTemperatures: boolean;
  /** Temperature values for each reviewer */
  temperatures: number[];
}

const DEFAULT_CONFIG: BlindReviewConfig = {
  reviewerCount: 3,
  deduplicationThreshold: 0.8,
  timeoutMs: 30000,
  varyTemperatures: true,
  temperatures: [0.2, 0.5, 0.8],
};

// ============================================================================
// Result Types
// ============================================================================

export interface ReviewerOutput {
  reviewerId: string;
  tests: IGeneratedTest[];
  durationMs: number;
}

export interface BlindReviewStats {
  totalGenerated: number;
  afterDedup: number;
  uniquenessScore: number;
}

export interface BlindReviewResult {
  mergedTests: IGeneratedTest[];
  reviewerOutputs: ReviewerOutput[];
  stats: BlindReviewStats;
}

// ============================================================================
// Tokenization & Jaccard Similarity
// ============================================================================

/**
 * Tokenize code into a set of meaningful tokens.
 * Strips whitespace, splits on non-alphanumeric boundaries,
 * and filters tokens shorter than 3 characters.
 */
export function tokenize(code: string): Set<string> {
  return new Set(
    code
      .replace(/\s+/g, ' ')
      .split(/[^a-zA-Z0-9_]+/)
      .filter((t) => t.length > 2)
  );
}

/**
 * Compute Jaccard similarity between two token sets.
 * Returns 0 if both sets are empty.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersectionSize = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;

  for (const token of smaller) {
    if (larger.has(token)) {
      intersectionSize++;
    }
  }

  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Deduplicate tests using Jaccard similarity on tokenized test code.
 * Groups tests by target file, then within each group keeps the
 * test with the most assertions from each similarity cluster.
 */
export function deduplicateTests(
  tests: IGeneratedTest[],
  threshold: number
): IGeneratedTest[] {
  if (tests.length === 0) return [];

  // Group by source file
  const bySource = new Map<string, IGeneratedTest[]>();
  for (const test of tests) {
    const key = test.sourceFile || '__ungrouped__';
    const group = bySource.get(key) || [];
    group.push(test);
    bySource.set(key, group);
  }

  const deduplicated: IGeneratedTest[] = [];

  for (const group of bySource.values()) {
    const tokenSets = group.map((t) => tokenize(t.testCode));
    const used = new Set<number>();

    for (let i = 0; i < group.length; i++) {
      if (used.has(i)) continue;

      // Start a cluster with this test
      const cluster: number[] = [i];
      used.add(i);

      for (let j = i + 1; j < group.length; j++) {
        if (used.has(j)) continue;

        const similarity = jaccardSimilarity(tokenSets[i], tokenSets[j]);
        if (similarity >= threshold) {
          cluster.push(j);
          used.add(j);
        }
      }

      // Keep the test with the most assertions from the cluster
      let best = cluster[0];
      for (const idx of cluster) {
        if (group[idx].assertions > group[best].assertions) {
          best = idx;
        }
      }
      deduplicated.push(group[best]);
    }
  }

  return deduplicated;
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Wraps a promise with a timeout. Rejects if the promise does not
 * settle within the given number of milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Reviewer timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      }
    );
  });
}

export class BlindReviewOrchestrator {
  constructor(private readonly service: ITestGenerationService) {}

  /**
   * Run blind review: N independent generation passes in parallel,
   * then deduplicate and merge results.
   */
  async generateWithBlindReview(
    request: IGenerateTestsRequest,
    config?: Partial<BlindReviewConfig>
  ): Promise<Result<BlindReviewResult, Error>> {
    const cfg: BlindReviewConfig = { ...DEFAULT_CONFIG, ...config };

    if (cfg.reviewerCount < 1) {
      return err(new Error('reviewerCount must be at least 1'));
    }

    // Launch N parallel reviewers with varied temperatures
    const reviewerPromises = Array.from(
      { length: cfg.reviewerCount },
      (_, i) => {
        const reviewerId = `reviewer-${i}`;
        const start = Date.now();

        // Vary the request per reviewer: each gets a different temperature
        // to encourage diverse test generation outputs
        const reviewerRequest = { ...request };
        if (cfg.varyTemperatures && cfg.temperatures.length > 0) {
          const temperature = cfg.temperatures[i % cfg.temperatures.length];
          // Attach temperature hint as pattern metadata that the generator can use
          reviewerRequest.patterns = [
            ...(request.patterns ?? []),
            `__blind_review_temperature:${temperature}`,
          ];
        }

        const genPromise = this.service
          .generateTests(reviewerRequest)
          .then((result): ReviewerOutput => {
            const durationMs = Date.now() - start;
            if (result.success) {
              return {
                reviewerId,
                tests: result.value.tests,
                durationMs,
              };
            }
            return { reviewerId, tests: [], durationMs };
          });

        return withTimeout(genPromise, cfg.timeoutMs).catch(
          (): ReviewerOutput => ({
            reviewerId,
            tests: [],
            durationMs: Date.now() - start,
          })
        );
      }
    );

    const reviewerOutputs = await Promise.allSettled(reviewerPromises);

    // Collect fulfilled results
    const outputs: ReviewerOutput[] = reviewerOutputs
      .filter(
        (r): r is PromiseFulfilledResult<ReviewerOutput> =>
          r.status === 'fulfilled'
      )
      .map((r) => r.value);

    // Gather all tests
    const allTests = outputs.flatMap((o) => o.tests);

    if (allTests.length === 0) {
      return err(new Error('All reviewers failed to generate tests'));
    }

    // Deduplicate
    const mergedTests = deduplicateTests(allTests, cfg.deduplicationThreshold);

    const totalGenerated = allTests.length;
    const afterDedup = mergedTests.length;
    const uniquenessScore =
      totalGenerated === 0 ? 0 : afterDedup / totalGenerated;

    return ok({
      mergedTests,
      reviewerOutputs: outputs,
      stats: {
        totalGenerated,
        afterDedup,
        uniquenessScore,
      },
    });
  }
}
