---
name: github-workflow-automation
description: "Automate GitHub Actions with AI swarm coordination for intelligent CI/CD pipelines, self-healing workflows, progressive deployment, and security scanning. Generate optimal workflows, analyze failures, and optimize costs. Use when creating CI/CD pipelines, debugging workflow failures, or optimizing GitHub Actions."
---

# GitHub Workflow Automation

Comprehensive GitHub Actions automation with AI swarm coordination for intelligent CI/CD pipelines, workflow orchestration, and repository management.

## Quick Start

```bash
# Generate optimal workflow for your codebase
npx ruv-swarm actions generate-workflow --analyze-codebase --detect-languages --create-optimal-pipeline

# Optimize existing workflow
npx ruv-swarm actions optimize --workflow ".github/workflows/ci.yml" --suggest-parallelization

# Analyze failed runs
gh run view <run-id> --json jobs,conclusion | npx ruv-swarm actions analyze-failure --suggest-fixes
```

## Workflow Templates

### Intelligent CI with Swarms
```yaml
name: Intelligent CI
on: [push, pull_request]
jobs:
  swarm-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npx ruv-swarm actions analyze --commit ${{ github.sha }} --suggest-tests --optimize-pipeline
```

### PR Validation Swarm
```yaml
name: PR Validation
on: pull_request
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - run: |
          PR_DATA=$(gh pr view ${{ github.event.pull_request.number }} --json files,labels)
          RESULTS=$(npx ruv-swarm actions pr-validate \
            --spawn-agents "linter,tester,security,docs" --parallel --pr-data "$PR_DATA")
          gh pr comment ${{ github.event.pull_request.number }} --body "$RESULTS"
```

### Self-Healing Pipeline
```yaml
name: Self-Healing Pipeline
on: workflow_run
jobs:
  heal:
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    runs-on: ubuntu-latest
    steps:
      - run: npx ruv-swarm actions self-heal --run-id ${{ github.event.workflow_run.id }} --auto-fix-common
```

### Progressive Deployment
```yaml
name: Smart Deployment
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - id: risk
        run: npx ruv-swarm actions deploy-risk --changes ${{ github.sha }} --history 30d
      - run: npx ruv-swarm actions deploy-strategy --risk ${{ steps.risk.outputs.level }} --auto-execute
```

### Security Scanning
```yaml
name: Security Scan
on:
  schedule: [{ cron: '0 0 * * *' }]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - run: |
          ISSUES=$(npx ruv-swarm actions security --deep-scan --format json)
          echo "$ISSUES" | jq -r '.issues[]' | while read -r issue; do
            gh issue create --title "$(echo $issue | jq -r '.title')" --label "security,critical"
          done
```

## GitHub Integration Modes

| Mode | Description | Best For |
|------|-------------|----------|
| `gh-coordinator` | Workflow orchestration | Multi-repo coordination |
| `pr-manager` | PR management | Automated review |
| `ci-orchestrator` | CI/CD pipeline | Parallel test execution |
| `security-guardian` | Security management | Vulnerability scanning |
| `release-manager` | Release coordination | Multi-stage deployment |
| `code-reviewer` | Code quality | Deep review + security |

## MCP-Based Coordination

```javascript
mcp__claude-flow__swarm_init { topology: "hierarchical", maxAgents: 8 }
mcp__claude-flow__agent_spawn { type: "coordinator", name: "GitHub Coordinator" }
mcp__claude-flow__agent_spawn { type: "reviewer", name: "Code Reviewer" }
mcp__claude-flow__agent_spawn { type: "tester", name: "QA Agent" }
mcp__claude-flow__task_orchestrate { task: "Complete PR review and merge", strategy: "parallel" }
```

## Analytics & Optimization

```bash
# Workflow performance analytics
npx ruv-swarm actions analytics --workflow "ci.yml" --period 30d --identify-bottlenecks

# Cost optimization
npx ruv-swarm actions cost-optimize --analyze-usage --suggest-caching --recommend-self-hosted

# Failure pattern analysis
npx ruv-swarm actions failure-patterns --period 90d --classify-failures --suggest-preventions
```

## Smart Test Selection

```yaml
- name: Select relevant tests
  run: npx ruv-swarm actions smart-test --changed-files ${{ steps.files.outputs.all }} --impact-analysis --parallel-safe
```

## Best Practices

### Caching
```yaml
- uses: actions/cache@v3
  with:
    path: ~/.npm
    key: ${{ runner.os }}-swarm-${{ hashFiles('**/package-lock.json') }}
```

### Security
```yaml
permissions:
  contents: read
  pull-requests: write
  issues: write
```

### Performance
```yaml
jobs:
  swarm-task:
    timeout-minutes: 30
    strategy:
      matrix:
        include:
          - { runner: ubuntu-latest, task: test }
          - { runner: ubuntu-latest, task: lint }
          - { runner: ubuntu-latest, task: security }
      max-parallel: 3
```

## Debugging

```bash
npx ruv-swarm actions debug --verbose --trace-agents --export-logs
npx ruv-swarm actions profile --workflow "ci.yml" --identify-slow-steps
gh run download <run-id> && npx ruv-swarm actions analyze-logs --directory ./logs
```

## Setup Verification

```bash
gh auth status || gh auth login
mkdir -p .github/workflows
npx ruv-swarm actions generate-workflow --analyze-codebase > .github/workflows/ci.yml
```
