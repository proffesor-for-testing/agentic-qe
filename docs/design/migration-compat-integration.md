# Migration Compatibility Layer Integration Guide

**Version:** 1.0.0
**Date:** 2026-01-17
**Related:** [Design Document](migration-compat-layer-design.md)

---

## Overview

This document details how the migration compatibility layer integrates with existing v3 architecture components.

---

## Integration Points

### 1. Kernel Integration

#### Plugin Loader Integration

**File:** `v3/src/kernel/plugin-loader.ts`

**Changes Required:**

```typescript
import { IAgentCompatLayer } from '../migration/agent-compat';

export class DefaultPluginLoader implements PluginLoader {
  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly compatLayer: IAgentCompatLayer  // NEW
  ) {}

  async load(domain: DomainName | string): Promise<DomainPlugin> {
    // NEW: Resolve domain name through compat layer
    const resolution = this.compatLayer.resolve(domain);

    if (!resolution.success) {
      throw new Error(`Unknown domain: ${domain}`);
    }

    // Extract resolved domain
    const resolvedDomain = resolution.domain;
    if (!resolvedDomain) {
      throw new Error(`Cannot determine domain for: ${domain}`);
    }

    // Continue with standard loading
    return this.loadPlugin(resolvedDomain);
  }
}
```

**Impact:**
- **Breaking Change:** No (backward compatible)
- **Performance:** O(1) map lookup added
- **Testing:** Add tests for v2 domain resolution

---

#### Agent Coordinator Integration

**File:** `v3/src/kernel/agent-coordinator.ts`

**Changes Required:**

```typescript
import { IAgentCompatLayer } from '../migration/agent-compat';

export class DefaultAgentCoordinator implements AgentCoordinator {
  constructor(
    private readonly compatLayer: IAgentCompatLayer,  // NEW
    maxAgents: number = MAX_CONCURRENT_AGENTS
  ) {
    this.maxAgents = maxAgents;
  }

  async spawn(config: AgentSpawnConfig): Promise<Result<string, Error>> {
    // NEW: Resolve agent name before spawning
    const resolution = this.compatLayer.resolve(config.name);

    if (!resolution.success) {
      return err(new Error(`Unknown agent: ${config.name}`));
    }

    // Check agent limit
    if (!this.canSpawn()) {
      return err(
        new Error(
          `Cannot spawn agent: maximum concurrent agents (${this.maxAgents}) reached`
        )
      );
    }

    // Use resolved v3 name
    const resolvedConfig = {
      ...config,
      name: resolution.v3Name!,
      domain: resolution.domain!,
    };

    const id = uuidv4();
    const agent: ManagedAgent = {
      id,
      name: resolvedConfig.name,
      domain: resolvedConfig.domain,
      type: resolvedConfig.type,
      status: 'running',
      capabilities: resolvedConfig.capabilities,
      config: resolvedConfig.config ?? {},
      startedAt: new Date(),
    };

    this.agents.set(id, agent);

    // NEW: Track v2 usage if applicable
    if (resolution.wasV2 && resolution.warning) {
      this.trackV2Usage(config.name, resolution);
    }

    return ok(id);
  }

  private trackV2Usage(
    v2Name: string,
    resolution: AgentResolution
  ): void {
    // Emit event for monitoring
    this.eventBus?.publish({
      type: 'migration.V2AgentUsed',
      source: 'coordination',
      timestamp: new Date(),
      payload: {
        v2Name,
        v3Name: resolution.v3Name,
        domain: resolution.domain,
        warning: resolution.warning,
      },
    });
  }
}
```

**Impact:**
- **Breaking Change:** No
- **Performance:** Minimal overhead
- **Monitoring:** New events for v2 usage tracking

---

### 2. MCP Server Integration

#### Agent Handlers

**File:** `v3/src/mcp/handlers/agent-handlers.ts`

**New Handler Functions:**

