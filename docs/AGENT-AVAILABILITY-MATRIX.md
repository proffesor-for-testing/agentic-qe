# Agent Availability Matrix - Complete Fleet Status

**Validation Date**: 2025-10-20
**Total Agents**: 74 (17 QE + 57 Claude Flow)
**Success Rate**: 100%

---

## Executive Summary

All 74 agents are properly defined, validated, and accessible:
- ✅ **17 QE Fleet Agents** - Specialized quality engineering with native AQE hooks
- ✅ **57 Claude Flow Agents** - General development with external hooks
- ✅ **100% Validation Success** - All agents have proper YAML frontmatter
- ✅ **Zero Missing Agents** - Complete fleet coverage
- ✅ **Zero Configuration Issues** - All agents properly structured

---

## Agent Availability by System

### QE Fleet Agents (17) - Quality Engineering Specialists

| Agent Name | Category | Status | Access Method | Hook Type |
|------------|----------|--------|---------------|-----------|
| `qe-test-generator` | Core Testing | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-test-executor` | Core Testing | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-coverage-analyzer` | Core Testing | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-quality-gate` | Core Testing | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-quality-analyzer` | Core Testing | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-performance-tester` | Performance & Security | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-security-scanner` | Performance & Security | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-requirements-validator` | Strategic Planning | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-production-intelligence` | Strategic Planning | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-fleet-commander` | Strategic Planning | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-deployment-readiness` | Deployment | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-regression-risk-analyzer` | Advanced Testing | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-test-data-architect` | Advanced Testing | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-api-contract-validator` | Advanced Testing | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-flaky-test-hunter` | Advanced Testing | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-visual-tester` | Specialized | ✅ Ready | Task tool, MCP | AQE Native |
| `qe-chaos-engineer` | Specialized | ✅ Ready | Task tool, MCP | AQE Native |

**QE Fleet Statistics**:
- **Hook Performance**: <1ms (100-500x faster than external)
- **Memory Namespace**: `aqe/*`
- **Coordination Protocol**: Native AQE hooks
- **MCP Server**: `agentic-qe`

---

### Claude Flow Agents (57) - General Development

#### Core Development (5 agents)

| Agent Name | Status | Access Method | Hook Type | File Location |
|------------|--------|---------------|-----------|---------------|
| `coder` | ✅ Ready | Task tool | External | `core/coder.md` |
| `reviewer` | ✅ Ready | Task tool | External | `core/reviewer.md` |
| `tester` | ✅ Ready | Task tool | External | `core/tester.md` |
| `planner` | ✅ Ready | Task tool | External | `core/planner.md` |
| `researcher` | ✅ Ready | Task tool | External | `core/researcher.md` |

#### Swarm Coordination (5 agents)

| Agent Name | Status | Access Method | Hook Type | File Location |
|------------|--------|---------------|-----------|---------------|
| `hierarchical-coordinator` | ✅ Ready | Task tool, MCP | External | `swarm/hierarchical-coordinator.md` |
| `mesh-coordinator` | ✅ Ready | Task tool, MCP | External | `swarm/mesh-coordinator.md` |
| `adaptive-coordinator` | ✅ Ready | Task tool, MCP | External | `swarm/adaptive-coordinator.md` |
| `collective-intelligence-coordinator` | ✅ Ready | Task tool, MCP | External | `hive-mind/collective-intelligence-coordinator.md` |
| `swarm-memory-manager` | ✅ Ready | Task tool, MCP | External | `hive-mind/swarm-memory-manager.md` |

#### Consensus & Distributed Systems (7 agents)

| Agent Name | Status | Access Method | Hook Type | File Location |
|------------|--------|---------------|-----------|---------------|
| `byzantine-coordinator` | ✅ Ready | Task tool, MCP | External | `consensus/byzantine-coordinator.md` |
| `raft-manager` | ✅ Ready | Task tool, MCP | External | `consensus/raft-manager.md` |
| `gossip-coordinator` | ✅ Ready | Task tool, MCP | External | `consensus/gossip-coordinator.md` |
| `crdt-synchronizer` | ✅ Ready | Task tool, MCP | External | `consensus/crdt-synchronizer.md` |
| `quorum-manager` | ✅ Ready | Task tool, MCP | External | `consensus/quorum-manager.md` |
| `security-manager` | ✅ Ready | Task tool, MCP | External | `consensus/security-manager.md` |
| `performance-benchmarker` | ✅ Ready | Task tool, MCP | External | `consensus/performance-benchmarker.md` |

#### Performance & Optimization (5 agents)

| Agent Name | Status | Access Method | Hook Type | File Location |
|------------|--------|---------------|-----------|---------------|
| `performance-monitor` | ✅ Ready | Task tool, MCP | External | `optimization/performance-monitor.md` |
| `benchmark-suite` | ✅ Ready | Task tool, MCP | External | `optimization/benchmark-suite.md` |
| `resource-allocator` | ✅ Ready | Task tool, MCP | External | `optimization/resource-allocator.md` |
| `load-balancer` | ✅ Ready | Task tool, MCP | External | `optimization/load-balancer.md` |
| `topology-optimizer` | ✅ Ready | Task tool, MCP | External | `optimization/topology-optimizer.md` |

#### GitHub & Repository Management (9 agents)

| Agent Name | Status | Access Method | Hook Type | File Location |
|------------|--------|---------------|-----------|---------------|
| `github-modes` | ✅ Ready | Task tool, MCP | External | `github/github-modes.md` |
| `pr-manager` | ✅ Ready | Task tool, MCP | External | `github/pr-manager.md` |
| `code-review-swarm` | ✅ Ready | Task tool, MCP | External | `github/code-review-swarm.md` |
| `issue-tracker` | ✅ Ready | Task tool, MCP | External | `github/issue-tracker.md` |
| `release-manager` | ✅ Ready | Task tool, MCP | External | `github/release-manager.md` |
| `workflow-automation` | ✅ Ready | Task tool, MCP | External | `github/workflow-automation.md` |
| `project-board-sync` | ✅ Ready | Task tool, MCP | External | `github/project-board-sync.md` |
| `repo-architect` | ✅ Ready | Task tool, MCP | External | `github/repo-architect.md` |
| `multi-repo-swarm` | ✅ Ready | Task tool, MCP | External | `github/multi-repo-swarm.md` |

#### SPARC Methodology (4 agents)

| Agent Name | Status | Access Method | Hook Type | File Location |
|------------|--------|---------------|-----------|---------------|
| `specification` | ✅ Ready | Task tool, SPARC | External | `sparc/specification.md` |
| `pseudocode` | ✅ Ready | Task tool, SPARC | External | `sparc/pseudocode.md` |
| `architecture` | ✅ Ready | Task tool, SPARC | External | `sparc/architecture.md` |
| `refinement` | ✅ Ready | Task tool, SPARC | External | `sparc/refinement.md` |

#### Specialized Development (8 agents)

| Agent Name | Status | Access Method | Hook Type | File Location |
|------------|--------|---------------|-----------|---------------|
| `backend-dev` | ✅ Ready | Task tool | External | `development/backend/dev-backend-api.md` |
| `mobile-dev` | ✅ Ready | Task tool | External | `specialized/mobile/spec-mobile-react-native.md` |
| `ml-developer` | ✅ Ready | Task tool | External | `data/ml/data-ml-model.md` |
| `cicd-engineer` | ✅ Ready | Task tool | External | `devops/ci-cd/ops-cicd-github.md` |
| `api-docs` | ✅ Ready | Task tool | External | `documentation/api-docs/docs-api-openapi.md` |
| `system-architect` | ✅ Ready | Task tool | External | `architecture/system-design/arch-system-design.md` |
| `code-analyzer` | ✅ Ready | Task tool | External | `analysis/code-analyzer.md` |
| `base-template-generator` | ✅ Ready | Task tool | External | `base-template-generator.md` |

#### Testing & Validation (2 agents)

| Agent Name | Status | Access Method | Hook Type | File Location |
|------------|--------|---------------|-----------|---------------|
| `tdd-london-swarm` | ✅ Ready | Task tool | External | `testing/unit/tdd-london-swarm.md` |
| `production-validator` | ✅ Ready | Task tool | External | `testing/validation/production-validator.md` |

#### Hive Mind Intelligence (3 agents)

| Agent Name | Status | Access Method | Hook Type | File Location |
|------------|--------|---------------|-----------|---------------|
| `queen-coordinator` | ✅ Ready | Task tool, MCP | External | `hive-mind/queen-coordinator.md` |
| `scout-explorer` | ✅ Ready | Task tool, MCP | External | `hive-mind/scout-explorer.md` |
| `worker-specialist` | ✅ Ready | Task tool, MCP | External | `hive-mind/worker-specialist.md` |

#### Flow Nexus Platform (9 agents)

| Agent Name | Status | Access Method | Hook Type | File Location |
|------------|--------|---------------|-----------|---------------|
| `flow-nexus-swarm` | ✅ Ready | Task tool, MCP | External | `flow-nexus/swarm.md` |
| `flow-nexus-authentication` | ✅ Ready | Task tool, MCP | External | `flow-nexus/authentication.md` |
| `flow-nexus-sandbox` | ✅ Ready | Task tool, MCP | External | `flow-nexus/sandbox.md` |
| `flow-nexus-neural-network` | ✅ Ready | Task tool, MCP | External | `flow-nexus/neural-network.md` |
| `flow-nexus-workflow` | ✅ Ready | Task tool, MCP | External | `flow-nexus/workflow.md` |
| `flow-nexus-app-store` | ✅ Ready | Task tool, MCP | External | `flow-nexus/app-store.md` |
| `flow-nexus-challenges` | ✅ Ready | Task tool, MCP | External | `flow-nexus/challenges.md` |
| `flow-nexus-payments` | ✅ Ready | Task tool, MCP | External | `flow-nexus/payments.md` |
| `flow-nexus-user-tools` | ✅ Ready | Task tool, MCP | External | `flow-nexus/user-tools.md` |

**Claude Flow Statistics**:
- **Hook Performance**: 100-500ms (external coordination)
- **Memory Namespace**: `swarm/*`
- **Coordination Protocol**: External hooks via CLI
- **MCP Server**: `claude-flow`

---

## Access Methods Comparison

| Method | QE Fleet | Claude Flow | Use Case |
|--------|----------|-------------|----------|
| **Task Tool** | ✅ Primary | ✅ Primary | Direct agent spawning in Claude Code |
| **MCP Tools** | ✅ Available | ✅ Available | Programmatic coordination |
| **CLI Commands** | ✅ `aqe` CLI | ✅ `claude-flow` CLI | Terminal operations |
| **SPARC Commands** | ❌ N/A | ✅ SPARC workflow | Methodology execution |

---

## Hook Performance Comparison

| Feature | AQE Hooks (QE Fleet) | External Hooks (Claude Flow) |
|---------|---------------------|------------------------------|
| **Speed** | <1ms | 100-500ms |
| **Dependencies** | Zero (native) | External package |
| **Type Safety** | Full TypeScript | Shell strings |
| **Integration** | Direct API | Shell commands |
| **Performance** | 100-500x faster | Baseline |
| **Best For** | QE agents | General agents |

---

## Agent Selection Guide

### Use QE Fleet When:
- ✅ Quality engineering tasks (testing, coverage, security)
- ✅ Need maximum performance (<1ms coordination)
- ✅ Working with test frameworks (Jest, Mocha, Cypress, Playwright)
- ✅ Analyzing code quality or technical debt
- ✅ Running security scans (SAST/DAST)
- ✅ Performance testing (load, stress, chaos)
- ✅ Production intelligence and readiness

### Use Claude Flow When:
- ✅ General development tasks (coding, reviewing, planning)
- ✅ SPARC methodology workflows
- ✅ GitHub operations (PRs, issues, releases)
- ✅ Swarm coordination patterns (mesh, hierarchical, adaptive)
- ✅ Distributed systems (consensus, CRDT, Raft)
- ✅ Neural network training and deployment
- ✅ Flow Nexus platform features

---

## Memory Namespace Organization

### QE Fleet (`aqe/*`)
```
aqe/
├── test-plan/*          # Test planning and requirements
├── coverage/*           # Coverage analysis and gaps
├── quality/*            # Quality metrics and gates
├── performance/*        # Performance test results
├── security/*           # Security scan findings
└── swarm/coordination   # Cross-agent coordination
```

### Claude Flow (`swarm/*`)
```
swarm/
├── [agent]/[step]       # Agent-specific state
├── coordination         # Cross-agent coordination
└── session              # Session state
```

---

## Concurrent Execution Examples

### Full-Stack Development Pipeline

```javascript
// Single message - spawn all agents concurrently
Task("Requirements", "Analyze requirements", "researcher")
Task("Architecture", "Design system", "system-architect")
Task("Backend", "Build API", "backend-dev")
Task("Tests", "Generate test suite", "qe-test-generator")
Task("Execute", "Run tests", "qe-test-executor")
Task("Coverage", "Analyze gaps", "qe-coverage-analyzer")
Task("Security", "Security scan", "qe-security-scanner")
Task("Quality", "Quality gate", "qe-quality-gate")
```

### Swarm + Testing Pipeline

```javascript
// Combine swarm coordination with QE agents
Task("Mesh Setup", "Initialize mesh topology", "mesh-coordinator")
Task("Worker Spawn", "Create worker agents", "worker-specialist")
Task("Generate Tests", "AI-powered test generation", "qe-test-generator")
Task("Flaky Detection", "Detect flaky tests", "qe-flaky-test-hunter")
Task("Performance", "Load testing", "qe-performance-tester")
```

---

## Configuration Files

| System | Config Location | Purpose |
|--------|----------------|---------|
| QE Fleet | `.agentic-qe/config/fleet.json` | Fleet topology and settings |
| QE Fleet | `.agentic-qe/config/aqe-hooks.json` | Native hook configuration |
| QE Fleet | `.agentic-qe/config/routing.json` | Multi-model router (optional) |
| Claude Flow | `.claude/agents/` | Agent definitions |
| Claude Flow | `CLAUDE.md` | Overall configuration |

---

## Validation Commands

```bash
# Validate all agents
node scripts/validate-all-agents.js

# Check MCP connections
claude mcp list

# View QE agent definitions
ls -la .claude/agents/qe-*.md

# View Claude Flow agent definitions
ls -la .claude/agents/*/

