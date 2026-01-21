# AQE Subagent Coordination Guide

## Overview

### What Are Subagents?

Subagents are specialized agents spawned by parent agents to handle discrete phases of a workflow. Unlike parent agents that orchestrate entire tasks, subagents:

- Execute a single, focused responsibility
- Read context from memory written by previous phases
- Write output to memory for subsequent phases
- Validate completion criteria before handoff

### Coordination Protocol Pattern

```
Parent Agent
    │
    ├── Spawns Subagent A (Phase 1)
    │       └── Writes to memory: aqe/{domain}/cycle-{id}/phase-a
    │
    ├── Spawns Subagent B (Phase 2)
    │       ├── Reads from: aqe/{domain}/cycle-{id}/phase-a
    │       └── Writes to: aqe/{domain}/cycle-{id}/phase-b
    │
    └── Spawns Subagent C (Phase 3)
            ├── Reads from: aqe/{domain}/cycle-{id}/phase-b
            └── Writes to: aqe/{domain}/cycle-{id}/phase-c
```

---

## Memory Coordination

### Namespace Convention

All subagent coordination uses the pattern:
```
aqe/{domain}/cycle-{cycleId}/{phase}/{key}
```

**Domain Examples:**
- `tdd` - Test-Driven Development workflows
- `quality` - Quality validation workflows
- `coverage` - Coverage analysis workflows
- `security` - Security scan workflows

### Reading Input from Parent/Previous Phase

```javascript
// Subagent reads context established by parent
mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "aqe/tdd/cycle-abc123/context",
  namespace: "coordination"
})

// Response contains:
{
  targetFile: "src/services/user.service.ts",
  testFile: "tests/user.service.test.ts",
  requirements: ["validate email", "hash password"],
  cycleId: "abc123"
}
```

### Writing Output for Handoff

```javascript
// RED phase writes test results
mcp__claude-flow__memory_usage({
  action: "store",
  key: "aqe/tdd/cycle-abc123/red/tests",
  namespace: "coordination",
  value: JSON.stringify({
    phase: "red",
    status: "complete",
    testFile: "tests/user.service.test.ts",
    testCount: 5,
    fileHash: "sha256:abc...",
    timestamp: Date.now()
  }),
  ttl: 3600000  // 1 hour TTL
})
```

### TTL and Partition Settings

| Use Case | TTL | Reason |
|----------|-----|--------|
| Phase output | 1 hour | Active cycle data |
| Cycle summary | 24 hours | Post-cycle analysis |
| Metrics | 7 days | Historical tracking |
| Permanent | No TTL | Reference patterns |

---

## Spawning Patterns

### Using Claude Code Task Tool

Subagents are spawned using Claude Code's Task tool, not MCP agent_spawn:

```javascript
// Parent agent spawns RED phase subagent
Task(
  "TDD RED Phase",
  `Execute RED phase for cycle ${cycleId}.

   1. Read context from: aqe/tdd/cycle-${cycleId}/context
   2. Write failing tests to: ${testFile}
   3. Store results in: aqe/tdd/cycle-${cycleId}/red/tests
   4. Validate tests fail before completing`,
  "qe-tdd-red"
)
```

### Passing cycleId for Context

The cycleId is critical for maintaining coordination:

```javascript
// Generate unique cycle ID
const cycleId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Pass to all subagents in the cycle
Task("RED Phase", `... cycle-${cycleId} ...`, "qe-tdd-red")
Task("GREEN Phase", `... cycle-${cycleId} ...`, "qe-tdd-green")
Task("REFACTOR Phase", `... cycle-${cycleId} ...`, "qe-tdd-refactor")
```

### Sequential vs Parallel Execution

**Sequential (TDD):** Each phase depends on previous output
```javascript
// Must wait for RED before GREEN
await Task("RED Phase", "...", "qe-tdd-red")
await Task("GREEN Phase", "...", "qe-tdd-green")
await Task("REFACTOR Phase", "...", "qe-tdd-refactor")
```

**Parallel (Independent Analysis):**
```javascript
// Can run simultaneously
Task("Unit Coverage", "...", "qe-coverage-analyzer")
Task("Complexity Analysis", "...", "qe-code-analyzer")
Task("Security Scan", "...", "qe-security-scanner")
```

---

## TDD Workflow Example

