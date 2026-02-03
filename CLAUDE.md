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

### Release Management
- ❌ NEVER create a new release/version for CI/test fixes
- ❌ NEVER bump version when npm publish workflow fails due to test assertions
- ✅ When publish fails: fix the issue, update the EXISTING release (delete old tag, recreate)
- ✅ Version bumps are ONLY for actual code/feature changes, not CI infrastructure fixes

**When npm publish workflow fails:**
1. Fix the failing tests/CI issues
2. Delete the existing tag: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
3. Delete the release: `gh release delete vX.Y.Z --yes`
4. Push fixes to main
5. Recreate the SAME version release: `gh release create vX.Y.Z ...`

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

## 🎯 V3 QE SKILLS (PROPERLY INTEGRATED)

V3 QE capabilities are integrated via the **Skill system**. Skills are invoked using the `Skill` tool or `/skill-name` syntax.

### Available QE Skills

| Skill | Invocation | Description |
|-------|------------|-------------|
| `a11y-ally` | `/a11y-ally URL` | Accessibility audit with **MANDATORY video pipeline** |
| `accessibility-testing` | `/accessibility-testing` | WCAG 2.2 compliance testing |
| `security-testing` | `/security-testing` | OWASP vulnerability scanning |

### Accessibility Audit with Video Captions

```bash
# Invoke skill directly - Skill tool auto-loads the full pipeline
/a11y-ally https://example.com/page-with-video
```

The `a11y-ally` skill automatically:
1. Fetches page content
2. Detects video elements
3. Downloads videos
4. Extracts frames with ffmpeg
5. Analyzes frames with Claude Vision
6. Generates WebVTT captions (`captions.vtt`)
7. Generates audio descriptions (`audiodesc.vtt`)
8. Saves to `docs/accessibility/captions/{page-slug}/`

### Skill vs Task Tool

| Use Case | Tool | Why |
|----------|------|-----|
| Accessibility audit | `Skill("a11y-ally")` | Full video pipeline integrated |
| Simple agent spawn | `Task(subagent_type: "coder")` | Built-in agents work fine |
| Custom behavior | `Skill` with custom SKILL.md | Skill system loads full spec |

### Skill Files Location

Skills are defined in `.claude/skills/{skill-name}/SKILL.md` and registered in `.claude/skills/skills-manifest.json`.

---

## 🎯 QCSD AUTO-INVOCATION RULES (MANDATORY)

**All QCSD Swarms (Ideation, Refinement, Development) MUST be invoked via the Skill tool. Manual agent spawning is FORBIDDEN.**

### Trigger Patterns - IMMEDIATELY invoke `/qcsd-ideation-swarm`

When user requests ANY of these, use `Skill({ skill: "qcsd-ideation-swarm" })`:
- "QCSD analysis" / "QCSD Ideation"
- "Quality Criteria analysis" / "HTSM analysis"
- "evaluate with QCSD" / "run QCSD"
- "analyze [URL] for quality"
- "shift-left quality assessment" / "shift-left quality"
- "quality criteria session"
- "risk storming"

### What You MUST NOT Do

- ❌ **NEVER** manually spawn qe-quality-criteria-recommender, qe-risk-assessor, qe-security-scanner, qe-accessibility-auditor, qe-qx-partner for QCSD without using the skill
- ❌ **NEVER** skip flag detection (HAS_UI, HAS_SECURITY, HAS_UX)
- ❌ **NEVER** spawn fewer agents than flags indicate
- ❌ **NEVER** skip conditional agents when their flags are TRUE
- ❌ **NEVER** skip related skills (testability-scoring, risk-based-testing, etc.)

### Correct Invocation Pattern

```javascript
// For epic/story analysis
Skill({ skill: "qcsd-ideation-swarm", args: "<epic content>" })

// For URL analysis
Skill({ skill: "qcsd-ideation-swarm", args: "<URL> <output-folder>" })
```

### Post-Invocation Verification

After QCSD skill completes, verify:
```
✓ Flag detection was performed (HAS_UI, HAS_SECURITY, HAS_UX output visible)
✓ All core agents were spawned (3 minimum)
✓ Conditional agents spawned per flags (up to 3 more)
✓ Each agent wrote its report directly to output folder
✓ Related skills were invoked (testability-scoring, risk-based-testing)
✓ Executive summary synthesized from all reports
```

**If any verification fails, the QCSD Ideation analysis is INCOMPLETE.**

### Trigger Patterns - IMMEDIATELY invoke `/qcsd-refinement-swarm`

When user requests ANY of these, use `Skill({ skill: "qcsd-refinement-swarm" })`:
- "QCSD refinement" / "refinement swarm"
- "SFDIPOT analysis" / "product factors analysis"
- "sprint refinement" / "story refinement"
- "BDD generation" / "generate scenarios"
- "refine story" / "refine epic"

### What You MUST NOT Do (Refinement)

- ❌ **NEVER** manually spawn qe-product-factors-assessor, qe-bdd-generator, qe-requirements-validator, qe-contract-validator, qe-impact-analyzer, qe-dependency-mapper for QCSD refinement without using the skill
- ❌ **NEVER** skip flag detection (HAS_API, HAS_REFACTORING, HAS_DEPENDENCIES, HAS_SECURITY)
- ❌ **NEVER** skip the qe-test-idea-rewriter transformation step
- ❌ **NEVER** skip cross-phase signal consumption (Loop 2 + Loop 4)