```typescript
import { IAgentCompatLayer } from '../../migration/agent-compat';

/**
 * Create agent-related MCP handlers with migration support
 */
export function createAgentHandlers(
  coordinator: AgentCoordinator,
  compatLayer: IAgentCompatLayer
) {
  return {
    /**
     * Spawn agent with automatic v2 resolution
     */
    async 'agent.spawn'(params: unknown): Promise<unknown> {
      const { agentName, domain, type, capabilities, config } = params as {
        agentName: string;
        domain?: DomainName;
        type: AgentType;
        capabilities: string[];
        config?: Record<string, unknown>;
      };

      // Resolve agent name
      const resolution = compatLayer.resolve(agentName);

      if (!resolution.success) {
        throw new Error(`Unknown agent: ${agentName}`);
      }

      // Spawn with resolved name
      const result = await coordinator.spawn({
        name: resolution.v3Name!,
        domain: resolution.domain ?? domain!,
        type,
        capabilities,
        config,
      });

      if (!result.success) {
        throw result.error;
      }

      return {
        agentId: result.value,
        resolvedName: resolution.v3Name,
        migration: resolution.wasV2 ? {
          usedV2Name: agentName,
          resolvedV3Name: resolution.v3Name,
          warning: resolution.warning,
          migrationPath: resolution.migrationPath,
        } : undefined,
      };
    },

    /**
     * Check migration status for agents
     */
    async 'agent.migration-check'(params: {
      agents: string[];
    }): Promise<unknown> {
      const report = compatLayer.generateMigrationReport(params.agents);
      return report;
    },

    /**
     * Get migration path for specific agent
     */
    async 'agent.migration-path'(params: {
      agentName: string;
    }): Promise<unknown> {
      const path = compatLayer.getMigrationPath(params.agentName);
      if (!path) {
        throw new Error(`No migration path found for: ${params.agentName}`);
      }
      return path;
    },

    /**
     * Get usage statistics
     */
    async 'agent.usage-stats'(): Promise<unknown> {
      return compatLayer.getUsageStats();
    },

    /**
     * Export migration data
     */
    async 'agent.export-migration-data'(): Promise<unknown> {
      return compatLayer.exportUsageData();
    },
  };
}
```

**Impact:**
- **New MCP Tools:** 4 new agent migration tools
- **Backward Compatible:** Yes (existing tools unchanged)
- **Testing:** Integration tests for MCP tools

---

### 3. Domain Plugin Integration

#### Plugin Factory Pattern

**Example:** `v3/src/domains/test-generation/plugin.ts`

**No changes required in plugins themselves!**

The compatibility layer is transparent to domain plugins. They receive resolved v3 names from the coordinator.

**Optional Enhancement:**

```typescript
export class TestGenerationPlugin extends BaseDomainPlugin {
  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    agentCoordinator: AgentCoordinator,
    private readonly compatLayer?: IAgentCompatLayer,  // OPTIONAL
    config: TestGenerationPluginConfig = {}
  ) {
    super(eventBus, memory);
    this.agentCoordinator = agentCoordinator;
    this.pluginConfig = config;
  }

  // Plugins can optionally use compat layer for internal lookups
  private resolveInternalAgent(name: string): string {
    if (this.compatLayer) {
      const resolution = this.compatLayer.resolve(name);
      return resolution.v3Name ?? name;
    }
    return name;
  }
}
```

---

### 4. Coordination Layer Integration

#### Cross-Domain Router

**File:** `v3/src/coordination/cross-domain-router.ts`

**Changes Required:**

```typescript
import { IAgentCompatLayer } from '../migration/agent-compat';

export class CrossDomainRouter {
  constructor(
    private readonly pluginLoader: PluginLoader,
    private readonly compatLayer: IAgentCompatLayer  // NEW
  ) {}

  async route(task: Task): Promise<DomainName> {
    // Resolve agent name from task metadata
    const agentHint = task.metadata?.preferredAgent as string | undefined;

    if (agentHint) {
      const resolution = this.compatLayer.resolve(agentHint);
      if (resolution.success && resolution.domain) {
        return resolution.domain;
      }
    }

    // Continue with standard routing logic
    return this.routeByTaskType(task);
  }
}
```

---

### 5. Event Bus Integration

#### Migration Events

**New Event Types:**

```typescript
// v3/src/shared/events/domain-events.ts

export interface MigrationEvents {
  /**
   * Emitted when a v2 agent name is used
   */
  'migration.V2AgentUsed': {
    readonly v2Name: string;
    readonly v3Name: string;
    readonly domain: DomainName;
    readonly warning: DeprecationWarning;
  };

  /**
   * Emitted when a deprecation warning is issued
   */
  'migration.DeprecationWarning': {
    readonly warning: DeprecationWarning;
  };

  /**
   * Emitted when migration report is generated
   */
  'migration.ReportGenerated': {
    readonly report: MigrationReport;
    readonly timestamp: Date;
  };

  /**
   * Emitted when usage stats are exported
   */
  'migration.UsageStatsExported': {
    readonly stats: UsageStats;
    readonly exportPath?: string;
  };
}
```

