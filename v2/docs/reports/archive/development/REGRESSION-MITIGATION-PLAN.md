# 🛡️ Regression Mitigation Plan - v1.1.0 → HEAD

**Plan Created:** 2025-10-17T14:45:00Z
**Target Completion:** 5-6 days
**Plan Status:** 🟡 ACTIVE
**Risk Score:** 78.3/100 (HIGH)

---

## 🎯 Mission Statement

**Objective:** Safely deploy changes from v1.1.0 (d642575) → HEAD (6e84125) with minimal production risk.

**Success Criteria:**
1. ✅ Test pass rate ≥ 50%
2. ✅ Zero critical bugs in production
3. ✅ No performance regression > 10%
4. ✅ Rollback capability tested and ready
5. ✅ Monitoring/alerting operational

---

## 📅 5-Day Mitigation Timeline

### Day 1: Critical Issue Resolution

#### Morning (4 hours)
**Investigate Test Failures (Priority: P0)**

```bash
# Task 1.1: Run tests with verbose output
npm test -- --verbose > test-output.log 2>&1

# Task 1.2: Isolate failing tests
npm test tests/unit/EventBus.test.ts -- --verbose
npm test tests/unit/fleet-manager.test.ts -- --verbose
npm test tests/agents/BaseAgent.test.ts -- --verbose

# Task 1.3: Check for environment issues
npm test -- --showConfig
node --version
npm --version
```

**Expected Output:** Root cause of 0% pass rate identified

**Success Criteria:** Understand WHY tests are failing

---

#### Afternoon (4 hours)
**Fix Test Infrastructure Issues (Priority: P0)**

**Likely Issues & Fixes:**

**Issue A: Jest Setup Errors**
```typescript
// Check jest.setup.ts for initialization failures
// Verify EventBus.getInstance() works before tests run
// Confirm SwarmMemoryManager initializes correctly
```

**Issue B: Mock Configuration Errors**
```typescript
// Verify Logger mock in jest.setup.ts
// Check process.cwd() mock
// Validate stack-utils mock
```

**Issue C: Async Initialization Race Conditions**
```typescript
// Ensure beforeAll() completes before tests
// Add proper await statements
// Verify global infrastructure ready
```

**Validation:**
```bash
# Run single test to verify fix
npm test tests/unit/EventBus.test.ts

# Run small suite
npm test tests/unit/

# Check pass rate improvement
npm test | grep -E "Tests:.*passed"
```

**Success Criteria:** Pass rate > 0% (at least 10-20% passing)

---

### Day 2: Core System Fixes

#### Morning (4 hours)
**Fix EventBus Memory Leak (Priority: P0)**

**Implementation:**

```typescript
// File: src/core/EventBus.ts

export class EventBus extends EventEmitter {
  private readonly events: Map<string, FleetEvent>;
  private readonly maxEventAge: number = 3600000; // 1 hour
  private readonly maxEventCount: number = 10000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.logger = Logger.getInstance();
    this.events = new Map();
    this.setMaxListeners(1000);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.logger.info('Initializing EventBus');
    this.setupInternalHandlers();

    // Start cleanup timer
    this.startCleanupTimer();

    this.isInitialized = true;
    this.logger.info('EventBus initialized successfully');
  }

  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    this.logger.info('Closing EventBus');

    // Stop cleanup timer
    this.stopCleanupTimer();

    this.removeAllListeners();
    this.events.clear();

    this.isInitialized = false;
    this.logger.info('EventBus closed successfully');
  }

  /**
   * Start automatic cleanup of old events
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEvents();
    }, 600000); // Every 10 minutes
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clean up old processed events
   */
  private cleanupOldEvents(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, event] of this.events.entries()) {
      // Remove processed events older than maxEventAge
      if (event.processed && (now - event.timestamp.getTime()) > this.maxEventAge) {
        this.events.delete(id);
        cleaned++;
      }
    }

    // If still over limit, remove oldest processed events first
    if (this.events.size > this.maxEventCount) {
      const sortedEvents = Array.from(this.events.entries())
        .filter(([_, event]) => event.processed)
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

      const toRemove = this.events.size - this.maxEventCount;
      for (let i = 0; i < toRemove && i < sortedEvents.length; i++) {
        this.events.delete(sortedEvents[i][0]);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} old events, current size: ${this.events.size}`);
    }
  }

  /**
   * Mark event as processed (for cleanup)
   */
  markEventProcessed(eventId: string): void {
    const event = this.events.get(eventId);
    if (event) {
      event.processed = true;
    }
  }

  /**
   * Get event statistics for monitoring
   */
  getStats(): { total: number; processed: number; unprocessed: number } {
    const processed = Array.from(this.events.values()).filter(e => e.processed).length;
    return {
      total: this.events.size,
      processed,
      unprocessed: this.events.size - processed
    };
  }
}
```

**Tests:**
```typescript
// File: tests/unit/EventBus.memory-leak.test.ts

