# Agentic QE v3 Framework — Technical & Architectural Glossary

## Core Architectural Patterns

**DDD (Domain-Driven Design)** — The framework is structured around 12 bounded contexts (test-generation, test-execution, coverage-analysis, quality-assessment, defect-intelligence, requirements-validation, code-intelligence, security-compliance, contract-testing, visual-accessibility, chaos-resilience, learning-optimization). Each domain owns its agents, events, and data. Prevents cross-domain coupling so teams can evolve domains independently. (ADR-001)

**ADR (Architecture Decision Records)** — 57 formal design decisions (ADR-001 through ADR-057 + MADR-001) that document *why* each architectural choice was made. Each ADR includes context, decision, consequences, and status. They serve as the institutional memory of the framework's evolution.

**QCSD (Quality Criteria Shift-Left Delivery)** — The 4-phase swarm model that structures quality across the entire SDLC: Ideation (planning) → Refinement (story prep) → Development (coding) → CI/CD Verification (release). Each phase produces a binary-style decision (GO/NO-GO, READY/NOT-READY, SHIP/HOLD, RELEASE/BLOCK) with cross-phase signal propagation.

**SPARC (Specification, Pseudocode, Architecture, Refinement, Completion)** — A methodology for structured agent work. Breaks complex tasks into 5 phases so agents don't skip steps. The `sparc-orchestrator` agent coordinates this cycle.

**PACT (Proactive, Autonomous, Collaborative, Targeted)** — The foundational principles of Agentic QE. Agents are proactive (find problems before asked), autonomous (self-coordinate), collaborative (share knowledge), and targeted (focus on highest-risk areas).

---

## Testing Frameworks & Methodologies

**HTSM (Holistic Testing Strategy Mapping) v6.3** — James Bach's framework for comprehensive test strategy. Evaluates 6 quality dimensions: Coverage, Reliability, Performance, Security, Accessibility, Maintainability. Used by the Ideation swarm during PI/Sprint planning.

**SFDIPOT (Scope, Feasibility, Dependencies, Integration, Performance, Operations, Testability)** — Product factors analysis model used during Refinement. The `qe-product-factors-assessor` agent evaluates each dimension to determine story readiness.

**London/Chicago TDD** — Two schools of Test-Driven Development. London (mockist) isolates units with mocks for fast feedback. Chicago (classicist) tests real collaborators for integration confidence. The `qe-tdd-specialist` supports both.

**Mutation Testing** — Injects small code changes (mutants) into production code and checks if tests catch them. A mutant that survives means the test suite has a gap. Measures test *quality*, not just coverage.

**Chaos Engineering** — Controlled fault injection in production-like environments to validate resilience. Tests what happens when services fail, networks partition, or resources exhaust.

---

## Algorithms & Data Structures

**HNSW (Hierarchical Navigable Small World)** — O(log n) approximate nearest-neighbour vector search algorithm. Powers semantic search across patterns, test cases, and code embeddings. Replaces brute-force O(n) scanning for coverage gap detection. (ADR-003)

**MinCut** — Graph theory algorithm that finds the minimum number of edges whose removal disconnects a graph. Used by the Strange Loop self-awareness system to detect bottlenecks and single points of failure in the agent swarm. Runs in ~30μs. (ADR-047)

**TinyDancer** — The lightweight intelligent model router (TD-003, ADR-026). Classifies task complexity and routes to the optimal Claude model tier: Haiku for simple tasks, Sonnet for medium, Opus for complex. Uses confidence scoring — if uncertain, triggers multi-model verification or human review. Named for making "efficient, graceful routing decisions."

**PageRank** — Google's link analysis algorithm adapted for code importance ranking. Identifies which modules/functions have the highest "influence" in the codebase to prioritise testing effort.

**Floyd-Warshall** — All-pairs shortest path algorithm used in causal discovery to trace root cause chains across service dependencies.

**Tarjan's Algorithm** — Detects strongly connected components (circular dependencies) in dependency graphs. Used by `qe-dependency-mapper`.

