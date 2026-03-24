---
name: github-code-review
description: "Deploy multi-agent AI code review with specialized security, performance, architecture, and style agents. Automate PR review workflows with quality gates and intelligent comment generation. Use when reviewing PRs, enforcing quality standards, or setting up automated code review pipelines."
---

# GitHub Code Review

AI-powered multi-agent code review deploying specialized agents for security, performance, architecture, and style analysis with automated PR management.

## Quick Start

```bash
# Initialize comprehensive review
PR_DATA=$(gh pr view 123 --json files,additions,deletions,title,body)
PR_DIFF=$(gh pr diff 123)

npx ruv-swarm github review-init \
  --pr 123 --pr-data "$PR_DATA" --diff "$PR_DIFF" \
  --agents "security,performance,style,architecture" \
  --depth comprehensive
```

## Specialized Review Agents

### Security Agent
```bash
CHANGED_FILES=$(gh pr view 123 --json files --jq '.files[].path')
SECURITY_RESULTS=$(npx ruv-swarm github review-security \
  --pr 123 --files "$CHANGED_FILES" \
  --check "owasp,cve,secrets,permissions" --suggest-fixes)

if echo "$SECURITY_RESULTS" | grep -q "critical"; then
  gh pr review 123 --request-changes --body "$SECURITY_RESULTS"
  gh pr edit 123 --add-label "security-review-required"
else
  gh pr comment 123 --body "$SECURITY_RESULTS"
fi
```

**Checks**: SQL injection, XSS, auth bypasses, cryptographic weaknesses, dependency vulnerabilities, secret exposure, CORS misconfigurations.

### Performance Agent
```bash
npx ruv-swarm github review-performance \
  --pr 123 --profile "cpu,memory,io" \
  --benchmark-against main --suggest-optimizations
```

**Analyzes**: Algorithm complexity, query efficiency, memory allocation, cache utilization, bundle size impact.

### Architecture Agent
```bash
npx ruv-swarm github review-architecture \
  --pr 123 --check "patterns,coupling,cohesion,solid" \
  --visualize-impact --suggest-refactoring
```

### Style Agent
```bash
npx ruv-swarm github review-style \
  --pr 123 --check "formatting,naming,docs,tests" \
  --auto-fix "formatting,imports,whitespace"
```

## Automated Review Workflow

```yaml
# .github/workflows/auto-review.yml
name: Automated Code Review
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  swarm-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with: { fetch-depth: 0 }
      - name: Run Review Swarm
        run: |
          PR_NUM=${{ github.event.pull_request.number }}
          REVIEW_OUTPUT=$(npx ruv-swarm github review-all \
            --pr $PR_NUM --agents "security,performance,style,architecture")
          echo "$REVIEW_OUTPUT" | gh pr review $PR_NUM --comment -F -
          if echo "$REVIEW_OUTPUT" | grep -q "approved"; then
            gh pr review $PR_NUM --approve
          elif echo "$REVIEW_OUTPUT" | grep -q "changes-requested"; then
            gh pr review $PR_NUM --request-changes -b "See review comments above"
          fi
```

## Quality Gates

```yaml
# .github/review-swarm.yml
review:
  required-agents: [security, performance, style]
  thresholds:
    security: block      # Block merge on security issues
    performance: warn    # Warn on performance issues
    style: suggest       # Suggest style improvements
  rules:
    security: [no-eval, no-hardcoded-secrets, proper-auth-checks, validate-input]
    performance: [no-n-plus-one, efficient-queries, proper-caching]
    architecture: [max-coupling: 5, min-cohesion: 0.7, avoid-circular-deps]
```

## PR Comment Commands

```markdown
/swarm review --agents security,performance
/swarm init mesh 6
/swarm spawn coder "Implement authentication"
/swarm status
```

## Intelligent Comment Generation

```bash
PR_DIFF=$(gh pr diff 123 --color never)
COMMENTS=$(npx ruv-swarm github review-comment \
  --pr 123 --diff "$PR_DIFF" --style "constructive" \
  --include-examples --suggest-fixes)

echo "$COMMENTS" | jq -c '.[]' | while read -r comment; do
  gh api --method POST /repos/:owner/:repo/pulls/123/comments \
    -f path="$(echo "$comment" | jq -r '.path')" \
    -f line="$(echo "$comment" | jq -r '.line')" \
    -f body="$(echo "$comment" | jq -r '.body')" \
    -f commit_id="$(gh pr view 123 --json headRefOid -q .headRefOid)"
done
```

## Custom Review Agents

```javascript
// custom-review-agent.js
class CustomReviewAgent {
  async review(pr) {
    const issues = [];
    if (/\/\/\s*TODO/gi.test(pr.diff)) {
      issues.push({ severity: 'warning', message: 'TODO in production code' });
    }
    if (/app\.(get|post|put|delete)\(['"]\/api\/(?!v\d+)/.test(pr.diff)) {
      issues.push({ severity: 'error', message: 'API endpoint missing versioning' });
    }
    return issues;
  }
}
```

```bash
npx ruv-swarm github register-agent --name "custom-reviewer" --file "./custom-review-agent.js"
```

## Label-Based Agent Assignment

```json
{
  "bug": ["debugger", "tester"],
  "feature": ["architect", "coder", "tester"],
  "refactor": ["analyst", "coder"],
  "performance": ["analyst", "optimizer"],
  "security": ["security", "authentication", "audit"]
}
```

## Advanced Features

```bash
# Context-aware reviews with related PR analysis
npx ruv-swarm github review-context --pr 123 \
  --load-related-prs --analyze-impact --check-breaking-changes

# Learn from past reviews
npx ruv-swarm github review-learn --analyze-past-reviews \
  --identify-patterns --reduce-false-positives

# Cross-PR batch analysis
npx ruv-swarm github review-batch --prs "123,124,125" \
  --check-consistency --verify-integration

# Review metrics
npx ruv-swarm github review-metrics --period 30d \
  --metrics "issues-found,false-positives,fix-rate,time-to-review"
```

## Troubleshooting

```bash
# Agents not spawning
npx ruv-swarm swarm-status && gh auth status

# Comments not posting
gh api rate_limit
npx ruv-swarm github review-comments --pr 123 --batch

# Review taking too long
npx ruv-swarm github review-init --pr 123 --incremental --parallel --cache-results
```
