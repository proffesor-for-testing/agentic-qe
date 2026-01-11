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

# Copy skills (exclude internal development skills and .claude-flow metadata)
echo "📋 Copying skills..."
if [ -d "$REPO_ROOT/.claude/skills" ]; then
  # Copy all skills except internal ones
  for skill_dir in "$REPO_ROOT/.claude/skills"/*; do
    if [ -d "$skill_dir" ]; then
      skill_name=$(basename "$skill_dir")
      # Skip internal/development skills and hidden directories
      if [[ ! "$skill_name" =~ ^v3-(core|cli|ddd|integration|mcp|memory|performance|security|swarm|qe-core|qe-ddd|qe-cli|qe-memory|qe-performance|qe-security|qe-mcp|qe-mcp-optimization|qe-memory-unification|qe-integration|qe-agentic-flow|qe-fleet) ]] && \
         [[ ! "$skill_name" =~ ^\.  ]]; then
        cp -r "$skill_dir" "$V3_DIR/assets/skills/"
      fi
    fi
  done
  echo "  ✅ Copied $(ls -1 "$V3_DIR/assets/skills" | wc -l | tr -d ' ') skills"
else
  echo "  ⚠️  Skills directory not found at $REPO_ROOT/.claude/skills"
fi

# Copy v3 agents (only v3-qe-* agents)
echo "🤖 Copying agents..."
if [ -d "$REPO_ROOT/.claude/agents/v3" ]; then
  # Copy v3-qe-* agents only
  for agent_file in "$REPO_ROOT/.claude/agents/v3"/v3-qe-*.md; do
    if [ -f "$agent_file" ]; then
      cp "$agent_file" "$V3_DIR/assets/agents/v3/"
    fi
  done

  # Copy subagents directory if it exists
  if [ -d "$REPO_ROOT/.claude/agents/v3/subagents" ]; then
    mkdir -p "$V3_DIR/assets/agents/v3/subagents"
    for agent_file in "$REPO_ROOT/.claude/agents/v3/subagents"/v3-qe-*.md; do
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

echo "✨ Asset preparation complete!"
