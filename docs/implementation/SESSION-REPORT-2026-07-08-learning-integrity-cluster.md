# Session Report — Learning-Integrity Cluster (ADR-117…122)

**Date:** 2026-07-08 · **Branch:** `working-july` · **Status:** all work in the working tree, **nothing committed/pushed**.
**Headline:** the ADR-117…122 self-improvement cluster (frozen anchor, two-gate judge, gate-reexecute, provenance tiers, receipt-gated flywheel) is **built, tested (174/174), persisted, and run end-to-end on real data** — with every limitation honestly scoped.

---

## 1. How this session started

Cross-repo analysis of `/workspaces/ruflo` (flywheel ADR-176), `/workspaces/agent-harness-generator` (MetaHarness), and `/workspaces/retort` (adrianco's DoE harness) → a GOAP plan → 6 ADRs (117–122) → implementation. See memories: `project_ruflo_flywheel_adr176`, `project_metaharness_flywheel_lens_2026_07`, `project_retort_doe_harness`, and the master `project_learning_integrity_cluster_built`.

---

## 2. What was built (all DI'd + unit-tested; 174 tests green; `tsc --noEmit` clean)

| ADR | Module(s) | Status | Tests |
|---|---|---|---|
| **117** frozen anchor | `verification/anchors/qe-anchor-v1.json` (5 items, hash `e566f31a…`), `src/validation/anchor-set.ts` | Accepted | 9 |
| **119** two-gate verdict | `src/validation/quality-verdict.ts`, `frontier-judge.ts` (qwen-not, frontier-only), `quality-gate-runner.ts`, `src/cli/commands/quality-gate.ts`, `src/mcp/tools/quality-assessment/gate.ts` | Accepted | 8 + 24 |
| **120** gate-reexecute | `src/validation/gate-reexecute.ts` (`accept/v1` + `PATH_ACCEPTANCE`: `pattern-promote/v1`, `dream-apply/v1`); retrofit into `pattern-lifecycle.ts` (P1) + `dream-integration.ts` (P2) | Accepted | 14 + paths |
| **121** provenance tiers | `src/learning/provenance-tier.ts`; `pattern-lifecycle.ts` migration + gate | Accepted | 16 |
| **118** flywheel | `src/learning/qe-flywheel/` — `policy.ts`, `receipt.ts` (Ed25519), `generation.ts`, `corpus-scorer.ts`, `coupled-anchor.ts`, `receipt-store.ts` | Accepted (core + persistence) | 17 + 8 + 1 + 5 |
| **122** DoE screen | `docs/implementation/DOE-HARNESS-SCREEN-DESIGN.md`, `scripts/doe-screen-scaffold.mjs` | **Design only — awaiting budget** | dry-run |

Cluster interlock: the flywheel's `accept()` **is** the ADR-120 `accept/v1` rule, which gates on the ADR-117 anchor no-regression and the ADR-121 tier. A forged promotion cannot survive `reconstructLineage`/`verifyPromotion`.

Supporting inventory doc: `docs/implementation/PROMOTION-PATH-INVENTORY.md`.

---

## 3. Live runs performed (real `qe_patterns`, read-only on copies; DB writes additive-only)

1. **First live flywheel (flat anchor)** — headroom YES; 4 compounding promotions, self-retrieval MRR 0.707→0.796 (+0.089), lineage intact + all replayable. **Honest scope:** lift is on the self-supervised PROXY; anchor held flat.
2. **Receipt persistence to live `memory.db`** — 3 receipts written to a new append-only `flywheel_receipts` table; `qe_patterns` UNCHANGED; `integrity=ok`; offline re-verify `allReplayable=true`.
3. **Live coupled run w/ `qwen3-coder:30b`** (host.docker.internal:11434) — **HONEST NULL:** qwen writes decent tests (anchorMean=0.80 = 80% mutant kill) but the anchor **did not move across policies**. Root cause (evidenced): lexical `createDbRetriever` returns the IDENTICAL top-3 for every policy because the toy anchor items (`inRange`…) don't lexically overlap the corpus (auto-consolidated meta-patterns). Coupling mechanism is unit-proven; it just doesn't engage on this corpus with lexical retrieval. Receipt persisted (4th, integrity ok).

Current live DB: `flywheel_receipts` = **4 rows**, `integrity=ok`.

---

## 4. Real bugs found by running (retort "measure the measurement" discipline)

1. **`rankMMR` O(n³)** → hung the flywheel on the 262-pattern corpus. Fixed: `MMR_POOL_SIZE=50` top-K pool cap (small-corpus tests unaffected).
2. **`heldOutRatio` default = 1** → ~3s/scorer-call → multi-gen loop timeout. It's tunable (used 0.25).
3. **`canonicalJson` hashed `undefined` keys as `null`** but `JSON.stringify` drops them → `sealedHash` mismatch after a DB roundtrip → would have broken EVERY persisted receipt. Fixed: omit undefined keys (matches JSON).
4. **MCP registry test** hardcoded tool count 38→39 after the new `qe/quality/gate` tool. Fixed.

---

## 5. Database / infra situation (IMPORTANT for continuing)

- `.agentic-qe/memory.db` sits on a **macOS virtiofs bind mount**; WAL on it caused corruption twice (recovered). See `project_memorydb_wal_bind_mount_corruption`.
- **Root cause of re-WAL is AQE's own published MCP server** (`agentic-qe@3.11.4` via npx), NOT the ruflo daemon (ruflo uses `.swarm/`, `.hive-mind/`). Self-resolves once the fix ships or the MCP runs local `dist`.
- **Fix built (AQE-side):** `src/shared/safe-db.ts` env-gate `AQE_DISABLE_WAL=1` / `AQE_JOURNAL_MODE` (in `.env` + gitignored `.claude/settings.local.json`). Do **NOT** force `AQE_DISABLE_WAL` when opening the LIVE DB for a write — the WAL→DELETE switch needs an exclusive lock the concurrent MCP won't yield (`SQLITE_BUSY`). Append in the DB's current WAL mode via `new Database()` + `busy_timeout`.
- **Recovery posture = option C** (accept + monitor): `.agentic-qe/wal-monitor.sh` (30-min integrity + rotating backup). A parallel session also added `scripts/aqe-db-backup.sh` (VACUUM-INTO) — see `project_learning_db_virtiofs_contention_2026_07_08`.
- Backups from this session: `memory.db.bak-flywheel-*`, `.bak-persist-*`, `.bak-coupled-*` (all `quick_check ok`).
- **Cleanup item:** a subagent init'd a stray `src/.agentic-qe/` (70-pattern throwaway, gitignored). Safe to `rm -rf src/.agentic-qe` (NOT the real `.agentic-qe/`).

---

## 6. Open items / next steps (prioritized)

1. **Make the coupling actually bite (the honest-null fix)** — swap `createDbRetriever` (lexical) for a **semantic/embedding retriever** (HNSW infra already exists) so retrieval varies with policy; OR use anchor items in the corpus's vocabulary. This is what closes the tier-framing gap (anchor becomes real oracle evidence that moves). Highest-value next step.
2. **ADR-122 DoE screen** — needs a **user budget confirmation** (~$11 recommended; half-fraction Res-IV, 27 cells, N=5). Run: `node scripts/doe-screen-scaffold.mjs` (dry-run, $0) → then confirm spend. The unbuilt piece is the `--runner-cmd` AQE binding (test-gen config → evaluateOracle).
3. **MCP JSON-RPC smoke test** — the `qe/quality/gate` tool is verified via direct `tool.invoke()` + CLI parity, but NOT through the full protocol server (CLAUDE.md's MCP-integration requirement).
4. **Decide the flywheel tier semantics** — `accept/v1` borrows ADR-121's pattern-evidence tier; for a *retrieval-policy* promotion the honest label of self-retrieval gain is `proxy:structural` (→ honest null). Consider a flywheel-specific rule where "oracle-backed" means "anchor-guarded". (Coupling fix #1 makes this moot — the anchor becomes genuine oracle evidence.)
5. **Commit** — nothing is committed. When ready: branch is `working-july`; run the full suite; the changes touch production learning code (`pattern-lifecycle.ts`, `dream-integration.ts`, MCP registry) so review + real MCP verification before merge.

---

## 7. Reproduce / verify commands

```bash
# full cluster suite (174 tests)
npx tsc --noEmit
NODE_OPTIONS='--max-old-space-size=1536 --expose-gc' npx vitest run \
  tests/unit/learning/provenance-tier.test.ts tests/unit/learning/pattern-lifecycle-provenance.test.ts \
  tests/unit/validation/anchor-set.test.ts tests/unit/validation/quality-verdict.test.ts \
  tests/unit/validation/gate-reexecute.test.ts tests/unit/validation/gate-reexecute-paths.test.ts \
  tests/unit/validation/frontier-judge.test.ts tests/unit/validation/quality-gate-runner.test.ts \
  tests/unit/learning/qe-flywheel.test.ts tests/unit/learning/qe-flywheel-scorer.test.ts \
  tests/unit/learning/coupled-anchor.test.ts tests/unit/learning/receipt-store.test.ts

# persisted flywheel lineage on the live DB (read-only)
sqlite3 'file:.agentic-qe/memory.db?mode=ro' 'SELECT generation,verdict FROM flywheel_receipts;'

# DoE dry-run ($0)
node scripts/doe-screen-scaffold.mjs

# quality-gate CLI (frozen anchor checklist ids)
node dist/cli/bundle.js quality-gate --list   # (after npm run build)
```

**Memory to reload first next session:** `project_learning_integrity_cluster_built` (master index of everything above).
