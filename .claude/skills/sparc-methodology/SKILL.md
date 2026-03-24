---
name: sparc-methodology
description: "Apply SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology with multi-agent orchestration and TDD workflows. Use when structuring development phases, coordinating parallel agents, or running systematic spec-to-deployment pipelines."
---

# SPARC Methodology

Systematic development methodology integrating multi-agent orchestration across 17 specialized modes, from specification through deployment.

## Quick Start

```bash
# Run a specific SPARC mode
npx claude-flow sparc run coder "implement user authentication with JWT"

# Execute TDD workflow
npx claude-flow sparc tdd "shopping cart feature"

# Full development pipeline
npx claude-flow sparc pipeline "e-commerce checkout feature"

# List all available modes
npx claude-flow sparc modes
```

## Development Phases

| Phase | Goal | Key Modes |
|-------|------|-----------|
| 1. Specification | Define requirements, constraints, success criteria | `researcher`, `analyzer`, `memory-manager` |
| 2. Architecture | Design system structure and interfaces | `architect`, `designer`, `orchestrator` |
| 3. Refinement | TDD implementation (red-green-refactor) | `tdd`, `coder`, `tester` |
| 4. Review | Quality, security, performance checks | `reviewer`, `optimizer`, `debugger` |
| 5. Completion | Integration, deployment, monitoring | `workflow-manager`, `documenter` |

## Core Orchestration Modes

### `orchestrator` — Multi-agent task coordination
```javascript
mcp__claude-flow__sparc_mode {
  mode: "orchestrator",
  task_description: "coordinate feature development",
  options: { parallel: true, monitor: true }
}
```

### `swarm-coordinator` — Complex multi-agent workflows
Manages topology optimization (mesh, hierarchical, ring, star), agent lifecycle, dynamic scaling, and fault tolerance.

### `batch-executor` — Parallel task execution
Handles concurrent file operations, resource pooling, load balancing, and progress aggregation.

## Development Modes

### `coder` — Autonomous code generation
```javascript
mcp__claude-flow__sparc_mode {
  mode: "coder",
  task_description: "implement user authentication with JWT",
  options: { test_driven: true, parallel_edits: true, typescript: true }
}
```

### `architect` — System design with memory coordination
```javascript
mcp__claude-flow__sparc_mode {
  mode: "architect",
  task_description: "design scalable e-commerce platform",
  options: { detailed: true, memory_enabled: true, patterns: ["microservices", "event-driven"] }
}
```

### `tdd` — Test-driven development
```javascript
mcp__claude-flow__sparc_mode {
  mode: "tdd",
  task_description: "shopping cart with payment integration",
  options: { coverage_target: 90, test_framework: "jest", e2e_framework: "playwright" }
}
```

### `reviewer` — Batch file code review
```javascript
mcp__claude-flow__sparc_mode {
  mode: "reviewer",
  task_description: "review authentication module PR #123",
  options: { security_check: true, performance_check: true, test_coverage_check: true }
}
```

## Analysis & Support Modes

| Mode | Purpose |
|------|---------|
| `researcher` | Deep research with parallel WebSearch/WebFetch and memory |
| `analyzer` | Static code analysis, dependency analysis, pattern recognition |
| `optimizer` | Algorithm optimization, query tuning, caching strategies |
| `designer` | UI/UX design with WCAG 2.1 accessibility |
| `innovator` | Creative problem-solving and proof of concepts |
| `documenter` | API docs (OpenAPI), architecture diagrams, guides |
| `debugger` | Systematic bug reproduction and root cause analysis |
| `tester` | Test expansion, edge cases, load/chaos testing |
| `memory-manager` | Cross-session persistence and knowledge graphs |

## Orchestration Patterns

### 1. Hierarchical Coordination
```javascript
mcp__claude-flow__swarm_init { topology: "hierarchical", maxAgents: 12 }
mcp__claude-flow__agent_spawn { type: "coordinator", capabilities: ["planning", "delegation"] }
mcp__claude-flow__agent_spawn { type: "architect" }
mcp__claude-flow__agent_spawn { type: "coder" }
mcp__claude-flow__agent_spawn { type: "tester" }
```

### 2. Sequential Pipeline
```javascript
mcp__claude-flow__workflow_create {
  name: "development-pipeline",
  steps: [
    { mode: "researcher", task: "gather requirements" },
    { mode: "architect", task: "design system" },
    { mode: "coder", task: "implement features" },
    { mode: "tdd", task: "create tests" },
    { mode: "reviewer", task: "review code" }
  ]
}
```

### 3. Parallel Execution
```javascript
mcp__claude-flow__task_orchestrate {
  task: "build full-stack application",
  strategy: "parallel",
  dependencies: {
    backend: [], frontend: [], database: [],
    tests: ["backend", "frontend"]
  }
}
```

## TDD Red-Green-Refactor Cycle

```javascript
// RED: Write failing test
mcp__claude-flow__sparc_mode {
  mode: "tester",
  task_description: "create failing test for shopping cart add item",
  options: { expect_failure: true }
}

// GREEN: Minimal implementation
mcp__claude-flow__sparc_mode {
  mode: "coder",
  task_description: "implement minimal code to pass test",
  options: { minimal: true }
}

// REFACTOR: Improve quality
mcp__claude-flow__sparc_mode {
  mode: "coder",
  task_description: "refactor shopping cart implementation",
  options: { maintain_tests: true }
}
```

## Memory Integration

```javascript
// Store architectural decisions
mcp__claude-flow__memory_usage {
  action: "store", namespace: "architecture",
  key: "api-design-v1", value: JSON.stringify(apiDesign),
  ttl: 86400000
}

// Retrieve in subsequent agents
mcp__claude-flow__memory_usage {
  action: "retrieve", namespace: "architecture",
  key: "api-design-v1"
}
```

## Common Workflows

### Feature Development
```bash
npx claude-flow sparc run researcher "authentication patterns"
npx claude-flow sparc run architect "design auth system"
npx claude-flow sparc tdd "user authentication feature"
npx claude-flow sparc run reviewer "review auth implementation"
npx claude-flow sparc run documenter "document auth API"
```

### Bug Investigation
```bash
npx claude-flow sparc run analyzer "investigate bug #456"
npx claude-flow sparc run debugger "fix memory leak in service X"
npx claude-flow sparc run tester "regression tests for bug #456"
```

### Performance Optimization
```bash
npx claude-flow sparc run analyzer "profile API response times"
npx claude-flow sparc run optimizer "optimize database queries"
npx claude-flow sparc run coder "implement caching layer"
npx claude-flow sparc run tester "performance benchmarks"
```

## Hook Integration

```bash
npx claude-flow@alpha hooks pre-task --description "implement auth"
npx claude-flow@alpha hooks post-edit --file "auth.js"
npx claude-flow@alpha hooks post-task --task-id "task-123"
```

## Quick Reference

```bash
npx claude-flow sparc modes              # List modes
npx claude-flow sparc run <mode> "task"  # Run specific mode
npx claude-flow sparc tdd "feature"      # TDD workflow
npx claude-flow sparc pipeline "task"    # Full pipeline
npx claude-flow sparc batch <modes> "task" # Batch execution
```