**Event Subscribers:**

```typescript
// Example: Log v2 usage to analytics
eventBus.subscribe(
  'migration.V2AgentUsed',
  async (event) => {
    const { v2Name, v3Name, domain } = event.payload;

    // Log to analytics
    await analytics.track('v2_agent_usage', {
      v2Name,
      v3Name,
      domain,
      timestamp: event.timestamp,
    });

    // Store in memory for reporting
    await memory.set(
      `migration:v2-usage:${v2Name}`,
      { count: ((await memory.get(`migration:v2-usage:${v2Name}`))?.count ?? 0) + 1 },
      { namespace: 'migration', ttl: 2592000 } // 30 days
    );
  }
);
```

---

### 6. Memory Backend Integration

#### Migration Data Storage

**Namespace:** `migration`

**Stored Data:**

```typescript
// Usage tracking
'migration:v2-usage:<agent-name>': {
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

// Deprecation warnings
'migration:warnings:<agent-name>': DeprecationWarning

// Migration reports
'migration:reports:<timestamp>': MigrationReport

// Usage statistics snapshots
'migration:stats:snapshot': UsageStats
```

**TTL Configuration:**

- V2 usage data: 30 days
- Warnings: 7 days
- Reports: 90 days
- Stats snapshots: 24 hours

---

### 7. Configuration Integration

#### V3 Config File

**File:** `agentic-qe.config.json`

**New Section:**

```json
{
  "v3": {
    "version": "3.0.0",
    "migration": {
      "enabled": true,
      "showWarnings": true,
      "strictMode": false,
      "autoMigrate": false,
      "trackUsage": true,
      "warningThreshold": "warning",
      "maxWarnings": 100,
      "statsTTL": 2592000,
      "enabledDomains": null
    }
  }
}
```

**Config Loading:**

```typescript
// v3/src/config/loader.ts

export function loadMigrationConfig(): V2CompatConfig {
  const config = loadV3Config();

  return {
    enabled: config.migration?.enabled ?? true,
    showWarnings: config.migration?.showWarnings ?? true,
    strictMode: config.migration?.strictMode ?? false,
    autoMigrate: config.migration?.autoMigrate ?? false,
    trackUsage: config.migration?.trackUsage ?? true,
    warningThreshold: config.migration?.warningThreshold ?? 'warning',
    maxWarnings: config.migration?.maxWarnings ?? 100,
    statsTTL: config.migration?.statsTTL ?? 2592000,
    enabledDomains: config.migration?.enabledDomains ?? null,
  };
}
```

---

### 8. CLI Integration

#### New CLI Commands

**File:** `v3/src/cli/commands/migrate.ts`

```typescript
/**
 * Migration-related CLI commands
 */
export const migrateCommands = {
  /**
   * Check migration status
   */
  'migrate:check': async (usedAgents?: string[]) => {
    const agents = usedAgents ?? await detectUsedAgents();
    const report = compatLayer.generateMigrationReport(agents);

    console.log(chalk.bold('\n📊 Migration Status Report\n'));
    console.log(formatMigrationReport(report));
  },

  /**
   * Show migration path for specific agent
   */
  'migrate:path': async (agentName: string) => {
    const path = compatLayer.getMigrationPath(agentName);

    if (!path) {
      console.error(chalk.red(`No migration path found for: ${agentName}`));
      process.exit(1);
    }

    console.log(formatMigrationPath(path));
  },

  /**
   * Show usage statistics
   */
  'migrate:stats': async () => {
    const stats = compatLayer.getUsageStats();
    console.log(formatUsageStats(stats));
  },

  /**
   * Export migration data
   */
  'migrate:export': async (outputPath: string) => {
    const data = compatLayer.exportUsageData();
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    console.log(chalk.green(`✅ Exported to: ${outputPath}`));
  },
};
```

---

## Data Flow Diagram

```
┌─────────────────┐
│   User Request  │
│  (v2 or v3 name)│
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  AgentCompatLayer       │
│  - resolve()            │
│  - track usage          │
└────────┬────────────────┘
         │
         ├──────────────────────────────┐
         │                              │
         ▼                              ▼
┌─────────────────┐      ┌─────────────────────┐
│ DeprecationLogger│      │  UsageStats         │
│ - emit warning   │      │  - track v2 usage   │
└─────────────────┘      └─────────────────────┘
         │                              │
         └──────────────┬───────────────┘
                        ▼
                ┌─────────────────┐
                │   EventBus      │
                │ - publish events│
                └────────┬────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│ Plugin     │  │ Memory     │  │ Analytics  │
│ Loader     │  │ Backend    │  │ Service    │
└────────────┘  └────────────┘  └────────────┘
         │
         ▼
┌─────────────────────────┐
│   Domain Plugin         │
│   (receives v3 name)    │
└─────────────────────────┘
```

