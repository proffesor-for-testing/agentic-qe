# Agent System Availability Matrix

**Visual Guide**: Which agents come from which system

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 QE | AQE Fleet Agent (Native hooks, <1ms) |
| 🔵 CF | Claude Flow Agent (External hooks, 100-500ms) |
| 📦 | Available via MCP tools |
| 🚀 | Available via Task tool |
| 💻 | Available via CLI |

---

## Complete Agent System Matrix

| Agent Name | System | Task Tool | MCP | CLI | Hook Type | Category |
|------------|--------|-----------|-----|-----|-----------|----------|
| **QUALITY ENGINEERING** |
| qe-test-generator | 🟢 QE | 🚀 | 📦 | 💻 | Native | Core Testing |
| qe-test-executor | 🟢 QE | 🚀 | 📦 | 💻 | Native | Core Testing |
| qe-coverage-analyzer | 🟢 QE | 🚀 | 📦 | 💻 | Native | Core Testing |
| qe-quality-gate | 🟢 QE | 🚀 | 📦 | 💻 | Native | Core Testing |
| qe-quality-analyzer | 🟢 QE | 🚀 | 📦 | 💻 | Native | Core Testing |
| qe-performance-tester | 🟢 QE | 🚀 | 📦 | 💻 | Native | Performance & Security |
| qe-security-scanner | 🟢 QE | 🚀 | 📦 | 💻 | Native | Performance & Security |
| qe-requirements-validator | 🟢 QE | 🚀 | 📦 | 💻 | Native | Strategic Planning |
| qe-production-intelligence | 🟢 QE | 🚀 | 📦 | 💻 | Native | Strategic Planning |
| qe-fleet-commander | 🟢 QE | 🚀 | 📦 | 💻 | Native | Strategic Planning |
| qe-deployment-readiness | 🟢 QE | 🚀 | 📦 | 💻 | Native | Deployment |
| qe-regression-risk-analyzer | 🟢 QE | 🚀 | 📦 | 💻 | Native | Advanced Testing |
| qe-test-data-architect | 🟢 QE | 🚀 | 📦 | 💻 | Native | Advanced Testing |
| qe-api-contract-validator | 🟢 QE | 🚀 | 📦 | 💻 | Native | Advanced Testing |
| qe-flaky-test-hunter | 🟢 QE | 🚀 | 📦 | 💻 | Native | Advanced Testing |
| qe-visual-tester | 🟢 QE | 🚀 | 📦 | 💻 | Native | Specialized |
| qe-chaos-engineer | 🟢 QE | 🚀 | 📦 | 💻 | Native | Specialized |
| **CORE DEVELOPMENT** |
| coder | 🔵 CF | 🚀 | 📦 | 💻 | External | Core Development |
| reviewer | 🔵 CF | 🚀 | 📦 | 💻 | External | Core Development |
| tester | 🔵 CF | 🚀 | 📦 | 💻 | External | Core Development |
| planner | 🔵 CF | 🚀 | 📦 | 💻 | External | Core Development |
| researcher | 🔵 CF | 🚀 | 📦 | 💻 | External | Core Development |
| **SWARM COORDINATION** |
| hierarchical-coordinator | 🔵 CF | 🚀 | 📦 | 💻 | External | Swarm Coordination |
| mesh-coordinator | 🔵 CF | 🚀 | 📦 | 💻 | External | Swarm Coordination |
| adaptive-coordinator | 🔵 CF | 🚀 | 📦 | 💻 | External | Swarm Coordination |
| collective-intelligence-coordinator | 🔵 CF | 🚀 | 📦 | 💻 | External | Swarm Coordination |
| swarm-memory-manager | 🔵 CF | 🚀 | 📦 | 💻 | External | Swarm Coordination |
| **CONSENSUS & DISTRIBUTED** |
| byzantine-coordinator | 🔵 CF | 🚀 | 📦 | 💻 | External | Consensus & Distributed |
| raft-manager | 🔵 CF | 🚀 | 📦 | 💻 | External | Consensus & Distributed |
| gossip-coordinator | 🔵 CF | 🚀 | 📦 | 💻 | External | Consensus & Distributed |
| crdt-synchronizer | 🔵 CF | 🚀 | 📦 | 💻 | External | Consensus & Distributed |
| quorum-manager | 🔵 CF | 🚀 | 📦 | 💻 | External | Consensus & Distributed |
| security-manager | 🔵 CF | 🚀 | 📦 | 💻 | External | Consensus & Distributed |
| performance-benchmarker | 🔵 CF | 🚀 | 📦 | 💻 | External | Consensus & Distributed |
| **PERFORMANCE & OPTIMIZATION** |
| performance-monitor | 🔵 CF | 🚀 | 📦 | 💻 | External | Performance & Optimization |
| benchmark-suite | 🔵 CF | 🚀 | 📦 | 💻 | External | Performance & Optimization |
| resource-allocator | 🔵 CF | 🚀 | 📦 | 💻 | External | Performance & Optimization |
| load-balancer | 🔵 CF | 🚀 | 📦 | 💻 | External | Performance & Optimization |
| topology-optimizer | 🔵 CF | 🚀 | 📦 | 💻 | External | Performance & Optimization |
| **GITHUB & REPOSITORY** |
| github-modes | 🔵 CF | 🚀 | 📦 | 💻 | External | GitHub & Repository |
| pr-manager | 🔵 CF | 🚀 | 📦 | 💻 | External | GitHub & Repository |
| code-review-swarm | 🔵 CF | 🚀 | 📦 | 💻 | External | GitHub & Repository |
| issue-tracker | 🔵 CF | 🚀 | 📦 | 💻 | External | GitHub & Repository |
| release-manager | 🔵 CF | 🚀 | 📦 | 💻 | External | GitHub & Repository |
| workflow-automation | 🔵 CF | 🚀 | 📦 | 💻 | External | GitHub & Repository |
| project-board-sync | 🔵 CF | 🚀 | 📦 | 💻 | External | GitHub & Repository |
| repo-architect | 🔵 CF | 🚀 | 📦 | 💻 | External | GitHub & Repository |
| multi-repo-swarm | 🔵 CF | 🚀 | 📦 | 💻 | External | GitHub & Repository |
| **SPARC METHODOLOGY** |
| specification | 🔵 CF | 🚀 | 📦 | 💻 | External | SPARC Methodology |
| pseudocode | 🔵 CF | 🚀 | 📦 | 💻 | External | SPARC Methodology |
| architecture | 🔵 CF | 🚀 | 📦 | 💻 | External | SPARC Methodology |
| refinement | 🔵 CF | 🚀 | 📦 | 💻 | External | SPARC Methodology |
| **SPECIALIZED DEVELOPMENT** |
| backend-dev | 🔵 CF | 🚀 | 📦 | 💻 | External | Specialized Development |
| mobile-dev | 🔵 CF | 🚀 | 📦 | 💻 | External | Specialized Development |
| ml-developer | 🔵 CF | 🚀 | 📦 | 💻 | External | Specialized Development |
| cicd-engineer | 🔵 CF | 🚀 | 📦 | 💻 | External | Specialized Development |
| api-docs | 🔵 CF | 🚀 | 📦 | 💻 | External | Specialized Development |
| system-architect | 🔵 CF | 🚀 | 📦 | 💻 | External | Specialized Development |
| code-analyzer | 🔵 CF | 🚀 | 📦 | 💻 | External | Specialized Development |
| base-template-generator | 🔵 CF | 🚀 | 📦 | 💻 | External | Specialized Development |
| **TESTING & VALIDATION** |
| tdd-london-swarm | 🔵 CF | 🚀 | 📦 | 💻 | External | Testing & Validation |
| production-validator | 🔵 CF | 🚀 | 📦 | 💻 | External | Testing & Validation |
| **HIVE MIND** |
| queen-coordinator | 🔵 CF | 🚀 | 📦 | 💻 | External | Hive Mind |
| scout-explorer | 🔵 CF | 🚀 | 📦 | 💻 | External | Hive Mind |
| worker-specialist | 🔵 CF | 🚀 | 📦 | 💻 | External | Hive Mind |
| **FLOW NEXUS PLATFORM** |
| flow-nexus-swarm | 🔵 CF | 🚀 | 📦 | 💻 | External | Flow Nexus Platform |
| flow-nexus-authentication | 🔵 CF | 🚀 | 📦 | 💻 | External | Flow Nexus Platform |
| flow-nexus-sandbox | 🔵 CF | 🚀 | 📦 | 💻 | External | Flow Nexus Platform |
| flow-nexus-neural-network | 🔵 CF | 🚀 | 📦 | 💻 | External | Flow Nexus Platform |
| flow-nexus-workflow | 🔵 CF | 🚀 | 📦 | 💻 | External | Flow Nexus Platform |
| flow-nexus-app-store | 🔵 CF | 🚀 | 📦 | 💻 | External | Flow Nexus Platform |
| flow-nexus-challenges | 🔵 CF | 🚀 | 📦 | 💻 | External | Flow Nexus Platform |
| flow-nexus-payments | 🔵 CF | 🚀 | 📦 | 💻 | External | Flow Nexus Platform |
| flow-nexus-user-tools | 🔵 CF | 🚀 | 📦 | 💻 | External | Flow Nexus Platform |

