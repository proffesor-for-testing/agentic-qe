# 07 — Mutation Testing (Round 2): Test Effectiveness on MetaHarness Safety-Critical Code

- **Repo under review:** `ruvnet/agent-harness-generator` (MetaHarness)
- **Working copy:** `/workspaces/agent-harness-generator`
- **Snapshot:** HEAD `5f63ac6` (`v0.1.15-467-g5f63ac6`), branch `claude/darwin-mode-evolve-polyglot`, 2026-06-27
- **Packages in scope:** `create-agent-harness` (generator) + `darwin-mode` (self-evolving harness)
- **Phase / Swarm:** QCSD Development — qe-mutation-tester (Batch 2 CONDITIONAL, `HAS_CRITICAL_CODE=TRUE`)
- **Score method:** **MEASURED / EXECUTED** — real mutants applied to source (or compiled `dist` for the dist-imported test), real `vitest run` per mutant, byte-for-byte restore via `git checkout` (or backup copy for the git-ignored `dist`), restore verified.
- **Prior report:** `docs/metaharness/qcsd-development/07-mutation-testing.md` (2026-06-15) — 53.6% on critical generator code.

---

## 1. Executive Summary

This round did two things: (1) **re-tested every dangerous surviving mutant from the prior round on current HEAD**, and (2) **opened the new `darwin-mode` safety surface** (safety.ts / sandbox.ts / mutator.ts), which did not exist when the prior pass ran.

The headline is a **tale of two packages**:

- **Generator (`create-agent-harness`): unchanged and still weak where it hurts.** The source and tests for the critical modules are byte-identical to the prior round, so **all 11 prior survivors re-confirmed SURVIVED** on HEAD `5f63ac6` — plus **2 new survivors** found this round. The value-bearing security decisions (finding severity, bundle redaction, witness shape-gate boundaries, gcloud auth validation) remain regression-unsafe, and **none of them has a backstop**: a silent weakening ships green.

- **Darwin (`darwin-mode`): genuinely strong on the load-bearing boundary.** Every *primary* security gate mutant was **KILLED** — disabling the runtime safety gate, the file allowlist, the symlink reject, the content scanner, the generated-code validator, the `process.env` detector, and the disqualified-exit-code (99) all break a test. The Darwin survivors are exclusively **defense-in-depth redundant layers, boundary off-by-ones, and robustness paths**, each one backstopped by a *killed* primary gate. That is the right shape for a security suite.

| Package | Mutants (this round) | Killed | Survived | Measured score | Gate band |
|---------|----------------------|--------|----------|----------------|-----------|
| `create-agent-harness` (generator) | 21 | 8 | 13 | **38.1%** (survivor-weighted sample; see §6) | **HOLD-leaning CONDITIONAL** |
| `darwin-mode` (safety/sandbox/mutator) | 15 | 9 | 6 | **60.0%** | **CONDITIONAL (load-bearing gates all SHIP-grade)** |

**Gate verdict:**
- **Generator critical code → CONDITIONAL, trending HOLD.** witness-client (25%) and threat-model (25%) are individually in the HOLD band, and the single highest-blast-radius mutant (redaction removal) survives. Unchanged from prior round = the prior HOLD/CONDITIONAL concern is **not addressed**.
- **Darwin critical code → CONDITIONAL on completeness, but SHIP-grade on the security boundary.** Do not let the 60% number obscure that *every* mutant capable of letting a hostile variant execute or unsafe code reach disk was killed.

**Single most dangerous surviving mutant:** `threat-model.ts:178 / :186` — the `--bundle` redaction can be **completely removed** (`SECRET_RE.test(k)` → `false`) and all 8 threat-model tests still pass. The `--bundle` artifact is explicitly advertised as "sanitised" and is the file users are told to attach to a GitHub issue. Redaction has **zero test coverage of its actual redacting behavior**.

---

## 2. Method (Evidence: EXECUTED)

