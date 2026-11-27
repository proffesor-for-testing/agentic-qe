---
name: project-board-sync
description: Synchronize AI swarms with GitHub Projects for visual task management, progress tracking, and team coordination
type: coordination
color: "#A8E6CF"
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - LS
  - TodoWrite
  - mcp__claude-flow__swarm_init
  - mcp__claude-flow__agent_spawn
  - mcp__claude-flow__task_orchestrate
  - mcp__claude-flow__swarm_status
  - mcp__claude-flow__memory_usage
  - mcp__claude-flow__github_repo_analyze
  - mcp__claude-flow__github_pr_manage
  - mcp__claude-flow__github_issue_track
  - mcp__claude-flow__github_metrics
  - mcp__claude-flow__workflow_create
  - mcp__claude-flow__workflow_execute
hooks:
  pre:
    - "gh auth status || (echo 'GitHub CLI not authenticated' && exit 1)"
    - "gh project list --owner @me --limit 1 >/dev/null || echo 'No projects accessible'"
    - "git status --porcelain || echo 'Not in git repository'"
    - "gh api user | jq -r '.login' || echo 'API access check'"
  post:
    - "gh project list --owner @me --limit 3 | head -5"
    - "gh issue list --limit 3 --json number,title,state"
    - "git branch --show-current || echo 'Not on a branch'"
    - "gh repo view --json name,description"
---

# Project Board Sync - GitHub Projects Integration

## Overview
Synchronize AI swarms with GitHub Projects for visual task management, progress tracking, and team coordination.

## Core Features

### 1. Board Initialization
```bash
# Connect swarm to GitHub Project using gh CLI
# Get project details
PROJECT_ID=$(gh project list --owner @me --format json | \
  jq -r '.projects[] | select(.title == "Development Board") | .id')

# Initialize swarm with project
npx ruflo@3.76.0 github board-init \
  --project-id "$PROJECT_ID" \
  --sync-mode "bidirectional" \
  --create-views "swarm-status,agent-workload,priority"

# Create project fields for swarm tracking
gh project field-create $PROJECT_ID --owner @me \
  --name "Swarm Status" \
  --data-type "SINGLE_SELECT" \
  --single-select-options "pending,in_progress,completed"
```

### 2. Task Synchronization
```bash
# Sync swarm tasks with project cards
npx ruflo@3.76.0 github board-sync \
  --map-status '{
    "todo": "To Do",
    "in_progress": "In Progress",
    "review": "Review",
    "done": "Done"
  }' \
  --auto-move-cards \
  --update-metadata
```

### 3. Real-time Updates
```bash
# Enable real-time board updates
npx ruflo@3.76.0 github board-realtime \
  --webhook-endpoint "https://api.example.com/github-sync" \
  --update-frequency "immediate" \
  --batch-updates false
```

## Configuration

### Board Mapping Configuration
```yaml
# .github/board-sync.yml
version: 1
project:
  name: "AI Development Board"
  number: 1
  
mapping:
  # Map swarm task status to board columns
  status:
    pending: "Backlog"
    assigned: "Ready"
    in_progress: "In Progress"
    review: "Review"
    completed: "Done"
    blocked: "Blocked"
    
  # Map agent types to labels
  agents:
    coder: "🔧 Development"
    tester: "🧪 Testing"
    analyst: "📊 Analysis"
    designer: "🎨 Design"
    architect: "🏗️ Architecture"
    
  # Map priority to project fields
  priority:
    critical: "🔴 Critical"
    high: "🟡 High"
    medium: "🟢 Medium"
    low: "⚪ Low"
    
  # Custom fields
  fields:
    - name: "Agent Count"
      type: number
      source: task.agents.length
    - name: "Complexity"
      type: select
      source: task.complexity
    - name: "ETA"
      type: date
      source: task.estimatedCompletion
```

### View Configuration
```javascript
// Custom board views
{
  "views": [
    {
      "name": "Swarm Overview",
      "type": "board",
      "groupBy": "status",
      "filters": ["is:open"],
      "sort": "priority:desc"
    },
    {
      "name": "Agent Workload",
      "type": "table",
      "groupBy": "assignedAgent",
      "columns": ["title", "status", "priority", "eta"],
      "sort": "eta:asc"
    },
    {
      "name": "Sprint Progress",
      "type": "roadmap",
      "dateField": "eta",
      "groupBy": "milestone"
    }
  ]
}
```

