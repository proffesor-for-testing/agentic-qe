---
name: github-project-management
description: "Manage GitHub projects with swarm-coordinated issue tracking, automated board sync, sprint planning, and progress analytics. Create issues, automate triage, sync boards, and generate standup reports. Use when managing project boards, triaging issues, or running sprint planning."
---

# GitHub Project Management

Comprehensive GitHub project management with AI swarm coordination for issue tracking, project board automation, and sprint planning.

## Quick Start

```bash
# Create coordinated issue
gh issue create --title "Feature: Advanced Auth" \
  --body "Implement OAuth2 with social login..." \
  --label "enhancement,swarm-ready"

# Initialize board sync
PROJECT_ID=$(gh project list --owner @me --format json | jq -r '.projects[0].id')
npx ruv-swarm github board-init --project-id "$PROJECT_ID" --sync-mode "bidirectional"
```

## Issue Management

### Create with Swarm Coordination
```javascript
mcp__claude-flow__swarm_init { topology: "star", maxAgents: 3 }
mcp__github__create_issue {
  owner: "org", repo: "repository",
  title: "Integration Review: Complete system integration",
  body: "## Objectives\n- [ ] Verify dependencies\n- [ ] Ensure API integration\n- [ ] Validate data alignment",
  labels: ["integration", "review"], assignees: ["username"]
}
```

### Batch Issue Creation
```bash
gh issue create --title "Feature: GitHub Integration" --label "feature,high-priority"
gh issue create --title "Bug: Merge conflicts" --label "bug,urgent"
gh issue create --title "Docs: Update integration guides" --label "documentation"
```

### Automated Triage
```bash
npx ruv-swarm github triage --unlabeled --analyze-content --suggest-labels --assign-priority
npx ruv-swarm github find-duplicates --threshold 0.8 --link-related --close-duplicates
```

### Task Decomposition
```bash
SUBTASKS=$(npx ruv-swarm github issue-decompose 456 --max-subtasks 10 --assign-priorities)
CHECKLIST=$(echo "$SUBTASKS" | jq -r '.tasks[] | "- [ ] " + .description')
gh issue edit 456 --body "$ISSUE_BODY\n\n## Subtasks\n$CHECKLIST"
```

## Project Board Automation

### Board Configuration
```yaml
# .github/board-sync.yml
mapping:
  status:
    pending: "Backlog"
    assigned: "Ready"
    in_progress: "In Progress"
    completed: "Done"
  priority:
    critical: "Critical"
    high: "High"
    medium: "Medium"
```

### Real-time Sync
```bash
npx ruv-swarm github board-sync \
  --map-status '{"todo":"To Do","in_progress":"In Progress","done":"Done"}' \
  --auto-move-cards --update-metadata
```

### Smart Card Management
```bash
# Auto-assign based on expertise and workload
npx ruv-swarm github board-auto-assign --strategy "load-balanced"

# Intelligent state transitions
npx ruv-swarm github board-smart-move \
  --rules '{"auto-progress":"when:all-subtasks-done","auto-done":"when:pr-merged"}'
```

## Sprint Planning

```bash
# Initialize sprint
npx ruv-swarm github sprint-manage --sprint "Sprint 23" \
  --auto-populate --capacity-planning --track-velocity

# Track milestone
npx ruv-swarm github milestone-track --milestone "v2.0 Release" \
  --update-board --predict-completion

# Kanban setup
npx ruv-swarm github kanban-board \
  --wip-limits '{"In Progress":5,"Review":3}' --cycle-time-tracking
```

## Progress Tracking

```bash
# Board analytics
npx ruv-swarm github board-analytics \
  --metrics "throughput,cycle-time,wip" --time-range "30d" --export "dashboard"

# Sprint reports
npx ruv-swarm github board-report --type "sprint-summary" \
  --include "velocity,burndown,blockers" --format "markdown"

# KPI tracking
npx ruv-swarm github board-kpis --metrics '[
  "average-cycle-time","throughput-per-sprint","blocked-time-percentage"
]'
```

## Automated Progress Updates

```bash
PROGRESS=$(npx ruv-swarm github issue-progress 456)
gh issue comment 456 --body "$(echo "$PROGRESS" | jq -r '"## Progress: \(.completion)%\n\(.completed | map("- Done: " + .) | join("\n"))"')"

if [[ $(echo "$PROGRESS" | jq -r '.completion') -eq 100 ]]; then
  gh issue edit 456 --add-label "ready-for-review" --remove-label "in-progress"
fi
```

## Stale Issue Management

```bash
STALE_ISSUES=$(gh issue list --state open --json number,updatedAt \
  --jq ".[] | select(.updatedAt < \"$(date -d '30 days ago' --iso-8601)\")")
echo "$STALE_ISSUES" | jq -r '.number' | while read -r num; do
  gh issue comment $num --body "Inactive for 30 days. Will close in 7 days without activity."
  gh issue edit $num --add-label "stale"
done
```

## Cross-Repository Coordination

```bash
npx ruv-swarm github cross-repo --issue "org/repo#456" --related "org/other-repo#123" --coordinate
npx ruv-swarm github epic-swarm --epic 123 --child-issues "456,457,458" --orchestrate
```

## Standup Automation

```bash
npx ruv-swarm github standup-report --team "frontend" \
  --include "yesterday,today,blockers" --format "slack"
```

## GitHub Actions Integration

```yaml
name: Issue Swarm Handler
on:
  issues:
    types: [opened, labeled]
jobs:
  swarm-process:
    runs-on: ubuntu-latest
    steps:
      - name: Process Issue
        run: |
          if [[ "${{ github.event.label.name }}" == "swarm-ready" ]]; then
            npx ruv-swarm github issue-init ${{ github.event.issue.number }}
          fi
```

## Troubleshooting

```bash
npx ruv-swarm github board-diagnose --check "permissions,webhooks,rate-limits"
npx ruv-swarm github board-optimize --archive-completed --index-fields --cache-views
```
