# ADR-119: Two-gate quality verdicts — mechanical gate + pinned-checklist frontier judge, three-valued

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-119 |
| **Status** | Accepted (2026-07-08) — `quality-verdict.ts` core (8 tests) + frontier `frontier-judge.ts` (preflight→inconclusive, injectable provider seam) + `quality-gate-runner.ts` (CLI/MCP parity) + `aqe quality-gate` CLI + `qe/quality/gate` MCP tool. Unit-tested; MCP protocol-level integration test deferred to CI. |
| **Date** | 2026-07-07 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | [ADR-117](./ADR-117-frozen-oracle-anchor-set.md) (the pinned checklist the judge grades against), [ADR-113](./ADR-113-evals-are-oracles.md) (mechanical oracle grading), [ADR-111](./ADR-111-darwin-qe-self-learning.md) (local-writer / frontier-oracle lanes), [ADR-103](./ADR-103-structured-verdict-handoffs.md) (structured verdicts). Cross-repo provenance: retort `_spec_conformance_passes` + `_eval_tooling_preflight` (`/workspaces/retort/src/retort/cli.py`). |

---

## WH(Y) Decision Statement

**In the context of** AQE's quality-gate surface (`qe-quality-gate`, the oracle arc of ADR-113) rendering pass/fail verdicts that downstream promotion (ADR-118) and deployment decisions trust,

**facing** three ways a single-gate verdict lies: (a) it can report **pass when the tests never actually executed** (an infra/harness failure silently read as success), (b) a **single LLM judge is noisy** — retort measured a cheap judge (Haiku) swinging between 0.33 and 1.0 on *identical* code — so one judgment is not a reliable verdict, and (c) a two-valued pass/fail **cannot distinguish a genuine quality gap from an inconclusive run**, so an infra hiccup masquerades as a real failure and pollutes the learning signal,

**we decided for** retort's **two-gate, three-valued** design ported into AQE's quality gate: a **mechanical gate** (if tests did not execute ⇒ `fail`, never `pass`) *and* a **spec gate** — a **frontier-tier** LLM judge scoring against the ADR-117 pinned, constant-denominator checklist, passing only at coverage `1.0`, with a **two-attempt second opinion**, yielding a **three-valued verdict** (`pass` / `fail` / `inconclusive`), fronted by a **judge preflight** that refuses to report success when the judge tooling never ran,

**and neglected** a single-gate verdict (rejected: cannot catch non-executed tests), a single-shot judge (rejected: retort's 0.33↔1.0 noise proves one opinion is unreliable), a two-valued verdict (rejected: conflates inconclusive with fail — retort's explicit `None` third value exists to stop exactly this), and **economizing the judge to a cheap/local model** (rejected: the oracle is the one place ADR-111 forbids cheapening — a noisy judge corrupts every downstream gate),

**to achieve** quality verdicts that fail loud on non-execution, resist judge noise via second-opinion + a constant-denominator bar, and keep infra failures from masquerading as quality failures — so ADR-118's accept() and human deployment decisions consume a trustworthy signal,

