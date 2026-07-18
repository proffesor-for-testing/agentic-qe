---
name: "qe-court"
description: "Adversarial review court — a delivery (diff, PR, test suite, or artifact) is prosecuted by independent AI reviewers from different vendors, each with its own probe set, then a SHIP verdict must SURVIVE escalating deeper reviewers before it stands. Use when you want more than one reviewer's opinion on whether something is safe to ship: pre-merge gating, release go/no-go, catching a too-easy PASS, or any 'is this actually done?' decision where a shallow approval is a risk. Produces a signed court record with a three-valued verdict (SHIP / REMAND / BLOCK) and a human as final judge. Learns over time: reproduced charges and overturned SHIPs feed the QE flywheel."
trust_tier: 3
validation:
  eval_path: evals/qe-court.yaml
  status: passing
  passRate: 1.0
  criticalPassRate: 1.0
  lastValidated: "2026-07-18"
---

# QE-Court: Adversarial Review as a Verdict

## Purpose

One reviewer — even a strong one — is one Einstein squinting at the chalkboard.
QE-Court convenes **independent adversaries from different vendors, with different
roles and different probe sets**, makes them attack the delivery, and then forces
any `SHIP` verdict to *survive* an escalating deeper review before it stands. You
stay in the loop as the final judge. Implements ADR-124; composes ADR-117..122.

**The one rule that makes it a court and not a rubber stamp:** a passing grade is
the *claim under attack*, not the finish line. A shallow `91/100 SHIP` that a
deeper reviewer can overturn is a bug in the review, not a delivery that shipped.

## When to convene the court

- Pre-merge gate on a risky PR or diff
- Release go/no-go ("deployment readiness with a jury")
- You got a PASS that felt too easy and want it stress-tested
- A test suite claims coverage you don't trust (does it kill mutants?)
- Any high-stakes "is this actually done?" call

For a quick single-lens review, use `/sherlock-review`, `/brutal-honesty-review`,
or `/code-review` instead — the court is for when one opinion isn't enough.

## The court roster (composes existing skills/agents — do NOT reimplement critics)

| Role | Who | Job |
|------|-----|-----|
| **Defense** | writer model (summarizer) | States the case-FOR-ship from the evidence. Never grades. |
| **Prosecution** | `qe-devils-advocate`, `brutal-honesty-review`, `sherlock-review`, `qe-security-scanner`, `qe-mutation-tester`, **`codex exec review`** | Each files CHARGES against the delivery, **with its own probe set**, blind to the others until filing. |
| **Blind refuter** | `src/verification/adversarial-verify` | Tries to KILL weak charges (default-refuted-if-uncertain). |
| **Jury** | two-gate LLM-judge (ADR-119), cross-model | Weighs surviving charges → verdict + (optional) score. |
| **Deeper reviewer** | higher effort/model tier of any prosecutor | The overturn round. |
| **Judge** | **you (the human)** | Sees the strongest case for AND against; rules. |

> ⚠️ **Do NOT run the reduced 3-dimension QCSD workflow as the court engine.** It
> can falsely rate SHIP by skipping the security / mutation / defect lanes. Spawn
> the *specialized* `qe-*` prosecutors above, or you reproduce the exact
> false-SHIP the court exists to catch. (ADR-124; see `qcsd-development-swarm`.)

## Model routing (configurable — this is the point of the court)

The court's guarantees come from **who** reviews, not just how. Routing is
**user-configurable** in `config.json` under `routing`; the defaults below enforce
the invariants. Every model call goes through AQE's provider layer (ADR-123), so
budget caps and cost receipts apply automatically.

