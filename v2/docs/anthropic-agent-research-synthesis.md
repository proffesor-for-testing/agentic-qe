# Anthropic Agent Systems: Comprehensive Research Synthesis

## Executive Summary

This document synthesizes key findings from Anthropic's official documentation on building effective agent systems with Claude Code. It covers sub-agent patterns, hooks system, headless automation, MCP integration, and context engineering strategies.

---

## 1. Agent Design Principles

### 1.1 Core Philosophy
- **Context as Finite Resource**: Treat context windows as precious with diminishing marginal returns
- **Minimal High-Signal Tokens**: Use the smallest possible set of high-signal tokens to maximize desired outcomes
- **Single Responsibility**: Each agent should have one focused expertise area
- **Do the Simplest Thing That Works**: Avoid over-engineering

### 1.2 Sub-Agent Architecture Patterns

#### Characteristics
- **Separate Context Windows**: Each sub-agent maintains independent context
- **Specialized Expertise**: Focused on specific domains (debugging, code review, testing, etc.)
- **Tool-Limited**: Only grant necessary tool permissions
- **Configurable Models**: Can use different models per agent

#### Implementation Structure
```yaml
---
name: agent-name
description: Clear, focused description of agent's expertise
tools: Read, Grep, Glob, Bash  # Minimal necessary tools
model: inherit  # or specific model
---
System prompt with detailed instructions and expertise focus...
```

#### Storage Locations
- **Project-Level**: `.claude/agents/` - Team-shared, version controlled
- **User-Level**: `~/.claude/agents/` - Personal cross-project agents

#### Invocation Methods
1. **Automatic Delegation**: Claude routes based on task description
2. **Explicit Request**: "Use the [agent-name] subagent"
3. **CLI Flag**: `--agents agent-name`

### 1.3 Agent Design Best Practices

✅ **DO:**
- Create focused, single-responsibility agents
- Write detailed system prompts at the "right altitude"
- Limit tool access to only necessary capabilities
- Version control project-level agents
- Use separate context windows for complex workflows
- Chain multiple agents for sophisticated tasks
- Create self-contained, robust, and clear tools

❌ **DON'T:**
- Create overly broad, multi-purpose agents
- Grant unnecessary tool permissions
- Use exhaustive examples instead of minimal diverse ones
- Assume larger context windows guarantee better performance
- Over-prescribe agent behavior

---

## 2. Hook System Best Practices

### 2.1 Hook System Overview

#### Available Hook Events
- `PreToolUse` - Before tool execution (can block/modify)
- `PostToolUse` - After tool execution
- `UserPromptSubmit` - When user submits input
- `Notification` - On notification events
- `Stop` - When main session stops
- `SubagentStop` - When sub-agent stops
- `PreCompact` - Before context compaction
- `SessionStart` - Session initialization
- `SessionEnd` - Session cleanup

#### Hook Characteristics
- User-defined shell commands
- Deterministic control over Claude behavior
- Automatic execution at lifecycle points
- Can block or modify tool calls

### 2.2 Hook Implementation Patterns

#### Basic Structure
```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolType",
        "hooks": [
          {
            "type": "command",
            "command": "shell_command_here"
          }
        ]
      }
    ]
  }
}
```

#### Common Use Cases

**1. Automatic Code Formatting**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
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

**2. Command Logging**
```bash
jq -r '"\(.tool_input.command) - \(.tool_input.description // "No description")"' >> ~/.claude/bash-command-log.txt
```

**3. File Protection**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "check-file-permissions.sh \"$file_path\""
          }
        ]
      }
    ]
  }
}
```

### 2.3 Hook Best Practices

✅ **DO:**
- Use matchers to target specific tools/events
- Keep hook commands simple and focused
- Validate and sanitize inputs
- Test hooks thoroughly before deployment
- Consider performance implications
- Log hook executions for debugging
- Handle errors gracefully

❌ **DON'T:**
- Run untrusted hook code
- Create hooks that cause excessive latency
- Ignore security implications (hooks run with current credentials)
- Forget that hooks can exfiltrate data

### 2.4 Security Considerations
- Hooks execute with current environment credentials
- Potential for data exfiltration
- Always review hook implementations before registration
- Validate inputs to prevent injection attacks

---

## 3. MCP Integration Patterns

### 3.1 MCP Architecture

#### Protocol Overview
- **Open-source standard** for AI-tool integrations
- Enables Claude Code to connect with external tools, databases, APIs
- Standardized approach to diverse tooling ecosystems

#### Connection Types
1. **Local stdio servers**: Direct process communication
2. **Remote SSE servers**: Server-Sent Events
3. **Remote HTTP servers**: Standard HTTP protocol

### 3.2 Integration Capabilities

- Query databases (PostgreSQL, MongoDB, etc.)
- Interact with issue trackers (GitHub, Jira)
- Analyze monitoring data (Sentry, DataDog)
- Automate workflows
- Access design and documentation systems

### 3.3 Configuration Scopes

1. **Local**: Project-specific, private configurations
2. **Project**: Shared team configurations (version controlled)
3. **User**: Cross-project personal configurations

### 3.4 MCP Best Practices

#### Server Setup
```bash
# Add MCP server
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

