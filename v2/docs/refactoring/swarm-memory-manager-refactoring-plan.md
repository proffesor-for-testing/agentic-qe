# SwarmMemoryManager Refactoring Plan

## Executive Summary

**Current State:**
- File: `src/core/memory/SwarmMemoryManager.ts`
- Lines of Code: 1,838
- Cyclomatic Complexity: 187 (HIGHEST in codebase)
- Target Complexity: < 100

**Root Causes of Complexity:**
1. God Object pattern - manages 12 different database tables
2. Long methods with nested conditionals
3. Mixed concerns (storage, access control, QUIC, AgentDB)
4. Repetitive SQL query patterns
5. No separation between data access and business logic

---

## Refactoring Strategy

### Phase 1: Extract Data Access Layer (DAO Pattern)

Create separate DAO classes for each table/domain:

1. **MemoryEntryDAO** - Core key-value storage (Table 1)
2. **AccessControlDAO** - ACL management (Table 2)
3. **HintDAO** - Blackboard hints (Table 2b)
4. **EventDAO** - Event stream (Table 3)
5. **WorkflowDAO** - Workflow state (Table 4)
6. **PatternDAO** - Pattern storage (Table 5)
7. **ConsensusDAO** - Consensus state (Table 6)
8. **MetricsDAO** - Performance metrics (Table 7)
9. **ArtifactDAO** - Artifact manifests (Table 8)
10. **SessionDAO** - Session management (Table 9)
11. **AgentRegistryDAO** - Agent lifecycle (Table 10)
12. **GOAPStateDAO** - GOAP planning (Table 11)
13. **OODACycleDAO** - OODA loops (Table 12)

### Phase 2: Extract Service Layer

Create service classes for business logic:

1. **MemoryStoreService** - Core storage operations
2. **MemoryCacheService** - Caching and TTL management
3. **MemorySyncService** - QUIC/AgentDB synchronization
4. **AccessControlService** - Permission checking
5. **ExpirationService** - TTL cleanup

### Phase 3: Apply Strategy Pattern

Create strategies for different memory types:

```typescript
interface MemoryStrategy {
  getTTL(): number;
  shouldAutoExpire(): boolean;
  getIndexes(): string[];
}

class ArtifactStrategy implements MemoryStrategy { /* never expires */ }
class EventStrategy implements MemoryStrategy { /* 30 days */ }
class ConsensusStrategy implements MemoryStrategy { /* 7 days */ }
```

### Phase 4: Simplify Complex Methods

Apply these refactoring patterns:
- **Extract Method** - Break down methods > 20 lines
- **Replace Nested Conditional with Guard Clauses**
- **Extract Predicate Functions** for complex conditions
- **Introduce Parameter Object** for methods with many parameters

---

## Detailed Implementation Plan

### Step 1: Create Base DAO Class

**File:** `src/core/memory/dao/BaseDAO.ts`

```typescript
export abstract class BaseDAO {
  protected db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  protected run(sql: string, params: any[] = []): void {
    this.db.prepare(sql).run(...params);
  }

  protected queryOne<T>(sql: string, params: any[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  protected queryAll<T>(sql: string, params: any[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  abstract createTable(): Promise<void>;
  abstract createIndexes(): Promise<void>;
}
```

### Step 2: Create MemoryEntryDAO

**File:** `src/core/memory/dao/MemoryEntryDAO.ts`

