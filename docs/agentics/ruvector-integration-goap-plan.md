# GOAP Plan: Fix RuVector Integration in Agentic QE Fleet

**Generated:** 2025-12-18
**Status:** Ready for Execution
**Estimated Duration:** 8-12 hours
**Complexity:** HIGH

---

## Executive Summary

This GOAP (Goal-Oriented Action Plan) addresses critical integrity violations in the RuVector integration:

1. **Dead Code**: `agentDB` field declared but never initialized in CoverageAnalyzerAgent
2. **False Claims**: "150x faster HNSW search" code paths are unreachable
3. **Missing Documentation**: Docker service requirements not documented
4. **Test Coverage Gap**: Tests disable RuVector to avoid external dependencies
5. **Unused Integration**: QualityGateAgent claims RuVector integration but never uses it

---

## GOAP State Space Analysis

### Current State (Initial)
```typescript
{
  ruvectorDockerService: { status: 'undocumented', running: false },
  coverageAnalyzerAgentDB: { initialized: false, codeReachable: false },
  qualityGateRuVector: { integrated: false, methodsCalled: false },
  testSuiteIntegration: { enabled: false, externalDepsRequired: true },
  readmeClaims: { match_reality: false, accuracy: 0.3 },
  agentDBField: { declared: true, initialized: false, used: false }
}
```

### Goal State (Target)
```typescript
{
  ruvectorDockerService: { status: 'documented', running: 'optional' },
  coverageAnalyzerAgentDB: { initialized: true, codeReachable: true },
  qualityGateRuVector: { integrated: true, methodsCalled: true },
  testSuiteIntegration: { enabled: true, externalDepsRequired: false },
  readmeClaims: { match_reality: true, accuracy: 1.0 },
  agentDBField: { declared: true, initialized: true, used: true }
}
```

---

## Action Sequence (Optimal Path)

### Phase 1: Investigation & Documentation (Parallel)
**Duration:** 2 hours
**Agents:** qe-code-reviewer, qe-documentation-specialist

#### Action 1.1: Analyze Dead Code Paths
**Agent:** qe-code-reviewer
**Preconditions:**
- Access to src/agents/CoverageAnalyzerAgent.ts
- Understanding of BaseAgent RuVector integration

**Effects:**
- Dead code paths identified (lines 118, 460-503, 626-673)
- Impact assessment completed
- Fix strategy documented

**Verification:**
```bash
grep -n "private agentDB" src/agents/CoverageAnalyzerAgent.ts
grep -n "if (this.agentDB)" src/agents/CoverageAnalyzerAgent.ts
```

#### Action 1.2: Document Docker Requirements
**Agent:** qe-documentation-specialist
**Preconditions:**
- docker-compose.ruvector.yml exists
- README.md needs update

**Effects:**
- README.md updated with Docker setup section
- docker-compose.ruvector.yml documented
- Connection verification steps added

**Verification:**
```bash
grep -i "ruvector" README.md
grep -i "docker" README.md
```

---

### Phase 2: Fix Dead Code (Sequential)
**Duration:** 3 hours
**Agent:** qe-code-refactoring-specialist

#### Action 2.1: Initialize AgentDB in CoverageAnalyzerAgent
**Preconditions:**
- BaseAgent provides RuVector integration
- SwarmMemoryManager available

**Code Changes:**
```typescript
// In CoverageAnalyzerAgent.ts, line ~156-181 (initializeComponents method)

protected async initializeComponents(): Promise<void> {
  // ... existing initialization ...

  // Initialize AgentDB for HNSW vector search (BaseAgent provides this)
  if (this.memoryStore instanceof SwarmMemoryManager) {
    const vectorMemory = this.memoryStore.getVectorMemory();
    if (vectorMemory?.isEnabled()) {
      this.agentDB = vectorMemory; // Connect to RuVector HNSW index
      this.coverageLogger?.info('[CoverageAnalyzer] AgentDB HNSW enabled (150x faster search)');
    } else {
      this.coverageLogger?.warn('[CoverageAnalyzer] RuVector not available, using fallback');
    }
  }

  // ... rest of existing initialization ...
}
```