### Complete RED-GREEN-REFACTOR Cycle

```javascript
// Parent: qe-tdd-orchestrator
const cycleId = generateCycleId();

// 1. Store context
mcp__claude-flow__memory_usage({
  action: "store",
  key: `aqe/tdd/cycle-${cycleId}/context`,
  namespace: "coordination",
  value: JSON.stringify({
    targetFile: "src/services/auth.service.ts",
    testFile: "tests/auth.service.test.ts",
    requirements: ["validateToken", "refreshToken", "revokeToken"],
    cycleId
  })
})

// 2. Spawn RED phase
Task("TDD RED", `
  Read: aqe/tdd/cycle-${cycleId}/context
  Write failing tests for each requirement.
  Store at: aqe/tdd/cycle-${cycleId}/red/tests
  Ensure all tests FAIL before completing.
`, "qe-tdd-red")

// 3. Spawn GREEN phase (after RED completes)
Task("TDD GREEN", `
  Validate: aqe/tdd/cycle-${cycleId}/red/tests exists with status=complete
  Read test file and implement minimal code.
  Store at: aqe/tdd/cycle-${cycleId}/green/impl
  Ensure all tests PASS before completing.
`, "qe-tdd-green")

// 4. Spawn REFACTOR phase (after GREEN completes)
Task("TDD REFACTOR", `
  Validate: aqe/tdd/cycle-${cycleId}/green/impl exists with status=complete
  Refactor for quality without changing behavior.
  Store at: aqe/tdd/cycle-${cycleId}/refactor/result
  Ensure all tests still PASS after refactoring.
`, "qe-tdd-refactor")
```

### Memory Flow Diagram

```
TDD Memory Flow:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Parent Agent   │     │   RED Phase     │     │  GREEN Phase    │     │ REFACTOR Phase  │
│  Stores Context │ --> │  Writes Tests   │ --> │  Writes Impl    │ --> │  Writes Result  │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │                       │
        v                       v                       v                       v
aqe/tdd/cycle-{id}/    aqe/tdd/cycle-{id}/    aqe/tdd/cycle-{id}/    aqe/tdd/cycle-{id}/
      context               red/tests            green/impl          refactor/result
        │                       │                       │                       │
        │                       v                       v                       v
        │               ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
        │               │ status: done  │       │ status: done  │       │ status: done  │
        │               │ testCount: 5  │       │ passing: true │       │ improved: true│
        │               │ failing: true │       │ coverage: 95% │       │ coverage: 95% │
        └───────────────┴───────────────┴───────┴───────────────┴───────┴───────────────┘
```

### Validation Gates Between Phases

Each subagent validates the previous phase before starting:

```javascript
// GREEN phase validation
async function validateRedPhase(cycleId) {
  const result = await mcp__claude-flow__memory_usage({
    action: "retrieve",
    key: `aqe/tdd/cycle-${cycleId}/red/tests`,
    namespace: "coordination"
  });

  if (!result || result.status !== "complete") {
    throw new Error(`RED phase incomplete for cycle ${cycleId}`);
  }

  if (!result.failing) {
    throw new Error("RED phase tests must be failing");
  }

  return result;
}
```

---

## Quality Workflow Example

### Code Review and Validation Flow

```javascript
const cycleId = generateCycleId();

// 1. Store review context
mcp__claude-flow__memory_usage({
  action: "store",
  key: `aqe/quality/cycle-${cycleId}/context`,
  namespace: "coordination",
  value: JSON.stringify({
    files: ["src/services/*.ts"],
    checks: ["complexity", "duplication", "security"],
    threshold: { complexity: 10, duplication: 5 },
    cycleId
  })
})

// 2. Spawn parallel analysis subagents
Task("Complexity Analysis", `
  Read: aqe/quality/cycle-${cycleId}/context
  Analyze cyclomatic complexity.
  Store at: aqe/quality/cycle-${cycleId}/complexity
`, "qe-code-analyzer")

Task("Duplication Check", `
  Read: aqe/quality/cycle-${cycleId}/context
  Find code duplication.
  Store at: aqe/quality/cycle-${cycleId}/duplication
`, "qe-code-analyzer")

Task("Security Scan", `
  Read: aqe/quality/cycle-${cycleId}/context
  Scan for vulnerabilities.
  Store at: aqe/quality/cycle-${cycleId}/security
