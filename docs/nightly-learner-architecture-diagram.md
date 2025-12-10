# Nightly-Learner Architecture Diagrams

## Overview

This document provides detailed architecture diagrams for the nightly-learner system. Use these to understand component interactions, data flows, and system boundaries.

---

## 1. System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         External Systems                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   GitHub    │  │   CI/CD     │  │    Test     │  │  Production │  │
│  │ Repositories│  │  Pipelines  │  │  Frameworks │  │  Systems    │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
         │                   │                 │                 │
         └───────────────────┴─────────────────┴─────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │    19 QE Agents (Active)        │
                    │  ┌────┐ ┌────┐ ┌────┐ ┌────┐  │
                    │  │Test│ │Cov │ │Flky│ │Perf│  │
                    │  │Gen │ │Anlz│ │Hunt│ │Test│  │
                    │  └────┘ └────┘ └────┘ └────┘  │
                    │        ... 15 more ...          │
                    └─────────────────────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │   Nightly-Learner System        │
                    │  ╔════════════════════════════╗ │
                    │  ║  Sleep Scheduler           ║ │
                    │  ║  Dream Engine              ║ │
                    │  ║  Knowledge Transfer        ║ │
                    │  ║  Validation Framework      ║ │
                    │  ╚════════════════════════════╝ │
                    └─────────────────────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │     Persistence Layer           │
                    │  ┌──────────┐  ┌──────────┐    │
                    │  │ AgentDB  │  │ RuVector │    │
                    │  │ (SQLite) │  │(Postgres)│    │
                    │  └──────────┘  └──────────┘    │
                    └─────────────────────────────────┘
```

---

## 2. Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Nightly-Learner System                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Sleep Scheduler                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │ Idle         │  │ Cycle        │  │ Wake         │          │   │
│  │  │ Detector     │─▶│ Manager      │─▶│ Controller   │          │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                            │                                             │
│  ┌─────────────────────────▼─────────────────────────────────────┐     │
│  │                     Dream Engine                               │     │
│  │  ┌────────────────────────────────────────────────────────┐   │     │
│  │  │              Neural Substrate                          │   │     │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │     │
│  │  │  │Concept  │  │Concept  │  │Concept  │  │Concept  │  │   │     │
│  │  │  │Node 1   │──│Node 2   │──│Node 3   │──│Node N   │  │   │     │
│  │  │  │(Pattern)│  │(Bug)    │  │(Fix)    │  │(Tool)   │  │   │     │
│  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │     │
│  │  └────────────────────────────────────────────────────────┘   │     │
│  │                            │                                   │     │
│  │  ┌─────────────────────────▼─────────────────────────────┐   │     │
│  │  │           Sleep Cycle Processor                        │   │     │
│  │  │                                                         │   │     │
│  │  │  N1 (5m)  ──▶  N2 (10m)  ──▶  N3 (15m)  ──▶  REM (20m)│   │     │
│  │  │  Prepare      Experience     Pattern       Novel      │   │     │
│  │  │               Replay         Consolidate   Associate  │   │     │
│  │  │                                                         │   │     │
│  │  └─────────────────────────────────────────────────────────┘   │     │
│  │                            │                                   │     │
│  │  ┌─────────────────────────▼─────────────────────────────┐   │     │
│  │  │           Insight Extractor                            │   │     │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │   │     │
│  │  │  │Novel Pattern │  │Validate      │  │Store       │  │   │     │
│  │  │  │Detector      │─▶│Usefulness    │─▶│ReasoningBnk│  │   │     │
│  │  │  └──────────────┘  └──────────────┘  └────────────┘  │   │     │
│  │  └─────────────────────────────────────────────────────────┘   │     │
│  └─────────────────────────────────────────────────────────────────┘   │
│                            │                                             │
│  ┌─────────────────────────▼─────────────────────────────────────┐     │
│  │                Knowledge Transfer System                       │     │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │     │
│  │  │Transfer       │  │Pattern        │  │Collective     │    │     │
│  │  │Protocol       │  │Adapter        │  │Dreamer        │    │     │
│  │  └───────────────┘  └───────────────┘  └───────────────┘    │     │
│  │         │                   │                   │             │     │
│  │         └───────────────────┴───────────────────┘             │     │
│  │                            │                                  │     │
│  │  ┌─────────────────────────▼─────────────────────────────┐  │     │
│  │  │         RuVector Graph Communication Layer            │  │     │
│  │  └───────────────────────────────────────────────────────┘  │     │
│  └─────────────────────────────────────────────────────────────────┘   │
│                            │                                             │
│  ┌─────────────────────────▼─────────────────────────────────────┐     │
│  │                Validation Framework                            │     │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │     │
│  │  │Test Generator │  │Safe Sandbox   │  │Feedback       │    │     │
│  │  │               │─▶│Executor       │─▶│Collector      │    │     │
│  │  └───────────────┘  └───────────────┘  └───────────────┘    │     │
│  └─────────────────────────────────────────────────────────────────┘   │
│                            │                                             │
│  ┌─────────────────────────▼─────────────────────────────────────┐     │
│  │                Metrics & Observability                         │     │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │     │
│  │  │Metrics        │  │Dashboard      │  │Analytics      │    │     │
│  │  │Collector      │─▶│(Grafana)      │  │Engine         │    │     │
│  │  └───────────────┘  └───────────────┘  └───────────────┘    │     │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                  │
         ┌──────────▼──────────┐          ┌──────────▼──────────┐
         │   AgentDB (Local)   │          │  RuVector (Distrib) │
         │  ┌───────────────┐  │          │  ┌───────────────┐ │
         │  │ Trajectories  │  │          │  │ HNSW Index    │ │
         │  │ Experiences   │  │          │  │ GNN Layer     │ │
         │  │ Sleep Sessions│  │          │  │ Cypher Engine │ │
         │  │ ReasoningBank │  │          │  │ SONA Learning │ │
         │  └───────────────┘  │          │  └───────────────┘ │
         └─────────────────────┘          └─────────────────────┘
```

