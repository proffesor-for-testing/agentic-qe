# ADR-114: The Conservation Layer — Surface-Stability Contracts for AQE

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-114 |
| **Status** | Accepted (2026-06-27) — implemented (diff core + CLI/output-schema/dashboard surfaces + deprecation registry + policy); CI wired non-blocking |
| **Date** | 2026-06-27 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | [ADR-113](./ADR-113-evals-are-oracles.md) (the complementary half: regenerate internals), `scripts/audit-mcp-tool-parity.mjs` (pre-existing MCP guard), Phoenix essay 14 "UI Is a Conservation Layer" |

---

## WH(Y) Decision Statement

**In the context of** AQE aggressively regenerating its internals (the oracle-eval work of ADR-113, model routing, provider fixes) and Chad Fowler's "UI Is a Conservation Layer" arguing that the human-facing boundary must change slowly to buffer users from internal churn — "you can't mock trust, can't regenerate it, can't A/B test it recklessly,"

**facing** the fact that AQE's user/agent-facing surfaces (CLI commands, report output schemas, MCP tool names, the qe-dashboard API, rendered UIs) have **no stability contract** except a single MCP tool-parity audit — so a refactor or the 5-tree skill drift can silently rename/remove a command, output key, or tool, breaking users' scripts and CI with no loud failure ("metrics drift, support volume rises later"),

**we decided for** a **conservation guard**: capture each surface as a baseline, diff current vs baseline, and **fail CI on breaking removals/renames** that are not in a deprecation registry — additive changes always pass; plus a documented **deprecation policy** (announce → runtime warning → remove after a version window) and visual-regression for rendered UIs,

**and neglected** flag-level CLI granularity for v1 (lazy commander stubs hide options; command/alias names are the high-value contract), a bespoke MCP surface (the existing `mcp:parity` audit already guards it — we aggregate, not duplicate), and screenshotting the qe-dashboard (it renders no DOM in-repo — it is a WASM vector-store/clustering library, so its contract is its exported API),

**to achieve** the second half of "regenerate internals, conserve the interface": internals stay free to change while the external protocol stays stable and any break is caught loudly at CI, not by users,

**accepting that** baselines must be deliberately updated (`--update`) on intended changes, and that the guard ships **non-blocking first** so adoption never breaks a release until the team is comfortable rebaselining.

---

## Current state (grounded, verified 2026-06-27)

| Fact | Evidence |
|---|---|
| MCP tool names already guarded | `verification/mcp-tool-parity-baseline.json` (86 tools, monotone) + `scripts/audit-mcp-tool-parity.mjs` |
| **CLI commands / output schemas / dashboard API had no guard** | no snapshot/contract test for `aqe` commands, report JSON keys, or qe-dashboard exports |
| AQE ships 39 CLI commands | commander lazy registrations in `src/cli/index.ts` |
| 555 output-schema keys across skills | `.claude/skills/*/schemas/output.json` |
| qe-dashboard renders no DOM | `src/integrations/browser/qe-dashboard/*` — no `innerHTML`/`createElement`; 14 exported symbols |
| Real visual-regression exists | `aqe visual test`, `CNNVisualRegression`, `VisualDiff` (`src/domains/visual-accessibility/`) |

**The core problem in one line:** AQE can change its internals safely (ADR-113) but had nothing stopping it from silently breaking the interface users built their scripts on.

---

## Decision detail

### 1. Surface diff core (pure, tested)
`src/validation/conservation-guard.ts`: `diffSurface(name, baseline, current, deprecated)` → `{added, removedBreaking, removedDeprecated, clean}`; additive passes, removals break unless deprecated. `aggregate` + `formatReport` for CI output. Unit-tested (`tests/unit/validation/conservation-guard.test.ts`).

### 2. Surfaces + baselines
`scripts/conservation-guard.ts` statically extracts three surfaces → `verification/conservation/*.json`:
- `cli-commands` (39) — command/alias names from `src/cli/index.ts`
- `output-schemas` (555) — `<skill>::<key>` from each skill's `output.json`
- `dashboard-api` (14) — exported symbols of `qe-dashboard`

MCP is covered by `npm run mcp:parity`; rendered UIs by `aqe visual test`.

### 3. Deprecation registry + policy
`verification/conservation/deprecations.json` lists deliberately-removed entries with a version window; the guard exempts them. Process documented in `docs/guides/conservation-layer-policy.md` (announce → runtime warning → remove after `removeAfter`).

### 4. CI
`npm run verify:conservation` (`--ci`, exit 1 on breaking) wired into `.github/workflows/invariant-check.yml`, **non-blocking initially**; flip to blocking once rebaseline-on-intended-change is routine.

---

## Consequences
- **Positive:** the human/agent protocol can't be broken silently; deprecations become explicit and slow; pairs with ADR-113 to deliver "absorb change internally, present continuity externally."
- **Cost:** intended surface changes require a `--update` rebaseline (a deliberate, reviewable diff) and registry entry for removals.
- **Reversible:** non-blocking until opted into blocking; baselines are plain JSON.
