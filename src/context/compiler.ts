/**
 * Context Compiler (BMAD-005)
 *
 * Aggregates relevant context from multiple sources before agent execution.
 * Produces a focused context document that reduces redundant queries.
 */

import type { ContextSource, ContextRequest, ContextFragment } from './sources/types.js';
import { MemoryContextSource } from './sources/memory-source.js';
import { GitContextSource } from './sources/git-source.js';
import { TestContextSource } from './sources/test-source.js';
import { CoverageContextSource } from './sources/coverage-source.js';
import { RequirementsContextSource } from './sources/requirements-source.js';
import { DefectContextSource } from './sources/defect-source.js';

export interface CompiledContext {
  /** One-paragraph overview */
  summary: string;
  /** Aggregated fragments sorted by priority */
  fragments: ContextFragment[];
  /** Total estimated tokens */
  totalTokens: number;
  /** Which sources contributed */
  sources: string[];
  /** Compilation timestamp */
  timestamp: string;
  /** Compilation duration in ms */
  duration: number;
}

export interface CompilerConfig {
  /** Maximum total token budget (default: 8000, using chars/3.5 estimation per Gap 7) */
  maxTokenBudget?: number;
  /** Sources to use (default: all) */
  sources?: ContextSource[];
  /** Cache TTL in ms (default: 5 minutes) */
  cacheTtlMs?: number;
}

interface CacheEntry {
  result: CompiledContext;
  timestamp: number;
}

const DEFAULT_TOKEN_BUDGET = 8000;
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Create default context sources.
 */
export function createDefaultSources(): ContextSource[] {
  return [
    new MemoryContextSource(),
    new RequirementsContextSource(),
    new TestContextSource(),
    new DefectContextSource(),
    new GitContextSource(),
    new CoverageContextSource(),
  ];
}

export class ContextCompiler {
  private sources: ContextSource[];
  private maxTokenBudget: number;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTtl: number;

  constructor(config?: CompilerConfig) {
    this.sources = config?.sources || createDefaultSources();
    this.maxTokenBudget = config?.maxTokenBudget || DEFAULT_TOKEN_BUDGET;
    this.cacheTtl = config?.cacheTtlMs || DEFAULT_CACHE_TTL;
  }

  /**
   * Compile context for a request.
   */
  async compile(request: ContextRequest): Promise<CompiledContext> {
    const start = Date.now();

    // Check cache
    const cacheKey = this.buildCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return cached.result;
    }

    // Override budget if request specifies
    const budget = request.maxTokenBudget || this.maxTokenBudget;

    // Gather from all sources in parallel
    const sourceResults = await Promise.allSettled(
      this.sources.map(async (source) => {
        try {
          const fragments = await source.gather(request);
          return { sourceId: source.id, sourceName: source.name, priority: source.priority, fragments };
        } catch {
          return { sourceId: source.id, sourceName: source.name, priority: source.priority, fragments: [] };
        }
      })
    );

    // Collect all fragments with source priority
    const allFragments: Array<ContextFragment & { sourcePriority: number }> = [];
    const contributingSources: string[] = [];

    for (const result of sourceResults) {
      if (result.status === 'fulfilled') {
        const { sourceId, priority, fragments } = result.value;
        if (fragments.length > 0) {
          contributingSources.push(sourceId);
          for (const fragment of fragments) {
            allFragments.push({ ...fragment, sourcePriority: priority });
          }
        }
      }
    }

    // Sort by priority (highest first), then by relevance
    allFragments.sort((a, b) => {
      if (a.sourcePriority !== b.sourcePriority) return b.sourcePriority - a.sourcePriority;
      return b.relevance - a.relevance;
    });

    // Trim to fit budget
    const selectedFragments: ContextFragment[] = [];
    let usedTokens = 0;

    for (const fragment of allFragments) {
      if (usedTokens + fragment.estimatedTokens <= budget) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { sourcePriority: _sp, ...frag } = fragment;
        selectedFragments.push(frag);
        usedTokens += fragment.estimatedTokens;
      }
    }

    // Generate summary
    const summary = this.generateSummary(request, selectedFragments, contributingSources);

    const compiled: CompiledContext = {
      summary,
      fragments: selectedFragments,
      totalTokens: usedTokens,
      sources: contributingSources,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    };

    // Cache result
    this.cache.set(cacheKey, { result: compiled, timestamp: Date.now() });

    return compiled;
  }

  /**
   * Clear the cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats.
   */
  getCacheStats(): { size: number; ttlMs: number } {
    return { size: this.cache.size, ttlMs: this.cacheTtl };
  }

  private buildCacheKey(request: ContextRequest): string {
    return `${request.agentType}:${request.targetFiles.sort().join(',')}:${request.taskDescription.slice(0, 100)}`;
  }

  private generateSummary(
    request: ContextRequest,
    fragments: ContextFragment[],
    sources: string[],
  ): string {
    return [
      `Context compiled for ${request.agentType} agent.`,
      `Target: ${request.targetFiles.length} file(s).`,
      `Sources: ${sources.join(', ')}.`,
      `Fragments: ${fragments.length} (${fragments.reduce((s, f) => s + f.estimatedTokens, 0)} est. tokens).`,
    ].join(' ');
  }
}

/**
 * Format compiled context as a string for agent prompts.
 */
export function formatContextForPrompt(context: CompiledContext): string {
  const lines: string[] = [];

  lines.push('## Compiled Context');
  lines.push('');
  lines.push(context.summary);
  lines.push('');

  for (const fragment of context.fragments) {
    lines.push(`### ${fragment.title}`);
    lines.push(fragment.content);
    lines.push('');
  }

  lines.push(`_Context compiled: ${context.timestamp} (${context.duration}ms)_`);

  return lines.join('\n');
}