| Step | Default provider / tier | Why |
|------|------------------------|-----|
| **Defense** | `cognitum-low` or `claude-code` (may equal writer) | Cheap; states the case, never grades |
| Prosecutor — devils-advocate | `cognitum-mid` | Gap/assumption hunting |
| Prosecutor — brutal-honesty | `claude-code` (Opus/Sonnet) | Rigor lens, different family from jury |
| Prosecutor — sherlock | `cognitum-high` | Deductive/root-cause needs a strong model |
| Prosecutor — security-scanner | SAST tool + `cognitum-mid` | Determinism where possible |
| Prosecutor — mutation | mutation tool + `local`/booster | Test-adequacy is mechanical |
| Prosecutor — codex-review | `codex` (ChatGPT sub) | **Cross-vendor GPT brain — true writer≠juror; ≈$0** |
| **Jury** (two-gate judge) | `cognitum-high` or Opus, `provider ≠ writer` | Must not grade its own family's output |
| **Deeper reviewer** | highest tier / best-of-N @ higher effort | Escalation must be *stronger* than the base panel |

**Provider menu** (mix freely in `routing`): `claude-code` (Claude subscription),
`cognitum-{low,mid,high}` (Cognitum's own multi-model tiers — one option, it routes
internally), `openrouter` (**use when you want many distinct models** across vendors
for breadth), `codex` (GPT via ChatGPT subscription), `claude`/`openai`/`gemini`
(metered APIs), `ollama` (local). Cognitum and OpenRouter are *separate* options:
Cognitum already resolves multiple models behind its tiers; OpenRouter is the lever
when you explicitly want to name several different models.

**Enforced invariants** (defaults; do not weaken without reason):
1. **≥2 distinct vendors** across the panel — Claude / Cognitum / GPT-via-Codex — not just tiers.
2. **Jury provider ∉ {writer, defense}** — no model grades its own or its writer's output.
3. All calls routed through `ProviderManager` → ADR-123 budget cap + receipts.

## The protocol

```
DELIVERY (diff / PR / test-suite / artifact)
   │  1. DEFENSE  — writer model states the case for shipping, from evidence only.
   │  2. PROSECUTION (parallel, blind) — N specialized reviewers, DIFFERENT vendors,
   │     each generates its OWN probe set and files CHARGES (finding + reproduction).
   │  3. KILL ROUND — blind refuters attack each charge; weak/unreproducible ones dropped.
   │  4. JURY — two-gate judge, cross-model, writer≠juror. 3-valued verdict.
   │     A numeric score is emitted ONLY if its rubric passed the ADR-122 ANOVA screen.
   │  5. OVERTURN ROUND — if verdict == SHIP, escalate ONE deeper reviewer. Loop-until-dry:
   │     SHIP only STANDS if K consecutive deeper rounds find nothing new. Surviving fatal → flip.
   │  6. SIGNED COURT RECORD — provenance-tier surviving charges (ADR-121), sign (ADR-118).
   ▼  HUMAN JUDGE (you) — rules SHIP / REMAND / BLOCK on the strongest case both ways.
```

## Verdict states (three-valued — never a bare pass/fail)

| Verdict | Meaning | Trigger |
|---------|---------|---------|
| **SHIP** | Survived the overturn round | No fatal charge survived K deeper rounds |
| **REMAND** | Fixable charges — back to author | Non-fatal charges survived; delivery is close |
| **BLOCK** | A fatal charge survived | ≥1 fatal charge reproduced and not refuted |

## Self-learning — the court feeds the flywheel (ADR-124 M0.B)

A verdict is not the end; it is training signal. After each court run:

1. **Sign the court record → a flywheel receipt.** Use the ADR-118 signer
   (`src/learning/qe-flywheel/receipt.ts` `createSigner` / `platform-signer.ts`,
   persisted via `receipt-store.ts`). The verdict + surviving charges are the body.
2. **Each reproduced, surviving charge → a `qe_pattern`** (ADR-110) at provenance
   tier **`oracle:test-exec`** (ADR-121 — it reproduced, so it is oracle-grade).
   Killed/refuted charges are NOT stored as positives (noise control).
