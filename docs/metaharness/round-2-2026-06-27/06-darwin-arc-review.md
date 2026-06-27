# Round-2 MetaHarness Re-Evaluation — Darwin / Benchmark Arc Review (Eval Pillar, Report 06)

**Reviewer:** AQE researcher (eval pillar)
**Date:** 2026-06-27
**Subject:** `/workspaces/agent-harness-generator` @ HEAD `5f63ac6` (branch `claude/darwin-mode-evolve-polyglot`)
**Scope:** ADR-180/181/182/183/184/185/190/192/194/195/196 + `packages/darwin-mode/LEARNINGS.md` (62 sections, 1221 lines) + README leaderboard (~L290–356) + committed submissions/results artifacts.
**Method:** mirror how we fact-checked DRACO vs ADR-038 — assess each major CLAIM against the arc's *own* evidence; credit honest negatives, flag overselling. Cross-reference our prior D3 conclusion ("the coder binds, not the oracle"; cheap-local ≪ frontier; escalation-lane ≈ frontier within noise).

---

## TL;DR verdict

**The arc holds up to its own evidence — it is, if anything, the most epistemically disciplined research log I have audited in this repo.** The headline claims are substantiated with real n, Wilson CIs, replication, and committed prediction artifacts; the over-claims that *do* exist are in the forward-looking ADRs' imported-from-paper projections (ADR-185/190), which the LEARNINGS log then *measured and walked back itself*. The number of honestly-published negatives, voids, and self-corrections (cheap-Pareto falsified, sniper refuted, two VOID trace runs, Pro eval-artifact retraction, xcascade regression-to-mean) is large and is the single strongest credibility signal.

**On our D3 question:** the arc **confirms and sharpens** our prior conclusion. "The coder binds, not the oracle" (§11) is the canonical source of the phrase we adopted; cheap-local ≪ frontier is reconfirmed at n=300/n=500 and on enterprise repos; and the escalation-lane ≈ frontier result is *extended* with a precise mechanism — escalation closes the gap only to the extent the conformant gate detects cheap failures, which is exactly why QE (with an objective execution oracle that catches both empty *and* wrong) gets closer to frontier than SWE-bench's conformant cascade does.

---

## 1. Claim-by-claim assessment (substantiated / point-estimate / asserted)

I graded each per the brief: **(a)** substantiated with n + CI; **(b)** a point estimate dressed as significance; **(c)** asserted. Honest negatives are credited separately in §2.

| # | Claim | Source | Grade | Evidence |
|---|---|---|---|---|
| 1 | **GLM→Opus empty-patch cascade = 51.3% Lite (n=300)** | LEARNINGS §28; submission REPORT.md | **(a)** | 154/300, Wilson [45.7, 56.9], $0.267/inst. **Committed preds: `submissions/swe-bench-lite/darwin-glm-opus-cascade/all_preds.jsonl` = 300 lines**; REPORT.md states "154/300, 35 no-generation, 0 missing logs". **Independently replicated** (§35b ecascade = 50.7%, 152/300; pooled 306/600 ≈ 51.0%). This is the arc's load-bearing claim and it is rock-solid. |
| 2 | **Cascade = 55.6% Verified (n=500)** | §47; README L~294; verified submission | **(a)** | 278/500, Wilson [51.2, 59.9], official `swebench` gold eval. Committed preds = **499 lines** (claim says 500; 447 completed — the 1-line gap and "completed 447" are disclosed in §47, not hidden). Cost ~$0.15/inst flagged **"(est.)"** because per-instance cost isn't in preds — an honest hedge, not a fabricated figure. |
| 3 | **Terminal-Bench: deepseek full-80 = 21.2%** | §59 | **(a)** | 17/80, Wilson [13.7, 31.4]; band-split monotone (hard 2/24, med 9/44, easy 6/12). **Eval-validated** (oracle agent → 100% PASS, nop → 0% FAIL on hello-world) *before* trusting the number — the §42 discipline applied. Harness-vs-solver honesty is explicit: several misses are env/timeout failures, not solver misses. |
| 4 | **Terminal-Bench: Sonnet-4.5 hard-band ceiling = 25%** | §59 | **(b), honestly flagged** | 6/24, Wilson [12.0, 44.9] — small-n, called "directional". Crucially the text states **6/24 is a FLOOR**: Sonnet lost 2 tasks the cheap base *passed* purely to 60s test-command timeouts → "true ceiling plausibly 8/24". A point estimate, but the hedging is exactly right and it is not dressed as significance. |
| 5 | **trace-localization lift** | §56, §62; ADR-196 | **honest near-null (credit)** | §62: +1.0pp (157/300 implied), Wilson [46.69, 57.92] — **explicitly WITHIN the CI**; fire-rate 31/35, K=3 cracks on the 35 by-construction give-ups. The arc's own verdict: "trace-localize does NOT lift the shipped Lite-300 number beyond noise … Recommend NOT updating the 51.3% submission on K=3 alone." This is the *opposite* of overselling. **Caveat:** the cited artifact dir `bench/swebench/runs/trace-localize-35/` exists but is **empty and untracked** at this snapshot — the §62 result is the one headline lacking committed preds (see §4 below). It is correctly **absent from the README leaderboard table**, so no shipped surface over-claims it. |
| 6 | **Opus+GLM xbo = 72% (the "conformant SOTA shot")** | §32/§33, §36 | **(b) → honestly demoted** | 18/25 (n=25), "directional, needs n=300". When the n=300 confirm was attempted it **failed** — the Opus arm hit the $20 cost cap at 63/300 and silently degraded to a GLM-dominated blend (§36). The arc's response: **"This number is NOT placed on the leaderboard … 72% remains an n=25 result only."** A point estimate that the arc itself refused to promote — model behaviour, not over-claim. |
| 7 | **Empty-patch gate is 100%-precision / "binary ground truth"** | §25/§28 | **(a) by construction** | An empty patch is mathematically 0% resolve, so escalating only empties carries zero regression risk. This is a *definitional* claim, correctly reasoned; the §25 pilot (projected 55%, CI [48,62]) then **held at scale** (51.3%, lower-middle of band). |

