# Claude Flow V3 Reference

## CLI Commands (26 Commands, 140+ Subcommands)

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

### Advanced Commands

| Command | Subcommands | Description |
|---------|-------------|-------------|
| `daemon` | 5 | Background worker daemon |
| `neural` | 5 | Neural pattern training |
| `security` | 6 | Security scanning |
| `performance` | 5 | Performance profiling |
| `providers` | 5 | AI providers management |
| `plugins` | 5 | Plugin management |
| `deployment` | 5 | Deployment management |
| `embeddings` | 4 | Vector embeddings |
| `claims` | 4 | Claims-based authorization |
| `migrate` | 5 | V2 to V3 migration |
| `doctor` | 1 | System diagnostics |

---

## Hooks System (27 Hooks + 12 Workers)

### All Hooks

| Hook | Description |
|------|-------------|
| `pre-edit` | Get context before editing files |
| `post-edit` | Record editing outcome for learning |
| `pre-command` | Assess risk before commands |
| `post-command` | Record command execution outcome |
| `pre-task` | Record task start, get agent suggestions |
| `post-task` | Record task completion for learning |
| `session-start` | Start/restore session |
| `session-end` | End session and persist state |
| `session-restore` | Restore a previous session |
| `route` | Route task to optimal agent |
| `explain` | Explain routing decision |
| `pretrain` | Bootstrap intelligence from repo |
| `build-agents` | Generate optimized agent configs |
| `metrics` | View learning metrics dashboard |
| `transfer` | Transfer patterns via IPFS registry |
| `list` | List all registered hooks |
| `intelligence` | RuVector intelligence system |
| `worker` | Background worker management |
| `progress` | Check V3 implementation progress |
| `statusline` | Generate dynamic statusline |
| `coverage-route` | Route based on test coverage gaps |
| `coverage-suggest` | Suggest coverage improvements |
| `coverage-gaps` | List coverage gaps with priorities |

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

## Available Agents (60+ Types)

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### V3 Specialized
`security-architect`, `security-auditor`, `memory-specialist`, `performance-engineer`

### Swarm Coordination
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`, `collective-intelligence-coordinator`, `swarm-memory-manager`

### Consensus & Distributed
`byzantine-coordinator`, `raft-manager`, `gossip-coordinator`, `consensus-builder`, `crdt-synchronizer`, `quorum-manager`

### Performance & Optimization
`perf-analyzer`, `performance-benchmarker`, `task-orchestrator`, `memory-coordinator`, `smart-agent`

### GitHub & Repository
`github-modes`, `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`, `workflow-automation`, `repo-architect`, `multi-repo-swarm`

### SPARC Methodology
`sparc-coord`, `sparc-coder`, `specification`, `pseudocode`, `architecture`, `refinement`

### Specialized Development
`backend-dev`, `mobile-dev`, `ml-developer`, `cicd-engineer`, `api-docs`, `system-architect`, `code-analyzer`, `base-template-generator`

---

## Topologies

| Topology | Description |
|----------|-------------|
| `hierarchical` | Queen controls workers directly (anti-drift) |
| `hierarchical-mesh` | V3 queen + peer communication |
| `mesh` | Fully connected peer network |
| `ring` | Circular communication pattern |
| `star` | Central coordinator with spokes |
| `hybrid` | Dynamic topology switching |

---

## Consensus Strategies

| Strategy | Description |
|----------|-------------|
| `byzantine` | BFT (tolerates f < n/3 faulty) |
| `raft` | Leader-based (tolerates f < n/2) |
| `gossip` | Epidemic for eventual consistency |
| `crdt` | Conflict-free replicated data types |
| `quorum` | Configurable quorum-based |

---

## Intelligence System (RuVector)

- **SONA**: Self-Optimizing Neural Architecture (<0.05ms adaptation)
- **MoE**: Mixture of Experts for specialized routing
- **HNSW**: 150x-12,500x faster pattern search
- **EWC++**: Elastic Weight Consolidation (prevents forgetting)
- **Flash Attention**: 2.49x-7.47x speedup

**4-Step Pipeline:**
1. **RETRIEVE** - Fetch relevant patterns via HNSW
2. **JUDGE** - Evaluate with verdicts (success/failure)
3. **DISTILL** - Extract key learnings via LoRA
4. **CONSOLIDATE** - Prevent catastrophic forgetting via EWC++

---

## CLI Examples

```bash
# Initialize project
npx @claude-flow/cli@latest init --wizard

# Start daemon
npx @claude-flow/cli@latest daemon start

# Spawn agent
npx @claude-flow/cli@latest agent spawn -t coder --name my-coder

# Initialize swarm
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8

# Memory operations
npx @claude-flow/cli@latest memory store --key "key" --value "value" --namespace ns
npx @claude-flow/cli@latest memory search --query "search terms"
npx @claude-flow/cli@latest memory list --namespace patterns

# Hooks
npx @claude-flow/cli@latest hooks pre-task --description "task"
npx @claude-flow/cli@latest hooks route --task "task description"
npx @claude-flow/cli@latest hooks worker dispatch --trigger audit

# Session
npx @claude-flow/cli@latest session restore --latest
npx @claude-flow/cli@latest hooks session-end --export-metrics true

# Diagnostics
npx @claude-flow/cli@latest doctor --fix
npx @claude-flow/cli@latest performance benchmark --suite all
npx @claude-flow/cli@latest security scan --depth full
```

---

## Environment Variables

```bash
CLAUDE_FLOW_CONFIG=./claude-flow.config.json
CLAUDE_FLOW_LOG_LEVEL=info
CLAUDE_FLOW_MCP_PORT=3000
CLAUDE_FLOW_MCP_HOST=localhost
CLAUDE_FLOW_MCP_TRANSPORT=stdio
CLAUDE_FLOW_MEMORY_BACKEND=hybrid
CLAUDE_FLOW_MEMORY_PATH=./data/memory
```

---

## Quick Setup

```bash
# Add MCP server
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest

# Start daemon
npx @claude-flow/cli@latest daemon start

# Run diagnostics
npx @claude-flow/cli@latest doctor --fix
```

---

## Migration (V2 to V3)

```bash
npx @claude-flow/cli@latest migrate status
npx @claude-flow/cli@latest migrate run --backup
npx @claude-flow/cli@latest migrate rollback
npx @claude-flow/cli@latest migrate validate
```
