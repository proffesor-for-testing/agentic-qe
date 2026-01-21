/**
 * Agentic QE v3 - MCP Tool Registry
 *
 * Implements ADR-010: MCP-First Tool Design
 * Registers all QE domain tools for MCP server exposure.
 */

import { MCPToolBase } from './base';
import { ToolRegistry } from '../tool-registry';

// Import all tools
import { TestGenerateTool } from './test-generation/generate';
import { TestExecuteTool } from './test-execution/execute';
import { CoverageAnalyzeTool, CoverageGapsTool } from './coverage-analysis';
import { QualityEvaluateTool } from './quality-assessment/evaluate';
import { DefectPredictTool } from './defect-intelligence/predict';
import { RequirementsValidateTool } from './requirements-validation/validate';
import { CodeAnalyzeTool } from './code-intelligence/analyze';
import { SecurityScanTool } from './security-compliance/scan';
import { ContractValidateTool } from './contract-testing/validate';
import { VisualCompareTool, A11yAuditTool } from './visual-accessibility';
import { ChaosInjectTool } from './chaos-resilience/inject';
import { LearningOptimizeTool, DreamCycleTool } from './learning-optimization';
import { TokenUsageTool } from './analysis/token-usage';
import { GOAPPlanTool, GOAPExecuteTool, GOAPStatusTool } from './planning';
import { MINCUT_TOOLS, MINCUT_TOOL_NAMES } from './mincut';
import {
  EmbeddingGenerateTool,
  EmbeddingCompareTool,
  EmbeddingSearchTool,
  EmbeddingStoreTool,
  EmbeddingStatsTool,
} from './embeddings';

// ============================================================================
// Tool Names (ADR-010 Naming Convention)
// ============================================================================

export const QE_TOOL_NAMES = {
  // Test Generation
  TEST_GENERATE: 'qe/tests/generate',

  // Test Execution
  TEST_EXECUTE: 'qe/tests/execute',

  // Coverage Analysis
  COVERAGE_ANALYZE: 'qe/coverage/analyze',
  COVERAGE_GAPS: 'qe/coverage/gaps',

  // Quality Assessment
  QUALITY_EVALUATE: 'qe/quality/evaluate',

  // Defect Intelligence
  DEFECT_PREDICT: 'qe/defects/predict',

  // Requirements Validation
  REQUIREMENTS_VALIDATE: 'qe/requirements/validate',

  // Code Intelligence
  CODE_ANALYZE: 'qe/code/analyze',

  // Security Compliance
  SECURITY_SCAN: 'qe/security/scan',

  // Contract Testing
  CONTRACT_VALIDATE: 'qe/contracts/validate',

  // Visual Accessibility
  VISUAL_COMPARE: 'qe/visual/compare',
  A11Y_AUDIT: 'qe/a11y/audit',

  // Chaos Resilience
  CHAOS_INJECT: 'qe/chaos/inject',

  // Learning Optimization
  LEARNING_OPTIMIZE: 'qe/learning/optimize',
  LEARNING_DREAM: 'qe/learning/dream',

  // Analysis Tools (ADR-042)
  TOKEN_USAGE: 'qe/analysis/token_usage',

  // GOAP Planning Tools
  GOAP_PLAN: 'qe/planning/goap_plan',
  GOAP_EXECUTE: 'qe/planning/goap_execute',
  GOAP_STATUS: 'qe/planning/goap_status',

  // MinCut Topology Tools (ADR-047)
  ...MINCUT_TOOL_NAMES,

  // ONNX Embeddings (ADR-051)
  EMBEDDING_GENERATE: 'qe/embeddings/generate',
  EMBEDDING_COMPARE: 'qe/embeddings/compare',
  EMBEDDING_SEARCH: 'qe/embeddings/search',
  EMBEDDING_STORE: 'qe/embeddings/store',
  EMBEDDING_STATS: 'qe/embeddings/stats',
} as const;

// ============================================================================
// Tool Instances
// ============================================================================

/**
 * All QE MCP tools
 */