# Add local stdio server
claude mcp add my-tool npx my-tool-mcp
```

#### Configuration Management
```json
{
  "mcpServers": {
    "server-name": {
      "transport": "stdio|http|sse",
      "command": "command_to_run",
      "args": ["--arg1", "--arg2"],
      "env": {
        "API_KEY": "${ENV_VAR}"
      }
    }
  }
}
```

#### Unique Features
- **Dynamic Resource Referencing**: Use @ mentions to reference MCP resources
- **Slash Commands**: Expose server capabilities as slash commands
- **Environment Variables**: Support for variable expansion in config

#### Authentication & Security
- OAuth 2.0 support for remote servers
- Configurable output limits to prevent context overflow
- Enterprise-level configuration management

✅ **DO:**
- Use appropriate transport type for use case
- Configure output limits to manage context
- Leverage environment variables for secrets
- Version control project-level MCP configs
- Document server capabilities clearly

❌ **DON'T:**
- Hardcode credentials in configuration
- Ignore rate limits and quotas
- Expose unnecessary server capabilities
- Forget to handle authentication errors

---

## 4. Context Engineering Strategies

### 4.1 Core Principles

#### The Context Economy
- Context is a **finite resource with diminishing marginal returns**
- Goal: **Smallest possible set of high-signal tokens** that maximize desired outcomes
- LLMs have limited "attention budget" due to computational constraints
- **Quality > Quantity**: Context window size doesn't guarantee performance

### 4.2 Context Management Techniques

#### 1. Compaction
- **Purpose**: Summarize conversation history to maintain context within window limits
- **When**: Long-running sessions, repetitive tasks
- **How**: Progressive summarization of older messages
- **Trigger**: `PreCompact` hook for custom compaction logic

#### 2. Structured Note-Taking
- **Purpose**: Persist memory outside context window for long-horizon tasks
- **Implementation**: Use external storage (files, databases, MCP servers)
- **Pattern**: Write summaries, decisions, and state to persistent storage
- **Retrieval**: Load relevant context just-in-time

#### 3. Sub-Agent Architectures
- **Purpose**: Use specialized agents with clean context windows
- **Benefit**: Prevents context pollution across different task domains
- **Pattern**: Route tasks to appropriate sub-agents with focused context

### 4.3 System Prompt Engineering

#### Right Altitude Principle
- **Too High**: Vague, doesn't guide behavior effectively
- **Too Low**: Overly prescriptive, reduces adaptability
- **Just Right**: Specific enough to guide, flexible enough to adapt

#### Example Comparison
```markdown
❌ Too High: "You are a helpful assistant"
❌ Too Low: "Always use exactly 3 sentences. Never use passive voice. Always..."
✅ Just Right: "You are a code reviewer focused on security and performance.
   Provide actionable feedback with specific line references and suggested fixes."
```

### 4.4 Tool Design for Agents

#### Self-Contained Tools
- Complete functionality within single invocation
- Minimal dependencies on prior context
- Clear input/output contracts

#### Robust to Error
- Graceful degradation
- Informative error messages
- Recovery suggestions

#### Extremely Clear
- Descriptive names
- Comprehensive documentation
- Minimal, diverse examples over exhaustive edge cases

### 4.5 Context Optimization Patterns

#### Just-In-Time Context Retrieval
```python
# ❌ Load everything upfront
context = load_entire_codebase()

# ✅ Load only what's needed
def get_relevant_context(query):
    files = search_relevant_files(query, limit=5)
    return load_specific_files(files)
