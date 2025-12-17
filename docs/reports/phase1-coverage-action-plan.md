# Phase 1 Coverage: Immediate Action Plan

**Status:** 🔴 **CRITICAL** - Coverage at 1.36% (Target: 60%)
**Root Cause:** Test execution failures preventing coverage measurement
**Timeline:** 7-day sprint to 60% coverage

---

## 🚨 Critical Blockers (P0) - Fix First

### 1. FleetManager Agent Initialization Failure
**Impact:** 29 test failures, blocks all database integration tests
**Error:** `TypeError: Cannot read properties of undefined (reading 'initialize')`
**Location:** `src/core/FleetManager.ts:227`

**Fix Required:**
```typescript
// Current code (line 225-227):
this.agents.set(agentId, agent as any);
await agent.initialize(); // ← agent is undefined here

// Root cause: Agent factory returning undefined
// Check: createInitialAgents() agent creation
```

**Action Items:**
- [ ] Review agent factory in FleetManager
- [ ] Ensure all agent types have valid constructors
- [ ] Add null checks before agent.initialize()
- [ ] Add unit tests for agent creation

**Expected Impact:** +15% coverage gain
**Time Estimate:** 4-6 hours
**Assignee:** [TBD]

---

### 2. MCP Module Resolution Errors
**Impact:** All MCP tool tests failing, blocks 74 test files
**Error:** `Cannot find module '../../src/mcp/server.js'`
**Location:** `tests/mcp/*.test.ts`, `src/mcp/server.ts`

**Fix Required:**
```typescript
// Tests expecting: '../../src/mcp/server.js'
// But only have: '../../src/mcp/server.ts'

// Option 1: Fix imports in tests
import { AgenticQEMCPServer } from '../../src/mcp/server'; // No .js

// Option 2: Ensure build step runs
npm run build  // Generates .js files
```

**Action Items:**
- [ ] Update all MCP test imports to remove `.js` extensions
- [ ] OR ensure `dist/` is built before tests
- [ ] Update jest.config.js moduleNameMapper if needed
- [ ] Add pre-test build hook

**Expected Impact:** +12% coverage gain
**Time Estimate:** 2-3 hours
**Assignee:** [TBD]

---

### 3. CLI TypeScript Mock Syntax Errors
**Impact:** 3 CLI test files blocked
**Error:** `TS1005: ',' expected` in Jest mock implementation
**Location:** `tests/cli/quality.test.ts`, `test.test.ts`, `workflow.test.ts`

**Fix Required:**
```typescript
// Current (broken):
jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`process.exit(${code})`);
});

// Fixed:
jest.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
  throw new Error(`process.exit(${code})`);
} as any);

// OR use proper Jest types:
jest.spyOn(process, 'exit').mockImplementation(
  jest.fn((code?: number | string) => {
    throw new Error(`process.exit(${code})`);
  }) as any
);
```

**Action Items:**
- [ ] Fix mock type definitions in 3 CLI test files
- [ ] Update Jest types in tsconfig.json if needed
- [ ] Add eslint rule to catch this pattern
- [ ] Document proper Jest mock patterns

**Expected Impact:** +8% coverage gain
**Time Estimate:** 1-2 hours
**Assignee:** [TBD]

---

### 4. Monitor Test Cleanup Errors
**Impact:** Historical comparison tests blocked
**Error:** `TypeError: path argument must be string, received undefined`
**Location:** `tests/cli/monitor.test.ts:328`

**Fix Required:**
```typescript
// Current (broken):
afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }); // tempDir undefined
});

// Fixed:
afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

// Better: Ensure initialization
let tempDir: string;
beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-test-'));
});
```

**Action Items:**
- [ ] Add null check in afterEach cleanup
- [ ] Ensure tempDir initialized in beforeEach
- [ ] Add test for tempDir creation
- [ ] Document test cleanup patterns

**Expected Impact:** +2% coverage gain
**Time Estimate:** 30 minutes
**Assignee:** [TBD]

---

## 📊 Expected Impact Summary

| Fix | Coverage Gain | Time | Priority |
|-----|---------------|------|----------|
| FleetManager Init | +15% | 4-6h | P0 |
| MCP Module Resolution | +12% | 2-3h | P0 |
| CLI TypeScript Mocks | +8% | 1-2h | P0 |
| Monitor Cleanup | +2% | 30m | P0 |
| **TOTAL** | **+37%** | **8-12h** | **P0** |

**Current:** 1.36% → **Target after P0 fixes:** ~38%
**Remaining to 60%:** +22% (Phase 2 fixes)

---

## 📅 7-Day Sprint Plan

### Day 1-2 (P0 Blockers)
**Goal:** Fix all test execution failures
- [ ] Fix FleetManager initialization
- [ ] Fix MCP module resolution
- [ ] Fix CLI TypeScript mocks
- [ ] Fix monitor cleanup
- [ ] Re-run full test suite
- [ ] Target: 35-40% coverage