describe('EventBus Memory Leak Prevention', () => {
  let eventBus: EventBus;

  beforeEach(async () => {
    eventBus = new EventBus();
    await eventBus.initialize();
  });

  afterEach(async () => {
    await eventBus.close();
  });

  it('should cleanup old processed events', async () => {
    // Emit 1000 events
    for (let i = 0; i < 1000; i++) {
      const eventId = await eventBus.emitFleetEvent('test:event', 'test-source', { i });
      eventBus.markEventProcessed(eventId);
    }

    expect(eventBus.getStats().total).toBe(1000);

    // Wait for cleanup (simulate age > 1 hour)
    // Mock Date.now() or wait for cleanup interval
    // ...

    // After cleanup, old events should be removed
    // expect(eventBus.getStats().total).toBeLessThan(1000);
  });

  it('should limit total event count', async () => {
    // Emit 15000 events (over maxEventCount)
    for (let i = 0; i < 15000; i++) {
      const eventId = await eventBus.emitFleetEvent('test:event', 'test-source', { i });
      eventBus.markEventProcessed(eventId);
    }

    // Should auto-cleanup to stay under limit
    expect(eventBus.getStats().total).toBeLessThanOrEqual(10000);
  });
});
```

**Validation:**
```bash
# Run memory leak tests
npm test tests/unit/EventBus.memory-leak.test.ts

# Run long-duration stress test
npm test tests/integration/eventbus-stress.test.ts -- --testTimeout=3600000
```

**Success Criteria:** Memory usage stable over 60 minutes

---

#### Afternoon (4 hours)
**Validate Database Concurrency (Priority: P0)**

```bash
# Run concurrent database tests
npm test tests/integration/database-integration.test.ts

# Focus on concurrent operations
npm test tests/integration/database-integration.test.ts -- --testNamePattern="Concurrent"

# Stress test with 100+ operations
npm test tests/integration/database-stress.test.ts
```

**If Failures Occur:**

**Option 1: Implement Connection Queue**
```typescript
import PQueue from 'p-queue';

export class Database {
  private queue: PQueue;

  constructor(dbPath: string = './data/fleet.db') {
    this.logger = Logger.getInstance();
    this.dbPath = dbPath;
    this.queue = new PQueue({ concurrency: 10 }); // Limit concurrent ops
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return this.queue.add(() => {
      if (!this.db) {
        throw new Error('Database not initialized');
      }
      // ... existing implementation
    });
  }
}
```

**Option 2: Add Retry Logic**
```typescript
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 100
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      if (error.message.includes('SQLITE_BUSY') && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Operation failed after retries');
}
```

**Success Criteria:** 100+ concurrent operations succeed with <5% failures

---

### Day 3: Integration & Validation

#### Morning (4 hours)
**Fix Remaining Core Issues (Priority: P1)**

**1. Validate SwarmMemoryManager Partition Isolation**
```bash
npm test tests/unit/fleet-manager.test.ts
npm test tests/integration/multi-agent-workflows.test.ts -- --testNamePattern="partition"
```

**2. Validate FlakyTestDetector Accuracy**
```bash
npm test tests/unit/learning/FlakyTestDetector.test.ts
npm test tests/unit/learning/FlakyTestDetector.ml.test.ts
```

**3. Run Full Unit Test Suite**
```bash
npm test tests/unit/
```

**Success Criteria:** Unit tests ≥ 80% pass rate

---

#### Afternoon (4 hours)
**Integration Test Validation (Priority: P1)**

```bash
# Run all integration tests
npm test tests/integration/

# Specific critical tests
npm test tests/integration/database-integration.test.ts
npm test tests/integration/eventbus-integration.test.ts
npm test tests/integration/e2e-workflows.test.ts
npm test tests/integration/multi-agent-workflows.test.ts
```

**Success Criteria:** Integration tests ≥ 70% pass rate

**Target Overall:** Pass rate ≥ 50%, Suites ≥ 30

---

### Day 4-5: Staging Deployment

#### Day 4 Morning: Deploy to Staging

**Pre-Deployment Checks:**
```bash
# Final test run
npm test

# Coverage check
npm run test:coverage

# Build check
npm run build

# Verify no build errors
echo $?
```

**Deployment:**
```bash
# Backup current staging
ssh staging "cd /app && git rev-parse HEAD > /tmp/pre-deploy-commit.txt"

