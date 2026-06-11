# ADR-108: Benchmark Lineage Registry and Pre-Registered Rubrics

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-108 |
| **Status** | Implemented |
| **Date** | 2026-06-11 |
| **Author** | AQE Core (Pattern Space cross-pollination initiative, gist `3efec1f`) |
| **Review Cadence** | 6 months |
| **Related** | ADR-104 (qe-arena), ADR-109 (interaction benchmark — first mandatory consumer), `aqe benchmark` |

---

## WH(Y) Decision Statement

**In the context of** AQE producing benchmark numbers (arena tournaments per ADR-104, `aqe benchmark`, performance suites) that appear in READMEs, release notes, and marketing claims — and Phase 2 of arena plus ADR-109 introducing *judged* (rubric-scored) dimensions for the first time,

**facing** the precise failure the Pattern Space assessment documented: a rubric rebuilt **after** the framework lost under the old one, four new dimensions added in the framework's own vocabulary, the losing run's data never committed, and the change later described as a one-variable fix that the git history contradicted — the single place an otherwise rigorously honest project broke its own "keep the nulls" rule, and the most expensive credibility wound in its benchmark story,

**we decided for** two standing disciplines: (1) a **benchmark lineage registry** (`docs/benchmarks/LINEAGE.md`) where every benchmark/eval version gets a row — what it measured, what confound or limitation it had, its status (current / deprecated / superseded-by), and "the one to cite" — with deprecated raw results archived in-repo with do-not-cite READMEs, never deleted; and (2) **pre-registered rubrics**: any judged or rubric-scored benchmark commits its rubric, judge instructions, and scoring weights *before* result generation begins; mid-run rubric changes require abandoning the run **and committing its partial data with the abandonment reason** — the rubric commit hash is recorded in every result row so post-hoc edits are detectable by construction,

**and neglected** prohibiting rubric evolution (rubrics legitimately improve; Pattern Space's neutral-control correction was *good* science — the discipline is about sequencing and record-keeping, not freezing), external pre-registration services (in-repo git history is sufficient and self-verifying — the assessment audited Pattern Space's lineage entirely from its own commits, which is the property to preserve), and applying the rubric rule retroactively to ADR-104 Phase 1 (objective fitness from real mutation runs needs no judge; pre-registration applies the moment a rubric exists),

**to achieve** benchmark claims that an external auditor can verify from the repo alone — the exact audit AQE just performed on someone else, and must therefore survive itself,

**accepting that** keeping unfavorable partial runs in-repo costs storage and occasionally optics (a committed losing run is visible), and that the registry is one more file to maintain — mitigated by making a LINEAGE.md row part of the definition-of-done for any benchmark change, checked by ADR-107's verifier.

---

## Options Considered

### Option 1: In-repo lineage registry + rubric-before-data rule (Selected)
**Pros:** self-verifying via git; zero external dependencies; converts "trust us" into "check the hashes"; directly prevents the rubric-rigging-adjacent zone identified in the assessment.

### Option 2: Freeze rubrics permanently after v1 (Rejected)
**Why rejected:** Pattern Space's v2 control was genuinely confounded and *needed* correction; prohibiting evolution forces either bad rubrics or silent violations.

### Option 3: External pre-registration (OSF-style) (Rejected)
**Why rejected:** adds a dependency outside the repo's audit surface; git commit ordering already proves precedence.

## Antipatterns (from the Pattern Space v0.5 assessment — what this ADR exists to prevent)

1. **Rubric-rebuild concealment**: describing a multi-dimension rubric rebuild as a one-variable change. Every LINEAGE.md entry for a rubric revision MUST carry a changelog enumerating ALL changes from the prior version (dimensions added/removed, instruction wording, interactor/turn-count changes), verifiable against the rubric file diff.
2. **Treatment-revealing judge instructions**: telling a "blind" judge what the treatment's style looks like or pre-framing it positively ("intentionally verbose … a feature, not a fault"). Judge instructions are part of the pre-registered rubric and must be style-neutral in both directions.
3. **Pooled pseudo-replication**: reporting N correlated rows as if independent. Results MUST be reported with statistics clustered by experimental unit (scenario-level sign test or mixed model, with CIs); raw pooled counts may appear only alongside the clustered result.
4. **Discarded unfavorable runs**: a run abandoned mid-way for any reason (including "the rubric was unfair") keeps its partial data in the archive with the abandonment reason. A number that gets quoted must have committed data behind it.

## Implementation Sketch

1. `docs/benchmarks/LINEAGE.md` seeded with current state: arena Phase 1 (ADR-104, objective, current — including its own reproducibility correction note as the model entry), historical performance suites, deprecated entries as discovered.
2. Rubric pre-registration convention: `benchmarks/<name>/RUBRIC-v<N>.md` committed before any `results-*` artifact; result writers embed the rubric file's git hash per row.
3. Abandoned-run rule: partial data moves to `benchmarks/<name>/archive/<run>/` with `README.md` stating the abandonment reason (the kept-null).
4. ADR-107 verifier checks: every results artifact references a rubric hash that predates it in history.