### Day 3-4 (Core Coverage)
**Goal:** Increase core module coverage
- [ ] Add BaseAgent integration tests
- [ ] Add FleetManager database tests
- [ ] Add EventBus integration tests
- [ ] Add Task lifecycle tests
- [ ] Target: 50-55% coverage

### Day 5-6 (Agent Coverage)
**Goal:** Test all specialized agents
- [ ] Add agent initialization tests
- [ ] Add agent execution tests
- [ ] Add agent coordination tests
- [ ] Add agent persistence tests
- [ ] Target: 58-62% coverage

### Day 7 (Final Push)
**Goal:** Hit 60%+ target
- [ ] Fill remaining coverage gaps
- [ ] Add integration tests
- [ ] Fix any flaky tests
- [ ] Generate final coverage report
- [ ] Target: 60-65% coverage

---

## 🎯 Success Metrics

### Phase 1 Completion Criteria
- ✅ **Overall Coverage:** 60%+ (currently 1.36%)
- ✅ **Core Module:** 70%+ (currently 12.1%)
- ✅ **Test Pass Rate:** 90%+ (currently ~10%)
- ✅ **P0 Blockers:** 0 remaining (currently 4)

### Daily Tracking
Track progress in `docs/reports/phase1-coverage-daily.md`:
- Day 1: [Target: 15%] Actual: ___
- Day 2: [Target: 38%] Actual: ___
- Day 3: [Target: 48%] Actual: ___
- Day 4: [Target: 55%] Actual: ___
- Day 5: [Target: 58%] Actual: ___
- Day 6: [Target: 60%] Actual: ___
- Day 7: [Target: 62%] Actual: ___

---

## 🔧 Development Workflow

### Before Starting Work
```bash
# Ensure clean state
npm run clean
npm run build
npm test -- --listTests | head -20  # Verify tests discovered
```

### During Development
```bash
# Run specific test suite
npm test -- tests/unit/FleetManager.database.test.ts

# Check coverage for specific file
npm test -- --coverage --collectCoverageFrom="src/core/FleetManager.ts"

# Watch mode for rapid iteration
npm run test:watch
```

### After Completing Fix
```bash
# Run full test suite
npm test

# Generate coverage report
npm run test:coverage-safe

# Check coverage summary
cat coverage/coverage-summary.json | grep '"total"' -A 20

# Commit with coverage info
git add .
git commit -m "fix: [description] - improves coverage by X%"
```

---

## 📈 Coverage Monitoring

### Real-time Monitoring
Run coverage checks on every commit:
```bash
# Add to .git/hooks/pre-commit
npm run test:coverage-safe
COVERAGE=$(cat coverage/coverage-summary.json | grep -o '"pct":[0-9.]*' | head -1 | cut -d':' -f2)
if (( $(echo "$COVERAGE < 60" | bc -l) )); then
  echo "Coverage below 60%: $COVERAGE%"
  exit 1
fi
```

### Daily Reports
Generate coverage diff reports:
```bash
# Save baseline
cp coverage/coverage-summary.json coverage/baseline.json

# After changes
npm run test:coverage-safe
node scripts/coverage-diff.js
```

---

## 🚀 Quick Wins (30-minute fixes)

### 1. Add Missing Unit Tests
Easy files to boost coverage:
- `src/utils/Logger.ts` - Add log level tests
- `src/utils/Config.ts` - Add config validation tests
- `src/core/Task.ts` - Add task lifecycle tests

### 2. Fix Test Infrastructure
- Update jest.setup.ts to handle more edge cases
- Add better mock utilities
- Improve test cleanup patterns

### 3. Re-enable Passing Tests
Some tests may be disabled - re-enable them:
```bash
# Find disabled tests
grep -r "describe.skip\|it.skip\|test.skip" tests/

# Re-enable if they pass
# Update from .skip to normal describe/it/test
```

---

## 📝 Documentation Updates

After achieving 60% coverage:
- [ ] Update README.md with coverage badge
- [ ] Document test patterns in CONTRIBUTING.md
- [ ] Add coverage guidelines for PRs
- [ ] Create coverage best practices guide

---

## 🆘 Escalation Path

If blocked or behind schedule:
1. **Day 3:** If <35% coverage → Escalate to tech lead
2. **Day 5:** If <50% coverage → Request additional resources
3. **Day 7:** If <55% coverage → Extend sprint by 2-3 days

---

## 📞 Contacts

**QE Team Lead:** [TBD]
**Coverage Expert:** QE Coverage Analyzer Agent
**DevOps Support:** [TBD]

**Tools:**
- Coverage Dashboard: `open coverage/lcov-report/index.html`
- CI/CD Pipeline: [TBD]
- Slack Channel: #agentic-qe-coverage

---

*Generated by QE Coverage Analyzer Agent with sublinear optimization*
*Next update: After P0 fixes complete*