```

#### Progressive Context Building
```python
# Start minimal
initial_context = get_task_essentials()

# Add context as needed
if needs_more_detail:
    additional_context = fetch_detailed_info()

# Compact when approaching limits
if context_size > threshold:
    compact_context()
```

### 4.6 Emerging Trends
- More autonomous agents requiring less prescriptive engineering
- Shift from manual context management to intelligent context selection
- Tools that self-document and adapt to agent needs

---

## 5. Headless Automation Approaches

### 5.1 Headless Mode Overview

#### Purpose
- Run Claude Code programmatically without interactive UI
- Enable command-line scripting and automation
- Support CI/CD integration

#### Primary Interface
```bash
claude -p "Your prompt" \
  --allowedTools "Bash,Read" \
  --permission-mode acceptEdits
```

### 5.2 Configuration Options

| Option | Description | Example |
|--------|-------------|---------|
| `--print`, `-p` | Non-interactive mode | `-p "Generate tests"` |
| `--output-format` | Output format | `--output-format json` |
| `--resume`, `-r` | Resume session | `-r session-id` |
| `--allowedTools` | Tool permissions | `--allowedTools "Bash,Read"` |
| `--append-system-prompt` | Custom instructions | `--append-system-prompt "Focus on security"` |

### 5.3 Output Formats

#### 1. Text (Default)
```bash
claude -p "What is 2+2?"
# Output: The answer is 4.
```

#### 2. JSON
```bash
claude -p "What is 2+2?" --output-format json
# Output: {"response": "The answer is 4.", "session_id": "...", ...}
```

#### 3. Streaming JSON
```bash
claude -p "What is 2+2?" --output-format stream-json
# Output: Emits messages as they're received
```

### 5.4 Input Formats

#### Direct Text
```bash
claude -p "Generate tests for user.js"
```

#### Standard Input
```bash
echo "Generate tests" | claude -p -
```

#### Streaming JSON
```bash
cat streaming_input.jsonl | claude --input-format stream-json
```

### 5.5 Automation Use Cases

#### 1. SRE Incident Response Bot
```bash
#!/bin/bash
incident_details=$(fetch_incident_data)
claude -p "Analyze this incident: $incident_details" \
  --allowedTools "Bash,Read" \
  --output-format json > incident_report.json
```

#### 2. Automated Security Review
```bash
#!/bin/bash
for file in $(git diff --name-only origin/main); do
  claude -p "Review $file for security issues" \
    --allowedTools "Read,Grep" \
    --output-format json >> security_report.json
done
```

#### 3. Multi-turn Legal Assistant
```bash
#!/bin/bash
session_id=$(claude -p "Review contract.pdf" --output-format json | jq -r '.session_id')
claude -p "What are the liability clauses?" --resume $session_id
claude -p "Are there any concerning terms?" --resume $session_id
```

#### 4. CI/CD Integration
```bash
# .github/workflows/code-review.yml
- name: AI Code Review
  run: |
    claude -p "Review PR changes for quality and security" \
      --allowedTools "Bash,Read,Grep" \
      --output-format json > review.json

    # Parse and comment on PR
    gh pr comment $PR_NUMBER --body-file review.json
```

### 5.6 Best Practices

✅ **DO:**
- Use JSON output for programmatic parsing
- Handle errors gracefully with try-catch
- Manage conversation sessions with `--resume`
- Implement timeouts for long-running tasks
- Respect rate limits and quotas
- Log all interactions for debugging
- Use appropriate permission modes

❌ **DON'T:**
- Run headless mode with unrestricted tools in untrusted environments
- Ignore error codes and status
- Forget to clean up session data
- Hardcode sensitive data in prompts
- Exceed context limits without compaction

### 5.7 Advanced Patterns

#### Session Management
```bash
# Start session
SESSION=$(claude -p "Initialize analysis" --output-format json | jq -r '.session_id')

# Continue session
claude -p "Next step" --resume $SESSION

# Clean up
rm -rf ~/.claude/sessions/$SESSION
```

#### Error Handling
```bash
if ! claude -p "$PROMPT" --output-format json > result.json 2> error.log; then
  echo "Claude execution failed"
  cat error.log
  exit 1
fi
```

#### Parallel Execution
```bash
# Process multiple files in parallel
for file in *.js; do
  (claude -p "Analyze $file" --output-format json > "${file}.analysis.json") &
