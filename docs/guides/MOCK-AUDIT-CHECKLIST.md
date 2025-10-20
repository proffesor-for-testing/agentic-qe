# Mock Audit Checklist
**Purpose**: Identify tests with excessive mocking that contribute 0% coverage
**Usage**: Run this audit on any test file before rewriting

---

## 🚨 Red Flags (Instant Fail)

### 1. Top-Level `jest.mock()` for Core Modules
```typescript
// ❌ RED FLAG: Mocking the entire module under test
jest.mock('../../src/agents/BaseAgent');
jest.mock('../../src/core/FleetManager');
jest.mock('../../src/core/EventBus');

// WHY BAD: 100% of code under test is mocked = 0% coverage
// FIX: Remove these mocks, use real implementations
```

**Impact**: 0% coverage, test validates nothing

### 2. Casting to `any` to Bypass Type Checking
```typescript
// ❌ RED FLAG: Bypassing types = bypassing real behavior
const agent = new TestExecutorAgent({} as any);
const result = await agent.executeTask({} as any);

// WHY BAD: No real dependencies = no real code execution
// FIX: Pass real, typed dependencies
```

**Impact**: 0% coverage, compiles but doesn't test

### 3. Testing Mocks, Not Code
```typescript
// ❌ RED FLAG: Asserting on mock behavior, not real behavior
const mockExecute = jest.fn().mockResolvedValue({ success: true });
agent.execute = mockExecute;

await agent.execute(task);
expect(mockExecute).toHaveBeenCalled(); // Testing the mock!

// WHY BAD: Real execute() method never runs
// FIX: Test real execute() with real task
```

**Impact**: 0% coverage, circular logic

### 4. 100% Mocked Dependencies
```typescript
// ❌ RED FLAG: Every dependency is mocked
const mockEventBus = { emit: jest.fn(), on: jest.fn() };
const mockMemory = { store: jest.fn(), retrieve: jest.fn() };
const mockLogger = { info: jest.fn(), error: jest.fn() };

const agent = new Agent({
  eventBus: mockEventBus as any,
  memoryStore: mockMemory as any,
  logger: mockLogger as any
});

// WHY BAD: Agent's real methods never interact with real objects
// FIX: Use real EventBus (global), real MemoryStore (in-memory)
```

**Impact**: <5% coverage, only constructor tested

---

## ⚠️ Warning Signs (Needs Review)

### 5. Partial Mocking Without Justification
```typescript
// ⚠️ WARNING: Mocking internal methods
jest.spyOn(agent, 'processData').mockResolvedValue({});

// WHEN OK: Testing error handling of public API when processData fails
// WHEN BAD: Avoiding testing processData implementation
// FIX: If processData should be tested, don't mock it
```

**Review**: Is the mock necessary? Or avoiding testing real logic?

### 6. Heavy Use of `mockImplementation`
```typescript
// ⚠️ WARNING: Replacing real implementation
memoryStore.retrieve.mockImplementation(async (key) => {
  return testData[key];
});

// WHEN OK: Simulating specific database state for test scenario
// WHEN BAD: All database operations are mocked, none tested
// FIX: Use real in-memory database with seeded test data
```

**Review**: Could real implementation work with test data?

### 7. Skipping Initialization
```typescript
// ⚠️ WARNING: Skipping critical setup
const agent = new Agent(deps);
// Missing: await agent.initialize();

// WHY RISKY: initialize() often contains critical setup logic
// FIX: Always call initialize() unless specifically testing construction
```

**Review**: Is initialize() logic being tested elsewhere?

### 8. Asserting Only on Mock Calls
```typescript
// ⚠️ WARNING: Only testing that functions were called
await agent.analyze(data);

expect(mockLogger.info).toHaveBeenCalledWith('Analyzing...');
expect(mockEventBus.emit).toHaveBeenCalledWith('analysis:start');

// WHY RISKY: Not testing what analyze() actually does
// FIX: Also assert on analyze() return value and side effects
```

**Review**: Are we testing behavior or just execution flow?

---

## ✅ Green Lights (Good Patterns)

### 9. Boundary Mocking Only
```typescript
// ✅ GOOD: Mock external API, test real logic
jest.mock('axios');
(axios.get as jest.Mock).mockResolvedValue({ data: mockApiResponse });

const validator = new RequirementsValidator(realDeps);
const result = await validator.validate('https://api.example.com');

expect(result.isValid).toBe(true); // Real validation logic tested
expect(result.score).toBeGreaterThan(0.9);
```

