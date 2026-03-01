/**
 * Agentic QE v3 - Code Intelligence Domain
 * Knowledge Graph, semantic search, and impact analysis
 *
 * This module exports the public API for the code-intelligence domain.
 */

// ============================================================================
// Domain Plugin (Primary Export)
// ============================================================================

export {
  CodeIntelligencePlugin,
  createCodeIntelligencePlugin,
  type CodeIntelligencePluginConfig,
  type CodeIntelligenceExtendedAPI,
} from './plugin';

// ============================================================================
// Coordinator
// ============================================================================

export {
  CodeIntelligenceCoordinator,
  type ICodeIntelligenceCoordinator,
  type WorkflowStatus,
  type CoordinatorConfig,
} from './coordinator';

// ============================================================================
// Services
// ============================================================================

export {
  KnowledgeGraphService,
  type IKnowledgeGraphService,
  type KnowledgeGraphConfig,
} from './services/knowledge-graph';

export {
  SemanticAnalyzerService,
  type ISemanticAnalyzerService,
  type SemanticAnalyzerConfig,
  type SemanticAnalysis,
  type CodeComplexity,
  type HalsteadMetrics,
} from './services/semantic-analyzer';

export {
  ImpactAnalyzerService,
  type IImpactAnalyzerService,
  type ImpactAnalyzerConfig,
  type RiskWeights,
} from './services/impact-analyzer';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

// ============================================================================
// CQ-005: Register domain services in the shared DomainServiceRegistry
// so coordination/ can resolve them without importing from domains/.
// ============================================================================
import { DomainServiceRegistry, ServiceKeys } from '../../shared/domain-service-registry';
import type { MemoryBackend } from '../../kernel/interfaces';
import { KnowledgeGraphService as _KnowledgeGraphService } from './services/knowledge-graph';

DomainServiceRegistry.register(
  ServiceKeys.KnowledgeGraphService,
  (memory: MemoryBackend) => new _KnowledgeGraphService(memory),
);

export type {
  // API interface
  CodeIntelligenceAPI,

  // Request types
  IndexRequest,
  SearchRequest,
  SearchFilter,
  ImpactRequest,
  DependencyRequest,
  KGQueryRequest,

  // Response types
  IndexResult,
  IndexError,
  SearchResults,
  SearchResult,
  ImpactAnalysis,
  ImpactedFile,
  DependencyMap,
  DependencyNode,
  DependencyEdge,
  DependencyMetrics,
  KGQueryResult,
  KGNode,
  KGEdge,
} from './interfaces';