# Check fleet status
aqe status --verbose
npx claude-flow status

# View logs
tail -f .agentic-qe/logs/fleet.log
```

---

## Agent Discovery

### List QE Agents
```bash
# Via CLI
aqe agent list

# Via files
ls .claude/agents/qe-*.md
```

### List Claude Flow Agents
```bash
# Via command
npx claude-flow agents list

# Via files
find .claude/agents -name "*.md" -not -name "qe-*"
```

---

## Issue Tracking

- **QE Fleet Issues**: Report at project repository
- **Claude Flow Issues**: https://github.com/ruvnet/claude-flow/issues
- **MCP Issues**: Check respective MCP server repositories

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| **Total Agents** | 74 |
| **QE Fleet Agents** | 17 (23%) |
| **Claude Flow Agents** | 57 (77%) |
| **Validation Success Rate** | 100% |
| **Agents with YAML Frontmatter** | 74 (100%) |
| **Missing Agents** | 0 |
| **Invalid Agents** | 0 |
| **Agent Categories** | 12 |
| **Access Methods** | 4 (Task, MCP, CLI, SPARC) |

---

**Validation Script**: `/workspaces/agentic-qe-cf/scripts/validate-all-agents.js`
**Last Validated**: 2025-10-20
**Status**: ✅ All Systems Operational
