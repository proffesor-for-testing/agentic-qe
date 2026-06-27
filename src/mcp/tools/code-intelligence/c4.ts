/**
 * Agentic QE v3 - C4 Architecture MCP Tool (ADR-112)
 *
 * qe/code/c4 - Generate C4 architecture diagrams (Context/Container/Component,
 * Mermaid) from codebase analysis, plus semantic search over stored diagrams.
 *
 * Wraps the SAME pipeline the CLI `aqe code c4` drives:
 *   ProductFactorsBridgeService (detect) → C4ModelService (render+store) →
 *   deterministic confidence gate. This keeps MCP-CLI parity by construction.
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema, getSharedMemoryBackend } from '../base';
import { ToolResult } from '../../types';
import { ProductFactorsBridgeService } from '../../../domains/code-intelligence/services/product-factors-bridge';
import { C4ModelService } from '../../../domains/code-intelligence/services/c4-model';
import { KnowledgeGraphService } from '../../../domains/code-intelligence/services/knowledge-graph';
import { createKnowledgeGraphRelationshipResolver } from '../../../domains/code-intelligence/services/c4-model/kg-relationships';
import { InMemoryEventBus } from '../../../kernel/event-bus';
import type { C4Diagrams, C4ConfidenceAssessment } from '../../../shared/c4-model';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export type C4Level = 'context' | 'container' | 'component' | 'all';

export interface CodeC4Params {
  action: 'generate' | 'search';
  projectPath?: string;
  level?: C4Level;
  query?: string;
  limit?: number;
  [key: string]: unknown;
}

export interface C4GenerateResult {
  diagrams: C4Diagrams;
  confidence?: C4ConfidenceAssessment;
  componentsDetected: number;
  externalSystemsDetected: number;
  relationshipsDetected: number;
  circularDependencies: number;
}

export interface C4SearchHit {
  key: string;
  type: 'context' | 'container' | 'component';
  title: string;
  score: number;
  preview: string;
}

export interface C4SearchResult {
  results: C4SearchHit[];
  total: number;
}

export interface CodeC4Result {
  action: string;
  generateResult?: C4GenerateResult;
  searchResult?: C4SearchResult;
}

const want = (level: C4Level, l: string): boolean => level === 'all' || level === l;

// ============================================================================
// Tool Implementation
// ============================================================================

export class CodeC4Tool extends MCPToolBase<CodeC4Params, CodeC4Result> {
  readonly config: MCPToolConfig = {
    name: 'qe/code/c4',
    description:
      'Generate C4 architecture diagrams (Context/Container/Component, Mermaid) from a codebase with a deterministic confidence gate, or semantically search previously generated diagrams.',
    domain: 'code-intelligence',
    schema: CODE_C4_SCHEMA,
    streaming: false,
    timeout: 300000,
  };

  private bridge: ProductFactorsBridgeService | null = null;
  private searchService: C4ModelService | null = null;

  private async getBridge(context: MCPToolContext): Promise<ProductFactorsBridgeService> {
    if (!this.bridge) {
      const memory = context.memory ?? (await getSharedMemoryBackend());
      // ADR-112 C2: KG-backed resolver (project-scoped) so MCP matches the CLI.
      // publishEvents:false — the MCP path doesn't need the cross-domain event.
      this.bridge = new ProductFactorsBridgeService(new InMemoryEventBus(), memory, {
        publishEvents: false,
        // ADR-112: embed generated diagrams so `search` can find them.
        enableC4Embeddings: true,
        relationshipResolver: createKnowledgeGraphRelationshipResolver(
          (projectPath) => new KnowledgeGraphService(memory, { basePath: projectPath }),
        ),
      });
    }
    return this.bridge;
  }

  /** Embeddings ON here so stored diagrams are semantically searchable. */
  private async getSearchService(context: MCPToolContext): Promise<C4ModelService> {
    if (!this.searchService) {
      const memory = context.memory ?? (await getSharedMemoryBackend());
      this.searchService = new C4ModelService(memory, { enableEmbeddings: true });
    }
    return this.searchService;
  }

  async execute(params: CodeC4Params, context: MCPToolContext): Promise<ToolResult<CodeC4Result>> {
    const { action, projectPath = '.', level = 'all', query, limit = 10 } = params;

    try {
      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      const result: CodeC4Result = { action };

      switch (action) {
        case 'generate': {
          const bridge = await this.getBridge(context);
          const res = await bridge.requestC4Diagrams({
            projectPath,
            includeContext: want(level, 'context'),
            includeContainer: want(level, 'container'),
            includeComponent: want(level, 'component'),
            includeDependency: level === 'all',
            analyzeComponents: true,
            detectExternalSystems: true,
            analyzeCoupling: true,
          });
          if (!res.success) {
            return { success: false, error: toErrorMessage(res.error) };
          }
          const c4 = res.value;
          result.generateResult = {
            diagrams: c4.diagrams,
            confidence: c4.metadata.analysisMetadata?.confidence,
            componentsDetected: c4.components.length,
            externalSystemsDetected: c4.externalSystems.length,
            relationshipsDetected: c4.relationships.length,
            circularDependencies: (c4.couplingAnalysis ?? []).filter((co) => co.isCircular).length,
          };
          break;
        }

        case 'search': {
          if (!query) {
            return { success: false, error: 'Query is required for search action' };
          }
          const service = await this.getSearchService(context);
          const res = await service.searchDiagrams(query, limit);
          if (!res.success) {
            return { success: false, error: toErrorMessage(res.error) };
          }
          result.searchResult = {
            results: res.value.map((r) => ({ key: r.key, type: r.type, title: r.title, score: r.score, preview: r.preview })),
            total: res.value.length,
          };
          break;
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: toErrorMessage(error) };
    }
  }
}

// ============================================================================
// Schema
// ============================================================================

const CODE_C4_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      description: 'C4 action to perform',
      enum: ['generate', 'search'],
    },
    projectPath: {
      type: 'string',
      description: 'Project root to analyze (generate action). Defaults to the current directory.',
    },
    level: {
      type: 'string',
      description: 'C4 level to generate (generate action)',
      enum: ['context', 'container', 'component', 'all'],
    },
    query: {
      type: 'string',
      description: 'Semantic search query over stored diagrams (search action)',
    },
    limit: {
      type: 'number',
      description: 'Max search results (search action)',
    },
  },
  required: ['action'],
};
