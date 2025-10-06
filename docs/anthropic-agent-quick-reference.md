# Anthropic Agent Systems - Quick Reference Guide

## 🚀 Quick Start Checklist

### 1. Agent Setup
```bash
# Create project agent
mkdir -p .claude/agents
cat > .claude/agents/my-agent.md << 'EOF'
---
name: my-agent
description: Focused agent description
tools: Read, Grep, Bash
model: inherit
---
System prompt with clear instructions...
EOF

# Use agent
claude "Use my-agent to analyze the codebase"
```

### 2. Hook Configuration
```bash
# Edit .claude/config.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$file_path\""
          }
        ]
      }
    ]
  }
}
```

### 3. MCP Server Setup
```bash
# Add MCP server
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Verify
claude mcp list
```

### 4. Headless Execution
```bash
# Run non-interactive
claude -p "Generate tests" --output-format json > result.json

# Resume session
SESSION=$(jq -r '.session_id' result.json)
claude -p "Add edge cases" --resume $SESSION
```

---

## 📋 Agent Design Patterns

### Pattern 1: Specialized Agents
```yaml
# .claude/agents/security-reviewer.md
---
name: security-reviewer
description: Security-focused code review specialist
tools: Read, Grep, Glob
---
You are a security expert. Focus on:
- Input validation vulnerabilities
- Authentication/authorization issues
- Data exposure risks
- Dependency vulnerabilities
```

### Pattern 2: Workflow Orchestration
```bash
# Use multiple agents in sequence
claude "Use code-analyzer to review architecture"
claude "Use security-reviewer to check vulnerabilities"
claude "Use performance-tester to benchmark critical paths"
```

### Pattern 3: Context-Aware Agents
```yaml
# .claude/agents/context-aware-tester.md
---
name: context-aware-tester
description: Test generator with context awareness
tools: Read, Write, Grep, Bash
---
Before generating tests:
1. Read existing test patterns
2. Check test coverage gaps
3. Review implementation details
4. Generate comprehensive test suites
```

---

## 🪝 Common Hook Recipes

### Auto-Formatting
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$file_path\" 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### Command Logging
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"$(date): $TOOL_INPUT\" >> ~/.claude/command-log.txt"
          }
        ]
      }
    ]
  }
}
```

### Quality Gates
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "npm run lint \"$file_path\" && npm run test"
          }
        ]
      }
    ]
  }
}
```

### Memory Persistence
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx claude-flow@alpha hooks post-edit --file \"$file_path\" --memory-key \"swarm/edits/$(basename $file_path)\""
          }
        ]
      }
    ]
  }
}
```

---

## 🔌 MCP Integration Patterns

### Database Integration
```json
{
  "mcpServers": {
    "postgres": {
      "transport": "stdio",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

### GitHub Integration
```json
{
  "mcpServers": {
    "github": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### Claude Flow Integration
```json
{
  "mcpServers": {
    "claude-flow": {
      "transport": "stdio",
      "command": "npx",
      "args": ["claude-flow@alpha", "mcp", "start"]
    }
  }
}
```

---

## 🧠 Context Engineering Tips

### Compaction Strategy
```javascript
// Hook for automatic compaction
{
  "hooks": {
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "extract-key-decisions.sh > context-summary.md"
          }
        ]
      }
    ]
  }
}
```

### Just-in-Time Context
```bash
# Only load what's needed
claude -p "Analyze these files: $(git diff --name-only | head -5)"

# Progressive context building
claude -p "Quick overview of architecture"
# Then drill down
claude -p "Detailed analysis of auth module" --resume $SESSION
```

### Structured Memory
```bash
# Store decisions in external memory
npx claude-flow@alpha hooks post-task --memory-key "decisions/auth-strategy" \
  --task-id "auth-implementation"

# Retrieve later
npx claude-flow@alpha hooks session-restore --session-id "auth-session"
```

---

## 🤖 Headless Automation Recipes

### CI/CD Test Generation
```yaml
# .github/workflows/auto-test.yml
name: Auto Test Generation
on: [pull_request]

jobs:
  generate-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Generate Tests
        run: |
          claude -p "Generate tests for changed files" \
            --allowedTools "Read,Write,Bash" \
            --output-format json > test-report.json

      - name: Commit Tests
        run: |
          git config user.name "Claude Bot"
          git add tests/
          git commit -m "Auto-generated tests" || true
          git push
```

### Incident Response Bot
```bash
#!/bin/bash
# incident-bot.sh

# Get incident details
INCIDENT=$(curl -s "https://api.pagerduty.com/incidents/$INCIDENT_ID")