Environment matches the brief: workspace-level `npm run build` / `npm test` is RED (missing `@ruvector/tiny-dancer`, environmental). I bypassed the broken `pretest` by running the package-scoped runner directly: `cd <package> && npx vitest run <files>` (vitest 2.1.9, hoisted from the workspace root — `node_modules/.bin/vitest` is not in the package, but `npx vitest` resolves the root binary). `which gcloud` → exit 2 (not installed) — relevant to the secrets self-disable, below.

Per mutant:
1. Apply a single-operator edit with `perl -0777 -i -pe` to the **source** TS (vitest transforms TS directly — no rebuild needed).
2. Confirm the edit actually changed the file (`git diff --quiet` guard; a non-matching mutant is reported NO-CHANGE, not a false KILLED).
3. Run the owning test file(s) via `npx vitest run`; KILLED iff the run reports `failed`.
4. Restore byte-for-byte via `git checkout -- <file>`.

**Exception — `threat-model.ts`:** its test (`/workspaces/agent-harness-generator/__tests__/harness-threat-model.test.ts`, repo-root, not the package) imports the **compiled** `packages/create-agent-harness/dist/threat-model.js`. `dist` is git-ignored, so I mutated the compiled JS directly, ran the test, and restored from a backup copy (`diff -q` confirmed RESTORED).

Baselines (all green before mutating):
```
create-agent-harness: mcp-scan 8, witness-client 11, renderer 17, secrets 8, validate 10, writer 5  → all pass
root:                 harness-threat-model 8 → pass
darwin-mode:          sandbox 6, mutator 13, inspect-bypass 52, sandbox-injection 6, validate-generated 32 → all pass
```
Final `git status` after the campaign: clean (only the pre-existing untracked `analysis/`). Post-restore re-run of darwin sandbox + inspect-bypass: 58/58 pass.

---

## 3. Generator results (`create-agent-harness`) — every prior survivor re-confirmed

Legend: **K** killed (good) · **S** survived (test gap). file:line is current HEAD.

### 3.1 mcp-scan.ts — 3 K / 6 (50%)
| ID | Mutation | file:line | Verdict | vs prior |
|----|----------|-----------|---------|----------|
| M1 | `allow-shell` severity `'high'` → `'medium'` | mcp-scan.ts:77 | **SURVIVED** | same (S) |
| M6 | `allow-network` severity `'medium'` → `'low'` | mcp-scan.ts:80 | **SURVIVED** | same (S) |
| M3 | drop no-timeout check `if(!timeout\|\|timeout<=0)` → `if(timeout<0)` | mcp-scan.ts:92 | KILLED | — |
| M5 | text exit `highs>0?1:0` → `highs>=0?1:0` | mcp-scan.ts:171 | KILLED | same (K) |
| M5json | **json exit `highsCount>0?1:0` → `highsCount>=0?1:0`** | mcp-scan.ts:154 | **SURVIVED** | **NEW** |
| M2 | `policy.defaultDeny !== true` → `if(false)` | mcp-scan.ts:73 | KILLED | same (K) |

**M1 + M6 still survive (the exact scenario the task named).** Tests assert `report.worst` and finding `id` but **never the per-finding `severity`**, so an `allow-shell` grant can be silently downgraded HIGH→MEDIUM. Because `mcpScanCmd` derives its exit code from the count of `high` findings, that downgrade also flips the CLI **exit code 1→0**, so a CI gate built on `harness mcp-scan` stops blocking a shell grant. **New this round (M5json):** the `--json` exit-code path (`mcp-scan.ts:154`) is untested — `>0`→`>=0` (always exit 1) survives. The direction here over-blocks (safe), but it proves the `--json` gate path has no exit-code assertion at all, so the opposite flip on that path would also slip.

### 3.2 renderer.ts — 1 K / 3 (33%)
| ID | Mutation | file:line | Verdict | vs prior |
|----|----------|-----------|---------|----------|
| R1 | loosen `{{var}}` class `[a-zA-Z_][a-zA-Z0-9_]*` → `[a-zA-Z0-9_.-]+` (both occurrences) | renderer.ts:34 & :52 | **SURVIVED** | same (S) |
| R3 | name length `> 214` → `>= 214` | renderer.ts:68 | **SURVIVED** | same (S) |
| R-anchor | drop `^…$` anchors on name regex | renderer.ts:71 | KILLED | (prior R4 K) |

