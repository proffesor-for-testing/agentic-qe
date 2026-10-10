#!/usr/bin/env bash
# Structural smoke test for the aqe-mod hooks module (plugins/agentic-qe-fleet/hooks).
#
# Checks the mod's contract without running Claude Code:
#   - hooks/hooks.json is valid JSON and names ./register.ts as its one module
#   - every module file exists and stays under 500 lines (CLAUDE.md)
#   - the module is sandbox-clean: no Node/fs/net/process imports, no imports
#     from outside the plugin, no dynamic import(), no require, no computed $[x]
#   - the status folder name matches the ruflo console rule ^[a-z0-9][a-z0-9-]{0,40}-mod$
#   - the guard ships with tests and an attack/benign corpus
#
# Run: bash plugins/agentic-qe-fleet/scripts/smoke-mod.sh
# Exit 0 = contract holds, 1 = any violation.
# The engine-level checks are `claude plugin validate plugins/agentic-qe-fleet`
# and `claude plugin test plugins/agentic-qe-fleet` (Claude Code >= 2.1.287).

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$PLUGIN_DIR/hooks"
HOOKS_JSON="$HOOKS_DIR/hooks.json"

fail=0
pass() { printf '  ok   %s\n' "$1"; }
err()  { printf '  FAIL %s\n' "$1"; fail=1; }

echo "== aqe-mod (agentic-qe-fleet hooks module) contract =="

# 1. hooks.json names the module.
if jq -e . "$HOOKS_JSON" >/dev/null 2>&1; then pass "hooks.json is valid JSON"; else err "hooks/hooks.json missing or invalid JSON"; fi
if [ "$(jq -r '.modules | length' "$HOOKS_JSON" 2>/dev/null)" = "1" ] && [ "$(jq -r '.modules[0]' "$HOOKS_JSON" 2>/dev/null)" = "./register.ts" ]; then
  pass "hooks.json modules == [\"./register.ts\"]"
else
  err "hooks.json must list exactly one module, ./register.ts"
fi

# 2. Module files exist and are small.
for f in register.ts guard.ts paths.ts glob.ts shell.ts context.ts verbs.ts scripts.ts powershell.ts status.ts options.ts command.ts; do
  if [ -f "$HOOKS_DIR/$f" ]; then
    lines=$(wc -l < "$HOOKS_DIR/$f")
    if [ "$lines" -lt 500 ]; then pass "hooks/$f exists ($lines lines)"; else err "hooks/$f is $lines lines (limit 500)"; fi
  else
    err "hooks/$f missing"
  fi
done
grep -q "export const register: Register" "$HOOKS_DIR/register.ts" 2>/dev/null && pass "register.ts exports register: Register" || err "register.ts does not export register: Register"

# 3. Sandbox-clean: imports only 'claude-code' types or sibling files; nothing Node-shaped.
bad_imports=$(grep -nE "^\s*import\b" "$HOOKS_DIR"/*.ts | grep -vE "from '(\./[a-z-]+|claude-code)'" || true)
if [ -z "$bad_imports" ]; then pass "imports are only ./<sibling> or 'claude-code'"; else err "forbidden import(s): $bad_imports"; fi
forbidden=$(grep -nE "\brequire\s*\(|\bimport\s*\(|\bprocess\.|from 'node:|from '(fs|net|http|https|child_process|os|path)'|\\\$\[" "$HOOKS_DIR"/*.ts || true)
if [ -z "$forbidden" ]; then pass "no require/import()/process/node: modules/computed \$[x]"; else err "sandbox violation: $forbidden"; fi
non_type_cc=$(grep -nE "^\s*import\s+\{[^}]*\}\s+from 'claude-code'" "$HOOKS_DIR"/*.ts || true)
if [ -z "$non_type_cc" ]; then pass "'claude-code' is imported for types only"; else err "value import from 'claude-code' (it is empty at run time): $non_type_cc"; fi

# 4. Status folder name matches the console's rule.
status_dir=$(grep -oE "MOD_NAME = '[^']+'" "$HOOKS_DIR/status.ts" | sed -E "s/MOD_NAME = '([^']+)'/\1/")
if [[ "$status_dir" =~ ^[a-z0-9][a-z0-9-]{0,40}-mod$ ]]; then pass "status dir .claude-flow/$status_dir matches the console rule"; else err "status dir '$status_dir' does not match ^[a-z0-9][a-z0-9-]{0,40}-mod\$"; fi
grep -q "version: 1" "$HOOKS_DIR/status.ts" && pass "status payload is version 1" || err "status payload must carry version: 1"
grep -q "\.catch(" "$HOOKS_DIR/register.ts" && pass "tool.call guard has a .catch handler" || err "tool.call guard must register a .catch handler"

# 5. Tests and corpus ship with the guard.
for f in tests/mod.test.ts tests/corpus.test.ts tests/corpus/attacks.ts tests/corpus/benign.ts; do
  [ -f "$PLUGIN_DIR/$f" ] && pass "$f exists" || err "$f missing"
done

echo
if [ "$fail" -eq 0 ]; then echo "aqe-mod contract holds"; else echo "aqe-mod contract violated"; fi
exit "$fail"
