/**
 * @agentic-qe/opencode-types
 * Shared TypeScript types for AQE-OpenCode integration.
 *
 * These types define the contract between AQE's MCP server and OpenCode's
 * agent/skill/tool configuration system.
 */

// ============================================================================
// Model Tier
// ============================================================================

/**
 * Model capability tier for OpenCode provider routing.
 * Maps to OpenCode's model selection system:
 * - tier1-any: Any model works (simple transforms, formatting)
 * - tier2-good: Needs a competent model (code generation, analysis)
 * - tier3-best: Needs the best available model (architecture, security audit)
 */
export enum ModelTier {
  /** Any model — simple transforms, formatting, linting */
  Tier1Any = 'tier1-any',
  /** Good model — code generation, test writing, analysis */
  Tier2Good = 'tier2-good',
  /** Best model — architecture decisions, security audits, complex reasoning */
  Tier3Best = 'tier3-best',
}

// ============================================================================
// Provider Capability
// ============================================================================

/**
 * Describes what a model provider can do.
 * Used by the bridge to match AQE tool requirements to available providers.
 */
export interface ProviderCapability {
  /** Provider identifier (e.g., 'anthropic', 'openai', 'ollama') */
  providerId: string;
  /** Model identifier within the provider */
  modelId: string;
  /** Maximum context window in tokens */
  maxContextTokens: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Whether the model supports tool/function calling */
  supportsToolCalling: boolean;
  /** Whether the model supports streaming */
  supportsStreaming: boolean;
  /** Effective tier this provider operates at */
  tier: ModelTier;
}

// ============================================================================
// OpenCode Agent Config
// ============================================================================

/**
 * Configuration for an OpenCode agent backed by AQE capabilities.
 * Maps to OpenCode's agent system where each agent has a name,
 * system prompt, model preference, and set of allowed tools.
 */
export interface OpenCodeAgentConfig {
  /** Unique agent name (e.g., 'aqe-test-architect') */
  name: string;
  /** Human-readable description */
  description: string;
  /** System prompt that defines agent behavior */
  systemPrompt: string;
  /** Preferred model identifier or tier */
  model: string | ModelTier;
  /** List of MCP tool names this agent can use */
  tools: string[];
  /** Permission scopes for file/network access */
  permissions: AgentPermissions;
}

/**
 * Permission scopes for an OpenCode agent.
 */
export interface AgentPermissions {
  /** Glob patterns for allowed file reads */
  fileRead?: string[];
  /** Glob patterns for allowed file writes */
  fileWrite?: string[];
  /** Whether network access is allowed */
  networkAccess?: boolean;
  /** Whether shell command execution is allowed */
  shellAccess?: boolean;
  /** Maximum token budget per invocation */
  maxTokensPerCall?: number;
}

// ============================================================================
// OpenCode Skill Config
// ============================================================================

/**
 * Configuration for an OpenCode skill powered by AQE.
 * Skills are higher-level workflows composed of multiple tool calls.
 */
export interface OpenCodeSkillConfig {
  /** Unique skill name (e.g., 'aqe-coverage-gap-fix') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Tags for categorization and discovery */
  tags: string[];
  /** Minimum model tier required to execute this skill */
  minModelTier: ModelTier;
  /** Ordered steps that compose this skill */
  steps: SkillStep[];
}

/**
 * A single step in a skill workflow.
 */
export interface SkillStep {
  /** Step identifier */
  id: string;
  /** MCP tool to invoke */
  toolName: string;
  /** Description of what this step does */
  description: string;
  /** Parameter mappings (static values or references to previous step outputs) */
  parameters?: Record<string, unknown>;
  /** IDs of steps that must complete before this one */
  dependsOn?: string[];
  /** Whether to continue the workflow if this step fails */
  continueOnFailure?: boolean;
}

// ============================================================================
// OpenCode Tool Config
// ============================================================================

/**
 * Configuration for exposing an AQE MCP tool to OpenCode.
 * Provides metadata that OpenCode uses for tool display and invocation.
 */
export interface OpenCodeToolConfig {
  /** Tool name as registered in MCP (e.g., 'fleet_init') */
  name: string;
  /** Human-readable description for OpenCode's tool panel */
  description: string;
  /** JSON Schema for the tool's input parameters */
  parameters: ToolParameterSchema;
}

/**
 * JSON Schema subset for tool parameter definitions.
 */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, ToolPropertySchema>;
  required?: string[];
}

/**
 * Schema for a single tool property.
 */
export interface ToolPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  default?: unknown;
  enum?: string[];
}

// ============================================================================
// AQE Plugin Config
// ============================================================================

/**
 * Configuration for the AQE plugin within OpenCode.
 * Controls which AQE features are active and how they integrate.
 */
export interface AQEPluginConfig {
  /** Lifecycle hooks to enable (e.g., 'pre-commit', 'post-test') */
  enabledHooks: string[];
  /** Path to the AQE memory database */
  memoryDbPath: string;
  /** QE domains to activate */
  domains: string[];
  /** Maximum token budget across all AQE operations per session */
  tokenBudget: number;
  /** Optional: custom MCP server command override */
  mcpCommand?: string;
  /** Optional: custom MCP server args override */
  mcpArgs?: string[];
  /** Optional: environment variables for the MCP server */
  mcpEnv?: Record<string, string>;
}

// ============================================================================
// Health & Status Types
// ============================================================================

/**
 * Health check response from the AQE MCP server.
 */
// Re-export skill tier types
export type {
  ModelTierString,
  DegradationBehavior,
  SkillTierMetadata,
  SkillTierSummary,
} from './skill-tiers.js';

export interface AQEHealthStatus {
  /** Server operational status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Server version */
  version: string;
  /** Number of loaded QE domains */
  loadedDomains: number;
  /** Memory subsystem stats */
  memory: {
    /** Whether the memory backend is connected */
    connected: boolean;
    /** Total stored entries */
    totalEntries: number;
    /** Namespaces in use */
    namespaces: number;
  };
  /** HNSW vector index status */
  hnsw: {
    /** Whether HNSW is enabled and loaded */
    enabled: boolean;
    /** Number of indexed vectors */
    vectorCount: number;
  };
  /** Number of loaded QE patterns */
  loadedPatterns: number;
  /** Server uptime in milliseconds */
  uptimeMs: number;
  /** ISO timestamp of the health check */
  timestamp: string;
}
