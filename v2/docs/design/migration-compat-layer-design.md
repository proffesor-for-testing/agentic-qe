# V2-to-V3 Agent Migration Compatibility Layer Design

**Document Version:** 1.0.0
**Created:** 2026-01-17
**Status:** Design Phase
**Related ADR:** [ADR-048](../../v3/implementation/adrs/ADR-048-v2-v3-agent-migration.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Module Architecture](#module-architecture)
3. [Type Definitions](#type-definitions)
4. [Core Interfaces](#core-interfaces)
5. [Implementation Patterns](#implementation-patterns)
6. [Integration Points](#integration-points)
7. [Error Handling](#error-handling)
8. [Testing Strategy](#testing-strategy)

---

## Overview

### Purpose

This compatibility layer provides zero-breaking-changes migration from v2 to v3 by:
- Transparently resolving v2 agent names to v3 equivalents
- Emitting deprecation warnings when v2 agents are used
- Providing migration utilities for automated upgrade paths
- Supporting both formats during the transition period

### Design Principles

1. **Transparency**: Users can use v2 names without code changes
2. **Progressive Enhancement**: Gradual migration with clear deprecation paths
3. **Type Safety**: Full TypeScript support with compile-time checks
4. **Performance**: O(1) lookups via Map-based resolution
5. **Observability**: Comprehensive logging and metrics for migration tracking

---

## Module Architecture

### File Structure

```
v3/src/migration/
├── agent-compat.ts           # Main compatibility layer (NEW)
├── types.ts                  # Type definitions
├── deprecation-logger.ts     # Centralized warning system (NEW)
├── migration-reporter.ts     # Migration progress tracking (NEW)
└── __tests__/
    ├── agent-compat.test.ts
    └── integration.test.ts
```

### Module Dependencies

```typescript
// External dependencies
import { DomainName, AgentType } from '../shared/types';
import { Logger } from '../shared/logging';
import { EventBus } from '../kernel/interfaces';

// Internal dependencies
import { AgentMapping, V2CompatConfig } from './types';
import { DeprecationLogger } from './deprecation-logger';
```

### Dependency Graph

```
┌─────────────────────────┐
│   AgentCompatLayer      │
│   (agent-compat.ts)     │
└───────────┬─────────────┘
            │
            ├──────────────────────────────┐
            │                              │
            ▼                              ▼
┌─────────────────────┐      ┌─────────────────────┐
│ DeprecationLogger   │      │ MigrationReporter   │
└─────────────────────┘      └─────────────────────┘
            │                              │
            └──────────────┬───────────────┘
                           ▼
                  ┌─────────────────┐
                  │   EventBus      │
                  └─────────────────┘
```

---

## Type Definitions

### Core Types

```typescript
/**
 * V2 to V3 agent mapping configuration
 */
export interface AgentMapping {
  /** V2 agent name (e.g., 'qe-test-generator') */
  readonly v2Name: string;

  /** V3 agent name (e.g., 'qe-test-architect') */
  readonly v3Name: string;

  /** Domain the agent belongs to */
  readonly domain: DomainName;

  /** Whether the v2 name is deprecated */
  readonly deprecated: boolean;

  /** Version when deprecated */
  readonly deprecatedIn?: string;

  /** Version when v2 support will be removed */
  readonly removedIn?: string;

  /** Migration notes */
  readonly notes?: string;

  /** Mapping type for special handling */
  readonly mappingType: MappingType;
}

/**
 * Types of agent mappings
 */
export enum MappingType {
  /** Direct 1:1 upgrade (same name) */
  DIRECT = 'direct',

  /** Renamed agent (v2_compat required) */
  RENAMED = 'renamed',

  /** New v3-only agent (no v2 equivalent) */
  NEW = 'new',

  /** Consolidated (multiple v2 → single v3) */
  CONSOLIDATED = 'consolidated',

  /** Split (single v2 → multiple v3) */
  SPLIT = 'split',
}

/**
 * Agent name resolution result
 */
export interface AgentResolution {
  /** Whether resolution was successful */
  readonly success: boolean;

  /** Resolved v3 agent name */
  readonly v3Name: string | null;

  /** Original name provided */
  readonly originalName: string;

  /** Whether input was a v2 agent name */
  readonly wasV2: boolean;

  /** Domain the agent belongs to */
  readonly domain: DomainName | null;

  /** Deprecation warning message */
  readonly warning?: DeprecationWarning;

  /** Migration path suggestions */
  readonly migrationPath?: MigrationPath;
}

/**
 * Deprecation warning details
 */
export interface DeprecationWarning {
  /** Warning severity */
  readonly level: 'info' | 'warning' | 'error';

  /** Human-readable warning message */
  readonly message: string;

  /** Version when feature was deprecated */
  readonly deprecatedIn: string;

  /** Version when feature will be removed */
  readonly removedIn: string;

  /** Documentation link */
  readonly docsUrl?: string;

  /** Auto-fix available */
  readonly canAutoFix: boolean;
}

/**
 * Migration path recommendation
 */
export interface MigrationPath {
  /** Current agent name (v2) */
  readonly from: string;

  /** Target agent name (v3) */
  readonly to: string;

  /** Step-by-step migration instructions */
  readonly steps: MigrationStep[];

  /** Estimated migration effort */
  readonly effort: 'low' | 'medium' | 'high';

  /** Breaking changes */
  readonly breakingChanges: string[];
}

export interface MigrationStep {
  readonly order: number;
  readonly description: string;
  readonly automated: boolean;
  readonly command?: string;
}

/**
 * Compatibility layer configuration
 */
export interface V2CompatConfig {
  /** Enable v2 compatibility layer */
  readonly enabled: boolean;

  /** Show deprecation warnings */
  readonly showWarnings: boolean;

  /** Fail on v2 usage in strict mode */
  readonly strictMode: boolean;

  /** Auto-migrate v2 names to v3 */
  readonly autoMigrate: boolean;

  /** Log all v2 agent usage for migration tracking */
  readonly trackUsage: boolean;

  /** Custom deprecation warning handler */
  readonly onDeprecation?: (warning: DeprecationWarning) => void;
}
```

---

## Core Interfaces

### AgentCompatLayer Interface

```typescript
/**
 * Agent Compatibility Layer
 * Provides v2 to v3 agent name resolution and migration utilities
 */
export interface IAgentCompatLayer {
  /**
   * Resolve an agent name (v2 or v3) to v3 format
   * @param agentName - Agent name to resolve
   * @returns Resolution result with v3 name and metadata
   */
  resolve(agentName: string): AgentResolution;

  /**
   * Batch resolve multiple agent names
   * @param agentNames - Array of agent names
   * @returns Array of resolution results
   */
  resolveBatch(agentNames: string[]): AgentResolution[];

  /**
   * Check if an agent name is v2 format
   * @param agentName - Agent name to check
   */
  isV2Agent(agentName: string): boolean;

  /**
   * Get v2 name for a v3 agent (reverse lookup)
   * @param v3Name - V3 agent name
   * @returns V2 name or null if not found
   */
  getV2Name(v3Name: string): string | null;

  /**
   * Get all agent mappings
   */
  getAllMappings(): ReadonlyArray<AgentMapping>;

  /**
   * Get mappings filtered by domain
   * @param domain - Domain to filter by
   */
  getMappingsByDomain(domain: DomainName): ReadonlyArray<AgentMapping>;

  /**
   * Get mappings filtered by type
   * @param type - Mapping type to filter by
   */
  getMappingsByType(type: MappingType): ReadonlyArray<AgentMapping>;

  /**
   * Generate migration report for a set of agents
   * @param usedAgents - Array of agent names currently in use
   * @returns Migration report with actionable recommendations
   */
  generateMigrationReport(usedAgents: string[]): MigrationReport;

  /**
   * Get migration path for a specific v2 agent
   * @param v2Name - V2 agent name
   */
  getMigrationPath(v2Name: string): MigrationPath | null;

  /**
   * Get usage statistics for migration tracking
   */
  getUsageStats(): UsageStats;

  /**
   * Clear usage statistics
   */
  clearUsageStats(): void;
}

/**
 * Migration report structure
 */
export interface MigrationReport {
  /** Total agents analyzed */
  readonly total: number;

  /** Agents requiring migration */
  readonly needsMigration: MigrationItem[];

  /** Already using v3 format */
  readonly alreadyV3: string[];

  /** Unknown agents (not in mapping) */
  readonly unknown: string[];

  /** Summary statistics */
  readonly summary: {
    readonly v2Count: number;
    readonly v3Count: number;
    readonly unknownCount: number;
    readonly migrationProgress: number; // 0-100%
  };

  /** Recommended migration order */
  readonly recommendedOrder: string[];
}

export interface MigrationItem {
  readonly v2Name: string;
  readonly v3Name: string;
  readonly domain: DomainName;
  readonly priority: 'high' | 'medium' | 'low';
  readonly effort: 'low' | 'medium' | 'high';
  readonly breakingChanges: boolean;
}

/**
 * Usage statistics for v2 agent tracking
 */
export interface UsageStats {
  /** Total resolutions performed */
  readonly totalResolutions: number;

  /** V2 agent usage count by name */
  readonly v2Usage: Map<string, number>;

  /** V3 agent usage count by name */
  readonly v3Usage: Map<string, number>;

  /** Failed resolutions (unknown agents) */
  readonly failures: number;

  /** First seen timestamp */
  readonly startedAt: Date;

  /** Last activity timestamp */
  readonly lastActivityAt: Date;
}
```

---

## Implementation Patterns

### 1. Agent Name Resolution

```typescript
/**
 * Core resolution algorithm
 */
class AgentCompatLayer implements IAgentCompatLayer {
  private readonly mappings: Map<string, AgentMapping>;
  private readonly v3ToV2: Map<string, string>;
  private readonly stats: UsageStats;
  private readonly logger: DeprecationLogger;

  constructor(
    mappings: AgentMapping[],
    config: V2CompatConfig,
    logger: DeprecationLogger
  ) {
    this.mappings = new Map();
    this.v3ToV2 = new Map();
    this.config = config;
    this.logger = logger;
    this.stats = this.initializeStats();

    // Build lookup maps
    this.buildMappingIndex(mappings);
  }

  resolve(agentName: string): AgentResolution {
    const normalized = this.normalizeAgentName(agentName);

    // Track resolution attempt
    this.trackResolution(normalized);

    // Fast path: Already v3 format
    if (this.isV3Format(normalized)) {
      return this.resolveV3Agent(normalized, agentName);
    }

    // Slow path: V2 format lookup
    const mapping = this.mappings.get(normalized);
    if (mapping) {
      return this.resolveV2Agent(mapping, agentName);
    }

    // Unknown agent
    return this.resolveUnknown(agentName);
  }

  private resolveV3Agent(
    normalized: string,
    originalName: string
  ): AgentResolution {
    const domain = this.getDomainForV3Agent(normalized);

    return {
      success: true,
      v3Name: originalName,
      originalName,
      wasV2: false,
      domain,
    };
  }

  private resolveV2Agent(
    mapping: AgentMapping,
    originalName: string
  ): AgentResolution {
    // Track v2 usage
    this.trackV2Usage(mapping.v2Name);

    // Emit deprecation warning
    const warning = this.createDeprecationWarning(mapping);
    this.logger.warn(warning);

    // Generate migration path
    const migrationPath = this.generateMigrationPath(mapping);

    return {
      success: true,
      v3Name: mapping.v3Name,
      originalName,
      wasV2: true,
      domain: mapping.domain,
      warning,
      migrationPath,
    };
  }

  private resolveUnknown(originalName: string): AgentResolution {
    this.trackFailure();

    return {
      success: false,
      v3Name: null,
      originalName,
      wasV2: false,
      domain: null,
    };
  }
}
```

### 2. Deprecation Warning System

```typescript
/**
 * Centralized deprecation warning handler
 */
export class DeprecationLogger {
  private readonly warnings: Map<string, DeprecationWarning>;
  private readonly eventBus: EventBus;
  private readonly config: V2CompatConfig;

  constructor(eventBus: EventBus, config: V2CompatConfig) {
    this.warnings = new Map();
    this.eventBus = eventBus;
    this.config = config;
  }

  warn(warning: DeprecationWarning): void {
    // Deduplicate warnings
    const key = this.getWarningKey(warning);
    if (this.warnings.has(key)) {
      return;
    }

    this.warnings.set(key, warning);

    // Emit warning based on config
    if (this.config.showWarnings) {
      this.emitWarning(warning);
    }

    // Publish event for tracking
    this.publishWarningEvent(warning);

    // Strict mode: throw on deprecation
    if (this.config.strictMode && warning.level === 'error') {
      throw new Error(warning.message);
    }
  }

  private emitWarning(warning: DeprecationWarning): void {
    const color = this.getColorForLevel(warning.level);
    console.warn(
      `${color}[DEPRECATED]${RESET} ${warning.message}\n` +
      `  Deprecated in: v${warning.deprecatedIn}\n` +
      `  Removed in: v${warning.removedIn}\n` +
      (warning.docsUrl ? `  Docs: ${warning.docsUrl}\n` : '')
    );
  }

  private publishWarningEvent(warning: DeprecationWarning): void {
    this.eventBus.publish({
      type: 'migration.DeprecationWarning',
      source: 'coordination',
      timestamp: new Date(),
      payload: warning,
    });
  }

  getWarnings(): ReadonlyArray<DeprecationWarning> {
    return Array.from(this.warnings.values());
  }

  clearWarnings(): void {
    this.warnings.clear();
  }
}
```

### 3. Migration Report Generator

```typescript
/**
 * Generate comprehensive migration reports
 */
class MigrationReporter {
  constructor(private readonly compatLayer: IAgentCompatLayer) {}

  generateReport(usedAgents: string[]): MigrationReport {
    const resolutions = this.compatLayer.resolveBatch(usedAgents);

    const needsMigration: MigrationItem[] = [];
    const alreadyV3: string[] = [];
    const unknown: string[] = [];

    for (const resolution of resolutions) {
      if (!resolution.success) {
        unknown.push(resolution.originalName);
      } else if (resolution.wasV2) {
        needsMigration.push(this.createMigrationItem(resolution));
      } else {
        alreadyV3.push(resolution.originalName);
      }
    }

    // Sort by priority
    needsMigration.sort((a, b) =>
      this.comparePriority(a.priority, b.priority)
    );

    const summary = {
      v2Count: needsMigration.length,
      v3Count: alreadyV3.length,
      unknownCount: unknown.length,
      migrationProgress: this.calculateProgress(
        alreadyV3.length,
        usedAgents.length
      ),
    };

    return {
      total: usedAgents.length,
      needsMigration,
      alreadyV3,
      unknown,
      summary,
      recommendedOrder: this.generateMigrationOrder(needsMigration),
    };
  }

  private createMigrationItem(
    resolution: AgentResolution
  ): MigrationItem {
    const priority = this.calculatePriority(resolution);
    const effort = resolution.migrationPath?.effort ?? 'medium';
    const breakingChanges =
      (resolution.migrationPath?.breakingChanges.length ?? 0) > 0;

    return {
      v2Name: resolution.originalName,
      v3Name: resolution.v3Name!,
      domain: resolution.domain!,
      priority,
      effort,
      breakingChanges,
    };
  }

  private calculatePriority(
    resolution: AgentResolution
  ): 'high' | 'medium' | 'low' {
    const warning = resolution.warning;
    if (!warning) return 'low';

    // High priority if removal is soon
    if (warning.removedIn === '4.0.0') return 'high';
    if (warning.level === 'error') return 'high';

    // Medium priority for breaking changes
    if (resolution.migrationPath?.breakingChanges.length ?? 0 > 0) {
      return 'medium';
    }

    return 'low';
  }

  private generateMigrationOrder(items: MigrationItem[]): string[] {
    // Dependency-aware ordering
    // 1. High priority first
    // 2. Low effort before high effort
    // 3. Non-breaking before breaking

    return items
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return this.comparePriority(a.priority, b.priority);
        }
        if (a.breakingChanges !== b.breakingChanges) {
          return a.breakingChanges ? 1 : -1;
        }
        return this.compareEffort(a.effort, b.effort);
      })
      .map(item => item.v2Name);
  }
}
```

---

## Integration Points

### 1. Plugin Loader Integration

```typescript
// v3/src/kernel/plugin-loader.ts

import { AgentCompatLayer } from '../migration/agent-compat';

export class DefaultPluginLoader implements PluginLoader {
  private compatLayer: IAgentCompatLayer;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    compatLayer: IAgentCompatLayer
  ) {
    this.eventBus = eventBus;
    this.memory = memory;
    this.compatLayer = compatLayer;
  }

  async load(domain: DomainName | string): Promise<DomainPlugin> {
    // Resolve domain name through compat layer
    const resolution = this.compatLayer.resolve(domain);

    if (!resolution.success) {
      throw new Error(`Unknown domain: ${domain}`);
    }

    // Extract domain from v3 agent name
    const resolvedDomain = resolution.domain;
    if (!resolvedDomain) {
      throw new Error(`Cannot determine domain for: ${domain}`);
    }

    // Continue with standard loading
    return this.loadPlugin(resolvedDomain);
  }
}
```

### 2. Agent Coordinator Integration

```typescript
// v3/src/kernel/agent-coordinator.ts

export class DefaultAgentCoordinator implements AgentCoordinator {
  constructor(
    private readonly compatLayer: IAgentCompatLayer
  ) {}

  async spawn(config: AgentSpawnConfig): Promise<Result<string, Error>> {
    // Resolve agent name
    const resolution = this.compatLayer.resolve(config.name);

    if (!resolution.success) {
      return err(new Error(`Unknown agent: ${config.name}`));
    }

    // Use resolved v3 name
    const resolvedConfig = {
      ...config,
      name: resolution.v3Name!,
      domain: resolution.domain!,
    };

    return this.spawnInternal(resolvedConfig);
  }
}
```

### 3. MCP Server Integration

```typescript
// v3/src/mcp/handlers/agent-handlers.ts

export function createAgentHandlers(
  coordinator: AgentCoordinator,
  compatLayer: IAgentCompatLayer
) {
  return {
    async 'agent.spawn'(params: unknown): Promise<unknown> {
      const { agentName, ...rest } = params as { agentName: string };

      // Resolve agent name
      const resolution = compatLayer.resolve(agentName);

      if (!resolution.success) {
        throw new Error(`Unknown agent: ${agentName}`);
      }

      // Spawn with resolved name
      const result = await coordinator.spawn({
        name: resolution.v3Name!,
        domain: resolution.domain!,
        ...rest,
      });

      return {
        ...result,
        migration: resolution.wasV2 ? {
          usedV2Name: agentName,
          resolvedV3Name: resolution.v3Name,
          warning: resolution.warning,
        } : undefined,
      };
    },

    async 'agent.migrate-check'(params: { agents: string[] }): Promise<unknown> {
      const report = compatLayer.generateMigrationReport(params.agents);
      return report;
    },
  };
}
```

---

## Error Handling

### Error Types

```typescript
export class AgentResolutionError extends Error {
  constructor(
    public readonly agentName: string,
    public readonly reason: string
  ) {
    super(`Failed to resolve agent "${agentName}": ${reason}`);
    this.name = 'AgentResolutionError';
  }
}

export class DeprecationError extends Error {
  constructor(
    public readonly warning: DeprecationWarning
  ) {
    super(warning.message);
    this.name = 'DeprecationError';
  }
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly migrationItem: MigrationItem
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}
```

### Error Handling Strategy

1. **Graceful Degradation**: Unknown agents return `success: false` instead of throwing
2. **Strict Mode**: Optional throwing on deprecation warnings
3. **Logging**: All errors logged to EventBus for observability
4. **Recovery**: Automatic retry with v3 name on resolution failure

---

## Testing Strategy

### Unit Tests

```typescript
// v3/src/migration/__tests__/agent-compat.test.ts

describe('AgentCompatLayer', () => {
  describe('resolve', () => {
    it('should resolve v2 agent names to v3', () => {
      const resolution = compatLayer.resolve('qe-test-generator');

      expect(resolution.success).toBe(true);
      expect(resolution.v3Name).toBe('qe-test-architect');
      expect(resolution.wasV2).toBe(true);
      expect(resolution.domain).toBe('test-generation');
      expect(resolution.warning).toBeDefined();
    });

    it('should pass through v3 agent names unchanged', () => {
      const resolution = compatLayer.resolve('qe-test-architect');

      expect(resolution.success).toBe(true);
      expect(resolution.v3Name).toBe('qe-test-architect');
      expect(resolution.wasV2).toBe(false);
      expect(resolution.warning).toBeUndefined();
    });

    it('should handle unknown agents gracefully', () => {
      const resolution = compatLayer.resolve('unknown-agent');

      expect(resolution.success).toBe(false);
      expect(resolution.v3Name).toBe(null);
    });
  });

  describe('generateMigrationReport', () => {
    it('should categorize agents correctly', () => {
      const report = compatLayer.generateMigrationReport([
        'qe-test-generator',    // v2
        'qe-test-architect',     // v3
        'unknown-agent',         // unknown
      ]);

      expect(report.summary.v2Count).toBe(1);
      expect(report.summary.v3Count).toBe(1);
      expect(report.summary.unknownCount).toBe(1);
      expect(report.summary.migrationProgress).toBe(50); // 1/2 = 50%
    });
  });
});
```

### Integration Tests

```typescript
// v3/src/migration/__tests__/integration.test.ts

describe('Agent Migration Integration', () => {
  it('should resolve v2 agents through plugin loader', async () => {
    const plugin = await pluginLoader.load('qe-test-generator');
    expect(plugin.name).toBe('test-generation');
  });

  it('should spawn agents with v2 names', async () => {
    const result = await coordinator.spawn({
      name: 'qe-test-generator',
      domain: 'test-generation',
      type: 'generator',
    });

    expect(result.success).toBe(true);
  });
});
```

---

## Performance Considerations

### Optimization Strategies

1. **Map-Based Lookups**: O(1) resolution time
2. **Lazy Loading**: Mappings loaded once at initialization
3. **Warning Deduplication**: Prevent repeated warnings for same agent
4. **Stats Batching**: Aggregate usage stats for efficient memory usage

### Memory Footprint

- **Mapping Storage**: ~48 mappings × 200 bytes = ~10 KB
- **Usage Stats**: Map with TTL-based cleanup
- **Warning Cache**: Limited to 100 most recent warnings

---

## Migration Timeline

### Phase 1: Implementation (Week 1)
- [ ] Implement `AgentCompatLayer` class
- [ ] Implement `DeprecationLogger` class
- [ ] Implement `MigrationReporter` class
- [ ] Add unit tests

### Phase 2: Integration (Week 2)
- [ ] Integrate with `PluginLoader`
- [ ] Integrate with `AgentCoordinator`
- [ ] Integrate with MCP server
- [ ] Add integration tests

### Phase 3: Documentation (Week 3)
- [ ] Update migration guide
- [ ] Add API documentation
- [ ] Create migration runbook

### Phase 4: Release (Week 4)
- [ ] Alpha release with compatibility layer
- [ ] Collect feedback
- [ ] Iterate based on user testing

---

## Related Documents

- [ADR-048: V2-to-V3 Agent Migration](../../v3/implementation/adrs/ADR-048-v2-v3-agent-migration.md)
- [Migration Plan](../../docs/plans/AQE-V2-V3-MIGRATION-PLAN.md)
- [Migration Skill](../../.claude/skills/aqe-v2-v3-migration/skill.md)

---

**End of Design Document**
