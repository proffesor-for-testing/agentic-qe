# Claude Code Configuration - Agentic QE v3 + Claude Flow

## ⚠️ CRITICAL POLICIES

### Integrity Rule (ABSOLUTE)
- ❌ NO shortcuts, fake data, or false claims
- ✅ ALWAYS implement properly, verify before claiming success
- ✅ ALWAYS use real database queries for integration tests
- ✅ ALWAYS run actual tests, not assume they pass

**We value the quality we deliver to our users.**

### Git Operations
- ❌ NEVER auto-commit/push without explicit user request
- ✅ ALWAYS wait for: "commit this" or "push to main"

### Test Execution
- ❌ NEVER run `npm test` (OOM risk in DevPod/Codespaces)
- ✅ Use: `npm run test:unit`, `npm run test:integration`
- ✅ For v3: `cd v3 && npm test -- --run`

### File Organization
- ❌ NEVER save working files to root folder
- ✅ Use: `/docs`, `/tests`, `/src`, `/scripts`, `/examples`, `/v3`

### Data Protection
- ❌ NEVER run `rm -f` on `.agentic-qe/` or `*.db` files without confirmation
- ✅ ALWAYS run `npm run backup` before database operations

### Integration Prevention Pattern
**Components MUST be integrated, not just implemented.**

- ❌ NEVER create factory functions that create dependencies internally
- ❌ NEVER make integrations optional with fallbacks
- ✅ ALWAYS accept dependencies via constructor/config (dependency injection)
- ✅ ALWAYS write integration tests covering the full pipeline
- ✅ ALWAYS throw errors if required integrations are missing

**Checklist before marking complete:**
1. Is this component wired to its consumers?
2. Does the factory function accept all dependencies?
3. Is there an integration test covering the full pipeline?

---

## 🚨 SWARM EXECUTION RULES

### Spawn and Wait Pattern
1. **SPAWN IN BACKGROUND**: Use `run_in_background: true` for all agent Task calls
2. **SPAWN ALL AT ONCE**: Put ALL agent Task calls in ONE message
3. **TELL USER**: List what each agent is doing
4. **STOP AND WAIT**: Do NOT add more tool calls or poll status
5. **SYNTHESIZE**: When results arrive, review ALL before proceeding

**Example:**
```
I've launched 4 agents in background:
- 🔍 Researcher: [task]
- 💻 Coder: [task]
- 🧪 Tester: [task]
- 👀 Reviewer: [task]
Working in parallel - I'll synthesize when they complete.
```

### Task Complexity Detection

**AUTO-INVOKE SWARM when:**
- Multiple files (3+)
- New feature implementation
- Refactoring across modules
- Security-related changes

**SKIP SWARM for:**
- Single file edits
- Simple bug fixes (1-2 lines)
- Documentation updates
- Quick questions

---

## 🤖 3-TIER MODEL ROUTING (ADR-026)

| Tier | Handler | Use Cases |
|------|---------|-----------|
| **1** | Agent Booster (<1ms, $0) | Simple transforms: var→const, add-types, remove-console |
| **2** | Haiku (~500ms) | Simple tasks, bug fixes, low complexity |
| **3** | Sonnet/Opus (2-5s) | Architecture, security, complex reasoning |

**Before spawning agents:**
```bash
npx @claude-flow/cli@latest hooks pre-task --description "[task]"
```

**Use recommended model in Task tool:**
```javascript
Task({ prompt: "...", subagent_type: "coder", model: "haiku" })
```

---

## 🛡️ ANTI-DRIFT SWARM CONFIG

```bash
# Small teams (6-8 agents)
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized

# Large teams (10-15 agents)
npx @claude-flow/cli@latest swarm init --topology hierarchical-mesh --max-agents 15 --strategy specialized
```

**Valid Topologies:** `hierarchical`, `hierarchical-mesh`, `mesh`, `ring`, `star`, `hybrid`

---

## 📝 ESSENTIAL COMMANDS

### Memory Operations
```bash
# Store
npx @claude-flow/cli@latest memory store --key "pattern-auth" --value "JWT tokens" --namespace patterns

# Search (semantic vector search)
npx @claude-flow/cli@latest memory search --query "authentication" --namespace patterns

# List
npx @claude-flow/cli@latest memory list --namespace patterns

# Retrieve
npx @claude-flow/cli@latest memory retrieve --key "pattern-auth" --namespace patterns
```

### Hooks (Learning System)
```bash
# Before task
npx @claude-flow/cli@latest hooks pre-task --description "[task]"

# After task
npx @claude-flow/cli@latest hooks post-task --task-id "[id]" --success true

# Route to optimal agent
npx @claude-flow/cli@latest hooks route --task "[task]"

# Background workers
npx @claude-flow/cli@latest hooks worker dispatch --trigger audit
```

### Session Management
```bash
# Restore previous session
npx @claude-flow/cli@latest session restore --latest

# End session with metrics
npx @claude-flow/cli@latest hooks session-end --export-metrics true
```

