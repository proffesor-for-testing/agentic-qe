# Learning System Consolidation Plan - Executive Summary

**Status**: 🔴 READY FOR IMPLEMENTATION
**Timeline**: 3-4 weeks
**Methodology**: GOAP (Goal-Oriented Action Planning) with SPARC phases
**Agent Coordination**: Claude Flow swarm orchestration

---

## Quick Reference

| Item | Details |
|------|---------|
| **Goal** | Consolidate 3 databases → 1, enable persistent learning |
| **Current State** | 3 databases, memory-only patterns, no improvement |
| **Target State** | 1 unified AgentDB, persistent patterns, 15%+ improvement |
| **Timeline** | Week 1: Migration, Week 2: Engine, Week 3: Agents, Week 4: Validation |
| **Risk Level** | Medium (mitigated with backups + rollback) |
| **Success Metric** | 10-iteration test shows 15% coverage improvement |

---

## The Problem (Sherlock Findings)

**THREE databases, ZERO coordination**:
1. `agentdb.db` (root) - ✅ Works, 1,747 episodes
2. `.agentic-qe/patterns.db` - ❌ Broken, not updated in 23 days
3. `.agentic-qe/memory.db` - ⚠️ 14MB mystery

**Root cause**: Path mismatch + never-initialized database adapter = patterns lost when agent terminates.

**Impact**: Learning system appears to work but agents never actually improve.

---

## The Solution (Option A: Consolidate to AgentDB)

### Why AgentDB?

✅ **Evidence-based decision** (Sherlock methodology):
- Already storing 1,747 episodes successfully
- Vector search works
- Persistence confirmed
- No path confusion
- Multiple failed attempts to fix patterns.db

### What Changes?

```
BEFORE:
agentdb.db                    (1,747 episodes, root folder)
.agentic-qe/patterns.db       (broken, not updated)
.agentic-qe/memory.db         (mystery 14MB)

AFTER:
.agentic-qe/agentdb.db        (unified storage, enhanced schema)
.agentic-qe/patterns.db       (deprecated, archived)
.agentic-qe/memory.db         (investigated, migrated or removed)
```

---

## 4-Phase Implementation (3-4 Weeks)

### Phase 1: Database Consolidation (Week 1)
**Goal**: Single source of truth with data preservation

**Milestones**:
1. Design AgentDB schema v2.0 with `test_patterns` table
2. Create migration script with rollback capability
3. Move `agentdb.db` → `.agentic-qe/agentdb.db`
4. Analyze and migrate/deprecate `memory.db`
5. Create comprehensive backup system

**Success Criteria**:
- ✅ All 1,747 episodes migrated with checksum validation
- ✅ New schema supports test patterns
- ✅ Rollback tested and verified
- ✅ Backups automated

**Agent Coordination** (use Claude Code Task tool):
```javascript
Task("Database Architect", "Design schema v2.0...", "code-analyzer")
Task("Migration Engineer", "Create migration script...", "coder")
Task("Data Investigator", "Analyze memory.db...", "researcher")
Task("Backup Specialist", "Create backup system...", "backend-dev")
Task("Test Engineer", "Create migration tests...", "tester")
```

---

### Phase 2: Learning Engine Integration (Week 2)
**Goal**: Unified learning API for all agents

**Milestones**:
1. Refactor `LearningEngine` to use AgentDB exclusively
2. Add test pattern storage methods
3. Implement vector similarity search for patterns
4. Create pattern retrieval optimization
5. Performance benchmark and optimize

**Success Criteria**:
- ✅ Pattern storage < 50ms (p95)
- ✅ Pattern retrieval < 100ms (p95)
- ✅ 100% unit test coverage
- ✅ Integration tests passing

**Agent Coordination**:
```javascript
Task("Refactoring Specialist", "Refactor LearningEngine...", "coder")
Task("Performance Engineer", "Optimize pattern retrieval...", "perf-analyzer")
Task("Test Engineer", "Create comprehensive tests...", "tester")
Task("Code Reviewer", "Review and verify changes...", "reviewer")
```

---

### Phase 3: Agent Fleet Update (Week 3)
**Goal**: All 19 agents using unified storage

**Milestones**:
1. Update high-priority agents (4 agents)
   - qe-test-generator
   - qe-coverage-analyzer
   - qe-flaky-test-hunter
   - qe-test-executor

2. Update medium-priority agents (4 agents)
   - qe-performance-tester
   - qe-security-scanner
   - qe-quality-analyzer
   - qe-requirements-validator

3. Update low-priority agents (11 remaining agents)

**Success Criteria**:
- ✅ All agents compile without errors
- ✅ All agent tests passing
- ✅ Patterns persist across agent restarts
- ✅ No regression in functionality

