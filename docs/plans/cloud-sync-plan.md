# Cloud Sync Plan: Local AQE → Cloud ruvector-postgres

## Executive Summary

Sync learning data from local SQLite databases to cloud PostgreSQL with ruvector for centralized self-learning across environments.

**Problem:** Data is fragmented across 6+ locations. This plan consolidates all sources.

---

## 1. Data Inventory - Complete Fragmentation Analysis

### ⚠️ CRITICAL: Data Fragmentation Issue

Data is scattered across multiple locations. The sync system must consolidate:

### Active Data Sources (by recency)

| Location | Last Modified | Size | Records | Status |
|----------|---------------|------|---------|--------|
| `v3/.agentic-qe/memory.db` | **Jan 24 (TODAY)** | 1.8 MB | 1,186 | ✅ **PRIMARY** (v3 runtime) |
| `.claude-flow/memory/store.json` | Jan 23 | 247 KB | 6,113 lines | ✅ ACTIVE (daemon) |
| `.agentic-qe/memory.db` | Jan 22 | 9.5 MB | 2,060 | ⚠️ HISTORICAL (v2 data) |
| `v3/.ruvector/intelligence.json` | Jan 7 | 943 KB | 57,233 lines | ⚠️ STALE (RL patterns) |
| `.swarm/memory.db` | Jan 15 | 385 KB | 82 | ❌ LEGACY (archive) |
| `v2/data/ruvector-patterns.db` | Jan 11 | 17 MB | - | ❌ LEGACY (archive) |

### V3 Active Memory (PRIMARY SOURCE)

| Table | Records | Priority | Description |
|-------|---------|----------|-------------|
| `qe_patterns` | 1,073 | HIGH | QE-specific learned patterns |
| `sona_patterns` | 68 | HIGH | Neural backbone patterns |
| `goap_actions` | 40 | HIGH | Planning primitives |
| `kv_store` | 5 | MEDIUM | Queen state, reports |
| `mincut_*` | varies | LOW | Graph analysis |

### Root Memory (HISTORICAL DATA)

| Table | Records | Priority | Description |
|-------|---------|----------|-------------|
| `memory_entries` | 2,060 | HIGH | Historical patterns |
| `events` | 1,082 | MEDIUM | Audit trail |
| `learning_experiences` | 665 | HIGH | RL trajectories |
| `goap_actions` | 61 | HIGH | Planning primitives |
| `patterns` | 45 | HIGH | Learned behaviors |
| `goap_plans` | 27 | MEDIUM | Execution traces |

### Claude-Flow JSON Data

| File | Lines | Priority | Description |
|------|-------|----------|-------------|
| `memory/store.json` | 6,113 | HIGH | ADR analysis, agent patterns |
| `daemon-state.json` | - | MEDIUM | Worker stats (2,059 runs) |
| `metrics/*.json` | 9 files | LOW | Performance metrics |

### V3 Intelligence (RL Q-Learning)

| File | Lines | Priority | Description |
|------|-------|----------|-------------|
| `.ruvector/intelligence.json` | 57,233 | MEDIUM | Q-values, action patterns |

**Data includes:**
- Q-learning state-action pairs with visit counts
- File access memories with embeddings
- Success/failure action patterns

### Data Namespaces in Root `memory_entries`

```
agents, aqe, aqe-workflows, aqe/coverage, aqe/policies,
aqe/qx, aqe/test, baselines, coordination, default,
edge/poc, events, goap, learning, llm-independence,
ooda_cycles, optimizations, qx-analysis, ...
```

---

## 2. Cloud Schema Design

### PostgreSQL Schema for ruvector-postgres

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS ruvector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema for AQE learning data
CREATE SCHEMA IF NOT EXISTS aqe;

-- Memory entries (key-value with namespaces)
CREATE TABLE aqe.memory_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL,
    partition TEXT NOT NULL DEFAULT 'default',
    value JSONB NOT NULL,
    metadata JSONB,
    embedding ruvector(384),  -- For semantic search (ruvector)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    source_env TEXT NOT NULL,  -- 'devpod', 'laptop', 'ci'
    sync_version BIGINT DEFAULT 0,
    UNIQUE(key, partition, source_env)
);

