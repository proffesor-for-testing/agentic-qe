# AQE Fleet Orchestration Reference

## Overview

The AQE (Agentic Quality Engineering) Fleet provides specialized quality engineering agents organized into 12 DDD domains.

---

## Fleet Initialization

```javascript
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",  // Queen-led for QE coordination
  maxAgents: 15,
  enabledDomains: ["test-generation", "coverage-analysis", "quality-assessment"],
  lazyLoading: true
})
```

---

## 12 DDD Domains

| Domain | Primary Agents | Focus Area |
|--------|---------------|------------|
| `test-generation` | qe-test-architect, qe-tdd-specialist | AI-powered test creation |
| `test-execution` | qe-parallel-executor, qe-flaky-hunter, qe-retry-handler | Parallel execution, flaky detection |
| `coverage-analysis` | qe-coverage-specialist, qe-gap-detector | O(log n) sublinear coverage |
| `quality-assessment` | qe-quality-gate, qe-deployment-advisor | Quality gates, risk scoring |
| `defect-intelligence` | qe-defect-predictor, qe-root-cause-analyzer | ML-powered defect prediction |
| `learning-optimization` | qe-learning-coordinator, qe-pattern-learner | Cross-domain pattern learning |
| `requirements-validation` | qe-tdd-specialist, qe-property-tester | BDD scenarios, property tests |
| `code-intelligence` | qe-knowledge-manager, code-analyzer | Knowledge graphs, 80% token reduction |
| `security-compliance` | qe-security-scanner, qe-security-auditor | OWASP, CVE detection |
| `contract-testing` | qe-contract-validator, qe-api-tester | Pact, schema validation |
| `visual-accessibility` | qe-visual-tester, qe-a11y-validator | Visual regression, WCAG |
| `chaos-resilience` | qe-chaos-engineer, qe-performance-tester | Fault injection, load testing |

---

## MCP Tools

### Fleet Management

```javascript
// Initialize fleet
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  maxAgents: 15,
  enabledDomains: ["test-generation", "coverage-analysis"]
})

// Get fleet status
mcp__agentic-qe__fleet_status({ verbose: true })

// Check fleet health
mcp__agentic-qe__fleet_health({ domain: "test-generation" })
```

### Agent Management

```javascript
// Spawn agent in domain
mcp__agentic-qe__agent_spawn({ domain: "test-generation", type: "worker" })

// List agents
mcp__agentic-qe__agent_list({ domain: "coverage-analysis" })

// Get agent metrics
mcp__agentic-qe__agent_metrics({ agentId: "agent-123" })

// Get agent status
mcp__agentic-qe__agent_status({ agentId: "agent-123" })
```

### Task Management

```javascript
// Submit task
mcp__agentic-qe__task_submit({
  type: "test-generation",
  priority: "p1",  // p0, p1, p2, p3
  payload: { sourceFile: "src/auth.ts", testType: "unit" }
})

// Orchestrate complex task
mcp__agentic-qe__task_orchestrate({
  task: "comprehensive-testing",
  strategy: "adaptive"  // parallel, sequential, adaptive
})

// List tasks
mcp__agentic-qe__task_list({ status: "running", limit: 50 })

// Get task status
mcp__agentic-qe__task_status({ taskId: "task-123" })

// Cancel task
mcp__agentic-qe__task_cancel({ taskId: "task-123" })
```

### Test Operations

```javascript
// AI-enhanced test generation
mcp__agentic-qe__test_generate_enhanced({
  sourceCode: "...",
  language: "typescript",
  testType: "unit"  // unit, integration, e2e
})

// Parallel test execution
mcp__agentic-qe__test_execute_parallel({
  testFiles: ["tests/**/*.test.ts"],
  parallel: true
})
```

### Coverage & Quality

```javascript
// Sublinear coverage analysis
mcp__agentic-qe__coverage_analyze_sublinear({
  target: "src/",
  detectGaps: true
})

// Quality assessment
mcp__agentic-qe__quality_assess({ runGate: true })
```

