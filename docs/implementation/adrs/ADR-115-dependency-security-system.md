# ADR-115: Dependency Security System — scheduled audit + guarded in-range updater

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-115 |
| **Status** | Accepted (2026-06-30) — implemented (audit + updater scripts, two scheduled workflows, policy doc); grpc-js HIGH fixed in lockfile |
| **Date** | 2026-06-30 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | `consumer-audit.yml` (the shift-left half this extends), `npm-publish.yml` (publish gate), [ADR-114](./ADR-114-conservation-layer.md) (sibling "guard a surface in CI" pattern), `docs/guides/dependency-security-policy.md` |

---

## WH(Y) Decision Statement

**In the context of** a cold-outreach email correctly reporting that
`@grpc/grpc-js@1.14.3` carried a HIGH CVE (CVE-2026-48068, server-crash DoS,
fixed in 1.14.4) that had sat in our lockfile while our CI stayed green — and a
bundled pitch to connect a third-party SaaS scanner (`patchhog.dev`) to the repo,

**facing** the fact that *every* existing dependency check —
`consumer-audit.yml` and the `npm-publish.yml` gate — is triggered only by
**changes to `package.json` / `package-lock.json`**, so a CVE disclosed against
an already-pinned, unchanged dependency is invisible until someone happens to
edit a dep file; and that the off-the-shelf fix (Dependabot/Renovate) is
actively wrong here because it prunes our 15 cross-platform `optionalDependencies`
and produces a lock that fails `npm ci` with `EUSAGE`,

**we decided for** building our own two-part system: (1) a **scheduled daily
audit** that re-runs the authoritative consumer-POV check against unchanged
deps and files a tracking issue on new HIGH/CRITICAL, and (2) a **guarded
in-range updater** (`npm audit fix --package-lock-only` by default) that asserts
no optional platform dep is dropped before opening a weekly security PR — both
reusing the existing consumer-POV audit logic, both using the `gh` CLI rather
than a third-party PR action,

**and neglected** Dependabot/Renovate (breaks our lockfile), auto-merge of
dependency PRs (humans review), flag-level or major-version automation (in-range
only — major bumps stay manual), and connecting any external security SaaS
(our own consumer-POV `npm audit` already detects what such pitches flag),

**to achieve** detection that no longer depends on someone touching a dep file —
newly-disclosed CVEs on frozen pins surface on their own, on our schedule, not
when a vendor emails us — plus low-risk, reviewable, optional-dep-safe update PRs,

**accepting that** the scheduled audit can file a noisy issue when an upstream
has no fix yet (triaged per the severity SLA), that "in-range only" means a
breaking-fix CVE still needs a human, and that maintaining the `overrides` block
and the optional-dep guard set remains a deliberate, periodic task.

---

## Current state (grounded, verified 2026-06-30)

| Fact | Evidence |
|---|---|
| grpc-js HIGH was real and present | `npm audit` → GHSA-5375-pq7m-f5r2 (CVE-2026-48068) + GHSA-99f4-grh7-6pcq (CVE-2026-48069), both `>=1.14.0 <1.14.4` |
| Fix is in-range | requested as `^1.14.3`; `npm update @grpc/grpc-js --package-lock-only` → 1.14.4, HIGH 1→0, optional deps 90→90 |
| No scheduled dependency check existed | only `init-chaos`/`corpus-mirror` cron; `consumer-audit.yml` is `paths:`-filtered on dep files only |
| No Dependabot/Renovate config | none in `.github/`; and Dependabot is known to prune our optional `@ruvector/*` deps |
| Consumer-POV audit already proven | `consumer-audit.yml` tarball-install pattern (precedent: 15 CRITICAL protobufjs vulns at v3.9.13) |
| 15 optionalDependencies to protect | `@ruvector/*` (13) + `hnswlib-node` + `rvlite` |

**The core problem in one line:** AQE could detect a vulnerable dependency the
moment someone *edited* deps, but had nothing watching the deps that never change.

---

## Decision detail

### 1. Audit script (shared, importable)
`scripts/dependency-audit.mjs` — parses `npm audit --json` into a flat finding
list; two modes: default in-repo (fast, our view) and `--consumer` (pack →
clean-install → audit; the user's view, since root `overrides` don't apply
downstream). Exits 1 on any finding `>= --level` (default `high`). Writes
`reports/dependency-audit.{json,md}`. Exports `runRepoAudit()` for reuse.

### 2. Updater script (guarded)
`scripts/dependency-update.mjs` — default **security** mode runs
`npm audit fix --package-lock-only` (only vulnerable packages, in-range);
`--all` runs `npm update --package-lock-only` (broad maintenance). Neither uses
`--force`. **Guard:** snapshots the optional-dep set before/after and, if any
`optionalDependencies` entry is pruned from the lock, restores
`package-lock.json` from git and exits 1 rather than propose a cross-platform-
breaking lock. Writes `reports/dependency-update.{json,md}` with the audit delta.

### 3. Scheduled workflows
- `dependency-audit.yml` — daily 07:00 UTC; consumer-POV audit; opens/updates a
  single tracking issue on HIGH/CRITICAL (`gh` CLI; `issues: write` only).
- `dependency-update.yml` — weekly Mon 06:00 UTC; runs the security updater;
  opens/refreshes a PR from `deps/auto-security-update` if the lock moved
  (`gh` CLI; no third-party PR action).

### 4. npm scripts + policy
`deps:audit`, `deps:audit:consumer`, `deps:update`, `deps:update:all`;
process, SLAs, and the override-review cadence in
`docs/guides/dependency-security-policy.md`.

---

## Consequences

- **Positive:** newly-disclosed CVEs on frozen pins are caught on a schedule;
  update PRs are small, in-range, and optional-dep-safe; zero new third-party
  trust (no SaaS, no PR action, no Dependabot); consumer-POV stays the source of
  truth so `overrides`-masked findings don't cause false alarms.
- **Negative / watch:** scheduled audit may file issues for not-yet-fixed
  upstreams (triage per SLA); breaking-fix CVEs still need a human; the optional-
  dep guard set and `overrides` block are manually maintained.
- **Reversible:** scripts and workflows are additive and independently
  removable; they touch no production runtime code.
