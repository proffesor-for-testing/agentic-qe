# Migration Compatibility Layer Design Summary

**Date:** 2026-01-17
**Status:** Design Complete - Ready for Implementation
**ADR:** [ADR-048](../../v3/implementation/adrs/ADR-048-v2-v3-agent-migration.md)

---

## Executive Summary

The migration compatibility layer provides **zero-breaking-changes** migration from v2 to v3 by transparently resolving v2 agent names to v3 equivalents with comprehensive tracking, reporting, and progressive deprecation.

---

## Design Documents

### 1. Main Design Document
**File:** [migration-compat-layer-design.md](migration-compat-layer-design.md)

**Contents:**
- Module architecture and file structure
- Type definitions (MappingType, AgentResolution, DeprecationWarning, etc.)
- Core interfaces (IAgentCompatLayer, IDeprecationLogger, IMigrationReporter)
- Implementation patterns (resolution algorithm, warning system, report generation)
- Error handling strategy
- Testing strategy
- Performance considerations

**Key Decisions:**
- O(1) map-based lookups using dual Map structure (v2→v3 and v3→v2)
- Zero-breaking-changes compatibility (all v2 names work unchanged)
- Progressive deprecation with configurable warning levels
- Comprehensive usage tracking via EventBus
- Integration with existing MemoryBackend for persistence

### 2. TypeScript Interfaces
**File:** [migration-compat-interfaces.ts](migration-compat-interfaces.ts)

**Contents:**
- Complete type definitions (500+ lines)
- Enums: MappingType, WarningLevel
- Interfaces: AgentMapping, AgentResolution, DeprecationWarning, MigrationPath, MigrationReport, UsageStats, V2CompatConfig
- Core interfaces: IAgentCompatLayer, IDeprecationLogger, IMigrationReporter
- Error types: AgentResolutionError, DeprecationError, MigrationError, ConfigurationError
- Factory types for dependency injection

**Ready for:** Direct copy into `v3/src/migration/types.ts`

### 3. Integration Guide
**File:** [migration-compat-integration.md](migration-compat-integration.md)

**Contents:**
- Integration points for all v3 components
- Kernel integration (PluginLoader, AgentCoordinator)
- MCP server integration (4 new tools)
- Domain plugin integration (optional enhancement)
- Coordination layer integration (CrossDomainRouter)
- Event bus integration (new migration events)
- Memory backend integration (namespace: 'migration')
- Configuration integration (new config section)
- CLI integration (new migrate commands)
- Data flow diagram
- Initialization sequence
- Testing integration
- Performance considerations
- Backward compatibility guarantees

---

## Implementation Files to Create

### 1. v3/src/migration/agent-compat.ts
**Purpose:** Main compatibility layer implementation

**Classes:**
- `AgentCompatLayer` implements `IAgentCompatLayer`

**Methods:**
- `resolve(agentName: string): AgentResolution`
- `resolveBatch(agentNames: string[]): AgentResolution[]`
- `isV2Agent(agentName: string): boolean`
- `isV3Agent(agentName: string): boolean`
- `getV2Name(v3Name: string): string | null`
- `getAllMappings(): ReadonlyArray<AgentMapping>`
- `getMappingsByDomain(domain: DomainName): ReadonlyArray<AgentMapping>`
- `getMappingsByType(type: MappingType): ReadonlyArray<AgentMapping>`
- `generateMigrationReport(usedAgents: string[]): MigrationReport`
- `getMigrationPath(v2Name: string): MigrationPath | null`
- `getUsageStats(): UsageStats`
- `clearUsageStats(): void`
- `exportUsageData(): object`

**Dependencies:**
- `DeprecationLogger` (for warning emission)
- `MigrationReporter` (for report generation)
- `EventBus` (for event publishing)

### 2. v3/src/migration/deprecation-logger.ts
**Purpose:** Centralized deprecation warning handler

**Classes:**
- `DeprecationLogger` implements `IDeprecationLogger`

**Methods:**
- `warn(warning: DeprecationWarning): void`
- `getWarnings(): ReadonlyArray<DeprecationWarning>`
- `getWarningsByLevel(level: WarningLevel): ReadonlyArray<DeprecationWarning>`
- `clearWarnings(): void`
- `hasWarning(v2Name: string): boolean`

**Features:**
- Console warning emission with color coding
- Event publishing to EventBus
- Warning deduplication
- Strict mode support (throw on error level)
- Custom handler support via config

### 3. v3/src/migration/migration-reporter.ts
**Purpose:** Migration report generation and formatting

**Classes:**
- `MigrationReporter` implements `IMigrationReporter`

**Methods:**
- `generateReport(usedAgents: string[]): MigrationReport`
- `formatAsMarkdown(report: MigrationReport): string`
- `formatAsJSON(report: MigrationReport): string`
- `formatAsCLITable(report: MigrationReport): string`

**Features:**
- Dependency-aware migration ordering
- Priority calculation (high/medium/low)
- Effort estimation (low/medium/high)
- Breaking change detection
- Progress percentage calculation

### 4. v3/src/migration/types.ts
**Purpose:** Type definitions

**Contents:**
- Copy from `migration-compat-interfaces.ts`

### 5. v3/src/migration/__tests__/
**Purpose:** Unit and integration tests

**Files:**
- `agent-compat.test.ts` - Unit tests for AgentCompatLayer
- `deprecation-logger.test.ts` - Unit tests for DeprecationLogger
- `migration-reporter.test.ts` - Unit tests for MigrationReporter
- `integration.test.ts` - Integration tests with kernel components

---

## Integration Changes Required

### Kernel Components

#### v3/src/kernel/plugin-loader.ts
- Add `compatLayer: IAgentCompatLayer` to constructor
- Modify `load()` to resolve domain names via compat layer

