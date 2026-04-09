<!--
  Marp slide deck — qe-browser Agentics Lab 5-min demo
  Render with: marp slides.md -o slides.pdf
  Or live preview: marp -w slides.md
  (npm i -g @marp-team/marp-cli)

  Purpose: backup behind the live terminal. If the live demo fails on
  stage, cut to the slides and walk the audience through the same arc
  with screenshots of expected output.
-->
---
marp: true
theme: default
paginate: true
size: 16:9
header: 'qe-browser — Agentics Lab'
footer: 'v3.9.9 · ADR-091 · agentic-qe'
---

# **qe-browser**
## A fleet skill that gives QE agents a real browser in 10 MB, not 300 MB

<br>

Agentics Lab · April 2026
Built on [Vibium](https://github.com/VibiumDev/vibium) · ADR-091 · ships in agentic-qe v3.9.9

---

## The problem

Every AQE skill that needs a browser does one of two things:

1. **Embeds Playwright snippets inline** — 300 MB install, drifts per-skill
2. **Shells out to a per-skill wrapper** — each reimplements slightly different glue

**Eleven skills** had this problem. ~1,800 lines of duplicated browser code that nobody could test as a unit.

---

## The insight

A QE agent doesn't need 80% of Playwright. It needs **5 primitives**:

| Primitive | What |
|---|---|
| **assert** | Typed assertions with a JSON envelope |
| **batch** | Multi-step execution with pre-validation |
| **visual-diff** | Pixel-perfect baseline comparison |
| **check-injection** | Prompt-injection pattern scan |
| **intent-score** | Semantic DOM element scoring |

---

## The solution

**qe-browser** = thin wrapper around [Vibium](https://github.com/VibiumDev/vibium)

- **~10 MB Go binary** (vs ~300 MB Playwright)
- **WebDriver BiDi** (W3C standard, not CDP)
- **Apache-2.0** · active upstream
- **Auto-installed** by `aqe init` with pre-flight short-circuit
- **JSON in, JSON out** — no stdout parsing
- **Typed missing-engine contract** — no grep-the-string fallback

ADR-091 has the full rejected-alternatives analysis: Playwright MCP, dev-browser, gsd-browser (whose intent scorer and injection patterns we ported under attribution).

---

## Demo plan — 3 live commands in 5 minutes

<br>

| Act | Time | What |
|---|---|---|
| **0** | 0:30 | `ls .claude/skills/qe-browser/scripts/` |
| **1** | 1:00 | Navigate + typed assertion |
| **2** | 1:00 | Batch with pre-validation catching a typo |
| **3** | 1:00 | Honest missing-vibium fallback |

<br>

**→ terminal**

---

## Act 1 — typed assertion against httpbin

```bash
vibium --headless go https://httpbin.org/forms/post

node .claude/skills/qe-browser/scripts/assert.js --checks '[
  {"kind": "url_contains",     "text": "forms/post"},
  {"kind": "selector_visible", "selector": "form"}
]'
```

Expected envelope (key lines):

```json
{
  "skillName": "qe-browser",
  "status": "success",
  "trustTier": 3,
  "output": { "operation": "assert", "summary": "All 2 assertions passed" }
}
```

**The point:** agents consume this JSON directly. No regex against stdout.

---

## Act 2 — batch pre-validation catches a typo BEFORE side effects

```bash
node .claude/skills/qe-browser/scripts/batch.js --steps '[
  {"action": "go",    "url": "https://httpbin.org/forms/post"},
  {"action": "fill",  "selector": "input[name=custname]", "text": "Dragan"},
  {"action": "clikc", "selector": "button[type=submit]"},    ← typo
  {"action": "assert", "checks": [{"kind":"url_contains","text":"post"}]}
]'
```

Expected: `status: failed` with summary
`1 step(s) failed pre-validation: step 2: unknown action "clikc"`

**The point:** step 2's typo aborts the plan before step 1 (`go`) runs. No partial state. No side effects on httpbin's server. Safe primitive for agents.

---

## Act 3 — honest missing-vibium fallback

```bash
mkdir -p /tmp/fake-bin && ln -sf $(which node) /tmp/fake-bin/node

env -i PATH=/tmp/fake-bin HOME=$HOME TERM=dumb \
  node .claude/skills/qe-browser/scripts/assert.js \
  --checks '[{"kind":"url_contains","text":"foo"}]'
```

Exit code: **2**. Envelope:

```json
{
  "status": "skipped",
  "vibiumUnavailable": true,
  "output": {
    "reason": "browser-engine-unavailable",
    "summary": "vibium binary not found on PATH...",
    "remediation": ["Install vibium globally: npm install -g vibium", ...]
  }
}
```

**The point:** downstream skills branch on `result.vibiumUnavailable`. Never grep.

---

## Outro

### Ships in agentic-qe v3.9.9

```bash
npm install -g agentic-qe
aqe init --auto
```

### By the numbers

- **5** primitives, **112** unit tests, **10** smoke-test cases against real Vibium
- **11** skills migrated from inline Playwright glue
- **6** phases of devil's-advocate review in ADR-091
- **4** bugs Phase 3 (real Vibium smoke test) caught that unit tests missed

### Links

- [ADR-091](https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/implementation/adrs/ADR-091-qe-browser-skill-vibium-engine.md)
- [v3.9.9 release notes](https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/releases/v3.9.9.md)

# Questions?

---

## Backup — the other 3 primitives (Q&A ammo)

### `visual-diff.js`
Pixel-perfect comparison against a baseline PNG. Configurable threshold (`--threshold=0.02` = allow 2% pixel diff). Uses `pixelmatch` if available, hash-only fallback otherwise. Baselines live in `.aqe/visual-baselines/` (gitignored by default).

### `check-injection.js`
Scans the current page for **14 prompt-injection patterns** ported from `gsd-browser` under MIT/Apache. Catches classics (`ignore previous instructions`), credential exfil (`send your api key`), HTML-comment-hidden directives, markdown image exfil, URL-param data-exfil, and 9 more. `--exclude-selector` so docs sites that talk ABOUT injection don't self-flag.

### `intent-score.js`
Pure-JS semantic element scorer, also ported from gsd-browser's Rust implementation. **15 intents**: `submit_form`, `close_dialog`, `primary_cta`, `search_field`, `accept_cookies`, `fill_email`, `fill_password`, `fill_username`, `next_step`, `dismiss`, `auth_action`, `back_navigation`, `main_content`, `pagination_next`, `pagination_prev`. Runs entirely in the browser via `vibium eval --stdin`.

---

## Backup — Linux ARM64 gotcha

Google doesn't publish `linux-arm64` Chrome for Testing. Vibium's auto-install downloads the x86_64 binary on aarch64 hosts and fails under Rosetta.

**Workaround** (verified on Debian bookworm aarch64 with `chromium 146.0.7680.177-1~deb12u1`):

```bash
sudo apt install chromium chromium-driver
ln -sf /usr/bin/chromedriver ~/.vibium/chromedriver
ln -sf /usr/bin/chromium     ~/.vibium/chrome
```

Documented in `.claude/skills/qe-browser/SKILL.md` under **Linux ARM64 workaround** and `references/migration-from-playwright.md` gotcha #5.

---

## Backup — the 4 bugs Phase 3 caught

50 unit tests passed before we ran against real Vibium. Phase 3 found 4 bugs none of them caught:

1. **`vibium eval --stdin --json` return contract** — returns LAST expression value in `{ok, result}`, not `console.log` output
2. **`vibium screenshot -o /path/foo.png` ignores the directory** — saves to `~/Pictures/Vibium/foo.png` regardless
3. **`vibium screenshot --selector` doesn't exist** — had a dead fallback path
4. **Vibium defaults to visible browser** — fails with `Missing X server` in containers unless `--headless` is injected

**Lesson:** unit tests are necessary but not sufficient for a skill that shells out. You HAVE to run against the real tool.

All 4 are fixed and regression-tested. Documented in ADR-091 Phase 3.
