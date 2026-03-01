#!/bin/bash
# Prepare assets for npm publish
# Copies skills and agents from the main repo to the v3 package

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
V3_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$V3_DIR")"

echo "📦 Preparing assets for npm publish..."

# Create asset directories in v3 package
mkdir -p "$V3_DIR/assets/skills"
mkdir -p "$V3_DIR/assets/agents/v3"

# Copy skills (QE-related skills: v2 testing skills + v3 qe-* skills)
echo "📋 Copying skills..."
if [ -d "$REPO_ROOT/.claude/skills" ]; then
  # V2 QE skills (testing-related with generic names)
  V2_QE_SKILLS="accessibility-testing api-testing-patterns bug-reporting-excellence chaos-engineering-resilience code-review-quality compatibility-testing compliance-testing consultancy-practices context-driven-testing contract-testing database-testing exploratory-testing-advanced holistic-testing-pact localization-testing mobile-testing mutation-testing pair-programming performance-testing quality-metrics refactoring-patterns regression-testing risk-based-testing security-testing shift-left-testing shift-right-testing six-thinking-hats tdd-london-chicago technical-writing test-automation-strategy test-data-management test-design-techniques test-environment-management test-reporting-analytics verification-quality visual-testing-advanced xp-practices"

  for skill_dir in "$REPO_ROOT/.claude/skills"/*; do
    if [ -d "$skill_dir" ]; then
      skill_name=$(basename "$skill_dir")
      # Include: qe-* skills (v3), agentic-quality-engineering (core), aqe-v2-v3-migration, and v2 QE skills
      if [[ "$skill_name" =~ ^qe- ]] || \
         [[ "$skill_name" == "agentic-quality-engineering" ]] || \
         [[ "$skill_name" == "aqe-v2-v3-migration" ]] || \
         [[ " $V2_QE_SKILLS " =~ " $skill_name " ]]; then
        cp -r "$skill_dir" "$V3_DIR/assets/skills/"
      fi
    fi
  done
  echo "  ✅ Copied $(ls -1 "$V3_DIR/assets/skills" | wc -l | tr -d ' ') skills"
else
  echo "  ⚠️  Skills directory not found at $REPO_ROOT/.claude/skills"
fi

# Copy v3 agents (qe-* agents - ADR-045 version-agnostic naming)
echo "🤖 Copying agents..."
if [ -d "$REPO_ROOT/.claude/agents/v3" ]; then
  # Copy qe-* agents (version-agnostic naming per ADR-045)
  for agent_file in "$REPO_ROOT/.claude/agents/v3"/qe-*.md; do
    if [ -f "$agent_file" ]; then
      cp "$agent_file" "$V3_DIR/assets/agents/v3/"
    fi
  done

  # Copy subagents directory if it exists
  if [ -d "$REPO_ROOT/.claude/agents/v3/subagents" ]; then
    mkdir -p "$V3_DIR/assets/agents/v3/subagents"
    for agent_file in "$REPO_ROOT/.claude/agents/v3/subagents"/qe-*.md; do
      if [ -f "$agent_file" ]; then
        cp "$agent_file" "$V3_DIR/assets/agents/v3/subagents/"
      fi
    done
  fi

  agent_count=$(find "$V3_DIR/assets/agents/v3" -name "*.md" | wc -l | tr -d ' ')
  echo "  ✅ Copied $agent_count agents"
else
  echo "  ⚠️  Agents directory not found at $REPO_ROOT/.claude/agents/v3"
fi

# Copy validation infrastructure (ADR-056)
echo "🔍 Copying validation infrastructure..."
if [ -d "$REPO_ROOT/.claude/skills/.validation" ]; then
  mkdir -p "$V3_DIR/assets/skills/.validation"
  cp -r "$REPO_ROOT/.claude/skills/.validation/"* "$V3_DIR/assets/skills/.validation/"
  echo "  ✅ Copied validation infrastructure"
  echo "    - schemas: $(ls -1 "$V3_DIR/assets/skills/.validation/schemas" 2>/dev/null | wc -l | tr -d ' ') files"
  echo "    - templates: $(ls -1 "$V3_DIR/assets/skills/.validation/templates" 2>/dev/null | wc -l | tr -d ' ') files"
  echo "    - examples: $(ls -1 "$V3_DIR/assets/skills/.validation/examples" 2>/dev/null | wc -l | tr -d ' ') files"
else
  echo "  ⚠️  Validation directory not found at $REPO_ROOT/.claude/skills/.validation"
fi

echo "✨ Asset preparation complete!"
