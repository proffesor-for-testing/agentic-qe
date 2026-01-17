# Unified GOAP Implementation Plan: AQE Platform Enhancement

## Comprehensive Multi-Path Implementation for Agent Observability, Visualization, and Constitution-Based Quality Evaluation

**Version**: 1.0.0
**Created**: 2025-11-19
**Status**: Implementation Plan
**Total Effort**: ~160 hours (8-10 weeks)
**Total Actions**: 50 (merged from 3 specifications)

---

## Executive Summary

This unified implementation plan merges three GOAP specifications into a cohesive, phased approach for enhancing the Agentic QE Fleet platform. The plan delivers:

1. **Agent Observability & Telemetry** - OpenTelemetry-based distributed tracing with stakeholder dashboards
2. **Explainable Visualization System** - Interactive mind maps for agent decision trees
3. **Constitution-Based Quality Evaluation** - Multi-agent voting panels with explainable verdicts

### Key Outcomes

- **100% trace coverage** across all 18+ QE agents
- **Real-time visualization** of agent decisions with <100ms render time
- **85%+ agent agreement rate** on quality verdicts
- **Full CI/CD integration** with quality gates
- **Autonomous feedback loops** with OODA cycle adaptation

### Timeline Overview

| Phase | Duration | Focus | Key Deliverables |
|-------|----------|-------|------------------|
| **Phase 1** | Weeks 1-2 | Foundation & Infrastructure | Telemetry bootstrap, event persistence, constitution schema |
| **Phase 2** | Weeks 3-4 | Core Instrumentation & Evaluation | Agent tracing, clause evaluators, voting protocol |
| **Phase 3** | Weeks 5-6 | Dashboards & Visualization | Grafana dashboards, mind map UI, real-time streaming |
| **Phase 4** | Weeks 7-8 | Integration & Orchestration | CI/CD, CLI, feedback loops, MCP tools |
| **Phase 5** | Weeks 9-10 | Production Readiness | Calibration, optimization, documentation |

### Total Effort Breakdown

| Path | Original Estimate | Merged Estimate | Notes |
|------|-------------------|-----------------|-------|
| Path 3: Observability | 70 hours | 55 hours | Shared infrastructure with Path 1 |
| Path 1: Visualization | 8 weeks (160h) | 45 hours | Reuses telemetry data layer |
| Path 2: Constitution | 8 weeks (160h) | 60 hours | Standalone, but uses shared metrics |
| **Total** | ~390 hours | **~160 hours** | 59% reduction through integration |

---

## Technology Stack (Open Source Only)

### Core Infrastructure

| Component | Technology | License | Version | Purpose |
|-----------|------------|---------|---------|---------|
| **Telemetry** | OpenTelemetry | Apache-2.0 | 1.x | Distributed tracing and metrics |
| **Metrics Store** | Prometheus | Apache-2.0 | 2.x | Time-series metrics |
| **Trace Backend** | Jaeger | Apache-2.0 | 1.x | Distributed trace visualization |
| **Dashboards** | Grafana | AGPL-3.0 | 10.x | Visualization and alerting |
| **LLM Observability** | Langfuse | MIT | 2.x | LLM-specific traces and costs |

### Frontend Visualization

| Component | Technology | License | Version | Purpose |
|-----------|------------|---------|---------|---------|
| **UI Framework** | React | MIT | 18.x | Component framework |
| **Graph Visualization** | Cytoscape.js | MIT | 3.x | Interactive graphs |
| **Charts** | Recharts | MIT | 2.x | Quality metrics charts |
| **Data Visualization** | D3.js | ISC | 7.x | Core visualization |
| **Styling** | Tailwind CSS | MIT | 3.x | Utility-first CSS |
| **Build Tool** | Vite | MIT | 5.x | Fast bundling |

### Backend & Runtime

| Component | Technology | License | Version | Purpose |
|-----------|------------|---------|---------|---------|
| **Runtime** | Node.js | MIT | 18+ | JavaScript runtime |
| **Language** | TypeScript | Apache-2.0 | 5.x | Type-safe development |
| **Database** | SQLite | Public Domain | 3.x | Event and evaluation storage |
| **WebSocket** | ws | MIT | 8.x | Real-time streaming |
| **Schema Validation** | Ajv | MIT | 8.x | JSON Schema validation |
| **AST Parsing** | @babel/parser | MIT | 7.x | Code analysis |

### NOT Used (Commercial/Proprietary)

- DataDog (Commercial)
- NewRelic (Commercial)
- Dynatrace (Commercial)
- Any tool without MIT/Apache-2.0/ISC license

---

## Phase 1: Foundation & Infrastructure (Weeks 1-2)

### Objectives

- Establish telemetry infrastructure that all three paths depend on
- Create data persistence layer for events, traces, and evaluations
- Define schemas for constitutions and visualization data

### Actions (13 actions, ~28 hours)

#### 1.1 Telemetry Foundation (Path 3)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **A1** | Install OTEL SDK Dependencies | 30min | None |
| **A2** | Create Telemetry Bootstrap Module | 4h | A1 |
| **A3** | Define Comprehensive Metrics Schema | 2h | None |
| **A7** | Deploy OTEL Collector | 3h | A2 |

#### 1.2 Data Persistence Layer (Path 1)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **V1** | Event History Persistence | 3h | A2 |
| **V2** | Reasoning Chain Capture | 5h | V1 |
| **V3** | Quality Metrics Aggregation | 4h | V2 |

