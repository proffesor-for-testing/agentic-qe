# ADR-109: Interaction Benchmark for Qualitative Agent Outputs

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-109 |
| **Status** | Proposed |
| **Date** | 2026-06-11 |
| **Author** | AQE Core (Pattern Space cross-pollination initiative, gist `3efec1f`) |
| **Review Cadence** | 6 months |
| **Related** | ADR-104 (arena Phase 2), ADR-108 (rubric pre-registration — mandatory here, incl. its antipattern list), ADR-074 (loki-mode anti-sycophancy — the two-pass independent-judge design mirrors its blind-review discipline), ADR-099 (reasoning-tag scrubbing applies to interaction transcripts before judging), ADR-043 (vendor-independent LLM — enables the non-same-family judge), PR trust tiers (this is the tier-3 path for qualitative agents) |

---

## WH(Y) Decision Statement

**In the context of** QE agents whose outputs are irreducibly qualitative — `qe-code-reviewer` feedback, `qe-deployment-advisor` verdicts, report generators — which today cannot reach trust tier 3 because no eval infrastructure can score them: mutation kill rates measure suites, not prose,

**facing** the genuinely novel eval design in Pattern Space's v2.2 interaction harness — a **live, reactive interactor** whose own follow-up behavior is the outcome signal, scored on *participant movement* rather than output eloquence — alongside the five specific flaws AQE's assessment found in their implementation (same-family judge throughout, a judge instruction that unblinds and pre-frames the treatment, post-hoc rubric, unclustered statistics, no second judging pass),

**we decided for** an interaction benchmark for qualitative QE agents built on their design with our corrections baked in from run one: a simulated **developer-interactor** (persona + codebase fixture + a real defect) converses with the agent-under-test; the primary outcome is **movement** — did the developer's subsequent actions fix the issue, ask sharper questions, converge on root cause — measured where possible by **objective ground truth** (does the fix the simulated developer writes after the conversation pass the hidden test? — no judge needed) and only secondarily by a judge that is (a) **non-same-family** to the agent under test, (b) given neutral instructions with no style framing in either direction, (c) run as **two independent passes** with per-item agreement published, on (d) a rubric pre-registered per ADR-108, with (e) **scenario-clustered statistics** (sign test over scenarios, not pooled rows) as the reported result, and (f) Pattern Space's scrub-on-resume pattern adopted — with the aggregation filter enforcing the cleanliness invariant in code, fixing the gap their review found,

**and neglected** pure LLM-judge scoring without ground truth (the all-Claude circularity bounded their headline at "Claude prefers Claude"; anchoring primary outcomes in does-the-hidden-test-pass keeps the headline about *developer effect*, not judge taste), static golden-transcript comparison (a scripted user can't show whether the agent *moved* anyone — their design insight, validated), and human-developer studies as the v1 (right end state, wrong starting cost; the simulated-interactor + ground-truth design produces directional evidence first),

**to achieve** trust-tier-3 eval infrastructure for the agent class that currently can't have it, with headline numbers that survive the exact adversarial audit AQE just performed on this design's originator,

**accepting that** a simulated developer is not a real developer (stated limitation in every report, per the lineage discipline), interactor-model choice influences results (recorded per row; varied across cells), and per-conversation cost makes this a release-cadence benchmark, not a per-PR check.

**Cross-family restraint parity**: when cells span model families, scenarios include a **restraint probe** (the interactor invites a confident claim the agent should decline — e.g., "just tell me which line is the bug" before evidence exists). Pattern Space's cross-family log showed restraint is the discipline that transmits worst across families; restraint-probe pass rates are reported per family alongside the headline.

---

## Options Considered

### Option 1: Reactive interactor + ground-truth-anchored outcomes + hardened judging (Selected)
**Pros:** inherits the one genuinely novel mechanism (reactive interactor as outcome signal); every flaw found in the source implementation is corrected by construction; objective anchor (hidden test passes) caps judge influence on the headline.

### Option 2: LLM-judge panel over static transcripts (Rejected)
**Why rejected:** measures eloquence, not effect — and reproduces the circularity that bounded Pattern Space's claim.

### Option 3: Wait for human-in-the-loop studies (Rejected as v1)
**Why rejected:** cost defers the eval indefinitely; the simulated design with ground truth produces auditable directional evidence now and defines the protocol humans can later slot into.

## Implementation Sketch

1. `benchmarks/interaction/`: scenario corpus (fixture repo + seeded defect + persona + hidden acceptance test), pre-registered rubric (ADR-108) for secondary dimensions.
2. Runner: agent-under-test ↔ interactor loop (N turns), then interactor attempts the fix; hidden test verdict recorded. Scrub-on-resume with `_is_good` enforced in aggregation (the one-line fix their code review prescribed).
3. Judging: non-Anthropic judge for Anthropic-routed agents (per ADR-043 vendor-independent LLM support), two passes, X/Y per-item seeded counterbalancing (seed = item id), agreement published.
4. Reporting: scenario-clustered sign test + CIs; LINEAGE.md row; results in `memory.db` namespace `benchmarks/interaction`.
