/**
 * Recovery Playbook
 * ADR-056: Infrastructure Self-Healing Extension
 *
 * YAML-driven configuration for infrastructure recovery.
 * Maps service names to health-check / recover / verify shell commands.
 * Framework-agnostic — changing the YAML switches from Jest to Pytest
 * to JUnit with zero code changes.
 *
 * Supports ${VAR} interpolation from environment variables or an
 * explicit variables map.
 */

import * as fs from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type {
  RecoveryPlaybookConfig,
  ServiceRecoveryPlan,
  RecoveryCommand,
} from './types.js';

// ============================================================================
// Recovery Playbook
// ============================================================================

/**
 * Loads and manages a YAML recovery playbook.
 * Provides service recovery plans with variable interpolation.
 */
export class RecoveryPlaybook {
  private config: RecoveryPlaybookConfig | null = null;
  private readonly variables: Record<string, string>;

  constructor(variables?: Record<string, string>) {
    this.variables = { ...process.env, ...(variables ?? {}) } as Record<string, string>;
  }

  /**
   * Load playbook from a YAML file path.
   */
  async loadFromFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    this.loadFromString(content);
  }

  /**
   * Load playbook from a YAML string (for testing or inline config).
   */
  loadFromString(yamlContent: string): void {
    const raw = parseYaml(yamlContent) as RawPlaybookYaml;
    this.config = this.parsePlaybook(raw);
  }

  /**
   * Get the recovery plan for a specific service.
   * Returns undefined if the service is not defined in the playbook.
   */
  getRecoveryPlan(serviceName: string): ServiceRecoveryPlan | undefined {
    if (!this.config) return undefined;
    return this.config.services[serviceName];
  }

  /**
   * List all service names defined in the playbook.
   */
  listServices(): readonly string[] {
    if (!this.config) return [];
    return Object.keys(this.config.services);
  }

  /**
   * Check if the playbook has been loaded.
   */
  isLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * Get the full playbook configuration.
   */
  getConfig(): RecoveryPlaybookConfig | null {
    return this.config;
  }

  // ============================================================================
  // Parsing
  // ============================================================================

  private parsePlaybook(raw: RawPlaybookYaml): RecoveryPlaybookConfig {
    const defaults = raw.defaults ?? {};
    const defaultTimeoutMs = defaults.timeoutMs ?? 10_000;
    const defaultMaxRetries = defaults.maxRetries ?? 3;
    const defaultBackoffMs = defaults.backoffMs ?? [2000, 5000, 10_000];

    const services: Record<string, ServiceRecoveryPlan> = {};

    if (raw.services) {
      for (const [name, rawService] of Object.entries(raw.services)) {
        services[name] = this.parseService(
          name,
          rawService,
          defaultTimeoutMs,
          defaultMaxRetries,
          defaultBackoffMs,
        );
      }
    }

    return {
      version: raw.version ?? '1.0.0',
      defaultTimeoutMs,
      defaultMaxRetries,
      defaultBackoffMs,
      services,
    };
  }

  private parseService(
    name: string,
    raw: RawServiceYaml,
    defaultTimeoutMs: number,
    defaultMaxRetries: number,
    defaultBackoffMs: readonly number[],
  ): ServiceRecoveryPlan {
    return {
      serviceName: name,
      description: raw.description ?? name,
      healthCheck: this.parseCommand(raw.healthCheck, defaultTimeoutMs),
      recover: Array.isArray(raw.recover)
        ? raw.recover.map((cmd) => this.parseCommand(cmd, defaultTimeoutMs))
        : [this.parseCommand(raw.recover, defaultTimeoutMs)],
      verify: this.parseCommand(raw.verify, defaultTimeoutMs),
      maxRetries: raw.maxRetries ?? defaultMaxRetries,
      backoffMs: raw.backoffMs ?? defaultBackoffMs,
    };
  }

  private parseCommand(raw: RawCommandYaml | string, defaultTimeoutMs: number): RecoveryCommand {
    if (typeof raw === 'string') {
      return {
        command: this.interpolate(raw),
        timeoutMs: defaultTimeoutMs,
        required: true,
      };
    }
    return {
      command: this.interpolate(raw.command),
      timeoutMs: raw.timeoutMs ?? defaultTimeoutMs,
      required: raw.required ?? true,
    };
  }

  /**
   * Interpolate ${VAR} placeholders in a command string.
   * Uses the variables map (env vars + explicit overrides).
   * Leaves unresolved variables as-is (does not fail).
   */
  private interpolate(template: string): string {
    return template.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
      return this.variables[varName] ?? _match;
    });
  }
}

// ============================================================================
// Raw YAML Types (internal, not exported)
// ============================================================================

interface RawPlaybookYaml {
  version?: string;
  defaults?: {
    timeoutMs?: number;
    maxRetries?: number;
    backoffMs?: number[];
  };
  services?: Record<string, RawServiceYaml>;
}

interface RawServiceYaml {
  description?: string;
  healthCheck: RawCommandYaml | string;
  recover: (RawCommandYaml | string)[] | RawCommandYaml | string;
  verify: RawCommandYaml | string;
  maxRetries?: number;
  backoffMs?: number[];
}

interface RawCommandYaml {
  command: string;
  timeoutMs?: number;
  required?: boolean;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory function for creating a RecoveryPlaybook.
 */
export function createRecoveryPlaybook(
  variables?: Record<string, string>
): RecoveryPlaybook {
  return new RecoveryPlaybook(variables);
}