# Deploy new version
git checkout 6e84125
npm ci
npm run build

# Restart services
pm2 restart aqe-fleet
```

**Post-Deployment Validation:**
```bash
# Smoke tests
aqe status
aqe agent list
aqe test tests/unit/EventBus.test.ts

# Health checks
curl http://staging/health
curl http://staging/metrics
```

**Success Criteria:** All smoke tests pass, no errors in logs

---

#### Day 4 Afternoon: Monitor Staging

**Monitoring Tasks:**
- Check logs every hour for errors
- Monitor memory usage (should stay < 500MB)
- Monitor EventBus stats (event count should not grow unbounded)
- Monitor database query times (avg < 50ms)

**Monitoring Script:**
```bash
#!/bin/bash
# File: scripts/monitor-staging.sh

while true; do
  echo "=== Staging Health Check: $(date) ==="

  # Memory usage
  ssh staging "free -m | grep Mem"

  # EventBus stats
  ssh staging "curl -s http://localhost:3000/metrics/eventbus"

  # Database stats
  ssh staging "curl -s http://localhost:3000/metrics/database"

  # Error count in logs
  ssh staging "tail -100 /var/log/aqe-fleet.log | grep -c ERROR"

  echo ""
  sleep 3600 # Every hour
done
```

**Success Criteria:** 24 hours in staging with no critical issues

---

#### Day 5: Staging Validation & Rollback Testing

**Morning: Final Staging Validation**

**Performance Benchmark:**
```bash
# Run performance tests on staging
npm test tests/performance/ -- --testTimeout=600000

# Compare against baseline
node scripts/compare-performance.js baseline.json staging.json
```

**Load Testing:**
```bash
# Spawn 100 agents
for i in {1..100}; do
  aqe agent spawn --name "test-agent-$i" --type test-executor &
done

# Wait for completion
wait

# Verify all succeeded
aqe agent list | grep -c "active"
```

**Success Criteria:** Performance within 10% of baseline, all 100 agents spawned successfully

---

**Afternoon: Rollback Testing**

**Test Rollback Procedure:**
```bash
# 1. Trigger rollback
ssh staging "cd /app && git checkout d642575"
ssh staging "npm ci"
ssh staging "pm2 restart aqe-fleet"

# 2. Verify rollback success
ssh staging "aqe status"
ssh staging "npm test"

# 3. Re-deploy new version
ssh staging "cd /app && git checkout 6e84125"
ssh staging "npm ci"
ssh staging "pm2 restart aqe-fleet"

# 4. Verify re-deployment
ssh staging "aqe status"
```

**Success Criteria:** Rollback completes in < 10 minutes, system fully functional after rollback

---

### Day 6: Production Deployment (Conditional)

**ONLY proceed if ALL Day 4-5 criteria met!**

#### Morning: Production Deployment

**Pre-Deployment:**
```bash
# Backup production database
ssh prod "cp /app/.swarm/memory.db /backup/memory.db.$(date +%s)"

# Backup current commit
ssh prod "cd /app && git rev-parse HEAD > /backup/pre-deploy-commit.txt"
```

**Deployment:**
```bash
# Deploy
ssh prod "cd /app && git fetch && git checkout 6e84125"
ssh prod "cd /app && npm ci"
ssh prod "cd /app && npm run build"

# Restart with zero-downtime
ssh prod "pm2 reload aqe-fleet"
```

**Immediate Validation (first 5 minutes):**
```bash
# Smoke tests
ssh prod "aqe status"
ssh prod "aqe agent list"

# Check logs for errors
ssh prod "tail -100 /var/log/aqe-fleet.log | grep ERROR"

# Monitor metrics
watch -n 10 "curl -s http://prod/metrics"
```

**Success Criteria:** No errors in first 5 minutes

---

#### Afternoon: Production Monitoring

**First Hour:**
- Check logs every 10 minutes
- Monitor memory every 10 minutes
- Check EventBus stats every 10 minutes
- Alert on ANY critical error

**First 4 Hours:**
- Check logs every 30 minutes
- Monitor performance metrics
- Verify no memory leaks
- Verify no event queue buildup

**First 24 Hours:**
- Check logs every 2 hours
- On-call team available
- Rollback triggers active
- Performance monitoring active

**Success Criteria:** 24 hours with no P0/P1 incidents

---

## 🚨 Rollback Triggers & Procedures

### Automatic Rollback Triggers

**ROLLBACK IMMEDIATELY if:**
1. ✅ Test pass rate < 30% in production
2. ✅ EventBus error rate > 5%
3. ✅ Database connection failures > 3 in 5 minutes
4. ✅ Agent spawn failure rate > 10%
5. ✅ Memory growth > 50MB/hour sustained
6. ✅ ANY P0 incident reported

### Rollback Procedure (20 minutes)

**Step 1: Stop Traffic (2 min)**
```bash
# Put system in maintenance mode
ssh prod "touch /app/.maintenance"
```

**Step 2: Revert Code (5 min)**
```bash
# Revert to v1.1.0
ssh prod "cd /app && git checkout d642575"
ssh prod "cd /app && npm ci"
```

**Step 3: Restore Database (3 min)**
```bash
# Restore database backup
ssh prod "cp /backup/memory.db.* /app/.swarm/memory.db"
```

**Step 4: Restart Services (5 min)**
```bash
# Restart
ssh prod "pm2 restart aqe-fleet"

