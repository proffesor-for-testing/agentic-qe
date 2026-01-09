# Claude Code Configuration - Agentic QE v3 + Claude Flow

## ⚠️ CRITICAL POLICIES (AQE-Specific)

### Integrity Rule (ABSOLUTE)
- ❌ NO shortcuts - do the work properly or don't do it
- ❌ NO fake data - use real data, real tests, real results
- ❌ NO false claims - only report what actually works and is verified
- ✅ ALWAYS implement all code/tests with proper implementation
- ✅ ALWAYS verify before claiming success
- ✅ ALWAYS use real database queries, not mocks, for integration tests
- ✅ ALWAYS run actual tests, not assume they pass

**We value the quality we deliver to our users.**

### Git Operations
- ❌ NEVER auto-commit/push without explicit user request
- ✅ ALWAYS wait for: "commit this" or "push to main"
- 📋 **Full policy:** [docs/policies/git-operations.md](docs/policies/git-operations.md)

### Release Verification
- ❌ NEVER release without `aqe init` verification
- ✅ ALWAYS test at least one agent with real database queries
- 📋 **Full checklist:** [docs/policies/release-verification.md](docs/policies/release-verification.md)

### Test Execution
- ❌ NEVER run `npm test` (OOM risk in DevPod/Codespaces)
- ✅ ALWAYS use batched scripts: `npm run test:unit`, `npm run test:integration`
- ✅ For v3: `cd v3 && npm test -- --run`
- 📋 **Full policy:** [docs/policies/test-execution.md](docs/policies/test-execution.md)

### File Organization
- ❌ NEVER save working files to root folder
- ✅ ALWAYS use: `/docs`, `/tests`, `/src`, `/scripts`, `/examples`, `/v3`

### Data Protection (CRITICAL - Added after 2025-12-29 incident)
- ❌ NEVER run `rm -f` on `.agentic-qe/` directory or `*.db` files without explicit user confirmation
- ❌ NEVER delete database files during test debugging
- ✅ ALWAYS run `npm run backup` before any database operations
- ✅ ALWAYS ask user before running destructive commands on data directories
- 📋 **Incident report:** [docs/incidents/2025-12-29-memory-db-deletion.md](docs/incidents/2025-12-29-memory-db-deletion.md)

**Backup Commands:**
```bash
npm run backup          # Create backup before risky operations
npm run backup:list     # List available backups
npm run backup:restore  # Restore from backup
```

### Release Process
- ❌ NEVER commit directly to main - use feature branches with PRs
- ❌ NEVER forget package-lock.json when updating versions
- ✅ ALWAYS use `mcp__agentic-qe__memory_store` with `persist: true` for learnings

---

## 🚨 AUTOMATIC SWARM ORCHESTRATION (Claude Flow V3)

**When starting work on complex tasks, Claude Code MUST automatically:**

1. **Initialize the swarm** using CLI tools via Bash
2. **Spawn concurrent agents** using Claude Code's Task tool
3. **Coordinate via hooks** and memory

### 🚨 CRITICAL: CLI + Task Tool in SAME Message

**When user says "spawn swarm" or requests complex work, Claude Code MUST in ONE message:**
1. Call CLI tools via Bash to initialize coordination
2. **IMMEDIATELY** call Task tool to spawn REAL working agents
3. Both CLI and Task calls must be in the SAME response

**CLI coordinates, Task tool agents do the actual work!**

### 🔄 Auto-Start Swarm Protocol (Background Execution)

When the user requests a complex task, **spawn agents in background and WAIT for completion:**