#### v3/src/kernel/agent-coordinator.ts
- Add `compatLayer: IAgentCompatLayer` to constructor
- Modify `spawn()` to resolve agent names via compat layer
- Add `trackV2Usage()` method for event emission

### MCP Server

#### v3/src/mcp/handlers/agent-handlers.ts
- Add 4 new handler functions:
  - `agent.spawn` (enhanced with migration metadata)
  - `agent.migration-check`
  - `agent.migration-path`
  - `agent.usage-stats`
  - `agent.export-migration-data`

### Configuration

#### agentic-qe.config.json
- Add `migration` section with V2CompatConfig options

### CLI

#### v3/src/cli/commands/migrate.ts
- Add new commands:
  - `migrate:check` - Show migration status
  - `migrate:path` - Show migration path for agent
  - `migrate:stats` - Show usage statistics
  - `migrate:export` - Export migration data

---

## Agent Mappings

**Total Mappings:** 48 agents across 12 domains

**Mapping Distribution:**
- **Direct (Tier 1):** 9 agents (same name, enhanced)
- **Renamed (Tier 2):** 12 agents (v2_compat required)
- **New (Tier 3):** 21 agents (v3-only)
- **Consolidated (Tier 4):** 4 agents (multiple v2 → single v3)
- **Split (Tier 5):** 2 agents (single v2 → multiple v3)

**Example Mappings:**
```typescript
{
  v2Name: 'qe-test-generator',
  v3Name: 'qe-test-architect',
  domain: 'test-generation',
  deprecated: true,
  deprecatedIn: '3.0.0',
  removedIn: '4.0.0',
  mappingType: MappingType.RENAMED
}
```

---

## Performance Characteristics

### Time Complexity
- **Single resolution:** O(1) - Map lookup
- **Batch resolution:** O(n) - Linear in number of agents
- **Migration report:** O(n log n) - Sorting for priority order

### Space Complexity
- **Mapping storage:** ~10 KB (48 mappings × 200 bytes)
- **Usage stats:** O(u) where u = unique agents used
- **Warning cache:** O(w) where w ≤ maxWarnings (default: 100)

### Memory Management
- TTL-based cleanup for usage stats
- Warning deduplication prevents unbounded growth
- Periodic snapshots for long-running processes

---

## Testing Strategy

### Unit Tests (80% coverage target)
- Resolution logic (v2→v3, v3→v2, unknown)
- Warning emission and deduplication
- Report generation and formatting
- Statistics tracking and aggregation

### Integration Tests
- PluginLoader integration
- AgentCoordinator integration
- MCP server integration
- Event bus integration
- Memory backend integration

### E2E Tests
- Full migration workflow
- CLI commands
- Configuration options
- Error handling

---

## Migration Timeline

| Milestone | Duration | Deliverables |
|-----------|----------|--------------|
| **Phase 1: Implementation** | Week 1 | agent-compat.ts, deprecation-logger.ts, migration-reporter.ts, types.ts |
| **Phase 2: Integration** | Week 2 | Kernel integration, MCP handlers, CLI commands |
| **Phase 3: Testing** | Week 3 | Unit tests, integration tests, E2E tests |
| **Phase 4: Documentation** | Week 4 | API docs, migration guide, examples |
| **Phase 5: Alpha Release** | Week 5 | Internal testing, bug fixes |
| **Phase 6: Beta Release** | Week 6-7 | Community testing, feedback integration |
| **Phase 7: GA Release** | Week 8 | v3.0.0 release with compatibility layer |

---

## Success Criteria

- [ ] All v2 agent names resolve correctly to v3
- [ ] Zero breaking changes for existing users
- [ ] Deprecation warnings emitted for all v2 usage
- [ ] Migration reports generated accurately
- [ ] Usage statistics tracked and exportable
- [ ] MCP tools functional and tested
- [ ] CLI commands working
- [ ] Integration tests passing
- [ ] Documentation complete
- [ ] Performance targets met (<1ms resolution)

---

## Next Steps

1. **Implement agent-compat.ts**
   - Copy types from migration-compat-interfaces.ts
   - Implement AgentCompatLayer class
   - Add agent mappings (48 total)

2. **Implement deprecation-logger.ts**
   - Implement DeprecationLogger class
   - Add console formatting
   - Add event publishing

3. **Implement migration-reporter.ts**
   - Implement MigrationReporter class
   - Add formatting functions (Markdown, JSON, CLI)

4. **Integrate with kernel**
   - Modify PluginLoader
   - Modify AgentCoordinator
   - Update initialization sequence

5. **Add MCP handlers**
   - Create agent-handlers.ts updates
   - Register new tools
   - Add tests

6. **Add CLI commands**
   - Create migrate.ts command module
   - Add to CLI registry
   - Add tests

7. **Write tests**
   - Unit tests (agent-compat, deprecation-logger, migration-reporter)
   - Integration tests (kernel, MCP, CLI)
   - E2E tests (full workflow)

8. **Document**
   - API documentation
   - Migration guide
   - Examples

---

## Related Documents

- [Main Design Document](migration-compat-layer-design.md)
- [TypeScript Interfaces](migration-compat-interfaces.ts)
- [Integration Guide](migration-compat-integration.md)
- [ADR-048: V2-to-V3 Agent Migration](../../v3/implementation/adrs/ADR-048-v2-v3-agent-migration.md)
- [Migration Plan](../plans/AQE-V2-V3-MIGRATION-PLAN.md)
- [Migration Skill](../../.claude/skills/aqe-v2-v3-migration/skill.md)

---

## Contact

For questions or clarifications:
- Architecture Team
- Migration Lead
- V3 Development Team

---

**Design Status:** ✅ COMPLETE - Ready for Implementation

**Last Updated:** 2026-01-17
