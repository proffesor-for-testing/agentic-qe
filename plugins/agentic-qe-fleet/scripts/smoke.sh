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

# 8. THIS plugin registers the MCP server itself. A marketplace install copies
#    only plugins/agentic-qe-fleet/, so the repo-root manifest never reaches
#    users — the fleet's own .mcp.json is what Claude Code loads.
MCP_JSON="$PLUGIN_DIR/.mcp.json"
PKG_VERSION="$(jq -r '.version' "$REPO_ROOT/package.json" 2>/dev/null)"
if jq -e '.mcpServers["agentic-qe"]' "$MCP_JSON" >/dev/null 2>&1; then
  pass ".mcp.json registers the agentic-qe MCP server"
else
  err ".mcp.json missing or does not register the agentic-qe MCP server"
fi
PIN="$(jq -r '.mcpServers["agentic-qe"].args[]? | select(startswith("agentic-qe@"))' "$MCP_JSON" 2>/dev/null)"
if [ "$PIN" = "agentic-qe@$PKG_VERSION" ]; then
  pass ".mcp.json pins agentic-qe@$PKG_VERSION (== package.json)"
else
  err ".mcp.json pin '${PIN:-<none>}' != agentic-qe@$PKG_VERSION (run: node scripts/sync-plugin-versions.cjs)"
fi
[ "$(jq -r '.version' "$MANIFEST" 2>/dev/null)" = "$PKG_VERSION" ] \
  && pass "plugin.json version == package.json ($PKG_VERSION)" \
  || err "plugin.json version != package.json ($PKG_VERSION)"

# 9. Every ${user_config.X} referenced by .mcp.json is declared in userConfig,
#    and every declared option has a default (unset options must not break boot).
for key in $(grep -oE '\$\{user_config\.[A-Za-z0-9_]+\}' "$MCP_JSON" 2>/dev/null | sed -E 's/.*\.([A-Za-z0-9_]+)\}/\1/' | sort -u); do
  jq -e --arg k "$key" '.userConfig[$k] | has("default")' "$MANIFEST" >/dev/null 2>&1 \
    && pass "userConfig.$key declared with a default" \
    || err "userConfig.$key referenced by .mcp.json but not declared (with a default) in plugin.json"
done

# 10. Skills: no wildcard allowed-tools; every legacy mcp__agentic-qe__X has its
#     plugin-scoped twin mcp__plugin_agentic-qe-fleet_agentic-qe__X (the name an
#     installed plugin actually exposes).
fail_before_skills=$fail; fail=0
for s in "$PLUGIN_DIR"/skills/*/SKILL.md; do
  fm="$(awk 'NR==1{next} /^---/{exit} {print}' "$s")"
  printf '%s\n' "$fm" | grep -qE '^\s*-\s*\*\s*$|allowed-tools:\s*\*|mcp__[A-Za-z0-9_-]*\*' \
    && err "skill uses wildcard allowed-tools: $(basename "$(dirname "$s")")"
  for t in $(printf '%s\n' "$fm" | grep -oE 'mcp__agentic-qe__[a-z_]+' | sed 's/mcp__agentic-qe__//'); do
    printf '%s\n' "$fm" | grep -q "mcp__plugin_agentic-qe-fleet_agentic-qe__$t\$" \
      || err "skill $(basename "$(dirname "$s")") lacks plugin-scoped tool name for $t"
  done
done
[ "$fail" -eq 0 ] && pass "skills: no wildcard allowed-tools; plugin-scoped MCP tool names present"
[ "$fail_before_skills" -eq 1 ] && fail=1

# 11. Agents declare a model (validate-plugin check 8).
missing_model=$(grep -L '^model:' "$PLUGIN_DIR"/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
[ "$missing_model" -eq 0 ] && pass "agents: all declare model" || err "agents: $missing_model missing model frontmatter"

# 12. Ruflo contract cadence: CHANGELOG + contract ADR present.
[ -s "$PLUGIN_DIR/CHANGELOG.md" ] && pass "CHANGELOG.md present" || err "CHANGELOG.md missing/empty"
[ -s "$PLUGIN_DIR/docs/adrs/0001-agentic-qe-fleet-contract.md" ] \
  && pass "docs/adrs/0001-agentic-qe-fleet-contract.md present" \
  || err "contract ADR missing: docs/adrs/0001-agentic-qe-fleet-contract.md"
grep -qF "/plugin install $PLUGIN_NAME --marketplace proffesor-for-testing/agentic-qe" "$PLUGIN_DIR/README.md" \
  && pass "README has the marketplace install line" \
  || err "README missing: /plugin install $PLUGIN_NAME --marketplace proffesor-for-testing/agentic-qe"

# 13. Version-sync tooling agrees (root manifest + fleet manifest + pins).
node "$REPO_ROOT/scripts/sync-plugin-versions.cjs" --check >/dev/null 2>&1 \
  && pass "sync-plugin-versions --check: all plugin versions == package.json" \
  || err "plugin version drift (run: node scripts/sync-plugin-versions.cjs --check)"

# 14. Mod (hooks/) contract, when present — owned by the mod's own smoke script.
if [ -f "$SCRIPT_DIR/smoke-mod.sh" ]; then
  bash "$SCRIPT_DIR/smoke-mod.sh" && pass "smoke-mod.sh passed" || err "smoke-mod.sh failed"
fi

echo "======================================="
if [ "$fail" -eq 0 ]; then
  echo "PASS: agentic-qe-fleet contract holds"
  exit 0
else
  echo "FAIL: agentic-qe-fleet contract violated"
  exit 1
fi
