#!/bin/bash
# Plugin load test — validates that the bundled plugin actually works
# in a fresh Claude Code session. Must be run from a terminal (not from
# within an existing Claude Code session).
#
# This script does the structural checks that don't require running Claude.
# For the full end-to-end check, run:
#   claude --plugin-dir ./plugins/agentic-qe-fleet
# and verify that:
#   - The 9 /aqe-* slash commands appear in the list
#   - The 11 qe-* agents are spawnable
#   - The 9 skills are listed
#   - The agentic-qe MCP server connects (claude mcp list shows it)

set -u
PLUGIN=plugins/agentic-qe-fleet

if [ ! -d "$PLUGIN" ]; then
  echo "FAIL plugin directory not found: $PLUGIN" >&2
  exit 1
fi

passes=0
fails=0

check() {
  local label="$1" cond="$2"
  if eval "$cond"; then
    echo "PASS $label"
    passes=$((passes + 1))
  else
    echo "FAIL $label"
    fails=$((fails + 1))
  fi
}

# === Structural checks ===
check "plugin.json exists"            "[ -f $PLUGIN/.claude-plugin/plugin.json ]"
check "plugin.json valid JSON"        "node -e 'require(\"./$PLUGIN/.claude-plugin/plugin.json\")' 2>/dev/null"
check ".mcp.json exists"              "[ -f $PLUGIN/.mcp.json ]"
check ".mcp.json valid JSON"          "node -e 'require(\"./$PLUGIN/.mcp.json\")' 2>/dev/null"
check "README.md present"             "[ -f $PLUGIN/README.md ]"

# === Counts ===
agents=$(ls $PLUGIN/agents/*.md 2>/dev/null | wc -l)
commands=$(ls $PLUGIN/commands/*.md 2>/dev/null | wc -l)
skills=$(ls -d $PLUGIN/skills/*/ 2>/dev/null | wc -l)
check "agents count = 11"             "[ $agents -eq 11 ]"
check "commands count = 9"            "[ $commands -eq 9 ]"
check "skills count = 9"              "[ $skills -eq 9 ]"

# === Frontmatter ===
fm_errors=$(node -e "
const fs = require('fs'), path = require('path');
let errors = 0;
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) {
      const c = fs.readFileSync(p, 'utf8');
      if (!c.startsWith('---')) continue;
      const i = c.indexOf('---', 3);
      if (i < 0) { errors++; continue; }
      if (!/^name:/m.test(c.slice(3, i))) errors++;
    }
  }
}
// Only component dirs carry name: frontmatter; docs/adrs use ADR (id:) frontmatter.
for (const sub of ['agents', 'commands', 'skills']) {
  const d = path.join('$PLUGIN', sub);
  if (fs.existsSync(d)) walk(d);
}
console.log(errors);
" 2>/dev/null)
check "all component .md files have valid frontmatter" "[ \"$fm_errors\" = '0' ]"

# === Each agent has a model field ===
agents_no_model=$(grep -L "^model:" $PLUGIN/agents/*.md 2>/dev/null | wc -l)
check "all agents have model field"   "[ $agents_no_model -eq 0 ]"

# === Each skill has trust_tier and allowed-tools ===
skills_no_tier=0
skills_no_tools=0
for s in $PLUGIN/skills/*/SKILL.md; do
  if ! grep -q "^trust_tier:" "$s"; then skills_no_tier=$((skills_no_tier + 1)); fi
  if ! grep -q "^allowed-tools:" "$s"; then skills_no_tools=$((skills_no_tools + 1)); fi
done
check "all skills have trust_tier"    "[ $skills_no_tier -eq 0 ]"
check "all skills have allowed-tools" "[ $skills_no_tools -eq 0 ]"

# === MCP launcher resolves ===
if command -v aqe-mcp >/dev/null 2>&1; then
  check "aqe-mcp on PATH (published bin)" "true"
elif command -v agentic-qe >/dev/null 2>&1; then
  check "agentic-qe on PATH (published bin)" "true"
else
  check "MCP launcher on PATH"          "false"
fi

# === No tier-1 skills shipped ===
tier1_skills=$(grep -l "^trust_tier: 1" $PLUGIN/skills/*/SKILL.md 2>/dev/null | wc -l)
check "no tier-1 skills shipped"      "[ $tier1_skills -eq 0 ]"

echo ""
echo "=== $passes passed, $fails failed ==="
echo ""
echo "Manual end-to-end load test (must be run from a fresh terminal):"
echo "  claude --plugin-dir ./plugins/agentic-qe-fleet"
echo "Then in the loaded session:"
echo "  /aqe-fleet-status         # commands resolve"
echo "  claude mcp list           # agentic-qe shows as Connected"
echo "  Task tool: spawn qe-test-architect agent"
exit $((fails == 0 ? 0 : 1))
