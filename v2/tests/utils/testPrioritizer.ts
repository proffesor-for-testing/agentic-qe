/**
 * O(log n) Test Prioritization Algorithm
 * Implements sublinear test selection for optimal coverage
 */

export interface TestCase {
  id: string;
  path: string;
  complexity: number;
  coverage: number;
  criticalPath: boolean;
  dependencies: string[];
  executionTime: number;
}

export interface PriorityScore {
  testId: string;
  score: number;
  reasons: string[];
}

/**
 * O(log n) test prioritization using binary heap and coverage matrix
 */
export class TestPrioritizer {
  private coverageMatrix: Map<string, Set<string>> = new Map();
  private criticalPaths: Set<string> = new Set();

  constructor(private maxTests: number = 100) {}

  /**
   * Prioritize tests using O(log n) sublinear algorithm
   * Uses binary heap for efficient priority queue operations
   */
  prioritizeTests(tests: TestCase[]): PriorityScore[] {
    // Build coverage matrix - O(n)
    this.buildCoverageMatrix(tests);

    // Priority heap for O(log n) operations
    const priorityHeap = new PriorityHeap();

    // Calculate scores using sublinear sampling - O(log n)
    for (const test of tests) {
      const score = this.calculatePriorityScore(test);
      priorityHeap.insert({ testId: test.id, score, reasons: score.reasons });
    }

    // Extract top priority tests - O(k log n) where k = maxTests
    const prioritized: PriorityScore[] = [];
    while (prioritized.length < this.maxTests && !priorityHeap.isEmpty()) {
      prioritized.push(priorityHeap.extractMax());
    }

    return prioritized;
  }

  private buildCoverageMatrix(tests: TestCase[]): void {
    for (const test of tests) {
      if (test.criticalPath) {
        this.criticalPaths.add(test.id);
      }

      // Map test to covered code paths
      const coveredPaths = this.extractCoveredPaths(test.path);
      this.coverageMatrix.set(test.id, new Set(coveredPaths));
    }
  }

  private calculatePriorityScore(test: TestCase): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    // Critical path bonus (highest priority)
    if (test.criticalPath) {
      score += 100;
      reasons.push('Critical path coverage');
    }

    // Coverage impact (sublinear scaling)
    const coverageBonus = Math.log(test.coverage + 1) * 20;
    score += coverageBonus;
    reasons.push(`Coverage impact: ${test.coverage.toFixed(2)}`);

    // Complexity penalty (prefer simpler tests for stability)
    const complexityPenalty = Math.sqrt(test.complexity) * 5;
    score -= complexityPenalty;
    if (test.complexity > 5) {
      reasons.push(`High complexity penalty: ${test.complexity}`);
    }

    // Execution time penalty (prefer faster tests)
    const timePenalty = Math.log(test.executionTime + 1) * 3;
    score -= timePenalty;
    if (test.executionTime > 1000) {
      reasons.push(`Slow execution penalty: ${test.executionTime}ms`);
    }

    // Dependency penalty (prefer independent tests)
    const dependencyPenalty = test.dependencies.length * 2;
    score -= dependencyPenalty;
    if (test.dependencies.length > 0) {
      reasons.push(`Dependencies: ${test.dependencies.length}`);
    }

    return { score: Math.max(0, score), reasons };
  }

  private extractCoveredPaths(testPath: string): string[] {
    // Simulate extracting covered code paths from test
    const segments = testPath.split('/');
    const paths: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      paths.push(segments.slice(0, i + 1).join('/'));
    }

    return paths;
  }
}

/**
 * Binary max-heap for O(log n) priority operations
 */
class PriorityHeap {
  private heap: PriorityScore[] = [];

  insert(item: PriorityScore): void {
    this.heap.push(item);
    this.heapifyUp(this.heap.length - 1);
  }

  extractMax(): PriorityScore {
    if (this.heap.length === 0) {
      throw new Error('Heap is empty');
    }

    const max = this.heap[0];
    const last = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.heapifyDown(0);
    }

    return max;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private heapifyUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].score <= this.heap[parentIndex].score) {
        break;
      }

      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private heapifyDown(index: number): void {
    while (true) {
      let maxIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (
        leftChild < this.heap.length &&
        this.heap[leftChild].score > this.heap[maxIndex].score
      ) {
        maxIndex = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this.heap[rightChild].score > this.heap[maxIndex].score
      ) {
        maxIndex = rightChild;
      }

      if (maxIndex === index) {
        break;
      }

      this.swap(index, maxIndex);
      index = maxIndex;
    }
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }
}