---

## 3. Sleep Cycle State Machine

```
                    ┌──────────────┐
                    │    ACTIVE    │
                    │              │
                    └──────┬───────┘
                           │
                    detect idle (>10m, CPU<20%)
                           │
                           ▼
                    ┌──────────────┐
                    │     IDLE     │
                    │              │
                    └──────┬───────┘
                           │
                  scheduler triggers
                           │
                           ▼
                    ┌──────────────┐
               ┌────│  N1 (Light)  │────┐
               │    │   Duration:  │    │
               │    │     5 min    │    │ new task arrives
               │    └──────┬───────┘    │
               │           │            │
               │      timer expires     │
               │           │            │
               │           ▼            │
               │    ┌──────────────┐   │
               │    │  N2 (Memory) │   │
               │    │  Duration:   │   │
               │    │    10 min    │   │
               │    │              │   │
               │    │ • Replay 100+│   │
               │    │   experiences│   │
               │    └──────┬───────┘   │
               │           │            │
               │      timer expires     │
               │           │            │
               │           ▼            │
               │    ┌──────────────┐   │
               │    │  N3 (Deep)   │   │
               │    │  Duration:   │   │
               │    │    15 min    │   │
               │    │              │   │
               │    │ • Consolidate│   │
               │    │   patterns   │   │
               │    └──────┬───────┘   │
               │           │            │
               │      timer expires     │
               │           │            │
               │           ▼            │
               │    ┌──────────────┐   │
               │    │  REM (Dream) │   │
               │    │  Duration:   │   │
               │    │    20 min    │   │
               │    │              │   │
               │    │ • Reduce     │   │
               │    │   inhibition │   │
               │    │ • Novel      │   │
               │    │   associations   │
               │    │ • Extract    │   │
               │    │   insights   │   │
               │    └──────┬───────┘   │
               │           │            │
               │      cycle completes   │
               │           │            │
               │           ▼            │
               │    ┌──────────────┐   │
               └───▶│    WAKING    │◀──┘
                    │              │
                    │ • Apply      │
                    │   insights   │
                    │ • Update     │
                    │   capabilities
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │    ACTIVE    │
                    │  (Enhanced)  │
                    └──────────────┘
```

---

## 4. Cross-Agent Knowledge Transfer Flow

