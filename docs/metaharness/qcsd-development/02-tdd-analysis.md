# MetaHarness — TDD Adherence Analysis (QCSD Development Phase)

- **Agent:** qe-tdd-specialist (V3, London/Chicago)
- **Target repo:** `ruvnet/agent-harness-generator` (MetaHarness) v0.1.x
- **Target path:** `/workspaces/agent-harness-generator` (NOT the CWD repo)
- **Subject under analysis (the product):** `/workspaces/agent-harness-generator/packages/create-agent-harness/src` (37 TS files, 6,751 LOC)
- **Date:** 2026-06-15
- **Verdict:** **CONDITIONAL** — TDD adherence **68%**
- **Evidence labels per ADR-105:** EXECUTED / STATIC / INFERRED / CONJECTURE

---

## 1. Method & evidence base (verify-don't-trust)

The prior 3-dimension pass rated the generator "SHIP-grade" and claimed the co-located suite covers the
modules with two branch-level micro-gaps. This specialist pass re-derived every number from the source tree and
**executed the real build + test suite**, rather than trusting that summary.

| Action | Result | Evidence class |
|---|---|---|
| `npm run build` (target repo) | exit 0 | EXECUTED — `cd /workspaces/agent-harness-generator && npm run build` |
| `npm test` (full monorepo) | **530 passed / 0 failed**, 50 test files, exit 0 | EXECUTED — `npm test` captured to `/tmp/fulltest.log` |
| Glob `**/__tests__/**` + `**/*.test.ts` | **103 test files** across the repo (the prior run that missed the co-located suite was wrong) | STATIC — `find` over target repo |
| Co-located generator suite | `packages/create-agent-harness/__tests__` = **23 test files, 2,169 LOC** (97-test block in run) | STATIC |
| Root generator suite | `__tests__` = **43 files, 5,294 LOC** (257-test block in run) | STATIC |

**Both test locations were inspected.** The prior failed run's "untested" conclusion was a path-resolution
artifact (it only saw the root `__tests__`). It is not reproduced here.

---

## 2. Test-to-code ratio (STATIC)

Scope = generator source only (`packages/create-agent-harness/src`, 6,751 LOC, 37 files).

| Measure | Value |
|---|---|
| Co-located test LOC : source LOC | 2,169 : 6,751 = **0.32 : 1** |
| Co-located + root-generator test LOC : source LOC | (2,169 + 5,294) : 6,751 = **1.11 : 1** |
| `it()`/`test()` blocks (co-located) | 168 |
| `it()`/`test()` blocks (root generator) | 332 |
| `expect()` assertions (co-located) | 406 |
| `expect()` assertions (root generator) | 890 |
| **Total generator-facing assertions** | **~1,296 expects across ~500 test blocks** |

Assertion density is healthy: ~2.6 expects per test block (co-located 406/168; root 890/332). A 1.11:1
test:code LOC ratio with ~1,300 behavioral assertions is well above the threshold where a suite is "real" rather
than decorative. **EXECUTED corroboration:** 530 tests actually run and pass.

---

## 3. Per-module coverage map (STATIC + INFERRED)

Direct test-file imports per source module (grep of both `__tests__` trees for module path/name):

**Well-covered (direct imports + behavioral asserts):** `manifest`(19), `index`(18), `validate`(6),
`analyze-repo`(4), `diag`(4), `federate`(4), `publish`(4), `subcommands`(4), `secrets`(3), `upgrade`(3),
`export-config`(3), `mcp-scan`(3), `audit-cmd`(3) plus single-import-but-deep suites (`rename` 15 its,
`witness-client` 11 its, `renderer` 10 its, `eject` 9 its).

**Zero direct test imports — investigated individually (this is where the prior pass was shallow):**

| Module | LOC | Verdict | Evidence |
|---|---|---|---|
| `walker.ts` | 96 | **Covered indirectly** — exercised via `scaffold-e2e.test.ts` (real fs, asserts rendered paths/content). Re-exported by `index.ts:482`. No isolated edge-case test. | STATIC: `scaffold-e2e.test.ts:30-52` asserts `r.paths`, file content, manifest |
| `writer.ts` (`writeAtomic`) | 57 | **Covered indirectly** — staging→rename happy path exercised via scaffold. Rollback path (`writer.ts:50-53` catch→`rm(staging)`→rethrow) is **NOT directly tested**. | STATIC: rollback branch has no test |
| `completions-cmd.ts` | 178 | **Covered indirectly** — via root `cli-flags-completions.test.ts` + `dev-toolkit.test.ts` (CLI-level). No unit test of `completionsCmd()`. | STATIC: `grep completions __tests__` = 2 root files |
| `genome-scorers.ts` | 111 | **Coverage gap (real).** 5 pure scoring functions, only exercised transitively through `genome.ts`→`harness-genome.test.ts`, which asserts **shape + value ranges + determinism**, not per-branch input→output. | STATIC: `harness-genome.test.ts:82-87` asserts keys/ranges only |

