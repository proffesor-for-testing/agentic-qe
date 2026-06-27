# QCSD Development Swarm — Performance Assessment

**Package:** `packages/darwin-mode` (self-evolution loop)
**Round:** 2 — MetaHarness re-evaluation, 2026-06-27
**Subject snapshot:** `/workspaces/agent-harness-generator` HEAD `5f63ac6`, branch `claude/darwin-mode-evolve-polyglot`
**Assessor:** V3 QE Performance Tester (chaos-resilience domain, ADR-011)
**Note:** New conditional this round — darwin-mode was NOT performance-assessed in working-may. No prior perf report to diff against; "Status vs prior round" is therefore all-NEW.

---

## Scope & method

This is a **code-level performance assessment**, not a load test. The evolve loop's real cost driver (model inference / GPU / sandbox subprocesses at population scale) was not run end-to-end. Where I could execute deterministically, I did (`vitest` perf suite). Everything else is STATIC (read of source at cited `file:line`) or INFERRED (reasoning over the code path), labelled per ADR-105.

ENV: workspace build is RED (missing `@ruvector/tiny-dancer`) — environmental, not fixed. Package-scoped `vitest` runs fine against `src/` via the TS loader.

### Executed evidence

```
$ cd packages/darwin-mode && npx vitest run __tests__/perf/
✓ __tests__/perf/bounds.perf.test.ts (3 tests) 108ms
  [bounds.maxBuffer] elapsed=79ms exitCode=1 timedOut=false stdoutBytes=65536
✓ __tests__/perf/mapLimit.test.ts (3 tests) 884ms
  [mapLimit] concurrency=3 observed maxOverlap=3
✓ __tests__/perf/concurrency.perf.test.ts (1 test) 1693ms
  [concurrency.perf] seq(C=1)=1244ms  con(C=4)=388ms  ratio=0.31
Test Files  3 passed (3) | Tests 7 passed (7)
```

This is a genuinely strong baseline: the package ships its **own** performance regression suite (`__tests__/perf/`) that proves the concurrency primitive, the resource caps, and overlap empirically. That is rare and to its credit.

---

## 1. Concurrency model

**Where parallelism lives — and where it does NOT.**

- **Evaluation is bounded-concurrent.** `mapLimit(items, limit, fn)` (`evolve.ts:71-88`) is a clean order-preserving worker-pool: `width = max(1, min(limit, items.length))` workers pull from a shared cursor. No unbounded `Promise.all` fan-out anywhere in the hot path. EXECUTED: `mapLimit.test.ts` asserts `maxInFlight === limit` (observed `maxOverlap=3` at limit 3); `concurrency.perf` shows C=4 finishes at **0.31×** the C=1 wall-clock. Backpressure is implicit and correct (workers never exceed `limit` in flight). Default concurrency = 4 (`evolve.ts:67`). This is the right design and it is verified. **STRONG.**

- **Mutation/child-generation is FULLY SERIAL.** The generation-build loop at `evolve.ts:289-326` `await`s `createChildVariant` / `createCrossoverVariant` **one at a time** inside nested `for` loops — it is *not* wrapped in `mapLimit`. Each `createChildVariant` (`mutator.ts:329-...`) does `await copyVariantDir` (recursive `cp`, `mutator.ts:310`) **then** `await gen.generateMutation(...)`. With an LLM mutator this means every model call for the whole generation is issued back-to-back, serially. INFERRED (STATIC read of the loop): for an LLM-backed run the generation's wall-clock floor is `parents × childrenPerGeneration × (copy + one model round-trip)`, with **zero overlap** on the model calls. The concurrency win proven above applies only to the *evaluation* half. **This is the dominant scalability gap for any LLM mutator.**

- **No request timeout on the two network mutators.** `OpenRouterMutator.generateMutation` calls `fetch(...)` with **no `AbortController`/`signal`** (`openrouter-mutator.ts:87`); `RequestyMutator` likewise (`requesty-mutator.ts:79`). Only `RuvllmMutator` guards the call with an `AbortController` + `setTimeout(timeoutMs)` (`ruvllm-mutator.ts:76-89`). STATIC. Because child-generation is serial (above), a **single stalled OpenRouter/Requesty connection hangs the entire generation indefinitely** — there is no per-call deadline and no `costBudgetSeconds`-style breaker on the mutation phase (the cost breaker at `evolve.ts:448` only guards the *evaluation* commit loop). The graceful no-op on network *failure* is good (`openrouter-mutator.ts:97-100`), but a *hang* is not a failure and is not caught.

