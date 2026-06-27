# MetaHarness — TDD Adherence Analysis (QCSD Development Phase, Round 2)

- **Agent:** qe-tdd-specialist (V3, London/Chicago)
- **Target repo:** `ruvnet/agent-harness-generator` (MetaHarness)
- **Snapshot:** HEAD `5f63ac6` (`v0.1.15-467-g5f63ac6`), branch `main`, 2026-06-27
- **Packages in scope (this round):**
  1. `packages/create-agent-harness` (`src` + co-located `__tests__` + repo-root `__tests__/harness-*.test.ts`)
  2. `packages/darwin-mode` (`src` + `__tests__`) — **NO prior baseline**
- **Verdicts:** create-agent-harness **CONDITIONAL (67%)** · darwin-mode **CONDITIONAL (72%)**
- **Evidence labels per ADR-105:** EXECUTED / STATIC / INFERRED / CONJECTURE
- **Cross-repo guard:** every path below is absolute under `/workspaces/agent-harness-generator`. AQE's own tree was never analyzed.

---

## 0. Top line (one line each, as requested)

- **create-agent-harness — TDD 67% → CONDITIONAL.** Strong regression suite (388 scoped tests, 0.56:1 test:code), but 0/21 modules test-first, 0 TDD-vocab commits, and **one currently-RED version-coupled test** at `__tests__/harness-diag.test.ts:229`.
- **darwin-mode — TDD 72% → CONDITIONAL.** Larger, healthier suite (0.73:1 test:code, 549 passing, real DI seams, `it.fails` characterization), but identical process gap: **0 genuine test-first, 0 TDD-vocab commits across 289 commits**; 14 strongest assertions are external-tool-gated.

---

## 1. Method & evidence base (verify-don't-trust)

| Action | Result | Evidence class |
|---|---|---|
| `npx vitest run` in `packages/darwin-mode` | **62 files, 549 passed / 14 skipped / 0 failed**, 25.66s | EXECUTED |
| `npx vitest run` in `packages/create-agent-harness` | **29 files, 306 passed / 0 failed**, 1.44s | EXECUTED |
| `npx vitest run __tests__/harness-*.test.ts` (root, CAH-facing) | **10 files, 82 passed / 1 FAILED (83)** | EXECUTED |
| `git log` TDD-vocab grep, scoped per package | **0** and **0** | EXECUTED |
| Per-file first-add commit (test vs src), scoped per package | see §3 | EXECUTED |
| `find` + `grep` LOC / it-blocks / expects, scoped per package | see §2 | STATIC |

Root `vitest.config.ts:8-12` `include` is `packages/*/__tests__/**`, `packages/*/__tests__/integration/**`, **and `__tests__/**`** — so the canonical `npm test` *does* run the root `harness-*` suite. The failing test below is therefore in the real CI surface, not an out-of-band file.

---

## 2. Test-to-code ratio & assertion density (STATIC)

### create-agent-harness
| Measure | Value |
|---|---|
| `src` | **41 TS files, 7,739 LOC** (prior: 37 / 6,751 — grew) |
| Co-located `__tests__` | **29 files, 2,719 LOC, 228 `it`/`test`, 65 `describe`, 528 `expect`** |
| Root `harness-*.test.ts` (CAH-facing) | **10 files, 1,626 LOC, 83 `it`, 289 `expect`** |
| **Scoped test:code LOC** | (2,719 + 1,626) : 7,739 = **0.56 : 1** |
| Scoped tests / assertions | **311 test blocks · 817 expects (~2.6 expects/test)** |

> Note: prior round reported 1.11:1 because it folded in the *generic* root `__tests__` (43 files, 5,294 LOC). This round scopes to the package-facing `harness-*` subset per task definition; 0.56:1 is the honest scoped figure and is still well above the "decorative suite" threshold.

