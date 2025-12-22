/**
 * Types for RAG (Retrieval-Augmented Generation) Module
 *
 * Defines interfaces for context building, query processing,
 * and response generation.
 */

export interface RAGConfig {
  /**
   * Maximum tokens in generated context.
   */
  maxContextTokens: number;

  /**
   * Number of chunks to retrieve.
   */
  topK: number;

  /**
   * Minimum relevance score for inclusion.
   */
  minRelevanceScore: number;

  /**
   * Enable graph expansion for related code.
   */
  enableGraphExpansion: boolean;

  /**
   * Depth of graph expansion.
   */
  graphExpansionDepth: number;

  /**
   * Enable response caching.
   */
  enableCaching: boolean;

  /**
   * Cache TTL in milliseconds.
   */
  cacheTtlMs: number;

  /**
   * Summarization strategy.
   */
  summarizationStrategy: 'tree' | 'map-reduce' | 'refine';

  /**
   * LLM model for summarization.
   */
  summarizationModel?: string;
}

export interface RetrievedContext {
  /** Unique ID */
  id: string;

  /** Source file path */
  filePath: string;

  /** Code content */
  content: string;

  /** Start line in file */
  startLine: number;

  /** End line in file */
  endLine: number;

  /** Relevance score */
  score: number;

  /** Entity type (function, class, etc.) */
  entityType?: string;

  /** Entity name */
  entityName?: string;

  /** Programming language */
  language?: string;

  /** Related contexts from graph expansion */
  relatedContexts?: RetrievedContext[];

  /** Relationship type for related contexts */
  relationship?: string;
}

export interface QueryContext {
  /** Original user query */
  query: string;

  /** Parsed intent (if applicable) */
  intent?: 'explain' | 'find' | 'modify' | 'debug' | 'generate';

  /** Extracted entities from query */
  entities?: string[];

  /** Filter by language */
  language?: string;

  /** Filter by file pattern */
  filePattern?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface GeneratedContext {
  /** Formatted context string for LLM */
  contextText: string;

  /** Token count estimate */
  tokenCount: number;

  /** Retrieved chunks used */
  sources: RetrievedContext[];

  /** Whether context was truncated */
  truncated: boolean;

  /** Summary if generated */
  summary?: string;

  /** Cache hit */
  cached: boolean;
}

export interface RAGResponse {
  /** Generated context */
  context: GeneratedContext;

  /** Processing metadata */
  metadata: {
    query: string;
    retrievalTimeMs: number;
    graphExpansionTimeMs: number;
    formattingTimeMs: number;
    totalTimeMs: number;
    chunksRetrieved: number;
    chunksIncluded: number;
  };
}

export interface ContextTemplate {
  /** Template name */
  name: string;

  /** Template for formatting context */
  format: string;

  /** Variables available in template */
  variables: string[];
}

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  maxContextTokens: 4096,
  topK: 10,
  minRelevanceScore: 0.5,
  enableGraphExpansion: true,
  graphExpansionDepth: 2,
  enableCaching: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  summarizationStrategy: 'tree',
};

export const DEFAULT_CONTEXT_TEMPLATE: ContextTemplate = {
  name: 'default',
  format: `# Relevant Code Context

{{#each sources}}
## {{filePath}} (lines {{startLine}}-{{endLine}})
{{#if entityType}}Type: {{entityType}}{{/if}}
{{#if entityName}}Name: {{entityName}}{{/if}}

\`\`\`{{language}}
{{content}}
\`\`\`

{{#if relatedContexts}}
### Related Code:
{{#each relatedContexts}}
- **{{relationship}}**: {{filePath}} ({{entityName}})
{{/each}}
{{/if}}

---
{{/each}}

{{#if summary}}
## Summary
{{summary}}
{{/if}}
`,
  variables: ['sources', 'summary', 'query'],
};