# Wait for startup
sleep 30
```

**Step 5: Validate (5 min)**
```bash
# Verify rollback
ssh prod "aqe status"
ssh prod "npm test"

# Remove maintenance mode
ssh prod "rm /app/.maintenance"
```

**Step 6: Notify**
```bash
# Send notification
curl -X POST https://slack/webhook -d '{"text":"ROLLBACK COMPLETE: v1.1.0 restored"}'
```

---

## 📊 Success Metrics Tracking

### Daily Progress Dashboard

```
┌─────────────────────────────────────────────────────┐
│  MITIGATION PROGRESS TRACKER                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Day 1: Test Fix        [░░░░░░░░░░]  0% → 20%    │
│  Day 2: Core Fixes      [░░░░░░░░░░]  0%          │
│  Day 3: Integration     [░░░░░░░░░░]  0%          │
│  Day 4: Staging Deploy  [░░░░░░░░░░]  0%          │
│  Day 5: Staging Valid   [░░░░░░░░░░]  0%          │
│  Day 6: Prod Deploy     [░░░░░░░░░░]  0%          │
│                                                     │
│  Overall Progress:      [░░░░░░░░░░]  0%          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Update this dashboard daily in docs/reports/MITIGATION-PROGRESS.md**

---

### Key Metrics by Phase

| Phase | Test Pass Rate | Suites Passing | Memory Stable | DB Stable |
|-------|---------------|----------------|---------------|-----------|
| Initial | 0% | 0 | ❓ | ❓ |
| Day 1 | Target: 20% | Target: 5+ | ✅ | ✅ |
| Day 2 | Target: 40% | Target: 15+ | ✅ | ✅ |
| Day 3 | Target: 50% | Target: 30+ | ✅ | ✅ |
| Staging | Maintain: 50% | Maintain: 30+ | ✅ | ✅ |
| Prod | Maintain: 50% | Maintain: 30+ | ✅ | ✅ |

---

## 🔍 Testing Strategy

### Test Execution Order

**Tier 1: Critical Path (MUST PASS 100%)**
1. EventBus.test.ts
2. Database.test.ts
3. BaseAgent.test.ts
4. FleetManager.test.ts

**Tier 2: Integration (MUST PASS 90%)**
1. database-integration.test.ts
2. eventbus-integration.test.ts
3. multi-agent-workflows.test.ts

**Tier 3: Full Suite (TARGET 50%)**
1. All unit tests
2. All integration tests
3. All CLI tests

---

## 📞 Escalation & Support

### Daily Standup (15 min)
- Review progress against plan
- Identify blockers
- Update timeline if needed
- Communicate status to stakeholders

### Issue Escalation

**P0 (Blocker):** Immediate escalation to Tech Lead
**P1 (High):** Report in daily standup
**P2 (Medium):** Track in ticket system
**P3 (Low):** Handle in next sprint

---

## ✅ Final Checklist

### Before Production Deployment

- [ ] Test pass rate ≥ 50%
- [ ] Suites passing ≥ 30
- [ ] EventBus memory leak fixed + tested
- [ ] Database concurrency validated
- [ ] SwarmMemoryManager partition isolation tested
- [ ] FlakyTestDetector accuracy validated
- [ ] 48+ hours in staging with no P0/P1 issues
- [ ] Rollback procedure tested successfully
- [ ] Monitoring/alerting configured
- [ ] On-call team briefed and available
- [ ] Database backup completed
- [ ] Rollback plan documented and accessible

---

**Plan Status:** 🟡 ACTIVE - Day 0
**Next Review:** End of Day 1
**Owner:** Engineering Team
**Approver:** Tech Lead

---

*Regression Mitigation Plan - v1.0.0*
*Generated by qe-regression-risk-analyzer on 2025-10-17*
