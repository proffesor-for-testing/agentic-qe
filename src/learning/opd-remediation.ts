/**
 * OPD (Observe-Plan-Decide) Remediation Hints
 *
 * When patterns have negative rewards (failures, flakiness), generate
 * actionable hints: "bad because X, fix by Y"
 *
 * Categories:
 *  - flaky: intermittent failures (20-80% fail rate, 3+ executions)
 *  - false-positive: consistently broken (80%+ fail rate)
 *  - outdated: was working, now fails (recent regression)
 *  - wrong-scope: vague description + high failure rate
 *  - missing-context: recurring keywords in failure feedback
 */

// ============================================================================
// Types
// ============================================================================

export interface RemediationHint {
  patternId: string;
  observation: string;
  diagnosis: string;
  suggestion: string;
  confidence: number;
  category: RemediationCategory;
}

export type RemediationCategory =
  | 'flaky'
  | 'false-positive'
  | 'outdated'
  | 'wrong-scope'
  | 'missing-context';

export interface RemediationConfig {
  /** Minimum negative reward to trigger remediation (default: -0.3) */
  minNegativeReward?: number;
  /** Maximum hints to generate per pattern (default: 3) */
  maxHintsPerPattern?: number;
}

export interface PatternInput {
  id: string;
  name: string;
  description: string;
  successRate: number;
  usageCount: number;
  confidence: number;
  tags?: string[];
}

export interface ExecutionRecord {
  success: boolean;
  feedback?: string;
  durationMs?: number;
}

// ============================================================================
// Hint Generation
// ============================================================================

/**
 * Generate remediation hints for a failed pattern based on its execution history.
 *
 * Analyzes execution records to classify the failure mode and produce
 * actionable suggestions for fixing the pattern.
 */
export function generateRemediationHints(
  pattern: PatternInput,
  executionHistory: ExecutionRecord[],
  config?: RemediationConfig,
): RemediationHint[] {
  const hints: RemediationHint[] = [];
  const maxHints = config?.maxHintsPerPattern ?? 3;

  const totalCount = executionHistory.length;
  if (totalCount === 0) return hints;

  const failCount = executionHistory.filter((e) => !e.success).length;
  const failRate = failCount / totalCount;

  // Category 1: Flaky (intermittent failures — 20-80% fail rate, 3+ runs)
  if (failRate > 0.2 && failRate < 0.8 && totalCount >= 3) {
    hints.push({
      patternId: pattern.id,
      observation: `Pattern "${pattern.name}" fails ${(failRate * 100).toFixed(0)}% of the time (${failCount}/${totalCount} executions)`,
      diagnosis:
        'Intermittent failures suggest timing dependencies, external service flakiness, or non-deterministic behavior',
      suggestion:
        'Add retry logic, mock external dependencies, or add explicit waits for async operations',
      confidence: Math.min(0.9, 0.5 + totalCount * 0.05),
      category: 'flaky',
    });
  }

  // Category 2: False positive (always/almost always fails)
  if (failRate >= 0.8 && totalCount >= 2) {
    hints.push({
      patternId: pattern.id,
      observation: `Pattern "${pattern.name}" fails ${(failRate * 100).toFixed(0)}% of executions — effectively broken`,
      diagnosis:
        'Consistent failures indicate the pattern logic is incorrect or the target code changed',
      suggestion:
        'Review the pattern against current code. Consider quarantining and creating a replacement pattern.',
      confidence: 0.85,
      category: 'false-positive',
    });
  }

  // Category 3: Outdated (was working, now failing — regression)
  if (totalCount >= 5) {
    const recentFails = executionHistory.slice(-3).filter((e) => !e.success).length;
    const earlySuccesses = executionHistory
      .slice(0, Math.max(1, totalCount - 3))
      .filter((e) => e.success).length;
    if (recentFails >= 2 && earlySuccesses >= 2) {
      hints.push({
        patternId: pattern.id,
        observation: `Pattern "${pattern.name}" worked previously but now fails consistently`,
        diagnosis: 'Recent code changes likely broke compatibility with this pattern',
        suggestion:
          'Update pattern to match current code structure. Check git log for recent changes to affected files.',
        confidence: 0.8,
        category: 'outdated',
      });
    }
  }

  // Category 4: Wrong scope (too broad — vague description + high failure)
  if (pattern.description && pattern.description.length < 20 && failRate > 0.3) {
    hints.push({
      patternId: pattern.id,
      observation: `Pattern "${pattern.name}" has a vague description and high failure rate`,
      diagnosis:
        'Pattern may be too broadly scoped — matching contexts where it does not apply',
      suggestion:
        'Narrow the pattern scope by adding specific tags, domain constraints, or more detailed matching criteria',
      confidence: 0.6,
      category: 'wrong-scope',
    });
  }

  // Category 5: Missing context (recurring keywords in failure feedback)
  const feedbackMessages = executionHistory
    .filter((e) => !e.success && e.feedback)
    .map((e) => e.feedback!)
    .slice(-3);

  if (feedbackMessages.length > 0) {
    const commonWords = findCommonKeywords(feedbackMessages);
    if (commonWords.length > 0) {
      hints.push({
        patternId: pattern.id,
        observation: `Failure feedback contains recurring themes: ${commonWords.join(', ')}`,
        diagnosis: `Common failure keywords suggest a systematic issue: ${commonWords.slice(0, 3).join(', ')}`,
        suggestion: `Address the recurring "${commonWords[0]}" issue in the pattern logic or preconditions`,
        confidence: 0.65,
        category: 'missing-context',
      });
    }
  }

  return hints.slice(0, maxHints);
}

// ============================================================================
// Keyword Extraction (Internal)
// ============================================================================

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'in', 'to', 'for', 'of',
  'and', 'or', 'not', 'with', 'test', 'error',
]);

/**
 * Find common keywords across failure feedback messages.
 * Returns words that appear in at least 2 distinct messages, sorted by frequency.
 */
export function findCommonKeywords(feedbacks: string[]): string[] {
  const wordCounts = new Map<string, number>();

  for (const feedback of feedbacks) {
    const words = feedback
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    const uniqueWords = new Set(words);
    for (const word of uniqueWords) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }

  return Array.from(wordCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 5);
}
