# How to Use the Final Validation Orchestrator

**Version:** 1.0.0
**Last Updated:** 2025-10-17

---

## Quick Start

The Final Validation Orchestrator is **already running** and monitoring your Comprehensive Stability Sprint. This guide explains how to interact with it.

---

## What It Does (Automatically)

### Every 3 Minutes
- Monitors all 9 agent workstreams
- Checks for progress updates in SwarmMemoryManager
- Logs agent status changes

### Every 15 Minutes
- Runs full test suite (`npm test`)
- Generates coverage report
- Creates new validation checkpoint
- Updates GO criteria progress
- Makes GO/NO-GO assessment

### Every 5 Minutes
- Updates real-time dashboard
- Refreshes metrics display
- Shows progress toward targets

---

## Key Files & Locations

### 📊 Dashboard (Updated Every 5 Min)
```
/workspaces/agentic-qe-cf/docs/reports/COMPREHENSIVE-STABILITY-DASHBOARD.md
```
**Contents:**
- Overall progress percentage
- Pass rate vs target (70%)
- Coverage vs target (20%)
- GO criteria status
- Checkpoint history

### 📈 Status Report
```
/workspaces/agentic-qe-cf/docs/reports/VALIDATION-ORCHESTRATOR-STATUS.md
```
**Contents:**
- Complete orchestrator status
- All workstream details
- Database evidence
- Timeline projections

### 💾 Database
```
/workspaces/agentic-qe-cf/.swarm/memory.db
```
**Contents:**
- All validation checkpoints
- GO criteria tracking
- Agent workstream status
- Performance metrics

---

## Manual Commands

### Start Continuous Monitoring
```bash
npx ts-node scripts/monitoring-orchestrator.ts
```
This runs indefinitely until you press Ctrl+C.

### View All Validation Data
```bash
./scripts/query-all-validation-data.sh
```
Shows:
- Orchestrator status
- All checkpoints
- GO criteria
- Workstream progress
- Metrics

### Check Specific Checkpoint
```bash
npx ts-node scripts/query-aqe-memory.ts \
  --key "aqe/validation/checkpoint-1" \
  --partition coordination
```

### Generate Final Report
```bash
npx ts-node scripts/generate-final-report.ts
```
Creates comprehensive Sprint completion report.

### Re-run Single Validation
```bash
npx ts-node scripts/initialize-validation.ts
```
Generates a new checkpoint without waiting 15 minutes.

---

## Understanding the Dashboard

### Example Dashboard
```markdown
## Overall Progress: 34% Complete

| Workstream | Status | Progress |
|-----------|--------|----------|
| Quick Fixes | 🟡 Pending | 0% |
| Test Suite Completion | 🟡 Pending | 0% |
| Coverage Expansion | 🟡 Pending | 0% |
| Integration Tests | 🟡 Pending | 0% |

## Current Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Pass Rate | 43.1% | 70% | 🟡 |
| Coverage | 1.2% | 20% | 🟡 |
```

### Status Emojis
- ✅ **Complete/Met** - Criteria achieved
- 🟡 **In Progress** - Work underway
- ❌ **Not Met** - Below threshold
- 🔴 **Failing** - Critical issue

---

## Tracking Agent Progress

### How Agents Report Progress
1. Agent completes work
2. Agent stores status in SwarmMemoryManager:
   ```typescript
   await memoryStore.store('tasks/BATCH-002/status', {
     timestamp: Date.now(),
     status: 'complete',
     progress: 100,
     testsFixed: 45,
     testsAdded: 75
   }, { partition: 'coordination', ttl: 86400 });
   ```
3. Orchestrator detects update (every 3 min)
4. Dashboard reflects changes (every 5 min)
5. Next validation includes agent's contributions

### Check Agent Status
```bash
# Check specific agent workstream
npx ts-node scripts/query-aqe-memory.ts \
  --key "tasks/QUICK-FIXES-SUMMARY/status" \
  --partition coordination

# Check all agents
./scripts/query-all-validation-data.sh
```

---

## Understanding GO Criteria

### Option A: Intermediate Safety Net
**Requirements:**
- Pass rate ≥ 70%
- Coverage ≥ 15%

**When to Check:**
- After quick fixes complete
- After 2-3 test suite batches done
- Estimated: Hours 8-12 of sprint

### Option B: Final Safety Net
**Requirements:**
- Pass rate ≥ 70%
- Coverage ≥ 20%
- Integration tests passing

**When to Check:**
- After all coverage phases complete
- After integration suites done
- Estimated: Hours 18-24 of sprint

### Checking GO Criteria
```bash
# Get current GO criteria status
npx ts-node scripts/query-aqe-memory.ts \
  --key "aqe/validation/go-criteria" \
  --partition coordination
```

**Example Output:**
```json
{
  "optionA": {
    "passRate": 43.1,
    "coverage": 1.2,
    "met": false,
    "target": { "passRate": 70, "coverage": 15 }
  },
  "optionB": {
    "passRate": 43.1,
    "coverage": 1.2,
    "integrationPassing": false,
    "met": false,
    "target": { "passRate": 70, "coverage": 20 }
  }
}
```

---

## Viewing Checkpoints

### List All Checkpoints
```bash
# Get checkpoints 1-10
for i in {1..10}; do
  echo "=== Checkpoint $i ==="
  npx ts-node scripts/query-aqe-memory.ts \
    --key "aqe/validation/checkpoint-$i" \
    --partition coordination
  echo ""
done
```

