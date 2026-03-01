# SPEC-050-A: ML Observability and Persistence

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-050-A |
| **Parent ADR** | [ADR-050](../adrs/ADR-050-ruvector-neural-backbone.md) |
| **Version** | 1.0 |
| **Status** | In Progress |
| **Last Updated** | 2026-01-20 |
| **Author** | GOAP Specialist |

---

## Overview

This specification covers Actions 1-4 from the GOAP plan: ML Observability Layer, Q-Learning Persistence, SONA Pattern Persistence, and Silent Fallback Removal.

---

## Action 1: ML Observability Layer

**Priority:** P0 (Critical)
**Estimated Time:** 4 hours

### Interface Definition

```typescript
// File: v3/src/integrations/ruvector/observability.ts
export interface MLObservabilityMetrics {
  mlUsed: number;
  fallbackUsed: number;
  mlLatencyMs: number[];
  fallbackReasons: Map<string, number>;
}

export interface MLObservabilityReport {
  mlUsageRate: number;           // mlUsed / (mlUsed + fallbackUsed)
  avgMlLatencyMs: number;
  topFallbackReasons: Array<{ reason: string; count: number }>;
  alertTriggered: boolean;
}

export class RuVectorObservability {
  private metrics: MLObservabilityMetrics;
  private alertThreshold = 0.2; // Alert if ML usage drops below 20%

  recordMLUsage(component: string, used: boolean, latencyMs?: number): void;
  recordFallback(component: string, reason: string): void;
  checkAndAlert(): void; // Emit alert if fallback rate too high
  getReport(): MLObservabilityReport;
}
```

### Requirements

- [x] RuVector wrappers exist (`v3/src/integrations/ruvector/`)
- [x] Fallback implementations exist (`fallback.ts`)
- [ ] All ruvector calls emit metrics
- [ ] `usedML` flag on every routing result
- [ ] Alert system for fallback usage

---

## Action 2: Q-Learning Persistence

**Priority:** P0 (Critical)
**Estimated Time:** 8 hours

### Implementation

```typescript
// File: v3/src/integrations/ruvector/persistent-q-router.ts
export class PersistentQLearningRouter implements QLearningRouter {
  private store: QValueStore;
  private ewcConfig: EWCConfig;

  constructor(config: PersistentQLearningConfig) {
    this.store = createQValueStore();
    this.ewcConfig = {
      lambda: 1000.0,      // EWC regularization strength
      consolidationInterval: 3600000, // 1 hour
      fisherSampleSize: 100,
    };
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
    await this.loadQValues(); // Restore from DB
  }

  async routeTask(task: TestTask): Promise<AgentRoutingResult> {
    const result = await this.mlRoute(task);
    await this.store.setQValue(agentId, stateKey, actionKey, qValue);
    return result;
  }

  private async consolidateWithEWC(): Promise<void> {
    // Apply EWC++ to prevent forgetting old patterns
  }
}
```

### Requirements

- [x] QValueStore exists with SQLite backend
- [x] UnifiedPersistenceManager available
- [x] Q-Learning router exists
- [ ] Q-values persist to `memory.db`
- [ ] Q-values restored on router initialization
- [ ] EWC++ prevents catastrophic forgetting

---

## Action 3: SONA Pattern Persistence

**Priority:** P0 (Critical)
**Estimated Time:** 6 hours

### Implementation

```typescript
// File: v3/src/integrations/ruvector/sona-persistence.ts
export class PersistentSONAEngine extends QESONA {
  private persistence: UnifiedPersistenceManager;

  async initialize(): Promise<void> {
    await super.initialize();
    await this.restorePatterns();
  }

  async storePattern(pattern: QESONAPattern): Promise<void> {
    super.storePattern(pattern);
    await this.persistPattern(pattern);
  }

  private async persistPattern(pattern: QESONAPattern): Promise<void> {
    const db = this.persistence.getDatabase();
    db.prepare(`
      INSERT INTO sona_patterns (id, type, domain, embedding, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(pattern.id, pattern.type, pattern.domain,
           JSON.stringify(pattern.stateEmbedding), pattern.confidence);
  }

  private async restorePatterns(): Promise<void> {
    const patterns = this.persistence.getDatabase().prepare(`
      SELECT * FROM sona_patterns ORDER BY confidence DESC LIMIT 10000
    `).all();
    for (const p of patterns) {
      super.importPatterns([this.deserializePattern(p)]);
    }
  }
}
```

### Requirements

- [x] QESONA wrapper exists
- [x] UnifiedPersistenceManager available
- [ ] SONA patterns persist to `memory.db`
- [ ] Patterns restored on SONA initialization
- [ ] Cross-agent pattern sharing via DB

---

## Action 4: Remove Silent Fallbacks

**Priority:** P1 (High)
**Estimated Time:** 12 hours

### Modified Provider

```typescript
// File: v3/src/integrations/ruvector/provider.ts (modified)
export function createQLearningRouter(config?: QLearningConfig): QLearningRouter {
  const observability = getRuVectorObservability();

  // TRY ML FIRST - no preemptive fallback
  try {
    const router = new RuVectorQLearningRouter(config);
    await router.initialize(); // Will throw if ruvector unavailable
    observability.recordMLUsage('q-learning', true);
    return router;
  } catch (error) {
    // ONLY fall back on actual error
    observability.recordFallback('q-learning', error.message);
    observability.alert({
      component: 'q-learning',
      reason: error.message,
      recommendation: 'Install/fix ruvector to enable ML routing',
    });
    return new FallbackQLearningRouter(); // Still works, but user knows
  }
}
```

### Files to Modify

- `v3/src/integrations/ruvector/provider.ts`
- All domain coordinators that create ruvector components

### Requirements

- [ ] Fallbacks only used on explicit error
- [ ] All fallback usage logged and alerted
- [ ] No more silent degradation

---

## Database Schema Additions

```sql
-- Migration: 20260120_add_sona_patterns.sql

CREATE TABLE IF NOT EXISTS sona_patterns (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  domain TEXT NOT NULL,
  embedding TEXT NOT NULL,  -- JSON array
  confidence REAL DEFAULT 0.0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sona_patterns_domain ON sona_patterns(domain);
CREATE INDEX IF NOT EXISTS idx_sona_patterns_confidence ON sona_patterns(confidence DESC);
```

---

## Agent Assignments

| Action | Agent | Phase |
|--------|-------|-------|
| Action 1 | qe-learning-coordinator | Phase 1 |
| Action 2 | qe-pattern-learner | Phase 1 |
| Action 3 | qe-pattern-learner | Phase 2 |
| Action 4 | qe-test-architect, qe-coverage-specialist | Phase 2 |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | GOAP Specialist | Initial specification |