```typescript
export class MemoryEntryDAO extends BaseDAO {
  async createTable(): Promise<void> {
    await this.run(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        key TEXT NOT NULL,
        partition TEXT NOT NULL DEFAULT 'default',
        value TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        owner TEXT,
        access_level TEXT DEFAULT 'private',
        team_id TEXT,
        swarm_id TEXT,
        PRIMARY KEY (key, partition)
      )
    `);
  }

  async createIndexes(): Promise<void> {
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_partition ON memory_entries(partition)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory_entries(expires_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_owner ON memory_entries(owner)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_access ON memory_entries(access_level)`);
  }

  async insert(entry: MemoryEntry): Promise<void> {
    await this.run(
      `INSERT OR REPLACE INTO memory_entries
       (key, partition, value, metadata, created_at, expires_at, owner, access_level, team_id, swarm_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.key,
        entry.partition || 'default',
        JSON.stringify(entry.value),
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.createdAt,
        entry.expiresAt || null,
        entry.owner || 'system',
        entry.accessLevel || 'private',
        entry.teamId || null,
        entry.swarmId || null
      ]
    );
  }

  async findByKey(key: string, partition: string, includeExpired: boolean = false): Promise<MemoryEntry | null> {
    const now = Date.now();
    let query = `SELECT * FROM memory_entries WHERE key = ? AND partition = ?`;
    const params: any[] = [key, partition];

    if (!includeExpired) {
      query += ` AND (expires_at IS NULL OR expires_at > ?)`;
      params.push(now);
    }

    const row = await this.queryOne<any>(query, params);
    return row ? this.mapToEntry(row) : null;
  }

  async findByPattern(pattern: string, partition: string, includeExpired: boolean = false): Promise<MemoryEntry[]> {
    const now = Date.now();
    let query = `SELECT * FROM memory_entries WHERE partition = ? AND key LIKE ?`;
    const params: any[] = [partition, pattern];

    if (!includeExpired) {
      query += ` AND (expires_at IS NULL OR expires_at > ?)`;
      params.push(now);
    }

    const rows = await this.queryAll<any>(query, params);
    return rows.map(row => this.mapToEntry(row));
  }

  async deleteByKey(key: string, partition: string): Promise<void> {
    await this.run(`DELETE FROM memory_entries WHERE key = ? AND partition = ?`, [key, partition]);
  }

  async deleteByPartition(partition: string): Promise<void> {
    await this.run(`DELETE FROM memory_entries WHERE partition = ?`, [partition]);
  }

  async deleteExpired(): Promise<void> {
    const now = Date.now();
    await this.run(`DELETE FROM memory_entries WHERE expires_at IS NOT NULL AND expires_at <= ?`, [now]);
  }

  async count(): Promise<number> {
    const result = await this.queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM memory_entries`);
    return result?.count || 0;
  }

  async getPartitions(): Promise<string[]> {
    const rows = await this.queryAll<{ partition: string }>(`SELECT DISTINCT partition FROM memory_entries`);
    return rows.map(row => row.partition);
  }

  async getAccessLevelCounts(): Promise<Record<string, number>> {
    const rows = await this.queryAll<{ access_level: string; count: number }>(
      `SELECT access_level, COUNT(*) as count FROM memory_entries GROUP BY access_level`
    );

    const counts: Record<string, number> = {};
    rows.forEach(row => {
      counts[row.access_level] = row.count;
    });
    return counts;
  }

  async findModifiedSince(since: number, partition?: string): Promise<MemoryEntry[]> {
    let query = `SELECT * FROM memory_entries WHERE created_at > ?`;
    const params: any[] = [since];

    if (partition) {
      query += ` AND partition = ?`;
      params.push(partition);
    }

    query += ` ORDER BY created_at ASC`;

    const rows = await this.queryAll<any>(query, params);
    return rows.map(row => this.mapToEntry(row));
  }

  private mapToEntry(row: any): MemoryEntry {
    return {
      key: row.key,
      value: JSON.parse(row.value),
      partition: row.partition,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      owner: row.owner,
      accessLevel: row.access_level,
      teamId: row.team_id,
      swarmId: row.swarm_id
    };
  }
}
```

### Step 3: Create MemoryStoreService

**File:** `src/core/memory/services/MemoryStoreService.ts`

```typescript
export class MemoryStoreService {
  private memoryDAO: MemoryEntryDAO;
  private accessControl: AccessControlService;
  private lastModifiedTimestamps: Map<string, number>;

  constructor(
    memoryDAO: MemoryEntryDAO,
    accessControl: AccessControlService
  ) {
    this.memoryDAO = memoryDAO;
    this.accessControl = accessControl;
    this.lastModifiedTimestamps = new Map();
  }

  async store(key: string, value: any, options: StoreOptions = {}): Promise<void> {
    const partition = options.partition || 'default';
    const owner = options.owner || 'system';
    const accessLevel = options.accessLevel || AccessLevel.PRIVATE;
    const createdAt = Date.now();
    const expiresAt = this.calculateExpiresAt(options.ttl, createdAt);

    // Check write permission if updating existing entry
    const existing = await this.memoryDAO.findByKey(key, partition);

    if (existing && options.owner) {
      await this.checkWritePermission(existing, options);
    }

    const entry: MemoryEntry = {
      key,
      value,
      partition,
      createdAt,
      expiresAt,
      owner,
      accessLevel,
      teamId: options.teamId,
      swarmId: options.swarmId
    };

    await this.memoryDAO.insert(entry);

    // Track modification for QUIC sync
    this.trackModification(partition, key, createdAt);
  }

  async retrieve(key: string, options: RetrieveOptions = {}): Promise<any> {
    const partition = options.partition || 'default';
    const entry = await this.memoryDAO.findByKey(key, partition, options.includeExpired);

    if (!entry) {
      return null;
    }

    // Check read permission if agentId provided
    if (options.agentId) {
      await this.checkReadPermission(entry, options);
    }

    return entry.value;
  }

  async query(pattern: string, options: RetrieveOptions = {}): Promise<MemoryEntry[]> {
    const partition = options.partition || 'default';
    const entries = await this.memoryDAO.findByPattern(pattern, partition, options.includeExpired);

    // Filter by access control if agentId provided
    if (options.agentId) {
      return this.filterByPermissions(entries, options);
    }

    return entries;
  }

  async delete(key: string, partition: string = 'default', options: DeleteOptions = {}): Promise<void> {
    // Check delete permission if agentId provided
    if (options.agentId) {
      const entry = await this.memoryDAO.findByKey(key, partition);
      if (entry) {
        await this.checkDeletePermission(entry, options);
      }
    }

    await this.memoryDAO.deleteByKey(key, partition);
  }

  async clear(partition: string = 'default'): Promise<void> {
    await this.memoryDAO.deleteByPartition(partition);
  }

  // Private helper methods

  private calculateExpiresAt(ttl: number | undefined, createdAt: number): number | undefined {
    return ttl ? createdAt + (ttl * 1000) : undefined;
  }

  private trackModification(partition: string, key: string, timestamp: number): void {
    const entryKey = `${partition}:${key}`;
    this.lastModifiedTimestamps.set(entryKey, timestamp);
  }

  private async checkWritePermission(entry: MemoryEntry, options: StoreOptions): Promise<void> {
    const allowed = await this.accessControl.checkPermission({
      agentId: options.owner!,
      resourceOwner: entry.owner!,
      accessLevel: entry.accessLevel!,
      permission: Permission.WRITE,
      teamId: options.teamId,
      resourceTeamId: entry.teamId,
      swarmId: options.swarmId,
      resourceSwarmId: entry.swarmId
    });

    if (!allowed) {
      throw new AccessControlError('Write permission denied');
    }
  }

  private async checkReadPermission(entry: MemoryEntry, options: RetrieveOptions): Promise<void> {
    const allowed = await this.accessControl.checkPermission({
      agentId: options.agentId!,
      resourceOwner: entry.owner!,
      accessLevel: entry.accessLevel!,
      permission: Permission.READ,
      teamId: options.teamId,
      resourceTeamId: entry.teamId,
      swarmId: options.swarmId,
      resourceSwarmId: entry.swarmId,
      isSystemAgent: options.isSystemAgent
    });

    if (!allowed) {
      throw new AccessControlError('Read permission denied');
    }
  }

  private async checkDeletePermission(entry: MemoryEntry, options: DeleteOptions): Promise<void> {
    const allowed = await this.accessControl.checkPermission({
      agentId: options.agentId!,
      resourceOwner: entry.owner!,
      accessLevel: entry.accessLevel!,
      permission: Permission.DELETE,
      teamId: options.teamId,
      resourceTeamId: entry.teamId,
      swarmId: options.swarmId,
      resourceSwarmId: entry.swarmId,
      isSystemAgent: options.isSystemAgent
    });

    if (!allowed) {
      throw new AccessControlError('Delete permission denied');
    }
  }

  private async filterByPermissions(entries: MemoryEntry[], options: RetrieveOptions): Promise<MemoryEntry[]> {
    const filtered: MemoryEntry[] = [];

    for (const entry of entries) {
      const allowed = await this.accessControl.checkPermission({
        agentId: options.agentId!,
        resourceOwner: entry.owner!,
        accessLevel: entry.accessLevel!,
        permission: Permission.READ,
        teamId: options.teamId,
        resourceTeamId: entry.teamId,
        swarmId: options.swarmId,
        resourceSwarmId: entry.swarmId,
        isSystemAgent: options.isSystemAgent
      });

      if (allowed) {
        filtered.push(entry);
      }
    }

    return filtered;
  }

  getLastModified(key: string, partition: string = 'default'): number | undefined {
    const entryKey = `${partition}:${key}`;
    return this.lastModifiedTimestamps.get(entryKey);
  }
}
```

### Step 4: Refactor SwarmMemoryManager as Facade

**File:** `src/core/memory/SwarmMemoryManager.ts` (refactored)

```typescript
/**
 * SwarmMemoryManager - Facade for memory management subsystem
 *
 * Orchestrates:
 * - 13 specialized DAOs for data access
 * - 5 service layers for business logic
 * - Access control integration
 * - QUIC/AgentDB synchronization
 */
export class SwarmMemoryManager {
  private db: BetterSqlite3.Database | null = null;
  private dbPath: string;
  private initialized = false;

  // DAOs
  private memoryDAO!: MemoryEntryDAO;
  private accessControlDAO!: AccessControlDAO;
  private hintDAO!: HintDAO;
  private eventDAO!: EventDAO;
  private workflowDAO!: WorkflowDAO;
  private patternDAO!: PatternDAO;
  private consensusDAO!: ConsensusDAO;
  private metricsDAO!: MetricsDAO;
  private artifactDAO!: ArtifactDAO;
  private sessionDAO!: SessionDAO;
  private agentRegistryDAO!: AgentRegistryDAO;
  private goapStateDAO!: GOAPStateDAO;
  private oodaCycleDAO!: OODACycleDAO;

  // Services
  private memoryStoreService!: MemoryStoreService;
  private accessControlService!: AccessControlService;
  private expirationService!: ExpirationService;
  private syncService!: MemorySyncService;
  private cacheService!: MemoryCacheService;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.createDatabase();
    await this.initializeDAOs();
    await this.initializeServices();
    await this.createTables();
    await this.createIndexes();

    this.initialized = true;
  }

  // Delegate to MemoryStoreService
  async store(key: string, value: any, options: StoreOptions = {}): Promise<void> {
    await this.ensureInitialized();
    return this.memoryStoreService.store(key, value, options);
  }

  async retrieve(key: string, options: RetrieveOptions = {}): Promise<any> {
    await this.ensureInitialized();
    return this.memoryStoreService.retrieve(key, options);
  }

  async query(pattern: string, options: RetrieveOptions = {}): Promise<MemoryEntry[]> {
    await this.ensureInitialized();
    return this.memoryStoreService.query(pattern, options);
  }

  async delete(key: string, partition: string = 'default', options: DeleteOptions = {}): Promise<void> {
    await this.ensureInitialized();
    return this.memoryStoreService.delete(key, partition, options);
  }

  async clear(partition: string = 'default'): Promise<void> {
    await this.ensureInitialized();
    return this.memoryStoreService.clear(partition);
  }

  // Delegate to specialized DAOs...
  async storeEvent(event: Event): Promise<string> {
    await this.ensureInitialized();
    return this.eventDAO.insert(event);
  }

  async storeWorkflowState(workflow: WorkflowState): Promise<void> {
    await this.ensureInitialized();
    return this.workflowDAO.insert(workflow);
  }

  // ... (delegate all other methods to appropriate DAOs/services)

  // Private initialization methods

  private async createDatabase(): Promise<void> {
    if (this.dbPath !== ':memory:') {
      await fs.ensureDir(path.dirname(this.dbPath));
    }
    this.db = new BetterSqlite3(this.dbPath);
  }

  private async initializeDAOs(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.memoryDAO = new MemoryEntryDAO(this.db);
    this.accessControlDAO = new AccessControlDAO(this.db);
    this.hintDAO = new HintDAO(this.db);
    this.eventDAO = new EventDAO(this.db);
    this.workflowDAO = new WorkflowDAO(this.db);
    this.patternDAO = new PatternDAO(this.db);
    this.consensusDAO = new ConsensusDAO(this.db);
    this.metricsDAO = new MetricsDAO(this.db);
    this.artifactDAO = new ArtifactDAO(this.db);
    this.sessionDAO = new SessionDAO(this.db);
    this.agentRegistryDAO = new AgentRegistryDAO(this.db);
    this.goapStateDAO = new GOAPStateDAO(this.db);
    this.oodaCycleDAO = new OODACycleDAO(this.db);
  }

  private async initializeServices(): Promise<void> {
    this.accessControlService = new AccessControlService(this.accessControlDAO);
    this.memoryStoreService = new MemoryStoreService(this.memoryDAO, this.accessControlService);
    this.expirationService = new ExpirationService([
      this.memoryDAO,
      this.hintDAO,
      this.eventDAO,
      this.patternDAO,
      this.consensusDAO
    ]);
    this.cacheService = new MemoryCacheService();
    this.syncService = new MemorySyncService(this.memoryDAO);
  }

  private async createTables(): Promise<void> {
    await Promise.all([
      this.memoryDAO.createTable(),
      this.accessControlDAO.createTable(),
      this.hintDAO.createTable(),
      this.eventDAO.createTable(),
      this.workflowDAO.createTable(),
      this.patternDAO.createTable(),
      this.consensusDAO.createTable(),
      this.metricsDAO.createTable(),
      this.artifactDAO.createTable(),
      this.sessionDAO.createTable(),
      this.agentRegistryDAO.createTable(),
      this.goapStateDAO.createTables(),
      this.oodaCycleDAO.createTable()
    ]);
  }

  private async createIndexes(): Promise<void> {
    await Promise.all([
      this.memoryDAO.createIndexes(),
      this.accessControlDAO.createIndexes(),
      this.hintDAO.createIndexes(),
      this.eventDAO.createIndexes(),
      this.workflowDAO.createIndexes(),
      this.patternDAO.createIndexes(),
      this.consensusDAO.createIndexes(),
      this.metricsDAO.createIndexes(),
      this.artifactDAO.createIndexes(),
      this.agentRegistryDAO.createIndexes(),
      this.oodaCycleDAO.createIndexes()
    ]);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}
```

---

## Complexity Reduction Analysis

### Before Refactoring:
- **Single class:** 1,838 LOC
- **Cyclomatic Complexity:** 187
- **Methods:** ~80 methods in one class
- **Concerns:** 12 mixed concerns

### After Refactoring:
- **SwarmMemoryManager (Facade):** ~300 LOC, complexity ~20
- **13 DAO classes:** Average 150 LOC each, complexity ~15 each
- **5 Service classes:** Average 200 LOC each, complexity ~20 each
- **Total:** ~4,450 LOC (organized), max complexity per file: ~25

### Complexity Reduction:
- **Per-file complexity:** 187 → 25 (85% reduction)
- **Maintainability:** High (single responsibility)
- **Testability:** High (easy to mock DAOs/services)
- **Extensibility:** High (new tables = new DAO, no changes to existing code)

---

## Implementation Timeline

### Week 1: Foundation
- Create BaseDAO class
- Create 3 core DAOs (MemoryEntry, AccessControl, Hint)
- Create MemoryStoreService
- Write unit tests

### Week 2: Additional DAOs
- Create remaining 10 DAOs
- Write unit tests for each DAO
- Integration tests

### Week 3: Service Layer
- Create AccessControlService
- Create ExpirationService
- Create CacheService
- Create SyncService
- Write unit tests

### Week 4: Facade Refactoring
- Refactor SwarmMemoryManager as facade
- Update all consumers to use new API
- Integration tests
- Performance benchmarking

### Week 5: Testing & Validation
- Full regression testing
- Performance validation
- Documentation updates
- Code review

---

## Testing Strategy

### Unit Tests (per DAO/Service):
- Test each method independently
- Mock database connections
- Test error handling
- Test edge cases

### Integration Tests:
- Test DAO + Service integration
- Test database transactions
- Test concurrent access
- Test TTL expiration

### Performance Tests:
- Benchmark query performance
- Benchmark insert/update performance
- Compare with baseline (current implementation)
- Ensure no performance regression

---

## Rollout Strategy

### Phase A: Parallel Implementation
- Keep existing SwarmMemoryManager
- Implement new architecture in parallel
- Run both implementations side-by-side

### Phase B: Gradual Migration
- Migrate one component at a time
- Use feature flags for rollback
- Monitor for issues

### Phase C: Deprecation
- Mark old implementation as deprecated
- Remove old code after stable period
- Update all documentation

---

## Success Metrics

1. **Cyclomatic Complexity:** < 100 per file (target: < 25)
2. **Test Coverage:** > 90% line coverage
3. **Performance:** No regression (within 5% of baseline)
4. **Code Review:** All PRs approved by 2+ reviewers
5. **Zero Production Issues:** No bugs introduced during refactoring

---

## Risk Mitigation

### Risk 1: Breaking Changes
- **Mitigation:** Maintain backward compatibility with facade pattern
- **Fallback:** Keep old implementation available

### Risk 2: Performance Regression
- **Mitigation:** Benchmark every change
- **Fallback:** Optimize hot paths with caching

### Risk 3: Database Corruption
- **Mitigation:** Extensive integration tests
- **Fallback:** Database migration rollback scripts

### Risk 4: Team Knowledge Gap
- **Mitigation:** Thorough documentation + training sessions
- **Fallback:** Pair programming during migration

---

## References

- **Refactoring Patterns:** Martin Fowler's "Refactoring" book
- **DAO Pattern:** J2EE Design Patterns
- **Facade Pattern:** Gang of Four Design Patterns
- **SOLID Principles:** Robert C. Martin's Clean Code

---

## Appendix: File Structure

```
src/core/memory/
├── SwarmMemoryManager.ts          # Facade (300 LOC, complexity ~20)
├── dao/
│   ├── BaseDAO.ts                 # Base class for all DAOs
│   ├── MemoryEntryDAO.ts          # Table 1
│   ├── AccessControlDAO.ts        # Table 2
│   ├── HintDAO.ts                 # Table 2b
│   ├── EventDAO.ts                # Table 3
│   ├── WorkflowDAO.ts             # Table 4
│   ├── PatternDAO.ts              # Table 5
│   ├── ConsensusDAO.ts            # Table 6
│   ├── MetricsDAO.ts              # Table 7
│   ├── ArtifactDAO.ts             # Table 8
│   ├── SessionDAO.ts              # Table 9
│   ├── AgentRegistryDAO.ts        # Table 10
│   ├── GOAPStateDAO.ts            # Table 11
│   └── OODACycleDAO.ts            # Table 12
├── services/
│   ├── MemoryStoreService.ts      # Core storage logic
│   ├── AccessControlService.ts    # Permission checking
│   ├── ExpirationService.ts       # TTL cleanup
│   ├── MemoryCacheService.ts      # Caching layer
│   └── MemorySyncService.ts       # QUIC/AgentDB sync
└── types/
    ├── MemoryEntry.ts
    ├── StoreOptions.ts
    └── ... (all interfaces)
```

---

**Status:** Plan Ready for Review
**Next Steps:** Review plan → Approve → Begin Phase 1 implementation