#### 1.3 Constitution Schema (Path 2)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **C1** | Define Constitution JSON Schema | 3h | None |
| **C2** | Create Base Constitutions | 6h | C1 |
| **C3** | Implement Constitution Loader | 3h | C1 |

### Claude-Flow Swarm Configuration

```javascript
// Phase 1: Foundation Swarm
{
  topology: "hierarchical",
  maxAgents: 6,
  strategy: "specialized",
  agents: [
    { type: "architect", name: "telemetry-architect", capabilities: ["otel", "metrics", "tracing"] },
    { type: "coder", name: "bootstrap-dev", capabilities: ["typescript", "node"] },
    { type: "coder", name: "schema-dev", capabilities: ["json-schema", "validation"] },
    { type: "analyst", name: "metrics-analyst", capabilities: ["prometheus", "grafana"] },
    { type: "tester", name: "foundation-tester", capabilities: ["jest", "integration"] },
    { type: "coordinator", name: "phase1-coord", capabilities: ["orchestration"] }
  ]
}
```

### Agent Execution Pattern

```javascript
// Single message with parallel agent execution
[Phase 1 Parallel Execution]:
  Task("telemetry-architect", "Design OTEL architecture with collector config, exporters, and metric schema. Store decisions in aqe/telemetry/architecture.")
  Task("bootstrap-dev", "Implement telemetry bootstrap module with tracer/meter providers. Follow OTEL semantic conventions.")
  Task("schema-dev", "Define constitution JSON schema with principles, clauses, and scoring rules. Create base constitutions for code/test/docs.")
  Task("metrics-analyst", "Design Prometheus metric types and labels. Define alert thresholds and aggregation rules.")
  Task("foundation-tester", "Create integration tests for telemetry initialization and schema validation.")
```

### Memory Namespace (Phase 1)

```
aqe/
  phase1/
    telemetry/
      architecture/          # OTEL design decisions
      bootstrap/             # Initialization code location
      collector-config/      # Collector YAML
    data/
      event-history/         # Event persistence schema
      reasoning-chains/      # Chain data structures
      metrics-aggregation/   # Aggregation algorithms
    constitution/
      schemas/               # JSON Schema definitions
      base/                  # Default constitutions
      loader/                # Loader implementation
```

### Validation Criteria

| Checkpoint | Test | Expected Result |
|------------|------|-----------------|
| OTEL SDK Works | `npm run test:telemetry` | All telemetry tests pass |
| Collector Running | `curl http://localhost:4318/v1/traces` | 200 OK |
| Events Persist | Query last 100 events | Events retrievable from SQLite |
| Schema Valid | `aqe constitution validate` | 3 base constitutions validated |

### Deliverables

**Files Created:**
- `src/telemetry/bootstrap.ts`
- `src/telemetry/metrics/schema.ts`
- `configs/observability/otel-collector.yaml`
- `src/visualization/core/EventHistoryStore.ts`
- `src/visualization/core/ReasoningCapture.ts`
- `src/schemas/constitution.schema.json`
- `constitutions/code-quality-v1.json`
- `constitutions/test-quality-v1.json`
- `constitutions/doc-quality-v1.json`

---

## Phase 2: Core Instrumentation & Evaluation (Weeks 3-4)

### Objectives

- Instrument all 18 QE agents with tracing
- Implement clause evaluation framework
- Build multi-agent voting protocol

### Actions (12 actions, ~36 hours)

#### 2.1 Agent Instrumentation (Path 3)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **A4** | Instrument Agent Lifecycle | 8h | A2, A3 |
| **A5** | Implement Token Usage Tracking | 4h | A2 |
| **A6** | Create Distributed Trace Propagation | 6h | A4 |

#### 2.2 Clause Evaluation (Path 2)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **C4** | Create Clause Evaluator Framework | 8h | C3 |
| **C5** | Design Voting Protocol | 4h | C4 |
| **C6** | Implement Panel Assembly | 4h | C5 |

#### 2.3 Consensus & Voting (Path 2)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **C7** | Implement Consensus Algorithms | 6h | C5 |
| **C8** | Create Voting Orchestrator | 4h | C6, C7 |

### Claude-Flow Swarm Configuration

```javascript
// Phase 2: Instrumentation Swarm
{
  topology: "mesh",
  maxAgents: 8,
  strategy: "adaptive",
  agents: [
    { type: "coder", name: "agent-instrumenter", capabilities: ["otel", "spans", "async"] },
    { type: "coder", name: "token-tracker", capabilities: ["llm", "cost-tracking"] },
    { type: "coder", name: "evaluator-dev", capabilities: ["ast", "regex", "semantic"] },
    { type: "architect", name: "voting-architect", capabilities: ["distributed", "consensus"] },
    { type: "coder", name: "consensus-dev", capabilities: ["algorithms", "statistics"] },
    { type: "coder", name: "orchestrator-dev", capabilities: ["async", "coordination"] },
    { type: "tester", name: "instrumentation-tester", capabilities: ["jest", "spans"] },
    { type: "reviewer", name: "phase2-reviewer", capabilities: ["code-review", "quality"] }
  ]
}
```

### Agent Execution Pattern