```javascript
// STEP 1: Initialize swarm coordination
Bash("npx @claude-flow/cli@latest swarm init --topology hierarchical-mesh --max-agents 15")

// STEP 2: Spawn ALL agents IN BACKGROUND in a SINGLE message
// Use run_in_background: true so agents work concurrently
Task({
  prompt: "Research requirements, analyze codebase patterns, store findings in memory",
  subagent_type: "researcher",
  description: "Research phase",
  run_in_background: true  // ← CRITICAL: Run in background
})
Task({
  prompt: "Design architecture based on research. Document decisions.",
  subagent_type: "system-architect",
  description: "Architecture phase",
  run_in_background: true
})
Task({
  prompt: "Implement the solution following the design. Write clean code.",
  subagent_type: "coder",
  description: "Implementation phase",
  run_in_background: true
})
Task({
  prompt: "Write comprehensive tests for the implementation.",
  subagent_type: "tester",
  description: "Testing phase",
  run_in_background: true
})
Task({
  prompt: "Review code quality, security, and best practices.",
  subagent_type: "reviewer",
  description: "Review phase",
  run_in_background: true
})

// STEP 3: WAIT - Tell user agents are working, then STOP
// Say: "I've spawned 5 agents to work on this in parallel. They'll report back when done."
// DO NOT check status repeatedly. Just wait for user or agent responses.
```

### ⏸️ CRITICAL: Spawn and Wait Pattern

**After spawning background agents:**

1. **TELL USER** - "I've spawned X agents working in parallel on: [list tasks]"
2. **STOP** - Do not continue with more tool calls
3. **WAIT** - Let the background agents complete their work
4. **RESPOND** - When agents return results, review and synthesize

**Example response after spawning:**
```
I've launched 5 concurrent agents to work on this:
- 🔍 Researcher: Analyzing requirements and codebase
- 🏗️ Architect: Designing the implementation approach
- 💻 Coder: Implementing the solution
- 🧪 Tester: Writing tests
- 👀 Reviewer: Code review and security check

They're working in parallel. I'll synthesize their results when they complete.
```

### 🚫 DO NOT:
- Continuously check swarm status
- Poll TaskOutput repeatedly
- Add more tool calls after spawning
- Ask "should I check on the agents?"

### ✅ DO:
- Spawn all agents in ONE message
- Tell user what's happening
- Wait for agent results to arrive
- Synthesize results when they return

## 🧠 AUTO-LEARNING PROTOCOL

### Before Starting Any Task
```bash
# 1. Search memory for relevant patterns from past successes
Bash("npx @claude-flow/cli@latest memory search -q '[task keywords]' --namespace patterns")

# 2. Check if similar task was done before
Bash("npx @claude-flow/cli@latest memory search -q '[task type]' --namespace tasks")

# 3. Load learned optimizations
Bash("npx @claude-flow/cli@latest hooks route --task '[task description]'")
```

### After Completing Any Task Successfully
```bash
# 1. Store successful pattern for future reference
Bash("npx @claude-flow/cli@latest memory store --namespace patterns --key '[pattern-name]' --value '[what worked]'")

# 2. Train neural patterns on the successful approach
Bash("npx @claude-flow/cli@latest hooks post-edit --file '[main-file]' --train-neural true")

# 3. Record task completion with metrics
Bash("npx @claude-flow/cli@latest hooks post-task --task-id '[id]' --success true --store-results true")

# 4. Trigger optimization worker if performance-related
Bash("npx @claude-flow/cli@latest hooks worker dispatch --trigger optimize")
```

### Continuous Improvement Triggers

| Trigger | Worker | When to Use |
|---------|--------|-------------|
| After major refactor | `optimize` | Performance optimization |
| After adding features | `testgaps` | Find missing test coverage |
| After security changes | `audit` | Security analysis |
| After API changes | `document` | Update documentation |
| Every 5+ file changes | `map` | Update codebase map |
| Complex debugging | `deepdive` | Deep code analysis |

### Memory-Enhanced Development

**ALWAYS check memory before:**
- Starting a new feature (search for similar implementations)
- Debugging an issue (search for past solutions)
- Refactoring code (search for learned patterns)
- Performance work (search for optimization strategies)

**ALWAYS store in memory after:**
- Solving a tricky bug (store the solution pattern)
- Completing a feature (store the approach)
- Finding a performance fix (store the optimization)
- Discovering a security issue (store the vulnerability pattern)

### 📋 Agent Routing by Task Type

