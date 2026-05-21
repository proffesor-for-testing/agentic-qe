# OpenHuman — QE Executive Summary

**Subject**: `tinyhumansai/openhuman` (Early Beta)
**Snapshot**: 2026-05-20
**Method**: Seven specialist QE agents ran in parallel against `/tmp/openhuman` (cloned from `main`). Each produced an evidence-based report with file:line citations. This document is the cross-cutting synthesis.
**Source clone**: `/tmp/openhuman` — repo hash from cloned `main`.

---

## TL;DR

| Dimension | Score (1=worst, 10=best) | One-line verdict |
|---|---|---|
| **Code Quality** | 6/10 | Concentrated, mechanically fixable debt — five god-files do most of the damage |
| **Security** | 7.5/10 | Strong defenses overall; two one-line HIGH issues in the cloud-deploy path |
| **Performance** | 5/10 | Good hygiene in places; five systemic patterns that will hurt under real load |
| **QX (Quality Experience)** | 6.5/10 | Distinctive strengths in trust + boot UX; weakness in i18n delivery vs ambition |
| **Complexity** | 6/10 | Three named refactors would drop it to ~4/10 |
| **Dependencies** | 6/10 | Competent baseline; reproducibility, layering, and one license item to fix |
| **SFDIPOT (test surface)** | — | Test investment is happy-path-heavy; adversarial/concurrency/resource-pressure gaps |

**Composite QE verdict**: `6.2 / 10` — credible early-beta posture for a project of this surface area (a Tauri desktop AI assistant with 118 OAuth connectors, a wallet, embedded CEF, in-process skills sandbox, MCP client+server, and auto-update for both shell and core). The product **is not** in trouble, but it carries five named risks that will become release-blocking if not paid down before GA.

---

## Top 10 Cross-Cutting Risks (ranked by blast radius × likelihood)

| # | Risk | Severity | Where | Effort to Fix |
|---|------|---------|-------|---------------|
| 1 | **RPC mutations default-on** — `rpc_mutations_enabled = true`, makes `update.run` / `update.apply` callable by any bearer-authed client. On Docker/cloud `0.0.0.0` deployments this is a credible auth'd downgrade/force-restart vector. | **HIGH** | `src/openhuman/config/schema/update.rs:53-55` | One line |
| 2 | **Variable-time token comparison** — bearer-token compared with `==` on `&str`. Source code literally comments that the fix is "one-line." | **HIGH** | `src/core/auth.rs:210-212` | One line |
| 3 | **Mutex poison bricks IPC** — `std::sync::Mutex` with 17 production `.lock().unwrap()` in the most callback-heavy Tauri host file. A single panic in any DOM-driven callback poisons the mutex → all subsequent IPC fails. `parking_lot::Mutex` is already a dependency. | **HIGH** | `app/src-tauri/src/webview_accounts/mod.rs:23` (+17 call sites) | Hours — swap import |
| 4 | **CEF `--remote-debugging-port=9222`** exposes the embedded Chromium to any local process via CDP, including OAuth-webview cookies and privileged-frame JS. | **HIGH** | tauri.conf / vendored Tauri-CEF fork | Days — gate behind dev flag |
| 5 | **Prompt-injection surface vs detector** — 118 connectors funnel untrusted text into one detector module; very few negative tests in repo. | **HIGH** | (system-level) | Weeks — adversarial corpus + property tests |
| 6 | **Skills supply chain unsigned** — `SKILLS_REGISTRY_URL` accepts arbitrary HTTP URLs, `SKILLS_LOCAL_DIR` any local path, no signing observed. Skills run in-process with the wallet and 118 OAuth tokens. | **HIGH** | env config + skills loader | Weeks — sigstore/minisign + provenance |
| 7 | **Five god-files / god-functions** — `webview_account_open` 840 LOC, `Agent::turn` 967 LOC, `Conversations.tsx` 2,125 LOC + 39 hooks, `AIPanel.tsx` 2,696 LOC, `apply_env_overrides_from` 720 LOC. Single-render crash in `Conversations.tsx` blanks the whole app (only one root `Sentry.ErrorBoundary`). | **MED** | listed in report 01/06 | 1–2 weeks per file |
| 8 | **Performance landmines under load** — WhatsApp bulk ingest is per-row INSERT with no transaction/`prepare_cached` + correlated COUNT/MAX subqueries; `Conversations.tsx` recomputes derived state every render with only one `React.memo` in the entire codebase; audio transcription does `Array.from(Uint8Array(blob))` IPC (~8× payload bloat); `sync_vault` blocking I/O in async; no code-splitting (`three` ~600 KB in main bundle). | **MED** | see report 03 | 2–4 days |
| 9 | **Non-reproducible Rust build** — `whisper-rs-sys` is git-pinned to `branch = "main"` with **no rev** in both `Cargo.toml` files. Plus two independent `Cargo.lock` files (no workspace), and two pnpm lockfiles that disagree (`vite@8.0.10` vs `vite@7.3.2`). | **MED** | `Cargo.toml`, `app/src-tauri/Cargo.toml`, lockfiles | Days — unify workspace + pin revs |
| 10 | **No backup or migration rollback for `~/.openhuman`** — single SQLite holds the irreplaceable Memory Tree; no rollback path on failed migration; backfill binaries can mutate the same DB concurrently with the live desktop. | **MED** | (system-level) | Weeks — backup + migration safety harness |