**R1 (injection-safety regex) still survives.** Loosening the only structural defense against attacker-controlled template variables — to admit `.`, `-`, and leading digits (`{{a.b}}`, dotted/proto-style keys) — passes all 17 renderer tests. The single negative test only checks *single* braces; nothing pins the safe character class. R3 is the same untested 214-char boundary direction as prior.

### 3.3 witness-client.ts — 1 K / 4 (25%) — HOLD band
| ID | Mutation | file:line | Verdict | vs prior |
|----|----------|-----------|---------|----------|
| WC1 | public_key `length !== 64` → `< 64` (accept over-length keys) | witness-client.ts:54 | **SURVIVED** | same (S) |
| WC2 | signature `length !== 128` → `< 128` (accept over-length sigs) | witness-client.ts:57 | **SURVIVED** | same (S) |
| WC4 | schema gate `m.schema !== 1` → `m.schema > 1` (accept schema 0/neg) | witness-client.ts:51 | **SURVIVED** | same (S) |
| WC3 | degraded fallthrough `valid:true` → `valid:false` | witness-client.ts:86 | KILLED | same (K) |

The Ed25519 **shape gate** still rejects only *too-short* keys/sigs and schema `999`; over-length keys/sigs and schema `0`/negative all pass the TS pre-flight unverified. Note this layer remains a *shape* gate only — the prior round's HIGH-1 finding (no kernel `witnessVerify` backend, degraded mode returns `valid:true`) is structurally still here (`witness-client.ts:72-86`): the crypto check is a no-op when `@metaharness/kernel` lacks `witnessVerify`, so these boundary gaps are the *only* witness validation that actually runs in most environments.

### 3.4 secrets.ts — 2 K / 4 (50%)
| ID | Mutation | file:line | Verdict | vs prior |
|----|----------|-----------|---------|----------|
| S2 | drop `if(!project\|\|problems>0) return` → `if(false)` | secrets.ts:86 | **SURVIVED** | same (S) |
| S3 | invert auth-OK guard `if(auth.code!==0\|\|!stdout.trim())` → `if(auth.code===0)` | secrets.ts:90 | **SURVIVED** | same (S) |
| S1 | fetch failure guard `r.code !== 0` → `=== 0` | secrets.ts:146 | KILLED | same (K) |
| S4 | unknown-subcommand exit `2` → `0` | secrets.ts:238 | KILLED | same (K) |

**Root cause unchanged:** `check()` self-disables when gcloud is absent (`which gcloud` → exit 2, EXECUTED). The PATH escape-hatch returns before auth validation (S3) and the problems short-circuit (S2) ever execute, so the mocked-runner coverage is illusory in CI. The fix (inject `isGcloudOnPath`) was not applied.

### 3.5 threat-model.ts — 1 K / 4 (25%) — HOLD band, highest blast radius
| ID | Mutation | file:line | Verdict | vs prior |
|----|----------|-----------|---------|----------|
| T1 | weaken `SECRET_RE` → drop `token`/`key` | threat-model.ts:178 | **SURVIVED** | same (S) |
| T1b | **disable redaction entirely** `SECRET_RE.test(k)` → `false` | threat-model.ts:186 | **SURVIVED** | **NEW (stronger)** |
| T3 | drop `shellAccess` disjunct from HIGH verdict | threat-model.ts:99 | **SURVIVED** | same (S) |
| Texit | HIGH `exitCode = 2` → `0` | threat-model.ts:101 | KILLED | — |

**T1b is the new, damning result:** redaction does not need to be *weakened* — it can be **removed entirely** and the `--bundle` test (`harness-threat-model.test.ts:128-141`) stays green, because that test asserts `schema`, `generatedAt`, `exitCode`, `verdict`, `shellAccess` and **never asserts a single field renders `[REDACTED]`**. The bundle is sold as "sanitised" (the artifact users attach to a public GitHub issue). T3 still survives because the risky fixture trips HIGH via several conditions at once, so the shell-only escalation path is not isolated.