```
Agent A (qe-test-generator)          Agent B (qe-coverage-analyzer)
┌──────────────────────┐             ┌──────────────────────┐
│   REM Dream Cycle    │             │   N2 Memory Phase    │
│                      │             │                      │
│ Discovers Pattern:   │             │ Needs Strategy:      │
│ "Boundary value      │             │ "How to maximize     │
│  testing improves    │             │  coverage with       │
│  coverage by 18%"    │             │  fewer tests?"       │
└──────────┬───────────┘             └──────────┬───────────┘
           │                                    │
           │ 1. Pattern Validated               │
           │    Confidence: 0.87                │
           ▼                                    │
    ┌─────────────┐                             │
    │ReasoningBank│                             │
    │Store Pattern│                             │
    └──────┬──────┘                             │
           │                                    │
           │ 2. Embed & Index                   │
           ▼                                    │
    ┌─────────────────────────────────────┐    │
    │         RuVector System             │    │
    │  ┌──────────────────────────────┐   │    │
    │  │ HNSW Index                   │   │    │
    │  │ Store vector embedding       │   │    │
    │  └──────────────────────────────┘   │    │
    │  ┌──────────────────────────────┐   │    │
    │  │ Graph Database               │   │    │
    │  │ agent_a →[DISCOVERED]→ pattern   │    │
    │  │ pattern →[RELEVANT_TO]→ agent_b  │    │
    │  └──────────────────────────────┘   │    │
    │  ┌──────────────────────────────┐   │    │
    │  │ GNN Layer                    │   │◀───┘
    │  │ Calculate relevance: 0.92    │   │ 3. Query for
    │  │ (very relevant to agent_b)   │   │    relevant patterns
    │  └──────────────────────────────┘   │
    └───────────────┬─────────────────────┘
                    │
                    │ 4. Transfer with metadata
                    ▼
         ┌────────────────────────┐
         │  Knowledge Transfer    │
         │  Protocol              │
         │                        │
         │ • Check compatibility  │
         │ • Adapt to context     │
         │ • Validate safety      │
         └────────┬───────────────┘
                  │
                  │ 5. Adapted pattern
                  ▼
Agent B (qe-coverage-analyzer)
┌──────────────────────┐
│  Receive & Integrate │
│                      │
│ • Test in sandbox    │
│ • Measure improvement│
│ • Provide feedback   │
└──────────┬───────────┘
           │
           │ 6. Feedback loop
           ▼
    ┌─────────────┐
    │  GNN Layer  │
    │  Update     │
    │  Weights    │
    │             │
    │ pattern→B   │
    │ weight ↑    │
    └─────────────┘

Result: Agent B now uses boundary value testing strategy
        Coverage improved by 15% (adapted from A's 18%)
        Pattern confidence increased: 0.87 → 0.91
```

---

## 5. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Daily Operations                             │
│                                                                   │
│  QE Agent executes tasks:                                        │
│  • Generates tests                                               │
│  • Analyzes coverage                                             │
│  • Detects bugs                                                  │
│  • Runs performance tests                                        │
│  • etc.                                                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ All actions logged
                            ▼
                    ┌───────────────┐
                    │  AgentDB      │
                    │  Experience   │
                    │  Capture      │
                    └───────┬───────┘
                            │
      ┌─────────────────────┴─────────────────────┐
      │                                            │
      │ Store locally                              │ Embed & sync
      ▼                                            ▼
┌─────────────┐                            ┌─────────────┐
│  AgentDB    │                            │  RuVector   │
│  (SQLite)   │                            │ (Postgres)  │
│             │                            │             │
│ • Trajectory│                            │ • Vectors   │
│ • Metadata  │                            │ • Graph     │
└─────────────┘                            └─────────────┘
      │                                            │
      │                                            │
      │              Agent becomes idle            │
      │                                            │
      └─────────────────────┬────────────────────-─┘
                            │
                            ▼
                    ┌───────────────┐
                    │Sleep Scheduler│
                    │Detects Idle   │
                    │Triggers Sleep │
                    └───────┬───────┘
                            │
            ┌───────────────┴───────────────┐
            │                                │
            │ N2: Pull experiences           │ REM: Query similar patterns
            ▼                                ▼
      ┌─────────────┐                ┌─────────────┐
      │  AgentDB    │                │  RuVector   │
      │  Recent     │                │  Pattern    │
      │  Experiences│                │  Database   │
      └─────┬───────┘                └─────┬───────┘
            │                                │
            │                                │
            └───────────────┬────────────────┘
                            │
                            │ Feed into dream engine
                            ▼
                    ┌───────────────┐
                    │ Dream Engine  │
                    │               │
                    │ Neural        │
                    │ Substrate     │
                    │               │
                    │ • Load concepts
                    │ • Activate    │
                    │ • Associate   │
                    │ • Extract     │
                    └───────┬───────┘
                            │
                            │ Novel insights
                            ▼
                    ┌───────────────┐
                    │ Validation    │
                    │ Framework     │
                    │               │
                    │ • Test insight│
                    │ • Measure     │
                    │ • Validate    │
                    └───────┬───────┘
                            │
                ┌───────────┴───────────┐
                │                       │
                │ Store if valid        │ Update GNN
                ▼                       ▼
        ┌───────────────┐       ┌───────────────┐
        │ ReasoningBank │       │ RuVector GNN  │
        │               │       │               │
        │ • Patterns    │       │ • Weights     │
        │ • Verdicts    │       │ • Relevance   │
        │ • Meta-info   │       │ • Feedback    │
        └───────┬───────┘       └───────┬───────┘
                │                       │
                │                       │
                │ Broadcast to swarm    │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  All QE Agents        │
                │  Receive & Adapt      │
                │                       │
                │  Next day, agents     │
                │  use improved         │
                │  strategies           │
                └───────────────────────┘
