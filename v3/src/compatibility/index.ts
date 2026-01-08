/**
 * V2 Compatibility Layer
 *
 * Provides backward compatibility for v2 APIs, allowing gradual migration to v3.
 * - Agent name mapping (v2 → v3)
 * - CLI command forwarding
 * - MCP tool adaptation
 * - Configuration migration
 *
 * @module compatibility
 */

export * from './types';
export * from './agent-mapper';
export * from './cli-adapter';
export * from './mcp-adapter';
export * from './config-migrator';

import { AgentMapper } from './agent-mapper';
import { CLIAdapter } from './cli-adapter';
import { MCPAdapter } from './mcp-adapter';
import { ConfigMigrator } from './config-migrator';

/**
 * V2 Compatibility Layer singleton
 */
export class V2CompatibilityLayer {
  private static instance: V2CompatibilityLayer;

  public readonly agents: AgentMapper;
  public readonly cli: CLIAdapter;
  public readonly mcp: MCPAdapter;
  public readonly config: ConfigMigrator;

  private deprecationWarnings: Set<string> = new Set();
  private warningsEnabled: boolean = true;

  private constructor() {
    this.agents = new AgentMapper();
    this.cli = new CLIAdapter(this.agents);
    this.mcp = new MCPAdapter(this.agents);
    this.config = new ConfigMigrator();
  }

  static getInstance(): V2CompatibilityLayer {
    if (!V2CompatibilityLayer.instance) {
      V2CompatibilityLayer.instance = new V2CompatibilityLayer();
    }
    return V2CompatibilityLayer.instance;
  }

  /**
   * Enable or disable deprecation warnings
   */
  setWarningsEnabled(enabled: boolean): void {
    this.warningsEnabled = enabled;
  }

  /**
   * Emit a deprecation warning (once per unique message)
   */
  warnDeprecation(v2Feature: string, v3Alternative: string): void {
    if (!this.warningsEnabled) return;

    const key = `${v2Feature}:${v3Alternative}`;
    if (this.deprecationWarnings.has(key)) return;

    this.deprecationWarnings.add(key);
    console.warn(
      `[AQE Deprecation] "${v2Feature}" is deprecated. Use "${v3Alternative}" instead.`
    );
  }

  /**
   * Check if running in compatibility mode
   */
  isCompatibilityMode(): boolean {
    return process.env.AQE_COMPATIBILITY_MODE === 'true';
  }

  /**
   * Get migration status report
   */
  getMigrationStatus(): MigrationStatus {
    return {
      v2FeaturesUsed: this.deprecationWarnings.size,
      warnings: Array.from(this.deprecationWarnings),
      recommendedActions: this.getRecommendedActions(),
    };
  }

  private getRecommendedActions(): string[] {
    const actions: string[] = [];

    if (this.deprecationWarnings.size > 0) {
      actions.push('Update agent names to v3 format (v3-qe-*)');
      actions.push('Migrate CLI commands to aqe-v3 format');
      actions.push('Update configuration to v3 schema');
    }

    return actions;
  }
}

interface MigrationStatus {
  v2FeaturesUsed: number;
  warnings: string[];
  recommendedActions: string[];
}

// Default export
export const compatibility = V2CompatibilityLayer.getInstance();
