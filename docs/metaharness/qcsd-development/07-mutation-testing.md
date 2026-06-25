# 07 — Mutation Testing: Test Effectiveness on MetaHarness Safety-Critical Code

- **Repo under review:** `ruvnet/agent-harness-generator` (MetaHarness) v0.1.x
- **Working copy:** `/workspaces/agent-harness-generator`
- **Package:** `metaharness` (`packages/create-agent-harness`, v0.1.7)
- **Phase / Swarm:** QCSD Development — qe-mutation-tester
- **Trigger:** `HAS_CRITICAL_CODE=TRUE` (governance / provenance / security surface)
- **Date:** 2026-06-15
- **Score method:** **MEASURED** (real mutants applied to source, real `vitest run` executed per mutant). This is *not* an estimate.

---

## 1. Executive Summary

The prior pass established that MetaHarness's safety-critical modules are *tested*. This pass asked the harder question: **are those tests strong enough to catch a real regression in the security/governance logic?** The answer, measured by applying mutations and re-running the suite, is: **partially — and the gaps are concentrated exactly where they hurt most** (severity classification, the injection-safety regex, the redaction allow-list, and the witness shape-gate boundaries).

| Metric | Value |
|--------|-------|
| Mutants applied (sampled, critical modules only) | 28 |
| KILLED (caught by a test) | 15 |
| SURVIVED (no test detected the change) | 13 |
| **Measured mutation score (critical-path sample)** | **53.6%** |
| Gate band | **CONDITIONAL (50–69%)** |

**Gate verdict: CONDITIONAL.** The atomic-write/`--force` guard (writer.ts) and the umbrella aggregation (validate.ts) are genuinely strong. But the *value-bearing security decisions* — what severity a finding gets, what counts as a valid public key/signature, what fields get redacted in a shareable bundle, and whether the injection regex actually constrains template variables — have surviving mutants. For a product whose pitch is "npm audit for agent tools" + cryptographic provenance, these are the assertions that must not be weak. Ship is gated on adding the high-value assertions in §6.

---

## 2. Method (Evidence: EXECUTED)

No Stryker config exists in the repo (`find . -name 'stryker*'` → none) and Stryker is not installed (`node_modules/.bin/stryker` absent). The project is pure ESM (`"type": "module"`, `module: ESNext`, `moduleResolution: Bundler`) and uses **vitest 2.1.9**; standing up StrykerJS for pure-ESM + vitest in this sandbox was judged high-risk/low-yield against the host-shared `node_modules` constraint.

Instead I ran a **manual-but-executed** mutation campaign:

1. `npm run build` — **succeeds** (build-ordered DONE in ~5.8s). EXECUTED.
2. Baseline: ran the 7 critical-module test files → **70/70 pass**. EXECUTED.
3. For each mutant: edit the source operator/literal, run the owning test file via `vitest run`, record pass/fail, then restore the original byte-for-byte (`diff -q` confirmed RESTORED after every batch).
   - Tests that import from `../src/*.ts` (vitest transforms TS directly) → mutate + run, no rebuild.
   - `harness-threat-model.test.ts` imports from `dist/` → mutate + `tsc` rebuild + run, then restore + rebuild.

Every KILLED/SURVIVED verdict below is **EXECUTED** (a real test run), not inferred. The score is therefore a *measured* score over the sampled mutants — representative of the critical path, not the whole codebase.

Baseline command/output:
```
npx vitest run <7 critical test files>
Test Files  7 passed (7)   Tests  70 passed (70)
```

---

## 3. Results by Module

Legend: **K** = killed (good), **S** = survived (test gap).

### 3.1 mcp-scan.ts — 3 K / 6 (50%)
`packages/create-agent-harness/src/mcp-scan.ts`

| ID | Mutation | file:line | Verdict |
|----|----------|-----------|---------|
| M1 | `allow-shell` severity `'high'` → `'medium'` | mcp-scan.ts:77 | **SURVIVED** |
| M2 | `defaultDeny !== true` check → `if (false)` (deny-check removal) | mcp-scan.ts:73 | KILLED |
| M3 | timeout boundary `timeout <= 0` → `timeout < 0` | mcp-scan.ts:92 | **SURVIVED** |
| M4 | secret-guard `if (!guardsEnv)` → `if (false)` | mcp-scan.ts:113 | KILLED |
| M5 | exit code `highs > 0 ? 1 : 0` → `highs >= 0 ? 1 : 0` | mcp-scan.ts:163 | KILLED |
| M6 | `allow-network` severity `'medium'` → `'low'` | mcp-scan.ts:80 | **SURVIVED** |

