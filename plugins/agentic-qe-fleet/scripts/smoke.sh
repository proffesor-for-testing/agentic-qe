#!/usr/bin/env bash
# Structural-contract smoke test for the agentic-qe-fleet plugin (#510 item 10).
#
# Ports ruflo's "smoke.sh as a machine-checkable plugin contract" discipline.
# Asserts the plugin's shipped structure is intact so silent drift (a skill or
# agent disappearing, the lean manifest regrowing skill/command/agent arrays,
# the marketplace losing this plugin) fails CI instead of shipping broken.
#
# Run: bash plugins/agentic-qe-fleet/scripts/smoke.sh   (or: npm run plugin:smoke)
# Exit 0 = contract holds, 1 = any violation.

set -u

# Resolve the plugin root from this script's location (robust to CWD).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PLUGIN_DIR/../.." && pwd)"
MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"
MANIFEST="$PLUGIN_DIR/.claude-plugin/plugin.json"

# Contract constants — bump these deliberately when the bundle changes.
EXPECT_AGENTS=11
EXPECT_COMMANDS=9
EXPECT_SKILLS=9
PLUGIN_NAME="agentic-qe-fleet"

fail=0
pass() { printf '  ok   %s\n' "$1"; }
err()  { printf '  FAIL %s\n' "$1"; fail=1; }

echo "== agentic-qe-fleet plugin contract =="

# 1. Lean manifest exists and is valid JSON with the right name + a version.
if jq -e . "$MANIFEST" >/dev/null 2>&1; then pass "plugin.json is valid JSON"; else err "plugin.json missing or invalid JSON"; fi
[ "$(jq -r '.name' "$MANIFEST" 2>/dev/null)" = "$PLUGIN_NAME" ] && pass "plugin.json name == $PLUGIN_NAME" || err "plugin.json name != $PLUGIN_NAME"
jq -e '.version | type == "string"' "$MANIFEST" >/dev/null 2>&1 && pass "plugin.json has a version" || err "plugin.json missing version"

# 2. Manifest must NOT declare skills/commands/agents arrays — Claude Code
#    auto-discovers them from the directory tree; declaring them is an error.
if jq -e 'has("skills") or has("commands") or has("agents")' "$MANIFEST" >/dev/null 2>&1; then
  err "plugin.json declares skills/commands/agents array (must rely on auto-discovery)"
else
  pass "plugin.json relies on directory auto-discovery (no skills/commands/agents arrays)"
fi

# 3. The repo marketplace must index this plugin with a matching source path.
if jq -e --arg n "$PLUGIN_NAME" '.plugins[] | select(.name==$n) | .source=="./plugins/agentic-qe-fleet"' "$MARKETPLACE" >/dev/null 2>&1; then
  pass "marketplace.json indexes $PLUGIN_NAME at ./plugins/agentic-qe-fleet"
else
  err "marketplace.json does not index $PLUGIN_NAME with source ./plugins/agentic-qe-fleet"
fi

# 4. Agents: exact count, each with name + description frontmatter.
n=$(find "$PLUGIN_DIR/agents" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')
[ "$n" -eq "$EXPECT_AGENTS" ] && pass "agents: $n (== $EXPECT_AGENTS)" || err "agents: $n (expected $EXPECT_AGENTS)"
for f in "$PLUGIN_DIR"/agents/*.md; do
  head -15 "$f" | grep -qE '^name:' && head -15 "$f" | grep -qE '^description:' || err "agent missing name/description frontmatter: $(basename "$f")"
done

# 5. Commands: exact count, each with name + description frontmatter.
n=$(find "$PLUGIN_DIR/commands" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')
[ "$n" -eq "$EXPECT_COMMANDS" ] && pass "commands: $n (== $EXPECT_COMMANDS)" || err "commands: $n (expected $EXPECT_COMMANDS)"
for f in "$PLUGIN_DIR"/commands/*.md; do
  head -10 "$f" | grep -qE '^name:' && head -10 "$f" | grep -qE '^description:' || err "command missing name/description frontmatter: $(basename "$f")"
done

# 6. Skills: exact count of dirs, each with a SKILL.md carrying name + description.
n=$(find "$PLUGIN_DIR/skills" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
[ "$n" -eq "$EXPECT_SKILLS" ] && pass "skills: $n (== $EXPECT_SKILLS)" || err "skills: $n (expected $EXPECT_SKILLS)"
for d in "$PLUGIN_DIR"/skills/*/; do
  s="$d/SKILL.md"
  if [ -f "$s" ]; then
    head -8 "$s" | grep -qE '^(name|"name"):' && head -8 "$s" | grep -qE '^(description|"description"):' || err "skill SKILL.md missing name/description: $(basename "$d")"
  else
    err "skill missing SKILL.md: $(basename "$d")"
  fi
done

# 7. README present and non-trivial.
[ -s "$PLUGIN_DIR/README.md" ] && pass "README.md present" || err "README.md missing/empty"

# 8. The top-level plugin manifest registers the MCP server.
TOP_MANIFEST="$REPO_ROOT/.claude-plugin/plugin.json"
jq -e '.mcpServers["agentic-qe"]' "$TOP_MANIFEST" >/dev/null 2>&1 \
  && pass "top-level plugin.json registers the agentic-qe MCP server" \
  || err "top-level plugin.json does not register the agentic-qe MCP server"

echo "======================================="
if [ "$fail" -eq 0 ]; then
  echo "PASS: agentic-qe-fleet contract holds"
  exit 0
else
  echo "FAIL: agentic-qe-fleet contract violated"
  exit 1
fi
