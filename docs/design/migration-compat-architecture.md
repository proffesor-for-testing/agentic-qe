# Migration Compatibility Layer Architecture

**Version:** 1.0.0
**Date:** 2026-01-17

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     V3 Kernel Architecture                       │
│                    (with Migration Layer)                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
├─────────────────┬──────────────────┬─────────────────────────────┤
│   MCP Client    │   CLI Client     │   API Client                │
│  (Claude Code)  │  (Terminal)      │   (HTTP/gRPC)               │
└────────┬────────┴────────┬─────────┴────────┬────────────────────┘
         │                 │                  │
         │  v2 or v3 name  │                  │
         │                 │                  │
         ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Agent Handlers (Enhanced)                      │   │
│  │  - agent.spawn (migration-aware)                         │   │
│  │  - agent.migration-check                                 │   │
│  │  - agent.migration-path                                  │   │
│  │  - agent.usage-stats                                     │   │
│  │  - agent.export-migration-data                           │   │
│  └─────────────────────┬────────────────────────────────────┘   │
└────────────────────────┼─────────────────────────────────────────┘
                         │
                         │ Forward to Coordinator
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Migration Compatibility Layer                    │
│                    (NEW - Core Component)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │           AgentCompatLayer                             │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  Dual Map Structure                              │  │    │
│  │  │  - v2ToV3: Map<string, AgentMapping>  [O(1)]     │  │    │
│  │  │  - v3ToV2: Map<string, string>        [O(1)]     │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  │                                                         │    │
│  │  Core Methods:                                          │    │
│  │  - resolve(name) → AgentResolution                      │    │
│  │  - resolveBatch(names[]) → AgentResolution[]            │    │
│  │  - generateMigrationReport() → MigrationReport          │    │
│  │  - getMigrationPath() → MigrationPath                   │    │
│  │  - getUsageStats() → UsageStats                         │    │
│  └────────────┬──────────────────┬─────────────────────────┘    │
│               │                  │                               │
│               │                  │                               │
│  ┌────────────▼────────┐  ┌──────▼───────────────┐              │
│  │ DeprecationLogger   │  │  MigrationReporter   │              │
│  ├─────────────────────┤  ├──────────────────────┤              │
│  │ - warn()            │  │ - generateReport()   │              │
│  │ - getWarnings()     │  │ - formatAsMarkdown() │              │
│  │ - clearWarnings()   │  │ - formatAsJSON()     │              │
│  │ - hasWarning()      │  │ - formatAsCLITable() │              │
│  └──────────┬──────────┘  └──────┬───────────────┘              │
│             │                    │                               │
└─────────────┼────────────────────┼───────────────────────────────┘
              │                    │
              │ publish events     │
              │                    │
              ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EventBus Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  Event Types:                                                    │
│  - migration.V2AgentUsed                                         │
│  - migration.DeprecationWarning                                  │
│  - migration.ReportGenerated                                     │
│  - migration.UsageStatsExported                                  │
└────────┬───────────────────────────────┬────────────────────────┘
         │                               │
         │ subscribe                     │ subscribe
         │                               │
    ┌────▼─────┐                    ┌────▼─────┐
    │ Analytics│                    │  Memory  │
    │ Service  │                    │ Backend  │
    └──────────┘                    └────┬─────┘
                                         │
                                         │ persist
                                         │
                                    ┌────▼─────┐
                                    │ SQLite   │
                                    │  AgentDB │
                                    └──────────┘
         │
         │ resolve & track
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Kernel Layer                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │           AgentCoordinator (Enhanced)                  │    │
│  │  - spawn(config) → resolves name via compat layer      │    │
│  │  - trackV2Usage() → publishes events                   │    │
│  │  - Agent lifecycle management                          │    │
│  │  - Max 15 concurrent agents                            │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │           PluginLoader (Enhanced)                      │    │
│  │  - load(domain) → resolves via compat layer            │    │
│  │  - Dependency resolution                               │    │
│  │  - Lazy loading                                        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         │ load plugin
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Domain Plugins Layer                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │     Test     │  │   Coverage   │  │   Quality    │  ...     │
│  │  Generation  │  │   Analysis   │  │  Assessment  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  All plugins receive resolved v3 names (transparent)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Interaction Flow

### 1. Agent Spawn Flow (v2 Name)