-- Learning experiences (RL trajectories)
CREATE TABLE aqe.learning_experiences (
    id SERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
    task_id TEXT,
    task_type TEXT NOT NULL,
    state JSONB NOT NULL,
    action JSONB NOT NULL,
    reward REAL NOT NULL,
    next_state JSONB NOT NULL,
    episode_id TEXT,
    metadata JSONB,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GOAP actions (planning primitives)
CREATE TABLE aqe.goap_actions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    agent_type TEXT NOT NULL,
    preconditions JSONB NOT NULL,
    effects JSONB NOT NULL,
    cost REAL DEFAULT 1.0,
    duration_estimate INTEGER,
    success_rate REAL DEFAULT 1.0,
    execution_count INTEGER DEFAULT 0,
    category TEXT,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GOAP plans (execution traces)
CREATE TABLE aqe.goap_plans (
    id TEXT PRIMARY KEY,
    goal_id TEXT,
    sequence JSONB NOT NULL,
    initial_state JSONB,
    goal_state JSONB,
    action_sequence JSONB,
    total_cost REAL,
    estimated_duration INTEGER,
    actual_duration INTEGER,
    status TEXT DEFAULT 'pending',
    success BOOLEAN,
    failure_reason TEXT,
    execution_trace JSONB,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Patterns (learned behaviors)
CREATE TABLE aqe.patterns (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    confidence REAL NOT NULL,
    usage_count INTEGER DEFAULT 0,
    metadata JSONB,
    domain TEXT DEFAULT 'general',
    success_rate REAL DEFAULT 1.0,
    embedding ruvector(384),
    source_env TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events (audit log)
CREATE TABLE aqe.events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    source TEXT NOT NULL,
    source_env TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ
);

-- Sync metadata
CREATE TABLE aqe.sync_state (
    source_env TEXT PRIMARY KEY,
    last_sync_at TIMESTAMPTZ,
    last_sync_version BIGINT DEFAULT 0,
    tables_synced JSONB,
    status TEXT DEFAULT 'idle'
);

-- Claude-Flow memory store (JSON → PostgreSQL)
CREATE TABLE aqe.claude_flow_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    category TEXT,  -- 'adr-analysis', 'agent-patterns', etc.
    embedding ruvector(384),
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(key, source_env)
);

-- Claude-Flow daemon worker stats
CREATE TABLE aqe.claude_flow_workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_type TEXT NOT NULL,  -- 'map', 'audit', 'optimize', etc.
    run_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    avg_duration_ms REAL,
    last_run TIMESTAMPTZ,
    source_env TEXT NOT NULL,
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(worker_type, source_env)
);

-- Q-Learning patterns from intelligence.json
CREATE TABLE aqe.qlearning_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state TEXT NOT NULL,
    action TEXT NOT NULL,
    q_value REAL NOT NULL,
    visits INTEGER DEFAULT 0,
    last_update TIMESTAMPTZ,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(state, action, source_env)
);