**Net:** every claim that reaches the README/leaderboard is grade (a) with committed evidence. The grade-(b) point estimates (Sonnet 25%, Opus+GLM 72%) are explicitly labelled directional/n=25 and were *kept off* the leaderboard. I found **no (c)-asserted claim presented as a result.**

---

## 2. Honestly-published negatives, voids, and self-corrections (the credit column)

This is where the arc earns its trust. Each of these is a finding that *cost compute to produce and undercut a prior hope*, published anyway:

- **§11 — cheap-Pareto FALSIFIED; "the CODER binds, not the oracle."** 2×2+D ablation: DeepSeek coder caps ~12–16% *regardless of oracle quality*; only the Opus coder reaches 33%. "The 'SOTA at pennies' framing is dead." This is the canonical source of the phrase our D3 adopted.
- **§12 — asymmetric Opus-sniper REFUTED.** A single repro-gated Opus shot drove in-loop repro-pass 7→23/25, cost +$25.34, **added ZERO gold resolves** (resolved set ⊆ baseline exactly). Goodhart signature named.
- **§19 — cost-cascade (ADR-182) REFUTED with the repo-test gate.** Gate fires 3.7% vs 34% gold (regression guard ≠ resolution detector); degenerates to expensive Best-of-2. "Did not run full-300 (known-negative)."
- **§20 — judge-validated repro-gate (ADR-183) = moderate** (67% precision, 44% recall); judge counter-measure **inert**; does not beat the champion. ADR-183's own pre-registered "kill it if precision is low" bar (L26–27) was honoured.
- **§35 — xcascade n=300 = 49.0% < cascade 51.3%; "the n=25 xcascade 56% was small-sample optimism."** A direct self-correction of §30.
- **§38 — ADR-190 re-graded LOW-VALUE.** They *measured their own* localization miss rate (0/7 committed patches miss the gold file → ReAct self-localizes) and **deferred their own ADR-190** rather than build it. ADR-190's Status line now reads "Deferred / likely-declined … the retrieve-pipeline bottleneck this ADR targets does not transfer to our agentic architecture." This is the model of an ADR walked back by measurement.
- **§39–§45 — SWE-bench Pro = ~4%, then retracted as an EVAL ARTIFACT, then re-confirmed real.** §39 reported 4%; §41 flagged the eval-infra confound; §42 *fixed* it (gold→5/5, empty→0/5 negative control) and confirmed the 4% was a silent missing-image→False bug; §45 re-ran on the fixed eval and confirmed cheap Pro is "structurally dead" (turn-budget cliff). A full reproduce-first → fix → re-measure loop, published with the embarrassing middle intact.
- **§46 — LiveCodeBench TDR repair = NO lift** (public-sample overfit; `abc384_g` went PASS→FAIL on hidden tests).
- **§48/§49/§50 — escalation-tier sweep + turn-budget = null on Lite.** No cheaper tier matches Opus; doubling turn budget gives no lift. "The cheap-conformant cost-Pareto frontier is FULLY MAPPED."
- **§52 — RuVector-HNSW localization did NOT help, plausibly hurt** (recall@12 2/5, patches 2/5→0/5). Diagnosed the symptom-vs-fix-site anchoring mechanism honestly.
- **§56/§59/§60/§61 — trace-localize: THREE independent silent-null truncation bugs**, each caught by the fire-check, two of which produced **VOID** n=300 runs reported as void rather than spun as "trace gives ~0 lift". The meta-lesson ("a localization signal that silently returns null is indistinguishable from a dead lever") is banked three times.
- **§57 — per-instance config-evolution (ADR-194) cracks 0/25** of the Opus-give-ups with config-only levers; honest scope caveat that direct-Opus/BoN genomes were queued-not-measured.
- **E2 difficulty router (§8 update) — measured null** (5-fold CV AUC 0.505): "don't gate escalation on a learned difficulty score."

