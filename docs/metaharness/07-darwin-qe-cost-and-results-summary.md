# Darwin-for-QE — Cost Reduction & Plain-English Results

**Companion to:** [`06-darwin-qe-self-learning-action-lane.md`](./06-darwin-qe-self-learning-action-lane.md)
**Date:** 2026-06-26. **Status:** summary of measured benchmarks (D3 gate + A12/A13).
**Grounded in:** the D3 fixture-diverse gate run (n=30, 5 modules), the A12 cross-model bench (n=20), and `src/routing/value-score.ts` (`MEASURED_QE_TEST_GEN`, snapshot 2026-06-24).

> These are **measured** numbers from our own test-generation runs, not vendor claims. One known caveat: cost is estimated from the **escalation rate × frontier price**, because the harness doesn't yet count tokens. Treat the percentages as well-grounded estimates, not invoices.

---

## TL;DR — estimated cost reduction

**For AI test generation, with the free local tier enabled: roughly a 70–85% cut in paid-LLM spend, at ~96–98% of frontier quality.**

| Setup | Paid LLM cost per task | Quality (composite 0–100) |
|---|---|---|
| **Frontier only** (sonnet-4.6 every time) | **$0.045** (baseline = 100%) | 82.7 |
| **Escalation lane** (cheap-local first, escalate the hard tail) | **~$0.0077** (≈ **17%** of baseline) | 81.6 |

- **Cost reduction ≈ 83%** on the diverse 5-module corpus (escalated **5 of 30** tasks).
- **Cost reduction ≈ 70%** on the single-fixture run (escalated **3 of 10** tasks).
- **Quality stays within noise of frontier:** 81.6 vs 82.7 (gap 1.1, combined SE ±3.1).

**Honest range:** the escalation rate has a wide confidence interval (Wilson 95% on the n=10 run was [11%, 60%]), so the realistic savings band is roughly **40–85%** depending on how hard your code is to test. The point estimate on the larger, more varied run is the ~83% figure.

---

## How the savings actually work

The cheap local model (qwen3:30b-a3b) costs **$0** to run. The expensive frontier model (sonnet) costs **$0.045 per task**. The escalation lane does this:

1. **Try the free local model first.** If it writes a valid, passing test suite → **done, $0.**
2. **If it fails, repair locally** (still free) — feed the failure back, retry.
3. **Only if that still fails, escalate to the paid frontier model.**

So you only pay frontier prices for the **minority of tasks the free model can't handle** (~17% on our corpus). The other ~83% are free.

```
Pure frontier:     pay $0.045   ████████████████████  (every task)
Escalation lane:   pay $0.0077  ███                   (only the hard ~17%)
                              ↑ the other ~83% are handled free locally
```

**Where the saving is biggest:** simpler modules. On `stats` the free model needed **zero** escalations; on `pricing` it needed 2 of 6.

---

## How we tested (our approach, and why)

**The core idea: never trust a model to grade itself.** We measured quality with an *objective, code-only oracle* — no LLM judging another LLM. That's the whole reason QE is the right place to do this: a generated test suite is either good or not, and we can prove it by running it. (Reproducible script: `docs/metaharness/prototype/d3-proof.mjs`.)

### What we measured (the oracle)

For each module, the worker model writes a complete test suite. We then score it with **two real, deterministic signals** (the ADR-104 "arena" method):

1. **Mutation kill-rate** — we deliberately inject small bugs into the source (an "off-by-one", a flipped operator, a swapped branch — these are *mutants*), then run the generated tests against each broken version. A good suite turns **red** and "kills" the mutant. The kill-rate is the fraction of injected bugs the tests actually catch. This is the real measure of whether the tests *test anything*.
2. **Branch coverage** — the standard `node --test --experimental-test-coverage` percentage.

Composite quality = **0.6 × kill-rate + 0.3 × coverage**. Everything runs for real: actual model calls, actual `node --test`, actual baseline + per-mutant execution. **Nothing is simulated or estimated.** A suite that doesn't even pass on the *unmodified* code scores 0 (invalid).