export const QE_TOOLS: MCPToolBase[] = [
  // Test Generation Domain
  new TestGenerateTool(),

  // Test Execution Domain
  new TestExecuteTool(),

  // Coverage Analysis Domain
  new CoverageAnalyzeTool(),
  new CoverageGapsTool(),

  // Quality Assessment Domain
  new QualityEvaluateTool(),

  // Defect Intelligence Domain
  new DefectPredictTool(),

  // Requirements Validation Domain
  new RequirementsValidateTool(),

  // Code Intelligence Domain
  new CodeAnalyzeTool(),

  // Security Compliance Domain
  new SecurityScanTool(),

  // Contract Testing Domain
  new ContractValidateTool(),

  // Visual Accessibility Domain
  new VisualCompareTool(),
  new A11yAuditTool(),

  // Chaos Resilience Domain
  new ChaosInjectTool(),

  // Learning Optimization Domain
  new LearningOptimizeTool(),
  new DreamCycleTool(),

  // Analysis Tools (ADR-042)
  new TokenUsageTool(),

  // GOAP Planning Tools
  new GOAPPlanTool(),
  new GOAPExecuteTool(),
  new GOAPStatusTool(),

  // MinCut Topology Tools (ADR-047)
  ...MINCUT_TOOLS,

  // ONNX Embeddings (ADR-051)
  new EmbeddingGenerateTool(),
  new EmbeddingCompareTool(),
  new EmbeddingSearchTool(),
  new EmbeddingStoreTool(),
  new EmbeddingStatsTool(),
];

// ============================================================================
// Registration Functions
// ============================================================================

/**
 * Register all QE tools with a ToolRegistry
 *
 * @param registry - Tool registry to register with
 */
export function registerAllQETools(registry: ToolRegistry): void {
  for (const tool of QE_TOOLS) {
    registry.register(
      {
        name: tool.name,
        description: tool.description,
        parameters: schemaToParameters(tool.getSchema()),
        category: 'domain',
        domain: tool.domain,
        lazyLoad: false, // QE tools are always available
      },
      async (params) => tool.invoke(params as Record<string, unknown>)
    );
  }
}

/**
 * Get a specific QE tool by name
 *
 * @param name - Tool name (e.g., 'qe/tests/generate')
 * @returns Tool instance or undefined
 */
export function getQETool(name: string): MCPToolBase | undefined {
  return QE_TOOLS.find(t => t.name === name);
}

/**
 * Get all tools for a specific domain
 *
 * @param domain - Domain name
 * @returns Array of tools
 */
export function getToolsByDomain(domain: string): MCPToolBase[] {
  return QE_TOOLS.filter(t => t.domain === domain);
}

/**
 * Get tool schema in MCP format
 *
 * @param tool - Tool instance
 * @returns MCP-compatible tool definition
 */
export function getToolDefinition(tool: MCPToolBase): {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
} {
  const schema = tool.getSchema();
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      ...schema,
      type: schema.type || 'object',
    },
  };
}

/**
 * Get all tool definitions for MCP server
 */
export function getAllToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return QE_TOOLS.map(getToolDefinition);
}

/**
 * Reset all instance-level caches in QE tools.
 * Call this when disposing the fleet to prevent stale backend references.
 *
 * Tools with instance caches (e.g., TestGenerateTool, CoverageAnalyzeTool)
 * cache their service instances for performance. When the fleet is disposed
 * and reinitialized, these cached services may hold references to disposed
 * memory backends. This function clears all tool caches to ensure fresh
 * service instances are created on next use.
 */
export function resetAllToolCaches(): void {
  for (const tool of QE_TOOLS) {
    tool.resetInstanceCache();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert MCPToolSchema to ToolParameter array for registry
 */
function schemaToParameters(schema: ReturnType<MCPToolBase['getSchema']>): Array<{
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
}> {
  const parameters: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    required?: boolean;
    default?: unknown;
    enum?: string[];
  }> = [];

  const required = new Set(schema.required || []);

  for (const [name, prop] of Object.entries(schema.properties)) {
    parameters.push({
      name,
      type: prop.type,
      description: prop.description,
      required: required.has(name),
      default: prop.default,
      enum: prop.enum,
    });
  }

  return parameters;
}

// ============================================================================
// Exports Summary
// ============================================================================

/**
 * Module exports:
 *
 * - QE_TOOL_NAMES: Constants for all tool names
 * - QE_TOOLS: Array of all tool instances
 * - registerAllQETools(registry): Register with ToolRegistry
 * - getQETool(name): Get tool by name
 * - getToolsByDomain(domain): Get tools for domain
 * - getToolDefinition(tool): Get MCP tool definition
 * - getAllToolDefinitions(): Get all MCP tool definitions
 */
