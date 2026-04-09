# qe-browser — Agentics Lab Live Demo

**Duration:** 5 minutes live + ~2 min buffer for Q&A
**Audience:** Mixed — QA practitioners + AI/agent builders + Agentics Foundation regulars
**Prerequisite reading (audience):** none — designed to stand alone
**Presenter prep:** [ADR-091](../../implementation/adrs/ADR-091-qe-browser-skill-vibium-engine.md) sections "Context" and "Decision" + rehearse `demo.sh` twice

## What this demo proves (in 5 minutes)

1. A QE agent can drive a real browser in **10 MB**, not **300 MB**
2. **Typed assertions** with a JSON envelope beat imperative Playwright glue for agent consumption
3. **Structured skipped-state** beats grep-the-string fallback when the browser engine isn't there

## What this demo deliberately skips

Keep these in your pocket for Q&A. Don't try to cram them into 5 minutes.

- **Visual diff, intent-score, injection scan** — the other 3 primitives (in slides backup)
- **The 11 migrated skills** — a11y-ally, e2e-flow-verifier, etc.
- **The 6 phases of devil's-advocate review** (ADR-091 Phases 1–6)
- **Linux ARM64 Chrome for Testing workaround**
- **Why Vibium specifically** vs Playwright MCP / dev-browser / gsd-browser
- **The 4 bugs Phase 3 caught that unit tests missed** — good Q&A ammo for the "why real verification matters" angle

## Pre-flight (run 10+ minutes before you go on)

```bash
# 1. Verify vibium is on PATH
vibium --version                       # → any 26.x

# 2. Verify httpbin.org is reachable (demo uses it as fixture)
curl -sf -o /dev/null https://httpbin.org/forms/post && echo OK

# 3. Rehearse the full demo end-to-end
cd /workspaces/agentic-qe
bash docs/demos/2026-04-agentics-lab-qe-browser/demo.sh

# 4. Reset terminal font size (big enough for the back row), clear history,
#    close every tab except the one you need, disable notifications
```

**If step 1 or 2 fails, you have a problem.** Step 3's `demo.sh` runs every command from this README against real Vibium + real httpbin and tells you if anything drifted.

## Timing table

| Time | Act | Mode |
|---|---|---|
| 0:00–0:30 | Problem + solution framing | Verbal |
| 0:30–1:00 | "What qe-browser ships" (quick ls) | Live |
| 1:00–2:00 | **Act 1** — navigate + typed assertion | Live |
| 2:00–3:00 | **Act 2** — batch with pre-validation | Live |
| 3:00–4:00 | **Act 3** — honest missing-vibium fallback | Live |
| 4:00–4:30 | Outro — install, ADR-091, questions | Verbal |

Total live commands: **3**. Everything else is narration.

---

## 0:00–0:30 — Problem + solution (verbal, no terminal)

> "Every QE skill today that needs a browser either ships 20 lines of
> inline Playwright glue, or shells out to a per-skill wrapper. Eleven
> skills in AQE had this problem. That's 300 MB of install footprint,
> per-skill behavior drift, and no shared primitives.
>
> qe-browser is the thin wrapper we built to replace all of them. It's
> a fleet skill. It shells out to Vibium — a 10 MB Go binary that speaks
> WebDriver BiDi. And it ships 5 primitives that QE agents actually
> need: navigate, assert, batch, visual diff, injection scan, intent
> score. I'll show you three of them."

**Switch to terminal.**

## 0:30–1:00 — "What qe-browser ships"

**Command:**

```bash
cd /workspaces/agentic-qe
ls .claude/skills/qe-browser/scripts/
```

**Expected output:**

```
assert.js  batch.js  check-injection.js  intent-score.js  lib  package.json  smoke-test.sh  validate-config.json  visual-diff.js
```

**Narration while the output renders (~8 seconds):**

> "Five helper scripts. Assert does typed assertions. Batch runs
> multi-step flows with pre-validation. Visual-diff compares screenshots
> against a baseline. Check-injection scans for prompt-injection patterns.
> Intent-score picks the right DOM element for a semantic intent like
> 'submit form'. Everything is JSON in, JSON out. Let me show you the
> first two."

**Fallback if the directory is empty:** `cd` into a project where `aqe init` has already run, or run `npm run build && node dist/cli/bundle.js init --auto --skip-patterns` in `/tmp/demo` ahead of time and cd there.

