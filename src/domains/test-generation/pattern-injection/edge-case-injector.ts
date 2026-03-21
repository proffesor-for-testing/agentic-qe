/**
 * Edge Case Injector - Pre-task Pattern Injection
 * Inspired by loki-mode compound learning loop
 *
 * Queries historical edge-case patterns from the MemoryBackend that
 * caught real bugs in similar code, formats them as prompt context,
 * and injects them before test generation LLM calls.
 *
 * This creates a continuously improving test generation system where
 * patterns discovered in past testing inform future test generation.
 */

import { LoggerFactory } from '../../../logging/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import { generateRemediationHints } from '../../../learning/opd-remediation.js';
import type { RemediationHint } from '../../../learning/opd-remediation.js';

// ============================================================================
// Types
// ============================================================================

export interface EdgeCaseInjectionConfig {
  /** Number of patterns to inject (default: 3) */
  topN: number;
  /** Minimum pattern confidence to include (default: 0.5) */
  minConfidence: number;
  /** Namespace for pattern search (default: 'aqe/v3/domains/test-generation') */
  namespace: string;
}

export const DEFAULT_INJECTION_CONFIG: EdgeCaseInjectionConfig = {
  topN: 3,
  minConfidence: 0.5,
  namespace: 'aqe/v3/domains/test-generation',
};

export interface InjectionContext {
  /** Formatted prompt context string to prepend to LLM prompt */
  promptContext: string;
  /** Number of patterns injected */
  patternsUsed: number;
  /** Total patterns considered before filtering */
  totalConsidered: number;
}

/**
 * Internal representation of a retrieved pattern for ranking and formatting
 */
interface RetrievedPattern {
  key: string;
  name: string;
  description: string;
  confidence: number;
  successRate: number;
  usageCount: number;
  tags: string[];
}

// ============================================================================
// Keyword Extraction
// ============================================================================

/**
 * Extract searchable keywords from source code.
 * Pulls function names, class names, import identifiers, and
 * common code patterns for pattern matching.
 */
const logger = LoggerFactory.create('test-generation/edge-case-injector');