### 3.6 validate.ts / writer.ts — strong (spot-checked)
writer.ts now has a dedicated `writer.test.ts` (5 tests) — the prior round's nice-to-have #8 was implemented (writer overwrite-guard coverage is no longer purely transitive). validate.ts V3 (comment-skip) was a NO-CHANGE this round (source shape differs from the prior expr); prior verdict was a low-impact SURVIVED. Neither is a security regression.

---

## 4. Darwin results (`darwin-mode`) — the new surface

Legend as above. Tests run per mutant: safety → inspect-bypass(52) + validate-generated(32) + sandbox-injection(6) + safety-invariant.e2e; sandbox → sandbox(6) + sandbox-injection(6) + safety-invariant.e2e; mutator → mutator(13) + validate-generated(32) + epistasis.

### 4.1 safety.ts — 5 K / 9 (55.6%) — primary gates all KILLED
| ID | Mutation | file:line | Verdict | Class |
|----|----------|-----------|---------|-------|
| SA-allowlist | `if(!APPROVED_FILES.has(name))` → `if(false)` (accept any filename) | safety.ts:157 | **KILLED** | primary gate |
| SA-symlink | `if(stat.isSymbolicLink())` → `if(false)` (accept symlinks) | safety.ts:143 | **KILLED** | primary gate |
| SA-content | `if(re.test(content))` → `if(false)` (disable content scan) | safety.ts:179 | **KILLED** | primary gate |
| SA-vgc | `validateGeneratedCode` `if(re.test(code))` → `if(false)` | safety.ts:195 | **KILLED** | primary gate |
| SA-env | break the `process.env` blocked-content pattern | safety.ts:81 | **KILLED** | primary gate |
| SA-fnpat | drop blocked-filename loop `if(lower.includes(pat))` → `if(false)` | safety.ts:161 | SURVIVED | redundant (allowlist covers it) |
| SA-size | file-size cap `> MAX_FILE_BYTES` → `>=` | safety.ts:166 | SURVIVED | boundary |
| SA-maxfiles | dir file cap `> MAX_FILES` → `>=` | safety.ts:127 | SURVIVED | boundary |
| SA-isfile | `if(!stat.isFile())` → `if(false)` (accept non-regular files) | safety.ts:151 | SURVIVED | redundant (symlink/dir checked separately) |

The load-bearing checks are all tested. **The survivors are not exploitable in isolation:** SA-fnpat is dead-covered by the killed allowlist (a `.env`/`secret`-named file is already not one of the seven approved filenames); SA-isfile is backstopped by the separately-killed symlink and directory rejections; SA-size/SA-maxfiles are off-by-one boundary gaps at 256 KiB / 32 files (and an oversized/over-count variant directory already trips the allowlist). Real risk: low. Worth adding boundary-exact tests for completeness.

### 4.2 sandbox.ts — 3 K / 4 (75%) — the gate-first property is well pinned
| ID | Mutation | file:line | Verdict | Class |
|----|----------|-----------|---------|-------|
| SB-gate-off | **disable the safety gate** `if(findings.length>0)` → `if(false)` (disqualified variant RUNS) | sandbox.ts:96 | **KILLED** | primary gate |
| SB-gate-boundary | `findings.length>0` → `>1` (single-finding variant slips through) | sandbox.ts:96 | **KILLED** | primary gate |
| SB-exitcode | `DISQUALIFIED_EXIT_CODE = 99` → `0` (disqualified reports success) | sandbox.ts:29 | **KILLED** | primary gate |
| SB-emptyargv | `if(argv.length===0)` → `if(false)` (empty testCommand fallback) | sandbox.ts:118 | SURVIVED | robustness path |

The two non-negotiable properties the file documents — *gate runs first* and *disqualified ⇒ exit 99* — are killed three different ways. The one survivor is the empty-`testCommand` defensive branch, a robustness path, not a security boundary.

### 4.3 mutator.ts — 1 K / 2 (50%)
| ID | Mutation | file:line | Verdict | Class |
|----|----------|-----------|---------|-------|
| MU-child-gate | validate-before-write `if(violations.length>0)` → `if(false)` (write unsafe mutation to disk) | mutator.ts:358 | **KILLED** | primary gate |
| MU-cross-gate | crossover defensive skip `if(validateGeneratedCode(codeB).length>0) continue` → `if(false)` (adopt unsafe surface from parentB) | mutator.ts:281 | SURVIVED | redundant (runtime `inspectVariant` backstops) |