---

## Where the Product is Strong (do not undo these)

These came up across multiple reports and represent positive signals worth preserving as you grow:

- **Trust posture, best-in-class.** Default-deny consent gate, PII-stripped Sentry, GA event allowlist, in-product `WhatLeavesLink` disclosure — `features/privacy/whatLeavesItems.ts:11-31`, `services/analytics.ts:5-26`. (Caveat: `OPENHUMAN_ANALYTICS_ENABLED=true` default contradicts the marketing — flip it.)
- **Boot UX & crash recovery.** `PersistRehydrationScreen.tsx:14,47-50` has a 10s deadline with a recovery CTA; `ErrorFallbackScreen.tsx` is self-contained with three real recovery actions.
- **SSRF guard with DNS-rebinding protection** — `src/openhuman/tools/impl/network/url_guard.rs`. Real defense, not theater.
- **Docker hardening** — `read_only`, `cap_drop: ALL`, `no-new-privileges` in compose.
- **Tauri capability scoping** — caller-label verification on `webview_recipe_event` is correctly done.
- **Real test density** — ~86 k LOC of tests, ~20 Rust integration + ~55 WDIO E2E specs. Adversarial gap, but the baseline exists.
- **A11y discipline** — zero `<div onClick>` across 382 `.tsx` files; real `useT()` adoption at most points that matter.

---

## Quick Wins (≤ 1 day each, high yield)

Pick these up before anything bigger.

1. **Fix SEC-02**: replace `==` with `subtle::ConstantTimeEq` in `src/core/auth.rs:210-212`. (1 line)
2. **Fix SEC-01**: flip `rpc_mutations_enabled` default to `false`; opt-in via env. `src/openhuman/config/schema/update.rs:53-55`. (1 line + docs)
3. **Replace `std::sync::Mutex` with `parking_lot::Mutex`** in `webview_accounts/mod.rs` — eliminates the panic-poison-bricks-IPC class entirely. `parking_lot` is already a dep.
4. **Flip `OPENHUMAN_ANALYTICS_ENABLED` default to `false`** in `.env.example` to match privacy marketing.
5. **Add `role="alert"`** to the chat send-error banner — `app/src/pages/Conversations.tsx:1959-1963` — and `aria-invalid` propagation in `components/ui/Input.tsx:20-23`. (~5 lines total)
6. **Stop the 25 MB IPC JSON transcode** — switch `Conversations.tsx:823` to the existing file-path audio API. (~10 lines)
7. **Pin `whisper-rs-sys`** to a specific git `rev` in both `Cargo.toml` files. (2 lines)
8. **Drop module-wide `#![allow(dead_code)]`** in `src/openhuman/mod.rs:16` — let the compiler tell you what's actually dead.
9. **Unblock the `pr-quality.yml` CI gate** — remove `continue-on-error: true` from at least the lint/typecheck/test jobs. They are currently advisory-only.
10. **Wrap the 5 most-likely-to-crash UI subtrees in their own `ErrorBoundary`** (Conversations thread list, composer, streaming pane, agent-profile editor, voice). Right now one Sentry boundary at the root means a Conversations render error blanks the entire app.

---

## Recommended 30 / 60 / 90 Day Plan