```javascript
[Phase 2 Parallel Execution]:
  Task("agent-instrumenter", "Add OTEL spans to all 18 agent lifecycle hooks: spawn, execute, complete, error. Include semantic attributes.")
  Task("token-tracker", "Implement token counting middleware for LLM calls. Track input/output tokens, calculate costs per agent.")
  Task("evaluator-dev", "Build clause evaluators: AST (babel), metric (cyclomatic), pattern (regex), semantic (LLM). Handle all check types.")
  Task("voting-architect", "Design message formats for voting protocol. Define quorum rules and tie-breaking strategies.")
  Task("consensus-dev", "Implement majority, weighted, and Bayesian consensus algorithms. Handle disputed clauses.")
  Task("orchestrator-dev", "Coordinate parallel agent voting with timeout handling and result aggregation.")
```

### Memory Namespace (Phase 2)

```
aqe/
  phase2/
    instrumentation/
      agent-spans/           # Span definitions per agent type
      token-metrics/         # Token tracking config
      trace-context/         # Context propagation patterns
    evaluation/
      evaluators/            # Evaluator implementations
      clause-checks/         # Check type handlers
    voting/
      protocol/              # Message formats
      panel-config/          # Agent selection rules
      consensus/             # Algorithm implementations
```

### Validation Criteria

| Checkpoint | Test | Expected Result |
|------------|------|-----------------|
| Agents Traced | `aqe telemetry trace --agent qe-test-generator` | Spans returned with timing |
| Token Tracking | `aqe telemetry metrics tokens` | Per-agent token breakdown |
| Clause Evaluation | `aqe constitution evaluate --clause C001 test.ts` | Verdict with findings |
| Voting Works | `aqe constitution evaluate file.ts --min-agents 3` | 3 agent votes aggregated |

### Deliverables

**Files Created:**
- `src/telemetry/instrumentation/agent.ts`
- `src/telemetry/instrumentation/task.ts`
- `src/telemetry/instrumentation/memory.ts`
- `src/telemetry/metrics/collectors/cost.ts`
- `src/constitution/evaluators/ast-evaluator.ts`
- `src/constitution/evaluators/metric-evaluator.ts`
- `src/constitution/evaluators/pattern-evaluator.ts`
- `src/constitution/evaluators/semantic-evaluator.ts`
- `src/voting/protocol.ts`
- `src/voting/panel-assembly.ts`
- `src/voting/consensus.ts`
- `src/voting/orchestrator.ts`

---

## Phase 3: Dashboards & Visualization (Weeks 5-6)

### Objectives

- Build Grafana dashboards for all stakeholders
- Create interactive visualization frontend
- Implement real-time streaming

### Actions (12 actions, ~32 hours)

#### 3.1 Stakeholder Dashboards (Path 3)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **A8** | Build Executive Dashboard | 4h | A7, A3 |
| **A9** | Build Developer Dashboard | 4h | A7 |
| **A10** | Build QA Dashboard | 4h | A7, A4 |

#### 3.2 Visualization API (Path 1)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **V4** | Visualization Data Transformer | 4h | V1, V2, V3 |
| **V5** | Real-Time Streaming Endpoint | 5h | V4 |
| **V6** | REST API for Historical Data | 3h | V4 |

#### 3.3 Frontend Visualization (Path 1)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **V7** | Interactive Mind Map Component | 8h | V5 |
| **V8** | Quality Metrics Graph Panel | 6h | V3, V7 |
| **V9** | Lifecycle Timeline View | 5h | V7, V8 |
| **V10** | Drill-Down Detail Panel | 4h | V9 |

### Claude-Flow Swarm Configuration

```javascript
// Phase 3: Visualization Swarm
{
  topology: "star",
  maxAgents: 7,
  strategy: "specialized",
  agents: [
    { type: "coordinator", name: "viz-coordinator", capabilities: ["orchestration", "frontend-backend"] },
    { type: "coder", name: "grafana-dev", capabilities: ["grafana", "promql", "dashboards"] },
    { type: "coder", name: "frontend-dev", capabilities: ["react", "typescript", "d3"] },
    { type: "coder", name: "api-dev", capabilities: ["rest", "websocket", "streaming"] },
    { type: "coder", name: "cytoscape-dev", capabilities: ["cytoscape", "graphs", "layout"] },
    { type: "designer", name: "ux-designer", capabilities: ["ux", "accessibility", "design"] },
    { type: "tester", name: "e2e-tester", capabilities: ["playwright", "cypress", "e2e"] }
  ]
}
```

### Agent Execution Pattern

```javascript
[Phase 3 Parallel Execution]:
  Task("grafana-dev", "Create 3 Grafana dashboards: Executive (quality trends, costs), Developer (trace explorer, logs), QA (test metrics, coverage). Export as JSON provisioning.")
  Task("api-dev", "Build WebSocket server for real-time streaming and REST endpoints for historical queries. Implement backpressure handling.")
  Task("frontend-dev", "Create React app with Vite. Set up Tailwind, routing, and state management. Build base component structure.")
  Task("cytoscape-dev", "Implement interactive mind map with Cytoscape.js. Add expand/collapse, zoom/pan, search/filter. Support 1000+ nodes.")
  Task("ux-designer", "Design dashboard layouts and visualization UX. Create mockups for mind map interactions and drill-down flows.")
```

### Memory Namespace (Phase 3)