### AQE Fleet (MCP Tools)
```javascript
// Initialize fleet
mcp__agentic-qe__fleet_init({ topology: "hierarchical", maxAgents: 15 })

// Spawn QE agent
mcp__agentic-qe__agent_spawn({ domain: "test-generation" })

// Orchestrate QE task
mcp__agentic-qe__task_orchestrate({ task: "comprehensive-testing", strategy: "adaptive" })

// Generate tests with AI
mcp__agentic-qe__test_generate_enhanced({ sourceCode: "...", testType: "unit" })

// Run tests in parallel
mcp__agentic-qe__test_execute_parallel({ testFiles: ["tests/**/*.test.ts"], parallel: true })

// Analyze coverage (O(log n) sublinear)
mcp__agentic-qe__coverage_analyze_sublinear({ target: "src/", detectGaps: true })

// Security scan
mcp__agentic-qe__security_scan_comprehensive({ target: "src/", sast: true })

// Store QE pattern
mcp__agentic-qe__memory_store({ key: "pattern", value: {...}, namespace: "qe-patterns" })
```

### AQE 12 DDD Domains

| Domain | Primary Agents | Focus |
|--------|---------------|-------|
| `test-generation` | qe-test-architect, qe-tdd-specialist | AI-powered test creation |
| `test-execution` | qe-parallel-executor, qe-flaky-hunter | Parallel execution, flaky detection |
| `coverage-analysis` | qe-coverage-specialist, qe-gap-detector | O(log n) sublinear coverage |
| `quality-assessment` | qe-quality-gate, qe-deployment-advisor | Quality gates, risk scoring |
| `defect-intelligence` | qe-defect-predictor, qe-root-cause-analyzer | ML-powered defect prediction |
| `learning-optimization` | qe-learning-coordinator, qe-pattern-learner | Cross-domain pattern learning |
| `security-compliance` | qe-security-scanner, qe-security-auditor | OWASP, CVE detection |
| `chaos-resilience` | qe-chaos-engineer, qe-performance-tester | Fault injection, load testing |

**Full 12 domains:** [docs/reference/aqe-fleet.md](docs/reference/aqe-fleet.md)

### AQE Task Routing

| Task Type | MCP Tool | Agents Spawned |
|-----------|----------|----------------|
| Generate tests | `test_generate_enhanced` | qe-test-architect |
| Run tests | `test_execute_parallel` | qe-parallel-executor |
| Analyze coverage | `coverage_analyze_sublinear` | qe-coverage-specialist |
| Quality gate | `quality_assess` | qe-quality-gate |
| Security scan | `security_scan_comprehensive` | qe-security-scanner |

---

## 🧠 AUTO-LEARNING PROTOCOL

### Before Starting Any Task

**Claude Flow (CLI):**
```bash
npx @claude-flow/cli@latest memory search --query "[task keywords]" --namespace patterns
npx @claude-flow/cli@latest hooks route --task "[task description]"
```

**AQE Fleet (MCP):**
```javascript
mcp__agentic-qe__memory_query({ pattern: "[task-type]-*", namespace: "qe-patterns" })
mcp__agentic-qe__defect_predict({ target: "src/[module]" })
```

### After Completing Successfully

**Claude Flow (CLI):**
```bash
npx @claude-flow/cli@latest memory store --key "[pattern]" --value "[what worked]" --namespace patterns
npx @claude-flow/cli@latest hooks post-task --task-id "[id]" --success true
```

**AQE Fleet (MCP):**
```javascript
mcp__agentic-qe__memory_store({
  key: "[task-type]-[module]-pattern",
  value: { approach: "what worked", successRate: 0.95 },
  namespace: "qe-patterns"
})
mcp__agentic-qe__memory_share({
  sourceAgentId: "current-agent",
  targetAgentIds: ["qe-learning-coordinator"],
  knowledgeDomain: "test-patterns"
})
```

**Full AQE auto-learning details:** [docs/reference/aqe-fleet.md#auto-learning-protocol](docs/reference/aqe-fleet.md#-auto-learning-protocol)

---

## 📋 AGENT ROUTING

| Task | Agents |
|------|--------|
| Bug Fix | coordinator, researcher, coder, tester |
| Feature | coordinator, architect, coder, tester, reviewer |
| Refactor | coordinator, architect, coder, reviewer |
| Performance | coordinator, perf-engineer, coder |
| Security | coordinator, security-architect, auditor |

---

## 🎯 EXECUTION MODEL

### Claude Code Handles:
- **Task tool**: Spawn and run agents concurrently
- File operations (Read, Write, Edit, Glob, Grep)
- Code generation and Bash commands
- TodoWrite and git operations

### CLI Tools Handle (via Bash):
- Swarm coordination and status
- Memory store/search/retrieve
- Hooks and learning system
- Session management

**KEY**: CLI coordinates, Claude Code Task tool executes.

---

## 📚 Reference Documentation

- **Claude Flow Details**: [docs/reference/claude-flow.md](docs/reference/claude-flow.md)
- **AQE Fleet Details**: [docs/reference/aqe-fleet.md](docs/reference/aqe-fleet.md)
- **Git Policy**: [docs/policies/git-operations.md](docs/policies/git-operations.md)
- **Test Policy**: [docs/policies/test-execution.md](docs/policies/test-execution.md)
- **Release Checklist**: [docs/policies/release-verification.md](docs/policies/release-verification.md)

---

## ⚡ GOLDEN RULES

1. **1 MESSAGE = ALL RELATED OPERATIONS** - Batch todos, tasks, file ops
2. **NEVER save to root folder** - Use /src, /tests, /docs, /scripts
3. **SPAWN IN BACKGROUND** - Use `run_in_background: true`
4. **NO POLLING** - Trust agents to return results
5. **VERIFY BEFORE CLAIMING** - Run tests, check results