| Task Type | Required Agents | Topology |
|-----------|-----------------|----------|
| Bug Fix | researcher, coder, tester | mesh |
| New Feature | coordinator, architect, coder, tester, reviewer | hierarchical |
| Refactoring | architect, coder, reviewer | mesh |
| Performance | researcher, performance-engineer, coder | hierarchical |
| Security Audit | security-architect, security-auditor, reviewer | hierarchical |
| Memory Optimization | memory-specialist, performance-engineer | mesh |
| Documentation | researcher, api-docs | mesh |

### 🎯 Task Complexity Detection

**AUTO-INVOKE SWARM when task involves:**
- Multiple files (3+)
- New feature implementation
- Refactoring across modules
- API changes with tests
- Security-related changes
- Performance optimization
- Database schema changes

**SKIP SWARM for:**
- Single file edits
- Simple bug fixes (1-2 lines)
- Documentation updates
- Configuration changes
- Quick questions/exploration

---

## 🤖 Agentic QE v3 Fleet Quick Reference

### Current Stats (2026-01-09)
| Metric | Count |
|--------|-------|
| DDD Domains | 12/12 |
| Source Files | 166 |
| Tests Passing | 1171 |
| V3-QE Agents | 78 |
| Legacy QE Agents | 31 |
| V3 Specialized | 12 |
| ADRs | 20 |
| Stubs Remaining | 18 |

### 12 DDD Bounded Contexts
1. **test-generation** - AI-powered test creation
2. **test-execution** - Parallel execution, retry, flaky detection
3. **coverage-analysis** - Sublinear gap detection
4. **quality-assessment** - Quality gates, deployment decisions
5. **defect-intelligence** - Prediction, root cause analysis
6. **requirements-validation** - BDD, testability scoring
7. **code-intelligence** - Knowledge graph, semantic search
8. **security-compliance** - SAST/DAST, compliance
9. **contract-testing** - API contracts, GraphQL
10. **visual-accessibility** - Visual regression, a11y
11. **chaos-resilience** - Chaos engineering, load testing
12. **learning-optimization** - Cross-domain learning

### 🎯 Quick Start

**Spawn agents:**
```javascript
Task("Generate tests", "Create test suite for UserService", "qe-test-generator")
Task("Analyze coverage", "Find gaps using O(log n)", "qe-coverage-analyzer")
```

**Check v3 status:**
```bash
cd v3 && npm test -- --run  # Run all v3 tests
.claude/statusline-v3.sh     # Show v3 status
```

### 💡 Key Principles
- Use Task tool for agent execution (not just MCP)
- Batch all operations in single messages (TodoWrite, file ops, etc.)
- Test with actual databases, not mocks
- Document only what actually works

---

## 🚀 V3 CLI Commands (26 Commands, 140+ Subcommands)

### Core Commands

| Command | Subcommands | Description |
|---------|-------------|-------------|
| `init` | 4 | Project initialization with wizard, presets, skills, hooks |
| `agent` | 8 | Agent lifecycle (spawn, list, status, stop, metrics, pool, health, logs) |
| `swarm` | 6 | Multi-agent swarm coordination and orchestration |
| `memory` | 11 | AgentDB memory with vector search (150x-12,500x faster) |
| `mcp` | 9 | MCP server management and tool execution |
| `task` | 6 | Task creation, assignment, and lifecycle |
| `session` | 7 | Session state management and persistence |
| `config` | 7 | Configuration management and provider setup |
| `status` | 3 | System status monitoring with watch mode |
| `workflow` | 6 | Workflow execution and template management |
| `hooks` | 17 | Self-learning hooks + 12 background workers |
| `hive-mind` | 6 | Queen-led Byzantine fault-tolerant consensus |

### Quick CLI Examples