```
User/Client
    │
    │ spawn('qe-test-generator')  [v2 name]
    ▼
MCP Server
    │
    │ forward to coordinator
    ▼
AgentCoordinator
    │
    │ compatLayer.resolve('qe-test-generator')
    ▼
AgentCompatLayer
    │
    ├─► v2ToV3.get('qe-test-generator')  [O(1) lookup]
    │   → Found: { v2Name: 'qe-test-generator', v3Name: 'qe-test-architect', ... }
    │
    ├─► DeprecationLogger.warn(warning)
    │   │
    │   ├─► console.warn(...) [if showWarnings = true]
    │   │
    │   └─► EventBus.publish('migration.V2AgentUsed', {...})
    │
    ├─► UsageStats.trackV2Usage('qe-test-generator')
    │
    └─► return AgentResolution {
            success: true,
            v3Name: 'qe-test-architect',
            wasV2: true,
            domain: 'test-generation',
            warning: DeprecationWarning { ... },
            migrationPath: MigrationPath { ... }
        }
    │
    ▼
AgentCoordinator
    │
    │ spawn with resolved config:
    │ { name: 'qe-test-architect', domain: 'test-generation', ... }
    │
    └─► Create ManagedAgent with v3 name
```

### 2. Migration Report Flow

```
User/Client
    │
    │ migrate:check(['qe-test-generator', 'qe-test-architect', 'unknown'])
    ▼
CLI / MCP Handler
    │
    │ compatLayer.generateMigrationReport(agents)
    ▼
AgentCompatLayer
    │
    │ resolveBatch(agents)
    ├─► resolve('qe-test-generator') → wasV2: true
    ├─► resolve('qe-test-architect') → wasV2: false
    └─► resolve('unknown') → success: false
    │
    ▼
MigrationReporter
    │
    │ categorize resolutions:
    │ - needsMigration: ['qe-test-generator']
    │ - alreadyV3: ['qe-test-architect']
    │ - unknown: ['unknown']
    │
    │ calculate summary:
    │ - v2Count: 1
    │ - v3Count: 1
    │ - unknownCount: 1
    │ - migrationProgress: 50%
    │
    │ generate recommended order (priority-based)
    │
    └─► return MigrationReport { ... }
    │
    ▼
CLI / MCP Handler
    │
    │ formatAsCLITable(report) or formatAsJSON(report)
    │
    └─► Display to user
```

### 3. Deprecation Warning Flow

```
AgentCompatLayer.resolve('qe-test-generator')
    │
    │ v2 agent detected
    ▼
DeprecationLogger.warn(warning)
    │
    ├─► Check if already warned
    │   (deduplication via Map)
    │
    ├─► Store warning
    │   warnings.set(key, warning)
    │
    ├─► Emit to console (if enabled)
    │   console.warn(
    │     "[DEPRECATED] Agent 'qe-test-generator' is deprecated..."
    │   )
    │
    ├─► Publish event
    │   EventBus.publish('migration.DeprecationWarning', {
    │     warning: { ... }
    │   })
    │   │
    │   ├─► Analytics.track('deprecation_warning')
    │   │
    │   └─► Memory.set('migration:warnings:qe-test-generator', warning)
    │
    └─► Strict mode check
        if (strictMode && warning.level === 'error')
            throw new DeprecationError(warning)
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT SOURCES                             │
├─────────────────┬──────────────────┬─────────────────────────────┤
│   MCP Request   │   CLI Command    │   API Call                  │
│  (v2/v3 name)   │  (agent list)    │   (config)                  │
└────────┬────────┴────────┬─────────┴────────┬────────────────────┘
         │                 │                  │
         ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                 AgentCompatLayer (Hub)                           │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Resolution Engine                       │  │
│  │  - v2ToV3 Map (48 mappings)                               │  │
│  │  - v3ToV2 Map (reverse lookup)                            │  │
│  │  - UsageStats tracking                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└───┬──────────────────────┬──────────────────────┬───────────────┘
    │                      │                      │
    │ AgentResolution      │ DeprecationWarning   │ MigrationReport
    │                      │                      │
    ▼                      ▼                      ▼
┌─────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Coordinator │  │ DeprecationLogger│  │ MigrationReporter│
│ (use v3)    │  │ (warn users)     │  │ (analyze status) │
└──────┬──────┘  └────────┬─────────┘  └────────┬─────────┘
       │                  │                     │
       │                  │                     │
       ▼                  ▼                     ▼
┌─────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Domain    │  │    EventBus      │  │   CLI Output     │
│   Plugins   │  │  (publish events)│  │   (formatted)    │
└─────────────┘  └────────┬─────────┘  └──────────────────┘
                          │
                          │
                          ▼
                 ┌──────────────────┐
                 │  Data Sinks      │
                 ├──────────────────┤
                 │ - Analytics      │
                 │ - Memory Backend │
                 │ - Monitoring     │
                 └──────────────────┘
```