### darwin-mode
| Measure | Value |
|---|---|
| `src` | **57 TS files, 10,163 LOC** |
| `__tests__` | **62 files, 7,467 LOC, 502 `it`/`test`, 174 `describe`, 1,083 `expect`** |
| Tests outside `__tests__` (co-located w/ src) | **0** |
| **Test:code LOC** | 7,467 : 10,163 = **0.73 : 1** |
| Tests / assertions | **502 test blocks · 1,083 expects (~2.16 expects/test)** |

darwin-mode carries the **higher** test:code ratio of the two and a substantially larger absolute assertion budget. Suite structure is well-organized (`__tests__/{security,perf,e2e,bench}` subtrees).

---

## 3. Red-Green-Refactor evidence — the gating dimension (EXECUTED git archaeology)

A TDD gate scores *discipline* (was a failing test committed before the code?), not just coverage. Both packages fail this on identical grounds.

### create-agent-harness (93 commits touch the package)
- **TDD-vocab commits = 0.** `git log --oneline -- packages/create-agent-harness __tests__/harness-*.test.ts | grep -ciE "tdd|red.green|test-first|failing test"` = **0**. (EXECUTED)
- **Test-first = 0/21.** Of 21 src modules with a same-named test: **20 same-commit, 0 test-first, 1 code-first** (`writer.ts` added `eca04cd` 2026-06-13; `writer.test.ts` added `57e4f20` 2026-06-21 — test 8 days *after* code). (EXECUTED — per-file `--diff-filter=A` timestamps)
- Commits remain **iteration batches**: `feat(iter-4)`, `feat(iter-90 MILESTONE)`, etc., shipping src + test + templates together.

### darwin-mode (289 commits touch the package)
- **TDD-vocab commits = 0.** Same grep scoped to `packages/darwin-mode` = **0**. (EXECUTED)
- **Genuine test-first = 0.** Of 42 same-named pairs: **39 same-commit, ~3 code-first/test-after**. The one apparent "TEST-FIRST" (`evolve`) is a `--follow` rename artifact: `evolve.ts` first added `6df7ced` **2026-06-18 00:01 UTC**, `evolve.test.ts` first added `1fd8d9f` **2026-06-18 02:41 UTC** → test is **2h40m after** code. `stats` is also test-after. (EXECUTED)
- Origin is a single big-bang commit `6df7ced "feat(darwin-mode): implement Darwin Mode package (ADR-070…075)"` — src+tests landed together, then grew by iteration.

**Conclusion (INFERRED from STATIC git data, same as prior round):** Both packages are **test-alongside / iteration-batched**, not strict Red-Green-Refactor. No observable RED phase exists in either history. The suites are high-quality *characterization/regression* suites produced concurrently with the code. This is the single largest deduction for both.

---

## 4. TDD-school discipline & DI/mock seams (STATIC)

### create-agent-harness — unchanged from prior round
- **London (mockist):** `secrets.ts` exposes `GcloudRunner` and injects a table-driven fake (`secrets.test.ts`) — the strongest seam in the package. **Still missing** in `publish.pinJson` (no fetch DI), so its non-2xx branch stays untestable without network mocking (prior G1).
- **Chicago (classicist):** `scaffold`, `walker`, `writer`, `manifest`, `upgrade` tested against real fs in tmp dirs.

### darwin-mode — genuine seams + characterization discipline (new findings)
- **London where external:** `__tests__/mock-sandbox.test.ts` and `__tests__/ruvllm-mutator.test.ts` exercise injectable sandbox / LLM-mutator seams; the alt-provider mutators (`openrouter-mutator.ts`, `requesty-mutator.ts`) mirror the tested `ruvllm-mutator` shape. **Tiered execution:** deterministic mock-sandbox unit tests + opt-in real-surface `e2e/tier2-sandbox.e2e.test.ts` (`describe.skipIf(nodeMajor<22||win32)`).
- **Chicago / property-style:** `scorer.test.ts` (determinism + immutability), `pareto.test.ts` (dominance), `epistasis.test.ts`, `__tests__/e2e/safety-invariant.e2e.test.ts` asserts a real invariant — *every produced variant passes `inspectVariant` (findings === [])* and *no run trace has blocked actions*. These are behavioral, not shape-only.
- **Positive discipline signal:** `__tests__/security/inspect-bypass.test.ts` uses **`it.fails(...)`** to *document genuine known bypasses* — characterization of real limitations rather than hiding them. (STATIC)