---

## System Distribution

```
┌─────────────────────────────────────┐
│     AGENT SYSTEM DISTRIBUTION       │
├─────────────────────────────────────┤
│  🟢 QE Fleet:        17 (23%)       │
│  🔵 Claude Flow:     57 (77%)       │
├─────────────────────────────────────┤
│  Total:              74 (100%)      │
└─────────────────────────────────────┘
```

---

## Access Method Availability

| Access Method | QE Fleet | Claude Flow | Total |
|---------------|----------|-------------|-------|
| 🚀 Task Tool | 17 | 57 | **74** |
| 📦 MCP Tools | 17 | 57 | **74** |
| 💻 CLI Commands | 17 | 57 | **74** |

---

## Hook Performance Comparison

```
┌──────────────────────────────────────────────────────┐
│              HOOK PERFORMANCE                        │
├──────────────────────────────────────────────────────┤
│  🟢 QE Native Hooks:    <1ms (100-500x faster)       │
│  🔵 CF External Hooks:  100-500ms (baseline)         │
└──────────────────────────────────────────────────────┘
```

---

## Category Distribution

| Category | QE Fleet | Claude Flow | Total |
|----------|----------|-------------|-------|
| Core Testing | 5 | 0 | 5 |
| Performance & Security | 2 | 0 | 2 |
| Strategic Planning | 3 | 0 | 3 |
| Deployment | 1 | 0 | 1 |
| Advanced Testing | 4 | 0 | 4 |
| Specialized | 2 | 0 | 2 |
| Core Development | 0 | 5 | 5 |
| Swarm Coordination | 0 | 5 | 5 |
| Consensus & Distributed | 0 | 7 | 7 |
| Performance & Optimization | 0 | 5 | 5 |
| GitHub & Repository | 0 | 9 | 9 |
| SPARC Methodology | 0 | 4 | 4 |
| Specialized Development | 0 | 8 | 8 |
| Testing & Validation | 0 | 2 | 2 |
| Hive Mind | 0 | 3 | 3 |
| Flow Nexus Platform | 0 | 9 | 9 |

---

## When to Use Which System

### Use 🟢 QE Fleet When:
- Quality engineering tasks
- Need <1ms coordination speed
- Testing, coverage, security
- Performance analysis
- Production readiness

### Use 🔵 Claude Flow When:
- General development
- SPARC methodology
- GitHub operations
- Swarm coordination
- Distributed systems
- Neural networks

---

## Memory Namespace by System

| System | Namespace | Usage |
|--------|-----------|-------|
| 🟢 QE Fleet | `aqe/*` | Quality metrics, test results, coverage data |
| 🔵 Claude Flow | `swarm/*` | Development state, coordination, session data |

---

## MCP Server Configuration

| System | MCP Server | Command | Status |
|--------|------------|---------|--------|
| 🟢 QE Fleet | `agentic-qe` | `npm run mcp:start` | Required for QE agents |
| 🔵 Claude Flow | `claude-flow` | `npx claude-flow@alpha mcp start` | Required for CF agents |

---

**Validation**: All 74 agents validated ✅
**Last Updated**: 2025-10-20
**Status**: All Systems Operational