```
aqe/
  phase3/
    dashboards/
      executive/             # Executive dashboard config
      developer/             # Developer dashboard config
      qa-leader/             # QA dashboard config
    visualization/
      api/
        websocket/           # Streaming config
        rest/                # REST endpoints
      frontend/
        components/          # Component architecture
        state/               # State management
      mindmap/
        layout/              # Graph layout algorithms
        interactions/        # User interaction handlers
```

### Validation Criteria

| Checkpoint | Test | Expected Result |
|------------|------|-----------------|
| Dashboards Load | Lighthouse audit | <2s page load |
| WebSocket Streams | Connect test client | Receive live updates <500ms |
| Mind Map Renders | Render 100 nodes | <100ms render time |
| Drill-Down Works | Click node | Detail panel shows data |

### Deliverables

**Files Created:**
- `dashboards/grafana/executive.json`
- `dashboards/grafana/developer.json`
- `dashboards/grafana/qa-leader.json`
- `src/visualization/api/WebSocketServer.ts`
- `src/visualization/api/RestEndpoints.ts`
- `frontend/src/components/MindMap/MindMap.tsx`
- `frontend/src/components/MetricsPanel/RadarChart.tsx`
- `frontend/src/components/Timeline/LifecycleTimeline.tsx`
- `frontend/src/components/DetailPanel/DrillDownPanel.tsx`

---

## Phase 4: Integration & Orchestration (Weeks 7-8)

### Objectives

- Implement alerting and feedback loops
- Create CI/CD integration
- Build CLI and MCP tools
- Connect all subsystems

### Actions (15 actions, ~38 hours)

#### 4.1 Alerting & Feedback (Path 3)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **A11** | Configure Alerting Rules | 3h | A7 |
| **A12** | Build Autonomous Feedback Loop | 8h | A4, A11 |

#### 4.2 Output Generation (Path 2)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **C9** | Implement Result Aggregator | 4h | C7 |
| **C10** | Create Human-Readable Reporter | 4h | C9 |
| **C11** | Create Structured JSON Reporter | 2h | C9 |
| **C12** | Create Agent Control Loop Reporter | 4h | C9 |

#### 4.3 Integration Points (All Paths)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **C13** | CI/CD Integration | 4h | C11 |
| **A14** | Create Telemetry CLI Commands | 4h | A2 |
| **C14** | Constitution CLI Commands | 4h | C8, C10, C11 |
| **V11** | Visualization MCP Tools | 4h | V10 |
| **C16** | Constitution MCP Tools | 4h | C14 |
| **C15** | Memory Integration | 2h | C9 |

### Claude-Flow Swarm Configuration

```javascript
// Phase 4: Integration Swarm
{
  topology: "hierarchical",
  maxAgents: 10,
  strategy: "balanced",
  agents: [
    { type: "coordinator", name: "integration-coord", capabilities: ["orchestration", "integration"] },
    { type: "coder", name: "alerting-dev", capabilities: ["prometheus", "alertmanager"] },
    { type: "coder", name: "feedback-dev", capabilities: ["ooda", "control-loops", "adaptation"] },
    { type: "coder", name: "reporter-dev", capabilities: ["markdown", "json", "templates"] },
    { type: "coder", name: "cicd-dev", capabilities: ["github-actions", "yaml", "workflows"] },
    { type: "coder", name: "cli-dev", capabilities: ["oclif", "cli-design", "commander"] },
    { type: "coder", name: "mcp-dev", capabilities: ["mcp", "tool-registration"] },
    { type: "coder", name: "memory-dev", capabilities: ["sqlite", "memory-namespace"] },
    { type: "tester", name: "integration-tester", capabilities: ["jest", "e2e", "integration"] },
    { type: "documenter", name: "api-documenter", capabilities: ["openapi", "markdown"] }
  ]
}
```

### Agent Execution Pattern

```javascript
[Phase 4 Parallel Execution]:
  Task("alerting-dev", "Configure AlertManager rules for critical/warning/info. Set up Slack/PagerDuty routing. Define alert suppression.")
  Task("feedback-dev", "Implement OODA feedback loop: observe metrics, orient analysis, decide actions, act on agents. Add concurrency/model adjustments.")
  Task("reporter-dev", "Build 3 reporters: human (markdown with findings), JSON (schema-validated), agent (control loop output with nextSteps).")
  Task("cicd-dev", "Create GitHub Actions workflow for constitution quality gate. Post PR comments with results. Set exit codes.")
  Task("cli-dev", "Add CLI commands: aqe telemetry {status,metrics,trace}, aqe constitution {evaluate,panel,calibrate}, aqe visualize {start,export}.")
  Task("mcp-dev", "Register MCP tools: aqe_telemetry_status, aqe_constitution_evaluate, aqe_visualization_start, aqe_visualization_export.")
```

### Memory Namespace (Phase 4)

```
aqe/
  phase4/
    alerting/
      rules/                 # Alert rule definitions
      routing/               # Notification routing
    feedback/
      loop-config/           # Feedback loop parameters
      adaptations/           # Adaptation history
    output/
      templates/             # Report templates
      reporters/             # Reporter implementations
    integration/
      cicd/                  # CI/CD workflow configs
      cli/                   # CLI command definitions
      mcp/                   # MCP tool registrations
```

### Validation Criteria

| Checkpoint | Test | Expected Result |
|------------|------|-----------------|
| Alerts Fire | `aqe telemetry test-alert --level critical` | Alert received in 30s |
| Feedback Loop | Trigger high error rate | Agent concurrency adjusted |
| CI/CD Works | `act pull_request` | Workflow passes |
| CLI Commands | `aqe --help` | All commands listed |
| MCP Tools | `aqe mcp list | grep aqe_` | All tools registered |