---

## 4. TDD-school discipline & DI/mock seams (STATIC)

The codebase mixes both schools appropriately, matching the recommended context table:

**London (mockist) — genuine dependency injection.** `secrets.ts` exposes a `GcloudRunner` interface and every
entry point takes the runner as a parameter (`check([], runner)`, `fetch([], mockRunner({}))`). The test injects
a table-driven fake — a textbook DI seam.
- Evidence: `secrets.test.ts:6-15` (`mockRunner`), used at lines 25, 39, 59, 67, 76.
- This is the strongest single piece of testability design in the product and confirms the prior pass's note.

**Chicago (classicist) — real-collaborator integration.** `scaffold`, `walker`, `writer`, `manifest`,
`upgrade` are tested against the real filesystem in tmp dirs, asserting end-state (`scaffold-e2e.test.ts`,
`upgrade.test.ts`). Appropriate for data-transformation / fs code.

**Behavioral vs structure-only:** Assertions check observable behavior — exit codes (`expect(code).toBe(2)`),
error messages (`rejects.toThrow(/no manifest/)`), emitted output lines, and manifest field values — not merely
"function is defined." These are NOT structure-only smoke tests. INFERRED, with strong STATIC backing across
sampled files (`publish.test.ts`, `upgrade.test.ts`, `secrets.test.ts`, `scaffold-e2e.test.ts`).

---

## 5. Red-Green-Refactor evidence — the deeper finding the prior pass lacked (STATIC)

The prior pass treated "modules are covered" as equivalent to "built test-first." They are not. Git archaeology
on the target repo:

- **0** commits contain TDD vocabulary (`tdd`, `red.green`, `test-first`, `failing test`, `test:` prefix).
  Evidence: `git log | grep -ciE "tdd|red.green|test-first|failing test"` = 0. (EXECUTED)
- **Every** source module and its test were added in the **SAME commit**. For all 16 modules that have a paired
  `<mod>.ts` + `<mod>.test.ts`, the first-add commit timestamps are identical → `SAME-COMMIT` for 16/16,
  `TEST-FIRST` for 0/16. (EXECUTED — per-file `git log --diff-filter=A --format=%ct`)
- Commits are **iteration batches**: `feat(iter-4)`, `feat(iter-5)`, `feat(iter-18)`, `feat(iter-20)` each ship
  source + tests + templates together.

**Conclusion (INFERRED from STATIC git data):** MetaHarness is **test-alongside / iteration-batched**, not
strict Red-Green-Refactor TDD. There is no observable RED phase (a failing test committed before code) anywhere
in history. The suite is a high-quality *characterization/regression* suite produced concurrently with the code,
not a test-first design driver. This does not make the code worse — but it is the precise distinction a TDD gate
must score, and it is the single largest deduction below.

---

## 6. Confirmed gaps where tests exist but don't assert the branch (STATIC)

The two micro-gaps from the prior pass are **confirmed and sharpened**, plus three the prior pass missed:

| # | Gap | Absolute location | Why it matters |
|---|---|---|---|
| G1 | `pinJson` **non-2xx HTTP** branch untested. Tests cover missing-JWT throw and dry-run only; the `if (!res.ok) throw ...` path never runs. **No fetch DI seam** — unlike `secrets`, the HTTP call is not injectable, so this branch is currently *untestable* without network mocking. | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/publish.ts:70-72` (test: `__tests__/publish.test.ts:37-41` stops at JWT) | Testability + coverage gap combined |
| G2 | `applyUpgrade` **`conflictStyle: 'rej'`** branch untested. Test at `upgrade.test.ts:85` only exercises the default `'inline'` markers; the `.rej`-file branch never runs. | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/upgrade.ts:153` (`writeFile(target + '.rej', upstream)`) | Confirmed prior micro-gap |
| G3 | **`genome-scorers.ts`** — 5 pure functions (`classifyRepoType`, `resolveAgentTopology`, `scoreMcpRisk`, `scoreTestConfidence`, `scorePublishReadiness`) have **no isolated unit tests**; only shape/range checked via `harness-genome.test.ts`. These are the most TDD-amenable (pure, deterministic) functions in the product and are the natural place a TDD-built codebase would have the *most* tests. | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/genome-scorers.ts:24,47,69,88,102` | **Missed by prior pass** |
| G4 | `writeAtomic` **rollback** branch (catch→`rm(staging)`→rethrow) untested; only happy-path staging→rename is exercised via scaffold. | `/workspaces/agent-harness-generator/packages/create-agent-harness/src/writer.ts:50-53` | **Missed by prior pass** |
| G5 | **`secrets.test.ts` conditional escape hatches.** Lines 26-32, 40-44, 60 `return` early if gcloud is not on PATH. In this sandbox (no gcloud/cargo), the HEALTHY-path and forced-project assertions are effectively **no-ops** — the test passes by asserting only `code===1` or nothing. The DI seam is real, but the most important assertions are environment-gated and silently skip in CI. | `/workspaces/agent-harness-generator/packages/create-agent-harness/__tests__/secrets.test.ts:26-32,40-44,60` | **Test-quality concern missed by prior pass** |

---

## 7. TDD adherence score (0-100) and gate mapping

Weighted rubric (a TDD gate scores *discipline*, not just coverage):

| Dimension | Weight | Score | Rationale |
|---|---:|---:|---|
| Test-to-code ratio & assertion density | 20% | 90 | 1.11:1 LOC, ~1,300 behavioral expects, 530 passing |
| Behavioral assertions (not structure-only) | 20% | 85 | Exit codes, messages, content asserted; few shape-only spots (G3) |
| DI / mock seams where needed | 15% | 70 | Excellent in `secrets` (GcloudRunner); missing in `publish.pinJson` (G1) |
| Branch/edge coverage of tested modules | 15% | 65 | G1, G2, G4 non-happy branches unasserted |
| Module reach (no truly-untested product code) | 15% | 75 | All modules reached, but `genome-scorers` (G3) only transitively |
| **Red-Green-Refactor evidence** | 15% | **20** | 0/16 test-first, 0 TDD commits, 100% same-commit batches |

**Weighted total = 0.20·90 + 0.20·85 + 0.15·70 + 0.15·65 + 0.15·75 + 0.15·20 = 68.0%.**

### QCSD gate
| Band | Range | This repo |
|---|---|---|
| SHIP | ≥ 80% | |
| **CONDITIONAL** | **60–79%** | **← 68%** |
| HOLD | < 60% | |

**Verdict: CONDITIONAL.** The product is *well-tested* (SHIP-grade as a regression suite, which is what the
prior 3-dimension pass measured) but is *not test-driven* (no RED phase in history). The prior "SHIP" rating
conflated coverage quality with TDD discipline. On a TDD-specific axis the honest score is 68% — strong suite,
weak process evidence, and five concrete branch/quality gaps.

### Conditions to reach SHIP (≥80%) on the TDD axis
1. Add an injectable HTTP seam to `publish.pinJson` and a test for the non-2xx branch (closes G1, raises DI + branch dims).
2. Add `applyUpgrade({conflictStyle:'rej'})` test asserting the `.rej` file (closes G2).
3. Add isolated unit tests for the 5 `genome-scorers` functions covering each branch (closes G3, raises module-reach + behavioral dims).
4. Add a `writeAtomic` failure/rollback test (closes G4).
5. De-gate `secrets.test.ts` HEALTHY/forced-project assertions so they assert in CI regardless of gcloud presence (closes G5).
6. (Process) Adopt visible RED-GREEN commits for new modules to earn the 15% discipline weight.

---

## 8. Evidence-class summary (ADR-105)

- **EXECUTED:** build exit 0; `npm test` 530 pass / 0 fail / 50 files; git first-add timestamps; TDD-vocab grep = 0.
- **STATIC:** file/LOC counts, per-module import map, assertion counts, exact gap line numbers, DI seam in `secrets.test.ts`.
- **INFERRED (routed to adversarial review per ADR-102):** "behavioral not structure-only" generalization across the full suite (sampled, not exhaustively read); "test-alongside not test-first" interpretation of same-commit data.
- **CONJECTURE:** none load-bearing in the verdict.