3. **An overturned SHIP is the highest-value signal there is** — persist
   `{shallow: SHIP, true: BLOCK|REMAND, charge}` as a discriminator training pair
   for the frozen anchor (ADR-117) and two-gate judge (ADR-119). This is what makes
   the court *harder to fool* over time.
4. **Retrieval-augment the next panel:** seed each prosecutor's probe set with the
   HNSW-nearest prior charges for similar deliveries (`qe_pattern_embeddings`).

All writes are **appends** to existing stores — never destructive to `memory.db`.

## Improvement over time (ADR-124 M0.C)

- **Probe-set promotion:** track each probe's historical **mutant-kill rate**;
  promote high-kill probes, retire dead ones (stored under a `qe-court/probes` namespace).
- **DoE-gated scoring:** emit a numeric score ONLY if its rubric passes the ADR-122
  ANOVA screen (it must actually discriminate). Otherwise report the verdict class +
  charges, no number — never a noise "91/100".
- **Learnable overturn depth K:** start K=2; learn per-domain the depth at which new
  charges stop appearing (the empirical loop-until-dry tail).

## Anti-collusion invariants (enforce these or it isn't a court)

1. **Writer ≠ any juror.** 2. **Prosecutors file blind.** 3. **Overturn is asymmetric**
(SHIP must survive escalation; BLOCK needs one surviving fatal charge). 4. **No un-validated scores.**

## How to run it (today)

QE-Court is an orchestration skill: the driving agent convenes the court by
composing existing agents/skills — there is no monolithic binary yet (a thin
`aqe court` CLI wrapper is planned as ADR-124 Phase 1; the hosted `/v1/qe/verdict`
is Phase 2). To run a court now:

1. Read `config.json` for the panel + `routing` + `overturnDepth`.
2. Spawn the prosecutors **in one message, in parallel** (`Task`/`Agent`,
   `run_in_background: true`), each with its routed provider; run
   `codex exec review` for the cross-vendor lens via Bash.
3. Collect charges → run the blind-refuter kill round (`adversarial-verify`).
4. Jury (two-gate judge) → verdict. If SHIP, run the overturn loop to `overturnDepth`.
5. Emit the signed court record; persist learning per the section above.
6. Present the strongest case FOR and AGAINST to the human judge.

## Output: the court record

Markdown: the delivery under review, the Defense case, each prosecutor's surviving
charges (provenance-tiered, with the vendor that filed them), the kill-round
casualties, the jury verdict, the overturn transcript, and the signed verdict block.
Durable, attestable evidence — the "jury waiting for everything you ship."

## Trust tier

**Tier 3 (verified).** The court's falsifiable invariants are enforced in code
(`src/skills/qe-court/referee.ts`) and covered by an oracle suite
(`tests/unit/skills/qe-court/referee.test.ts`) that the acceptance eval
(`evals/qe-court.yaml`, command-eval mode) runs through the `aqe eval` CLI —
6/6 green as of 2026-07-18. The keystone oracle: a seeded mutant a shallow panel
rated SHIP is overturned to BLOCK when the overturn round is active, and MUST
regress to SHIP at `overturnDepth: 0` — proving the mechanic carries its weight.
Run it yourself: `aqe eval run --skill qe-court --model cognitum-low`.

## Related

- Reference implementation of ADR-124; hosted sibling is `/v1/qe/verdict` (Cognitum, planned).
- Prosecutors: `/brutal-honesty-review`, `/sherlock-review`, `qe-devils-advocate` agent, `codex exec review`.
- Verification core: `src/verification/adversarial-verify`. Signer: `src/learning/qe-flywheel/receipt.ts`.
- Jury/rigor: ADR-117 (frozen anchor), ADR-119 (two-gate judge), ADR-121 (provenance), ADR-122 (DoE).
- Contrast: `/code-review`, `/pr-review` (single-lens); `qcsd-cicd-swarm` (phase gate, not adversarial court).