The primary write-gate in `createChildVariant` (mutation never reaches disk unvalidated) is tested. MU-cross-gate survives, but the crossover path only recombines files that **already passed the gate when their parent was built**, and any unsafe child is *still* caught at execution by the sandbox `inspectVariant` gate (SB-gate-off KILLED). It is a redundant defense-in-depth layer; adding a direct test would harden it but it is not an open hole.

---

## 5. Score & Gate

| Module | Pkg | K / total | Score | Risk | Notes |
|--------|-----|-----------|-------|------|-------|
| mcp-scan.ts | gen | 3/6 | 50% | HIGH | severity flip → exit 1→0; CI gate bypass |
| renderer.ts | gen | 1/3 | 33% | HIGH | injection-safety regex loosenable |
| witness-client.ts | gen | 1/4 | 25% | CRITICAL | shape gate over-length/schema-0; crypto is no-op degraded |
| secrets.ts | gen | 2/4 | 50% | HIGH | auth validation untested (gcloud self-disable) |
| threat-model.ts | gen | 1/4 | 25% | CRITICAL | **redaction has zero behavioral coverage** |
| **Generator subtotal** | | **8/21** | **38.1%** | | survivor-weighted (see §6) |
| safety.ts | darwin | 5/9 | 56% | CRITICAL | all primary gates KILLED; survivors redundant |
| sandbox.ts | darwin | 3/4 | 75% | CRITICAL | gate-first + exit-99 KILLED |
| mutator.ts | darwin | 1/2 | 50% | HIGH | write-gate KILLED; crossover skip redundant |
| **Darwin subtotal** | | **9/15** | **60.0%** | | load-bearing boundary SHIP-grade |

**Gate mapping (critical code): SHIP ≥70% / CONDITIONAL 50–69% / HOLD <40%.**

- **Generator → CONDITIONAL, trending HOLD.** The raw 38.1% is below the 40% HOLD line, but it is survivor-weighted by design (§6); the comparable prior census was 53.6% (CONDITIONAL) and the source/tests are unchanged, so the honest read is **unchanged CONDITIONAL with two HOLD-band modules (witness-client, threat-model at 25%)**. The prior gate concern is **not addressed**.
- **Darwin → CONDITIONAL on completeness, SHIP-grade on the security boundary.** 60% overall, but 100% of the mutants that could let a hostile variant execute, leak `process.env`, or write unsafe code to disk were killed. The survivors are boundary/redundant/robustness. This is the strongest critical-path suite in the subject repo.

---

## 6. Caveats (honesty about the sample)

- **The generator sample is survivor-weighted on purpose.** The task asked me to *re-test the prior survivors specifically*, so 11 of the 21 generator mutants were chosen *because they survived last time* — they survive again (the code is identical), which mechanically depresses the per-module rate below a fair census. The defensible claim is **directional, not a new census number**: *every dangerous generator gap from the prior round is still open on HEAD `5f63ac6`*, plus two new survivors (T1b, M5json). A full Stryker census would land near the prior 53.6%.
- **Darwin is a fresh, balanced sample** (primary gates + boundaries + redundant layers), so its 60% is a more representative measured figure — and its qualitative shape (all primary gates killed) is the point.
- **No Stryker.** Same as prior — no `stryker*` config, not installed; pure-ESM + vitest under host-shared `node_modules` made standing it up high-risk/low-yield. This is a **targeted hand-mutation campaign**, EXECUTED, labelled as such.
- **No equivalent mutants among the dangerous survivors** (M1, M6, R1, WC1/2/4, S2/3, T1/T1b/T3) — each changes observable security behavior (severity, accept/reject, redact/leak). SA-fnpat / SA-isfile / MU-cross-gate are *effectively* equivalent given a killed backstop, and are reported as redundant-layer gaps, not exploitable holes.

---

## 7. Highest-value assertions to add (kills the dangerous survivors)

