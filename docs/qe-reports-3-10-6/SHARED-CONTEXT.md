# QE Fleet Shared Context — qe-reports-3-10-6

**Analyzed version**: v3.10.6 (package.json source of truth)
**Baseline for deltas**: v3.9.13 (prior run: `docs/qe-reports-3-9-13/`)
**Shared memory namespace**: `aqe/v3/qe-reports-3-10-6`
**Date**: 2026-06-12
**Commits since baseline**: ~270 (incl. ADR-105..110 pattern-space, ADR-106 safety eval, ADR-108 lineage gate, ADR-109 interaction benchmark, ADR-110 learning wiring)

> Note: folder is named `qe-reports-3-10-6` per request; the actual analyzed version is **3.10.6**. Reports should label the analyzed version 3.10.6.

## Shared baseline snapshot (v3.10.6, gathered centrally — verify before citing)

| Metric | v3.9.13 | v3.10.6 | Delta |
|--------|--------:|--------:|------:|
| Source files (`src/**/*.ts` excl. tests) | 1,263 | 1,295 | +32 |
| Test files (`tests/**/*.test.ts`) | 777 | 871 | +94 |
| Source LOC | 564,564 | 576,457 | +2.1% |
| Files >500 lines | 447 | 453 | +6 |
| QE agents (`.claude/agents/v3/qe-*.md`) | 53 | 53 | 0 (README/pkg claim 60) |
| `console.*` calls (src) | 3,278 | 3,413 | +135 |
| `as any` (src) | 18 | 25 | +7 |
| `as unknown as` (src) | 136 | 142 | +6 |
| `.skip/.only/xit/xdescribe` (tests, broad regex) | 30* | 165 | *prior counted .skip/.only only — reconcile methodology |
| `process.exit` (src) | 52 | 54 | +2 |
| `captured_experiences` rows | 17,145 | 19,810 | +2,665 |
| `qe_patterns` rows | 468 | 276 | **-192 (investigate)** |
| `sona_patterns` rows | — | 1,067 | — |

## Methodology rules (MANDATORY — per project CLAUDE.md)

1. **Evidence-based only.** Every claim must cite real `file:line` from `grep`/`Read`/`Bash` you actually ran. NO fabricated numbers. NEVER simulate.
2. **Track deltas v3.9.13 → v3.10.6.** Read your corresponding prior report in `docs/qe-reports-3-9-13/` and produce a remediation table: which prior P0/P1 findings are FIXED / PARTIAL / UNCHANGED / REGRESSED, with evidence.
3. **Reconcile counts.** If your count differs from the shared snapshot above, state your exact command and reconcile.
4. **Score on the same 0–10 scale** the prior report used, with explicit delta and trend.
5. **Assess the new ADR-105..110 work** if it falls in your dimension (pattern-space, safety eval, learning wiring, benchmark lineage).
6. **No data-loss operations.** Read-only against `.agentic-qe/memory.db` (use `readonly` or sqlite3 SELECT only). Never write/drop.

## New since baseline to assess (route to relevant dimension)
- ADR-105..110: pattern-space / cross-family interaction / learning wiring (PR #523, issue #522)
- ADR-106 safety eval (per-tier live eval), ADR-108 CI lineage gate, ADR-109 interaction benchmark rubric pre-registration
- `@ruvector/sona` 0.1.5→0.1.7 (learning weight-update fix, this session)
- better-sqlite3 native fix + `aqe-hook.cjs` resilience (this session)

## Output contract
- Write to `docs/qe-reports-3-10-6/NN-<name>.md` (same numbering as prior run).
- End your report with a `## Shared Memory` block: 3–6 bullet findings you stored to namespace `aqe/v3/qe-reports-3-10-6` (store via `npx ruflo memory store --key <dim>-<n> --value "<finding>" --namespace aqe/v3/qe-reports-3-10-6`).
- Return to the Queen: your score, delta, top-3 findings, and P0 count.

## Prior-run P0 release blockers to RE-VERIFY (were open at v3.9.13)
1. 15 CRITICAL runtime npm vulns (protobufjs <7.5.5 via @xenova/transformers → @claude-flow/browser+guidance). Fix was `overrides.protobufjs`.
2. Tarball bloat +79% (799 stale chunks; fix was `rimraf dist/cli/chunks` in build-cli.mjs).
3. 22 retiring-model refs in src/ (`claude-3-haiku-20240307` at constants.ts).
4. ESLint `npm run lint` still failing ("tests glob ignored").
5. `advisor_consult` empty-string fallback contract bug (ADR-092).
