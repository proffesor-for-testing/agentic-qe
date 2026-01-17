/**
 * Agent Context Module
 *
 * Knowledge graph-based context enrichment for agents.
 * Reduces LLM token usage by 80% through intelligent search and caching.
 */

export { ContextCache } from './ContextCache.js';
export type { CacheEntry, CacheStats, ContextCacheConfig } from './ContextCache.js';

export { GraphExpander } from './GraphExpander.js';
export type {
  ExpansionConfig,
  ExpandedNode,
  ExpansionResult,
} from './GraphExpander.js';

export { ContextFormatter } from './ContextFormatter.js';
export type {
  FormattingOptions,
  FormattedContext,
} from './ContextFormatter.js';

export { KnowledgeGraphContextBuilder } from './KnowledgeGraphContextBuilder.js';
export type {
  ContextQuery,
  ContextOptions,
  EnrichedContext,
  ContextBuilderConfig,
} from './KnowledgeGraphContextBuilder.js';