`, "qe-security-scanner")

// 3. Aggregate results (after all complete)
Task("Quality Gate", `
  Read all: aqe/quality/cycle-${cycleId}/*
  Aggregate findings and determine pass/fail.
  Store at: aqe/quality/cycle-${cycleId}/gate-result
`, "qe-quality-gate")
```

### Integration with TDD Output

```javascript
// Quality validation after TDD cycle
Task("Post-TDD Quality", `
  Read TDD result: aqe/tdd/cycle-${tddCycleId}/refactor/result
  Run quality checks on implemented code.
  Store at: aqe/quality/cycle-${qualityCycleId}/post-tdd
  Link to TDD cycle: ${tddCycleId}
`, "qe-quality-gate")
```

---

## Error Handling

### Phase Validation Failures

```javascript
// Subagent error handling pattern
async function executePhase(cycleId, phase) {
  try {
    // Validate previous phase
    const previous = await validatePreviousPhase(cycleId, phase);

    // Execute phase work
    const result = await doPhaseWork(previous);

    // Store result
    await storePhaseResult(cycleId, phase, result);

  } catch (error) {
    // Store error state
    await mcp__claude-flow__memory_usage({
      action: "store",
      key: `aqe/tdd/cycle-${cycleId}/${phase}/error`,
      namespace: "coordination",
      value: JSON.stringify({
        error: error.message,
        phase,
        timestamp: Date.now(),
        recoverable: isRecoverable(error)
      })
    });

    throw error;
  }
}
```

### Recovery Strategies

| Error Type | Strategy |
|------------|----------|
| Missing previous phase | Wait and retry with backoff |
| Validation failure | Log and notify parent |
| File not found | Check alternate paths |
| Memory timeout | Retry with extended TTL |

### Retry Pattern

```javascript
async function retryPhase(cycleId, phase, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await executePhase(cycleId, phase);
      return;
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Exponential backoff
      await sleep(1000 * Math.pow(2, attempt));

      // Log retry
      console.log(`Retry ${attempt}/${maxRetries} for ${phase}`);
    }
  }
}
```

---

## Best Practices

### 1. Always Validate Previous Phase

```javascript
// Before starting any phase
const previous = await mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: `aqe/tdd/cycle-${cycleId}/${previousPhase}/result`,
  namespace: "coordination"
});

if (!previous || previous.status !== "complete") {
  throw new Error(`Cannot start ${phase}: ${previousPhase} incomplete`);
}
```

### 2. Use File Hashes for Integrity

```javascript
// Store hash when writing files
const hash = crypto.createHash('sha256')
  .update(fileContent)
  .digest('hex');

await storeResult({
  file: filePath,
  fileHash: `sha256:${hash}`,
  // ...
});

// Verify hash before processing
const currentHash = computeHash(await readFile(filePath));
if (currentHash !== storedHash) {
  throw new Error("File modified since previous phase");
}
```

### 3. Clean Up Memory After Cycle Completion

```javascript
// After cycle completes successfully
async function cleanupCycle(cycleId) {
  const keys = [
    `aqe/tdd/cycle-${cycleId}/context`,
    `aqe/tdd/cycle-${cycleId}/red/tests`,
    `aqe/tdd/cycle-${cycleId}/green/impl`,
    `aqe/tdd/cycle-${cycleId}/refactor/result`
  ];

  for (const key of keys) {
    await mcp__claude-flow__memory_usage({
      action: "delete",
      key,
      namespace: "coordination"
    });
  }
}
```

### 4. Emit Events for Monitoring

```javascript
// Each phase should emit events
npx claude-flow@alpha hooks notify \
  --message "Phase ${phase} complete for cycle ${cycleId}" \
  --level "info" \
  --tags "tdd,${phase},cycle-${cycleId}"
```

### 5. Document Phase Contracts

Each subagent should clearly document:
- Required input memory keys
- Output memory keys produced
- Validation criteria
- Success/failure conditions

---

## Summary

Subagent coordination follows a clear pattern:
1. Parent establishes context in memory
2. Subagents read input, execute work, write output
3. Each phase validates previous before starting
4. Memory namespace maintains isolation per cycle
5. Cleanup after successful completion

This enables complex workflows like TDD and quality gates to be broken into focused, testable phases while maintaining coordination through shared memory state.
