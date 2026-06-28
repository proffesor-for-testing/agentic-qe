# AQE Conservation Layer — Surface Stability & Deprecation Policy

> Phoenix Architecture essay 14 ("UI Is a Conservation Layer") applied to AQE · ADR-114
> Complements ADR-113 (oracle evals): *regenerate internals freely, conserve the interface.*

## What "the conservation layer" is

AQE has no single GUI, but it has **human- and agent-facing surfaces** that users build
muscle memory and CI scripts around. Breaking them silently erodes trust ("metrics drift,
support volume rises later"). These surfaces must change **slowly and additively**:

| Surface | Why it's load-bearing | Guarded by |
|---|---|---|
| **CLI commands** (`aqe <cmd>`) | users + scripts invoke them | `verify:conservation` (`cli-commands`) |
| **Output schemas** (report JSON keys) | CI pipelines parse them | `verify:conservation` (`output-schemas`) |
| **MCP tool names** | agents depend on the protocol | `npm run mcp:parity` |
| **qe-dashboard API** (exported symbols) | importers depend on it | `verify:conservation` (`dashboard-api`) |
| **Skill trees** (assets, plugins mirror canonical) | shipped to users/plugins | `verify:skill-parity` (strict body-mirror) |
| **.kiro skills** (divergent IDE variant) | curated 86-skill variant | `verify:conservation` (`kiro-skills`, presence) |
| **Rendered UIs** (dashboards, users' apps) | learned visual mental models | visual-regression (`aqe visual test`) |

### Skill-tree gating: mirrors vs variants

- **Strict body-mirrors** — `assets/skills` (npm) and `plugins/agentic-qe-fleet/skills` (curated
  subset). Every skill they ship must match canonical `.claude/skills` *body* (their own frontmatter
  may differ). Guarded by `npm run verify:skill-parity`. Resync after an intended canonical change:
  `tsx scripts/check-skill-parity.ts --sync` (preserves each mirror's frontmatter, adopts canonical body).
- **Divergent variant** — `.kiro/skills` is an IDE-specific variant with its own `qe-`-prefixed names
  and intentionally different bodies (some skills, e.g. `qcsd-cicd-swarm`, carry large .kiro-only
  content). Forcing body-equality would destroy that, so it is gated by **presence** (`kiro-skills`
  surface): dropping a .kiro skill is a breaking change; body edits are allowed.

## The rule

1. **Additive by default.** Add commands/flags/keys/symbols freely. The guard passes.
2. **Removals & renames are breaking** — they fail CI unless the removed entry is in the
   deprecation registry (its deprecation window has been honored).
3. **Deprecations are slow and visible** (essay 14): announce → warn at runtime → remove later.
4. **UI changes are rare, deliberate, additive, reversible.** Optimize rendered UIs for
   predictability, not novelty.

## The guard

```bash
npm run verify:conservation     # diff current surfaces vs baseline; exit 1 on breaking change
npm run mcp:parity              # MCP tool-name regression guard
tsx scripts/conservation-guard.ts            # report-only (no exit code)
tsx scripts/conservation-guard.ts --update   # DELIBERATELY rebaseline (after an intended change)
```

Baselines live in `verification/conservation/*.json`. The core diff logic is pure and unit-tested
(`src/validation/conservation-guard.ts`, `tests/unit/validation/conservation-guard.test.ts`).

## Deprecation process (to remove or rename a surface entry)

1. **Add it to the registry** `verification/conservation/deprecations.json` under its surface:
   ```json
   { "entry": "old-command", "deprecatedIn": "3.12.0", "removeAfter": "3.14.0",
     "replacement": "new-command", "reason": "renamed for clarity" }
   ```
2. **Warn at runtime** — emit a visible deprecation notice when the old entry is used.
3. **Document** it in the CHANGELOG under a "Surface changes" heading.
4. **Remove only after** the stated version. The guard treats the removal as deliberate (not
   breaking) once the entry is registered.

Renames = a removal (old name, must be deprecated) + an addition (new name, free).

## Visual-regression for rendered UIs

The `qe-dashboard` module renders no DOM in-repo (it's a WASM vector-store + clustering library),
so its conservation layer is its **exported API** (covered above). For anything that *renders* —
the dashboard when mounted, or a user's own app — use AQE's visual-regression:

```bash
# capture a baseline, then fail when the rendered layout drifts unintentionally
aqe visual test --baseline production --current staging
aqe visual responsive --url <url> --viewports all
```

Backed by `CNNVisualRegression` / `VisualDiff` (`src/domains/visual-accessibility/`). Treat an
unexpected visual diff as a conservation failure — "good UI absorbs volatility; bad UI transmits it."

## CI

`npm run verify:conservation` runs in `.github/workflows/invariant-check.yml`. It starts
**non-blocking (reports only)** so adoption never breaks a release; flip it to blocking once the
team is comfortable rebaselining on intended changes. `mcp:parity` already runs as a guard.
