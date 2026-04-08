# aqe init chaos corpus

Adversarial-rare project shapes for the weekly
[`init-chaos`](../../../.github/workflows/init-chaos.yml) workflow.

The everyday-real
[init-corpus](../init-corpus/README.md) catches release regressions
against pinned slices of real public repositories. This directory
catches a different class of failure: **`aqe init` hanging or
crashing on pathological file shapes that don't exist in any real
codebase but could be planted by a malicious or careless user**.

## Why synthetic generation here

The init-corpus README explicitly bans synthetic fixtures because
they hide real-world content bugs in the release gate. That ban
applies to *regression markers* — fixtures meant to prove init keeps
working on actual user code. It does **not** apply to chaos tests:
chaos tests need controlled adversarial inputs that don't exist in
any real public repo. The lesson from #401 was "don't validate init
against synthetic toy projects", not "never use synthetic data".
This is the one place where synthetic generation is the right tool.

The fixtures are NOT committed. `generate.sh` writes them into a
temp directory at the start of every workflow run. Commits stay
small and the chaos shapes can be tweaked without churn.

## The six shapes

| ID | What it is | Why it might hang init |
|---|---|---|
| `utf16le-bom` | TS source file encoded UTF-16LE with `FF FE` BOM | Tokenizers that assume UTF-8 may loop or read garbage |
| `mixed-line-endings` | TS source with `\r\n` in the middle of an `\n` file | Line-counters that resync on `\n` may misalign and re-tokenize |
| `symlink-loop` | `src/a → src/b → src/a` (mutual symlinks) | Naive recursive walks loop forever |
| `binary-as-text` | PNG signature bytes saved as `decoy.ts` | Tokenizers that don't sniff content type may run on binary |
| `minified-bundle` | ~256 KB single-line JS in `src/bundle.min.js` | Tokenizers with quadratic backtracking on long lines stall |
| `control-chars` | NUL and ESC sequences inside identifier-shaped tokens | Parsers may early-terminate strings or loop on resync |

## What "pass" means for a chaos test

For each shape, the workflow runs `timeout 60 aqe init --auto --json`
and asserts the exit code is **anything except 124** (the timeout's
signal that init hung).

- Exit 0 → init handled the chaos shape gracefully (best case).
- Exit non-zero → init detected the bad input and failed fast (also fine).
- Exit 124 → init hung past the 60-second watchdog (the failure mode
  this workflow exists to catch).

The watchdog is the load-bearing thing under test, not init's ability
to make sense of garbage input.

## What to do when this workflow fails

1. Download the `init-chaos-logs` artifact from the failed run.
2. Find the shape that hung and read its `${shape}.log` (stderr from
   init) and `${shape}.json` (whatever `--json` output it produced
   before being killed).
3. Two possible outcomes:
   - **Real regression in init's watchdog or per-file timeout.**
     Reproduce locally with `./tests/fixtures/init-chaos/generate.sh
     /tmp/chaos && cd /tmp/chaos/<shape> && timeout 60 aqe init
     --auto --json`. Open a P0 bug.
   - **Known limitation we accept.** Document it here in this README
     and quarantine the shape via a comment in `generate.sh`. The
     workflow stays green but the limitation is now visible.
4. Do NOT silence the workflow without doing one of the above.

## Local development

```bash
# Generate shapes into a temp dir
./tests/fixtures/init-chaos/generate.sh /tmp/chaos

# Inspect what was generated
find /tmp/chaos -type f -o -type l | sort

# Run aqe init against one shape
cd /tmp/chaos/utf16le-bom
timeout 60 aqe init --auto --json
```

## Refs

- Issue #410 — chaos workflow proposal and acceptance criteria
- Issue #401 — the v3.9.1–v3.9.4 init regression series that motivated all the verification work
- [tests/fixtures/init-corpus/README.md](../init-corpus/README.md) — the everyday-real corpus this complements
