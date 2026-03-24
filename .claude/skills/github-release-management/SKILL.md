---
name: github-release-management
description: "Orchestrate GitHub releases with automated versioning, changelog generation, multi-platform builds, progressive deployment, and rollback management using AI swarm coordination. Use when creating releases, coordinating multi-package deploys, or managing hotfix workflows."
---

# GitHub Release Management

Intelligent release automation using AI swarms for changelog generation, multi-platform deployment, and rollback capabilities.

## Quick Start

```bash
# Create a release draft
gh release create v2.0.0 --draft --generate-notes --title "Release v2.0.0"

# Full automated release with swarm
npx claude-flow swarm init --topology hierarchical
npx claude-flow sparc pipeline "Release v2.0.0 with full validation"
```

## Essential Release Commands

```bash
# Get last release and generate changelog
LAST_TAG=$(gh release list --limit 1 --json tagName -q '.[0].tagName')
CHANGELOG=$(gh api repos/:owner/:repo/compare/${LAST_TAG}...HEAD --jq '.commits[].commit.message')

# Create draft release
gh release create v2.0.0 --draft --title "Release v2.0.0" --notes "$CHANGELOG" --target main

# Version bump and publish
npm version patch && git push --follow-tags
npm run build && npm publish
gh release create $(npm pkg get version) --generate-notes
```

## Swarm Release Orchestration

```javascript
// Initialize release swarm
mcp__claude-flow__swarm_init { topology: "hierarchical", maxAgents: 6, strategy: "balanced" }

// Spawn release team
mcp__claude-flow__agent_spawn { type: "coordinator", name: "Release Director" }
mcp__claude-flow__agent_spawn { type: "coder", name: "Version Manager" }
mcp__claude-flow__agent_spawn { type: "tester", name: "QA Engineer" }
mcp__claude-flow__agent_spawn { type: "reviewer", name: "Release Reviewer" }

// Execute coordinated release
Bash("npm install && npm test && npm run lint && npm run build")
Bash(`gh pr create --title "Release v2.0.0" --head "release/v2.0.0" --base "main"`)
```

## Changelog Generation

```bash
PRS=$(gh pr list --state merged --base main --json number,title,labels,author,mergedAt \
  --jq ".[] | select(.mergedAt > \"$(gh release view v1.0.0 --json publishedAt -q .publishedAt)\")")

npx claude-flow github changelog \
  --prs "$PRS" --from v1.0.0 --to HEAD \
  --categorize --add-migration-guide
```

## Multi-Package Release

```javascript
// Mesh topology for cross-package coordination
mcp__claude-flow__swarm_init { topology: "mesh", maxAgents: 8 }

Task("Package A", "Release claude-flow v1.0.72", "coder")
Task("Package B", "Release ruv-swarm v1.0.12", "coder")
Task("Integration", "Validate cross-package compatibility", "tester")

Bash("cd packages/claude-flow && npm install && npm test")
Bash("cd packages/ruv-swarm && npm install && npm test")
Bash("npm run test:integration")
```

## Progressive Deployment

```yaml
# .github/release-deployment.yml
deployment:
  strategy: progressive
  stages:
    - name: canary
      percentage: 5
      duration: 1h
      metrics: [error-rate < 0.1%, latency-p99 < 200ms]
    - name: partial
      percentage: 25
      duration: 4h
      approval: qa-team
    - name: full
      percentage: 100
      approval: release-manager
      rollback-enabled: true
```

## Emergency Hotfix

```bash
# Fast-track critical fix
git checkout -b hotfix/v1.2.4 v1.2.3
git cherry-pick abc123def
npm run test:critical && npm run build

gh release create v1.2.4 \
  --title "HOTFIX v1.2.4: Critical Security Patch" \
  --notes "Emergency release addressing CVE-2024-XXXX"
npm publish --tag hotfix

gh issue create --title "HOTFIX v1.2.4 Deployed" \
  --body "Critical security patch deployed. Please update immediately." \
  --label "critical,security,hotfix"
```

## GitHub Actions Release Workflow

```yaml
name: Intelligent Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: ubuntu-latest
    permissions: { contents: write, packages: write }
    steps:
      - uses: actions/checkout@v3
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v3
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci && npm run lint && npm test && npm run build
      - run: |
          gh release edit ${{ github.ref_name }} --notes "$(cat RELEASE_CHANGELOG.md)" --draft=false
          for file in dist/*; do gh release upload ${{ github.ref_name }} "$file"; done
      - run: npm publish
```

## Rollback Configuration

```bash
npx claude-flow github rollback-config \
  --triggers '{"error-rate": ">5%", "latency-p99": ">1000ms", "availability": "<99.9%"}' \
  --grace-period 5m --notify-on-rollback

# Immediate rollback
npx claude-flow github rollback --to-version v1.9.9 \
  --reason "Critical bug in v2.0.0" --preserve-data --notify-users
```

## Validation & Security

```bash
# Pre-release validation
npx claude-flow github release-validate \
  --checks "version-conflicts,api-breaking-changes,security-vulnerabilities,performance-regression"

# Security scanning
npx claude-flow github release-security \
  --scan-dependencies --check-secrets --sign-artifacts --sbom-generation

# Backward compatibility
npx claude-flow github compat-test --previous-versions "v1.0,v1.1,v1.2" --api-contracts
```

## Release Checklist

**Pre-Release:**
- [ ] Version numbers updated across all packages
- [ ] Changelog reviewed, breaking changes documented
- [ ] All tests passing, security scan clean
- [ ] Performance benchmarks acceptable
- [ ] Documentation and release notes ready

**Post-Release:**
- [ ] Monitoring dashboards reviewed
- [ ] Error rates within normal range
- [ ] User feedback collected
- [ ] Next release planning initiated