-- Memory embeddings from intelligence.json
CREATE TABLE aqe.intelligence_memories (
    id TEXT PRIMARY KEY,
    memory_type TEXT NOT NULL,  -- 'file_access', etc.
    content TEXT,
    embedding vector(64),  -- intelligence.json uses 64-dim
    metadata JSONB,
    source_env TEXT NOT NULL,
    timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SONA neural patterns (from v3 memory)
CREATE TABLE aqe.sona_patterns (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    domain TEXT,
    state_embedding ruvector(384),
    action_embedding ruvector(384),
    action_type TEXT,
    action_value JSONB,
    outcome_reward REAL,
    outcome_success BOOLEAN,
    outcome_quality REAL,
    confidence REAL,
    usage_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QE-specific patterns (from v3 memory)
CREATE TABLE aqe.qe_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    qe_domain TEXT,  -- 'test-generation', 'coverage-analysis', etc.
    content JSONB NOT NULL,
    embedding ruvector(384),
    confidence REAL,
    usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 1.0,
    metadata JSONB,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for vector similarity search
CREATE INDEX idx_memory_embedding ON aqe.memory_entries
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_patterns_embedding ON aqe.patterns
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Indexes for queries
CREATE INDEX idx_memory_partition ON aqe.memory_entries(partition);
CREATE INDEX idx_memory_source ON aqe.memory_entries(source_env);
CREATE INDEX idx_learning_agent ON aqe.learning_experiences(agent_id);
CREATE INDEX idx_events_type ON aqe.events(type);
CREATE INDEX idx_patterns_domain ON aqe.patterns(domain);
```

---

## 3. Sync Architecture

### Data Flow (Consolidated from 6+ Sources)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Local Environment                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     PRIMARY (V3 Active)                          │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                       │   │
│  │  │ v3/.agentic-qe/ │  │ v3/.ruvector/   │                       │   │
│  │  │   memory.db     │  │ intelligence.json│                       │   │
│  │  │  (1,186 records)│  │ (57K Q-values)  │                       │   │
│  │  └────────┬────────┘  └────────┬────────┘                       │   │
│  └───────────┼────────────────────┼─────────────────────────────────┘   │
│              │                    │                                     │
│  ┌───────────┼────────────────────┼─────────────────────────────────┐   │
│  │           │    CLAUDE-FLOW (Active)                              │   │
│  │  ┌────────┴────────┐  ┌────────┴────────┐  ┌──────────────┐     │   │
│  │  │ .claude-flow/   │  │ daemon-state    │  │   metrics/   │     │   │
│  │  │ memory/store.json│ │   .json         │  │  (9 files)   │     │   │
│  │  │ (6,113 lines)   │  │ (2,059 runs)    │  └──────────────┘     │   │
│  │  └────────┬────────┘  └────────┬────────┘                       │   │
│  └───────────┼────────────────────┼─────────────────────────────────┘   │
│              │                    │                                     │
│  ┌───────────┼────────────────────┼─────────────────────────────────┐   │
│  │           │     HISTORICAL (Root V2)                             │   │
│  │  ┌────────┴────────┐  ┌────────┴────────┐  ┌──────────────┐     │   │
│  │  │ .agentic-qe/    │  │ .swarm/         │  │ v2/data/     │     │   │
│  │  │   memory.db     │  │   memory.db     │  │ patterns.db  │     │   │
│  │  │ (2,060 records) │  │  (82 records)   │  │  (17 MB)     │     │   │
│  │  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘     │   │
│  └───────────┼────────────────────┼──────────────────┼──────────────┘   │
│              │                    │                  │                  │
│              └────────────────────┼──────────────────┘                  │
│                                   │                                     │
│                          ┌────────▼────────┐                            │
│                          │   Sync Agent    │                            │
│                          │  (TypeScript)   │                            │
│                          │  Consolidates   │                            │
│                          │   All Sources   │                            │
│                          └────────┬────────┘                            │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
                           ┌────────▼────────┐
                           │   IAP Tunnel    │
                           │  (Encrypted)    │
                           └────────┬────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                           Google Cloud                                   │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │                    ruvector-postgres                           │     │
│  │  ┌─────────────────────────────────────────────────────────┐  │     │
│  │  │                     aqe schema                           │  │     │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐│  │     │
│  │  │  │memory_entries│ │qe_patterns │ │claude_flow_memory   ││  │     │
│  │  │  │patterns     │ │sona_patterns│ │qlearning_patterns   ││  │     │
│  │  │  │goap_*       │ │events       │ │intelligence_memories││  │     │
│  │  │  └─────────────┘ └─────────────┘ └─────────────────────┘│  │     │
│  │  └─────────────────────────────────────────────────────────┘  │     │
│  │  ┌─────────────┐                                              │     │
│  │  │  ruvector   │  ← Vector similarity search                  │     │
│  │  │ (indexes)   │                                              │     │
│  │  └─────────────┘                                              │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Sync Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Full** | Sync all records | Initial migration |
| **Incremental** | Only changed records | Regular sync |
| **Append** | Only new records | Events/logs |
| **Bidirectional** | Merge from multiple sources | Multi-env learning |

---

## 4. Implementation Plan

### Phase 1: Schema Migration (Day 1) ✅ COMPLETED
- [x] Create PostgreSQL schema in cloud DB (`v3/src/sync/schema/cloud-schema.sql`)
- [x] Set up ruvector HNSW indexes (using `ruvector_cosine_ops`)
- [x] Create sync_state tracking table
- [x] Apply migration for additional columns (`migration-001.sql`)

### Phase 2: Sync Agent (Days 2-3) ✅ COMPLETED
- [x] Create TypeScript sync agent (`v3/src/sync/sync-agent.ts`)
- [x] Implement IAP tunnel connection (`v3/src/sync/cloud/tunnel-manager.ts`)
- [x] Add SQLite → PostgreSQL data conversion (`v3/src/sync/readers/`)
- [x] Handle JSON/JSONB transformations (auto-wrap non-JSON strings)
- [x] Handle timestamp conversions (Unix ms → ISO 8601)
- [x] Add conflict resolution logic (ON CONFLICT DO UPDATE)

### Phase 3: Initial Migration (Day 4) ✅ COMPLETED
- [x] Full sync of all historical data (5,062 records total)
- [x] Verify data integrity (all tables verified)
- [ ] Generate embeddings for patterns (planned)
- [ ] Test vector similarity search (planned)

### Phase 4: Incremental Sync (Day 5) 🔄 IN PROGRESS
- [x] Implement change detection (incremental mode)
- [ ] Set up periodic sync (cron/hook)
- [x] Add sync status monitoring (`aqe sync status`)
- [x] Handle network failures gracefully (port connectivity check, retries)

### Phase 5: Bidirectional Learning (Day 6+)
- [ ] Enable pattern sharing across environments
- [ ] Implement consensus for conflicting patterns
- [ ] Add cross-environment success rate aggregation

### Sync Results (2026-01-24)
| Source | Records | Status |
|--------|---------|--------|
| v3-qe-patterns | 1,073 | ✅ |
| v3-sona-patterns | 34 | ✅ |
| v3-goap-actions | 40 | ✅ |
| claude-flow-memory | 2 | ✅ |
| root-memory-entries | 2,060 | ✅ |
| root-learning-experiences | 665 | ✅ |
| root-goap-actions | 61 | ✅ |
| root-patterns | 45 | ✅ |
| root-events | 1,082 | ✅ |
| **Total** | **5,062** | ✅ |

---

## 5. Sync Agent Design

### Configuration

```typescript
interface SyncConfig {
  // All local data sources (fragmented)
  local: {
    // PRIMARY - V3 active runtime
    v3MemoryDb: string;           // v3/.agentic-qe/memory.db

    // HISTORICAL - Root v2 data
    rootMemoryDb: string;         // .agentic-qe/memory.db
    rootCacheDb: string;          // .agentic-qe/ruvector-cache.db

    // CLAUDE-FLOW - JSON stores
    claudeFlowMemory: string;     // .claude-flow/memory/store.json
    claudeFlowDaemon: string;     // .claude-flow/daemon-state.json
    claudeFlowMetrics: string;    // .claude-flow/metrics/

    // Q-LEARNING - Intelligence patterns
    intelligenceJson: string;     // v3/.ruvector/intelligence.json

    // LEGACY (archive only)
    swarmMemoryDb: string;        // .swarm/memory.db
    v2PatternsDb: string;         // v2/data/ruvector-patterns.db
  };

  cloud: {
    project: string;              // <your-gcp-project-id>
    zone: string;                 // us-central1-a
    instance: string;             // ruvector-postgres
    database: string;             // aqe_learning
    user: string;                 // ruvector
    tunnelPort: number;           // 15432
  };

  sync: {
    mode: 'full' | 'incremental' | 'bidirectional';
    interval: string;             // '5m', '1h', etc.
    batchSize: number;            // 1000

    // Source priority (higher = sync first)
    sourcePriority: {
      v3Memory: 1,                // PRIMARY
      claudeFlowMemory: 2,        // ACTIVE
      rootMemory: 3,              // HISTORICAL
      intelligenceJson: 4,        // RL DATA
      legacy: 5                   // ARCHIVE
    };

    // Tables/sources to sync
    sources: SyncSource[];
  };

  environment: string;            // 'devpod', 'laptop', 'ci'
}

interface SyncSource {
  name: string;
  type: 'sqlite' | 'json';
  path: string;
  targetTable: string;
  priority: 'high' | 'medium' | 'low';
  mode: 'incremental' | 'full' | 'append';
  transform?: (data: any) => any;
}
```

### Core Sync Operations

```typescript
// Sync operations
async function syncTable(table: string, mode: SyncMode): Promise<SyncResult>;
async function getChangedRecords(table: string, since: Date): Promise<Record[]>;
async function upsertToCloud(table: string, records: Record[]): Promise<void>;
async function resolveConflicts(local: Record, cloud: Record): Record;

// Embedding generation
async function generateEmbedding(text: string): Promise<number[]>;
async function batchGenerateEmbeddings(texts: string[]): Promise<number[][]>;

// Tunnel management
async function startTunnel(): Promise<TunnelConnection>;
async function withTunnel<T>(fn: (conn: Connection) => Promise<T>): Promise<T>;
```

---

## 6. Data Transformation Rules

### SQLite → PostgreSQL Type Mapping

| SQLite Type | PostgreSQL Type | Notes |
|-------------|-----------------|-------|
| TEXT (JSON) | JSONB | Parse and validate |
| INTEGER (timestamp) | TIMESTAMPTZ | Unix ms → ISO |
| REAL | REAL | Direct |
| BLOB | BYTEA | Direct |
| TEXT (embedding) | vector(384) | Parse array |

### Conflict Resolution

| Scenario | Resolution |
|----------|------------|
| Same key, different values | Higher confidence wins |
| Same pattern, different success_rate | Weighted average by usage_count |
| Same event ID | Skip (events are immutable) |
| Newer local vs older cloud | Local wins |

---

## 7. Security Considerations

- **IAP Tunnel**: All traffic encrypted, requires Google auth
- **No public ports**: Database not exposed to internet
- **Environment isolation**: `source_env` column prevents cross-contamination
- **Credential storage**: Use Secret Manager for production
- **Audit logging**: All syncs logged to `events` table

---

## 8. Monitoring & Alerts

### Metrics to Track

- Sync duration per table
- Records synced per run
- Conflict rate
- Failed sync attempts
- Cloud DB storage usage

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Sync duration | > 5 min | > 15 min |
| Failure rate | > 5% | > 20% |
| Days since sync | > 1 day | > 3 days |

---

## 9. CLI Commands ✅ IMPLEMENTED

```bash
# In v3/ directory (or use npm -w v3)
cd v3

# Initial setup
npm run sync:cloud:init        # Generate cloud schema SQL
npm run sync:cloud:config      # Show sync configuration

# Regular sync
npm run sync:cloud             # Incremental sync (default)
npm run sync:cloud:full        # Force full sync

# Status & verification
npm run sync:cloud:status      # Check sync state
npm run sync:cloud:verify      # Verify data integrity

# Or use the CLI directly:
npx tsx src/cli/index.ts sync           # Incremental sync
npx tsx src/cli/index.ts sync --full    # Full sync
npx tsx src/cli/index.ts sync status    # Check status
npx tsx src/cli/index.ts sync verify    # Verify integrity
npx tsx src/cli/index.ts sync config    # Show config
```

### Environment Variables

```bash
# Required
export PGPASSWORD=aqe_secure_2024

# Optional (defaults shown)
export GCP_PROJECT=ferrous-griffin-480616-s9
export GCP_ZONE=us-central1-a
export GCP_INSTANCE=ruvector-postgres
export GCP_DATABASE=aqe_learning
export GCP_USER=ruvector
export GCP_TUNNEL_PORT=15432
export AQE_ENV=devpod
```

---

## 10. Next Steps

1. ~~**Approve this plan**~~ ✅ DONE - Review and confirm approach
2. ~~**Create cloud schema**~~ ✅ DONE - Schema applied with ruvector
3. ~~**Build sync agent**~~ ✅ DONE - TypeScript implementation complete
4. ~~**Initial migration**~~ ✅ DONE - 5,062 records synced
5. **Set up automation** - Cron or hook-based sync (TODO)
6. **Generate embeddings** - Use ruvector for semantic search (TODO)
7. **Enable bidirectional sync** - Multi-environment learning (TODO)

---

## 11. Cloud Infrastructure

### GCE VM Setup

The cloud database runs on a GCE VM with the ruvector-postgres Docker container:

```bash
# VM: ruvector-postgres
# Zone: us-central1-a
# Project: ferrous-griffin-480616-s9

# Docker container running on VM
docker run -d \
  --name ruvector-db \
  -e POSTGRES_USER=ruvector \
  -e POSTGRES_PASSWORD=aqe_secure_2024 \
  -e POSTGRES_DB=aqe_learning \
  -p 5432:5432 \
  ruvnet/ruvector-postgres:latest

# Access via IAP tunnel (no public IP needed)
gcloud compute start-iap-tunnel ruvector-postgres 5432 \
  --local-host-port=localhost:15432 \
  --zone=us-central1-a \
  --project=ferrous-griffin-480616-s9
```

### Security
- No public IP on the VM
- Access only through IAP tunnel with Google authentication
- Database credentials stored in environment variables