---

## Class Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    IAgentCompatLayer                           │
├────────────────────────────────────────────────────────────────┤
│ + resolve(name: string): AgentResolution                       │
│ + resolveBatch(names: string[]): AgentResolution[]             │
│ + isV2Agent(name: string): boolean                             │
│ + isV3Agent(name: string): boolean                             │
│ + getV2Name(v3Name: string): string | null                     │
│ + getAllMappings(): AgentMapping[]                             │
│ + getMappingsByDomain(domain: DomainName): AgentMapping[]      │
│ + getMappingsByType(type: MappingType): AgentMapping[]         │
│ + generateMigrationReport(agents: string[]): MigrationReport   │
│ + getMigrationPath(v2Name: string): MigrationPath | null       │
│ + getUsageStats(): UsageStats                                  │
│ + clearUsageStats(): void                                      │
└────────────────────────────────────────────────────────────────┘
                              △
                              │ implements
                              │
┌────────────────────────────────────────────────────────────────┐
│                    AgentCompatLayer                            │
├────────────────────────────────────────────────────────────────┤
│ - mappings: Map<string, AgentMapping>                          │
│ - v3ToV2: Map<string, string>                                  │
│ - stats: UsageStats                                            │
│ - logger: DeprecationLogger                                    │
│ - reporter: MigrationReporter                                  │
│ - config: V2CompatConfig                                       │
├────────────────────────────────────────────────────────────────┤
│ - normalizeAgentName(name: string): string                     │
│ - isV3Format(name: string): boolean                            │
│ - resolveV3Agent(normalized, original): AgentResolution        │
│ - resolveV2Agent(mapping, original): AgentResolution           │
│ - resolveUnknown(original): AgentResolution                    │
│ - trackResolution(name: string): void                          │
│ - trackV2Usage(name: string): void                             │
│ - trackFailure(): void                                         │
│ - createDeprecationWarning(mapping): DeprecationWarning        │
│ - generateMigrationPath(mapping): MigrationPath                │
│ - buildMappingIndex(mappings: AgentMapping[]): void            │
└────────────────────────────────────────────────────────────────┘
                    │                    │
                    │ has-a              │ has-a
                    ▼                    ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   DeprecationLogger      │  │   MigrationReporter      │
├──────────────────────────┤  ├──────────────────────────┤
│ - warnings: Map          │  │ - compatLayer            │
│ - eventBus: EventBus     │  │                          │
│ - config: V2CompatConfig │  │                          │
├──────────────────────────┤  ├──────────────────────────┤
│ + warn(warning)          │  │ + generateReport(agents) │
│ + getWarnings()          │  │ + formatAsMarkdown()     │
│ + clearWarnings()        │  │ + formatAsJSON()         │
│ + hasWarning(v2Name)     │  │ + formatAsCLITable()     │
│ - emitWarning()          │  │ - createMigrationItem()  │
│ - publishEvent()         │  │ - calculatePriority()    │
│ - getWarningKey()        │  │ - calculateProgress()    │
└──────────────────────────┘  └──────────────────────────┘
```

---

## Sequence Diagram: Full Migration Check

```
User      CLI       AgentCompat   MigrationReporter   Memory   EventBus
 │         │              │                │            │         │
 │ migrate:check          │                │            │         │
 ├────────>│              │                │            │         │
 │         │ generateMigrationReport       │            │         │
 │         ├─────────────>│                │            │         │
 │         │              │ resolveBatch   │            │         │
 │         │              ├──────┐         │            │         │
 │         │              │      │ resolve each agent  │         │
 │         │              │<─────┘         │            │         │
 │         │              │                │            │         │
 │         │              │ create reporter│            │         │
 │         │              ├───────────────>│            │         │
 │         │              │                │            │         │
 │         │              │                │ analyze    │         │
 │         │              │                ├────┐       │         │
 │         │              │                │<───┘       │         │
 │         │              │                │            │         │
 │         │              │<───────────────┤            │         │
 │         │              │ MigrationReport│            │         │
 │         │              │                │            │         │
 │         │              │ publishEvent('migration.ReportGenerated')
 │         │              ├───────────────────────────────────────>│
 │         │              │                │            │         │
 │         │<─────────────┤                │            │         │
 │         │ report       │                │            │         │
 │         │              │                │            │         │
 │         │ formatAsCLITable              │            │         │
 │         ├─────────────────────────────>│            │         │
 │         │              │                │            │         │
 │         │<───────────────────────────────            │         │
 │         │ formatted    │                │            │         │
 │         │              │                │            │         │
 │<────────┤              │                │            │         │
 │ display │              │                │            │         │
 │         │              │                │            │         │