That is ~13 published negatives against ~7 positives. The asymmetry is the point.

---

## 3. Where the arc over-reaches (the flags)

These are real but minor, and all confined to *forward-looking ADRs*, never to the measured leaderboard:

1. **ADR-185's central framing — "localization + selection are the true cheap-model bottleneck" — did not survive contact with the repo's own architecture.** The ADR (L15–22) imports paper results (BM25 misses oracle file ~50%; "every point of localization recall ≈ a point of resolve") and projects "ds-v4 34% → 40%+ purely from better localization" (L59). LEARNINGS §38 then *measured* their own miss rate at **0/7** and §52 measured RuVector localization as **null/negative**. To the arc's credit, §38 explicitly re-grades ADR-190 and §53 reframes the bottleneck as "a shared model-reasoning ceiling." But ADR-185 itself still reads more confidently than its subsequent measurements warranted — it is the one document where imported-paper evidence (graded "High, p=0.0017" in its menu table, L29) is for *other systems* and was presented as if it would transfer. **Flag:** ADR-185's ranked-menu lift figures are external projections, not Darwin measurements; the repo's own data contradicts its #1 lever.

2. **ADR-181's "cheap-beats-frontier across models & domains" tagline (L9, L35)** is looser than the measured truth. Cheap does **not** beat frontier (§11, §39); the defensible claim is *cost-Pareto* (competitive resolve, much cheaper) — which the README leaderboard states correctly ("not a SOTA-resolve claim", REPORT.md L1–3). The ADR framing is aspirational where the shipped surface is precise.

3. **Cost figures are escalation-rate × frontier-price, not metered tokens** — disclosed (README "~$0.15/inst (est.)"; §28/§47), but worth restating: the "~56× cheaper than frontier-only" multiplier inherits that estimation. Honest, but not a measured invoice.