---

## Initialization Sequence

```typescript
// v3/src/index.ts

async function initializeV3() {
  // 1. Load configuration
  const config = loadV3Config();
  const migrationConfig = loadMigrationConfig();

  // 2. Initialize core services
  const eventBus = new EventBus();
  const memory = await createMemoryBackend(config.memory);

  // 3. Initialize migration layer
  const compatLayer = createAgentCompatLayer(
    AGENT_MAPPINGS,
    migrationConfig,
    eventBus
  );

  // 4. Initialize kernel with compat layer
  const agentCoordinator = new DefaultAgentCoordinator(
    compatLayer,
    config.agents.maxConcurrent
  );

  const pluginLoader = new DefaultPluginLoader(
    eventBus,
    memory,
    compatLayer
  );

  // 5. Register domain plugins
  registerDomainPlugins(pluginLoader, agentCoordinator);

  // 6. Initialize MCP server with compat layer
  const mcpServer = createMCPServer(
    agentCoordinator,
    compatLayer,
    config
  );

  // 7. Start services
  await mcpServer.start();

  return {
    eventBus,
    memory,
    compatLayer,
    agentCoordinator,
    pluginLoader,
    mcpServer,
  };
}
```

---

## Testing Integration

### Unit Tests

```typescript
// v3/src/__tests__/integration/migration.test.ts

describe('Migration Integration', () => {
  let kernel: V3Kernel;
  let compatLayer: IAgentCompatLayer;

  beforeEach(async () => {
    kernel = await initializeV3TestKernel();
    compatLayer = kernel.compatLayer;
  });

  it('should resolve v2 agents through coordinator', async () => {
    const result = await kernel.agentCoordinator.spawn({
      name: 'qe-test-generator', // v2 name
      domain: 'test-generation',
      type: 'generator',
      capabilities: ['unit-tests'],
    });

    expect(result.success).toBe(true);
  });

  it('should emit deprecation events', async () => {
    const events: DomainEvent[] = [];
    kernel.eventBus.subscribe('migration.*', (event) => {
      events.push(event);
    });

    await kernel.agentCoordinator.spawn({
      name: 'qe-test-generator',
      domain: 'test-generation',
      type: 'generator',
      capabilities: [],
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'migration.V2AgentUsed',
      })
    );
  });
});
```

---

## Performance Considerations

### Resolution Performance

- **Map Lookup:** O(1) for both v2 → v3 and v3 → v2
- **Batch Resolution:** O(n) where n = number of agents
- **Memory Overhead:** ~10 KB for 48 mappings

### Caching Strategy

- Mappings loaded once at initialization
- Warning deduplication prevents repeated logging
- Stats aggregated with periodic snapshots

### Monitoring

```typescript
// Track resolution performance
eventBus.subscribe('migration.V2AgentUsed', async (event) => {
  metrics.increment('migration.v2_resolution_count');
  metrics.timing('migration.resolution_time', event.metadata?.duration);
});
```

---

## Backward Compatibility Guarantees

1. **All v2 agent names work unchanged**
2. **No breaking changes to existing APIs**
3. **Opt-in strict mode for gradual migration**
4. **Rollback support via configuration**
5. **Gradual deprecation with clear timelines**

---

## Migration Timeline

| Phase | Duration | Actions |
|-------|----------|---------|
| **Alpha** | Week 1-2 | Internal testing, fix integration issues |
| **Beta** | Week 3-4 | Community testing, collect feedback |
| **RC** | Week 5-6 | Final testing, documentation complete |
| **GA** | Week 7+ | Full release with compatibility layer |
| **Deprecation** | +6 months | Increase warning visibility |
| **Removal** | v4.0.0 | Remove v2 support entirely |

---

## Related Documents

- [Design Document](migration-compat-layer-design.md)
- [Interface Definitions](migration-compat-interfaces.ts)
- [ADR-048: V2-to-V3 Agent Migration](../../v3/implementation/adrs/ADR-048-v2-v3-agent-migration.md)

---

**End of Integration Guide**