**CRDT (Conflict-free Replicated Data Types)** — Data structures that allow concurrent updates from multiple agents without coordination locks. Ensures eventual consistency across distributed swarm state.

---

## Neural & ML Architectures

**ReasoningBank** — Pattern storage and retrieval system with transformer embeddings. Stores successful QE patterns (test strategies, defect fixes, routing decisions) indexed for semantic search. Achieves 114k records/sec throughput. Enables experience replay and cross-agent knowledge transfer. (ADR-021)

**RuVector** — The primary neural backbone combining Q-Learning persistence, SONA self-optimisation, and hypergraph code intelligence. Provides AST-level code understanding with vector embeddings. (ADR-017, ADR-050)

**SONA (Self-Optimizing Neural Architecture)** — LoRA-style fine-tuning with EWC++ memory preservation. Agents improve over time without catastrophic forgetting of previous patterns.

**EWC++ (Elastic Weight Consolidation)** — Prevents catastrophic forgetting when neural models learn new tasks. Protects important weights from being overwritten, so agents retain old patterns while learning new ones.

**Flash Attention** — Memory-efficient attention mechanism that reduces the O(n²) cost of standard attention to near-linear. Used for processing large codebases without running out of context. Target: 2.49x–7.47x speedup. (ADR-051)

**GNN (Graph Neural Networks)** — Neural networks that operate on graph-structured data. Used for code embedding — understands relationships between functions, classes, and modules rather than treating code as flat text.

**Q-Learning Router** — Reinforcement learning for agent routing. Maintains Q-value tables that learn which agent types succeed on which task types. Converges to optimal routing without explicit programming. (ADR-022)

**GOAP (Goal-Oriented Action Planning)** — Gaming AI technique adapted for QE. Given a goal state (e.g., "coverage > 80%"), discovers action sequences to achieve it by searching through available operations. 52 available actions in the v3 planner. (ADR-046)

---

## Coherence & Formal Verification (Prime Radiant)

**Prime Radiant** — The mathematical coherence engine suite with 6 WASM-accelerated engines:

1. **Sheaf Cohomology** — Detects contradictions across agent belief spaces. If agent A says "test passes" and agent B says "test fails", sheaf analysis finds the inconsistent patch.

2. **Spectral Analysis** — Eigenvalue decomposition of the agent Laplacian matrix. Predicts state-space collapse (when the swarm is about to lose coherence) before it happens.

3. **Causal Inference** — Distinguishes correlation from causation. When test failures spike alongside a deploy, determines whether the deploy *caused* the failures or if it's coincidental.

4. **Category Theory** — Verifies type-safe mappings between domains. Functors and natural transformations ensure domain operations compose correctly.

5. **Homotopy Type Theory** — Formal verification of pipeline correctness. Proves that two pipeline paths produce equivalent results (path equality).

6. **Witness/Audit Engine** — Records every decision with a cryptographic witness for deterministic replay and debugging.

**Lambda (λ) Coherence** — The unified coherence signal derived from MinCut analysis. Drives the 4-tier compute allocation: Reflex (<1ms, low energy), Retrieval (~10ms, cached patterns), Escalate (full reasoning), Human (manual override). (ADR-030)

---

## Self-Organising & Biological Patterns

**Strange Loop** — Self-awareness pattern where the swarm observes itself, builds a self-model, detects anomalies, and heals — an Observe→Model→Decide→Act cycle. Enables self-healing without human intervention. Response time ~12s. (ADR-031)

**Time Crystal Scheduling (Kuramoto CPG)** — Borrowed from coupled oscillator physics. Agents self-organise into test phases (Unit→Integration→E2E→Performance) without a central scheduler. Winner-take-all dynamics determine which phase is active. (ADR-032)

**Morphogenetic Networks** — Pattern formation without centralised control, inspired by biological development. Agents form structure through local interactions only, enabling scalability to arbitrary swarm sizes.

**Early Exit Testing** — Lambda-stability detection lets the system skip remaining analysis when confidence is already high. Saves 30–50% compute on high-confidence runs. (ADR-033)