### Checkpoint Data Structure
```json
{
  "timestamp": 1760702496223,
  "agent": "final-validation-orchestrator",
  "passRate": 43.11,
  "coverage": 1.24,
  "status": "in-progress",
  "testsFixed": 0,
  "testsAdded": 0,
  "testsPassing": 294,
  "testsFailing": 388,
  "totalTests": 682
}
```

---

## Troubleshooting

### Dashboard Not Updating
```bash
# Check orchestrator initialization
npx ts-node scripts/query-aqe-memory.ts \
  --key "aqe/validation/orchestrator-initialized" \
  --partition coordination

# Expected output:
# {
#   "timestamp": 1760702496223,
#   "agent": "final-validation-orchestrator",
#   "status": "active",
#   "monitoring": true
# }
```

### No New Checkpoints
1. **Check if tests are running:**
   ```bash
   npm test
   ```
2. **Manually trigger validation:**
   ```bash
   npx ts-node scripts/initialize-validation.ts
   ```
3. **Verify test results available:**
   ```bash
   ls -lh /tmp/validation-checkpoint-*.log
   ```

### Database Issues
```bash
# Check database exists and size
ls -lh .swarm/memory.db*

# Should show:
# memory.db (1-5MB)
# memory.db-shm
# memory.db-wal
```

### Agent Not Reporting
```bash
# Check if agent initialized
npx ts-node scripts/query-aqe-memory.ts \
  --key "tasks/BATCH-002/status" \
  --partition coordination

# If no data, agent hasn't started yet or failed to initialize
```

---

## Reading the Final Decision

When GO criteria are met, the orchestrator stores a final decision:

```bash
npx ts-node scripts/query-aqe-memory.ts \
  --key "aqe/validation/final-decision" \
  --partition coordination
```

**Example Final Decision:**
```json
{
  "timestamp": 1760750000000,
  "decision": "GO",
  "passRate": 72.1,
  "coverage": 21.3,
  "integrationTestsPassing": true,
  "safetyNetScore": 75.78,
  "readyForSprint3": true,
  "metricsComparison": {
    "before": { "passRate": 6.82, "coverage": 1.30 },
    "after": { "passRate": 72.1, "coverage": 21.3 }
  }
}
```

---

## Best Practices

### 1. Check Dashboard Regularly
- Open dashboard file in editor
- Refresh every 5-10 minutes
- Watch for status emoji changes

### 2. Don't Interrupt Validations
- Let full test suite complete
- Don't kill process during checkpoint generation
- Wait 15 minutes between manual validations

### 3. Monitor Database Growth
- Database will grow to 5-10MB during sprint
- WAL file is normal and expected
- No cleanup needed until sprint complete

### 4. Trust the Automation
- Orchestrator runs continuously
- No need to manually trigger validations
- Dashboard updates automatically

---

## Expected Progress Timeline

### Hour 0-4: Quick Fixes
- **Checkpoints:** 1-3
- **Pass Rate:** 43% → 55-60%
- **Coverage:** 1.2% → 5-8%
- **Status:** 🟡 In Progress

### Hour 4-12: Test Suite Expansion
- **Checkpoints:** 4-8
- **Pass Rate:** 60% → 68%
- **Coverage:** 8% → 12-15%
- **Status:** 🟡 Approaching Option A

### Hour 12-18: Coverage Push
- **Checkpoints:** 9-12
- **Pass Rate:** 68% → 70%+
- **Coverage:** 15% → 20%+
- **Status:** ✅ Option A Met, 🟡 Option B in progress

### Hour 18-24: Integration Validation
- **Checkpoints:** 13-16
- **Pass Rate:** 70%+ (stable)
- **Coverage:** 20%+ (stable)
- **Integration:** ✅ Passing
- **Status:** ✅ Option B Met → GO!

---

## Success Indicators

### You Know It's Working When:
1. Dashboard file timestamp updates every 5 minutes
2. New checkpoints appear in database every 15 minutes
3. Pass rate and coverage increase over time
4. Agent workstreams show progress updates
5. GO criteria `met` flags eventually turn `true`

### You'll Know You're Done When:
1. Dashboard shows "Option B ✅"
2. All workstreams show "✅ Complete"
3. Final decision key exists in database
4. Safety net score ≥ 70
5. `readyForSprint3: true`

---

## Questions & Support

### Check Status
```bash
# One command to see everything
./scripts/query-all-validation-data.sh
```

### View Logs
```bash
# Test execution logs
ls -lh /tmp/validation-checkpoint-*.log

# Coverage reports
ls -lh coverage/
```

### Database Queries
```bash
# See all coordination data
npx ts-node scripts/query-aqe-memory.ts \
  --partition coordination

# See all metrics
npx ts-node scripts/query-aqe-memory.ts \
  --partition metrics
```

---

## Key Takeaways

1. **It's Already Running** - Orchestrator is active and monitoring
2. **No Manual Work Needed** - Everything is automated
3. **Dashboard is Your Friend** - Check it for real-time status
4. **Database Has All Evidence** - Complete audit trail maintained
5. **GO Decision is Automatic** - Will trigger when criteria met
6. **Trust the Process** - Let agents complete their work

---

**Orchestrator Status:** ✅ OPERATIONAL
**Your Action Required:** 🟡 MONITOR DASHBOARD
**Next Milestone:** Checkpoint 2 (15 min after agent activity)

*Happy Monitoring! The orchestrator has your back.* 🚀
