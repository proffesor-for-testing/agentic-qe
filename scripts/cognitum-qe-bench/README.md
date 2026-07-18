# Cognitum QE cost-Pareto benchmark

Measures, per quality-engineering task, the **cheapest way to achieve the goal**
against `api.cognitum.one`: for each task it compares three policies and reports
the quality-per-dollar Pareto pick, so tier routing (e.g. the qe-court model
table) is set by evidence, not guessed.

```
P1  always-cheap      cognitum-low  (worker key)   floor cost / floor quality
P2  always-frontier   cognitum-high (judge key)    ceiling quality / ceiling cost
P3  cheap + escalate  low, → high when the cheap attempt self-reports low
                      confidence (high tier ONLY as an advisor, when needed)
```

Cost is ground truth: the harness reads `price_usd` off each `x_cognitum`
receipt. Grading is QE-real — several tasks use **execution oracles** (a
generated test must pass on the correct impl and fail on a seeded mutant), which
is stronger than LLM-judged "predicted quality."

## Keys come from local config — never from code

The benchmark reads two keys from the environment. It never embeds or mints a
key. Set them one of two ways (an exported shell var always wins; `.env` fills
gaps):

**Option A — shell rc** (`~/.zshrc` or `~/.bashrc`):
```bash
export COG_QE_BENCH_WORKER_KEY=cog_...   # completions:low,mid  (no high)
export COG_QE_BENCH_JUDGE_KEY=cog_...    # completions:high,mid (advisor/judge)
```

**Option B — `.env`** in this directory (gitignored):
```bash
cp .env.example .env    # then fill in the two keys
```

`--mock` and projection modes need no keys.

## One-time key provisioning (owner only)

The two keys are minted **once** by an owner and then distributed to whoever runs
the benchmark (they put them in their own local config, above). Minting is a
separate step — NOT part of running the benchmark.

```bash
# dry-run (pure local, no creds) — preview exactly what will be written:
node mint-bench-keys.mjs --role worker --cap 5
node mint-bench-keys.mjs --role judge  --cap 5

# commit (needs firebase-admin + GOOGLE_CLOUD_PROJECT=cognitum-20260110 + ADC
# with Firestore write). Reveals the key ONCE — copy it into your local config:
node mint-bench-keys.mjs --role worker --cap 5 --commit
node mint-bench-keys.mjs --role judge  --cap 5 --commit
```

`mint-bench-keys.mjs` does a safe two-part write: a metered `subscriptions/`
doc first (so the key is hard-capped — a key with no subscription is admitted
*uncapped*), then the scope-split `api_keys/` doc. The worker key physically
lacks `completions:high`, so bulk work can never spend frontier money.

## Running

```bash
# 1. projection — count calls + estimate cost, no spend, no keys needed:
node run-bench.mjs --live                 # or --tasks test-generation,pr-severity

# 2. mock — full pipeline on synthetic data (validates the harness), no spend:
node run-bench.mjs --mock

# 3. live — real api.cognitum.one calls. Needs both keys. Gated by --max-cost
#    (aborts pre-flight if the projection exceeds it) and stops mid-run if actual
#    receipt spend crosses it:
node run-bench.mjs --live --confirm --max-cost 5
```

Useful flags: `--tasks a,b` · `--samples N` · `--policies p1,p2,p3` ·
`--bar 0.8` (quality bar for the Pareto pick) · `--escalate-bar 0.7` (P3
self-confidence threshold) · `--out path.json`.

Also respects `AQE_MAX_BUDGET_USD` as a client-side ceiling, on top of each key's
server-side subscription cap — defense in depth.

## Output

Per-task tables (pass%, $/task, $/quality, escalation%, latency) + the Pareto
pick, then a machine-readable payload after `===BENCH_JSON===` and a
`schemaVersion: cognitum-qe.v1` run-record written to
`docs/benchmarks/runs/`. The schema mirrors ruflo's `docs/benchmarks/` shape so
runs drop straight into that analysis.

## Tasks (v1)

| Task | Oracle | Provenance |
|------|--------|-----------|
| test-generation | run generated test vs correct + seeded mutant | execution (strongest) |
| mutation-adequacy | predict kill/survive; gold derived by running the suite | execution |
| security-triage | labeled: exploitable / false-positive / needs-review | labeled |
| pr-severity | labeled: blocker / major / minor | labeled |
| flaky-diagnosis | labeled: timing / order / env / network / randomness | labeled |
| adversarial-review | labeled SHIP/BLOCK on clean vs seeded-bug deliveries | labeled |
| coverage-gap | structural: name the uncovered branch | structural (proxy) |

Fixtures are small curated v1 seed sets (5–6 items/task) — enough to establish
the Pareto shape; grow them for tighter statistics. A benchmark "task" maps onto
an "agent type," so per-task cost aligns with the spend ledger's ADR-124 M2.3
per-agent attribution if the harness is ever routed through `ProviderManager`.
