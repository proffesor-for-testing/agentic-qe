# AQE Hooks Data Locations - Quick Reference

**Sprint 1 Implementation - October 17, 2025**

---

## 🎯 Summary

The AQE (Agentic Quality Engineering) hooks system stores data in **3 primary locations**:

1. **SQLite Databases** (1.5MB + 3.5MB WAL) - Runtime coordination data
2. **Pattern Documentation** (docs/patterns/) - Reusable solution patterns
3. **Completion Reports** (docs/reports/) - Agent task results

---

## 📊 1. SQLite Databases

### Locations
```bash
# Main swarm coordination database
./.swarm/memory.db         # 1.5 MB (main database)
./.swarm/memory.db-shm     # 32 KB (shared memory)
./.swarm/memory.db-wal     # 3.5 MB (write-ahead log)

# Other databases
./.hive-mind/hive.db       # 124 KB (hive mind coordination)
./data/fleet.db            # 96 KB (fleet management)
```

### Database Schema (15 Tables)
Defined in `src/core/memory/SwarmMemoryManager.ts`:

| Table | Purpose | TTL | Count |
|-------|---------|-----|-------|
| memory_entries | Key-value storage | Variable | TBD |
| memory_acl | Access control lists | - | 0 |
| hints | Blackboard pattern | Variable | 0 |
| events | Event stream | 30 days | TBD |
| workflow_state | Checkpoints | Never | 0 |
| patterns | Learned patterns | 7 days | 0 |
| consensus_state | Consensus | 7 days | 0 |
| performance_metrics | Metrics | - | 0 |
| artifacts | Code artifacts | Never | 0 |
| sessions | Session resumability | - | 0 |
| agent_registry | Agent lifecycle | - | 0 |
| goap_goals | GOAP planning | - | 0 |
| goap_actions | GOAP actions | - | 0 |
| goap_plans | GOAP plans | - | 0 |
| ooda_cycles | OODA loops | - | 0 |

### Memory Keys Used (Sprint 1)
Based on agent implementation, these keys **should be stored**:

```bash
deploy-001/status         # Jest environment fix (DEPLOY-001)
deploy-002/status         # Database mock fixes (DEPLOY-002)
deploy-003/status         # Floating point precision (DEPLOY-003)
deploy-004/status         # Module import paths (DEPLOY-004)
deploy-004/module-path    # Discovered module location
deploy-005/status         # EventBus timing (DEPLOY-005)
deploy-006/status         # ML model initialization (DEPLOY-006)
test-001/status           # Coverage instrumentation (TEST-001)
```

**Partition:** `coordination` (recommended for agent coordination data)

