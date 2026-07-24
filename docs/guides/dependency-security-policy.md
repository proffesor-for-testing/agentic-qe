# Dependency Security Policy

> Implements [ADR-115](../implementation/adrs/ADR-115-dependency-security-system.md).
> How AQE keeps its dependencies current and free of known vulnerabilities —
> **without** handing a third-party SaaS write access to the repo.

## Why we run our own

Two project-specific facts make off-the-shelf tooling wrong for AQE:

1. **Root `overrides` mask vulnerabilities from our own audit.** The 10-entry
   `overrides` block in `package.json` forces patched transitives *for us*, but
   npm overrides are root-only — they do **not** reach downstream consumers. An
   in-repo `npm audit` can read clean while `npm install agentic-qe` exposes a
   real CVE to every user. We therefore audit from the **consumer's** point of
   view (pack → clean install → audit), not just our own.

2. **Dependabot breaks our lockfile.** We declare 15 `optionalDependencies` —
   the `@ruvector/*` native binaries (per platform), `hnswlib-node`, `rvlite`.
   Dependabot regenerates the lock on its single runner platform and prunes the
   optional entries for every other platform, producing a lock that fails
   `npm ci` with `EUSAGE` elsewhere. Our updater **guards** against that.

## The system (four layers)

| Layer | Trigger | What it does | Where |
|---|---|---|---|
| **Consumer audit (shift-left)** | dep-file change on PR / push to main | Tarball-install audit; blocks merge on HIGH/CRITICAL | `consumer-audit.yml` |
| **Publish gate** | release | Same consumer audit blocks publish | `npm-publish.yml` |
| **Scheduled audit** ⭐ | daily cron | Re-runs consumer audit against *unchanged* deps; files a tracking issue on new HIGH/CRITICAL | `dependency-audit.yml` |
| **Scheduled updater** ⭐ | weekly cron | In-range security fixes, optional-dep guard, opens a PR | `dependency-update.yml` |

⭐ = added by ADR-115. The scheduled audit is the keystone: it closes the gap
that let `@grpc/grpc-js@1.14.3` (CVE-2026-48068) sit undetected — every other
check only fires when a dependency file changes.

## Local commands

```bash
npm run deps:audit            # in-repo audit (fast), gate at HIGH
npm run deps:audit:consumer   # consumer-POV audit (authoritative; build first)
npm run deps:update           # security-only in-range fixes (npm audit fix)
npm run deps:update:all       # broad in-range lockfile maintenance (review carefully)
```

Reports are written to `reports/dependency-audit.{json,md}` and
`reports/dependency-update.{json,md}`.

## Severity SLAs

| Severity | Consumer-reachable | Action |
|---|---|---|
| CRITICAL | yes | Fix same day; blocks release. |
| HIGH | yes | Fix within 3 business days; blocks release. |
| HIGH/CRITICAL | not consumer-reachable (dev-only / unreachable path) | Triage; fix opportunistically, document why deferred. |
| MODERATE | any | Batch into the weekly updater PR. |
| LOW / INFO | any | Best effort. |

"Consumer-reachable" = appears in the **`--consumer`** audit. A finding that
shows only in the in-repo audit but not the consumer audit is masked by
`overrides` and does not reach users — note it, don't panic.

### Optional peers ARE consumer-reachable

`peerDependenciesMeta.<pkg>.optional: true` does **not** mean "not installed".
npm ≥7 auto-installs optional peers; `optional` only suppresses the error when
the peer cannot be resolved. So an optional peer lands in every consumer's
`node_modules` and every CVE underneath it is a real consumer CVE.

Making a dependency optional at the **code** level (lazy `await import()` +
graceful degradation) does not make it optional at the **install** level. If the
code can already run without it, take it out of `peerDependencies` too — keep it
as a `devDependency` and give the load site an actionable "not installed, run
`npm install <pkg>`" error. That is not a breaking change for consumers.
See ADR-115's 2026-07-23 amendment (issue #565, `@huggingface/transformers`).

## Fix decision tree

- **`fixAvailable: in-range`** → `npm run deps:update` (or
  `npm update <pkg> --package-lock-only`). This is the common case
  (e.g. grpc-js `1.14.3 → 1.14.4`).
- **`fixAvailable: breaking`** → manual major bump, replacement, or drop the
  vulnerable path. Open a PR; do not auto-merge.
- **No fix yet** → add a time-boxed `overrides` pin if a safe version exists
  upstream, or document the accepted risk and the watch. If the vulnerable path
  enters through an **optional peer that the code already degrades without**,
  prefer dropping the peer outright — `overrides` are root-only and never reach
  consumers, so a pin here fixes our audit and nothing for users.

## Reviewing `overrides`

Each `overrides` entry is a manual pin that hides a transitive from npm's
resolver. Quarterly (or when the updater PR touches the same package), check
whether the upstream dependency has caught up so the override can be removed —
stale overrides silently hold back legitimate fixes.

## What we explicitly do NOT do

- We do **not** grant cold-outreach security SaaS products GitHub/write access.
  Our own `npm audit` (consumer-POV, scheduled) already detects what those
  pitches flag. Verify any externally-reported CVE against
  `npm run deps:audit:consumer` before acting on the messenger's framing.
- We do **not** auto-merge dependency PRs. The updater opens them; a human
  reviews and merges.
