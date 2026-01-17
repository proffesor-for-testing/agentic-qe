# 🚨 Priority 1 Critical Tasks - Executable Specifications
**For Claude Flow Agent Execution**
**Timeline**: Week 1 (5 days)
**Agents**: 3 specialized agents working in parallel

---

## Task 1.1: TODO/FIXME Elimination
**Agent**: `code-refactor-agent`
**Estimated**: 12 hours (1.5 days)
**Status**: 🔴 Critical

### Context
The codebase contains 40+ TODO/FIXME comments in production code (`src/`), indicating incomplete features. This creates:
- Unpredictable behavior (hard-coded guesses instead of real implementations)
- Maintenance debt (unclear what's finished vs. in-progress)
- Production risk (features that look complete but aren't)

### Objective
**Eliminate ALL TODOs from `src/` directory** by either:
1. Implementing the missing functionality
2. Removing incomplete features
3. Moving experimental code to clearly labeled experimental modules

### Execution Steps

#### Step 1: Audit (2 hours)
```bash
# 1. Find all TODOs
grep -rn "TODO\|FIXME\|HACK\|BUG" src/ > /tmp/todo-audit.txt

# 2. Categorize by severity
# HIGH: Features that are half-implemented (break on edge cases)
# MEDIUM: Missing optimizations or monitoring
# LOW: Template placeholders (never intended for production)
```

**Deliverable**: `docs/TODO-INVENTORY.md` with categorized list

#### Step 2: Implement High Priority TODOs (6 hours)

**TODO #1: Real Resource Monitoring**
```typescript
// File: src/learning/StateExtractor.ts
// Current: // TODO: Integrate with actual system resource monitoring

// Implementation:
import * as os from 'os';

private getSystemResources(): SystemResources {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const cpus = os.cpus();
  const loadAvg = os.loadavg();

  return {
    cpuUsage: loadAvg[0] / cpus.length, // Normalize by CPU count
    memoryUsage: 1 - (freeMem / totalMem),
    availableCpus: cpus.length,
    freeMemoryMB: Math.floor(freeMem / 1024 / 1024)
  };
}
```

**TODO #2: AgentDB Learning Integration**
```typescript
// File: src/cli/commands/agentdb/learn.ts
// Current: // TODO: Implement actual training

// Implementation:
import { AgentDBLearningIntegration } from '@learning/AgentDBLearningIntegration';

async function trainAgent(agentType: string, options: TrainOptions) {
  const learning = new AgentDBLearningIntegration();

  // Load historical patterns
  const patterns = await learning.loadPatterns(agentType);

  // Train on patterns
  const model = await learning.train({
    patterns,
    epochs: options.epochs || 50,
    learningRate: options.learningRate || 0.001
  });

  // Validate training
  const validation = await learning.validate(model);

  if (validation.accuracy < 0.80) {
    throw new Error(`Training failed: accuracy ${validation.accuracy} < 0.80`);
  }

  // Save trained model
  await learning.saveModel(model, agentType);

  return {
    accuracy: validation.accuracy,
    lossReduction: validation.lossReduction,
    patternsLearned: patterns.length
  };
}
```

**TODO #3: LearningEngine Resource Awareness**
```typescript
// File: src/learning/LearningEngine.ts
// Current: availableResources: 0.8, // TODO: get from system

// Implementation:
import { StateExtractor } from './StateExtractor';

class LearningEngine {
  private stateExtractor = new StateExtractor();

  async extractState(): Promise<State> {
    const systemResources = this.stateExtractor.getSystemResources();

    return {
      // ... other state fields ...
      availableResources: 1 - systemResources.memoryUsage, // Actual available resources
      cpuLoad: systemResources.cpuUsage,
      canSpawnAgents: systemResources.availableResources > 0.3 // 30% threshold
    };
  }
}
```

#### Step 3: Delete Low Priority TODOs (2 hours)
```bash
# Remove template TODOs (code generators that output "TODO: Implement")
# These are intentional placeholders, not production code

# Files to clean:
# - src/mcp/tools/qe/test-generation/generate-unit-tests.ts
# - src/mcp/handlers/advanced/production-incident-replay.ts
# - src/mcp/handlers/advanced/requirements-generate-bdd.ts

# Replace with:
return `// Generated test stub - customize for your use case\n${testCode}`;
```

#### Step 4: Add Pre-Commit Hook (1 hour)
```bash
# Create .git/hooks/pre-commit
#!/bin/bash

# Check for TODOs in staged src/ files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep "^src/")

if [ -n "$STAGED_FILES" ]; then
  TODO_COUNT=$(echo "$STAGED_FILES" | xargs grep -n "TODO\|FIXME\|HACK\|BUG" | wc -l)

  if [ "$TODO_COUNT" -gt 0 ]; then
    echo "❌ ERROR: Found $TODO_COUNT TODO/FIXME/HACK/BUG comments in src/"
    echo ""
    echo "TODOs are not allowed in production code (src/)."
    echo "Either implement the feature or move to experimental/."
    echo ""
    echo "Found in:"
    echo "$STAGED_FILES" | xargs grep -n "TODO\|FIXME\|HACK\|BUG"
    exit 1
  fi
fi

exit 0
```

#### Step 5: Validation (1 hour)
```bash
# Verify no TODOs remain
grep -rn "TODO\|FIXME" src/ | wc -l  # Should be 0

# Run tests to ensure implementations work
npm test

# Update CHANGELOG
echo "### Fixed\n- Implemented all TODO features in production code" >> CHANGELOG.md
```

### Acceptance Criteria
- [ ] Zero TODOs in `src/` directory
- [ ] All tests passing
- [ ] Pre-commit hook installed and working
- [ ] `docs/TODO-INVENTORY.md` documents what was implemented vs. deleted

### Success Metrics
```bash
# Before
$ grep -r "TODO" src/ | wc -l
40

# After
$ grep -r "TODO" src/ | wc -l
0

# Pre-commit hook verification
$ echo "// TODO: test" > src/test.ts
$ git add src/test.ts
$ git commit -m "test"
# Should fail with error message
```

---

## Task 1.2: Async I/O Conversion
**Agent**: `perf-optimizer-agent`
**Estimated**: 16 hours (2 days)
**Status**: 🔴 Critical

### Context
30+ instances of synchronous file I/O (`fs.readFileSync`, `fs.writeFileSync`) block the Node.js event loop, causing:
- CLI hangs when multiple agents spawn simultaneously
- Serialized operations that should be parallel
- Poor performance under concurrent load

### Objective
Convert all synchronous I/O to asynchronous operations without breaking existing functionality.

### Execution Steps

#### Step 1: Audit Sync I/O (2 hours)
```bash
# Find all sync operations
grep -rn "readFileSync\|writeFileSync\|readdirSync\|mkdirSync" src/ > /tmp/sync-io-audit.txt

# Categorize by priority:
# P0: Hot paths (agent spawning, CLI commands)
# P1: Initialization (config loading)
# P2: Utilities (one-time setup)
```

**Deliverable**: `docs/SYNC-IO-AUDIT.md` with prioritized list

#### Step 2: Refactor Hot Paths (10 hours)

**Pattern 1: Simple File Read**
```typescript
// ❌ BEFORE: src/utils/Config.ts
import { readFileSync } from 'fs';

loadConfig(path: string): Config {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

// ✅ AFTER:
import { promises as fs } from 'fs';

async loadConfig(path: string): Promise<Config> {
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content);
}
```

**Pattern 2: File Write**
```typescript
// ❌ BEFORE: src/core/ArtifactWorkflow.ts
import { writeFileSync } from 'fs';

saveArtifact(path: string, content: string): void {
  writeFileSync(path, content, 'utf-8');
}

// ✅ AFTER:
import { promises as fs } from 'fs';

async saveArtifact(path: string, content: string): Promise<void> {
  await fs.writeFile(path, content, 'utf-8');
}
```

**Pattern 3: Existence Check**
```typescript
// ❌ BEFORE:
import { existsSync } from 'fs';

if (existsSync(configPath)) {
  // ...
}

// ✅ AFTER:
import { promises as fs } from 'fs';

try {
  await fs.access(configPath);
  // File exists
} catch {
  // File doesn't exist
}
```

**Pattern 4: Directory Operations**
```typescript
// ❌ BEFORE:
import { mkdirSync, readdirSync } from 'fs';

mkdirSync(dirPath, { recursive: true });
const files = readdirSync(dirPath);

// ✅ AFTER:
import { promises as fs } from 'fs';

await fs.mkdir(dirPath, { recursive: true });
const files = await fs.readdir(dirPath);
```

#### Step 3: Update Function Signatures (2 hours)
```typescript
// All refactored functions become async
// Update call sites to await

// Example propagation:
class ArtifactWorkflow {
  async saveArtifact(...) { /* async */ }
  async loadArtifact(...) { /* async */ }
}

class FleetManager {
  async initializeArtifacts() {
    await this.workflow.saveArtifact(...);
    await this.workflow.loadArtifact(...);
  }
}

// CLI commands also become async (they already support this)
```

#### Step 4: Performance Validation (2 hours)
```bash
# Benchmark CLI startup time
hyperfine --warmup 3 --runs 10 "npx aqe init"

# Test concurrent operations
node -e "
const { spawn } = require('child_process');
const promises = Array(10).fill(null).map(() =>
  new Promise((resolve, reject) => {
    const proc = spawn('npx', ['aqe', 'agent', 'spawn', 'test-generator']);
    proc.on('exit', code => code === 0 ? resolve() : reject());
  })
);
Promise.all(promises).then(() => console.log('✅ All spawned'));
"

# Profile for event loop blocking
node --prof dist/cli/index.js init
node --prof-process isolate-*.log | grep "readFileSync"  # Should be 0 results
```

### Acceptance Criteria
- [ ] Zero `*Sync` file operations in `src/`
- [ ] All async functions properly awaited
- [ ] TypeScript compilation succeeds
- [ ] CLI startup time < 500ms
- [ ] Concurrent spawning works (10 agents in parallel)

### Success Metrics
```bash
# Before
$ grep -r "readFileSync\|writeFileSync" src/ | wc -l
30

# After
$ grep -r "readFileSync\|writeFileSync" src/ | wc -l
0

# Performance
$ hyperfine "npx aqe init"
Time (mean ± σ):     450ms ± 30ms  # Should be <500ms
```

---

## Task 1.3: Race Condition Elimination
**Agent**: `perf-optimizer-agent`
**Estimated**: 12 hours (1.5 days)
**Status**: 🔴 Critical

### Context
100+ instances of `setTimeout` assume operations complete within fixed time, creating:
- Non-deterministic test failures (flaky tests)
- Silent coordination failures in production
- Wasted time (waiting longer than necessary)

### Objective
Replace timing-based coordination with event-driven patterns.

### Execution Steps

#### Step 1: Audit Timing Code (2 hours)
```bash
# Find all setTimeout/setInterval
grep -rn "setTimeout\|setInterval" src/ > /tmp/timing-audit.txt

# Categorize:
# 🔴 Race conditions (assuming completion)
# 🟡 Intentional delays (OK if documented)
# 🟢 Legitimate timers (timeout mechanisms)
```

**Deliverable**: `docs/RACE-CONDITION-AUDIT.md` with categorized list

#### Step 2: Extend BaseAgent with Events (2 hours)
```typescript
// File: src/core/BaseAgent.ts
import { EventEmitter } from 'events';

export class BaseAgent extends EventEmitter {
  private _status: AgentStatus = 'initializing';

  get status(): AgentStatus {
    return this._status;
  }

  protected setStatus(status: AgentStatus): void {
    this._status = status;
    this.emit('status-changed', status);

    // Emit specific events
    if (status === 'ready') this.emit('ready');
    if (status === 'terminated') this.emit('terminated');
  }

  // Helper: Wait for specific status
  async waitForStatus(
    targetStatus: AgentStatus,
    timeout = 10000
  ): Promise<void> {
    if (this._status === targetStatus) return;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for status: ${targetStatus}`));
      }, timeout);

      this.once('status-changed', (status) => {
        if (status === targetStatus) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  // Convenience methods
  async waitForReady(timeout?: number): Promise<void> {
    return this.waitForStatus('ready', timeout);
  }

  async waitForTermination(timeout?: number): Promise<void> {
    return this.waitForStatus('terminated', timeout);
  }
}
```

#### Step 3: Refactor Agent Coordination (6 hours)

**Pattern 1: Agent Spawning**
```typescript
// ❌ BEFORE: src/agents/FleetCommanderAgent.ts
async spawnAgent(type: AgentType): Promise<Agent> {
  const agent = new Agent(config);
  agent.initialize();

  // WRONG: Assuming 5 seconds is enough
  await new Promise(resolve => setTimeout(resolve, 5000));

  return agent;
}

// ✅ AFTER:
async spawnAgent(type: AgentType): Promise<Agent> {
  const agent = new Agent(config);
  agent.initialize();

  // CORRECT: Wait for actual readiness
  await agent.waitForReady(10000); // 10s timeout

  return agent;
}
```

**Pattern 2: Background Monitoring**
```typescript
// ❌ BEFORE: src/agents/FleetCommanderAgent.ts
constructor() {
  // WRONG: Polling every 5 seconds
  this.heartbeatMonitor = setInterval(async () => {
    await this.checkHeartbeats();
  }, 5000);
}

// ✅ AFTER:
constructor() {
  // CORRECT: Event-driven heartbeats
  this.agents.forEach(agent => {
    agent.on('heartbeat', () => this.updateLastSeen(agent.id));
    agent.on('heartbeat-missed', () => this.handleMissedHeartbeat(agent.id));
  });
}

// Each agent emits heartbeat events
class BaseAgent extends EventEmitter {
  private heartbeatInterval = setInterval(() => {
    this.emit('heartbeat');
  }, 5000);
}
```

**Pattern 3: Test Execution**
```typescript
// ❌ BEFORE: src/agents/TestExecutorAgent.ts
async executeTest(test: Test): Promise<TestResult> {
  this.runner.run(test);

  // WRONG: Guessing execution time
  await new Promise(resolve => setTimeout(resolve, test.estimatedDuration));

  return this.runner.getResult(test.id);
}

// ✅ AFTER:
async executeTest(test: Test): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    this.runner.on('test-complete', (result) => {
      if (result.testId === test.id) {
        resolve(result);
      }
    });

    this.runner.on('test-error', (error) => {
      if (error.testId === test.id) {
        reject(error);
      }
    });

    this.runner.run(test);
  });
}
```

#### Step 4: Update Tests (2 hours)
```typescript
// ❌ BEFORE: Timing-based tests
it('agent becomes ready', async () => {
  const agent = new TestGeneratorAgent(config);
  agent.initialize();

  await new Promise(resolve => setTimeout(resolve, 1000));

  expect(agent.status).toBe('ready'); // FLAKY
});

// ✅ AFTER: Event-based tests
it('agent becomes ready', async () => {
  const agent = new TestGeneratorAgent(config);
  agent.initialize();

  await agent.waitForReady(5000); // Explicit timeout

  expect(agent.status).toBe('ready'); // DETERMINISTIC
});
```

### Acceptance Criteria
- [ ] Event-driven coordination implemented in BaseAgent
- [ ] <10 setTimeout calls remaining (only legitimate delays)
- [ ] All tests deterministic (100 runs, 0 failures)
- [ ] Agent coordination proven under stress

### Success Metrics
```bash
# Before
$ grep -r "setTimeout.*resolve" src/ | wc -l
100

# After
$ grep -r "setTimeout.*resolve" src/ | wc -l
<10

# Test stability (should pass 100/100 times)
$ for i in {1..100}; do npm test || exit 1; done
✅ All 100 runs passed
```

---

## Coordination Protocol

### Agent Communication
All agents share progress via memory:
```typescript
await memoryStore.store('priority-1:task-1.1:status', {
  status: 'in-progress',
  progress: 60, // percentage
  completedSubtasks: ['audit', 'implement-high-priority'],
  remainingSubtasks: ['delete-low-priority', 'add-hook']
}, 'swarm-coordination');
```

### Daily Status Updates
```markdown
**Priority 1 Status** (End of Day 1):
- Task 1.1 (TODO Elimination): 40% complete (audit done, implementing)
- Task 1.2 (Async I/O): 20% complete (audit done, starting refactor)
- Task 1.3 (Race Conditions): 10% complete (starting audit)

**Blockers**: None
**On Track**: Yes (estimated completion: Day 3)
```

---

## Final Validation

### Priority 1 Complete When:
```bash
# All checks pass
npm run validate-priority-1

# Which runs:
✅ grep -r "TODO\|FIXME" src/ | wc -l == 0
✅ grep -r "readFileSync" src/ | wc -l == 0
✅ grep -r "setTimeout.*resolve" src/ | wc -l < 10
✅ npm test (all pass, 0 flakes in 100 runs)
✅ hyperfine "npx aqe init" (< 500ms)
✅ Concurrent spawn test (10 agents in parallel)
```

**When all pass**: Move to Priority 2