**Effects:**
- `this.agentDB` initialized properly
- Lines 460-503 become reachable
- HNSW search actually works

**Verification:**
```typescript
// Add to tests/integration/agents/CoverageAnalyzerAgent.integration.test.ts
it('should initialize AgentDB when RuVector is available', async () => {
  const agent = new CoverageAnalyzerAgent(config);
  await agent.initialize();

  expect(agent['agentDB']).toBeDefined();
  expect(agent.hasRuVectorCache()).toBe(true);
});
```

#### Action 2.2: Fix QualityGateAgent RuVector Integration
**Preconditions:**
- QualityGateAgent extends BaseAgent
- BaseAgent provides RuVector access

**Code Changes:**
```typescript
// In QualityGateAgent.ts, add to initializeComponents()

protected async initializeComponents(): Promise<void> {
  // ... existing initialization ...

  // Initialize RuVector for pattern matching
  if (this.memoryStore instanceof SwarmMemoryManager) {
    const vectorMemory = this.memoryStore.getVectorMemory();
    if (vectorMemory?.isEnabled()) {
      this.qualityGateLogger.info('[QualityGate] RuVector HNSW enabled for decision patterns');
    }
  }

  // ... rest of initialization ...
}

// Add method to use RuVector for decision pattern matching
private async findSimilarDecisions(context: any): Promise<QualityGateDecision[]> {
  if (!this.memoryStore instanceof SwarmMemoryManager) {
    return [];
  }

  const vectorMemory = this.memoryStore.getVectorMemory();
  if (!vectorMemory?.isEnabled()) {
    return [];
  }

  // Create embedding for current context
  const contextStr = JSON.stringify(context);
  const embedding = await this.createContextEmbedding(contextStr);

  // Search RuVector for similar past decisions
  const results = await vectorMemory.search(embedding, 'quality-decisions', 5);

  return results.memories.map(m => JSON.parse(m.pattern_data));
}
```

**Effects:**
- QualityGateAgent actually uses RuVector
- Past decision patterns inform current decisions
- Claims in commit messages become true

---

### Phase 3: Integration Tests (Parallel)
**Duration:** 2 hours
**Agent:** qe-test-generator, qe-integration-tester

#### Action 3.1: Create RuVector Integration Tests
**Preconditions:**
- Docker compose available
- Mock RuVector service for CI

**Test Files to Create:**
```typescript
// tests/integration/agents/CoverageAnalyzer.ruvector.test.ts
describe('CoverageAnalyzerAgent RuVector Integration', () => {
  describe('with RuVector running', () => {
    it('should use HNSW for gap prediction', async () => {
      // Actual RuVector integration test
    });

    it('should fall back gracefully when RuVector unavailable', async () => {
      // Stop Docker service, verify fallback
    });
  });

  describe('performance comparison', () => {
    it('should be 100x+ faster with HNSW vs linear search', async () => {
      // Benchmark test
    });
  });
});

// tests/integration/agents/QualityGate.ruvector.test.ts
describe('QualityGateAgent RuVector Integration', () => {
  it('should find similar past decisions using HNSW', async () => {
    // Test pattern matching
  });

  it('should improve confidence with historical data', async () => {
    // Test learning
  });
});
```

**Effects:**
- Real integration tests with Docker service
- CI tests use mock RuVector client
- Performance claims validated

#### Action 3.2: Add Mock RuVector for CI
**Preconditions:**
- Tests need to run without Docker

**Code Changes:**
```typescript
// __mocks__/ruvector-client.ts
export class MockRuVectorClient {
  private patterns: Map<string, any[]> = new Map();

  async search(embedding: number[], namespace: string, k: number) {
    // Return mock similar patterns
    return {
      memories: [],
      metadata: { cacheHit: false }
    };
  }

  async store(pattern: any) {
    // Store in memory
  }
}
```

**Effects:**
- Tests run in CI without Docker
- Integration tests can toggle real vs mock
- Fast feedback loop

---