**30 days — stop the bleeding**
- Land all 10 quick wins above.
- Build an **adversarial corpus** for the prompt-injection detector (target ≥ 500 cases across 118 connectors); wire it as a CI gate.
- Add `cargo audit` to CI (the security scanner could not run it locally; it must run in your pipeline).
- Gate CEF remote-debugging behind a build flag — off in release.
- Make `OPENHUMAN_CORE_TOKEN` required at startup; refuse to listen on `0.0.0.0` without one. Fail closed.

**60 days — pay down the structural debt**
- Refactor `Conversations.tsx` (2,125 LOC, 39 hooks) into thread-list / composer / streaming / agent-profile / voice subtrees, each with its own `ErrorBoundary` and `React.memo` discipline.
- Refactor `Agent::turn` (967 LOC) by extracting the four obvious sub-state-machines.
- Decompose `webview_account_open` (840 LOC) and `apply_env_overrides_from` (720 LOC).
- Replace `Result<_, String>` with typed error enums in `core/observability.rs` and the 1,062 sites that follow.
- Migrate off `ethers-rs` (deprecated upstream) to `alloy`.
- Convert the repo to a real Cargo workspace; unify the two `Cargo.lock`s; resolve the `vite` lockfile disagreement.

**90 days — durable resilience**
- Backup + migration safety harness for `~/.openhuman` (single SQLite holding the Memory Tree); reject concurrent backfill-binary writes when the desktop has the DB open.
- Sign skills (sigstore/minisign + provenance); allowlist `SKILLS_REGISTRY_URL` schemes.
- Bring `prepare_cached` + transactional batching to all ingest paths (WhatsApp ingest is the worst, but it's a pattern).
- Add a **real-VM install test** to CI for both Linux and macOS — current `installer-smoke.yml` is `--dry-run` only.
- Adversarial / concurrency / resource-pressure tests for the JSON-RPC `/rpc` endpoint and the QuickJS skills sandbox.
- Verify Remotion license posture (`remotion/package.json` declares `UNLICENSED`; Remotion's commercial tier triggers above 3 staff).

---

## What We Did Not Cover (recommended follow-up)

- **`cargo audit`** — could not run in the agent environment; needs to run in your CI.
- **Mutation testing** — none performed; would clarify whether the 86 k LOC of tests actually exercise behavior or just types.
- **License audit at the transitive level** — name-heuristic scan only; no SBOM-grade verification (GTK/cairo/glib LGPL are fine if dynamically linked, but worth confirming for OpenSSL on the Tauri build).
- **Threat-model walkthrough** — the static security audit is necessary but not sufficient for a desktop AI app with this surface; a structured STRIDE/LINDDUN session on the IPC + skills + wallet boundary is the highest-leverage next QE activity.

---

## Detailed Reports

| # | File | Owner Agent | Key Finding |
|---|------|-------------|-------------|
| 01 | [`01-code-quality.md`](./01-code-quality.md) | qe-code-reviewer | Mutex-poison bricks IPC; five god-files concentrate the debt |
| 02 | [`02-security.md`](./02-security.md) | qe-security-scanner | 0 CRIT / 2 HIGH / 5 MED / 4 LOW / 5 INFO; strong baseline |
| 03 | [`03-performance.md`](./03-performance.md) | qe-performance-reviewer | Five systemic patterns; ~2 engineer-days for the top 10 |
| 04 | [`04-qx-experience.md`](./04-qx-experience.md) | qe-qx-partner | Best-in-class trust posture; i18n delivery mismatch |
| 05 | [`05-product-factors-sfdipot.md`](./05-product-factors-sfdipot.md) | qe-product-factors-assessor | Test investment is happy-path-heavy; adversarial gap dominates |
| 06 | [`06-complexity-hotspots.md`](./06-complexity-hotspots.md) | qe-code-complexity | 483 k production LOC; 3 named refactors → 4/10 |
| 07 | [`07-dependencies.md`](./07-dependencies.md) | qe-dependency-mapper | Non-reproducible Rust build; lockfile disagreements; ethers deprecated |

---

## Closing Note

OpenHuman is ambitious — a private, local-first, personal AI assistant with the surface area of a small OS. The QE evidence suggests a team that **knows what it's doing** (trust posture, SSRF guard, Tauri capability scoping, real test density) but is at the point in scale where the structural debt and a few sharp-edged defaults are starting to bite faster than they can be paid down by hand.

The top 10 quick wins are all under a day each. The 30-day plan is achievable by a small team. After that, the bigger refactors (`Conversations.tsx`, `Agent::turn`, repo workspace unification, adversarial test corpus) are the ones that determine whether OpenHuman holds together through GA.