### Deliverables

**Files Created:**
- `configs/observability/alertmanager.yaml`
- `src/telemetry/feedback/loop.ts`
- `src/telemetry/feedback/adaptations.ts`
- `src/output/human-reporter.ts`
- `src/output/json-reporter.ts`
- `src/output/agent-reporter.ts`
- `.github/workflows/constitution-gate.yml`
- `src/cli/commands/telemetry.ts`
- `src/cli/commands/constitution.ts`
- `src/cli/commands/visualize.ts`
- `src/mcp/telemetry-tools.ts`
- `src/mcp/constitution-tools.ts`
- `src/mcp/visualization-tools.ts`

---

## Phase 5: Production Readiness (Weeks 9-10)

### Objectives

- Calibrate and optimize all systems
- Complete documentation
- Verify all success criteria
- Prepare for production deployment

### Actions (8 actions, ~26 hours)

#### 5.1 Calibration & Testing (Path 2)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **C17** | Create Calibration Test Suite | 4h | C8 |
| **C18** | Implement Agreement Metrics | 2h | C7 |
| **C19** | Create Appeal Process | 4h | C9, C15 |

#### 5.2 Performance Optimization (Path 1)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **V12** | Export & Sharing | 3h | V11 |
| **V13** | Performance Optimization | 5h | V12 |

#### 5.3 Documentation (All Paths)

| ID | Action | Effort | Dependencies |
|----|--------|--------|--------------|
| **A15** | Observability Documentation | 4h | A8, A9, A11 |
| **C20** | Constitution Documentation | 4h | C14 |

### Claude-Flow Swarm Configuration

```javascript
// Phase 5: Production Readiness Swarm
{
  topology: "mesh",
  maxAgents: 6,
  strategy: "adaptive",
  agents: [
    { type: "tester", name: "calibration-tester", capabilities: ["calibration", "statistics"] },
    { type: "optimizer", name: "perf-optimizer", capabilities: ["performance", "profiling"] },
    { type: "documenter", name: "tech-writer", capabilities: ["technical-writing", "markdown"] },
    { type: "analyst", name: "metrics-analyst", capabilities: ["metrics", "dashboards"] },
    { type: "reviewer", name: "qa-reviewer", capabilities: ["quality", "acceptance"] },
    { type: "coordinator", name: "release-coord", capabilities: ["release", "validation"] }
  ]
}
```

### Agent Execution Pattern

```javascript
[Phase 5 Parallel Execution]:
  Task("calibration-tester", "Create test suite with known verdicts. Run calibration to verify 85%+ agreement. Document calibration process.")
  Task("perf-optimizer", "Optimize mind map for 1000+ nodes: virtual scrolling, canvas rendering, web workers. Target <100ms render.")
  Task("tech-writer", "Write user guides, runbooks, and authoring guides. Document all CLI commands and API endpoints.")
  Task("metrics-analyst", "Set up monitoring dashboard for agreement rate, latency, and appeals. Configure drift detection alerts.")
  Task("qa-reviewer", "Run full acceptance test suite. Verify all success criteria. Document any gaps.")
```

### Memory Namespace (Phase 5)

```
aqe/
  phase5/
    calibration/
      test-suite/            # Calibration test cases
      results/               # Calibration run results
      metrics/               # Agreement statistics
    optimization/
      performance/           # Performance benchmarks
      exports/               # Export implementations
    documentation/
      user-guides/           # User documentation
      runbooks/              # Operational runbooks
      api-docs/              # API reference
```

### Validation Criteria

| Checkpoint | Test | Expected Result |
|------------|------|-----------------|
| Calibration Passes | `npm run test:calibration` | All verdicts match expected |
| Agreement Rate | `aqe constitution metrics --metric agreement` | >= 85% |
| Render Performance | Render 1000 nodes | <100ms |
| Docs Complete | `ls docs/guides/*.md | wc -l` | 5+ guides |
| All Criteria Met | Run full acceptance suite | 100% pass |

### Deliverables

**Files Created:**
- `tests/calibration/*.ts`
- `src/metrics/agreement.ts`
- `src/appeal/process.ts`
- `src/visualization/export/svg.ts`
- `src/visualization/export/png.ts`
- `src/visualization/optimization/virtual-scroll.ts`
- `docs/guides/TELEMETRY-USER-GUIDE.md`
- `docs/guides/CONSTITUTION-AUTHORING.md`
- `docs/guides/CONSTITUTION-EVALUATION.md`
- `docs/guides/VISUALIZATION-USER-GUIDE.md`
- `docs/runbooks/alert-response/`

---

## Dependency Graph

### Visual Representation

