#!/usr/bin/env sh
# Resilient AQE hook shim (#510 item 5 — ports ruflo's hook-shim contract).
#
# Claude Code runs project hooks on every turn / tool use. Without this shim,
# the AQE hook commands (`node dist/cli/bundle.js hooks <cmd> --json`) print
# init diagnostics to STDOUT before the JSON — e.g.
#     [hooks] CoherenceService initialized with WASM engines
#     [RvfPatternStore] Initialized: .agentic-qe/patterns.rvf (dim=384)
#     [RVF] Migration adapter active at stage 2 (dual-sqlite)
#     [hooks] System initialized
# which pollutes the transcript on every SessionStart / UserPromptSubmit, and a
# crash or slow init can surface a hook error mid-turn.
#
# Contract (ruflo-style):
#   * prefer the LOCAL built bundle — never reach for the network / npx;
#   * if the bundle isn't built yet, no-op (a hook must never block a turn);
#   * SWALLOW stderr;
#   * emit ONLY the `--json` contract on stdout (drop any leading non-JSON
#     init noise) so the transcript stays clean and Claude Code's parser is happy;
#   * ALWAYS exit 0 — a hook failure or noisy init must never block a turn.
#
# Usage (from .claude/settings.json):
#   exec "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/aqe-hook.sh" <subcommand> [args...] --json
# i.e. pass exactly what previously followed `bundle.js hooks`.

BUNDLE="${CLAUDE_PROJECT_DIR:-.}/dist/cli/bundle.js"

# Not built (e.g. fresh clone before `npm run build`) -> no-op, never block.
[ -f "$BUNDLE" ] || exit 0

# Run the hook; swallow stderr; tolerate any non-zero exit.
out=$(node "$BUNDLE" hooks "$@" 2>/dev/null) || true

# Emit only the top-level JSON object: from the first line that begins with '{'
# to the first line that begins with '}' (pretty-printed JSON closes at column 0;
# nested closes are indented). This drops BOTH leading init-noise lines AND any
# async log lines printed AFTER the JSON (the dream/coherence daemons can emit
# late), so the --json contract stays parseable.
printf '%s\n' "$out" | sed -n '/^{/,/^}/p'

exit 0