export function extractKeywords(sourceCode: string): string[] {
  const keywords = new Set<string>();

  // Common tokens to exclude
  const noise = new Set([
    'const', 'let', 'var', 'function', 'class', 'import', 'export',
    'return', 'this', 'new', 'async', 'await', 'from', 'type',
    'interface', 'string', 'number', 'boolean', 'void', 'null',
    'undefined', 'true', 'false', 'map', 'filter', 'reduce',
    'forEach', 'push', 'pop', 'length', 'toString', 'valueOf',
    'constructor',
  ]);

  // Function declarations: function foo(
  const funcDecl = sourceCode.matchAll(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
  for (const m of funcDecl) keywords.add(m[1]);

  // Arrow/const functions: const foo =
  const constFn = sourceCode.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g);
  for (const m of constFn) keywords.add(m[1]);

  // Class declarations: class Foo
  const classDef = sourceCode.matchAll(/class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
  for (const m of classDef) keywords.add(m[1]);

  // Import names: import { X, Y } from or import X from
  const importNames = sourceCode.matchAll(/import\s+(?:\{([^}]+)\}|([a-zA-Z_$][a-zA-Z0-9_$]*))\s+from/g);
  for (const m of importNames) {
    const namedImports = m[1];
    const defaultImport = m[2];
    if (namedImports) {
      for (const name of namedImports.split(',')) {
        const clean = name.trim().split(/\s+as\s+/).pop()?.trim();
        if (clean && /^[a-zA-Z_$]/.test(clean)) keywords.add(clean);
      }
    }
    if (defaultImport) keywords.add(defaultImport);
  }

  // Method declarations inside classes: async login(, register(
  const methodDecl = sourceCode.matchAll(/(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*(?::\s*\S+\s*)?{/g);
  for (const m of methodDecl) {
    if (m[1].length > 2 && !noise.has(m[1])) keywords.add(m[1]);
  }

  // Method calls: .methodName(
  const methods = sourceCode.matchAll(/\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g);
  for (const m of methods) {
    if (m[1].length > 2) keywords.add(m[1]);
  }

  return Array.from(keywords).filter(k => !noise.has(k) && k.length > 1);
}

// ============================================================================
// Edge Case Injector
// ============================================================================

export class EdgeCaseInjector {
  private readonly config: EdgeCaseInjectionConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config?: Partial<EdgeCaseInjectionConfig>
  ) {
    this.config = { ...DEFAULT_INJECTION_CONFIG, ...config };
  }

  /**
   * Get injection context for a source file being tested.
   * Searches memory for historical edge-case patterns relevant to the code,
   * filters and ranks them, then formats as prompt context.
   *
   * @param sourceCode - The source code being tested
   * @param domain - Optional domain hint for filtering (e.g., 'test-generation')
   * @returns InjectionContext with formatted prompt and stats
   */
  async getInjectionContext(sourceCode: string, domain?: string): Promise<InjectionContext> {
    const emptyResult: InjectionContext = { promptContext: '', patternsUsed: 0, totalConsidered: 0 };

    try {
      const keywords = extractKeywords(sourceCode);
      const retrieved = await this.searchPatterns(keywords, domain);

      if (retrieved.length === 0) return emptyResult;

      const totalConsidered = retrieved.length;

      // Filter by minimum confidence
      const filtered = retrieved.filter(p => p.confidence >= this.config.minConfidence);

      // Sort by relevance heuristic: successRate * 0.5 + confidence * 0.3 + log(usageCount+1) * 0.2
      filtered.sort((a, b) => {
        const scoreA = a.successRate * 0.5 + a.confidence * 0.3 + Math.log(a.usageCount + 1) / 10 * 0.2;
        const scoreB = b.successRate * 0.5 + b.confidence * 0.3 + Math.log(b.usageCount + 1) / 10 * 0.2;
        return scoreB - scoreA;
      });

      // Take topN
      const selected = filtered.slice(0, this.config.topN);

      if (selected.length === 0) {
        return { promptContext: '', patternsUsed: 0, totalConsidered };
      }

      const promptContext = this.formatPromptContext(selected);

      return {
        promptContext,
        patternsUsed: selected.length,
        totalConsidered,
      };
    } catch (error) {
      // Non-blocking: injection failure should never break test generation
      logger.warn('Failed to get injection context:');
      return emptyResult;
    }
  }

  /**
   * Search memory backend for relevant patterns using keywords and domain.
   */
  private async searchPatterns(keywords: string[], domain?: string): Promise<RetrievedPattern[]> {
    const patterns: RetrievedPattern[] = [];

    // Build search queries from keywords and domain
    const searchQueries: string[] = [];
    if (domain) {
      searchQueries.push(`edge-case:${domain}:*`);
      searchQueries.push(`pattern:${domain}:*`);
    }
    for (const keyword of keywords.slice(0, 5)) {
      searchQueries.push(`edge-case:*${keyword}*`);
      searchQueries.push(`pattern:*${keyword}*`);
    }
    // Also search the configured namespace
    searchQueries.push(`${this.config.namespace}:*`);

    const seenKeys = new Set<string>();

    for (const query of searchQueries) {
      try {
        const keys = await this.memory.search(query, 10);
        for (const key of keys) {
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          try {
            const value = await this.memory.get<Record<string, unknown>>(key);
            if (!value || typeof value !== 'object') continue;

            const pattern = this.parsePattern(key, value);
            if (pattern) patterns.push(pattern);
          } catch {
            // Skip individual pattern retrieval failures
          }
        }
      } catch {
        // Skip individual search failures
      }
    }

    return patterns;
  }

  /**
   * Parse a retrieved memory entry into a RetrievedPattern.
   * Handles various storage formats gracefully.
   */
  private parsePattern(key: string, value: Record<string, unknown>): RetrievedPattern | null {
    const name = typeof value.name === 'string' ? value.name : key.split(':').pop() || key;
    const description = typeof value.description === 'string' ? value.description : '';
    const confidence = typeof value.confidence === 'number' ? value.confidence : 0.5;
    const successRate = typeof value.successRate === 'number' ? value.successRate :
                        typeof value.success_rate === 'number' ? value.success_rate : 0;
    const usageCount = typeof value.usageCount === 'number' ? value.usageCount :
                       typeof value.usage_count === 'number' ? value.usage_count : 0;
    const tags = Array.isArray(value.tags) ? value.tags.filter((t): t is string => typeof t === 'string') : [];

    // Must have at least a name or description to be useful
    if (!name && !description) return null;

    return { key, name, description, confidence, successRate, usageCount, tags };
  }

  /**
   * Format selected patterns into a prompt context string.
   * Appends OPD remediation hints for patterns with low success rates.
   */
  private formatPromptContext(patterns: RetrievedPattern[]): string {
    const lines: string[] = ['## Historical Edge Cases (from patterns that caught real bugs):'];

    for (let i = 0; i < patterns.length; i++) {
      const p = patterns[i];
      const tag = p.tags.length > 0 ? p.tags[0] : this.inferTag(p);
      const desc = p.description || p.name;
      lines.push(`${i + 1}. [${tag}] ${desc}`);
    }

    // OPD: Append remediation hints for weak patterns (successRate < 0.5)
    const weakPatterns = patterns.filter(p => p.successRate < 0.5);
    const allHints: RemediationHint[] = [];
    for (const wp of weakPatterns) {
      const hints = generateRemediationHints(
        { id: wp.key, name: wp.name, description: wp.description, successRate: wp.successRate, usageCount: wp.usageCount, confidence: wp.confidence, tags: wp.tags },
        this.buildSyntheticHistory(wp),
      );
      allHints.push(...hints);
    }

    if (allHints.length > 0) {
      lines.push('');
      lines.push('## Remediation Notes (patterns with known issues):');
      for (const hint of allHints.slice(0, 3)) {
        lines.push(`- [${hint.category}] ${hint.suggestion}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build a synthetic execution history from pattern metadata.
   * Used to feed into OPD remediation when full history is unavailable.
   */
  private buildSyntheticHistory(pattern: RetrievedPattern): Array<{ success: boolean }> {
    const total = Math.max(pattern.usageCount, 1);
    const successes = Math.round(total * pattern.successRate);
    const history: Array<{ success: boolean }> = [];
    for (let i = 0; i < successes; i++) history.push({ success: true });
    for (let i = 0; i < total - successes; i++) history.push({ success: false });
    return history;
  }

  /**
   * Infer a short tag from pattern name when no tags are available.
   */
  private inferTag(pattern: RetrievedPattern): string {
    const name = pattern.name.toLowerCase();
    if (name.includes('null') || name.includes('undefined')) return 'null-check';
    if (name.includes('empty') || name.includes('boundary') || name.includes('zero')) return 'boundary';
    if (name.includes('async') || name.includes('promise') || name.includes('reject')) return 'async-error';
    if (name.includes('error') || name.includes('throw') || name.includes('exception')) return 'error-handling';
    if (name.includes('type') || name.includes('cast') || name.includes('coerce')) return 'type-safety';
    if (name.includes('concurr') || name.includes('race') || name.includes('parallel')) return 'concurrency';
    return 'edge-case';
  }
}