```
PHASE 1: Foundation
==================
A1 (OTEL SDK) ─────────┬──> A2 (Bootstrap) ──┬──> A4 (Instrument) ──> A6 (Propagation)
                       │                     │
                       │                     ├──> A5 (Tokens)
                       │                     │
                       │                     ├──> A7 (Collector) ──┬──> A8 (Exec Dash)
                       │                     │                     ├──> A9 (Dev Dash)
                       │                     │                     ├──> A10 (QA Dash)
                       │                     │                     └──> A11 (Alerts) ──> A12 (Feedback)
                       │                     │
                       │                     └──> A14 (CLI)
                       │
A3 (Metrics Schema) ───┼──> A4, A8
                       │
V1 (Event History) ────┼──> V2 (Reasoning) ──> V3 (Metrics Agg) ──> V4 (Transform)
                       │                                              │
                       └──────────────────────────────────────────────┬──> V5 (WebSocket) ──> V7 (Mind Map)
                                                                      │                          │
                                                                      └──> V6 (REST)            V8 (Charts)
                                                                                                  │
                                                                                                V9 (Timeline)
                                                                                                  │
                                                                                                V10 (Drill)
                                                                                                  │
                                                                                                V11 (MCP)

PHASE 2: Constitution Path
==========================
C1 (Schema) ──┬──> C2 (Base Const)
              │
              └──> C3 (Loader) ──> C4 (Evaluators) ──> C5 (Protocol) ──┬──> C6 (Panel)
                                                                       │
                                                                       └──> C7 (Consensus) ──┬──> C8 (Orchestrator)
                                                                                             │
                                                                                             └──> C18 (Metrics)

C8 ──> C9 (Aggregator) ──┬──> C10 (Human Reporter)
                         │
                         ├──> C11 (JSON Reporter) ──> C13 (CI/CD)
                         │
                         ├──> C12 (Agent Reporter)
                         │
                         └──> C15 (Memory) ──> C19 (Appeal)

C8 + C10 + C11 ──> C14 (CLI) ──> C16 (MCP) ──> C20 (Docs)
C8 ──> C17 (Calibration)
```

### Critical Path

The longest dependency chain determines the minimum timeline:

```
A1 -> A2 -> A4 -> A6 -> A11 -> A12 -> A15
       |
       +-> V1 -> V2 -> V3 -> V4 -> V5 -> V7 -> V8 -> V9 -> V10 -> V11 -> V13
       |
       +-> C3 -> C4 -> C5 -> C7 -> C8 -> C9 -> C10 -> C14 -> C16 -> C20
```

**Critical path duration: ~8 weeks** (with parallel execution within phases)

### Parallelization Opportunities

Within each phase, multiple actions can execute in parallel:

| Phase | Parallel Groups |
|-------|-----------------|
| 1 | (A1, A3, C1) -> (A2, V1, C2, C3) -> (A7, V2) |
| 2 | (A4, A5, C4) -> (A6, C5) -> (C6, C7) -> C8 |
| 3 | (A8, A9, A10, V4) -> (V5, V6) -> (V7, V8) -> (V9) -> V10 |
| 4 | (A11, C9) -> (A12, C10, C11, C12) -> (C13, A14, C14) -> (V11, C16) |
| 5 | (C17, C18, V12) -> (C19, V13) -> (A15, C20) |

---

## CLI Commands Reference

### Telemetry Commands

```bash
# Status and configuration
aqe telemetry status                      # Show telemetry status
aqe telemetry config                      # Show/update configuration

# Metrics
aqe telemetry metrics [metric-name]       # Query metrics
aqe telemetry metrics tokens              # Show token usage
aqe telemetry metrics quality             # Show quality scores

# Traces
aqe telemetry trace [trace-id]            # View specific trace
aqe telemetry trace --agent <type>        # Recent traces by agent

# Alerts
aqe telemetry test-alert --level <level>  # Trigger test alert

# Export
aqe telemetry export --format <format>    # Export data

# Feedback
aqe telemetry feedback status             # Show feedback loop status
```

### Constitution Commands

```bash
# Management
aqe constitution init                     # Initialize for project
aqe constitution validate [path]          # Validate constitution files
aqe constitution list                     # List loaded constitutions
aqe constitution show <id>                # Show constitution details

# Evaluation
aqe constitution evaluate <files>         # Evaluate against constitution
  --constitution <id>                     # Use specific constitution
  --output <format>                       # human | json | agent | github-actions
  --min-agents <n>                        # Minimum agents on panel
  --specializations <list>                # Required specializations
  --fail-fast                             # Stop on first critical

# Panel
aqe constitution panel                    # Show panel configuration
  --artifact-type <type>                  # code | test | doc
  --min-agents <n>                        # Minimum agents
  --max-agents <n>                        # Maximum agents

# Calibration
aqe constitution calibrate                # Run calibration tests
aqe constitution metrics                  # Show agreement metrics

# Appeal
aqe constitution appeal <eval-id>         # Start appeal
aqe constitution appeal-status <id>       # Check appeal status
```

### Visualization Commands

```bash
# Server
aqe visualize start --port 3001           # Start visualization server
aqe visualize stop                        # Stop server

# Export
aqe visualize export --format svg         # Export as SVG
aqe visualize export --format png         # Export as PNG
aqe visualize export --format json        # Export data as JSON

# Trace
aqe visualize trace <task-id>             # Visualize specific task
```

---

## Milestones & Success Criteria

### Milestone Summary

| ID | Name | Target | Key Metric |
|----|------|--------|------------|
| **M1** | Infrastructure Ready | Week 2 | OTEL Collector running, schemas validated |
| **M2** | Core Instrumentation | Week 4 | 100% agent trace coverage |
| **M3** | Dashboards Live | Week 6 | All 3 dashboards <2s load |
| **M4** | Integration Complete | Week 8 | CI/CD, CLI, MCP all working |
| **M5** | Production Ready | Week 10 | All success criteria met |

