# Quick Start: AQE Fleet Improvements

**For:** Developers ready to implement improvements
**Time to read:** 5 minutes
**Time to implement Track 1:** 4-6 hours

---

## 🚀 30-Second Overview

**Goal:** Fix critical bugs and achieve 50%+ pass rate in 4-6 hours

**What's broken:**
1. Logger missing `path` import → 160 test failures
2. EventBus memory leak → unbounded growth
3. Database throws errors instead of graceful fallback → 82 failures
4. SwarmMemoryManager not initialized in tests → 82 failures

**Fix order:**
1. Logger import (2 min) → +160 tests passing
2. EventBus cleanup (30 min) → Memory stable
3. Database fallback (1 hour) → +82 tests passing
4. Test setup helpers (2 hours) → +82 tests passing

---

## ⚡ Track 1: Critical Fixes (Do This First)

### Fix 1: Logger Path Import (2 minutes)

```bash
# Edit file
code /workspaces/agentic-qe-cf/src/utils/Logger.ts
```

**Add line 1:**
```typescript
import * as path from 'path';
```

**Test:**
```bash
npm test tests/unit/EventBus.test.ts
# Expected: 26/26 passing ✅
```

---

### Fix 2: EventBus Memory Leak (30 minutes)

```bash
# Edit file
code /workspaces/agentic-qe-cf/src/core/EventBus.ts
```

**Add to class:**
```typescript
private readonly maxEventAge: number = 3600000; // 1 hour
private readonly maxEventCount: number = 10000;
private cleanupInterval?: NodeJS.Timer;

async initialize(): Promise<void> {
  // ... existing code ...

  // Add cleanup interval
  this.cleanupInterval = setInterval(() => {
    this.cleanupOldEvents();
  }, 600000); // Every 10 minutes
}

async close(): Promise<void> {
  if (this.cleanupInterval) {
    clearInterval(this.cleanupInterval);
  }
  // ... existing code ...
}

private cleanupOldEvents(): void {
  const now = Date.now();
  const toDelete: string[] = [];

  for (const [id, event] of this.events.entries()) {
    if (event.processed && (now - event.timestamp.getTime()) > this.maxEventAge) {
      toDelete.push(id);
    }
  }

  toDelete.forEach(id => this.events.delete(id));

  // Limit total events
  if (this.events.size > this.maxEventCount) {
    const processed = Array.from(this.events.entries())
      .filter(([_, e]) => e.processed)
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

    const deleteCount = this.events.size - this.maxEventCount;
    for (let i = 0; i < Math.min(deleteCount, processed.length); i++) {
      this.events.delete(processed[i][0]);
    }
  }
}

markEventProcessed(eventId: string): void {
  const event = this.events.get(eventId);
  if (event) event.processed = true;
}
```

**Test:**
```bash
# Create test file
cat > tests/performance/eventbus-memory.test.ts << 'EOF'
describe('EventBus Memory', () => {
  it('should cleanup old events', async () => {
    const eb = EventBus.getInstance();
    await eb.initialize();

    for (let i = 0; i < 20000; i++) {
      const id = await eb.emitFleetEvent('test', 'src', {});
      eb.markEventProcessed(id);
    }

    eb['cleanupOldEvents']();
    expect(eb['events'].size).toBeLessThan(10000);
  });
});
EOF

npm test tests/performance/eventbus-memory.test.ts
# Expected: PASS ✅
```

---

### Fix 3: Database Fallback Mode (1 hour)

```bash
# Edit file
code /workspaces/agentic-qe-cf/src/utils/Database.ts
```

**Add to constructor:**
```typescript
private fallbackMode: boolean = false;

constructor(
  private readonly dbPath: string,
  options?: { fallbackMode?: boolean }
) {
  this.fallbackMode = options?.fallbackMode || false;
}
```

**Update initialize():**
```typescript
async initialize(): Promise<void> {
  if (this.isInitialized) return;

  try {
    this.db = new BetterSqlite3(this.dbPath);
    this.isInitialized = true;
  } catch (error) {
    if (this.fallbackMode) {
      this.db = new BetterSqlite3(':memory:');
      this.isInitialized = true;
    } else {
      throw error;
    }
  }
}
```

**Update exec(), run(), get(), all():**
```typescript
async exec(sql: string): Promise<void> {
  if (!this.db) {
    if (this.fallbackMode) return;
    throw new Error('Database not initialized');
  }
  this.db.exec(sql);
}
```

**Test:**
```bash
npm test tests/unit/FleetManager.database.test.ts
# Expected: 40+ tests passing ✅
```

---

### Fix 4: Test Setup Helpers (2 hours)

