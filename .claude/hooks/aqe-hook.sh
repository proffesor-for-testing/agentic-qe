#!/usr/bin/env sh
# Resilient AQE hook shim (#510 item 5 — ports ruflo's hook-shim contract).
#
# SCOPE: this is a REPO-INTERNAL dev tool used by THIS repo's own
# .claude/settings.json. It is NOT shipped in the npm package (not in the
# package.json `files` list) and `aqe init` does NOT copy it into user projects
# — user hooks are generated as `npx agentic-qe hooks <cmd>` (cross-platform,
# works for npx-only installs). The resolution below is written to be portable
# anyway (so it is correct if ever copied into an installed project), but a
# native-Windows .cjs twin + platform-aware init wiring would be required before
# shipping it to users. See PR #512 discussion / docs/releases/v3.10.2.md.
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
#   * resolve a PROJECT-LOCAL AQE runner — never reach for the network / npx;
#   * if none resolves, no-op (a hook must never block a turn);
#   * SWALLOW stderr;
#   * emit ONLY the `--json` contract on stdout (drop any leading non-JSON
#     init noise) so the transcript stays clean and Claude Code's parser is happy;
#   * ALWAYS exit 0 — a hook failure or noisy init must never block a turn.
#
# Usage (from .claude/settings.json):
#   exec "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/aqe-hook.sh" <subcommand> [args...] --json
# i.e. pass exactly what previously followed `bundle.js hooks`.

PROJECT="${CLAUDE_PROJECT_DIR:-.}"

# Run `<runner> hooks <args>` against a PROJECT-LOCAL AQE, in priority order:
#   1. the installed binary (a user's project: node_modules/.bin/aqe)
#   2. the local built bundle (this source repo: dist/cli/bundle.js, via node)
# Deliberately NO global-PATH / npx fallback: a global or registry-fetched AQE
# could be a different version than the project's, and a bare `npx pkg@tag`
# per-fire is slow and can crash (arborist). If neither project-local runner
# exists, we no-op (return non-zero) so the hook never blocks a turn.
run_hook() {
  if [ -x "$PROJECT/node_modules/.bin/aqe" ]; then
    "$PROJECT/node_modules/.bin/aqe" hooks "$@"
  elif [ -f "$PROJECT/dist/cli/bundle.js" ]; then
    node "$PROJECT/dist/cli/bundle.js" hooks "$@"
  else
    return 127
  fi
}

# Run the hook; swallow stderr; tolerate any non-zero exit (incl. the no-runner
# case, which yields empty output -> the filter below prints nothing).
out=$(run_hook "$@" 2>/dev/null) || true

# Emit only the top-level JSON object: from the first line that begins with '{'
# to the first line that begins with '}' (pretty-printed JSON closes at column 0;
# nested closes are indented). This drops BOTH leading init-noise lines AND any
# async log lines printed AFTER the JSON (the dream/coherence daemons can emit
# late), so the --json contract stays parseable.
printf '%s\n' "$out" | sed -n '/^{/,/^}/p'

exit 0