**Generator (must-add — security-critical):**
1. **Redaction proof (kills T1, T1b).** In `harness-threat-model.test.ts` `--bundle`, build a risky repo whose policy/settings carry keys `apiToken`, `signingKey`, `dbPassword`, `mySecret`, then assert each renders `[REDACTED]` in the bundle JSON and a non-secret key is preserved. Assert every word in `SECRET_RE` individually. *(Without this, redaction has no behavioral test at all.)*
2. **Per-finding severity (kills M1, M6).** In `mcp-scan.test.ts`, assert `findings.find(f=>f.id==='allow-shell').severity==='high'` and `'allow-network'==='medium'`; add `expect(mcpScanCmd([riskyDir]).code).toBe(1)` *because of* a shell grant, and a `--json` exit-code assertion (kills M5json).
3. **Witness boundary (kills WC1, WC2, WC4).** public_key length 65 → invalid; signature length 129 → invalid; `schema:0` → invalid (assert `reason` matches `/schema/`). Pin the gate to exact equality.
4. **De-fang the gcloud self-disable (kills S2, S3).** Make `isGcloudOnPath` injectable so `check()` runs its full body under the mocked runner; add a no-active-auth case (`code===1`, message `/no active gcloud auth/`) and a full-HEALTHY case without the PATH escape hatch.

**Generator (should-add):** pin the renderer character class (`render('{{a.b}}',{'a.b':'x'}).output==='{{a.b}}'`, leading-digit left intact) to kill R1; boundary-exact name tests (214 valid / 215 invalid) to kill R3.

**Darwin (hardening — low real risk, completes defense-in-depth):**
5. Boundary-exact safety tests: a 256 KiB-exact file and a 32-entry-exact directory (kills SA-size, SA-maxfiles); a non-regular-file (FIFO) named `planner.ts` is rejected (kills SA-isfile); a blocked-filename that *would* be allowed by the allowlist if it weren't pattern-blocked (kills SA-fnpat).
6. A direct crossover test that feeds parentB a surface file containing `process.env` and asserts the child does not adopt it (kills MU-cross-gate).
7. An empty-`testCommand` RepoProfile yields an exit-1 trace, not a crash (kills SB-emptyargv).

---

## 8. Status vs prior round

| Prior finding (07, 2026-06-15) | Status | Evidence (HEAD 5f63ac6) |
|--------------------------------|--------|--------------------------|
| T1 — bundle redaction allow-list gutting undetected | **Still-open (worse)** | threat-model.ts:178 S; **T1b** total removal at :186 also S |
| M1/M6 — mcp-scan severity flip HIGH→MED / MED→LOW, exit 1→0 | **Still-open** | mcp-scan.ts:77/:80 both SURVIVED |
| WC1/WC2/WC4 — witness over-length key/sig + schema 0/neg accepted | **Still-open** | witness-client.ts:54/:57/:51 all SURVIVED |
| S2/S3 — secrets `check()` auth/short-circuit untested (gcloud self-disable) | **Still-open** | secrets.ts:86/:90 SURVIVED; `which gcloud`→exit 2 |
| R1/R3 — renderer injection regex loosenable; 214 boundary | **Still-open** | renderer.ts:34/:52/:68 SURVIVED |
| T3 — shell-only HIGH escalation not isolated | **Still-open** | threat-model.ts:99 SURVIVED |
| writer overwrite-guard purely transitive (nice-to-have #8) | **Fixed** | dedicated `writer.test.ts` (5 tests) present |
| mcp-scan `--json` exit-code path | **New (S)** | mcp-scan.ts:154 SURVIVED (over-blocks; path has no exit assertion) |
| darwin safety/sandbox/mutator (did not exist) | **New (strong)** | all primary gates KILLED: safety.ts:157/143/179/195/81, sandbox.ts:96/29, mutator.ts:358 |

**Bottom line:** the generator's critical-path test gaps are **entirely unaddressed** since the prior round and the worst one (redaction) is now provably *completely* untested; the new Darwin safety surface is the repo's best-tested critical code, with only redundant/boundary survivors. Generator critical code remains the blocker.
