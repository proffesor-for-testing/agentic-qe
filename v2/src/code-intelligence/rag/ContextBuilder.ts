/**
 * Context Builder
 *
 * Builds optimized context for LLM consumption from
 * retrieved code chunks and graph relationships.
 */

import type {
  RAGConfig,
  QueryContext,
  RetrievedContext,
  GeneratedContext,
  RAGResponse,
  ContextTemplate,
} from './types.js';
import { DEFAULT_RAG_CONFIG, DEFAULT_CONTEXT_TEMPLATE } from './types.js';

export class ContextBuilder {
  private config: RAGConfig;
  private template: ContextTemplate;
  private cache: Map<string, { context: GeneratedContext; timestamp: number }> = new Map();

  constructor(
    config: Partial<RAGConfig> = {},
    template: ContextTemplate = DEFAULT_CONTEXT_TEMPLATE
  ) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
    this.template = template;
  }

  /**
   * Build context from retrieved chunks.
   */
  buildContext(
    queryContext: QueryContext,
    retrievedChunks: RetrievedContext[]
  ): GeneratedContext {
    // Check cache
    if (this.config.enableCaching) {
      const cached = this.getCachedContext(queryContext.query);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    // Filter by minimum score
    const filtered = retrievedChunks.filter(
      (c) => c.score >= this.config.minRelevanceScore
    );

    // Sort by score
    const sorted = [...filtered].sort((a, b) => b.score - a.score);

    // Select chunks within token budget
    const selected = this.selectChunksWithinBudget(sorted);

    // Format context
    const contextText = this.formatContext(selected, queryContext);

    // Estimate token count
    const tokenCount = this.estimateTokens(contextText);

    const result: GeneratedContext = {
      contextText,
      tokenCount,
      sources: selected,
      truncated: selected.length < sorted.length,
      cached: false,
    };

    // Cache result
    if (this.config.enableCaching) {
      this.setCachedContext(queryContext.query, result);
    }

    return result;
  }

  /**
   * Build RAG response with full metadata.
   */
  async buildResponse(
    queryContext: QueryContext,
    retrievedChunks: RetrievedContext[],
    graphExpansionTimeMs: number = 0
  ): Promise<RAGResponse> {
    const startTime = Date.now();

    const retrievalTimeMs = 0; // Would be passed in from search
    const context = this.buildContext(queryContext, retrievedChunks);
    const formattingTimeMs = Date.now() - startTime - graphExpansionTimeMs;

    return {
      context,
      metadata: {
        query: queryContext.query,
        retrievalTimeMs,
        graphExpansionTimeMs,
        formattingTimeMs,
        totalTimeMs: Date.now() - startTime,
        chunksRetrieved: retrievedChunks.length,
        chunksIncluded: context.sources.length,
      },
    };
  }

  /**
   * Add graph-expanded related code to chunks.
   */
  expandWithRelatedCode(
    chunks: RetrievedContext[],
    relationships: Array<{
      sourceId: string;
      relatedChunk: RetrievedContext;
      relationship: string;
    }>
  ): RetrievedContext[] {
    const chunkMap = new Map(chunks.map((c) => [c.id, c]));

    for (const rel of relationships) {
      const chunk = chunkMap.get(rel.sourceId);
      if (chunk) {
        if (!chunk.relatedContexts) {
          chunk.relatedContexts = [];
        }
        chunk.relatedContexts.push({
          ...rel.relatedChunk,
          relationship: rel.relationship,
        });
      }
    }

    return chunks;
  }

  /**
   * Generate summary of context (placeholder for LLM integration).
   */
  async generateSummary(
    chunks: RetrievedContext[],
    query: string
  ): Promise<string> {
    // This would integrate with an LLM for actual summarization
    // For now, return a simple summary

    const fileCount = new Set(chunks.map((c) => c.filePath)).size;
    const entityTypes = new Set(chunks.filter((c) => c.entityType).map((c) => c.entityType));

    return `Found ${chunks.length} relevant code sections across ${fileCount} files. ` +
           `Types: ${Array.from(entityTypes).join(', ') || 'various'}.`;
  }

  /**
   * Select chunks that fit within token budget.
   */
  private selectChunksWithinBudget(
    chunks: RetrievedContext[]
  ): RetrievedContext[] {
    const selected: RetrievedContext[] = [];
    let tokenCount = 0;

    // Reserve tokens for formatting overhead
    const overheadPerChunk = 50; // Estimated tokens for metadata, formatting
    const maxChunks = Math.min(chunks.length, this.config.topK);

    for (const chunk of chunks) {
      if (selected.length >= maxChunks) break;

      const chunkTokens = this.estimateTokens(chunk.content) + overheadPerChunk;

      // Add related context tokens
      let relatedTokens = 0;
      if (chunk.relatedContexts) {
        for (const related of chunk.relatedContexts) {
          relatedTokens += this.estimateTokens(related.content) * 0.3; // Partial inclusion
        }
      }

      const totalTokens = chunkTokens + relatedTokens;

      if (tokenCount + totalTokens <= this.config.maxContextTokens) {
        selected.push(chunk);
        tokenCount += totalTokens;
      }
    }

    return selected;
  }

  /**
   * Format context using template.
   */
  private formatContext(
    chunks: RetrievedContext[],
    queryContext: QueryContext
  ): string {
    // Simple template rendering (would use Handlebars or similar in production)
    const parts: string[] = ['# Relevant Code Context\n'];

    for (const chunk of chunks) {
      parts.push(`## ${chunk.filePath} (lines ${chunk.startLine}-${chunk.endLine})`);

      if (chunk.entityType) {
        parts.push(`Type: ${chunk.entityType}`);
      }
      if (chunk.entityName) {
        parts.push(`Name: ${chunk.entityName}`);
      }

      parts.push(`\n\`\`\`${chunk.language || ''}`);
      parts.push(chunk.content);
      parts.push('```\n');

      // Add related contexts
      if (chunk.relatedContexts && chunk.relatedContexts.length > 0) {
        parts.push('### Related Code:');
        for (const related of chunk.relatedContexts.slice(0, 3)) {
          parts.push(`- **${related.relationship}**: ${related.filePath} (${related.entityName || 'code'})`);
        }
        parts.push('');
      }

      parts.push('---\n');
    }

    return parts.join('\n');
  }

  /**
   * Estimate token count for text.
   * Uses rough approximation of 4 characters per token.
   */
  private estimateTokens(text: string): number {
    // More accurate would use tiktoken or similar
    return Math.ceil(text.length / 4);
  }

  /**
   * Get cached context.
   */
  private getCachedContext(query: string): GeneratedContext | null {
    const cacheKey = this.getCacheKey(query);
    const cached = this.cache.get(cacheKey);

    if (!cached) return null;

    // Check TTL
    if (Date.now() - cached.timestamp > this.config.cacheTtlMs) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.context;
  }

  /**
   * Set cached context.
   */
  private setCachedContext(query: string, context: GeneratedContext): void {
    const cacheKey = this.getCacheKey(query);
    this.cache.set(cacheKey, {
      context,
      timestamp: Date.now(),
    });

    // Limit cache size
    if (this.cache.size > 1000) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 100);

      for (const [key] of oldest) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Generate cache key.
   */
  private getCacheKey(query: string): string {
    return query.toLowerCase().trim();
  }

  /**
   * Clear cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get configuration.
   */
  getConfig(): RAGConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<RAGConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set template.
   */
  setTemplate(template: ContextTemplate): void {
    this.template = template;
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would track hits/misses for real metric
    };
  }
}