## Automation Features

### 1. Auto-Assignment
```bash
# Automatically assign cards to agents
npx ruflo@3.76.0 github board-auto-assign \
  --strategy "load-balanced" \
  --consider "expertise,workload,availability" \
  --update-cards
```

### 2. Progress Tracking
```bash
# Track and visualize progress
npx ruflo@3.76.0 github board-progress \
  --show "burndown,velocity,cycle-time" \
  --time-period "sprint" \
  --export-metrics
```

### 3. Smart Card Movement
```bash
# Intelligent card state transitions
npx ruflo@3.76.0 github board-smart-move \
  --rules '{
    "auto-progress": "when:all-subtasks-done",
    "auto-review": "when:tests-pass",
    "auto-done": "when:pr-merged"
  }'
```

## Board Commands

### Create Cards from Issues
```bash
# Convert issues to project cards using gh CLI
# List issues with label
ISSUES=$(gh issue list --label "enhancement" --json number,title,body)

# Add issues to project
echo "$ISSUES" | jq -r '.[].number' | while read -r issue; do
  gh project item-add $PROJECT_ID --owner @me --url "https://github.com/$GITHUB_REPOSITORY/issues/$issue"
done

# Process with swarm
npx ruflo@3.76.0 github board-import-issues \
  --issues "$ISSUES" \
  --add-to-column "Backlog" \
  --parse-checklist \
  --assign-agents
```

### Bulk Operations
```bash
# Bulk card operations
npx ruflo@3.76.0 github board-bulk \
  --filter "status:blocked" \
  --action "add-label:needs-attention" \
  --notify-assignees
```

### Card Templates
```bash
# Create cards from templates
npx ruflo@3.76.0 github board-template \
  --template "feature-development" \
  --variables '{
    "feature": "User Authentication",
    "priority": "high",
    "agents": ["architect", "coder", "tester"]
  }' \
  --create-subtasks
```

## Advanced Synchronization

### 1. Multi-Board Sync
```bash
# Sync across multiple boards
npx ruflo@3.76.0 github multi-board-sync \
  --boards "Development,QA,Release" \
  --sync-rules '{
    "Development->QA": "when:ready-for-test",
    "QA->Release": "when:tests-pass"
  }'
```

### 2. Cross-Organization Sync
```bash
# Sync boards across organizations
npx ruflo@3.76.0 github cross-org-sync \
  --source "org1/Project-A" \
  --target "org2/Project-B" \
  --field-mapping "custom" \
  --conflict-resolution "source-wins"
```

### 3. External Tool Integration
```bash
# Sync with external tools
npx ruflo@3.76.0 github board-integrate \
  --tool "jira" \
  --mapping "bidirectional" \
  --sync-frequency "5m" \
  --transform-rules "custom"
```

## Visualization & Reporting

### Board Analytics
```bash
# Generate board analytics using gh CLI data
# Fetch project data
PROJECT_DATA=$(gh project item-list $PROJECT_ID --owner @me --format json)

# Get issue metrics
ISSUE_METRICS=$(echo "$PROJECT_DATA" | jq -r '.items[] | select(.content.type == "Issue")' | \
  while read -r item; do
    ISSUE_NUM=$(echo "$item" | jq -r '.content.number')
    gh issue view $ISSUE_NUM --json createdAt,closedAt,labels,assignees
  done)

# Generate analytics with swarm
npx ruflo@3.76.0 github board-analytics \
  --project-data "$PROJECT_DATA" \
  --issue-metrics "$ISSUE_METRICS" \
  --metrics "throughput,cycle-time,wip" \
  --group-by "agent,priority,type" \
  --time-range "30d" \
  --export "dashboard"
```

### Custom Dashboards
```javascript
// Dashboard configuration
{
  "dashboard": {
    "widgets": [
      {
        "type": "chart",
        "title": "Task Completion Rate",
        "data": "completed-per-day",
        "visualization": "line"
      },
      {
        "type": "gauge",
        "title": "Sprint Progress",
        "data": "sprint-completion",
        "target": 100
      },
      {
        "type": "heatmap",
        "title": "Agent Activity",
        "data": "agent-tasks-per-day"
      }
    ]
  }
}
```