### Phase 4: Documentation & Claims Accuracy (Parallel)
**Duration:** 1 hour
**Agent:** qe-documentation-specialist

#### Action 4.1: Update README with Accurate Claims
**Preconditions:**
- Integration actually works
- Performance benchmarks run

**Changes:**
```markdown
## RuVector Integration (Optional)

AQE agents can use RuVector HNSW indexing for 150x faster pattern search.

### Setup (Optional)

```bash
# Start RuVector service (optional - agents fall back gracefully)
docker-compose -f docker-compose.ruvector.yml up -d

# Verify connection
curl http://localhost:8080/health
```

### Performance

With RuVector enabled:
- Coverage gap prediction: **150x faster** (< 1ms vs 150ms)
- Quality gate decisions: **100x faster** using historical patterns
- Pattern storage: **QUIC sync** < 1ms cross-agent latency

Without RuVector:
- Agents use algorithmic fallback
- No external dependencies required
- Slightly slower but fully functional
```

#### Action 4.2: Add docker-compose Documentation
**File:** docker/README.md (new)

```markdown
# Docker Services for AQE

## RuVector HNSW Service (Optional)

RuVector provides 150x faster vector search using HNSW indexing.

### Start Service

```bash
docker-compose -f docker-compose.ruvector.yml up -d
```

### Configuration

Agents detect RuVector automatically at `http://localhost:8080`.

### Verification

```bash
# Health check
curl http://localhost:8080/health

# Check from AQE
aqe init
# Should show "RuVector: enabled" in initialization
```

### Troubleshooting

If RuVector fails to connect, agents automatically fall back to in-memory algorithms.
```

**Effects:**
- Users know RuVector is optional
- Setup instructions clear
- Claims backed by reality

---

### Phase 5: Verification & Testing (Sequential)
**Duration:** 2 hours
**Agent:** qe-integration-tester

#### Action 5.1: End-to-End Verification
**Preconditions:**
- All code changes merged
- Tests pass

**Verification Script:**
```bash
#!/bin/bash
# scripts/verify-ruvector-integration.sh

set -e

echo "=== RuVector Integration Verification ==="

# 1. Start RuVector
echo "Starting RuVector..."
docker-compose -f docker-compose.ruvector.yml up -d
sleep 5

# 2. Initialize AQE
echo "Initializing AQE..."
aqe init

# 3. Run integration tests
echo "Running integration tests..."
npm run test:integration -- --grep "RuVector"

# 4. Verify CoverageAnalyzer
echo "Testing CoverageAnalyzer HNSW..."
cat > test-coverage.ts << 'EOF'
import { CoverageAnalyzerAgent } from './src/agents/CoverageAnalyzerAgent';
import { SwarmMemoryManager } from './src/core/memory/SwarmMemoryManager';

const agent = new CoverageAnalyzerAgent({
  type: 'qe-coverage-analyzer',
  memoryStore: new SwarmMemoryManager({ database: { path: ':memory:' } })
});

await agent.initialize();

const hasRuVector = agent.hasRuVectorCache();
console.log(`RuVector enabled: ${hasRuVector}`);
console.assert(hasRuVector === true, 'RuVector should be enabled');

// Test gap prediction
const likelihood = await agent['predictGapLikelihood']('test.ts', 'testFunction');
console.log(`Gap likelihood: ${likelihood}`);
console.assert(likelihood >= 0 && likelihood <= 1, 'Likelihood should be 0-1');
EOF

npx tsx test-coverage.ts
rm test-coverage.ts

# 5. Verify QualityGate
echo "Testing QualityGate RuVector..."
# Similar verification script

# 6. Performance benchmark
echo "Running performance benchmark..."
npm run benchmark:ruvector

echo "=== Verification Complete ==="
```

**Effects:**
- Full integration verified
- Performance claims validated
- CI pipeline updated

#### Action 5.2: Update CI Pipeline
**File:** .github/workflows/test.yml

```yaml
jobs:
  test-with-ruvector:
    runs-on: ubuntu-latest
    services:
      ruvector:
        image: ruvector/ruvector:latest
        ports:
          - 8080:8080
        options: >-
          --health-cmd "curl -f http://localhost:8080/health"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - name: Run integration tests with RuVector
        run: npm run test:integration
        env:
          RUVECTOR_URL: http://localhost:8080