**Agent Coordination** (parallel updates):
```javascript
// High priority (parallel execution in single message)
Task("Test Generator Update", "Update TestGeneratorAgent...", "coder")
Task("Coverage Analyzer Update", "Update CoverageAnalyzerAgent...", "coder")
Task("Flaky Hunter Update", "Update FlakyTestHunterAgent...", "coder")
Task("Test Executor Update", "Update TestExecutorAgent...", "coder")

// After high priority succeeds, then medium and low priority
```

---

### Phase 4: CLI Integration & Validation (Week 4)
**Goal**: Complete learning system operational

**Milestones**:
1. Fix CLI commands to query AgentDB
2. Implement `aqe learn status` with metrics
3. Create 10-iteration learning validation test
4. Build learning metrics dashboard
5. Document complete architecture

**Success Criteria**:
- ✅ All CLI commands functional
- ✅ 10-iteration test shows 15%+ improvement
- ✅ Metrics dashboard operational
- ✅ Complete documentation

**Agent Coordination**:
```javascript
Task("CLI Engineer", "Fix CLI commands...", "backend-dev")
Task("Learning Validator", "Create validation suite...", "tester")
Task("Metrics Analyst", "Build metrics dashboard...", "perf-analyzer")
Task("Documentation Specialist", "Document architecture...", "system-architect")
```

---

## Risk Mitigation

### Top Risks & Solutions

| Risk | Mitigation | Rollback |
|------|------------|----------|
| Data loss during migration | Automated backups + checksums | Restore from backup in < 5 min |
| Path changes break code | Feature flags + gradual rollout | Revert commits |
| Performance degradation | Benchmark before/after | Optimize queries + indexes |
| Agent coordination issues | Isolated testing | Disable problematic agents |

### Emergency Rollback Procedure

```bash
# Stop all agents
aqe fleet stop --force

# Restore databases
cp .agentic-qe/backups/agentdb.db.backup.$(date +%Y%m%d) agentdb.db

# Revert to v1.7.0
npm install agentic-qe-cf@1.7.0

# Verify rollback
aqe db verify --schema-version 1.0.0

# Restart agents
aqe fleet start
```

---

## Success Metrics

### Primary KPIs

**Learning Effectiveness**:
- Coverage improvement: > 15% over 10 iterations ⭐
- Pattern retrieval accuracy: > 80% ⭐
- Pattern persistence rate: 100% (zero losses) ⭐

**Performance**:
- Pattern storage time: < 50ms (p95)
- Pattern retrieval time: < 100ms (p95)
- Database size: Monitor growth (acceptable up to 100MB)

**Quality**:
- Test pass rate: > 90%
- Flake rate: < 5%
- Execution time increase: < 10%

### Validation Tests

**10-Iteration Learning Test**:
```bash
# Run same test 10 times, measure improvement
aqe test learning-improvement --iterations 10 --agent qe-test-generator

Expected output:
Iteration 1:  Coverage: 65%, Pass: 80%, Time: 1200ms
Iteration 2:  Coverage: 68%, Pass: 82%, Time: 1150ms
...
Iteration 10: Coverage: 78%, Pass: 95%, Time: 950ms

Improvement: Coverage +13pp (20%), Pass rate +15pp (18%), Time -21%
✅ LEARNING VERIFIED (exceeds 15% target)
```

---

## Timeline & Dependencies

### Gantt Chart

```
Week 1: Foundation
├─ Day 1-2: Schema + Migration script
├─ Day 3-4: Database consolidation
└─ Day 5:   Testing & verification

Week 2: Learning Engine
├─ Day 1-2: LearningEngine refactor
├─ Day 3:   Unit tests
├─ Day 4-5: Performance optimization

Week 3: Agent Fleet Update
├─ Day 1-2: High priority (4 agents)
├─ Day 3-4: Medium priority (4 agents)
└─ Day 5:   Low priority (11 agents)

Week 4: CLI & Validation
├─ Day 1-2: CLI command fixes
├─ Day 3:   End-to-end validation
├─ Day 4:   Metrics dashboard
└─ Day 5:   Documentation & release
```

### Critical Path

1. **Week 1** must complete before Week 2 (database foundation)
2. **Week 2** must complete before Week 3 (API stability)
3. **Week 3** high-priority must succeed before others
4. **Week 4** validates entire system

### Parallel Opportunities

- Week 1: Schema design + Backup system (parallel)
- Week 2: Unit tests + Performance optimization (parallel)
- Week 3: Agent updates (4-5 agents in parallel via Task tool)
- Week 4: CLI fixes + Documentation (parallel)

---

## Agent Coordination Strategy

### Using Claude Code Task Tool