### Correct Refinement Invocation

```javascript
// For story/epic refinement
Skill({ skill: "qcsd-refinement-swarm", args: "<story content>" })
```

### Post-Refinement Verification

After QCSD Refinement skill completes, verify:
```
✓ Flag detection was performed (HAS_API, HAS_REFACTORING, HAS_DEPENDENCIES, HAS_SECURITY)
✓ All core agents were spawned (3 minimum: product-factors, bdd-generator, requirements-validator)
✓ Conditional agents spawned per flags (up to 3 more)
✓ Test ideas were rewritten by qe-test-idea-rewriter
✓ Cross-phase signals consumed (Loop 2 + Loop 4)
✓ READY/CONDITIONAL/NOT-READY decision rendered
✓ Executive summary synthesized from all reports
```

**If any verification fails, the QCSD Refinement analysis is INCOMPLETE.**

### Trigger Patterns - IMMEDIATELY invoke `/qcsd-development-swarm`

When user requests ANY of these, use `Skill({ skill: "qcsd-development-swarm" })`:
- "QCSD development" / "development swarm"
- "code quality analysis" / "TDD analysis"
- "coverage analysis" / "complexity analysis"
- "development quality gate" / "development quality"
- "in-sprint quality check" / "sprint code check"
- "analyze code for quality" / "analyze code quality"
- "mutation testing" / "defect prediction"
- "code review swarm"
- "is code ready to ship"

### What You MUST NOT Do (Development)

- ❌ **NEVER** manually spawn qe-tdd-specialist, qe-code-complexity, qe-coverage-specialist, qe-security-scanner, qe-performance-tester, qe-mutation-tester, qe-defect-predictor for QCSD development without using the skill
- ❌ **NEVER** skip flag detection (HAS_SECURITY_CODE, HAS_PERFORMANCE_CODE, HAS_CRITICAL_CODE)
- ❌ **NEVER** skip the qe-defect-predictor analysis step
- ❌ **NEVER** skip cross-phase signal consumption (Loop 3 from Refinement)

### Correct Development Invocation

```javascript
// For source code quality analysis
Skill({ skill: "qcsd-development-swarm", args: "<source-path> <test-path>" })

// For specific module analysis
Skill({ skill: "qcsd-development-swarm", args: "src/auth/ tests/auth/" })
```

### Post-Development Verification

After QCSD Development skill completes, verify:
```
✓ Flag detection was performed (HAS_SECURITY_CODE, HAS_PERFORMANCE_CODE, HAS_CRITICAL_CODE)
✓ All core agents were spawned (3 minimum: tdd-specialist, code-complexity, coverage-specialist)
✓ Conditional agents spawned per flags (up to 3 more)
✓ Defect prediction analysis completed by qe-defect-predictor
✓ Cross-phase signals consumed from Refinement (BDD scenarios, SFDIPOT priorities)
✓ SHIP/CONDITIONAL/HOLD decision rendered
✓ Executive summary synthesized from all reports
```

**If any verification fails, the QCSD Development analysis is INCOMPLETE.**

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

- **⚠️ PUBLISH STRUCTURE**: [docs/PUBLISH-STRUCTURE.md](docs/PUBLISH-STRUCTURE.md) - **IMPORTANT: Read before publishing!**
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


## Agentic QE v3

This project uses **Agentic QE v3** - a Domain-Driven Quality Engineering platform with 12 bounded contexts, ReasoningBank learning, and HNSW vector search.

---

### Quick Reference

```bash
# Run tests
npm test -- --run

# Check quality
aqe quality assess

# Generate tests
aqe test generate <file>

# Coverage analysis
aqe coverage <path>
```

### MCP Server Tools

| Tool | Description |
|------|-------------|
| `fleet_init` | Initialize QE fleet with topology |
| `agent_spawn` | Spawn specialized QE agent |
| `test_generate_enhanced` | AI-powered test generation |
| `test_execute_parallel` | Parallel test execution with retry |
| `task_orchestrate` | Orchestrate multi-agent QE tasks |
| `coverage_analyze_sublinear` | O(log n) coverage analysis |
| `quality_assess` | Quality gate evaluation |
| `memory_store` / `memory_query` | Pattern storage with namespacing |

### Configuration

- **Enabled Domains**: test-generation, test-execution, coverage-analysis, learning-optimization, quality-assessment, security-compliance (+4 more)
- **Learning**: Enabled (transformer embeddings)
- **Max Concurrent Agents**: 15
- **Background Workers**: pattern-consolidator, routing-accuracy-monitor, coverage-gap-scanner, flaky-test-detector

### V3 QE Agents

V3 QE agents are in `.claude/agents/v3/`. Use with Task tool:

```javascript
Task({ prompt: "Generate tests", subagent_type: "qe-test-architect", run_in_background: true })
Task({ prompt: "Find coverage gaps", subagent_type: "qe-coverage-specialist", run_in_background: true })
Task({ prompt: "Security audit", subagent_type: "qe-security-scanner", run_in_background: true })
```

### Data Storage

- **Memory Backend**: `.agentic-qe/memory.db` (SQLite)
- **Configuration**: `.agentic-qe/config.yaml`

---
*Generated by AQE v3 init - 2026-01-25T14:23:40.907Z*
