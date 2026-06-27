# Six Thinking Hats: AQE ↔ MetaHarness Cross-Pollination — Round 2

**Question under analysis:** *After 467 commits, what should still flow between AQE and MetaHarness, in which direction, and is it worth it?*

**Method:** Edward de Bono's Six Thinking Hats, parallel-thinking, grounded in a file-level audit of both repos at their current heads. Prior-round claims and briefing claims were **verified, not trusted**.

**Date:** 2026-06-27
**Repos audited:**
- AQE `/workspaces/agentic-qe` (branch `working-june`)
- MetaHarness `/workspaces/agent-harness-generator` @ `5f63ac6` (`v0.1.15-467-g5f63ac6`, branch `claude/darwin-mode-evolve-polyglot`)

**Prior reports diffed:** [`04-six-hats-cross-pollination.md`](../04-six-hats-cross-pollination.md) (2026-06-15), [`05-cross-pollination-goap-plan.md`](../05-cross-pollination-goap-plan.md), [`06-darwin-qe-self-learning-action-lane.md`](../06-darwin-qe-self-learning-action-lane.md), [`07-darwin-qe-cost-and-results-summary.md`](../07-darwin-qe-cost-and-results-summary.md).

---

## The headline shift since round 1

Round 1's thesis was *"they compose, not overlap — MetaHarness is the factory, AQE is the deep content."* That framing is now **partly obsolete**. In the 467 commits since, the two repos stopped being disjoint and **independently converged on the same engineering thesis from opposite directions**:

- **AQE built it bottom-up from the QE objective** — the asymmetric escalation lane (cheap-first → local repair → best-of-k → escalate the hard tail), an objective-oracle Goodhart guard, cross-model best-of-N, and a cost-Pareto value score. All **measured** on QE (D3, n=30, 5 modules; A12, n=20). Graduated to **ADR-111 (Accepted-scoped)**.
- **MetaHarness built it top-down from the DRACO benchmark** — `@metaharness/router` (k-NN + KRR cost-optimal predictor), ADR-182 cost-cascade conditional Best-of-N, ADR-183 judge-validated repro gate (Goodhart counter), ADR-184 genome engine that *evolves the routing config*, ADR-179/181 cost-Pareto fleet/leaderboard.

This is no longer "factory vs content." It is **two measured implementations of one cost-Pareto-routing-plus-objective-verification design.** The cross-pollination opportunity has shifted from *"compose the products"* to *"AQE consumes the pieces MetaHarness has productized that AQE planned-but-never-built, and both cite each other as independent confirmation."*

---

## Grounding corrections (read this first)

| Claim (briefing / prior) | Verified reality at 5f63ac6 | Source |
|---|---|---|
| "darwin-mode self-evolving (genome/pareto/safety/clade/epistasis)" | **Real, dependency-free, deterministic, and large.** `pareto.ts` (paretoFront), `safety.ts` (7-file self-mod boundary, ADR-071), `clade.ts` (HGM metaproductivity parent selection via seeded Beta-Thompson), `epistasis.ts` (learned surface-linkage graph), `scorer.ts` (frozen 6-term + 4-clause gate, ADR-072) | `packages/darwin-mode/src/{pareto,safety,clade,epistasis,scorer,types}.ts` |
| "vertical:qe more concrete now?" | **No QE vertical exists.** `grep -rniE 'vertical[:-]?qe'` across `packages/ docs/ README.md` = **zero hits**. Only `vertical-base` (the contract) + `vertical-trading` (one concrete pack) ship | `packages/vertical-base/src/index.ts`, `packages/vertical-trading/`; grep empty |
| "router/sdk reusable by AQE?" | **Router: yes, and it's the missing piece.** `@metaharness/router@0.3.2` is **published, MIT, pure-TS, zero hard deps** (`@ruvector/tiny-dancer` is an *optional* peer). Ships BOTH k-NN (`index.ts`) and learned KRR (`train.ts`, ADR-043, λ via LOO-CV). SDK bakes AQE's 3-tier ADR-026 into `defineAgent` (`Tier='codemod'\|'small'\|'frontier'`) | `packages/router/package.json`, `packages/router/src/{index,train}.ts`, `packages/sdk/src/index.ts` |
| AQE has a learned per-query quality predictor | **AQE does NOT.** `qe-task-router.ts` does *agent* selection by static keyword maps + capability-text cosine (`computeRealEmbedding`); its "confidence" is `combinedScore`, **never learned from outcomes**. No KRR/ridge anywhere (`grep` hits are MinCut "kernel" false-positives). This is exactly why router confidence is stuck ~40% | `src/routing/qe-task-router.ts:53-337`; `grep -rliE 'ridge\|krr'` = none in routing |
| AQE has the routing-outcome data the router needs | **Yes — both inputs already exist.** `routing_outcomes` (ADR-095) records `(usedAgent, quality_score, success)` per task; `qe-task-router` already computes query embeddings | `src/routing/routing-feedback.ts:38-231`, `qe-task-router.ts:475-493` |
| DRACO-for-QE gate "unrun" (prior round) | **RUN and resolved.** D3 n=30: generic cheap-replaces-frontier = **G-ABORT** (coder-binds, B−C +15.4); escalation lane = **Pareto win** (D 81.6 vs B 82.7, within noise, ~83% tasks $0). vertical:qe (A6) **RETIRED** | `docs/metaharness/06-...md` §"D3 fixture-diverse"; `prototype/d3-proof.mjs` |