**accepting that** the frontier judge costs real tokens per verdict (bounded by running it only at gate time, not per test), that a three-valued verdict forces callers to handle `inconclusive` (retry later, don't record a failure), and that "pass only at 1.0" makes the spec gate deliberately strict.

---

## Context

AQE's ADR-111 establishes that *writers* may be cheap/local (qwen3-coder:30b via Ollama) with frontier escalation for the hard tail. This ADR draws the complementary line: **the oracle/judge is the one place you never economize.** retort's evidence is direct — a cheap judge (Haiku) returned coverage scores swinging from 0.33 to 1.0 on identical code, i.e. a single cheap judgment is noise. retort's response is layered: a mechanical gate that fails when tests did not execute, a spec gate that runs a strong-model judge against a **pinned** `REQUIREMENTS.json` checklist (constant denominator, pass only at `1.0`), a **two-attempt** protocol that fails only on *two* real short opinions (so single-judge noise on one requirement cannot sink a complete run while a real omission still does), and a **three-valued** return (`True`/`False`/`None`) so that an eval that *could not run* returns `None` (inconclusive → retry) rather than `False` (spec fail). A `_eval_tooling_preflight` refuses to even report success if the judge tooling never ran.

AQE already has the mechanical half (ADR-113 oracle: run the test against reference + mutants — if it doesn't execute, it doesn't pass) and now the pinned-checklist artifact (ADR-117). This ADR composes them into `qe-quality-gate` and adds the frontier judge + second-opinion + three-valued verdict + preflight.

---

## Current state (grounded, verified 2026-07-07)

| Fact | Evidence |
|---|---|
| AQE grades tests by executing them | ADR-113 `src/validation/oracle-eval.ts` — non-executing / assertion-less output is rejected at a sanity guard |
| AQE verdicts are effectively two-valued today | `qe-quality-gate` renders pass/fail on thresholds; no explicit `inconclusive` for infra failures |
| retort's two-gate + three-valued design is verified | `/workspaces/retort/src/retort/cli.py:1267` `_spec_conformance_passes` returns `(True|False|None, coverage)`; docstring: "None — inconclusive … keeps an infra hiccup from masquerading as a spec failure" |
| retort fails only on two real short opinions | same fn `:1300-1305` — `len(reals) >= 2 → False`; `== 1 → None`; `0 → None` |
| retort preflights the judge tooling | `cli.py:1396` `_eval_tooling_preflight`; `:3153-3159` "Eval tooling preflight FAILED … refuse to report success" |
| Cheap-judge noise is measured | 2026-07-07 cross-repo analysis: retort observed Haiku coverage swinging 0.33↔1.0 on identical code → "never economize on the oracle" |
| ADR-111 already separates writer lane from oracle | ADR-111 — writers cheap-local, deterministic ground-truth gate stays pure/uncheapened |

**The core problem in one line:** a single, cheap, two-valued quality verdict can pass tests that never ran and can't tell "the run broke" from "the code is wrong" — poisoning every promotion decision that trusts it.

---

## Options Considered

### Option 1: Two-gate, three-valued, frontier-judged with second opinion + preflight (Selected)

`src/validation/quality-verdict.ts`: (1) **mechanical gate** — reuse ADR-113 oracle; non-execution ⇒ `fail`. (2) **spec gate** — frontier judge (always top-tier, ADR-111) scores against the ADR-117 pinned checklist; two independent attempts; pass only at `1.0`; `fail` only on two real short opinions; `inconclusive` if <2 real opinions. (3) **preflight** — refuse to report success if the judge never ran. Verdict is `pass | fail | inconclusive`.

**Pros:**
- Catches non-executed tests (mechanical gate) — the failure class a single gate misses.
- Resists judge noise (second opinion + constant-denominator bar) — retort's proven mitigation.
- `inconclusive` keeps infra failures out of the learning signal (ADR-118 records neither pass nor fail on `inconclusive`).
- Judge stays frontier-tier where ADR-111 says it must.

**Cons:**
- Frontier judge tokens per gate invocation.
- Callers must handle three values.

### Option 2: Single mechanical gate only (Rejected)

Trust the ADR-113 oracle (execution + mutation) alone; no LLM judge.

**Why rejected:** the oracle grades *test* quality against a reference impl, but the spec gate answers a different question — does the produced artifact satisfy the *human-labeled requirement checklist*. Some QE outputs (requirements validation, BDD, swarm verdicts) are not mutation-gradeable (ADR-113's own "eval flip scope" carve-out); they need the pinned-checklist judge. A mechanical-only gate cannot cover them.

### Option 3: Single-shot cheap judge, two-valued (Rejected)

One local/Haiku judgment, pass/fail.

**Why rejected:** retort measured this exact configuration producing 0.33↔1.0 swings on identical code, and two-valued verdicts conflate inconclusive with fail. This is the design the ADR exists to replace.

---

## Decision detail

### 1. Mechanical gate (reuse ADR-113)
Tests that do not execute ⇒ `fail`. No judge is consulted until the mechanical gate is satisfied — an artifact whose tests didn't run is never "pass," regardless of judge opinion.

### 2. Spec gate — frontier judge vs pinned checklist
The judge model is **always frontier-tier** (never the cheap writer lane — ADR-111 §"deterministic verification kernel stays uncheapened," extended here to the LLM-judge case). It scores the artifact against the ADR-117 pinned checklist (constant denominator). `requirement_coverage == 1.0` ⇒ candidate pass for that attempt.

### 3. Two-attempt second opinion (retort protocol)
Run the spec gate twice with prior output cleared first (no stale reads). `fail` only if **two** real opinions both fall short; `inconclusive` if fewer than two real opinions were obtainable (usage limit / timeout); `pass` on the first attempt that reaches `1.0`.

### 4. Judge preflight
`preflightJudge()` verifies the judge tooling/credentials before the gate reports anything; if the judge never ran, the verdict is `inconclusive` (never a silent `pass`) — retort's `_eval_tooling_preflight` semantics.

### 5. Three-valued verdict + consumer contract
Verdict ∈ `{pass, fail, inconclusive}`. ADR-118's flywheel treats `inconclusive` as "retry later, record neither promotion nor rejection." Deployment advisors surface `inconclusive` as "re-run," not "block." Structured per ADR-103 handoff shape.

### 6. MCP-CLI parity + data safety
The gate ships on both CLI (`aqe quality-gate`) and MCP with identical verdict semantics (mandatory parity). Verdict records append-only to `memory.db`.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-117 | Frozen oracle anchor set | The judge grades against its pinned, constant-denominator checklist |
| Depends On | ADR-113 | Evals Are Oracles | Supplies the mechanical gate (execution + mutation) |
| Relates To | ADR-111 | Darwin-for-QE | Enforces the writer-cheap / oracle-frontier split for the LLM-judge case |
| Relates To | ADR-103 | Structured verdict handoffs | Three-valued verdict uses the structured handoff shape |
| Consumed By | ADR-118 | QE-policy flywheel | accept() treats `inconclusive` as no-op, not a rejection |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| R-1 | retort two-gate three-valued spec conformance | Prior art | `/workspaces/retort/src/retort/cli.py:1267` `_spec_conformance_passes` |
| R-2 | retort judge tooling preflight | Prior art | `/workspaces/retort/src/retort/cli.py:1396` `_eval_tooling_preflight`, `:3153` |
| R-3 | retort judge-noise evidence (Haiku 0.33↔1.0) | Analysis | 2026-07-07 cross-repo analysis of `/workspaces/retort` |
| R-4 | AQE oracle (mechanical gate) | In-repo | `src/validation/oracle-eval.ts` (ADR-113) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Core | 2026-07-07 | Proposed | 2026-10-07 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-07-07 | Initial creation; extracted from 2026-07-07 cross-repo analysis |

---

## Definition of Done Checklist

### Core (ECADR)
- [x] **E - Evidence**: retort two-gate/three-valued design + preflight verified in `cli.py`; judge-noise measured
- [x] **C - Criteria**: 3 options compared (two-gate 3-valued / mechanical-only / single-shot cheap 2-valued)
- [ ] **A - Agreement**: AQE Core sign-off pending
- [x] **D - Documentation**: WH(Y) complete, ADR published
- [x] **R - Review**: 3-month cadence, AQE Core owner
### Extended
- [x] **Dp - Dependencies**: Typed relationships to ADR-117/113/111/103/118
- [x] **Rf - References**: Grounded in verified retort file paths
- [ ] **M - Master**: Part of the ADR-117…122 learning-integrity cluster