4. **The §62 trace-localize artifacts are not committed** (`bench/swebench/runs/trace-localize-35/` is an empty, untracked dir). The cascade submissions *are* fully committed with preds; the most recent result (the HEAD commit's subject) is the least reproducible from the tree. Since it's a within-noise null kept off the leaderboard, the blast radius is nil — but it is the one traceability gap.

None of these rise to the DRACO/ADR-038 pattern (a README selling a "measured" win the benchmark measured the opposite of). Here the README and submissions are *more* conservative than the ADRs, which is the correct direction.

---

## 4. Cross-reference to our prior D3 conclusion — confirm / extend / contradict

Our D3 gate (AQE `06-darwin-qe-self-learning-action-lane.md`) concluded: **(i)** the coder binds, not the oracle; **(ii)** cheap-local ≪ frontier (G-ABORT on "cheap replaces frontier"); **(iii)** the escalation lane ≈ frontier within noise (arm D 81.6 vs B 82.7, combined SE ±3.1, n=30), keeping ~83% of tasks $0-local.

- **(i) CONFIRMED — and we inherited the phrase from here.** §11 is the literal origin of "the coder binds, not the oracle." Our QE D3 reproduced the mechanism on a real test-generation task (frontier − cheap = +29 composite pts at n=30). Same finding, two domains.

- **(ii) CONFIRMED and HARDENED.** SWE-bench: DeepSeek caps 12–16% vs Opus 33% (§11); cheap Pro "structurally dead" at the turn-budget cliff (§40/§45). Our QE: qwen3:8b scored 0/3 baseline-valid; even qwen3:30b best-of-k (67.3) lost to frontier (82.7) by ~15 pts. The 8 GB-floor caveat we recorded is the QE analogue of the §6 / §40 "capability floor below which the harness can't rescue the model."

- **(iii) CONFIRMED and EXTENDED with a sharper mechanism.** The new arc's analogue of our escalation lane is the **empty-patch cascade** (51.3% @ $0.267 vs Opus-single ~60% @ $15+). Note the cascade does **not** reach within-noise of pure frontier on resolve (51.3% vs 60%), whereas our QE arm D **did** (81.6 vs 82.7). The reason is the load-bearing extension: **escalation closes the gap only to the extent the conformant gate detects cheap failures.** SWE-bench's conformant gate is a *binary empty-patch* gate — 100%-precision (§25) but it only fires on empties (~38%), leaving the *reasoning-miss* half (right file, wrong fix — §38: "50% empty + 50% reasoning-miss") un-escalated. QE's advantage, which we flagged in D3 and §62 here reconfirms, is that **an objective execution oracle (run the mutants) catches BOTH empty and wrong-but-runnable patches** — so our escalation fires on the full failure set and lands within noise of frontier, while SWE-bench's conformant cascade cannot escalate the confident-wrong tail cheaply (no gold test in-loop). This is precisely the §10/§44 Goodhart problem ("never gate on the model's own self-test") and our D3 caveat ("benchmark oracle ≠ production oracle; shipped coordinators gate on structural proxies"). **The new arc therefore validates our QE-specific structural escape and explains why our escalation got closer to frontier than theirs.**

- **One genuine extension we should fold back into AQE:** §50/§32/§33 establish that the *only* lever beating single-Opus is **cross-model Best-of-N at N=2 (the two strongest orthogonal models)** — and §31/§23 show a 3rd model *hurts* (the judge's selection precision degrades faster than the wider union helps). Our A12 cross-model bench (n=20, +6 over best single, "first valid one within noise of a judge") is the QE confirmation of exactly this, at the cheap tier. The new data says: at the *frontier* tier the same N=2 rule holds (Opus+GLM 72% = Opus-bo3 72% at 3× lower cost). AQE's value-score / best-of-N work should cap cross-model ensembles at N=2-strongest and prefer cross-model diversity over same-model temperature.

---

## 5. Status vs prior round (Darwin/benchmark arc findings in scope)

| Prior-round / D3 finding | Status | Evidence |
|---|---|---|
| "The coder binds, not the oracle" (we adopted from §11) | **Confirmed (source)** | LEARNINGS §11 (2×2+D ablation); reproduced in our D3 (frontier +29 composite) |
| cheap-local ≪ frontier (G-ABORT on "cheap replaces frontier") | **Confirmed / hardened** | §11, §39/§40/§45 (Pro cliff); our D3 qwen3:8b 0/3, 30b 67.3 < 82.7 |
| escalation-lane ≈ frontier within noise | **Confirmed + extended** | §28 cascade 51.3% (committed preds); gap-to-frontier explained by gate coverage (§38 empty-vs-reasoning split); QE execution-oracle is the structural escape |
| cross-model BoN sweet-spot = N=2 strongest | **New, strong** | §23/§31 (3 models hurt judge); §32/§33 (Opus+GLM 72% = Opus-bo3, 3× cheaper); our A12 confirms at cheap tier |
| ADR-190 AST-mincut localization (a lever we considered) | **Deferred by their own measurement** | §38 (ReAct self-localizes 7/7); ADR-190 Status = "Deferred / likely-declined" |
| Cost-cascade conditional Best-of-N (ADR-182) | **Refuted by own evidence** | §19 (repo-test gate fires 3.7% vs 34%); honestly recorded, no full-300 spent |
| Judge-validated repro-gate (ADR-183) | **Pilot answered negative** | §20 (67%/44%, judge inert, doesn't beat champion); pre-registered kill-bar honoured |
| SWE-bench Pro cheap-cascade viability | **Refuted (with eval-artifact retraction loop)** | §39→§42→§45 (eval bug found+fixed; cheap Pro structurally dead) |
| trace-localization as a hard-tail lever (ADR-196) | **Within-noise null, honestly published** | §62 (+1.0pp inside Wilson CI; not promoted to submission); artifacts uncommitted (minor) |
| README "DRACO-style" overclaim risk (the ADR-038 pattern) | **Not present in this arc** | README/submissions are *more* conservative than the ADRs; leaderboard rows are conformant + CI'd + committed |

---

## 6. Final message to team lead

**The new Darwin/benchmark arc holds up to its own evidence** — the leaderboard claims (51.3% Lite n=300, 55.6% Verified n=500, 21.2% Terminal-Bench n=80) are grade-(a) with Wilson CIs, replication, and committed prediction files; the only over-reaches are forward-looking projections in ADR-185/190 that the LEARNINGS log itself measured and walked back, and ~13 published negatives/voids (cheap-Pareto falsified, sniper refuted, two VOID trace runs, Pro eval-artifact retraction) make this the most honest research log in the repo. **It confirms our D3 conclusion and sharpens it:** "the coder binds, not the oracle" is reconfirmed at scale, cheap-local ≪ frontier is hardened, and the escalation-lane ≈ frontier result is extended with the precise mechanism that escalation only closes the gap as far as the conformant gate detects cheap failures — which is exactly why QE's objective execution oracle (catching empty *and* wrong patches) lets our escalation lane reach within-noise of frontier where SWE-bench's empty-only conformant cascade tops out ~9 pts below it. Net revision to D3: none to the verdict; one addition — cap cross-model ensembles at N=2-strongest (§23/§31/§32), which our A12 already corroborates.