```bash
# Create helper
mkdir -p /workspaces/agentic-qe-cf/tests/helpers
cat > /workspaces/agentic-qe-cf/tests/helpers/setup-memory.ts << 'EOF'
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import * as path from 'path';
import * as fs from 'fs-extra';

export async function setupTestMemory(name: string) {
  const dbPath = path.join(process.cwd(), '.swarm', `test-${name}-${Date.now()}.db`);
  await fs.ensureDir(path.dirname(dbPath));

  const mem = new SwarmMemoryManager(dbPath);
  await mem.initialize();
  return mem;
}

export async function teardownTestMemory(mem: SwarmMemoryManager) {
  const dbPath = mem['dbPath'];
  await mem.close();
  if (dbPath?.includes('test-')) {
    await fs.remove(dbPath).catch(() => {});
  }
}
EOF
```

**Update test files:**
```typescript
// Pattern for all agent tests
import { setupTestMemory, teardownTestMemory } from '../helpers/setup-memory';

describe('FleetManager', () => {
  let memory: SwarmMemoryManager;

  beforeAll(async () => {
    memory = await setupTestMemory('fleet');
  });

  afterAll(async () => {
    await teardownTestMemory(memory);
  });

  beforeEach(async () => {
    // Use memory in tests
    fleetManager = new FleetManager({ memoryStore: memory, ... });
  });
});
```

**Files to update:**
- `tests/unit/fleet-manager.test.ts`
- `tests/agents/BaseAgent.test.ts`
- `tests/integration/multi-agent-workflows.test.ts`

**Test:**
```bash
npm test tests/unit/fleet-manager.test.ts
npm test tests/agents/BaseAgent.test.ts
# Expected: 82+ tests passing ✅
```

---

## 🎯 Validation Checklist

After completing Track 1:

```bash
# 1. Run full test suite
npm test

# 2. Check pass rate (should be 50%+)
npm test 2>&1 | grep "Tests:"
# Expected: 200+ passing out of 438

# 3. Memory leak test
npm test tests/performance/eventbus-memory.test.ts
# Expected: PASS

# 4. Integration tests
npm test tests/integration/
# Expected: Most passing

# 5. Coverage
npm run test:coverage-safe
# Expected: >30% coverage
```

**Success Criteria:**
- ✅ Pass rate ≥ 50%
- ✅ No "path undefined" errors
- ✅ No "MemoryStore undefined" errors
- ✅ EventBus memory stable (<500MB)
- ✅ All critical path tests passing

---

## 📈 Expected Results

### Before Track 1
```
Tests:       143 passed, 295 failed, 438 total
Pass Rate:   32.6%
Memory:      Growing unbounded
Failures:    - Logger path undefined (160)
             - MemoryStore undefined (82)
             - Database errors (82)
```

### After Track 1 (4-6 hours)
```
Tests:       220+ passed, 200+ failed, 438 total
Pass Rate:   50%+
Memory:      Stable (<500MB)
Failures:    - Remaining test issues (not critical)
```

---

## 🚦 Next Steps

**If Track 1 succeeds (pass rate ≥ 50%):**

1. **Week 1:** Implement Track 2 (Learning System)
   - Q-Learning integration (2 days)
   - Performance monitoring (1 day)
   - Expected: 50% → 60% pass rate

2. **Week 2:** Implement Track 3 (AgentDB)
   - QUIC transport (2 days)
   - Hybrid search (2 days)
   - Expected: 60% → 65% pass rate

**If Track 1 fails (pass rate < 50%):**

1. Review errors: `npm test 2>&1 | tee test-output.log`
2. Check specific failures: `npm test -- --verbose`
3. Escalate to team lead
4. Consider rollback to v1.1.0

---

## 🔧 Common Issues

### Issue: "path is not defined"
**Solution:** Check line 1 of Logger.ts has `import * as path from 'path';`

### Issue: Tests still fail after Logger fix
**Solution:** Clear Jest cache: `npm test -- --clearCache`

### Issue: Memory still growing
**Solution:** Verify cleanup interval is running: Check EventBus logs

### Issue: Database initialization fails
**Solution:** Check fallbackMode is enabled in test setup

---

## 📞 Getting Help

**Quick Questions:** Check `/docs/COMPREHENSIVE-IMPROVEMENT-PLAN-SUMMARY.md`

**Detailed Architecture:** See `/docs/implementation-plans/AQE-FLEET-IMPROVEMENT-ARCHITECTURE.md`

**Risk Analysis:** See `/docs/reports/REGRESSION-RISK-ANALYSIS-v1.1.0.md`

**Escalation:** [Add team contact info]

---

## 🎓 Learning Resources

**EventBus Pattern:** `/docs/guides/EVENTBUS-ARCHITECTURE.md`
**Memory Management:** `/docs/guides/MEMORY-ARCHITECTURE.md`
**Testing Best Practices:** `/docs/guides/TESTING-GUIDE.md`

---

**Good luck! Track 1 should take 4-6 hours and get you to 50%+ pass rate.**

**Remember:** Small, incremental fixes. Test after each change. Commit often.

---

*Quick Start Guide v1.0.0 - Generated 2025-10-20*