### Detailed Success Criteria

#### Observability (Path 3)

| Criterion | Target | Test |
|-----------|--------|------|
| Trace Coverage | 100% | Every agent operation has spans |
| Metric Collection | All schema metrics | Prometheus query validation |
| Dashboard Load | <2s | Lighthouse audit |
| Alert Latency | <30s | Timestamp delta test |
| Feedback Activation | <5min | Adaptation time measurement |
| MTTR Improvement | 50% reduction | Historical comparison |

#### Visualization (Path 1)

| Criterion | Target | Test |
|-----------|--------|------|
| Decision Trace Time | <5s | User study: trace to root cause |
| Render Latency (100 nodes) | <100ms | Performance API |
| Render Latency (1000 nodes) | <500ms | Performance API |
| Real-time Lag | <500ms | Timestamp comparison |
| User Comprehension | >80% | User study |
| All 19 Agents | 100% | Matrix test |

#### Constitution (Path 2)

| Criterion | Target | Test |
|-----------|--------|------|
| Constitution Coverage | 100% (code, tests, docs) | Schema validation |
| Agent Agreement | >=85% | Calibration test suite |
| Judgment Explainability | 100% | All verdicts cite clauses |
| Response Time (File) | <5s | P95 latency |
| Response Time (PR) | <60s | P95 latency |
| CI/CD Integration | Fully automated | Workflow test |
| Structured Output | 100% schema valid | JSON Schema validation |

### Go/No-Go Decision Points

| Phase | Decision Point | Criteria |
|-------|----------------|----------|
| End Phase 1 | Proceed to Phase 2? | Collector running, schemas valid, events persisting |
| End Phase 2 | Proceed to Phase 3? | Agents traced, voting works, evaluators functional |
| End Phase 3 | Proceed to Phase 4? | Dashboards load <2s, mind map renders <100ms |
| End Phase 4 | Proceed to Phase 5? | CI/CD passes, CLI works, MCP tools registered |
| End Phase 5 | Production release? | All success criteria met, docs complete |

---

## Risk Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Metric cardinality explosion** | Medium | High | Label review process, cardinality limits in Prometheus |
| **Performance with large graphs** | High | Medium | Virtual scrolling, canvas rendering, level-of-detail |
| **Agent disagreement too high** | Medium | High | Calibration suite, clause specificity tuning, voting weights |
| **Semantic checks unreliable** | High | Medium | Ensemble approach, deterministic fallbacks |
| **Real-time sync issues** | Medium | Medium | Sequence numbers, reconciliation protocol |
| **Memory leaks in visualization** | Medium | Medium | Strict cleanup, WeakMap usage, memory profiling |

### Organizational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Teams reject automated judgments** | High | High | Start with advisory mode, demonstrate value, allow overrides |
| **Constitutions too strict/lenient** | Medium | Medium | Progressive thresholds, team-specific tuning, appeals |
| **Alert fatigue** | Medium | High | Tuning, suppression rules, well-written runbooks |
| **Dashboard complexity** | Medium | Medium | Stakeholder-specific views, training materials |

### Timeline Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **OTEL learning curve** | Medium | Low | Documentation, examples, pair programming |
| **Stakeholder alignment** | Low | Medium | Early reviews, iterative design, feedback loops |
| **Infrastructure delays** | Low | Medium | Containerized deployment, local development mode |
| **Scope creep** | Medium | High | Strict phase gates, prioritized backlog |

---

## Resource Requirements

### Development Team

| Role | FTE | Skills |
|------|-----|--------|
| Backend Developer | 1.5 | TypeScript, Node.js, OTEL, distributed systems |
| Frontend Developer | 1 | React, D3.js/Cytoscape.js, TypeScript |
| DevOps/SRE | 0.5 | Prometheus, Grafana, AlertManager, Docker |
| QE/Test Engineer | 0.5 | Jest, Playwright, calibration testing |
| Technical Writer | 0.25 | Documentation, runbooks |

### Infrastructure

| Component | Resources | Monthly Cost |
|-----------|-----------|--------------|
| OTEL Collector | 1 CPU, 1GB RAM | $0 (self-hosted) |
| Prometheus | 2 CPU, 4GB RAM, 100GB storage | $10-50 |
| Grafana | 1 CPU, 1GB RAM | $0 (OSS) |
| Jaeger | 1 CPU, 2GB RAM, 50GB storage | $0 (self-hosted) |
| SQLite | File storage | $0 |
| **Total** | | **$10-50/month** |

---

## Appendix A: Action ID Mapping

### Path 3 (Observability) Actions

| Original ID | Unified ID | Name |
|-------------|------------|------|
| A1_INSTALL_OTEL | A1 | Install OTEL SDK Dependencies |
| A2_TELEMETRY_BOOTSTRAP | A2 | Create Telemetry Bootstrap Module |
| A3_METRICS_SCHEMA | A3 | Define Comprehensive Metrics Schema |
| A4_INSTRUMENT_AGENTS | A4 | Instrument Agent Lifecycle |
| A5_TOKEN_TRACKING | A5 | Implement Token Usage Tracking |
| A6_TRACE_PROPAGATION | A6 | Create Distributed Trace Propagation |
| A7_OTEL_COLLECTOR | A7 | Deploy OTEL Collector |
| A8_EXEC_DASHBOARD | A8 | Build Executive Dashboard |
| A9_DEV_DASHBOARD | A9 | Build Developer Dashboard |
| A10_QA_DASHBOARD | A10 | Build QA Dashboard |
| A11_ALERT_RULES | A11 | Configure Alerting Rules |
| A12_FEEDBACK_LOOP | A12 | Build Autonomous Feedback Loop |
| A14_CLI_COMMANDS | A14 | Create Telemetry CLI Commands |
| A15_DOCUMENTATION | A15 | Write Observability Documentation |