```

---

## 6. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Development Environment                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Developer Machine                                               │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  agentic-qe/ (project root)                            │     │
│  │  ├── src/nightly-learner/    ← Implementation         │     │
│  │  ├── tests/                   ← Test suites           │     │
│  │  └── .agentic-qe/                                      │     │
│  │      └── memory.db            ← AgentDB (SQLite)      │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Docker Container (RuVector)                                     │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  ruvector-postgres:latest                              │     │
│  │  • Port: 5432                                          │     │
│  │  • Volume: ruvector_data                               │     │
│  │  • Memory: 2GB                                         │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Production Environment                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Kubernetes Cluster                                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Namespace: agentic-qe-production                       │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │  QE Agent Pods (19 pods)                           │ │    │
│  │  │  • Replica: 1 per agent type                       │ │    │
│  │  │  • Memory: 2GB per pod                             │ │    │
│  │  │  • CPU: 1 core per pod                             │ │    │
│  │  │  • Volume: AgentDB PVC (20GB)                      │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │  Nightly-Learner Service                           │ │    │
│  │  │  • Replica: 1 (singleton)                          │ │    │
│  │  │  • Memory: 4GB                                     │ │    │
│  │  │  • CPU: 2 cores                                    │ │    │
│  │  │  • Cron: Sleep scheduler                           │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │  RuVector StatefulSet                              │ │    │
│  │  │  • Replica: 3 (HA)                                 │ │    │
│  │  │  • Memory: 8GB per replica                         │ │    │
│  │  │  • CPU: 4 cores per replica                        │ │    │
│  │  │  • Volume: PVC (100GB SSD)                         │ │    │
│  │  │  • Service: LoadBalancer (internal)                │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │  Metrics Stack                                     │ │    │
│  │  │  • Prometheus (metrics collection)                 │ │    │
│  │  │  • Grafana (dashboards)                            │ │    │
│  │  │  • Alertmanager (alerts)                           │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Security Boundaries                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Agent Execution Environment (Sandboxed)               │     │
│  │  ┌──────────────────────────────────────────────────┐  │     │
│  │  │  QE Agents (Untrusted Code Execution)            │  │     │
│  │  │  • Memory limits enforced                        │  │     │
│  │  │  • CPU limits enforced                           │  │     │
│  │  │  • Network access restricted                     │  │     │
│  │  │  • File system isolated                          │  │     │
│  │  └──────────────────────────────────────────────────┘  │     │
│  └────────────────┬───────────────────────────────────────┘     │
│                   │                                              │
│                   │ API calls only                               │
│                   ▼                                              │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Dream Engine (Trusted Core)                          │     │
│  │  ┌──────────────────────────────────────────────────┐ │     │
│  │  │  • Validates all inputs                          │ │     │
│  │  │  • Sanitizes patterns before storage             │ │     │
│  │  │  • Rate limits pattern creation                  │ │     │
│  │  │  • Authentication required for API               │ │     │
│  │  └──────────────────────────────────────────────────┘ │     │
│  └────────────────┬───────────────────────────────────────┘     │
│                   │                                              │
│                   │ Encrypted connection                         │
│                   ▼                                              │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  RuVector Database (Data Layer)                       │     │
│  │  ┌──────────────────────────────────────────────────┐ │     │
│  │  │  • TLS encryption in transit                     │ │     │
│  │  │  • At-rest encryption                            │ │     │
│  │  │  • Role-based access control                     │ │     │
│  │  │  • Audit logging enabled                         │ │     │
│  │  │  • Backup encryption                             │ │     │
│  │  └──────────────────────────────────────────────────┘ │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Security Controls:                                              │
│  • Pattern validation before execution                           │
│  • Sandbox for testing new patterns                              │
│  • Rollback mechanism for bad patterns                           │
│  • Monitoring for anomalous behavior                             │
│  • Rate limiting on pattern creation                             │
│  • Authentication & authorization                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Monitoring & Observability

```
┌─────────────────────────────────────────────────────────────────┐
│                    Metrics Collection                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ QE Agents    │  │Dream Engine  │  │ RuVector     │          │
│  │ (19 sources) │  │ (metrics)    │  │ (DB metrics) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                    │
│         │ Prometheus      │                 │                    │
│         │ exporters       │                 │                    │
│         └─────────────────┴─────────────────┘                    │
│                           │                                      │
│                           ▼                                      │
│                  ┌─────────────────┐                             │
│                  │  Prometheus     │                             │
│                  │  Server         │                             │
│                  │  • Scrape 15s   │                             │
│                  │  • Retention 90d│                             │
│                  └────────┬────────┘                             │
│                           │                                      │
│         ┌─────────────────┴─────────────────┐                    │
│         │                                    │                    │
│         ▼                                    ▼                    │
│  ┌──────────────┐                   ┌──────────────┐            │
│  │  Grafana     │                   │ Alertmanager │            │
│  │  Dashboards  │                   │              │            │
│  │              │                   │ • PagerDuty  │            │
│  │ • Executive  │                   │ • Slack      │            │
│  │ • Agent      │                   │ • Email      │            │
│  │ • Dream      │                   └──────────────┘            │
│  │ • System     │                                                │
│  └──────────────┘                                                │
│                                                                   │
│  Key Metrics:                                                    │
│  • nightly_learner_patterns_discovered_total                     │
│  • nightly_learner_insight_quality_score                         │
│  • nightly_learner_knowledge_transfer_success_rate               │
│  • nightly_learner_sleep_cycle_duration_seconds                  │
│  • nightly_learner_ruvector_query_latency_seconds                │
│  • nightly_learner_agent_improvement_percentage                  │
│  • nightly_learner_dream_insights_per_cycle                      │
│  • nightly_learner_validation_failure_total                      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Failure & Recovery Scenarios