### Reports
```bash
# Generate reports
npx ruflo@3.76.0 github board-report \
  --type "sprint-summary" \
  --format "markdown" \
  --include "velocity,burndown,blockers" \
  --distribute "slack,email"
```

## Workflow Integration

### Sprint Management
```bash
# Manage sprints with swarms
npx ruflo@3.76.0 github sprint-manage \
  --sprint "Sprint 23" \
  --auto-populate \
  --capacity-planning \
  --track-velocity
```

### Milestone Tracking
```bash
# Track milestone progress
npx ruflo@3.76.0 github milestone-track \
  --milestone "v2.0 Release" \
  --update-board \
  --show-dependencies \
  --predict-completion
```

### Release Planning
```bash
# Plan releases using board data
npx ruflo@3.76.0 github release-plan-board \
  --analyze-velocity \
  --estimate-completion \
  --identify-risks \
  --optimize-scope
```

## Team Collaboration

### Work Distribution
```bash
# Distribute work among team
npx ruflo@3.76.0 github board-distribute \
  --strategy "skills-based" \
  --balance-workload \
  --respect-preferences \
  --notify-assignments
```

### Standup Automation
```bash
# Generate standup reports
npx ruflo@3.76.0 github standup-report \
  --team "frontend" \
  --include "yesterday,today,blockers" \
  --format "slack" \
  --schedule "daily-9am"
```

### Review Coordination
```bash
# Coordinate reviews via board
npx ruflo@3.76.0 github review-coordinate \
  --board "Code Review" \
  --assign-reviewers \
  --track-feedback \
  --ensure-coverage
```

## Best Practices

### 1. Board Organization
- Clear column definitions
- Consistent labeling system
- Regular board grooming
- Automation rules

### 2. Data Integrity
- Bidirectional sync validation
- Conflict resolution strategies
- Audit trails
- Regular backups

### 3. Team Adoption
- Training materials
- Clear workflows
- Regular reviews
- Feedback loops

## Troubleshooting

### Sync Issues
```bash
# Diagnose sync problems
npx ruflo@3.76.0 github board-diagnose \
  --check "permissions,webhooks,rate-limits" \
  --test-sync \
  --show-conflicts
```

### Performance
```bash
# Optimize board performance
npx ruflo@3.76.0 github board-optimize \
  --analyze-size \
  --archive-completed \
  --index-fields \
  --cache-views
```

### Data Recovery
```bash
# Recover board data
npx ruflo@3.76.0 github board-recover \
  --backup-id "2024-01-15" \
  --restore-cards \
  --preserve-current \
  --merge-conflicts
```

## Examples

### Agile Development Board
```bash
# Setup agile board
npx ruflo@3.76.0 github agile-board \
  --methodology "scrum" \
  --sprint-length "2w" \
  --ceremonies "planning,review,retro" \
  --metrics "velocity,burndown"
```

### Kanban Flow Board
```bash
# Setup kanban board
npx ruflo@3.76.0 github kanban-board \
  --wip-limits '{
    "In Progress": 5,
    "Review": 3
  }' \
  --cycle-time-tracking \
  --continuous-flow
```

### Research Project Board
```bash
# Setup research board
npx ruflo@3.76.0 github research-board \
  --phases "ideation,research,experiment,analysis,publish" \
  --track-citations \
  --collaborate-external
```

## Metrics & KPIs

### Performance Metrics
```bash
# Track board performance
npx ruflo@3.76.0 github board-kpis \
  --metrics '[
    "average-cycle-time",
    "throughput-per-sprint",
    "blocked-time-percentage",
    "first-time-pass-rate"
  ]' \
  --dashboard-url
```

### Team Metrics
```bash
# Track team performance
npx ruflo@3.76.0 github team-metrics \
  --board "Development" \
  --per-member \
  --include "velocity,quality,collaboration" \
  --anonymous-option
```

See also: [swarm-issue.md](./swarm-issue.md), [multi-repo-swarm.md](./multi-repo-swarm.md)