### Security & Compliance

```javascript
// Security scan
mcp__agentic-qe__security_scan_comprehensive({
  target: "src/",
  sast: true,
  dast: false
})

// Contract validation
mcp__agentic-qe__contract_validate({ contractPath: "api/contract.json" })

// Accessibility test
mcp__agentic-qe__accessibility_test({
  url: "http://localhost:3000",
  standard: "WCAG2.1"
})
```

### Chaos & Performance

```javascript
// Chaos engineering
mcp__agentic-qe__chaos_test({
  target: "api-service",
  faultType: "network-delay"
})

// Defect prediction
mcp__agentic-qe__defect_predict({ target: "src/" })
```

### Requirements

```javascript
// Requirements validation
mcp__agentic-qe__requirements_validate({ requirementsPath: "docs/requirements.md" })

// Code indexing for knowledge graph
mcp__agentic-qe__code_index({ target: "src/" })
```

---

## Memory Operations

```javascript
// Store pattern
mcp__agentic-qe__memory_store({
  key: "coverage-pattern-auth",
  value: { pattern: "...", successRate: 0.95 },
  namespace: "qe-patterns"
})

// Retrieve pattern
mcp__agentic-qe__memory_retrieve({
  key: "coverage-pattern-auth",
  namespace: "qe-patterns"
})

// Query with pattern matching
mcp__agentic-qe__memory_query({
  pattern: "coverage-*",
  namespace: "qe-patterns"
})

// Delete entry
mcp__agentic-qe__memory_delete({
  key: "old-pattern",
  namespace: "qe-patterns"
})

// Get memory usage
mcp__agentic-qe__memory_usage()

// Share knowledge between agents
mcp__agentic-qe__memory_share({
  sourceAgentId: "agent-1",
  targetAgentIds: ["agent-2", "agent-3"],
  knowledgeDomain: "test-patterns"
})
```

---

## 🧠 Auto-Learning Protocol

### Before Starting Any QE Task

```javascript
// 1. Search for similar test patterns from past successes
mcp__agentic-qe__memory_query({
  pattern: "[task-type]-*",  // e.g., "unit-test-*", "coverage-*"
  namespace: "qe-patterns"
})

// 2. Check defect prediction for the target
mcp__agentic-qe__defect_predict({ target: "src/[module]" })

// 3. Review coverage gaps to prioritize
mcp__agentic-qe__coverage_analyze_sublinear({
  target: "src/[module]",
  detectGaps: true
})
```

### After Completing QE Task Successfully

```javascript
// 1. Store successful test pattern
mcp__agentic-qe__memory_store({
  key: "[task-type]-[module]-pattern",
  value: {
    approach: "what worked",
    testCount: 15,
    coverageGain: 12.5,
    successRate: 0.95
  },
  namespace: "qe-patterns"
})

// 2. Share knowledge with other agents
mcp__agentic-qe__memory_share({
  sourceAgentId: "current-agent",
  targetAgentIds: ["qe-learning-coordinator"],
  knowledgeDomain: "test-patterns"
})

// 3. Update code intelligence index
mcp__agentic-qe__code_index({ target: "src/[module]" })
```

### Continuous Learning Triggers

| Trigger | Action | MCP Tool |
|---------|--------|----------|
| After test generation | Store test patterns | `memory_store` (namespace: "test-patterns") |
| After coverage analysis | Store gap patterns | `memory_store` (namespace: "coverage-gaps") |
| After flaky test fix | Store stabilization pattern | `memory_store` (namespace: "flaky-fixes") |
| After security scan | Store vulnerability patterns | `memory_store` (namespace: "security-patterns") |
| After quality gate pass | Store quality metrics | `memory_store` (namespace: "quality-metrics") |
| Cross-agent learning | Share patterns fleet-wide | `memory_share` |

### QE-Specific Namespaces