**Why Good**: Real validation logic runs, only HTTP boundary mocked

### 10. Real Dependencies, Real Data
```typescript
// ✅ GOOD: Real EventBus, real MemoryStore
import { globalEventBus } from '../setup/global-infrastructure';

const memoryStore = await SwarmMemoryManager.create(':memory:');
const agent = new TestExecutor({
  eventBus: globalEventBus,
  memoryStore,
  logger: createTestLogger()
});

await agent.initialize();
const result = await agent.execute(realTask);
```

**Why Good**: Tests real code paths with real interactions

### 11. Verifying Real Side Effects
```typescript
// ✅ GOOD: Assert on real state changes
await agent.execute(task);

// Verify real database writes
const stored = await memoryStore.retrieve(`tasks/${task.id}`);
expect(stored.status).toBe('completed');

// Verify real events emitted
const events = await globalEventBus.getEventLog();
expect(events.some(e => e.type === 'task:completed')).toBe(true);
```

**Why Good**: Testing real system state, not mock state

---

## 🔍 Audit Process

### Step 1: Static Analysis
Run this command to find problematic patterns:

```bash
# Find files with jest.mock() at top level
grep -r "jest.mock" tests/ | grep -v node_modules

# Find files with 'as any' type casts
grep -r "as any" tests/ | wc -l

# Find files that import modules but don't use them
# (indicates mocking instead of using)
```

### Step 2: Coverage Check
```bash
# Run coverage for single test file
npx jest tests/agents/BaseAgent.test.ts --coverage --collectCoverageFrom='src/agents/BaseAgent.ts'

# Check if coverage is 0% despite passing tests
# RED FLAG: Passing tests + 0% coverage = 100% mocked
```

### Step 3: Manual Review
For each test file:
1. [ ] Count `jest.mock()` calls at top level
2. [ ] Count `as any` casts
3. [ ] Check if real dependencies are used
4. [ ] Verify assertions are on real behavior, not mocks
5. [ ] Run test in isolation and check coverage

### Step 4: Score Test Quality
```
Score = (Real Dependencies / Total Dependencies) × 100

0-20%: 🔴 CRITICAL - Rewrite required
21-50%: 🟡 WARNING - Needs improvement
51-80%: 🟢 GOOD - Minor fixes
81-100%: ✅ EXCELLENT - Meets standards
```

---

## 📊 Audit Results Template

```markdown
# Test Audit: [ModuleName]

**File**: tests/[category]/[ModuleName].test.ts
**Module Under Test**: src/[category]/[ModuleName].ts
**Audit Date**: YYYY-MM-DD

## Scores
- **Mock Ratio**: [X]% (Target: <20%)
- **Coverage**: [X]% (Target: >80%)
- **Quality Score**: [X]/100

## Red Flags Found
- [ ] Top-level jest.mock() for core modules (Count: X)
- [ ] Casting to 'any' (Count: X)
- [ ] Testing mock behavior (Count: X)
- [ ] 100% mocked dependencies (Count: X)

## Warning Signs Found
- [ ] Partial mocking without justification (Count: X)
- [ ] Heavy mockImplementation use (Count: X)
- [ ] Skipping initialization (Count: X)
- [ ] Only asserting on mock calls (Count: X)

## Recommendations
1. Priority 1: [Action]
2. Priority 2: [Action]
3. Priority 3: [Action]

## Estimated Effort
- Rewrite Effort: [X hours]
- Expected Coverage Gain: [X]%
- Risk Level: Low/Medium/High
```

---

## 🎯 Top 20 Files to Audit (Priority Order)

Based on coverage analysis, audit these first:

### Tier 1: Foundation (IMMEDIATE)
1. `tests/agents/BaseAgent.test.ts` - **0% coverage, 166 lines uncovered**
2. `tests/core/FleetManager.test.ts` - **38% coverage, 61 lines uncovered**
3. `tests/core/Task.test.ts` - **17% coverage, 76 lines uncovered**
4. `tests/core/MemoryManager.test.ts` - **0% coverage, 211 lines uncovered**
5. `tests/core/memory/SwarmMemoryManager.test.ts` - **18% coverage, 358 lines uncovered**

