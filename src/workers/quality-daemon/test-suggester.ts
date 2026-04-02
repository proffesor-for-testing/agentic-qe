/**
 * IMP-10: QE Quality Daemon — Test Suggester
 *
 * Analyzes uncovered code from coverage delta and generates
 * test case suggestions. Stores suggestions in memory for
 * retrieval via MCP tools.
 */

import type { WorkerMemory } from '../interfaces';
import type { CoverageGap } from './coverage-delta';

export interface TestSuggestion {
  readonly id: string;
  readonly file: string;
  readonly uncoveredLines: number[];
  readonly suggestedTestType: 'unit' | 'integration' | 'e2e';
  readonly description: string;
  readonly priority: 'high' | 'medium' | 'low';
  readonly estimatedEffort: 'small' | 'medium' | 'large';
  readonly createdAt: number;
  readonly status: 'pending' | 'accepted' | 'dismissed';
}

export interface TestSuggesterOptions {
  /** Memory key prefix for storing suggestions */
  memoryPrefix?: string;
  /** Maximum suggestions to store */
  maxSuggestions?: number;
  /** Minimum risk score to generate a suggestion */
  minRiskScore?: number;
}

const DEFAULTS: Required<TestSuggesterOptions> = {
  memoryPrefix: 'quality-daemon:suggestions',
  maxSuggestions: 100,
  minRiskScore: 0.3,
};

export class TestSuggester {
  private options: Required<TestSuggesterOptions>;

  constructor(options?: TestSuggesterOptions) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Generate test suggestions from coverage gaps.
   */
  async suggest(
    gaps: CoverageGap[],
    changedFiles: string[],
    memory: WorkerMemory
  ): Promise<TestSuggestion[]> {
    const suggestions: TestSuggestion[] = [];

    // Filter gaps by minimum risk score
    const significantGaps = gaps.filter(
      (g) => g.riskScore >= this.options.minRiskScore
    );

    for (const gap of significantGaps) {
      const isChanged = changedFiles.includes(gap.file);
      const priority = this.determinePriority(gap, isChanged);
      const testType = this.determineTestType(gap.file);
      const effort = this.estimateEffort(gap);

      suggestions.push({
        id: `suggestion-${Date.now()}-${suggestions.length}`,
        file: gap.file,
        uncoveredLines: gap.uncoveredLines.slice(0, 50), // cap line list
        suggestedTestType: testType,
        description: this.generateDescription(gap, testType),
        priority,
        estimatedEffort: effort,
        createdAt: Date.now(),
        status: 'pending',
      });
    }

    // Sort by priority (high first)
    suggestions.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });

    // Cap to max
    const capped = suggestions.slice(0, this.options.maxSuggestions);

    // Store in memory
    await this.storeSuggestions(capped, memory);

    return capped;
  }

  /**
   * Retrieve pending suggestions from memory.
   */
  async getPending(memory: WorkerMemory): Promise<TestSuggestion[]> {
    const stored = await memory.get<TestSuggestion[]>(
      `${this.options.memoryPrefix}:list`
    );
    return (stored ?? []).filter((s) => s.status === 'pending');
  }

  /**
   * Update the status of a suggestion.
   */
  async updateStatus(
    id: string,
    status: 'accepted' | 'dismissed',
    memory: WorkerMemory
  ): Promise<boolean> {
    const stored = await memory.get<TestSuggestion[]>(
      `${this.options.memoryPrefix}:list`
    );
    if (!stored) return false;

    const idx = stored.findIndex((s) => s.id === id);
    if (idx === -1) return false;

    // Create updated list (immutable pattern)
    const updated = stored.map((s, i) =>
      i === idx ? { ...s, status } : s
    );
    await memory.set(`${this.options.memoryPrefix}:list`, updated);
    return true;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private determinePriority(
    gap: CoverageGap,
    isRecentlyChanged: boolean
  ): 'high' | 'medium' | 'low' {
    if (gap.riskScore > 0.8) return 'high';
    if (isRecentlyChanged || gap.riskScore > 0.5) return 'medium';
    return 'low';
  }

  private determineTestType(file: string): 'unit' | 'integration' | 'e2e' {
    if (file.includes('/api/') || file.includes('/routes/') || file.includes('/handlers/')) {
      return 'integration';
    }
    if (file.includes('/e2e/') || file.includes('/pages/') || file.includes('/views/')) {
      return 'e2e';
    }
    return 'unit';
  }

  private estimateEffort(gap: CoverageGap): 'small' | 'medium' | 'large' {
    if (gap.uncoveredLines.length <= 10) return 'small';
    if (gap.uncoveredLines.length <= 50) return 'medium';
    return 'large';
  }

  private generateDescription(
    gap: CoverageGap,
    testType: 'unit' | 'integration' | 'e2e'
  ): string {
    const lineCount = gap.uncoveredLines.length;
    const coverage = Math.round(gap.currentCoverage);
    return (
      `Add ${testType} tests for ${gap.file} ` +
      `(${lineCount} uncovered lines, ${coverage}% coverage, ` +
      `risk ${(gap.riskScore * 100).toFixed(0)}%)`
    );
  }

  private async storeSuggestions(
    suggestions: TestSuggestion[],
    memory: WorkerMemory
  ): Promise<void> {
    // Merge with existing suggestions (keep dismissed/accepted, replace pending)
    const existing = await memory.get<TestSuggestion[]>(
      `${this.options.memoryPrefix}:list`
    );

    const kept = (existing ?? []).filter((s) => s.status !== 'pending');
    const merged = [...kept, ...suggestions].slice(-this.options.maxSuggestions);

    await memory.set(`${this.options.memoryPrefix}:list`, merged);
    await memory.set(`${this.options.memoryPrefix}:count`, {
      pending: suggestions.length,
      total: merged.length,
      lastUpdated: Date.now(),
    });
  }
}