---

## 5. Confirmed gaps / test-quality concerns (EXECUTED + STATIC)

| # | Pkg | Gap | Absolute location | Evidence |
|---|---|---|---|---|
| **R1** | CAH | **RED test at HEAD — version-coupled brittle assertion.** `--bundle` test hardcodes `kernel_version` `'0.1.0'`; scaffolder stamps the *local* version (now `0.1.2`) → `expected '0.1.2' to be '0.1.0'`. The file's own comments (L312-314) acknowledge "drifts with every publish" yet line 229 still hardcodes it. Commit `585489d` already "repaired" 4 stale-drift failures in this same suite — this is a recurring class. | `__tests__/harness-diag.test.ts:229` | EXECUTED (1 failed / 83) |
| G1 | CAH | `pinJson` non-2xx HTTP branch untested; **no fetch DI seam**. | `packages/create-agent-harness/src/publish.ts` (test stops at JWT) | STATIC (carried from prior, unverified-rerun) |
| G3 | CAH | **`genome-scorers.ts` — 5 pure functions still have no isolated unit test**; only shape/range via genome. The most TDD-amenable code in the package. | `packages/create-agent-harness/src/genome-scorers.ts` | STATIC — confirmed: no `genome-scorers.test.ts` in pkg or root `__tests__` |
| D1 | darwin | **14 tests skipped** in this sandbox. The strongest "real oracle" assertions (`semgrep`, `codeql`, `python3` fuzz) are `describe.skipIf(!available)` — `security/{semgrep,codeql,fuzz,cwe-bench,real-evolve,real-loop}-oracle.test.ts`. Graceful-skip + vocabulary invariants still run, so this is milder than CAH's prior G5 (not a silent no-op), but the headline security claims are **not executed** without those tools. | `packages/darwin-mode/__tests__/security/*.test.ts` | EXECUTED (549 passed / 14 skipped) |
| D2 | darwin | **15 src files have no same-named test.** Legitimate (no behavior): `types.ts`×3, `index.ts`×3 barrels, `cli.ts`. Substantive-but-only-transitive: `safety.ts` (204 LOC, reached via `e2e/safety-invariant`), `security/corpus.ts` (248), `security/agents.ts` (224), `openrouter-mutator.ts`/`requesty-mutator.ts` (alt providers). | `packages/darwin-mode/src/{safety,security/corpus,security/agents,openrouter-mutator,requesty-mutator}.ts` | STATIC |

---

## 6. TDD adherence scores (same 6-dimension rubric as prior round, for diff-comparability)

### create-agent-harness
| Dimension | Weight | Score | Rationale |
|---|---:|---:|---|
| Test-to-code ratio & assertion density | 20% | 82 | 0.56:1 scoped, 817 expects/311 tests; **but 1 RED test at HEAD** |
| Behavioral assertions (not structure-only) | 20% | 85 | exit codes, skew verdicts, bundle JSON values, PASS/FAIL matchers |
| DI / mock seams where needed | 15% | 70 | `secrets` excellent; `publish.pinJson` still no seam (G1) |
| Branch/edge coverage of tested modules | 15% | 65 | G1 unasserted; version-drift fragility (R1) |
| Module reach | 15% | 75 | `harness-*` prefix tests cover most cmds; `genome-scorers` only transitive (G3) |
| **Red-Green-Refactor evidence** | 15% | **20** | 0/21 test-first, 0 TDD commits |

**Weighted = 0.20·82 + 0.20·85 + 0.15·70 + 0.15·65 + 0.15·75 + 0.15·20 = 67.4 ≈ 67%.**