---

## 🤍 White Hat — Facts & Data

1. **`@metaharness/router` is the productized form of AQE's A10 action — which AQE never built.** A10 (plan-05, 2026-06-17): *"lift KRR + k-NN quality predict into AQE's model_route; AQE router confidence sits at ~40% across 2165 requests."* Status: **NOT STARTED** (plan-05 status table). MetaHarness has since shipped exactly this as a published package: `Router.fromExamples(rows, prices, {qualityBar})` predicts each candidate's quality on a *new* query via k-NN (or regularised KRR), returns the cheapest clearing the bar. Inputs = `{embedding, scores:{model→quality}}` + a price table — **the exact shape AQE's `routing_outcomes` + `computeRealEmbedding` already emit.**

2. **Four independent convergences, all verified in code:**

   | Concept | AQE (bottom-up, QE-measured) | MetaHarness (top-down, DRACO) |
   |---|---|---|
   | Cost-cascade / conditional Best-of-N | `FreeTierEscalatingExecutor` cheap→repair→escalate (lane-06 D7-D9) | **ADR-182** `--cascade`; tier1→gate→escalate failures |
   | Cold escalation (not warm) | A12 verified: `executor.ts:248-251` builds escalated tier from `req.messages`, cold | **ADR-182** "Cold tier-2 … warm-start risks correlated failure, shrinking the union" |
   | Best-of-N union value | A12 cross-model best-of-N +6 composite (n=20) | ADR-182/§18 "Best-of-3 = 39.7%, union ceiling 45%" |
   | Writer≠evaluator Goodhart guard | `oracleKind:'objective'\|'self-authored'` + adversarial-verify blind refuters; A11 judge 88.9% vs gold | **ADR-183** `reproValid ∧ judgeOK ∧ passOnFix`, "writer ≠ evaluator", kill if judge doesn't separate gold-pass/fail |
   | Cost-Pareto value score | `src/routing/value-score.ts` `valueScore`/`paretoFrontier` (A13) | **ADR-179/181** Value Score `w·resolve% + (1-w)·cheapness`; `darwin-mode/pareto.ts` `paretoFront` |

3. **One thing MetaHarness has that AQE planned but does not have: a genome engine that *optimizes* the routing config.** ADR-184 `evolve-arch.mjs` evolves a config genome `{model, mode(single\|bo3\|cascade), escalate, judge, maxSteps}` toward the Value Score with a **2-phase statistical-overfitting gate** (small-slice filter → larger-slice CI-gated promote) + an LLM-as-mutation-operator firewalled from promotion. AQE has the *fitness* (`value-score.ts`) and the *data* (`routing_outcomes`) but **hand-tunes** `{bestOfK, repairAttempts, tierOrder, candidateProviders, oracleKind}` — it evolves nothing (`grep genome\|evolve src/routing` = empty but for a comment).

4. **vertical:qe is still vapor, and the gate says keep it that way.** No QE vertical exists; D3 confirmed the generic composite G-ABORTs. The reusable substrate (SDK tiered `AgentDef`, router) exists for AQE's *real* product (ADR-111 escalation lane), not for a generic minted vertical.