done
wait
```

---

## 6. Integrated Workflow Patterns

### 6.1 Full-Stack Development with Agents

```bash
# Initialize MCP coordination
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Headless agent orchestration
claude -p "Create full-stack app with:
  - Sub-agent: backend-dev for Express API
  - Sub-agent: frontend-dev for React UI
  - Sub-agent: qe-tester for comprehensive tests

  Use hooks for auto-formatting
  Store decisions in MCP memory
  Generate final report" \
  --agents backend-dev,frontend-dev,qe-tester \
  --output-format json > build_report.json
```

### 6.2 Context-Aware Testing Pipeline

```bash
# Step 1: Compact context for long codebase
claude -p "Analyze codebase and create compact summary" > summary.md

# Step 2: Use summary for test generation
claude -p "Using this summary: $(cat summary.md)
  Generate comprehensive tests with qe-test-generator agent" \
  --agents qe-test-generator \
  --hooks post-edit-format

# Step 3: Execute tests with retry logic
claude -p "Execute tests with qe-test-executor agent" \
  --agents qe-test-executor
```

### 6.3 Continuous Quality with MCP + Hooks

```bash
# MCP server for quality metrics
claude mcp add quality-db npx quality-metrics-mcp

# Hook for automatic quality gate
# .claude/config.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "quality-gate-check.sh \"$file_path\""
          }
        ]
      }
    ]
  }
}

# Run with quality agent
claude -p "Implement feature with quality checks" \
  --agents qe-quality-gate
```

---

## 7. Key Takeaways

### For Agent Design
1. **Single Responsibility**: One agent, one expertise
2. **Minimal Context**: Smallest set of high-signal tokens
3. **Tool Limitation**: Only grant necessary permissions
4. **Separate Contexts**: Use sub-agents to prevent pollution

### For Hooks System
1. **Targeted Matchers**: Hook specific tools/events only
2. **Simple Commands**: Keep hook logic focused
3. **Security First**: Review all hooks before registration
4. **Performance Aware**: Avoid latency-inducing hooks

### For MCP Integration
1. **Appropriate Transport**: Choose right connection type
2. **Scope Management**: Use local/project/user scopes correctly
3. **Environment Variables**: Externalize secrets
4. **Documentation**: Clearly document server capabilities

### For Context Engineering
1. **Quality over Quantity**: Context size ≠ performance
2. **Just-in-Time Retrieval**: Load context when needed
3. **Progressive Compaction**: Summarize as you go
4. **Right Altitude**: System prompts that guide but don't restrict

### For Headless Automation
1. **JSON Output**: Use structured output for parsing
2. **Session Management**: Track and clean up sessions
3. **Error Handling**: Graceful degradation and recovery
4. **Tool Restrictions**: Limit tools in automated environments

---

## 8. Anti-Patterns to Avoid

### Agent Design
- ❌ Multi-purpose "do everything" agents
- ❌ Excessive tool permissions
- ❌ Overly prescriptive system prompts
- ❌ Sharing context across unrelated tasks

### Hook Implementation
- ❌ Running untrusted hook code
- ❌ Hooks that cause excessive latency
- ❌ Ignoring security implications
- ❌ No error handling in hooks

### MCP Integration
- ❌ Hardcoded credentials
- ❌ Unlimited output from MCP servers
- ❌ Exposing unnecessary capabilities
- ❌ No rate limiting

### Context Management
- ❌ Loading entire codebase upfront
- ❌ Assuming larger context = better results
- ❌ No compaction strategy
- ❌ Exhaustive examples instead of minimal diverse ones

### Headless Automation
- ❌ Unrestricted tools in untrusted environments
- ❌ No timeout handling
- ❌ Ignoring error codes
- ❌ Hardcoded secrets in prompts

---

## 9. References

1. [Sub-agents Documentation](https://docs.claude.com/en/docs/claude-code/sub-agents)
2. [Hooks Guide](https://docs.claude.com/en/docs/claude-code/hooks-guide)
3. [Headless Mode](https://docs.claude.com/en/docs/claude-code/headless)
4. [MCP Integration](https://docs.claude.com/en/docs/claude-code/mcp)
5. [Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

---

*This synthesis was created through analysis of official Anthropic documentation to provide comprehensive guidance on building effective agent systems with Claude Code.*
