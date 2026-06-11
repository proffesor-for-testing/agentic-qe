# ADR-107: Invariant Verification for Shipped Agent Definitions

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-107 |
| **Status** | Implemented |
| **Date** | 2026-06-11 |
| **Author** | AQE Core (Pattern Space cross-pollination initiative, gist `3efec1f`) |
| **Review Cadence** | 6 months |
| **Related** | ADR-105 (evidence labels are an invariant block), ADR-106 (complementary behavioral layer), ADR-086 (skill design standards — mandatory Gotchas sections for >200-line skills join the invariant manifest, machine-checked by this verifier), CLAUDE.md release rules (manual version grep) |

---

## WH(Y) Decision Statement

**In the context of** AQE shipping `qe-*.md` agent definitions to users via `assets/agents/v3/`, hand-synced from `.claude/agents/v3/`, plus skills, README agent counts, and version strings spread across the repo,

**facing** the drift mechanic the Pattern Space assessment demonstrated empirically — *drift concentrates exactly on the surfaces no verifier covers* (their verified editions stayed consistent while every unverified surface — version blocks, file counts, install scripts, the one-doc edition's missing toggle — silently rotted), the realized failure that hand-compression dropped their safety-critical block while a shallow keyword verifier passed, and AQE's own current state where CLAUDE.md prescribes the version-grep as a **manual** release step,

**we decided for** a CI-enforced invariant verifier over all shipped artifacts: (a) every shipped `qe-*.md` must contain its non-negotiable **sections** — data-protection rules, evidence-labeling discipline (ADR-105), memory namespace conventions — asserted at section level (heading present + minimum content hash/length), not keyword level; (b) `assets/agents/v3/` must not diverge from `.claude/agents/v3/` on invariant blocks, and must contain ONLY `qe-*.md` agents (existing CLAUDE.md rule, currently untested); (c) version strings consistent repo-wide against `package.json` as source of truth (automating the existing manual grep); (d) skill/agent counts cited in README/docs match `ls` reality,

**and neglected** keyword-grep invariants (the assessment's mutation-test critique: Pattern Space's verifier passed if the word "council" appeared anywhere — deleting an entire section while keeping its heading word defeats it; section-level assertions with content minimums are the fix), full-file hashing (too brittle — legitimate edits to non-invariant prose would block CI), and an LLM-based semantic diff (slow, non-deterministic; wrong tool for a gate that must be byte-reproducible),

**to achieve** a guarantee that compression, refactoring, or sync lag can never silently strip the safety-critical or discipline-critical blocks from what users download — closing the gap before instruction tiering (micro agent definitions for Haiku-routed tasks) makes it acute,

**accepting that** invariant blocks must be declared in a manifest (maintenance cost: editing an invariant requires updating the manifest — by design, that friction is the review trigger), and that semantic weakening *within* an intact section is not caught (that is ADR-106's behavioral layer; the two ADRs are deliberately complementary: presence here, obedience there).

---

## Options Considered

### Option 1: Section-level invariant manifest + CI gate (Selected)
**Pros:** catches the realized Pattern Space failure class (section silently dropped); deterministic; automates two existing manual CLAUDE.md disciplines (version grep, assets-only-qe rule); cheap (one script + one workflow).

### Option 2: Keyword-presence checks (Rejected)
**Why rejected:** demonstrated insufficient — the assessment showed Pattern Space's 9-regex verifier validated "consistency" while its own CLAUDE.md said v0.4 inside a v0.5 product.

### Option 3: Freeze shipped agents as build artifacts generated from source (Considered, deferred)
**Why deferred:** generation-from-source eliminates sync drift by construction and is the right end state, but requires a build-pipeline change; the verifier is needed regardless as the gate, and ships in days not weeks.

## Implementation Sketch

1. `config/agent-invariants.json`: per-artifact list of required section headings + minimum token length per section. Includes ADR-086's mandatory blocks for skills (Gotchas for >200-line skills) so design standards and safety invariants share one gate.
2. `scripts/verify-shipped-invariants.ts`: section parser + manifest assertions + assets/source divergence diff + version-string grep + count checks. Exit non-zero on any violation, printing the missing/diverged section.
3. Workflow `invariant-check.yml` on PR + release; required check.
4. Mutation-test the verifier itself in `tests/unit/`: strip a section body but keep its heading → must fail; reword non-invariant prose → must pass.
