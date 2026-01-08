/**
 * Type definitions for V2 Compatibility Layer
 */

/**
 * V2 to V3 agent mapping entry
 */
export interface AgentMapping {
  v2Name: string;
  v3Name: string;
  domain: string;
  deprecated: boolean;
  notes?: string;
}

/**
 * V2 to V3 CLI command mapping
 */
export interface CLICommandMapping {
  v2Command: string;
  v3Command: string;
  argMapping?: Record<string, string>;
  deprecated: boolean;
  notes?: string;
}

/**
 * V2 to V3 MCP tool mapping
 */
export interface MCPToolMapping {
  v2Tool: string;
  v3Tool: string;
  paramMapping?: Record<string, string>;
  deprecated: boolean;
  notes?: string;
}

/**
 * V2 configuration structure
 */
export interface V2Config {
  version?: string;
  agents?: string[];
  memory?: {
    backend?: string;
    path?: string;
  };
  learning?: {
    enabled?: boolean;
    patternRetention?: number;
  };
  coverage?: {
    threshold?: number;
  };
  [key: string]: unknown;
}

/**
 * V3 configuration structure
 */
export interface V3Config {
  v3: {
    version: string;
    domains: string[];
    agents: {
      maxConcurrent: number;
      timeout: number;
      retryOnFailure: boolean;
      maxRetries: number;
    };
    memory: {
      backend: 'sqlite' | 'agentdb' | 'hybrid';
      sqlite?: { path: string };
      agentdb?: { enabled: boolean };
      hnsw?: {
        enabled: boolean;
        M: number;
        efConstruction: number;
        efSearch: number;
      };
    };
    learning: {
      enabled: boolean;
      neuralLearning: boolean;
      patternRetention: number;
      transferEnabled: boolean;
    };
    coverage: {
      algorithm: 'sublinear' | 'traditional';
      thresholds: {
        statements: number;
        branches: number;
        functions: number;
        lines: number;
      };
      riskWeighted: boolean;
    };
    qualityGates: {
      coverage: { min: number; blocking: boolean };
      complexity: { max: number; blocking: boolean };
      vulnerabilities: { critical: number; high: number; blocking: boolean };
    };
  };
}

/**
 * Configuration migration result
 */
export interface ConfigMigrationResult {
  success: boolean;
  v3Config: V3Config;
  warnings: string[];
  unmappedKeys: string[];
}

/**
 * Compatibility layer options
 */
export interface CompatibilityOptions {
  enableWarnings: boolean;
  strictMode: boolean;
  autoMigrate: boolean;
}

/**
 * Agent resolution result
 */
export interface AgentResolution {
  resolved: boolean;
  v3Agent: string | null;
  wasV2: boolean;
  domain: string | null;
  deprecationWarning?: string;
}

/**
 * CLI command resolution result
 */
export interface CLIResolution {
  resolved: boolean;
  v3Command: string | null;
  v3Args: string[];
  wasV2: boolean;
  deprecationWarning?: string;
}

/**
 * MCP tool resolution result
 */
export interface MCPResolution {
  resolved: boolean;
  v3Tool: string | null;
  v3Params: Record<string, unknown>;
  wasV2: boolean;
  deprecationWarning?: string;
}