### Tier 2: High-Value Agents
6. `tests/agents/TestExecutorAgent.test.ts` - **0% coverage, 262 lines**
7. `tests/agents/TestGeneratorAgent.test.ts` - **0% coverage, 218 lines**
8. `tests/agents/CoverageAnalyzerAgent.test.ts` - **0% coverage, 270 lines**
9. `tests/agents/FlakyTestHunterAgent.test.ts` - **0% coverage, 357 lines**
10. `tests/agents/RegressionRiskAnalyzerAgent.test.ts` - **0% coverage, 381 lines**

### Tier 3: Learning System
11. `tests/learning/LearningEngine.test.ts` - **0% coverage, 194 lines**
12. `tests/learning/PerformanceTracker.test.ts` - **0% coverage, 119 lines**
13. `tests/learning/ImprovementLoop.test.ts` - **0% coverage, 213 lines**
14. `tests/learning/FlakyTestDetector.test.ts` - **0% coverage, 252 lines**

### Tier 4: Integration Tests
15. `tests/integration/fleet-coordination.test.ts` - **Likely 0% real coverage**
16. `tests/integration/agent-coordination.test.ts` - **Likely 0% real coverage**
17. `tests/integration/learning-system.test.ts` - **Likely 0% real coverage**

### Tier 5: CLI (Sample)
18. `tests/cli/commands/analyze.test.ts` - **0% coverage, 282 lines**
19. `tests/cli/commands/fleet.test.ts` - **0% coverage, 346 lines**
20. `tests/cli/agent.test.ts` - **0% coverage, ~150 lines**

---

## 🛠️ Quick Fix Script

```bash
#!/bin/bash
# audit-test-file.sh - Quick audit of a single test file

TEST_FILE=$1
SRC_FILE=$(echo $TEST_FILE | sed 's/tests/src/' | sed 's/.test.ts/.ts/')

echo "🔍 Auditing: $TEST_FILE"
echo "📦 Module: $SRC_FILE"
echo ""

# Count mocks
MOCK_COUNT=$(grep -c "jest.mock" $TEST_FILE)
echo "jest.mock() calls: $MOCK_COUNT"

# Count 'as any'
ANY_COUNT=$(grep -c "as any" $TEST_FILE)
echo "'as any' casts: $ANY_COUNT"

# Check coverage
echo ""
echo "Running coverage check..."
npx jest $TEST_FILE --coverage --collectCoverageFrom=$SRC_FILE --silent

echo ""
if [ $MOCK_COUNT -gt 3 ]; then
  echo "🔴 RED FLAG: High mock count ($MOCK_COUNT > 3)"
fi

if [ $ANY_COUNT -gt 5 ]; then
  echo "🔴 RED FLAG: High 'any' cast count ($ANY_COUNT > 5)"
fi
```

**Usage**:
```bash
chmod +x audit-test-file.sh
./audit-test-file.sh tests/agents/BaseAgent.test.ts
```

---

## 📈 Progress Tracking

### Audit Progress Sheet
```
| File | Audit Date | Mock Ratio | Coverage | Status | Owner |
|------|------------|------------|----------|--------|-------|
| BaseAgent.test.ts | 2025-10-20 | 90% 🔴 | 0% 🔴 | To Rewrite | QA Team |
| FleetManager.test.ts | 2025-10-20 | 60% 🟡 | 38% 🟡 | To Improve | QA Team |
| ... | ... | ... | ... | ... | ... |
```

### Weekly Summary
```markdown
## Week 1 Audit Summary
- Files Audited: 20
- Red Flags Found: 15 files
- Warning Signs: 5 files
- Green Light: 0 files

## Top Issues
1. BaseAgent.test.ts: 100% mocked, 0% coverage
2. TestExecutorAgent.test.ts: 95% mocked, 0% coverage
3. All agent tests: Heavy mock overuse

## Actions
- Week 1: Rewrite top 5 foundation tests
- Week 2: Rewrite agent tests
- Week 3: Fix integration tests
```

---

## 🔗 Related Documents
- Test Re-Architecture Plan: `/docs/plans/TEST-REARCHITECTURE-PLAN.md`
- Coverage Update: `/docs/reports/PHASE1-2-COVERAGE-UPDATE.md`
- Testing Best Practices: (To be created)

---

**Created**: 2025-10-20 08:25:00 UTC
**Purpose**: Test Quality Audit & Improvement
**Usage**: Run before rewriting any test file