### Scenario 1: RuVector Unavailable
```
Agent Sleeping
     │
     ▼
Dream Engine attempts RuVector query
     │
     ▼
Connection timeout (5s)
     │
     ├─→ Log error
     ├─→ Increment failure metric
     └─→ Fallback to AgentDB-only mode
         │
         ▼
     Continue sleep cycle with degraded features:
     • Use local AgentDB patterns only
     • Skip cross-agent knowledge transfer
     • Skip GNN-based pattern evolution
     • Continue local learning
         │
         ▼
     Wake agent with local insights
         │
         ▼
     Background: Retry RuVector connection every 60s
         │
         ▼
     When reconnected: Sync buffered patterns
```

### Scenario 2: Dream Cycle Interrupted
```
Agent in REM phase (12 minutes in)
     │
     ▼
High-priority task arrives
     │
     ├─→ Save current neural state
     ├─→ Checkpoint: concepts activated, associations found
     └─→ Wake agent immediately
         │
         ▼
     Agent handles urgent task
         │
         ▼
     Task completes (30 minutes later)
         │
         ▼
     Agent becomes idle again
         │
         ▼
     Resume sleep cycle from checkpoint:
     • Skip N1, N2, N3 (already completed)
     • Resume REM from saved state
     • Complete remaining 8 minutes
     • Extract insights normally
```

### Scenario 3: Bad Pattern Detected
```
Pattern extracted from dream
     │
     ▼
Validation framework tests pattern
     │
     ▼
Test fails OR performance degrades
     │
     ├─→ Mark pattern as rejected
     ├─→ Update confidence: 0.85 → 0.20
     ├─→ Alert to monitoring
     └─→ Rollback if already deployed
         │
         ▼
     Feedback to GNN layer
         │
         ▼
     Adjust weights to prevent similar patterns
         │
         ▼
     Optional: Human review of rejected pattern
```

---

## Summary

These architecture diagrams provide multiple views of the nightly-learner system:

1. **System Context**: How it fits in the broader QE ecosystem
2. **Component Architecture**: Internal structure and responsibilities
3. **State Machine**: Sleep cycle progression and transitions
4. **Knowledge Transfer**: Cross-agent learning mechanics
5. **Data Flow**: How information moves through the system
6. **Deployment**: Development vs production environments
7. **Security**: Boundaries and controls
8. **Monitoring**: Observability and metrics
9. **Failure Scenarios**: Resilience and recovery patterns

Use these diagrams during implementation to ensure all teams have a shared understanding of the system architecture.

---

**Document Version**: 1.0
**Last Updated**: 2025-12-10
**Status**: Reference Architecture
**Related**: nightly-learner-implementation-plan.md
