# ADR-102: Deterministic Workflow Orchestration with Adversarial Verification

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-102 |
| **Status** | Implemented (QCSD Development phase; remaining phases follow-up) |
| **Date** | 2026-06-10 |
| **Author** | AQE Core (Fable 5 improvement initiative, issue #520) |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** the QCSD swarm skills, which orchestrate multi-agent reviews by *prompting* the model to fan out Task-tool spawns and hoping the topology holds,

**facing** non-deterministic orchestration (fan-out shape varies per run), unverified findings (whatever a finder asserts lands in the report), and prose handoffs no consumer can validate,

**we decided for** deterministic workflow scripts in `.claude/workflows/` as the primary execution model — starting with `qcsd-development-review`: one finder per quality dimension → **3 blind adversarial refuters per finding with majority kill** (Loki-mode constraints, ADR-074) → deterministic synthesis into `finding-verdict@1` envelopes (ADR-103) — with the Task-tool protocol retained as documented fallback,

**and neglected** keeping prompt-driven fan-out as primary (irreproducible, no verification stage) and building an in-repo orchestration engine (the harness's Workflow tool already provides deterministic control flow, schema-enforced agent outputs with auto-retry, and progress reporting),

**to achieve** reproducible review topology, schema-validated agent outputs at every stage, and reports that contain only adversarially confirmed findings (killed findings retained with refutations for audit),

**accepting that** the workflow path requires a Workflow-capable harness (fallback documented in the skill, reports marked `verification: none`), and that finder/refuter schemas are inlined in the script (workflow scripts have no filesystem access) and must mirror `schemas/finding-verdict.schema.json`.

---

## Context

The "harness generates intelligence" thread of the Fable 5 plan. The skill previously declared `execution.primary: task-tool`: the model reads a protocol and improvises spawns. The workflow script replaces improvisation with code: `pipeline()` runs dimensions without barriers (a dimension's findings go to verification while another dimension still searches), every `agent()` call carries a JSON schema (malformed output auto-retries at the tool-call layer), and synthesis is plain deterministic JavaScript — no agent gets to editorialize the final report.

Adversarial verification encodes ADR-074's Loki rules as prompt constraints: **blind review** (refuters receive only the bare claim + evidence — never the finder's confidence, dimension, or each other's verdicts), **anti-sycophancy** (the refuter's instruction is to attack; "default to refuted when uncertain"), and three distinct lenses (evidence-reproduces, actually-a-problem, code-really-does-this) rather than three identical votes.

## Options Considered

### Option 1: Harness Workflow scripts, skill-integrated (Selected)

**Pros:** deterministic topology; per-stage schemas with auto-retry; pipeline wall-clock efficiency; progress tree visible to the user; scripts are reviewable artifacts in the repo
**Cons:** harness-dependent (fallback retained); inline schema duplication with ADR-103 files

### Option 2: Keep prompt-driven Task-tool fan-out as primary (Rejected)

**Why rejected:** the fan-out shape, finding format, and verification rigor vary run to run; no structural place to put the refuter stage.

### Option 3: In-repo orchestration engine (WorkflowOrchestrator-based) (Rejected for this layer)

**Why rejected:** the kernel's WorkflowOrchestrator coordinates domain actions, not LLM subagent topologies; duplicating the harness's agent orchestration would be parallel infrastructure (violates the extend-don't-duplicate principle of ADR-074).

---

## Rollout

| Phase skill | Status |
|---|---|
| qcsd-development-swarm → `qcsd-development-review` | **Done** (this ADR) |
| qcsd-ideation / refinement / cicd / production | Follow-up after the development phase proves out (plan step 5) |

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-103 | Structured Verdict Handoffs | Output envelopes are `finding-verdict@1` |
| Relates To | ADR-074 | Loki-Mode Adversarial Quality Gates | Refuter prompt constraints encode its blind-review/anti-sycophancy rules |
| Relates To | ADR-064 | Agentic Teams | Task-tool fallback path |
| Part Of | — | Fable 5 / ruflo-parity initiative | Tracking issue #520, improvement 5 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| — | Workflow script | Source | `.claude/workflows/qcsd-development-review.js` |
| — | Skill integration | Source | `.claude/skills/qcsd-development-swarm/SKILL.md` (v1.1.0, `execution.primary: workflow`) |
| — | Validation run | Evidence | See Status History — bounded run on `src/cli/commands/hooks-handlers/` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Core | 2026-06-10 | Implemented (development phase) | 2026-12-10 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-06-10 | From Fable 5 improvement plan (issue #520) |
| Implemented | 2026-06-10 | Script + skill integration; validation run results recorded on issue #520 |

---

## Definition of Done Checklist

- [x] Evidence: validation run 2026-06-10 (`wf_254f1271-022`): 3 dimensions over `src/`, 48 agents, 15 raw findings → 14 confirmed / **1 killed by 3-of-3 adversarial refutation** (a factually-wrong "private method" claim — the methods are public interface members); 2 confirmed findings retain minority refutations for audit; all stages schema-enforced. Caller note: pass `args` as a JSON **object** — a stringified object reaches the script as a string and defaults apply.
- [x] Criteria: 3 options compared; Loki constraints traceable to ADR-074 features
- [x] Agreement: plan-mandated; fallback preserves non-Workflow users
- [x] Documentation: this ADR + SKILL.md workflow section
- [x] Review: verification record on issue #520