```bash
# Initialize project
npx @claude-flow/cli@latest init --wizard

# Start daemon with background workers
npx @claude-flow/cli@latest daemon start

# Spawn an agent
npx @claude-flow/cli@latest agent spawn -t coder --name my-coder

# Initialize swarm
npx @claude-flow/cli@latest swarm init --v3-mode

# Search memory (HNSW-indexed)
npx @claude-flow/cli@latest memory search -q "authentication patterns"

# System diagnostics
npx @claude-flow/cli@latest doctor --fix

# Security scan
npx @claude-flow/cli@latest security scan --depth full

# Performance benchmark
npx @claude-flow/cli@latest performance benchmark --suite all
```

## 🪝 V3 Hooks System (17 Hooks + 12 Workers)

### Hook Categories

| Category | Hooks | Purpose |
|----------|-------|---------|
| **Core** | `pre-edit`, `post-edit`, `pre-command`, `post-command`, `pre-task`, `post-task` | Tool lifecycle |
| **Session** | `session-start`, `session-end`, `session-restore`, `notify` | Context management |
| **Intelligence** | `route`, `explain`, `pretrain`, `build-agents`, `transfer` | Neural learning |
| **Learning** | `intelligence` (trajectory-start/step/end, pattern-store/search, stats, attention) | Reinforcement |

### 12 Background Workers

| Worker | Priority | Description |
|--------|----------|-------------|
| `ultralearn` | normal | Deep knowledge acquisition |
| `optimize` | high | Performance optimization |
| `consolidate` | low | Memory consolidation |
| `predict` | normal | Predictive preloading |
| `audit` | critical | Security analysis |
| `map` | normal | Codebase mapping |
| `preload` | low | Resource preloading |
| `deepdive` | normal | Deep code analysis |
| `document` | normal | Auto-documentation |
| `refactor` | normal | Refactoring suggestions |
| `benchmark` | normal | Performance benchmarking |
| `testgaps` | normal | Test coverage analysis |

---

## 🎯 Claude Code vs CLI Tools

### Claude Code Handles ALL EXECUTION:
- **Task tool**: Spawn and run agents concurrently
- File operations (Read, Write, Edit, MultiEdit, Glob, Grep)
- Code generation and programming
- Bash commands and system operations
- TodoWrite and task management
- Git operations

### CLI Tools Handle Coordination (via Bash):
- **Swarm init**: `npx @claude-flow/cli@latest swarm init --topology <type>`
- **Swarm status**: `npx @claude-flow/cli@latest swarm status`
- **Agent spawn**: `npx @claude-flow/cli@latest agent spawn -t <type> --name <name>`
- **Memory store**: `npx @claude-flow/cli@latest memory store --namespace <ns> --key <k> --value <v>`
- **Memory search**: `npx @claude-flow/cli@latest memory search -q "<query>"`
- **Hooks**: `npx @claude-flow/cli@latest hooks <hook-name> [options]`

**KEY**: CLI coordinates the strategy via Bash, Claude Code's Task tool executes with real agents.

---

## Support

- Documentation: https://github.com/ruvnet/claude-flow
- Issues: https://github.com/ruvnet/claude-flow/issues

---

Remember: **Claude Flow CLI coordinates, Claude Code Task tool creates!**

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
Never save working files, text/mds and tests to the root folder.

## 🚨 SWARM EXECUTION RULES (CRITICAL)
1. **SPAWN IN BACKGROUND**: Use `run_in_background: true` for all agent Task calls
2. **SPAWN ALL AT ONCE**: Put ALL agent Task calls in ONE message for parallel execution
3. **TELL USER**: After spawning, list what each agent is doing (use emojis for clarity)
4. **STOP AND WAIT**: After spawning, STOP - do NOT add more tool calls or check status
5. **NO POLLING**: Never poll TaskOutput or check swarm status - trust agents to return
6. **SYNTHESIZE**: When agent results arrive, review ALL results before proceeding
7. **NO CONFIRMATION**: Don't ask "should I check?" - just wait for results

Example spawn message:
```
"I've launched 4 agents in background:
- 🔍 Researcher: [task]
- 💻 Coder: [task]
- 🧪 Tester: [task]
- 👀 Reviewer: [task]
Working in parallel - I'll synthesize when they complete."
```