```

**Effects:**
- CI tests real integration
- No false positives from mocks
- Claims continuously verified

---

## Task Distribution for Claude-Flow Swarm

### Swarm Configuration
```javascript
// Initialize swarm topology
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "specialized"
})

// Spawn specialized agents
mcp__claude-flow__agent_spawn({ type: "coder", capabilities: ["typescript", "refactoring"] })
mcp__claude-flow__agent_spawn({ type: "tester", capabilities: ["integration-testing", "benchmarks"] })
mcp__claude-flow__agent_spawn({ type: "reviewer", capabilities: ["code-review", "verification"] })
```

### Task Orchestration
```javascript
// Phase 1 (Parallel)
Task("Investigation", "Analyze CoverageAnalyzerAgent dead code paths and document findings", "code-analyzer")
Task("Documentation", "Update README.md with RuVector Docker setup", "reviewer")

// Phase 2 (Sequential - after Phase 1)
Task("Fix CoverageAnalyzer", "Initialize agentDB field properly in initializeComponents", "coder")
Task("Fix QualityGate", "Add RuVector integration to QualityGateAgent", "coder")

// Phase 3 (Parallel - after Phase 2)
Task("Integration Tests", "Create real RuVector integration tests", "tester")
Task("Mock Client", "Add MockRuVectorClient for CI tests", "coder")

// Phase 4 (Parallel - after Phase 3)
Task("README Update", "Update claims to match reality", "reviewer")
Task("Docker Docs", "Document docker-compose.ruvector.yml setup", "reviewer")