5. **The router is dependency-free.** `peerDependenciesMeta.@ruvector/tiny-dancer.optional = true`; core k-NN/KRR are pure TS ("no native deps — runs anywhere"). This **sidesteps the entire A9 optional-dep/Dependabot fragility class** — AQE can vendor or depend on it with zero native-rebuild risk.

---

## 🖤 Black Hat — Risks & Cautions

1. **Axis mismatch trap.** `@metaharness/router` routes *query → cheapest model*. AQE's `qe-task-router` routes *query → which qe-specialist agent* — a **different axis**. Naively wiring the router into the agent router would be a category error. The router maps to AQE's **model-tier** decision (the escalation lane's start-tier + `value-score`), not the agent selector. Get this wrong and you "fix" the wrong 40%.

2. **A learned start-tier predictor can *erase* the escalation lane's safety net.** The lane's whole virtue is that it's reactive: try cheap, escalate on objective-oracle failure — *it cannot ship a bad answer because the oracle gates it*. A predictor that "skips" the cheap tier on a query it predicts will fail is **speculative**; if the predictor is wrong, you pay frontier on a task the cheap tier would have solved (lost savings) or — worse — you let the predictor *replace* the oracle gate and re-import Goodhart. The router must **only choose the entry tier; the objective oracle must remain the acceptance gate.** (D3 already showed the cheap tier escalates every time on hard modules — a predictor saves the *wasted local attempts*, nothing more.)

3. **Cold-start: the router needs labelled data AQE's production path doesn't yet truthfully emit.** D3's honest caveat: the shipped coordinators gate on **structural proxies** (test+assertion regex), not the run-the-mutants oracle. So `routing_outcomes.quality_score` in production is only as trustworthy as that proxy. Training a KRR on proxy-quality risks a predictor that optimizes for "looks like a test," not "kills mutants." **The execution-oracle-in-the-hot-path gap (open work in lane-06) is a prerequisite for trustworthy router training, not a nice-to-have.**

4. **Genome-engine adoption (ADR-184) is seductive opportunity-cost.** Auto-tuning the escalation config is *fun* and *meta*, but AQE's config space is tiny (~5 knobs) and already measured. A 2-phase evolutionary search over 5 hand-validated knobs is likely to rediscover the hand-tuned values at real GCP cost. The genome engine earns its keep only once the config space is large (many models × modes × per-repo) — which is the cost-Pareto *fleet* (ADR-181), not AQE's current single-lane.

5. **Pre-1.0 coupling, again.** `@metaharness/router@0.3.2` is a fast-moving pre-1.0 package (same risk class A8 flagged for `@metaharness/darwin`). Depending on it re-introduces version-skew. **Mitigation is easy here precisely because it's pure-TS and tiny** — vendor the ~2 files (k-NN + KRR) under `src/routing/` with a provenance pin + a drift-guard test (the A8 pattern AQE already uses for the Darwin ScoreCard mirror), rather than a live dependency.

6. **Darwin clade/epistasis/safety are mostly inapplicable now.** They are GA-internals for evolving harness *code surfaces*. AQE prototyped that (D6 `customScore`) but the gate **G-ABORTed code-evolution**. Adopting clade/epistasis would be building machinery for a product the evidence said not to build. Only `scorer.ts`/`safety.ts` concepts matter, and AQE already mirrors the ADR-072 gate (lane-06 D6 `applyQePromotionGate`).

---

## 💛 Yellow Hat — Benefits & Value

1. **The single highest-value move just got de-risked from "build" to "wire."** A10 was scoped **M, med-risk** ("build KRR + bandit"). It is now: consume a published, pure-TS, dependency-free package whose input shape AQE already produces. That is an **S, low-risk** action that addresses AQE's most concrete, longest-standing metric problem — routing confidence stuck at ~40% across 2165 requests — with machinery validated on DRACO ("beat the best fixed model; gap to oracle shrinks monotonically with data").

2. **The convergences are co-marketing gold and mutual de-risking.** Two independent teams, opposite starting points, same five design conclusions (cold cascade, best-of-N union, writer≠evaluator, objective-oracle gate, cost-Pareto value score) — *each measured on a different benchmark* (SWE-bench vs QE mutation-kill). That is the strongest possible evidence that the design is real and not benchmark-overfit. AQE's ADR-111 and MetaHarness's ADR-182/183 should **cite each other as cross-domain replication.**

3. **AQE's adversarial-verify is now provably the ecosystem's verify primitive — and ADR-183 hands AQE its missing calibration recipe.** A2 extracted the blind refuters; the remaining open step was *empirical false-kill calibration on a labelled corpus*. ADR-183's methodology is exactly that recipe: **measure the gate's precision against gold** (does gate-positive predict resolved? does judgeOK improve precision over no-judge? kill if it doesn't separate). AQE's `calibrate.ts` should adopt ADR-183's precision-against-gold protocol verbatim. A11 already ran the writer≠evaluator half (deepseek-v3.2 judge = 88.9% vs mutation-kill gold) — it just needs ADR-183's framing to close.

4. **The SDK validates AQE's 3-tier model (ADR-026) as the right abstraction.** `defineAgent({tier:'codemod'\|'small'\|'frontier'})` is AQE's Agent-Booster/Haiku/Sonnet ladder made declarative. If AQE ever ships ADR-111 *as* a harness, the SDK + router are the turnkey substrate — and the AgentDef tier maps 1:1 to the escalation ladder.

5. **Who wins now:**
   - *AQE*: a learned router that lifts the 40% (consume `@metaharness/router`); a calibration recipe for adversarial-verify (ADR-183); cross-domain validation of ADR-111.
   - *MetaHarness*: QE as the second measured domain confirming ADR-182/183 (its findings stop being SWE-bench-only); AQE's adversarial-verify as the dependency-free verify primitive its ADR-183 judge gate wants.

---

## 💚 Green Hat — Creativity (NEW, beyond round 1)

Ranked by novelty × feasibility:

1. **Predictive start-tier for the escalation lane (router) + reactive oracle gate (keep).** Wire `@metaharness/router` as a *front door* to `FreeTierEscalatingExecutor`: predict per-query the cheapest tier likely to clear the bar (skip the doomed cheap attempt on hard modules D3 showed always escalate), then let the *unchanged objective oracle* gate acceptance. Predictor chooses the entry point; oracle keeps the safety. Trained from `routing_outcomes` via `Router.fromExamples`. This is A10, finally cheap.

2. **A cross-domain replication note ("the same five levers").** A short joint artifact: AQE-on-QE and MetaHarness-on-SWE-bench independently measured cold-cascade, best-of-N union, writer≠evaluator, objective-oracle gate, cost-Pareto value. Publish the table. It's the most credible thing either team can say about routing.

3. **ADR-183 precision-against-gold → AQE's `calibrate.ts`.** Close A2's last open step using ADR-183's exact protocol; AQE's mutation-kill ground truth is the gold the SWE-bench gate lacked — AQE can do this *better* than MetaHarness can.

4. **Feed AQE's QE economics into the cost-Pareto fleet (ADR-181/179).** AQE's `MEASURED_QE_TEST_GEN` snapshot (qwen3:30b on the frontier, qwen3:8b dominated) is exactly a Value-Score row. Contribute QE as a board tab in `assets/swe-pareto.json` — QE is the cleanest objective-oracle domain on the leaderboard.

5. **Genome-engine (ADR-184) only at fleet scale, later.** Defer until AQE's config space is large (per-repo × multi-model). Then `evolve-arch.mjs`'s 2-phase overfitting gate is the right tool over AQE's `value-score` fitness. Not now.

---

## ❤️ Red Hat — Intuition

- **Strong pull:** consuming `@metaharness/router`. It feels almost unfair — AQE wrote the plan (A10), described the exact algorithm, then someone else shipped it as a tidy dependency-free package whose inputs AQE already emits. Picking it up is the obvious, energizing move.
- **Satisfying:** the convergence table. There's a real "we both found the same thing from different ends" thrill, and it's *earned* (both measured, different benchmarks).
- **Suspicious:** anything that lets a predictor replace the objective oracle. The whole reason QE works where DRACO failed is the pure-code gate. Trading it for a learned confidence score to chase the 40% would be self-sabotage. Keep the oracle; let the router only pick the door.
- **Quiet unease about the genome engine.** It's the most impressive thing in darwin-mode and the least useful to AQE right now. Building it would feel productive and be opportunity-cost. Resist.
- **Net:** the small consume-and-cite moves (router, ADR-183 calibration recipe, replication note) feel right and cheap. The big machinery (genome, clade, vertical:qe) feels like someone else's road, correctly not taken.

---

## 🔵 Blue Hat — Refreshed leverage table

| # | Move | Direction | Effort | Risk | Why | Status |
|---|------|-----------|--------|------|-----|--------|
| 1 | **Consume `@metaharness/router` as a learned start-tier predictor for the escalation lane** (vendor pure-TS k-NN+KRR; train from `routing_outcomes`; oracle stays the gate) | B→A | **S** | Low | Productized form of A10; fixes the stuck-~40% confidence; inputs already emitted; dependency-free (sidesteps A9) | **NEW — STILL-OPEN (was A10, "build", now "wire")** |
| 2 | **Adopt ADR-183 precision-against-gold protocol in AQE's `calibrate.ts`** to close adversarial-verify's last empirical step | B→A (method) | **S** | Low | AQE's mutation-kill is the gold SWE-bench lacked; A11 already ran the judge half | **NEW — STILL-OPEN** |
| 3 | **Cross-domain replication note** (the five convergent levers; mutual citation ADR-111 ↔ ADR-182/183) | both | **S** | Low | Strongest credibility artifact for both; near-zero cost | **NEW — STILL-OPEN** |
| 4 | **Contribute QE as a Value-Score board tab** (ADR-181/179) using `MEASURED_QE_TEST_GEN` | A→B | **S–M** | Low | QE is the cleanest objective-oracle domain for the cost-Pareto fleet | **NEW — STILL-OPEN (needs Ruv's OK, cross-repo)** |
| 5 | extract `@ruvector/adversarial-verify` | A→shared | M | Low | — | **PRIOR — DONE (A2, in-repo 2026-06-25; publish pending OK)** |
| 6 | `mcp-scan` AQE → default-deny allowlist + CI gate | B→A | S | Low | — | **PRIOR — DONE (A1, 2026-06-24; 0 HIGH, CI gate)** |
| 7 | DRACO-for-QE benchmark (the gate) | both | M | Low | — | **PRIOR — DONE (D3 n=30; generic composite G-ABORT, escalation lane Pareto-win)** |
| 8 | `vertical:qe` minted harness | both | L | High | DRACO repeats for generic composite | **PRIOR — RETIRED/OBSOLETE (G-ABORT confirmed; SDK+router are the substrate for ADR-111 if ever shipped)** |
| 9 | genome → auto-recommend QE skill subset | both | M | Med | per-repo tuning AQE lacks | **PRIOR — STILL-OPEN (A4, not started; standalone value remains)** |
| 10 | **Adopt darwin-mode genome engine (ADR-184) to auto-tune escalation config** | B→A | M | Med | AQE has the fitness+data but hand-tunes | **NEW — DEFER (config space too small; revisit at fleet scale)** |
| 11 | adopt darwin clade/epistasis/safety (code-surface GA) | B→A | M–L | High | code-evolution was G-ABORTed | **NEW — DECLINE (machinery for a retired product)** |
| 12 | `witnessVerify` w/ AQE Ed25519 chain | A→B | L | Med | real provenance | **PRIOR — STILL-OPEN (A7, not started)** |

### Recommended sequence

```
Now (parallel, cheap, decoupled):   #1 router-as-start-tier  +  #2 ADR-183 calibration  +  #3 replication note
Next (cross-repo, needs OK):        #4 QE Value-Score tab     |  #9 genome→skill recommender (standalone)
Prerequisite for #1 to be honest:   close lane-06's execution-oracle-in-hot-path gap (else you train on proxy quality)
Defer / decline:                    #10 genome engine (fleet-scale only), #11 clade/epistasis (retired product)
```

### Is the composite still worth it?

The **generic `vertical:qe` composite is dead** (D3 confirmed G-ABORT — not a guess anymore). What survived is better: **AQE's real product is the escalation lane (ADR-111), and MetaHarness has independently productized the one component AQE was missing (the learned router).** The worthwhile cross-pollination in round 2 is *not* a composite product — it's AQE consuming a dependency-free package to finish A10, both teams citing each other's independent measurement, and AQE using ADR-183 to finish calibrating its verify primitive. Cheap, decoupled, evidence-backed — exactly the "floor" the GOAP plan said to ship regardless.

---

*Prepared via Six Thinking Hats parallel analysis. All asset/gap claims grounded in file-level audit of both repos at their current heads (AQE `working-june`; MetaHarness `5f63ac6`). Briefing figures corrected where source disagreed. No repo code executed beyond read-only inspection (`npm view`, `git log`, `grep`); no files in either repo modified beyond writing this report.*