---

## 1:00–2:00 — Act 1: navigate + typed assertion

**Command 1 (navigate):**

```bash
vibium --headless go https://httpbin.org/forms/post
```

**Expected output:**

```
Navigated to https://httpbin.org/forms/post
```

**Command 2 (assert):**

```bash
node .claude/skills/qe-browser/scripts/assert.js --checks '[
  {"kind": "url_contains", "text": "forms/post"},
  {"kind": "selector_visible", "selector": "form"}
]'
```

**Expected key lines:**

```json
{
  "skillName": "qe-browser",
  "version": "1.0.0",
  ...
  "status": "success",
  "trustTier": 3,
  "output": {
    "operation": "assert",
    "summary": "All 2 assertions passed",
    ...
  }
}
```

**Narration while commands run (~15 seconds total):**

> "I'm driving Vibium headless against a real page on httpbin. Two
> assertions: the URL has to contain 'forms/post', and there has to be
> a visible form element.
>
> Look at what comes back. It's not stdout that I have to parse. It's
> a JSON envelope with skillName, version, trustTier 3, status success,
> and per-check results. An agent consumes this directly. No regex
> against log lines, no 'did the command exit non-zero', no ambiguity.
> This is the output contract every qe-browser helper emits."

**If httpbin is down:** swap `https://httpbin.org/forms/post` for `https://example.com` and change the URL check to `"text": "example.com"` and the selector to `"h1"`.

---

## 2:00–3:00 — Act 2: batch with pre-validation

**Command:**

```bash
node .claude/skills/qe-browser/scripts/batch.js --steps '[
  {"action": "go", "url": "https://httpbin.org/forms/post"},
  {"action": "fill", "selector": "input[name=custname]", "text": "Dragan"},
  {"action": "clikc", "selector": "button[type=submit]"},
  {"action": "assert", "checks": [{"kind": "url_contains", "text": "post"}]}
]'
```

**Expected output (key lines):**

```json
{
  "skillName": "qe-browser",
  "status": "failed",
  "output": {
    "operation": "batch",
    "summary": "1 step(s) failed pre-validation: step 2: unknown action \"clikc\". Valid: go, navigate, click, fill, type, press, wait_url, wait_text, wait_selector, wait_load, map, screenshot, storage_save, storage_restore, assert",
    ...
  }
}
```

**Narration (~20 seconds):**

> "Same flow but now I'm running it as a single batch — go, fill,
> click, assert. Except I've introduced a typo. `clikc` instead of
> `click`. Real bug, easy to make.
>
> Watch what happens. *[wait for output]*
>
> Notice: this didn't navigate. Didn't fill the form. Didn't touch
> anything on httpbin's server. batch.js validated the whole plan
> BEFORE the first Vibium call. So if your typo is in step 17, steps
> 1 through 16 don't run with side effects. This is how you give an
> agent a multi-step primitive without the footgun."

**Visual proof for slides backup:** see `screenshots/`:
- `01-act1-loaded.png` — initial httpbin form (blank)
- `02-act2-after-batch.png` — form state AFTER the typo'd batch (still blank; **byte-identical** to 01 — zero state change)
- `03-act-positive-control.png` — form state after a VALID batch (Dragan / 555-0199 / dragan@agentics.lab filled in)

The 01-vs-02 byte-equality is the strongest visual proof you can show a mixed audience: "those two PNGs are the same file". The 02-vs-03 contrast shows the valid batch really does execute every step.

**Fallback if this somehow passes:** the feature is regression-tested in `tests/unit/scripts/qe-browser-batch.test.ts`. If it's not pre-validating, abort the demo and investigate post-meetup.

---

## 3:00–4:00 — Act 3: honest missing-vibium fallback