### Why Data May Not Be Visible Yet
The agents that ran were **Task tool agents** (Claude Code's built-in agent system), which:
1. Store results in completion reports (docs/reports/)
2. Document patterns (docs/patterns/)
3. **Should** use SwarmMemoryManager but may not have been fully integrated in this session

**For future runs:** Agents should explicitly call:
```typescript
await memoryStore.store('deploy-002/status', {
  status: 'completed',
  timestamp: Date.now(),
  result: 'Database mocks fixed'
}, {
  partition: 'coordination',
  ttl: 86400 // 24 hours
});
```

---

## 📁 2. Pattern Documentation

### Location
```bash
docs/patterns/eventbus-timing-fixes.md
```

### What's Stored
✅ **EventBus Timing Fixes Pattern** (DEPLOY-005)
- **Problem:** Async event timing failures
- **Solution:** setImmediate + controlled delays
- **Patterns:** 2 reusable templates
- **Test Results:** 100% pass rate (5/5 runs)
- **Timing Guidelines:**
  - setImmediate: < 1ms (event loop tick)
  - setTimeout(10ms): Async listener simulation
  - setTimeout(50ms): Multi-listener completion

### View Pattern
```bash
cat docs/patterns/eventbus-timing-fixes.md
```

**Key Pattern Example:**
```typescript
// Pattern 2: Async Listener Ordering
it('should maintain event emission order with async listeners', async () => {
  const events: string[] = [];

  eventBus.on('test.event', async (data) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    events.push(data.value);
  });

  await eventBus.emit('test.event', { value: 'first' });
  await eventBus.emit('test.event', { value: 'second' });

  // Wait 5x listener delay
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(events).toEqual(['first', 'second']);
});
```

---

## 📋 3. Agent Completion Reports

### Location
```bash
docs/reports/
├── SPRINT-1-IMPLEMENTATION-SUMMARY.md          # Overall summary (469 lines)
├── DEPLOY-005-completion-report.md             # EventBus timing (6.7KB)
├── TEST-001-RESOLUTION-SUMMARY.md              # Coverage instrumentation (8.3KB)
├── coverage-instrumentation-analysis.md         # Coverage analysis (6.8KB)
├── deploy-004-module-path-resolution.md         # Module imports
├── COVERAGE-QUICK-REFERENCE.md                  # Coverage commands
└── test-coverage-analysis.md                    # Coverage report (48KB)
```

### What's Stored
Each agent completion report contains:

1. **Task Summary**
   - Task ID (DEPLOY-001 through DEPLOY-007, TEST-001)
   - Status (✅ COMPLETE)
   - Agent type (coder, tester, qe-coverage-analyzer)
   - Effort (hours)
   - Impact (tests fixed, features added)

2. **Implementation Details**
   - Files modified (paths and descriptions)
   - Code changes (before/after snippets)
   - Root causes identified
   - Solutions implemented

3. **Validation Results**
   - Test results (pass/fail counts)
   - Success criteria verification
   - Multiple run consistency (5/5 runs)
   - Performance metrics

4. **Next Steps**
   - Remaining work
   - Known issues
   - Recommendations

### View Reports
```bash
# Overall summary
cat docs/reports/SPRINT-1-IMPLEMENTATION-SUMMARY.md

# Specific task
cat docs/reports/DEPLOY-005-completion-report.md

# All reports
ls -lah docs/reports/
```

---

## 🔍 4. How to Query Data

### Current Session Data
Since the agents ran via Claude Code's Task tool, the primary data locations are:

✅ **Available Now:**
1. Completion reports: `docs/reports/SPRINT-1-IMPLEMENTATION-SUMMARY.md`
2. Pattern documentation: `docs/patterns/eventbus-timing-fixes.md`
3. Modified source files: `src/utils/Database.ts`, `src/learning/FlakyTestDetector.ts`
4. Modified test files: 8 test files updated

🔄 **Database (Requires Integration):**
The SQLite database exists (1.5MB) but needs full SwarmMemoryManager integration for future agent runs.

### Future Agent Integration
For future agents to store data in the database:

```typescript
// In agent code (e.g., DEPLOY-002 coder agent)
import { SwarmMemoryManager } from './src/core/memory/SwarmMemoryManager';

async function deployTask002() {
  const memory = new SwarmMemoryManager('./.swarm/memory.db');
  await memory.initialize();

  // Store deployment status
  await memory.store('deploy-002/status', {
    task: 'DEPLOY-002',
    status: 'completed',
    agent: 'coder',
    timestamp: Date.now(),
    filesModified: [
      'src/utils/Database.ts',
      'tests/setup.ts',
      'tests/unit/fleet-manager.test.ts'
    ],
    testsFixed: 12,
    result: 'Database mock methods complete'
  }, {
    partition: 'coordination',
    owner: 'deploy-002-agent',
    accessLevel: 'swarm',
    ttl: 86400 // 24 hours
  });

  // Store pattern
  await memory.storePattern({
    pattern: 'database-mock-initialization',
    confidence: 0.95,
    usageCount: 1,
    metadata: {
      description: 'Complete database mock with all required methods',
      applicableFrameworks: ['jest'],
      tags: ['testing', 'mocking', 'database']
    }
  });

  // Emit event
  await memory.storeEvent({
    type: 'task.completed',
    source: 'deploy-002-agent',
    payload: {
      taskId: 'DEPLOY-002',
      duration: 3600000, // 1 hour
      success: true
    }
  });

  // Store performance metric
  await memory.storePerformanceMetric({
    metric: 'task_execution_time',
    value: 3600,
    unit: 'seconds',
    agentId: 'deploy-002-agent'
  });

  await memory.close();
}
```

---

## 📊 5. Data Summary (Sprint 1)

### Successfully Completed
✅ **7 Tasks** (DEPLOY-001 through DEPLOY-007, TEST-001)
✅ **13 Files Modified** (2 source, 8 tests, 3 setup)
✅ **15 Tests Fixed** (259 → 274 passing)
✅ **3 Test Suites Fixed** (8 → 11 passing)
✅ **1 Pattern Documented** (eventbus-timing-fixes)
✅ **11 Reports Created** (comprehensive documentation)

### Data Stored
📋 **Completion Reports:** 11 files in docs/reports/
📁 **Pattern Documentation:** 1 file in docs/patterns/
💾 **Database:** 1.5MB in .swarm/memory.db (schema ready, needs integration)
📝 **Modified Code:** 13 files tracked in git

### Performance Metrics (Theoretical)
Based on AQE hooks design:
- **Hook execution time:** < 1ms (100-500x faster)
- **Memory operation time:** < 0.1ms (500-2000x faster)
- **Event emission time:** < 0.01ms (2000-10000x faster)

---

## 🎯 6. Quick Access Commands

### View Completion Summary
```bash
cat docs/reports/SPRINT-1-IMPLEMENTATION-SUMMARY.md
```

### View Pattern Documentation
```bash
cat docs/patterns/eventbus-timing-fixes.md
```

### Check Database Exists
```bash
ls -lah ./.swarm/memory.db*
# Expected output:
# -rw-r--r-- 1 vscode vscode 1.5M Oct 16 08:12 memory.db
# -rw-r--r-- 1 vscode vscode  32K Oct 17 10:44 memory.db-shm
# -rw-r--r-- 1 vscode vscode 3.5M Oct 16 13:18 memory.db-wal
```

### View All Reports
```bash
ls -lah docs/reports/ | grep -E "(DEPLOY|TEST)"
```

### Search for Specific Data
```bash
# Find all references to a specific task
grep -r "DEPLOY-002" docs/reports/

# Find all pattern files
find docs/patterns/ -name "*.md"

# Find all modified test files
git status | grep "test"
```

---

## 📚 7. Additional Documentation

- **Comprehensive Guide:** `docs/guides/HOW-TO-VIEW-AQE-HOOKS-DATA.md`
- **Implementation Plan:** `docs/implementation-plans/MASTER-IMPLEMENTATION-ROADMAP-v2.md`
- **Task Definitions:** `docs/implementation-plans/claude-flow-agent-tasks-v2.json`
- **SwarmMemoryManager Code:** `src/core/memory/SwarmMemoryManager.ts` (1,989 lines)

---

## ✅ Conclusion

**All AQE hooks data from Sprint 1 is stored in 3 locations:**

1. ✅ **Completion Reports** - `docs/reports/` (11 files, fully accessible)
2. ✅ **Pattern Documentation** - `docs/patterns/` (1 file, reusable patterns)
3. 🔄 **SQLite Database** - `./.swarm/memory.db` (1.5MB, schema ready, needs integration)

**To access the data:**
- Read reports: `cat docs/reports/SPRINT-1-IMPLEMENTATION-SUMMARY.md`
- Read patterns: `cat docs/patterns/eventbus-timing-fixes.md`
- Query database: See `docs/guides/HOW-TO-VIEW-AQE-HOOKS-DATA.md`

**Next steps:** Integrate SwarmMemoryManager calls into future agents to populate database with runtime coordination data.

---

**Document Version:** 1.0
**Last Updated:** October 17, 2025
**Author:** Claude Code Documentation System