- **Bench path doubles the concurrency but adds redundant work.** When `config.benchSuite` is set, a second `mapLimit` over the children (`evolve.ts:344-355`) calls `evaluateChildAgainstParent`, which inside `evaluateWithRunner` (`bench/runner.ts:126-129`) runs **both the parent and the child** over the full suite, per child. Since this is called once per child, **the parent is re-evaluated `childrenPerGeneration` times per parent, every generation** — its results are never memoized. Each task runs 3 sandbox commands (`runTaskForVariant`, `bench/runner.ts:43-45`). INFERRED: redundant subprocess spawns ≈ `parents × childrenPerGeneration × suiteTasks × 3` for the parent half alone, all recomputable from a single parent run. This is the clearest CPU/subprocess waste in the loop.

---

## 2. Process / sandbox spawn cost

- **Sandboxes are NOT reused — fresh process per task.** `runVariantTask` (`sandbox.ts:86-174`) `execFile`s the repo test command once per `(variant, task)`; `runVariantTasks` (`sandbox.ts:181-192`) iterates **sequentially** per variant (correct — population concurrency is the loop's job). Tier-2 (`tier2-sandbox.ts:78-114`) spawns a **new `node --experimental-strip-types` child per task** (`process.execPath` + driver, `tier2-sandbox.ts:91-95`), and the driver re-`import()`s the four variant `.ts` surfaces on every spawn (`tier2-driver.ts:31-34`). STATIC. So per Tier-2 variant evaluation = `DEFAULT_AGENT_TASKS.length` (3) cold Node starts + TS-strip + module loads, with **no warm pool**. EXECUTED proxy: the per-`npm`-subprocess startup is acknowledged as "roughly constant" in `concurrency.perf.test.ts:13` and is why that timing test is `skipIf(CI)`. For a real population (say 8 parents × 8 children × 3 tasks = 192 evaluations) this is hundreds of cold process starts per generation. Reuse / a persistent driver worker would be the highest-leverage spawn optimization, but is not present.

- **Kill / timeout paths are correct and bounded.** `execFile` is given `timeout` + `maxBuffer` (`sandbox.ts:135-142`); on timeout Node sends SIGTERM and the catch maps it to `timedOut` (`sandbox.ts:160`). `maxBuffer` default 8 MiB (`sandbox.ts:35`), Tier-2 1 MiB (`tier2-sandbox.ts:94`). EXECUTED: `bounds.perf` floods 5 MB into a 64 KB cap → process terminated in **79 ms**, `exitCode=1`, captured stdout exactly `65536` bytes, no hang, no throw. The gate-first short-circuit also avoids running anything for a disqualified variant (`sandbox.ts:94-110`) and `inspectVariant` short-circuits oversized files by `stat` before reading (proven by `bounds.perf` size test). **Resource caps: STRONG and verified.**

- **No shell, scrubbed env** (`sandbox.ts:69-76`, `135-142`) — also removes a class of fork-bomb/proxy-leak performance hazards. Good.

---

## 3. Cost & wall-clock characteristics

- **Run cost ≈ `generations × parents × childrenPerGeneration × (1 mutate + evalCost)`**, where in the bench path `evalCost` ≈ `(1 + 1) × suiteTasks × 3 commands` (the leading `1` is the redundant parent re-run from §1). STATIC from `evolve.ts:268-449`.
- **Cost breaker exists but is partial.** `config.costBudgetSeconds` stops the *commit* loop once cumulative trace-seconds exceed budget (`evolve.ts:447-448`), and the SGM `riskBudget` (`evolve.ts:246-249`, charged sequentially at `360-369`) caps cumulative statistical risk. INFERRED: neither bounds the *mutation* phase nor wall-clock of an LLM run — a generation can spend unbounded real time in serial model calls before the breaker is ever consulted.
- **Memoization of evaluations: absent.** There is no patch-memory / eval cache. The deterministic sandbox path is reproducible (same variant ⇒ same trace), so identical re-runs (notably the parent, §1) are pure waste. No content-hash keyed result store exists. CONJECTURE: a `Map<variantContentHash, ScoreCard>` would eliminate the parent-re-eval cost entirely and de-dupe no-op mutations (which `mutator.ts:362` already detects as `identical to parent`).
- **Early-stop: only via the cost/risk breakers and `parents.length === 0`** (`evolve.ts:466-514`). There is no convergence / score-plateau early-stop; the scorer ceilings at 0.985 (ADR-072) so once a generation saturates, subsequent generations keep paying full cost for no score gain. The Pareto/diversity selection mitigates *quality* stagnation but not *cost*.

---

## 4. Algorithmic complexity hot spots

Let `N` = total variants in the archive (grows ~linearly with generations, since ADR-073 **retains** all variants), `M` = scored variants in a generation.

- **`archive.save()` is O(N) and called every generation → O(G²) cumulative.** `save()` (`archive.ts:273-277`) `JSON.stringify(this.all(), null, 2)` serializes the **entire** archive — including every record's nested data — pretty-printed, once per generation (`evolve.ts:450`). As N grows linearly, total serialization+write work over a run is quadratic. For long runs this becomes the dominant disk cost. STATIC.
- **Clade selection is O(N²) per generation.** `cladeThompsonSelect` (`clade.ts:97-116`) iterates every scored variant and for each calls `cladeOutcomes` (`clade.ts:69-86`), which walks that variant's **entire descendant subtree**. Worst case (deep/wide tree) this is O(N²) per generation when `selection: 'clade'`. STATIC. The cycle-guard is correct but does not change the asymptotics.
- **Pareto stall-fallback does synchronous FS per scored variant.** `variantBytes` (`evolve.ts:141-152`) calls `readdirSync` + `statSync` per variant, invoked for every scored record when `selection: 'pareto'` (`evolve.ts:501-509`), then `paretoFront` is O(M²) (`pareto.ts:28-43`). So the pareto branch does **O(M) synchronous blocking FS calls + O(M²) compare** on the event loop every generation. STATIC. `selectElites` and `selectParents` are O(N) and fine.
- **`buildLinkage` is O(N·depth) per generation** when epistasis is on (`evolve.ts:274-288` → `lineageOf` per scored record). Acceptable. `LinkageGraph` itself is O(surfaces²)=O(49), trivial.
- **`steerTowardHole`** (`evolve.ts:166-183`) is O(N) embeds + nearest — fine.

None of these bite at prototype population sizes; they are **scalability** concerns for the "GCP distributed long-run" arc (ADR-180→196) the brief flags as new.

---

## 5. Resource-leak / unbounded-growth risks

- **In-memory state grows unbounded with generations.** `scoreById` and `tracesById` Maps (`evolve.ts:261-264`) retain **every** variant's score and full traces (incl. stdout/stderr strings) for the whole run — never evicted. The `Archive` Map (`archive.ts:25`) likewise retains all records by design (ADR-073). INFERRED: for large `generations` this is monotonic heap growth; traces are individually capped (8 MiB / 1 MiB) but N of them accumulate. The opt-in memoryless `selectionPool: 'generation'` (ADR-115, `evolve.ts:460-469`) reduces *selection* to the current generation but does **not** evict the retained maps/archive. No eviction/streaming-to-disk path exists for the in-memory maps.
- **No leaked handles in the spawn paths.** `execFile`/`execFileAsync` are awaited and the timeout kills strays; `RuvllmMutator` clears its timeout (`ruvllm-mutator.ts:89`). The two HTTP mutators' missing `AbortController` (§1) is a *hang* risk, not a descriptor leak, but a hung socket does hold a connection for the life of the (stalled) run.
- **`archive.save()` writes the full file every generation** (not append/incremental) — correct for crash-consistency, but combined with O(N) growth it is the I/O analogue of the O(G²) concern above.

---

## Performance gate: **CONDITIONAL**

**Rationale.** The verified core is strong: bounded concurrency is real and measured (0.31× at C=4), resource caps (timeout, maxBuffer, file-size/-count, gate-first, scrubbed env) are correct and *executed-tested*, and the package ships its own perf regression suite. Nothing here is unsafe or O(2ⁿ). It does not warrant HOLD.

It is not a clean SHIP because of three addressable issues that will bite at the population/long-run scale the new ADR arc targets: (1) the mutation phase is fully serial **and** the OpenRouter/Requesty mutators have **no request timeout**, so an LLM-backed run can hang indefinitely on one stalled call; (2) the bench path **re-evaluates the parent per child** with no memoization; (3) per-generation **full-archive serialization** and **O(N²) clade selection** make long runs super-linear. All three are localized fixes, not redesigns.

### Ranked optimization recommendations

1. **Add an `AbortController` + timeout to `OpenRouterMutator` and `RequestyMutator`** (mirror `ruvllm-mutator.ts:76-89`), and add a mutation-phase wall-clock/cost breaker. Removes the indefinite-hang failure mode. *(highest value, lowest effort — `openrouter-mutator.ts:87`, `requesty-mutator.ts:79`)*
2. **Parallelize child generation with `mapLimit`** (it already exists) and/or memoize the parent evaluation per generation in the bench path so the parent suite runs once, not `childrenPerGeneration` times (`evolve.ts:289-326`, `bench/runner.ts:126-129`).
3. **Introduce an evaluation cache** keyed by variant content-hash (`Map<hash, ScoreCard>`) — eliminates redundant parent re-runs and no-op-mutation re-evals (the no-op is already detected at `mutator.ts:362`).
4. **Make `archive.save()` incremental / append-only** (or save every K generations) to break the O(G²) serialization cost (`archive.ts:273-277`, `evolve.ts:450`).
5. **Cache `cladeOutcomes` subtree counts** (memoize per node, invalidate on new child) to drop clade selection from O(N²) toward O(N) (`clade.ts:69-86`).
6. **Replace the synchronous `readdirSync`/`statSync` in `variantBytes` with cached/async size lookup** so the pareto selection branch stops blocking the event loop every generation (`evolve.ts:141-152`).
7. **Add a persistent Tier-2 driver worker** (reuse the node child + warm imports across tasks) to amortize cold-start spawn cost (`tier2-sandbox.ts:91-95`).
8. **Add a score-plateau early-stop** (the scorer ceilings at 0.985) so saturated runs stop paying full per-generation cost.

---

## Status vs prior round

darwin-mode was not in the working-may evaluation, so every finding is NEW.

| Finding | Status | Evidence (file:line) |
|---|---|---|
| Bounded-concurrency evaluation correct & measured (0.31× at C=4; maxOverlap==limit) | New / STRONG | `evolve.ts:71-88`; EXECUTED `__tests__/perf/{mapLimit,concurrency}.perf.test.ts` |
| Resource caps (timeout/maxBuffer/size/count/gate-first/scrubbed-env) correct & tested | New / STRONG | `sandbox.ts:69-76,135-160`; EXECUTED `bounds.perf` (79ms, 65536 bytes) |
| Child generation fully serial (mutation not concurrent) | New / Open | `evolve.ts:289-326` |
| OpenRouter/Requesty mutators have NO request timeout → indefinite hang risk | New / Open | `openrouter-mutator.ts:87`, `requesty-mutator.ts:79` (cf. `ruvllm-mutator.ts:76-89`) |
| Parent re-evaluated per child in bench path; no eval memoization | New / Open | `evolve.ts:344-355`, `bench/runner.ts:126-129` |
| `archive.save()` O(N) every generation → O(G²) cumulative | New / Open | `archive.ts:273-277`, `evolve.ts:450` |
| Clade selection O(N²) per generation | New / Open | `clade.ts:69-116`, `evolve.ts:476-483` |
| Synchronous FS (`readdirSync`/`statSync`) in pareto selection path | New / Open | `evolve.ts:141-152,501-509` |
| In-memory `scoreById`/`tracesById`/archive grow unbounded over a run | New / Open | `evolve.ts:261-264`; `archive.ts:25` |
| No reuse of sandbox / Tier-2 driver processes (cold start per task) | New / Open | `sandbox.ts:181-192`, `tier2-sandbox.ts:91-95` |