### darwin-mode (new baseline)
| Dimension | Weight | Score | Rationale |
|---|---:|---:|---|
| Test-to-code ratio & assertion density | 20% | 90 | 0.73:1, 1,083 expects, 549 passing, well-structured subtrees |
| Behavioral assertions (not structure-only) | 20% | 85 | safety invariants, dominance, determinism/immutability, `it.fails` characterization |
| DI / mock seams where needed | 15% | 80 | mock-sandbox + ruvllm-mutator seams; tiered mock/real execution |
| Branch/edge coverage of tested modules | 15% | 72 | broad; 14 strongest assertions external-tool-gated (D1) |
| Module reach | 15% | 75 | 42/57 same-named; substantive files only transitively covered (D2) |
| **Red-Green-Refactor evidence** | 15% | **22** | 0 genuine test-first, 0 TDD commits across 289 |

**Weighted = 0.20·90 + 0.20·85 + 0.15·80 + 0.15·72 + 0.15·75 + 0.15·22 = 72.3 ≈ 72%.**

### QCSD gate (SHIP ≥80 / CONDITIONAL 60-79 / HOLD <60)
| Package | TDD % | Gate |
|---|---:|---|
| create-agent-harness | **67%** | **CONDITIONAL** |
| darwin-mode | **72%** | **CONDITIONAL** |

Both are *well-tested* (SHIP-grade regression suites) but *not test-driven*. The RGR-evidence dimension (15%, scored 20/22) is what holds both below SHIP — identical to the prior round's core finding, now confirmed across both packages with fresh git archaeology.

### Conditions to reach SHIP (≥80%) on the TDD axis
1. **(CAH, blocking)** Fix R1: de-couple `harness-diag.test.ts:229` from the literal version (read it from `package.json`/manifest) so the canonical suite is green again.
2. **(CAH)** Add isolated unit tests for the 5 `genome-scorers` functions (G3) and an injectable HTTP seam + non-2xx test for `publish.pinJson` (G1).
3. **(darwin)** Add CI coverage for the gated real-oracle paths (D1) — pin semgrep/codeql/python3 in the CI image so the headline security assertions actually execute, not just the graceful-skip invariants.
4. **(darwin)** Add direct unit tests for `safety.ts`, `security/corpus.ts`, `security/agents.ts`, and the alt-provider mutators (D2).
5. **(both, process)** Adopt visible RED→GREEN commits for new modules to earn the 15% discipline weight.

---

## 7. Status vs prior round (2026-06-15, generator only)

| Prior finding | Status | Evidence |
|---|---|---|
| TDD 68% / CONDITIONAL (generator) | **Confirmed (67%)** | Re-derived; ~1pt lower on scoped test set + 1 RED test |
| 0 TDD-vocab commits, 16/16 same-commit | **Confirmed & extended** | Now 0/21 test-first (CAH) + 0 test-first (darwin); 0 vocab in both |
| Full suite "530 pass / 0 fail" | **Regressed** | CAH-facing root suite now **1 FAILED** (`harness-diag.test.ts:229`, version drift) |
| G1 publish.pinJson DI gap | **Still open** | No fetch seam in `publish.ts` |
| G3 genome-scorers no isolated test | **Still open** | No `genome-scorers.test.ts` in pkg or root |
| G5 secrets env-gated assertions | **Pattern recurs as D1 (darwin)** | `describe.skipIf(!available)` on real security oracles |
| darwin-mode TDD | **New baseline = 72% / CONDITIONAL** | 62 files, 549 passed/14 skipped, 0.73:1, 0 test-first |

---

## 8. Evidence-class summary (ADR-105)

- **EXECUTED:** both `vitest run` results (549/14/0 darwin; 306/0 CAH; 82/1 root harness); the RED assertion text; per-file first-add timestamps; TDD-vocab grep = 0 (both); `evolve` rename-artifact resolution.
- **STATIC:** all LOC / it-block / expect / describe counts; same-named-test maps; DI-seam and `it.fails` locations; `vitest.config.ts` include patterns; skip-gate locations.
- **INFERRED (routed to adversarial review per ADR-102):** "test-alongside not test-first" reading of same-commit data; "behavioral not structure-only" generalization (sampled, not exhaustively read).
- **CONJECTURE:** none load-bearing in either verdict.