| Namespace | Purpose | Example Keys |
|-----------|---------|--------------|
| `qe-patterns` | General QE patterns | `unit-test-auth-pattern` |
| `test-patterns` | Test generation patterns | `integration-api-pattern` |
| `coverage-gaps` | Coverage gap analysis | `gap-auth-module-2024` |
| `flaky-fixes` | Flaky test stabilization | `flaky-async-timeout-fix` |
| `security-patterns` | Security vulnerability patterns | `xss-prevention-pattern` |
| `quality-metrics` | Quality gate metrics | `gate-pass-metrics-sprint-5` |
| `defect-predictions` | Predicted defect areas | `high-risk-payment-module` |

### Memory-Enhanced QE Workflow

**ALWAYS check memory before:**
- Generating tests (search for similar test patterns)
- Analyzing coverage (search for known gap patterns)
- Running security scans (search for known vulnerabilities)
- Investigating flaky tests (search for stabilization patterns)

**ALWAYS store in memory after:**
- Successfully generating comprehensive tests
- Discovering and filling coverage gaps
- Fixing flaky tests
- Identifying security vulnerabilities
- Passing quality gates with good metrics

---

## Task Routing by Domain

| Task Type | MCP Tool | Agents Spawned |
|-----------|----------|----------------|
| Generate tests | `test_generate_enhanced` | qe-test-architect, qe-tdd-specialist |
| Run tests | `test_execute_parallel` | qe-parallel-executor, qe-retry-handler |
| Analyze coverage | `coverage_analyze_sublinear` | qe-coverage-specialist, qe-gap-detector |
| Quality gate | `quality_assess` | qe-quality-gate, qe-deployment-advisor |
| Security scan | `security_scan_comprehensive` | qe-security-scanner, qe-security-auditor |
| Chaos test | `chaos_test` | qe-chaos-engineer, qe-load-tester |

---

## Integration with Claude Flow

```javascript
// STEP 1: Initialize Claude Flow swarm
Bash("npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 15")

// STEP 2: Initialize AQE Fleet
mcp__agentic-qe__fleet_init({ topology: "hierarchical", maxAgents: 10 })

// STEP 3: Spawn agents via Claude Code Task tool
Task({ prompt: "Generate tests for auth module", subagent_type: "qe-test-architect", run_in_background: true })
Task({ prompt: "Analyze coverage gaps", subagent_type: "qe-coverage-specialist", run_in_background: true })

// STEP 4: Store learnings in both systems
mcp__agentic-qe__memory_store({ key: "pattern-1", value: "...", namespace: "qe-patterns" })
Bash("npx @claude-flow/cli@latest memory store --key 'qe-pattern-1' --value '...' --namespace patterns")
```

---

## QE Agents Reference

### Test Generation Domain
- `qe-test-architect` - AI-powered test generation with pattern recognition
- `qe-tdd-specialist` - TDD Red-Green-Refactor specialist
- `qe-tdd-red` - TDD RED phase (write failing tests)
- `qe-tdd-green` - TDD GREEN phase (minimal implementation)
- `qe-tdd-refactor` - TDD REFACTOR phase (improve design)

### Test Execution Domain
- `qe-test-executor` - Multi-framework test executor
- `qe-parallel-executor` - Parallel execution with sharding
- `qe-flaky-hunter` - Flaky test detection and remediation
- `qe-retry-handler` - Intelligent retry with backoff

### Coverage Domain
- `qe-coverage-specialist` - O(log n) sublinear analysis
- `qe-gap-detector` - Risk-scored gap detection

### Quality Domain
- `qe-quality-gate` - Quality gate decisions
- `qe-deployment-advisor` - Deployment readiness assessment
- `qe-code-reviewer` - Code review specialist

### Security Domain
- `qe-security-scanner` - SAST/DAST scanning
- `qe-security-auditor` - OWASP compliance
- `qe-security-reviewer` - Security review specialist

### Intelligence Domain
- `qe-defect-predictor` - ML-powered defect prediction
- `qe-root-cause-analyzer` - Systematic root cause analysis
- `qe-pattern-learner` - Pattern discovery and learning
- `qe-learning-coordinator` - Fleet-wide learning coordination
