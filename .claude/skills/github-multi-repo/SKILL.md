---
name: github-multi-repo
description: "Coordinate cross-repository operations including dependency sync, architecture optimization, and distributed workflows using AI swarm orchestration. Use when managing multi-repo updates, syncing packages, or running org-wide changes."
---

# GitHub Multi-Repository Coordination

Cross-repository coordination system combining swarm intelligence, package synchronization, and repository architecture optimization for organization-wide automation.

## Quick Start

```bash
# Initialize multi-repo coordination
npx claude-flow skill run github-multi-repo init \
  --repos "org/frontend,org/backend,org/shared" \
  --topology hierarchical

# Synchronize package versions
npx claude-flow skill run github-multi-repo sync \
  --packages "claude-code-flow,ruv-swarm" \
  --align-versions --update-docs

# Optimize repository structure
npx claude-flow skill run github-multi-repo optimize \
  --analyze-structure --suggest-improvements
```

## Core Capabilities

| Capability | Description |
|-----------|-------------|
| Swarm Coordination | Cross-repo AI swarm orchestration for distributed workflows |
| Package Sync | Dependency resolution and version alignment across packages |
| Architecture | Structure optimization and template management |
| Integration | Cross-package testing and deployment coordination |

## Repository Discovery

```javascript
// Auto-discover related repositories
const REPOS = Bash(`gh repo list my-organization --limit 100 \
  --json name,description,languages,topics \
  --jq '.[] | select(.languages | keys | contains(["TypeScript"]))'`)

// Initialize swarm with discovered repos
mcp__claude-flow__swarm_init({
  topology: "hierarchical", maxAgents: 8,
  metadata: { repos: REPOS }
})
```

## Synchronized Operations

```bash
# Execute synchronized changes across repositories
gh repo list org --limit 100 --json name \
  --jq '.[] | select(.name | test("-service$")) | .name' > /tmp/repos.txt

cat /tmp/repos.txt | while read -r repo; do
  gh repo clone org/$repo /tmp/$repo -- --depth=1
  cd /tmp/$repo
  npm update && npm test
  if [ $? -eq 0 ]; then
    git checkout -b update-dependencies-$(date +%Y%m%d)
    git add -A && git commit -m "chore: Update dependencies"
    git push origin HEAD
    gh pr create --title "Update dependencies" --label "dependencies"
  fi
done
```

## Package Synchronization

### Version Alignment
```javascript
// Initialize sync swarm
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 5 })
Task("Sync Coordinator", "Coordinate version alignment", "coordinator")
Task("Dependency Analyzer", "Analyze dependencies", "analyst")

// Align versions using gh CLI
Bash(`gh api repos/:owner/:repo/git/refs \
  -f ref='refs/heads/sync/package-alignment' \
  -f sha=$(gh api repos/:owner/:repo/git/refs/heads/main --jq '.object.sha')`)
```

### Cross-Package Feature Implementation
```javascript
mcp__github__push_files({
  branch: "feature/github-integration",
  files: [
    { path: "claude-code-flow/.claude/commands/github/github-modes.md", content: "[docs]" },
    { path: "ruv-swarm/src/github-coordinator/hooks.js", content: "[hooks]" }
  ],
  message: "feat: Add GitHub workflow integration"
})

Bash(`gh pr create --title "Feature: GitHub Workflow Integration" \
  --body "Multi-repo coordination with package synchronization"`)
```

## Organization-Wide Dependency Updates

```bash
# Create tracking issue
TRACKING_ISSUE=$(gh issue create \
  --title "Dependency Update: typescript@5.0.0" \
  --body "Tracking TypeScript update across all repositories" \
  --label "dependencies,tracking" --json number -q .number)

# Find and update all TypeScript repositories
gh repo list org --limit 100 --json name | \
  jq -r '.[].name' | while read -r repo; do
    gh repo clone org/$repo /tmp/$repo -- --depth=1
    cd /tmp/$repo
    npm install --save-dev typescript@5.0.0
    if npm test; then
      git checkout -b update-typescript-5
      git add package.json package-lock.json
      git commit -m "chore: Update TypeScript to 5.0.0 - Part of #$TRACKING_ISSUE"
      git push origin HEAD
      gh pr create --title "Update TypeScript to 5.0.0" --label "dependencies"
    fi
  done
```

## Configuration

```yaml
# .swarm/multi-repo.yml
version: 1
organization: my-org
repositories:
  - name: frontend
    role: ui
    agents: [coder, designer, tester]
  - name: backend
    role: api
    agents: [architect, coder, tester]
  - name: shared
    role: library
    agents: [analyst, coder]
coordination:
  topology: hierarchical
  communication: webhook
dependencies:
  - from: frontend
    to: [backend, shared]
  - from: backend
    to: [shared]
```

## Use Cases

```bash
# Microservices coordination
npx claude-flow skill run github-multi-repo microservices \
  --services "auth,users,orders,payments" \
  --ensure-compatibility --sync-contracts

# Library updates across consumers
npx claude-flow skill run github-multi-repo lib-update \
  --library "org/shared-lib" --version "2.0.0" \
  --find-consumers --update-imports --run-tests

# Organization-wide policy enforcement
npx claude-flow skill run github-multi-repo org-policy \
  --policy "add-security-headers" --repos "org/*" \
  --validate-compliance
```

## Monitoring

```bash
# Multi-repo dashboard
npx claude-flow skill run github-multi-repo dashboard --port 3000 --real-time

# Dependency graph visualization
npx claude-flow skill run github-multi-repo dep-graph --format mermaid

# Health monitoring
npx claude-flow skill run github-multi-repo health-check \
  --repos "org/*" --check "connectivity,memory,agents"
```

## Troubleshooting

```bash
# Diagnose connectivity
npx claude-flow skill run github-multi-repo diagnose-connectivity \
  --test-all-repos --check-permissions

# Debug memory sync
npx claude-flow skill run github-multi-repo debug-memory \
  --check-consistency --identify-conflicts

# Performance analysis
npx claude-flow skill run github-multi-repo perf-analysis \
  --profile-operations --identify-bottlenecks
```