# Analyze with Claude
ANALYSIS=$(claude -p "Analyze incident: $INCIDENT
  1. Identify root cause
  2. Suggest remediation
  3. Create runbook" \
  --allowedTools "Read,Bash" \
  --output-format json)

# Post to Slack
curl -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_TOKEN" \
  -d "text=$(echo $ANALYSIS | jq -r '.response')"
```

### Security Review Automation
```bash
#!/bin/bash
# security-review.sh

# Get changed files
FILES=$(git diff --name-only origin/main)

# Review each file
for FILE in $FILES; do
  claude -p "Security review for $FILE:
    - Check for SQL injection
    - Validate input handling
    - Review authentication
    - Check for secrets" \
    --agents security-reviewer \
    --output-format json >> security-report.json
done

# Generate summary
jq -s '[.[] | .response] | join("\n\n")' security-report.json > summary.md
```

---

## 📊 Performance Optimization

### Parallel Agent Execution
```bash
# Run multiple agents in parallel
(claude -p "Analyze backend" --agents backend-analyzer > backend.json) &
(claude -p "Analyze frontend" --agents frontend-analyzer > frontend.json) &
(claude -p "Analyze database" --agents db-analyzer > db.json) &
wait

# Merge results
jq -s '.' backend.json frontend.json db.json > full-analysis.json
```

### Context Window Management
```bash
# Compact before hitting limits
claude -p "Summarize previous conversation"
SESSION=$(claude -p "Continue with summary" --output-format json | jq -r '.session_id')

# Use summary for new context
claude -p "Using summary, implement feature X" --resume $SESSION
```

### Tool Limitation
```bash
# Restrict tools for focused tasks
claude -p "Analyze code structure" \
  --allowedTools "Read,Grep,Glob"  # No Write/Bash

# Full permissions only when needed
claude -p "Implement feature" \
  --allowedTools "Read,Write,Edit,Bash,Grep,Glob"
```

---

## 🛡️ Security Best Practices

### Hook Security
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "validate-command.sh \"$TOOL_INPUT\""
          }
        ]
      }
    ]
  }
}
```

### MCP Security
```json
{
  "mcpServers": {
    "secure-db": {
      "transport": "stdio",
      "command": "npx",
      "args": ["db-mcp"],
      "env": {
        "DB_URL": "${DB_URL}",  // Use env vars
        "READ_ONLY": "true"      // Limit permissions
      },
      "outputLimit": 10000      // Prevent context overflow
    }
  }
}
```

### Agent Tool Restriction
```yaml
# .claude/agents/readonly-analyzer.md
---
name: readonly-analyzer
description: Safe analysis agent with no write permissions
tools: Read, Grep, Glob  # No Write, Edit, or Bash
---
You can analyze code but cannot modify files or run commands.
```

---

## 🔍 Debugging & Monitoring

### Hook Debugging
```bash
# Enable hook logging
export CLAUDE_HOOKS_DEBUG=1

# Check hook execution
tail -f ~/.claude/hooks.log
```

### Session Inspection
```bash
# List active sessions
ls -la ~/.claude/sessions/

# Inspect session
cat ~/.claude/sessions/$SESSION_ID/context.json | jq
```

### MCP Server Health
```bash
# Check MCP server status
claude mcp list

# Test MCP server
npx claude-flow@alpha mcp test
```

---

## 📚 Common Workflows

### Full TDD Workflow
```bash
# 1. Initialize with architecture agent
claude "Use system-architect to design feature X"

# 2. Generate tests with QE agent
claude "Use qe-test-generator to create comprehensive tests for feature X"

# 3. Implement with coder agent
claude "Use coder to implement feature X to pass tests"

# 4. Review with security agent
claude "Use security-reviewer to audit implementation"

# 5. Optimize with performance agent
claude "Use performance-analyzer to optimize critical paths"
```

### Multi-Agent Code Review
```bash
# Sequential review
claude "Use code-analyzer for architecture review" > arch-review.md
claude "Use security-reviewer for security audit" > security-review.md
claude "Use performance-analyzer for performance review" > perf-review.md

# Parallel review (faster)
(claude "Use code-analyzer for architecture" > arch.md) &
(claude "Use security-reviewer for security" > security.md) &
(claude "Use performance-analyzer for performance" > perf.md) &
wait
```

### Automated Documentation
```bash
# Generate docs with hooks
cat > .claude/config.json << 'EOF'
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx typedoc --out docs \"$file_path\""
          }
        ]
      }
    ]
  }
}
EOF

# Write code, docs auto-generate
claude "Implement authentication module"
```

---

## 🎯 Troubleshooting

### Agent Not Found
```bash
# Check agent location
ls -la .claude/agents/
ls -la ~/.claude/agents/

# Verify agent config
cat .claude/agents/my-agent.md
```

### Hook Not Executing
```bash
# Check hook config
cat .claude/config.json | jq '.hooks'

# Test hook manually
bash -c "file_path=test.js; npx prettier --write \"$file_path\""
```

### MCP Connection Issues
```bash
# Check server status
claude mcp list

# Restart MCP server
claude mcp remove server-name
claude mcp add server-name npx server-command
```

### Context Overflow
```bash
# Compact conversation
claude -p "Summarize our conversation"

# Use smaller context
claude -p "Focus only on module X" --allowedTools "Read,Grep"
```

---

## 📖 Additional Resources

- [Full Synthesis Document](./anthropic-agent-research-synthesis.md)
- [Sub-agents Documentation](https://docs.claude.com/en/docs/claude-code/sub-agents)
- [Hooks Guide](https://docs.claude.com/en/docs/claude-code/hooks-guide)
- [MCP Integration](https://docs.claude.com/en/docs/claude-code/mcp)
- [Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

---

*Quick reference for building production-ready agent systems with Claude Code*
