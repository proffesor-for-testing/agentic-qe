# Dream Machine and MetaHarness improvements applicable to Agentic QE

## Executive finding

Agentic QE should adopt five invariants from the current RuvNet work, but should
not add Dream Machine, Horizon, Router, Flywheel, or Turn Credit as shipped
runtime dependencies. AQE already owns overlapping routing, learning, evidence,
and orchestration bounded contexts. Copying the invariant into those contexts is
lower-risk than introducing a second control plane.

The highest-value immediate changes are already represented by ADR-129 through
ADR-131 and PRs #644–#646: authority-preserving compaction, fault-stratified judge
qualification, and trajectory-evidence admission.

## What to adopt

1. **Compile one policy into a deterministic evidence pipeline.** Dream Machine
   demonstrates a useful separation between configuration, proposal, evaluation,
   and promotion. AQE should compile release/quality policy once, hash it, and
   carry the hash through every gate instead of letting individual workflows
   reinterpret thresholds.
2. **Flush durable facts before lossy compaction.** Horizon aborts compaction when
   its durable-fact flush fails. AQE should add this fail-closed ordering to the
   session-durability work in ADR-089, then combine it with ADR-129 provenance.
   A summary must never replace history whose durable facts were not persisted.
3. **Classify the whole command.** Horizon evaluates every shell segment and
   substitution, not only the leading executable. AQE adversarial fixtures should
   include `&&`, pipelines, command substitution, wrappers such as `sh -c`, and
   quote-preserving benign controls. Structural classification remains a guardrail,
   not a sandbox or authorization proof.
4. **Separate proposer, evaluator, and promoter.** Dream Machine and Flywheel both
   reinforce AQE's existing direction: draft-only proposals, frozen conjunctive
   gates, holdout/anchor separation, and append-only promotion lineage. ADR-130
   qualifies the evaluator; ADR-131 qualifies the learning evidence. Neither an
   LLM judgment nor task success alone may promote durable state.
5. **Measure liveness and non-vacuous coverage.** Dream Machine's live/blocked/
   suspicious-silent distinction is better than a binary job status. RedBlue's
   documented indirect-injection gap shows why a green test is insufficient when
   the target lacks the branch under test. AQE should require target-branch evidence
   in adversarial reports and record silent/blocked lanes separately from passes.

## What to adapt cautiously

- **RedBlue:** use a development/test-only adapter against loopback or in-process
  AQE targets. Retain capability containment, synthetic credentials, hard budgets,
  and report redaction. First qualify its model judge under ADR-130 and prove each
  attack family reaches a real target branch.
- **Router:** reuse its benchmark contract—quality bar, cost, calibration set,
  learning curve, and throughput measurement. Do not replace AQE's provider/router
  stack with a parallel runtime. Evaluate on AQE's own labeled routing receipts.
- **Flywheel/Darwin:** reuse frozen gates, independent holdout/anchor data,
  incumbent-relative lift, and replayable lineage. AQE already has flywheel and
  promotion primitives; consolidate invariants rather than importing duplication.
- **Turn Credit:** keep any credit output advisory. Its own documentation marks the
  verifier-delta mode as a proxy and limits trust. It must not become a router label
  or promotion signal until AQE runs multi-seed, disjoint acceptance experiments.

## What not to adopt now

- No new RuvNet package should become a shipped AQE runtime dependency solely for
  these patterns; all inspected packages are pre-1.0 and several duplicate AQE
  bounded contexts.
- Do not call Ruflo or MetaHarness CLIs from product code. Development-time
  orchestration and evaluation adapters remain optional.
- Do not treat a witness hash as a cryptographic signature, an LLM verdict as
  authorization, or a successful trajectory as causal learning evidence.
- Do not enable unattended nightly promotion. Scheduled lanes should be
  research/draft-only until exact-artifact release gates and human authority are
  explicit.

## Recommended sequence

| Priority | Work | Acceptance gate |
|---|---|---|
| P0 | Merge/validate #639–#646 and existing #634 in dependency order | Exact-SHA CI, independent review, packed-artifact tests where applicable |
| P0 | Add fail-closed durable-fact flush before Tier 2/3 compaction | Injected flush failure leaves history byte-for-byte unchanged |
| P0 | Add whole-command smuggling corpus | Dangerous later segments/substitutions blocked; quoted benign text allowed |
| P1 | Freeze controlled judge corpus for ADR-130 | Critical evidence/safety slices have minimum support and reviewed labels |
| P1 | Integrate ADR-131 into stores using additive schema | Copy-only migration rehearsal, integrity/row-count proof, rollback path |
| P1 | Add capability-contained RedBlue adapter | Non-vacuous branch coverage, false-positive controls, qualified judge |
| P2 | Compare AQE router with MetaHarness benchmark contract | Cost/quality Pareto lift with confidence bounds; no aggregate-only claim |
| P2 | Add suggestion-to-merge and blocked/silent scheduler metrics | Append-only ledger, dedupe, backlog throttle, no automatic promotion |

## Release implication

These changes should form a minor release candidate only after their PRs are
reviewed and merged. A release cannot be sealed from the current unmerged branch
set: exact-artifact lineage, exact-SHA CI, no-skip QE, and independent dual-host
review are not yet established. The research supports preparing notes and a
candidate plan now, not publishing or claiming readiness.

Source details and immutable links are in
[the source ledger](./2026-08-30-ruvnet-improvement-source.md).