**The exact scenario the task named — flipping a HIGH→MED severity — SURVIVES (M1).** The tests assert `r.worst` and `findings.some(id===...)`, but **never assert the `severity` field of an individual finding**. So an MCP shell-access grant could be silently downgraded from HIGH to MEDIUM (which changes `mcpScanCmd`'s exit code from 1 to 0 — CI would stop blocking it) and the suite stays green. M6 is the same blind spot for network access. M3 shows the timeout boundary is untested at exactly `0` vs negative.

### 3.2 renderer.ts — 3 K / 5 (60%)
`packages/create-agent-harness/src/renderer.ts`

| ID | Mutation | file:line | Verdict |
|----|----------|-----------|---------|
| R1 | `{{var}}` identifier class `[a-zA-Z_][a-zA-Z0-9_]*` → `[a-zA-Z0-9_.-]+` (loosen injection-safety regex, allow `.`/`-`/leading-digit) | renderer.ts:34 & :52 | **SURVIVED** |
| R2 | drop consecutive-hyphen check `if (name.includes('--'))` → `if (false)` | renderer.ts:74 | KILLED |
| R3 | name length boundary `> 214` → `>= 214` | renderer.ts:68 | **SURVIVED** |
| R4 | drop `^` start-anchor on name regex | renderer.ts:71 | KILLED |
| R5 | drop `endsWith('-')` check → `if (false)` | renderer.ts:77 | KILLED |

**R1 is the headline injection-safety survivor.** The renderer's only structural defense against an attacker-controlled template expanding arbitrary keys is the restrictive `{{var}}` character class. Loosening it to permit `.`, `-`, and leading digits (the door to `{{a.b}}`, `{{__proto__}}`-style keys, dotted paths) **passes all 17 tests**. The single negative test (`render('{name}')` → unchanged) only checks *single* braces; nothing asserts that `{{a.b}}` is left untouched or that the captured name set is exactly the safe class. R3 is a classic off-by-one: the 214-char limit is tested at 215 chars but never at exactly 214, so the boundary direction is unverified.

### 3.3 writer.ts — 3 K / 3 (100%) — STRONG
`packages/create-agent-harness/src/writer.ts` (exercised via `scaffold-e2e.test.ts`)

| ID | Mutation | file:line | Verdict |
|----|----------|-----------|---------|
| W1 | drop refuse-overwrite guard `if (existsSync(targetDir) && !opts.force)` → `if (false)` | writer.ts:31 | KILLED |
| W2 | invert force guard `!opts.force` → `opts.force` | writer.ts:31 | KILLED |
| W3 | skip rm-of-existing-target on force `if (existsSync && opts.force)` → `if (false)` | writer.ts:45 | KILLED |

The atomic-rename / `--force` guard is **well tested**. The "refuses to overwrite without --force" and "overwrites with --force" + idempotency tests in `scaffold-e2e.test.ts` kill all three overwrite-guard mutants. No action needed here. (Note: writer.ts has *no dedicated unit test*; coverage is entirely transitive through the scaffold E2E. That happens to work today but is fragile — see §6 nice-to-have.)

### 3.4 secrets.ts — 2 K / 4 (50%)
`packages/create-agent-harness/src/secrets.ts`

| ID | Mutation | file:line | Verdict |
|----|----------|-----------|---------|
| S1 | `fetch` failure guard `r.code !== 0` → `=== 0` | secrets.ts:146 | KILLED |
| S2 | drop project/problems short-circuit `if (!project \|\| problems > 0) return` → `if (false) return` | secrets.ts:86 | **SURVIVED** |
| S3 | invert auth-OK check `if (auth.code !== 0 \|\| !auth.stdout.trim())` → `=== 0` | secrets.ts:90 | **SURVIVED** |
| S4 | dispatch unknown-subcommand exit `2` → `0` | secrets.ts:238 | KILLED |

**Root cause: the `check()` tests self-disable in any environment without gcloud.** Confirmed EXECUTED: `which gcloud` → exit 1 (not installed). Every `harness secrets check` test contains an early-return escape hatch (`if (lines[1]?.includes('FAIL gcloud CLI not on PATH')) { expect(code).toBe(1); return; }`). With no gcloud, the entire body of `check()` — project resolution, **auth validation (S3)**, secret-exists, the `problems` counter, and the HEALTHY/issue verdict — is **never executed**. That is why S2 and S3 survive: the mocked-runner code paths the tests *think* they cover are not reached in CI. This is a test that reports green while testing almost nothing of `check()`.

### 3.5 threat-model.ts — 1 K / 3 (33%)
`packages/create-agent-harness/src/threat-model.ts`

| ID | Mutation | file:line | Verdict |
|----|----------|-----------|---------|
| T1 | weaken redaction `SECRET_RE` `(secret\|token\|key\|password\|passphrase)` → `(secret\|password)` (stop redacting `token`/`key`) | threat-model.ts:178 | **SURVIVED** |
| T2 | `secretsReachable` invert `!guardsEnv` → `guardsEnv` | threat-model.ts:86 | KILLED |
| T3 | drop `shellAccess` from HIGH-verdict condition | threat-model.ts:99 | **SURVIVED** |

**T1 is the redaction survivor the task asked about** (the real redaction code lives here, not in `secrets.ts`). The `--bundle` output is explicitly advertised as "sanitised; secret_/token_/key_/password_ fields are redacted" (validate.ts:255). Yet the `--bundle` test (`harness-threat-model.test.ts:128`) only asserts `schema`, `generatedAt`, `exitCode`, `verdict`, `shellAccess` — **it never asserts that any secret-bearing field renders as `[REDACTED]`**. Dropping `token` and `key` from the redaction list ships secrets into a "sanitised" artifact, undetected. T3 survives because the risky fixture trips HIGH via *several* conditions at once (shell + default-deny-off + secrets-reachable), so removing the `shellAccess` disjunct doesn't change the verdict — the HIGH escalation is not isolated to shell.

### 3.6 witness-client.ts — 1 K / 4 (25%)
`packages/create-agent-harness/src/witness-client.ts`

| ID | Mutation | file:line | Verdict |
|----|----------|-----------|---------|
| WC1 | public_key `length !== 64` → `< 64` (accept over-length keys) | witness-client.ts:54 | **SURVIVED** |
| WC2 | signature `length !== 128` → `< 128` (accept over-length sigs) | witness-client.ts:57 | **SURVIVED** |
| WC3 | degraded-mode fallthrough `valid: true` → `valid: false` | witness-client.ts:86 | KILLED |
| WC4 | schema gate `m.schema !== 1` → `m.schema > 1` (accept schema `0`/negative) | witness-client.ts:51 | **SURVIVED** |

The Ed25519 **shape gate** has weak boundary coverage. Tests check *too-short* keys/sigs and schema `999`, but never *too-long* keys/sigs or schema *below* 1. So a padded/over-length public key or signature (WC1/WC2) and a schema `0` manifest (WC4) all pass the TS pre-flight that is supposed to reject malformed input before it reaches the kernel. The kernel is the cryptographic boundary, but this layer is the documented first line ("never hand a malformed object to the kernel") and its precision is unverified.

### 3.7 validate.ts — 2 K / 3 (67%)
`packages/create-agent-harness/src/validate.ts`

| ID | Mutation | file:line | Verdict |
|----|----------|-----------|---------|
| V1 | never count problems `if (r.code !== 0) problems++` → `if (false)` | validate.ts:236 | KILLED |
| V2 | path-guard always-pass `offenders.length === 0` → `>= 0` | validate.ts:88 | KILLED |
| V3 | drop comment-line skip in path-guard | validate.ts:76 | **SURVIVED** |

The umbrella aggregation and path-guard core are strong (V1, V2 killed). V3 (the comment-skip false-positive suppressor) survives — no test places a banned path inside a comment — but the security impact is low (it would only cause over-reporting, not under-reporting).

---

## 4. Score & Gate

| Module | K / total | Module score | Risk weight |
|--------|-----------|--------------|-------------|
| mcp-scan.ts | 3/6 | 50% | HIGH (severity/exit-code drives CI gating) |
| renderer.ts | 3/5 | 60% | HIGH (injection-safety regex) |
| writer.ts | 3/3 | 100% | HIGH (data-loss guard) — **strong** |
| secrets.ts | 2/4 | 50% | HIGH (credential validation; tests self-disable) |
| threat-model.ts | 1/3 | 33% | HIGH (redaction of shareable bundle) |
| witness-client.ts | 1/4 | 25% | CRITICAL (provenance shape gate) |
| validate.ts | 2/3 | 67% | MEDIUM (aggregation — strong; V3 cosmetic) |
| **Overall (sample)** | **15/28** | **53.6%** | — |

**Gate mapping (critical code): SHIP ≥70% / CONDITIONAL 50–69% / HOLD <40%.**

- Overall sample: **53.6% → CONDITIONAL.**
- But three individual critical modules fall in or near the HOLD band: **witness-client 25%, threat-model 33%, secrets 50% (effectively lower — its `check()` body is untested in CI).**

**Verdict: CONDITIONAL — do not treat the existing green suite as proof the security logic is regression-safe.** The surviving mutants are not cosmetic; each one represents a real, silent weakening of a security control that the current tests would wave through.

---

## 5. The Surviving Mutants That Matter (ranked)

1. **threat-model.ts:178 (T1)** — Redaction allow-list can be gutted (`token`, `key` removed) and the "sanitised" `--bundle` still passes. Weak/missing assertion: `harness-threat-model.test.ts` `--bundle` case never asserts a secret-bearing field equals `[REDACTED]`. **Highest blast radius — leaks credentials into a file users are told is safe to attach to a GitHub issue.**
2. **mcp-scan.ts:77 (M1)** — HIGH→MEDIUM severity flip survives; downgrades `allow-shell` and silently flips `mcpScanCmd` exit code 1→0, so CI stops blocking. Weak assertion: tests check `worst` and finding `id`, never the per-finding `severity`. (M6 mcp-scan.ts:80 is the same gap for network.)
3. **witness-client.ts:54 & :57 (WC1/WC2)** — Over-length public_key/signature accepted (`!== 64/128` → `< 64/128`). Weak assertion: only too-*short* values tested. **WC4 (line 51)** — schema `0`/negative accepted (`!== 1` → `> 1`).
4. **secrets.ts:90 & :86 (S3/S2)** — Auth-OK guard invertible; project/problems short-circuit removable. Root cause: `check()` tests early-return because gcloud isn't on PATH (EXECUTED: `which gcloud` → exit 1), so the body is never run. The mocked-runner coverage is illusory in CI.
5. **renderer.ts:34/:52 (R1)** — Injection-safety `{{var}}` regex can be loosened to admit `.`/`-`/leading-digit and all tests pass. **R3 (line 68)** — 214-char boundary direction unverified.

(Lower priority survivors: mcp-scan.ts:92 timeout boundary M3; validate.ts:76 comment-skip V3.)

---

## 6. Highest-Value Assertions to Add

Adding these would kill 11 of the 13 surviving mutants and lift the critical-path score from 53.6% well past the 70% SHIP line.

**Must-add (kills the security-critical survivors):**

1. **Redaction proof (kills T1).** In `harness-threat-model.test.ts` `--bundle`, build a risky repo whose policy/settings contain keys like `apiToken`, `signingKey`, `dbPassword`, `mySecret`, then assert each renders `[REDACTED]` in the bundle JSON — and assert a non-secret key is preserved. Test every word in `SECRET_RE` individually.
2. **Per-finding severity assertions (kills M1, M6).** In `mcp-scan.test.ts`, assert `findings.find(f=>f.id==='allow-shell').severity === 'high'` and `...'allow-network').severity === 'medium'`. Add a test asserting `mcpScanCmd(...).code === 1` *because of* a shell grant specifically.
3. **Witness boundary tests (kills WC1, WC2, WC4).** Add cases: public_key of length 65 (`'a'.repeat(65)`) → invalid; signature length 129 → invalid; `schema: 0` → invalid (assert `reason` matches `/schema/`). These pin the gate to exact equality.
4. **De-fang the gcloud self-disable in secrets (kills S2, S3).** Refactor `isGcloudOnPath()` to be injectable (pass a stub via the runner or a param) so `check()` tests exercise the full body under the mocked runner regardless of host gcloud. Then add: a "no active auth" case (assert `problems` reflected, `code === 1`, message matches `/no active gcloud auth/`), and a full-HEALTHY case asserting `Result: HEALTHY` *without* the PATH escape hatch.

**Should-add:**

5. **Injection-regex pinning (kills R1).** In `renderer.test.ts`, assert `render('{{a.b}}', {'a.b':'x'}).output === '{{a.b}}'` (dotted keys must NOT substitute), `render('{{1bad}}', ...)` leaves it intact, and `extractVarReferences('{{a-b}} {{__proto__}}')` returns the expected safe set. This freezes the character class.
6. **Boundary-exact tests (kills R3, M3).** `validateHarnessName('a'.repeat(214)).valid === true` and `('a'.repeat(215)).valid === false`; mcp-scan with `toolTimeoutMs: 0` flags `no-timeout` but `toolTimeoutMs: 1` does not.
7. **Isolate the HIGH escalation (kills T3).** Add a threat-model fixture that is shell-on but otherwise clean (default-deny true, no secrets reachable, no network/file-write) and assert `verdict === 'high'`, so shell alone is proven to escalate.

**Nice-to-have:**

8. Add a dedicated `writer.test.ts` unit test so the (currently strong) overwrite-guard coverage doesn't silently evaporate if the scaffold E2E is refactored.

---

## 7. Caveats

- **Sample, not census.** 28 mutants across 7 critical modules — chosen for the conditional-boundary / negation / return-value / deny-check / severity / redaction classes the task named. The 53.6% is a measured score *on this sample*; a full Stryker run over all `src/**` would produce a different (and likely higher, because non-critical modules tend to be simpler) whole-package number. The point of this pass is the *critical surface*, where 53.6% is the honest figure.
- **Equivalent mutants:** none of the 13 survivors appear equivalent — every one changes observable security behavior (severity, accept/reject, redact/leak). They are true test gaps, not false alarms.
- **Reproduction:** all results are EXECUTED via `npx vitest run` against mutated source with byte-for-byte restore verified by `diff -q`. Re-runnable in `/workspaces/agent-harness-generator`.