**Recommended approach**: Spawn agents in parallel for maximum efficiency

**Single Message Pattern** (spawn all agents at once):
```javascript
// Week 1: Foundation agents (parallel)
[Single Message]:
  Task("Database Architect", "Design schema v2.0...", "code-analyzer")
  Task("Migration Engineer", "Create migration script...", "coder")
  Task("Data Investigator", "Analyze memory.db...", "researcher")
  Task("Backup Specialist", "Create backup system...", "backend-dev")
  Task("Test Engineer", "Create migration tests...", "tester")

  TodoWrite({
    todos: [
      { content: "Schema v2.0 designed and documented", status: "pending" },
      { content: "Migration script created with rollback", status: "pending" },
      { content: "memory.db analyzed and migration plan created", status: "pending" },
      { content: "Backup system implemented and tested", status: "pending" },
      { content: "Migration tests passing", status: "pending" }
    ]
  })
```

### Optional: MCP Coordination (Complex Orchestration)

For very complex tasks, can use MCP for topology setup:
```javascript
// Optional: Set up swarm topology first
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "specialized"
});

// Then spawn actual working agents via Task tool
Task(...), Task(...), Task(...)
```

---

## Documentation Deliverables

### Architecture Documentation
- `docs/database/schema-v2.md` - Complete database schema
- `docs/architecture/learning-system.md` - System architecture
- `docs/architecture/data-flow.md` - Data flow diagrams

### Implementation Guides
- `docs/implementation/phase-1-migration.md` - Migration procedures
- `docs/implementation/phase-2-learning-engine.md` - Engine refactor
- `docs/implementation/phase-3-agent-updates.md` - Agent update guide
- `docs/implementation/phase-4-cli-integration.md` - CLI changes

### User Documentation
- `docs/reference/learning-system.md` - User guide
- `docs/tutorials/pattern-storage.md` - Pattern usage tutorial
- `docs/troubleshooting/learning-issues.md` - Troubleshooting guide

### Developer Documentation
- `docs/developer/agentdb-api.md` - AgentDB API reference
- `docs/developer/learning-engine-api.md` - LearningEngine API

---

## Next Steps

### Immediate Actions (This Week)

1. **Review & Approve Plan** (1-2 hours)
   - Stakeholder review
   - Risk assessment confirmation
   - Timeline approval

2. **Create Implementation Branch** (10 minutes)
   ```bash
   git checkout -b feature/consolidate-learning-system
   git push -u origin feature/consolidate-learning-system
   ```

3. **Execute Phase 1 - Week 1** (5 days)
   - Spawn foundation agents in parallel
   - Monitor progress via hooks
   - Daily standup reviews
   - Complete all Week 1 milestones

4. **Week 1 Review** (Friday)
   - Verify all success criteria met
   - Review test results
   - Approve progression to Week 2

### Long-Term Tracking

- **Weekly Progress Reports**: Document progress, blockers, metrics
- **Bi-weekly Demos**: Show learning improvement in action
- **Final Review**: Week 4 Friday - Complete verification checklist

---

## Success Criteria (Final Checklist)

Before declaring learning system operational:

```bash
☐ Database count = 1 (.agentic-qe/agentdb.db only)
☐ Data migration complete (1,747 episodes preserved)
☐ Pattern persistence verified (100% success rate)
☐ All CLI commands functional (100% pass rate)
☐ Coverage improvement verified (> 15% in 10 iterations)
☐ Pattern retrieval accuracy > 80%
☐ All 19 agents updated and tested
☐ All tests passing (100% pass rate)
☐ Documentation complete (100% coverage)
☐ Learning metrics dashboard operational
☐ Rollback procedure tested and verified
```

---

## Conclusion

This plan provides a **comprehensive, evidence-based approach** to fixing the QE agent learning system. By consolidating to AgentDB as the single source of truth, we eliminate architectural debt, enable persistent learning, and finally deliver on the promise of "agents that improve over time."

**Key Strengths**:
- ✅ Evidence-based (Sherlock investigation findings)
- ✅ Phased approach (4 weeks, clear milestones)
- ✅ Risk mitigation (backups, rollback, gradual rollout)
- ✅ Agent coordination (Claude Flow for parallel execution)
- ✅ Comprehensive testing (unit, integration, e2e, CLI)
- ✅ Measurable success (15% improvement target)

**Ready to implement**: All planning complete, just need approval to proceed.

---

**Plan Version**: 1.0
**Created**: November 16, 2025
**Methodology**: GOAP with SPARC integration
**Full Details**: See `/docs/plans/learning-system-implementation-detailed.md`
**Investigation**: See `/docs/investigation/sherlock-pattern-storage-investigation.md`