**STDP (Spike-Timing Dependent Plasticity)** — Biological learning rule adapted for causal discovery. If event A consistently precedes event B, the causal link A→B is strengthened. Used for root cause analysis. (ADR-035)

---

## Infrastructure & Self-Healing

**Infrastructure Self-Healing (ADR-057)** — Extends Strange Loop to infrastructure. Components:
- **TestOutputObserver** — Parses stderr for infrastructure error signatures (SAP RFC, Salesforce, payment gateway, etc.)
- **RecoveryPlaybook** — YAML definitions of per-service health checks, recovery commands, and verification steps
- **InfraActionExecutor** — Health check → recover → exponential backoff → verify cycle
- **34+ built-in signatures** — Pre-configured patterns for common infrastructure failures

**AgentDB** — The unified persistence layer replacing 6+ separate memory systems. SQLite backend with HNSW vector index, achieving 150x–12,500x search improvement over brute force. (ADR-009, ADR-038)

---

## Communication & Protocols

**A2A (Agent-to-Agent Protocol)** — JSON-RPC 2.0 based protocol for inter-agent communication. 68 agents publish Agent Cards describing their capabilities. Discovery endpoint for dynamic agent lookup. (ADR-054)

**AG-UI (Agent-to-UI Protocol)** — SSE-based real-time event streaming with 19 event types. 100ms P95 latency for live UI updates during swarm execution. (ADR-053)

**QUIC Swarm** — Low-latency multiplexed transport for agent coordination. Target <10ms inter-agent latency with built-in congestion control. (ADR-051)

**7 Coordination Protocols** — Morning-Sync, Quality-Gate, Regression-Prevention, Coverage-Driven, TDD-Cycle, Security-Audit, Learning-Consolidation. Each defines a cross-domain event choreography. (ADR-002)

**MCP (Model Context Protocol)** — The tool interface that exposes 100+ QE operations as callable functions. Agents and external tools interact with the framework through MCP endpoints. (ADR-010)

---

## Routing & Cost Optimisation

**3-Tier Model Routing (ADR-026)** — Tasks are classified by complexity and routed to the cheapest capable model:
- **Tier 1 — Agent Booster** (<1ms, $0): Rust/WASM mechanical transforms (var→const, add-types, remove-console). 352x faster than LLM calls.
- **Tier 2 — Haiku** (~500ms): Simple bug fixes, low complexity tasks.
- **Tier 3 — Sonnet/Opus** (2–5s): Architecture, security, complex reasoning.

Result: 87% cost reduction via multi-model routing. (ADR-051)

---

## Security

**Zero-Trust Architecture** — Every agent interaction is verified. No implicit trust between agents.

**Claims-Based Authorization (ADR-010)** — Fine-grained access control across swarm agents and MCP tools.

**OAuth2.1 + Rate Limiting (ADR-012)** — MCP security layer preventing abuse and ensuring authenticated access.

**OSV Client (ADR-013)** — Automated CVE scanning against the Open Source Vulnerability database.

---

## Skill Validation

**Deterministic Skill Validation (ADR-056)** — 5-tier trust system for skills:
- **Tier 0**: Advisory (SKILL.md only)
- **Tier 1**: Structured (+ JSON Schema)
- **Tier 2**: Validated (+ executable validator)
- **Tier 3**: Verified (+ 5+ evaluation cases) — **46 skills at this tier**
- **Tier 4**: Certified (cross-model validation, 95%+ pass rate)

---

## Key Performance Numbers

| Metric | Value |
|---|---|
| ADRs implemented | 54 |
| DDD bounded contexts | 12 |
| QE agents | 47+ |
| Invocable skills | 46 (Tier 3) |
| ReasoningBank throughput | 114k records/sec |
| Agent routing P95 latency | 62ms |
| MinCut calculation | ~30μs |
| Coverage gap detection | <100ms on 500 files |
| Self-healing response | ~12s |
| Strange Loop cycle | ~45ms |
| Coherence engines | 6 (WASM-accelerated) |
| Infrastructure signatures | 34+ built-in |