```

---

## State Machine: Agent Resolution

```
                     START
                       │
                       ▼
              ┌────────────────┐
              │  Normalize     │
              │  Input Name    │
              └────────┬───────┘
                       │
                       ▼
              ┌────────────────┐
              │  Check Format  │
              └────────┬───────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    v3 format     v2 format      unknown
         │             │             │
         ▼             ▼             ▼
┌───────────────┐ ┌──────────┐ ┌──────────┐
│ V3 Lookup     │ │ V2 Lookup│ │ Unknown  │
│ (pass-through)│ │ (map)    │ │ (fail)   │
└───────┬───────┘ └─────┬────┘ └─────┬────┘
        │               │            │
        │               │            │
        ▼               ▼            ▼
┌───────────────┐ ┌──────────┐ ┌──────────┐
│ Success       │ │ Emit     │ │ Return   │
│ (no warning)  │ │ Warning  │ │ Error    │
└───────┬───────┘ └─────┬────┘ └─────┬────┘
        │               │            │
        │               ▼            │
        │          ┌──────────┐     │
        │          │ Track    │     │
        │          │ V2 Usage │     │
        │          └─────┬────┘     │
        │                │          │
        └────────────────┼──────────┘
                         ▼
                  ┌──────────────┐
                  │ Return       │
                  │ AgentResolv. │
                  └──────────────┘
                         │
                         ▼
                       END
```

---

## Performance Characteristics

### Time Complexity Analysis

| Operation | Best Case | Average Case | Worst Case |
|-----------|-----------|--------------|------------|
| resolve() | O(1) | O(1) | O(1) |
| resolveBatch(n) | O(n) | O(n) | O(n) |
| generateReport(n) | O(n log n) | O(n log n) | O(n log n) |
| getMappingsByDomain() | O(1) | O(m) | O(m) |
| getUsageStats() | O(1) | O(1) | O(1) |

where:
- n = number of agents to resolve
- m = total number of mappings (48)

### Space Complexity

| Component | Space | Notes |
|-----------|-------|-------|
| Mappings (v2→v3) | O(m) | ~10 KB for 48 mappings |
| Reverse (v3→v2) | O(m) | ~5 KB for 48 reverse mappings |
| Usage Stats | O(u) | u = unique agents used |
| Warning Cache | O(w) | w ≤ maxWarnings (100) |
| **Total** | **O(m + u + w)** | **~15-20 KB baseline** |

---

## Security Considerations

1. **Input Validation**
   - All agent names sanitized and normalized
   - Prevents injection attacks via malformed names

2. **Event Publishing**
   - No sensitive data in published events
   - Warnings contain only agent names (no config/secrets)

3. **Memory Storage**
   - TTL-based cleanup prevents unbounded growth
   - Namespace isolation (`migration:*`)

4. **Error Handling**
   - No stack traces in production warnings
   - Sanitized error messages for users

---

## Monitoring & Observability

### Key Metrics

```typescript
// Resolution metrics
migration.resolution_count (counter)
migration.resolution_time (histogram)
migration.v2_usage_count (counter)
migration.v3_usage_count (counter)
migration.unknown_agent_count (counter)

// Warning metrics
migration.warning_emitted (counter)
migration.warning_level (gauge: info/warning/error)

// Report metrics
migration.report_generated (counter)
migration.migration_progress (gauge: 0-100%)
```

### Logging

```typescript
// Info level
"Agent resolved: qe-test-generator → qe-test-architect"

// Warning level
"[DEPRECATED] qe-test-generator deprecated in v3.0.0, removed in v4.0.0"

// Error level (strict mode)
"DeprecationError: qe-test-generator is no longer supported"
```

---

## Related Diagrams

- [Main Design Document](migration-compat-layer-design.md)
- [Integration Guide](migration-compat-integration.md)
- [Summary Document](migration-compat-summary.md)

---

**End of Architecture Document**
