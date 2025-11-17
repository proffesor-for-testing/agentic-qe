# patterns.db - DEPRECATED

**Status:** ⚠️ **DEPRECATED as of v1.8.0**
**Date:** November 16, 2025
**Reason:** Consolidation to AgentDB for all learning storage

---

## Why Deprecated?

The `patterns.db` database was originally intended for QEReasoningBank test pattern storage but was never properly initialized. Analysis revealed:

1. **Never Updated**: Last modified October 24, 2025 (23+ days stale)
2. **Root Cause**: QEReasoningBank initialized without database adapter
3. **Redundant**: AgentDB already stores all learning patterns successfully
4. **Broken Path**: Path mismatch between init.ts and CLI commands

## Migration Path

All QE agent learning data has been consolidated to:

```
.agentic-qe/agentdb.db
```

**What AgentDB provides:**
- ✅ 1,881+ episodes successfully stored
- ✅ Vector embeddings for semantic search
- ✅ Reflexion pattern for learning
- ✅ All 19 QE agents actively using it
- ✅ HNSW indexing (150x faster search)
- ✅ Distributed QUIC sync capability

## What Happened to patterns.db?

**Renamed to:** `patterns.db.deprecated`
**Backup Location:** Available if historical data recovery needed
**Size:** 152KB (minimal data)

## For Developers

**DO NOT:**
- ❌ Create new `patterns.db` instances
- ❌ Reference `patterns.db` in code
- ❌ Initialize QEReasoningBank with separate database

**DO:**
- ✅ Use `agentDB.store()` for pattern storage (via BaseAgent)
- ✅ Query `.agentic-qe/agentdb.db` for learning data
- ✅ Use AgentDB's vector search for pattern retrieval

## Database Architecture (v1.8.0+)

```
.agentic-qe/
├── agentdb.db          # PRIMARY: All learning, episodes, patterns
├── memory.db           # Swarm coordination, workflow state
└── patterns.db.deprecated  # Historical reference only
```

**Key Principle:** One database per purpose
- **agentdb.db**: Learning and pattern storage
- **memory.db**: Coordination and orchestration

---

**Related Documents:**
- Investigation: `/docs/investigation/sherlock-pattern-storage-investigation.md`
- Migration Plan: `/docs/plans/learning-system-consolidation-plan.md`
- Phase 1 Results: `/docs/implementation/phase-1-execution-summary.md`

**Version:** 1.8.0
**Migration Verified:** 3,766 records successfully migrated