> Why this matters: an LLM "judge" can be fooled (Goodhart's law — the model games the grader). Running mutants is pure code; it can't be talked into a good score. The grader is fully decoupled from the writer.

### The controlled experiment (four arms)

To isolate *each* lever, every task was run four ways on identical inputs:

| Arm | Isolates… | Setup |
|---|---|---|
| **A** | the raw cheap model | free local, single attempt |
| **C** | the **best-of-k** lever | free local, k attempts, keep the best by the oracle |
| **B** | the frontier ceiling | paid frontier (sonnet), single attempt |
| **D** | the **escalation** lever | free local first; escalate to frontier only if local is invalid or weak |

A→C tells us what "best-of-2" buys for free. B vs C tells us how far the cheap model is from frontier. D is the actual product. Running all four on the same module + same random seed keeps the comparison fair.

### How we kept it honest

- **Fixture-diverse corpus.** We didn't trust a single example. Final run = **5 distinct modules** (`pricing`, `strings`, `stats`, `validate`, `timefmt` — different shapes: math, string logic, validation, date formatting) × **6 instances each = n=30**. This is what lets us say the verdict *generalizes* rather than being a `pricing`-specific fluke.
- **Equal budgets, both sides.** Both the cheap and frontier arms got the same repair budget (2 retries). An earlier run gave them unequal budgets and *starved frontier* — that produced a misleading "cheap beats frontier" artifact, which we caught and corrected.
- **Real statistics, on the right metric.** We report the composite mean **± standard error** and check whether arms differ by more than ~2 SE before claiming a gap or a tie ("within noise"). We use Wilson confidence intervals on the valid-rate. An adversarial review caught us once citing a *saturated* valid-rate CI to claim a composite tie — we fixed the script to compute SE on the composite itself.
- **Reproducibility.** Fixed seeds, recorded model versions and config, JSON artifact written per run (`/tmp/d3-gate-result.json`).

### Why this approach (rather than a quick eyeball or an LLM rating)

- **QE is objectively gradable.** Unlike open-ended writing, "does this test catch bugs?" has a ground-truth answer we can compute — so we should, and we avoid the trap of one AI flattering another.
- **It's the same discipline that survived Ruv's SWE-bench campaign.** The findings we're standing on ("the coder binds, not the oracle"; "best-of-k beats a single gated shot"; "never gate on the model's own self-written test") were the ones that held up under gold-graded, CI-bounded measurement. We deliberately mirror that method so our QE numbers inherit the same trustworthiness.
- **The arms isolate causes.** Four arms on identical inputs mean a quality difference can be attributed to *one* lever (best-of-k, or model tier, or escalation) instead of a tangle of changes.

### How we evolved the conclusion (the honest arc)

The verdict wasn't reached in one shot — each run fixed a flaw the last one exposed:

1. **Single fixture, n=10** → leaned "PASS", but had the unequal-budget frontier confound.
2. **Equal-budget re-run** → the confound vanished; verdict became "cheap *can't* replace frontier, but the **escalation lane** is competitive."
3. **Fixture-diverse, n=30, with composite SE** → confirmed the verdict holds across 5 different module shapes and added a proper dispersion estimate.

That progression — claim, adversarial review, re-run — is why the numbers above carry caveats instead of hype.

---

## The results, in plain English

We ran four "arms" generating real test suites for 5 different code modules, graded by a real oracle (run the mutants, measure how many bugs the tests catch + coverage). Higher composite = better tests.

| Arm | What it is | Composite | Plain meaning |
|---|---|---|---|
| **A** | Free local model, single try | 58.6 | Decent, but misses too much alone |
| **C** | Free local, **best-of-2** (write 2, keep the better) | 67.3 | A real, free improvement over A |
| **B** | Frontier model (sonnet) | **82.7** | The quality ceiling — but you pay every time |
| **D** | **Escalation lane** (free first, escalate hard ones) | **81.6** | Nearly frontier quality, ~83% of tasks free |

### Three findings, simply

1. **"Best-of-2" works, for free.** Asking the cheap model twice and keeping the better answer lifted quality from 58.6 → 67.3 and turned more invalid attempts into valid ones (73% → 83% valid). It rescued a bad first attempt 7 times out of 30. Costs one extra free local call — only when the first try fails. **Confirmed across all 5 modules.**

2. **The cheap model alone can't replace frontier.** Frontier (82.7) clearly beats the best cheap config (67.3) by ~15 points. Generating good tests for non-trivial code is reasoning-heavy, and that's where small models hit a wall. So the goal isn't "replace frontier with free" — it's "use free where it's good enough, pay frontier only where you must." This is recorded as a deliberate **G-ABORT** on the naive "cheap replaces frontier" idea.

3. **The escalation lane gets ~frontier quality, much cheaper.** Arm D (81.6) lands statistically on top of frontier (82.7) while keeping ~83% of tasks on the free tier. **This is the product** — competitive quality at a fraction of the cost. Not "SOTA for pennies," just a smart Pareto trade.

### Cross-model bonus (A12)

Using **two different free/cheap models** and keeping the best of their outputs beat either one alone: **84.8** vs qwen-alone 63.5 / glm-alone 71.2 (**+6 over the best single model**). They cover each other's blind spots — when one writes an invalid suite, the other often doesn't. A fancy "judge" to pick the winner wasn't needed; simply taking the first valid one was within noise.

---

## Important caveats (don't over-read the savings)

- **The 8 GB / CPU user does *not* get these savings.** The model that clears the quality floor (qwen3:30b-a3b) is **18.6 GB**. The 8 GB-runnable model (qwen3:8b, 5.2 GB) scored **0/3 valid** — below the floor. For small machines, the cheap tier mostly fails and escalates, so savings shrink toward zero. The free win requires a box that can run the 30B model.
- **"Cost" here is escalation-rate × frontier-price**, not measured tokens. Escalated tasks pay the frontier call *plus* the (free) local attempts. The real-money figure needs token accounting, which is open work.
- **Single-domain so far.** Measured on **test generation** (and BDD/Gherkin). The savings apply where work is *bounded generation graded by an objective oracle*. Open-ended analysis/judgement tasks don't qualify — a cheap model can't carry that reasoning.
- **Production gates on a structural proxy, not the full run-the-tests oracle.** The benchmark graded by executing mutants; the shipped coordinators currently check "is this a real test (block + assertion)?" — lighter, so the live quality signal is only as good as that proxy. Closing this gap is tracked.

---

## How to turn it on

Off by default. Opt in per the action-lane doc:

```bash
export AQE_FREE_TIER=1            # enable the free local tier
```
```ts
// or in coordinator config
{ enableFreeTier: true, freeTierModel: 'qwen3:30b-a3b', freeTierBestOfK: 2 }
```

Needs a reachable local model (host Ollama at `host.docker.internal:11434`) or any OpenAI-compatible endpoint (OpenRouter, Groq, cloud Ollama). See [`docs/guides/free-tier-local-models.md`](../guides/free-tier-local-models.md). On any miss the system **falls through to the normal paid path** — enabling it can only save money, never break a task.

---

## Bottom line

- **Enable it on a box that can run the 30B model → expect ~70–85% lower paid-LLM cost on test generation, at ~frontier quality.**
- **On an 8 GB box → little/no savings** (cheap tier falls below the quality floor and escalates).
- The mechanism is sound and measured across 5 diverse modules; the main open items are real token-cost accounting and an execution oracle in the production hot path.