### Path 1 (Visualization) Actions

| Original ID | Unified ID | Name |
|-------------|------------|------|
| event-history-persistence | V1 | Event History Persistence |
| reasoning-chain-capture | V2 | Reasoning Chain Capture |
| quality-metrics-aggregation | V3 | Quality Metrics Aggregation |
| visualization-data-transformer | V4 | Visualization Data Transformer |
| realtime-streaming-endpoint | V5 | Real-Time Streaming Endpoint |
| rest-api-historical | V6 | REST API for Historical Data |
| interactive-mindmap-component | V7 | Interactive Mind Map Component |
| quality-metrics-graph | V8 | Quality Metrics Graph Panel |
| lifecycle-timeline-view | V9 | Lifecycle Timeline View |
| drilldown-detail-panel | V10 | Drill-Down Detail Panel |
| mcp-tool-integration | V11 | MCP Tool Integration |
| export-sharing | V12 | Export & Sharing |
| performance-optimization | V13 | Performance Optimization |

### Path 2 (Constitution) Actions

| Original ID | Unified ID | Name |
|-------------|------------|------|
| A001 | C1 | Define Constitution JSON Schema |
| A002 | C2 | Create Base Constitutions |
| A003 | C3 | Implement Constitution Loader |
| A004 | C4 | Create Clause Evaluator Framework |
| A005 | C5 | Design Voting Protocol |
| A006 | C6 | Implement Panel Assembly |
| A007 | C7 | Implement Consensus Algorithms |
| A008 | C8 | Create Voting Orchestrator |
| A009 | C9 | Implement Result Aggregator |
| A010 | C10 | Create Human-Readable Reporter |
| A011 | C11 | Create Structured JSON Reporter |
| A012 | C12 | Create Agent Control Loop Reporter |
| A013 | C13 | CI/CD Integration |
| A014 | C14 | Constitution CLI Commands |
| A015 | C15 | Memory Integration |
| A016 | C16 | Constitution MCP Tools |
| A017 | C17 | Create Calibration Test Suite |
| A018 | C18 | Implement Agreement Metrics |
| A019 | C19 | Create Appeal Process |
| A020 | C20 | Constitution Documentation |

---

## Appendix B: Memory Namespace Structure

```
aqe/
  telemetry/
    architecture/            # OTEL design decisions
    bootstrap/               # Initialization config
    collector-config/        # Collector YAML
    metrics-schema/          # Metric definitions

  tracing/
    context/                 # Trace context propagation
    agent-spans/             # Per-agent span configs

  visualization/
    event-history/           # Event persistence
    reasoning-chains/        # Chain data
    metrics-aggregation/     # Aggregated metrics
    api/
      websocket/             # Streaming config
      rest/                  # REST endpoints
    frontend/
      components/            # Component state

  constitution/
    schemas/                 # JSON Schema definitions
    active/                  # Loaded constitutions
    evaluators/              # Evaluator configs

  voting/
    protocol/                # Message formats
    panel-config/            # Agent selection
    consensus/               # Algorithm configs

  evaluations/
    {timestamp}/
      result.json
      votes/
        {agent-id}.json

  feedback/
    loop-config/             # Feedback parameters
    adaptations/             # Adaptation history

  integration/
    cicd/                    # CI/CD configs
    cli/                     # CLI definitions
    mcp/                     # MCP registrations

  calibration/
    test-suite/              # Test cases
    results/                 # Run results
    metrics/                 # Agreement stats

  appeals/
    {appeal-id}/
      original.json
      review.json
      verdict.json
```

---

## Appendix C: Inter-Phase Dependencies

### Shared Infrastructure

The following infrastructure is shared across all three paths:

1. **Telemetry Bootstrap (A2)** - Used by visualization for event capture
2. **Metrics Schema (A3)** - Used by dashboards and quality evaluation
3. **OTEL Collector (A7)** - Central data collection for all metrics
4. **Event History (V1)** - Used by both visualization and constitution auditing
5. **Quality Metrics Aggregation (V3)** - Used by dashboards and constitution scoring
6. **Memory Integration (C15)** - Shared memory namespace for all paths

### Cross-Path Data Flows

```
Observability -> Visualization
  - Trace data feeds mind map
  - Metrics power charts
  - Alerts trigger visual updates

Observability -> Constitution
  - Token metrics inform cost-aware evaluation
  - Trace context links evaluations to operations

Visualization -> Constitution
  - Mind map can visualize evaluation results
  - Timeline shows evaluation events

Constitution -> Visualization
  - Evaluation results displayed in detail panel
  - Quality scores shown in metrics charts

Constitution -> Observability
  - Evaluation metrics feed dashboards
  - Agent performance tracked
```

---

**End of Unified Implementation Plan**

*This plan provides a comprehensive roadmap for implementing all three GOAP paths in an integrated manner. Execute phases sequentially while maximizing parallel execution within each phase. Use Claude-Flow swarm orchestration for efficient agent coordination.*