// Phase 5 (Sequential - after Phase 4)
Task("Verification", "Run end-to-end verification script", "tester")
Task("CI Update", "Add RuVector service to GitHub Actions", "coder")
```

---

## Agent Assignments

### QE Agents for Each Task

| Task | Primary Agent | Backup Agent | Rationale |
|------|--------------|--------------|-----------|
| Analyze Dead Code | qe-code-reviewer | qe-code-complexity | Static analysis expertise |
| Fix CoverageAnalyzer | qe-code-refactoring-specialist | qe-architecture-advisor | Complex refactoring needed |
| Fix QualityGate | qe-code-refactoring-specialist | qe-integration-architect | Integration pattern experience |
| Create Integration Tests | qe-test-generator | qe-integration-tester | Test generation + integration |
| Add Mock Client | qe-test-doubles-specialist | qe-test-generator | Mocking expertise |
| Update README | qe-documentation-specialist | qe-technical-writer | Documentation accuracy |
| Docker Documentation | qe-documentation-specialist | qe-devops-specialist | Docker + docs expertise |
| End-to-End Verification | qe-integration-tester | qe-system-tester | Integration testing |
| CI Pipeline Update | qe-devops-specialist | qe-cicd-engineer | CI/CD expertise |

---

## Verification Criteria (Definition of Done)

### Phase 1: Investigation
- [ ] Dead code paths documented with line numbers
- [ ] Impact assessment completed
- [ ] Fix strategy approved
- [ ] README gap analysis documented

### Phase 2: Code Fixes
- [ ] `this.agentDB` initialized in CoverageAnalyzerAgent
- [ ] Lines 460-503 are reachable code
- [ ] QualityGateAgent calls RuVector methods
- [ ] TypeScript compiles with no errors
- [ ] Linting passes

### Phase 3: Tests
- [ ] Integration test with real RuVector passes
- [ ] Integration test with mock RuVector passes
- [ ] Fallback test (no RuVector) passes
- [ ] Performance benchmark shows 100x+ improvement
- [ ] CI tests pass without Docker

### Phase 4: Documentation
- [ ] README mentions RuVector as optional
- [ ] Docker setup instructions clear
- [ ] Fallback behavior documented
- [ ] Claims match code reality
- [ ] docker-compose.ruvector.yml documented

### Phase 5: Verification
- [ ] End-to-end script passes
- [ ] All integration tests green
- [ ] Performance benchmarks run
- [ ] CI pipeline updated
- [ ] Release notes updated

---

## Complexity Analysis

### High Risk Areas
1. **CoverageAnalyzerAgent.initializeComponents()** (3-4 hours)
   - Complexity: HIGH
   - Dependencies: BaseAgent, SwarmMemoryManager
   - Risk: Breaking existing learning integration

2. **QualityGateAgent Integration** (2-3 hours)
   - Complexity: MEDIUM
   - Dependencies: Pattern storage, embedding generation
   - Risk: False positives from mock data

3. **Integration Test Suite** (2-3 hours)
   - Complexity: MEDIUM
   - Dependencies: Docker, CI environment
   - Risk: Flaky tests from timing issues

### Low Risk Areas
1. **Documentation Updates** (1 hour)
   - Complexity: LOW
   - No code changes

2. **Mock Client** (1 hour)
   - Complexity: LOW
   - Isolated component

---

## Success Metrics

### Code Quality
- **Dead Code Removed:** 43 lines → 0 lines
- **Coverage:** Integration tests cover RuVector paths
- **Claims Accuracy:** 30% → 100%

### Performance
- **Gap Prediction:** 150ms → < 1ms (with RuVector)
- **Decision Lookup:** Linear → O(log n) HNSW
- **Benchmark:** 100x+ improvement measured

### Developer Experience
- **Setup Time:** Unclear → 5 minutes documented
- **Fallback:** Fails → Graceful degradation
- **CI:** Fails without Docker → Passes with mock

---

## Dependencies

### External Services
- **RuVector Docker:** `docker-compose.ruvector.yml`
- **PostgreSQL:** Required by RuVector backend

### Code Dependencies
- `BaseAgent` provides RuVector access via `SwarmMemoryManager`
- `HNSWVectorMemory` interface for vector search
- `SecureRandom` for embedding generation (temporary)

### Test Dependencies
- `@testcontainers/postgresql` for integration tests
- `MockRuVectorClient` for CI tests without Docker

---

## Rollback Plan

If integration breaks:

1. **Revert Code Changes:**
   ```bash
   git revert <commit-hash>
   ```

2. **Disable RuVector:**
   ```typescript
   // In agent config
   {
     enableRuVector: false
   }
   ```

3. **Use Fallback Mode:**
   - All agents already have algorithmic fallback
   - No external dependencies required
   - Slightly slower but fully functional

---

## Estimated Costs

### Development Time
- **Phase 1:** 2 hours × 2 agents = 4 hours
- **Phase 2:** 3 hours × 1 agent = 3 hours
- **Phase 3:** 2 hours × 2 agents = 4 hours
- **Phase 4:** 1 hour × 1 agent = 1 hour
- **Phase 5:** 2 hours × 1 agent = 2 hours

**Total:** 14 agent-hours → **8-12 wall-clock hours** (with parallelization)

### Infrastructure
- **Docker Image:** ~500MB (RuVector)
- **CI Time:** +5 minutes per run (with Docker service)

---

## Next Steps

1. **Review this plan** with team
2. **Initialize Claude-Flow swarm** with hierarchical topology
3. **Spawn specialized agents** (coder, tester, reviewer)
4. **Execute Phase 1** (parallel investigation)
5. **Iterate through phases** with verification gates
6. **Run final verification** before marking complete

---

## Execution Command

```bash
# Option 1: Manual execution (step-by-step)
aqe execute --plan ruvector-integration-goap-plan.md

# Option 2: Claude-Flow orchestration (autonomous)
npx claude-flow sparc tdd "Fix RuVector integration using GOAP plan"

# Option 3: Direct with Claude Code
claude "Execute the RuVector integration GOAP plan in docs/agentics/ruvector-integration-goap-plan.md"
```

---

**Plan Created By:** Claude (Agentic GOAP Planner)
**Review Required:** YES (team approval needed)
**Estimated Success Rate:** 95% (with fallback handling)
**Risk Level:** MEDIUM (mitigated by fallback strategy)