**Setup (type this as you narrate — it's 2 short lines):**

```bash
mkdir -p /tmp/fake-bin && ln -sf "$(which node)" /tmp/fake-bin/node
```

**Command:**

```bash
env -i PATH=/tmp/fake-bin HOME=$HOME TERM=dumb \
  node .claude/skills/qe-browser/scripts/assert.js \
  --checks '[{"kind":"url_contains","text":"foo"}]'
echo "exit code: $?"
```

**Expected key lines:**

```json
{
  "skillName": "qe-browser",
  "status": "skipped",
  "trustTier": 3,
  "vibiumUnavailable": true,
  "output": {
    "operation": "assert",
    "summary": "vibium binary not found on PATH. Install via `npm install -g vibium` or run `aqe init`.",
    "reason": "browser-engine-unavailable",
    "remediation": [
      "Install vibium globally: `npm install -g vibium`",
      "Or re-run `aqe init` to install via the AQE bootstrap",
      ...
    ]
  }
}
exit code: 2
```

**Narration (~25 seconds):**

> "Last one. What happens when vibium isn't installed? I'm building a
> fake PATH with only `node` in it — no vibium. And running the same
> assert command.
>
> *[run command, wait for JSON]*
>
> Look at the envelope. Status is `skipped`, not `failed`. Top-level
> `vibiumUnavailable: true`. Output.reason is the constant
> `browser-engine-unavailable`. The remediation array tells the user
> exactly what to do. And exit code is **2**, not 1.
>
> Why does this matter? Because every downstream skill that shells out
> to qe-browser can branch on a structured field. No grepping error
> messages, no 'did it say vibium somewhere'. An agent that consumes
> this envelope knows the difference between 'the test failed' and 'I
> couldn't run the test.' That's the contract that makes this skill
> safe to embed in other agents."

---

## 4:00–4:30 — Outro

> "That's the tour. qe-browser ships in agentic-qe v3.9.9. 11 skills
> migrated to it already. 112 unit tests, 10-case smoke test against
> real Vibium and real httpbin. ADR-091 has the full 6-phase rollout
> story if you want to see how we got here, including the 4 bugs unit
> tests didn't catch.
>
> ```
> npm install -g agentic-qe
> aqe init --auto
> ```
>
> Questions?"

**Drop to Q&A.** See the backup notes below if a question lands on something the 5-minute demo didn't cover.

---

## Q&A backup notes

### "Why Vibium and not Playwright?"

Playwright: ~300 MB, Node-native, ~100 tools in its MCP surface. Tokens expensive for agents. Overkill.

Vibium: ~10 MB Go binary, WebDriver BiDi (W3C standard), single install command, 5 primitives map cleanly to QE agent needs. Apache-2.0. Auto-downloads Chrome for Testing on first run.

### "What about visual diff / injection / intent score?"

All three work the same pattern: JSON in, JSON envelope out. Visual diff does pixel-perfect comparison against baselines with configurable threshold. Injection has 14 patterns ported from `gsd-browser` with a `--exclude-selector` so docs sites don't self-flag. Intent score has 15 semantic intents like `submit_form`, `accept_cookies`. All documented in ADR-091. Show `.claude/skills/qe-browser/references/assertion-kinds.md` if someone wants depth.

### "How do I write a skill that uses it?"

Shell out to `node .claude/skills/qe-browser/scripts/<op>.js ...`. Check `result.vibiumUnavailable === true` to detect the skipped state, check `result.status` for success/failed. Don't parse stdout.

### "What if my viewport is weird / pixel diff fails?"

Set `vibium viewport 1280 720` before capture. Documented in `references/migration-from-playwright.md` gotcha #6.

### "Linux ARM64?"

Google doesn't publish `linux-arm64` Chrome for Testing. Use the symlink workaround in `SKILL.md` under "Linux ARM64 workaround" — it's verified against Debian bookworm aarch64.

### "What about the skills that still use Playwright?"

The 11 that were migrated now reference qe-browser. Any skill NOT in that list is a contribution opportunity — open an issue or PR.

### "How do you know this actually works?"

ADR-091 Phase 3 ran a real smoke test against real Vibium + real Chrome + real httpbin. Found 4 bugs 50 unit tests had missed: the `vibium eval --stdin` return contract, the screenshot output path quirk, the absent `--selector` flag, and the headless default. That's in the ADR as a warning — unit tests are necessary but not sufficient for a skill that shells out.

### "Can I use it without aqe init?"

Yes — `npm install -g vibium` + `cp -r .claude/skills/qe-browser /your/project/.claude/skills/`. But `aqe init` handles the pre-flight detection, the 1-3 minute install banner, and the validation manifest for you.

## Post-demo cleanup

```bash
rm -rf /tmp/fake-bin
```

## Post-meetup tasks

- [ ] Update `skill-stats.md` with a note if qe-browser got questions
- [ ] Log any new FAQs into this file so next presenter has them
- [ ] If someone spots a bug live, open an issue against `agentic-qe` before you forget
