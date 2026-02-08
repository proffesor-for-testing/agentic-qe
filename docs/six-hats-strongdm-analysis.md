# Six Thinking Hats Analysis: StrongDM Software Factory Suggestions for AQE

**Date:** 2026-02-08
**Subject:** Evaluating 5 actionable suggestions from StrongDM's Software Factory / Attractor for adoption into Agentic QE
**Sources:** [Simon Willison's blog post](https://simonwillison.net/2026/Feb/7/software-factory/), [factory.strongdm.ai](https://factory.strongdm.ai/), [github.com/strongdm/attractor](https://github.com/strongdm/attractor)
**Method:** Edward de Bono's Six Thinking Hats (parallel thinking framework)

---

## Background

StrongDM operates a "dark factory" — production software built entirely by AI coding agents with **zero human code review**. Their key innovations:

- **Attractor**: DOT-graph pipeline orchestrator defining multi-stage agent workflows as DAGs
- **Holdout scenario testing**: ML-style train/test splits for code validation
- **Digital Twin Universe**: Behavioral clones of third-party services for testing at scale
- **Explicit context fidelity**: Controlling how much prior context flows between agent stages
- **Provider-aligned toolsets**: Native tool formats per LLM provider

Five suggestions were extracted for potential AQE adoption:

| # | Suggestion | Description |
|---|-----------|-------------|
| 1 | Scenario Holdout Testing | Separate "exam" from "study" test suites (ML train/test split) |
| 2 | Context Fidelity Controls | Add `fidelity: "full" \| "compact" \| "summary"` to agent spawning |
| 3 | Loop Detection | Track tool call signatures, inject steering when patterns repeat |
| 4 | Goal Gates | Mark critical pipeline nodes that must succeed before completion |
| 5 | $1000/day Token Budget | Economic framing benchmark for agentic development |

---

## White Hat — Facts & Data

### Current AQE Infrastructure vs. Suggestions

| Suggestion | Existing Infrastructure | Gap Level |
|-----------|------------------------|-----------|
| Scenario Holdout Testing | Eval YAML files exist in skills; 253 "scenario" references; NO automated train/test split | **Large Gap** |
| Context Fidelity Controls | 3 fidelity references in codebase; no `fidelity` field in `QueenTask` interface; generic `Record<string, unknown>` payload | **Large Gap** |
| Loop Detection | 30+ files with loop/drift detection; ADR-031 (Strange Loop Self-Awareness); ADR-060 (Semantic Anti-Drift); infra-healing system | **Small Gap** |
| Goal Gates | 69+ files; ADR-030 (Coherence Gated Quality Gates); ADR-052 (Coherence-Gated QE); quality-assessment domain; mathematical coherence verification | **Small Gap** |
| $1000/day Token Budget | 3 dedicated modules (2,055 LOC); ADR-042 (Token Tracking); 106 models priced across 7 providers; per-tier budget enforcement; -25% token reduction target | **No Gap** |

### Project Baseline

| Metric | Value |
|--------|-------|
| Project version | 3.5.5 |
| TypeScript files | 5,424+ |
| Test files | 1,633+ (v2: 897, v3: 736) |
| QE agents | 64 files, 47 documented |
| Skills | 119 total, 86 AQE-specific |
| Bounded contexts | 12 (DDD architecture) |
| ADRs | 50+ |
| Max concurrent agents | 15 |
| Token tracking code | 2,055 lines across 3 modules |
| Model pricing coverage | 106 models, 7 providers |

### Key Finding

**3 of 5 suggestions already have substantial infrastructure in AQE.** Loop detection, goal gates, and token budgeting are partially or fully implemented. The real gaps are scenario holdout testing and context fidelity controls.

---

## Red Hat — Gut Feelings

### Per-Suggestion Intuition

| Suggestion | Excitement | Gut Verdict | Hunch |
|-----------|-----------|-------------|-------|
| Scenario Holdout Testing | Very High | "Yes, absolutely" — feels like a missing puzzle piece | Moderate-to-high impact, obvious in hindsight |
| Context Fidelity Controls | Moderate | "Maybe" — practical but unsexy, like buying insurance | Low immediate, high long-term utility |
| Loop Detection | High | "Yes, absolutely" — difference between demo and production | High impact but harder than it sounds |
| Goal Gates | Low-Moderate | "Not for us right now" — feels bureaucratic for an npm package | Low impact for current use case |
| $1000/day Token Budget | Extremely High | "Yes, but the mindset not the number" — reframes everything | Highest potential, easiest to misapply |

### Overall Emotional Read

- **Most exciting:** Scenario Holdout Testing + Loop Detection — these feel like craftsmanship
- **Most dangerous:** The $1000/day framing — seductive but could over-index on cost vs. quality
- **Biggest trap:** Goal Gates — smells like premature enterprise optimization
- **Overall:** Feels like validation, not copying. StrongDM proves this direction works at scale.

### The Tension

The "dark factory" concept feels aspirational but philosophically uneasy for QE. Quality Engineering requires trust and verification — removing human review entirely is the logical endpoint but also the most uncomfortable one. These suggestions push AQE toward "autonomous QE engineer" territory, which is both exciting and sobering.

---

## Black Hat — Risks & Cautions

### Risk Summary

| Suggestion | Critical Risks | High Risks | Top Concern |
|-----------|---------------|------------|-------------|
| Scenario Holdout | 1 | 3 | Maintenance burden explosion — who writes holdout scenarios? |
| Context Fidelity | 3 | 2 | Information loss leading to wrong agent decisions |
| Loop Detection | 2 | 3 | False positives killing valid retries (especially infra-healing loops) |
| Goal Gates | 3 | 3 | Pipeline stalls with no human to unblock gates |
| Token Budget | 3 | 3 | Misleading StrongDM comparison (enterprise SaaS vs. npm package) |
| **Cross-cutting** | **2** | **3** | **Complexity creep in already-complex system** |

### Critical Cross-Cutting Risks

**1. Complexity Creep (Critical)**
AQE v3 already has 12 bounded contexts, 51 agents, 3-tier routing, HNSW vector search, GNN embeddings, consensus protocols, work stealing, and MinCut optimization. Adding 5 new concepts represents ~30% complexity increase.

**2. Context Mismatch (Critical)**
StrongDM is enterprise SaaS with $1M contracts and human oversight escape hatches. AQE is a free npm package for developers. Features designed for their economics and constraints may not translate.

**3. The Dark Factory Paradox (Critical)**
These suggestions assume distrust of agents (gates, budgets, loop detection) — but if you don't trust agents, why use agentic QE? Quality Engineering inherently requires human judgment about what matters.

**4. Integration Conflicts (High)**
The 5 suggestions can contradict each other:
- Fidelity controls + Loop detection: agent in loop — give MORE context or STOP it?
- Goal gates + Budget tracking: gate requires thorough testing, but budget says stop
- Holdout scenarios + Token budget: holdout tests consume budget without learning

**5. Philosophical Contradiction (High)**
Full automation of QE is the goal these suggestions pursue, but QE decisions ("Is this bug critical?", "Should we ship?") are fundamentally judgment calls. Agents can assist but automating judgment is an open problem.

---

## Yellow Hat — Benefits & Opportunities

### Impact Summary

| Suggestion | Impact Rating | Key Benefit | ROI Timeline |
|-----------|--------------|-------------|--------------|
| Scenario Holdout | **Transformative** | Scientific rigor — prevents agents from "teaching to the test" | 3 months |
| Context Fidelity | **High** | 3x token efficiency when combined with 3-tier routing | Immediate |
| Loop Detection | **High** | Prevents $10-100 token waste events, self-healing behavior | Immediate |
| Goal Gates | **High** | Pipeline reliability, clear definition of done | 2 weeks |
| Token Budget | **Transformative** | Compelling value prop: "$1000/day turns 1 engineer into 10" | Immediate |

### Synergy Map

The 5 suggestions reinforce each other when combined:

```
Holdout Testing ←→ Goal Gates
  (exam scenarios become quality gates)
      ↕                    ↕
Context Fidelity ←→ Token Budget
  (fidelity controls enable 3x budget efficiency)
      ↕                    ↕
Loop Detection ←→ Meta-Learning
  (loop patterns feed learning system)
```

### Competitive Advantages Created

| vs. Traditional QA Tools | vs. Other AI QE Tools | vs. Building In-House |
|--------------------------|----------------------|----------------------|
| Self-improving via holdout learning | ML-grade evaluation vs. "black box" claims | Proven patterns, immediate deployment |
| Self-healing via loop detection | Transparent token economics vs. opaque pricing | $1000/day operational vs. $500k+ build |
| Economically optimized via fidelity | Self-aware loop recovery vs. silent failures | 63 QE skills out-of-box vs. scratch |

### User Problems Solved

1. "How do I know agents won't break?" → Holdout tests provide statistical confidence
2. "Token costs are unpredictable" → Fidelity controls + budget framework
3. "Agents get stuck and waste tokens" → Loop detection with auto-steering
4. "How do I justify agentic QE to leadership?" → $1000/day economic framing
5. "Agents sometimes produce broken outputs" → Goal gates ensure checkpoints

---

## Green Hat — Creative Alternatives

### 80/20 "Lite" Versions (Ship in 1 Week)

| Suggestion | Lite Version | Effort |
|-----------|-------------|--------|
| Scenario Holdout | **"Friday Test Surprise"** — hide 10% of tests with `holdout: true` flag, run only in CI | 2 days |
| Context Fidelity | **"3-File Context Mode"** — pass only 3 most relevant files to spawned agents | 2 days |
| Loop Detection | **"3-Strike Warning"** — count repeated identical tool calls, inject warning after 3 | 1 day |
| Goal Gates | **"4 Golden Gates"** — tests pass, no TS errors, build succeeds, coverage stable | 3 days |
| Token Budget | **"Daily Token Dashboard"** — display tokens used today in terminal output | 2 days |

### Creative Twists

**1. Progressive Context Revelation (Fidelity)**
Instead of fixed levels, start agents with minimal context. When agent shows confusion (loops, repeated tool calls), auto-upgrade context level. Saves 80% tokens on simple tasks.

**2. Loop-as-Feature Detection**
Agent calling same tool 5+ times = capability gap, not stuck agent. Auto-spawn specialist agent for that subtask. Turn bugs into system evolution.

**3. Quality Ratchet (Goal Gates)**
Gates that automatically tighten based on historical performance. Week 1: 80% coverage gate. Week 5: auto-ratcheted to 85% because team consistently hit 90%. Never goes down.

**4. Dark Mutation Suite (Holdout)**
Combine holdout testing with mutation-testing skill. Hold back 20% of mutants as "exam mutants." Final release gate: must kill 90% of unseen mutants.

**5. Swarm-Generated Scenarios on Demand**
No static holdout suite. At release time, spawn `exploratory-testing-advanced` swarm to generate novel test scenarios in real-time. Tests are always fresh, can't be gamed.

### The Hidden 6th Suggestion: Close the Learning Loop

StrongDM implies but doesn't state: **a factory that learns from its own operation.** Every suggestion (1-5) should feed data back into AQE's learning system:

- Which fidelity levels worked best for which task types?
- Which loops led to breakthroughs vs. dead ends?
- Which gates catch real issues vs. false positives?
- Which token allocations maximize value?

AQE already has `learning-optimization` domain and `real-qe-reasoning-bank.ts`. The missing piece is unified metrics collection across all 5 features feeding into self-optimization.

### New Skills to Create

| Skill | Purpose | Integrates With |
|-------|---------|----------------|
| `scenario-holdout-testing` | Prevent test overfitting via exam/study split | `qe-test-generator`, `mutation-testing` |
| `context-fidelity-control` | Adaptive context sizing for token optimization | `agentdb-vector-search`, HNSW memory |
| `agent-loop-detection` | Detect stuck agents, suggest alternatives | `anti-drift-middleware`, ReasoningBank |
| `quality-gate-orchestration` | Multi-dimensional quality gates with ratcheting | All 46 Tier-3 skills as gates |
| `token-budget-tracking` | Economic framing and optimization | ADR-026 routing, `hooks_model-route` |
| `meta-learning-feedback` | Close the learning loop across all 5 | `learning-optimization`, GNN/attention |

---

## Blue Hat — Synthesis & Action Plan

### Decision Framework

Weighing all hats against each other:

| Suggestion | White (Data) | Red (Gut) | Black (Risk) | Yellow (Value) | Green (Creative) | **Verdict** |
|-----------|-------------|----------|--------------|---------------|-----------------|-------------|
| Scenario Holdout | Large gap | Yes! | High maintenance | Transformative | Dark Mutation Suite | **ADOPT (Lite first)** |
| Context Fidelity | Large gap | Maybe | Critical info loss | High ROI | Progressive Revelation | **DEFER (implement when pain felt)** |
| Loop Detection | Small gap | Yes! | False positives | High ROI | Loop-as-Feature | **ADOPT (extend existing)** |
| Goal Gates | Small gap | Not now | Pipeline stalls | High reliability | Quality Ratchet | **EXTEND (already exists as coherence gates)** |
| Token Budget | No gap | Mindset yes | Wrong comparison | Transformative | Daily Dashboard | **REFRAME (already built, add UX)** |

### Prioritized Actions

#### Tier 1: Do This Week (High confidence, low effort)

**Action 1: Add loop detection to hooks system**
- Extend existing `anti-drift-middleware.ts` with tool-call signature tracking
- 3-strike warning: inject steering after 3 identical tool calls
- Store loop patterns in HNSW memory for fleet-wide learning
- **Effort:** 1-2 days | **Risk:** Low | **Value:** Prevents token waste immediately

**Action 2: Surface token budget dashboard**
- Infrastructure already exists (2,055 LOC across 3 modules)
- Add terminal-friendly summary: "Used 250K tokens today ($3.75)"
- Wire into existing `aqe-costs` skill for user-facing output
- **Effort:** 1 day | **Risk:** None | **Value:** Visibility enables optimization

#### Tier 2: Do This Month (Medium confidence, medium effort)

**Action 3: Implement "Friday Test Surprise" holdout testing**
- Add `holdout: true` metadata to 10% of generated tests
- Exclude from dev runs, include only in CI release gate
- Track holdout pass rate as quality signal over time
- **Effort:** 1 week | **Risk:** Medium (scenario staleness) | **Value:** Scientific quality measurement

**Action 4: Extend coherence gates with ratcheting**
- ADR-030 and ADR-052 already define coherence gates
- Add auto-ratcheting: gate thresholds increase when team consistently exceeds them
- Never decrease, only tighten
- **Effort:** 1 week | **Risk:** Medium (too-strict gates) | **Value:** Continuous quality improvement

#### Tier 3: Do This Quarter (Lower confidence, needs validation)

**Action 5: Progressive context revelation**
- Don't implement fixed fidelity levels — too rigid, too many failure modes
- Instead: spawn agents with task description only, let them fetch context on demand
- Track which files agents request, learn patterns, pre-load for future tasks
- **Effort:** 2-3 weeks | **Risk:** High (behavior change) | **Value:** Token optimization + agent intelligence

**Action 6: Close the meta-learning loop**
- Unified metrics collection across loop detection, gate results, token usage, holdout scores
- Feed into existing `learning-optimization` domain and ReasoningBank
- System learns optimal configurations for each task type
- **Effort:** 3-4 weeks | **Risk:** Medium (complexity) | **Value:** Self-optimizing QE system

#### Not Now

**Context Fidelity Controls (explicit parameter):** Deferred. The "progressive revelation" approach (Tier 3) achieves the same goal without API breaking changes or fixed fidelity categories. Revisit if progressive revelation proves insufficient.

**$1000/day Benchmark (as marketing):** Don't adopt StrongDM's number. Their economics (enterprise SaaS) differ fundamentally from ours (npm package). Instead, help users calculate their OWN break-even: "At your team size and task mix, agentic QE pays for itself when..."

### What NOT to Do

1. **Don't add all 5 features simultaneously.** Complexity creep is the biggest risk. Sequential adoption with validation between steps.
2. **Don't copy StrongDM's architecture.** Their DOT-graph orchestration solves their problem (dark factory pipelines). Our imperative swarm coordination solves ours (flexible QE workflows).
3. **Don't remove human judgment.** AQE should augment QE engineers, not replace them. Gates and holdouts build trust, not remove humans.
4. **Don't treat the $1000/day number as gospel.** Model pricing changes constantly. Build cost-awareness infrastructure, not fixed benchmarks.
5. **Don't build "AQE Enterprise" as a separate fork.** Features should be optional configuration, not separate products.

### Success Metrics

| Action | Metric | Target |
|--------|--------|--------|
| Loop detection | Token waste prevented per week | >$50 saved |
| Token dashboard | User engagement with cost data | >60% of sessions |
| Holdout testing | Holdout pass rate trend | Improving month-over-month |
| Gate ratcheting | Gate threshold increases per quarter | 2-3 ratchets |
| Progressive context | Tokens per agent spawn | -40% reduction |
| Meta-learning | Self-optimization suggestions adopted | >5/month |

---

## Key Takeaways

1. **AQE is closer to StrongDM's approach than it appears.** Loop detection, goal gates, and token budgeting are already partially implemented. The gaps are holdout testing and context optimization.

2. **The real insight isn't the 5 features — it's the learning loop.** Each feature should feed data back into AQE's learning system so the system improves itself over time.

3. **Start with what's almost free.** Loop detection hooks (1 day) and token dashboard (1 day) deliver immediate value with near-zero risk.

4. **The "dark factory" model is aspirational but not our goal.** AQE should help QE engineers be 10x more effective, not replace them. Trust-building features (holdout tests, gates) serve this mission better than full automation.

5. **Don't copy, adapt.** StrongDM's suggestions are excellent inputs, but they need translation for a different context (enterprise SaaS vs. developer tooling, $1M contracts vs. free npm package, dark factory vs. augmented QE).

---

*Analysis performed using Edward de Bono's Six Thinking Hats methodology. Each hat applied independently to avoid mixed-mode thinking, then synthesized in Blue Hat for actionable decisions.*
