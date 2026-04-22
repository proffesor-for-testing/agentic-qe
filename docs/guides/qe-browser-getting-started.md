# qe-browser: Getting Started

`qe-browser` is the AQE fleet's shared browser-automation skill. It wraps
[Vibium](https://github.com/VibiumDev/vibium) (a ~10 MB Go binary built on
the W3C WebDriver BiDi standard) and adds five QE-specific primitives:
typed assertions, batch execution, visual diff, prompt-injection scanning,
and semantic intent scoring.

This guide covers first-time install, a smoke check, and the CLI handles
you'll use most often.

## Install

`aqe init` installs Vibium globally via `npm install -g`, pinned to the
version verified against the skill's primitives (see
`DEFAULT_VIBIUM_SPEC` in `src/init/browser-engine-installer.ts`).

```bash
aqe init                    # installs Vibium if missing (or run --minimal to skip)
vibium --version            # should print a 26.3.x version string
```

If you're on **Linux ARM64** and `vibium go` can't launch Chrome, Vibium
doesn't yet auto-download Chrome for Testing on that architecture. Use your
distro's Chromium and set `VIBIUM_BROWSER_PATH` — see the "Linux ARM64"
section of `.claude/skills/qe-browser/SKILL.md` for the exact symlink
commands.

## Smoke check

The skill ships with a shell-based smoke test that exercises every
primitive against pinned public fixtures (httpbin.org) and a tiny local
static server. Run it after install to confirm the whole stack works
end-to-end:

```bash
bash .claude/skills/qe-browser/scripts/smoke-test.sh
```

Expected: 9/9 steps pass. Each step prints its command and exit code; any
failure points at which primitive is misbehaving.

## Running the eval suite

From v3.10 onwards, `qe-browser` ships a runnable eval suite that evaluates
shell-command exit codes and JSON envelopes against the script output. To
execute it via the shared `aqe eval` CLI:

```bash
aqe eval run --skill qe-browser --model claude-3.5-sonnet
```

The runner detects that `qe-browser.yaml` is command-mode (its test cases
have `input.command` fields) and dispatches to `CommandEvalRunner`
instead of the LLM-prompt runner used by most other skills. No model
tokens are spent; the `--model` flag is retained only for report
compatibility.

Supported assertion kinds in the suite:

| Field | What it checks |
|---|---|
| `exit_code` | Strict equality vs the process exit code |
| `json_fields` | Dotted JSONPath -> expected value (deep equality) |
| `severity_at_least` | `none < low < medium < high < critical` |
| `candidate_count_at_least` | Numeric lower bound on intent-score candidates |

Setup steps in `input.setup[]` (e.g. `vibium go <url>`) run sequentially
before each test case's main command. Any non-zero setup exit
short-circuits the case as failed.

## The five primitives at a glance

Each primitive is a standalone Node script in
`.claude/skills/qe-browser/scripts/` and produces a structured JSON
envelope on stdout. Combine them directly in shell, CI, or from a QE
agent's batch plan.

```bash
# typed assertions
node .claude/skills/qe-browser/scripts/assert.js --checks \
  '[{"kind":"url_contains","text":"/forms"},{"kind":"selector_visible","selector":"h1"}]'

# multi-step flow with stop-on-failure
node .claude/skills/qe-browser/scripts/batch.js --steps \
  '[{"action":"go","url":"https://httpbin.org/html"},{"action":"wait_load"},{"action":"assert","checks":[{"kind":"selector_visible","selector":"h1"}]}]'

# visual diff vs saved baseline (creates one on first run)
node .claude/skills/qe-browser/scripts/visual-diff.js --name home --threshold 0.02

# prompt-injection scan against the currently-loaded page
node .claude/skills/qe-browser/scripts/check-injection.js --include-hidden

# semantic intent score — "what element would satisfy this intent?"
node .claude/skills/qe-browser/scripts/intent-score.js --intent submit_form
```

All scripts exit 0 on a passing assertion, 1 on a failure, 2 on an
unavailable backend (e.g. Vibium not installed). The JSON envelope
schema lives at `.claude/skills/qe-browser/schemas/output.json`.

## Which QE skills use qe-browser?

- `a11y-ally` — WCAG audits with axe-core + pa11y + Lighthouse
- `e2e-flow-verifier` — end-to-end user flows with step-by-step assertions
- `qe-visual-accessibility` — viewport-sweep visual regression
- `security-visual-testing` — URL allow-list + PII + visual regression
- `pentest-validation` — browser-side exploit validation (e.g. reflected XSS)
- `testability-scoring` — intrinsic-testability probe
- `observability-testing-patterns` — dashboard/APM UI validation
- `localization-testing`, `compatibility-testing`, `accessibility-testing`,
  `visual-testing-advanced` — reference qe-browser as the preferred
  Chrome-side runner; Playwright remains a documented fallback where
  Vibium's Chrome-only BiDi backend is a constraint (Firefox/Safari).

## Related

- ADR-091 (decision record): `docs/implementation/adrs/ADR-091-qe-browser-skill-vibium-engine.md`
- Skill definition: `.claude/skills/qe-browser/SKILL.md`
- Migration guide (Playwright -> qe-browser): `.claude/skills/qe-browser/references/migration-from-playwright.md`
