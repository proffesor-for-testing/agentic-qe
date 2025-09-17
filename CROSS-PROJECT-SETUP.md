# Using QE MCP Server Across Different Projects

## Overview

The QE MCP server can analyze ANY project on your Mac, not just the agentic-qe project. Here's how to set it up for cross-project usage.

## Setup Instructions

### Step 1: Configure Claude Code Globally

Add the QE MCP server to your Claude Code configuration:

```bash
claude mcp add qe-framework "cd /Users/profa/coding/agentic-qe && npm run mcp"
```

This makes the QE agents available in ALL your Claude Code sessions.

### Step 2: Using QE Agents in Other Projects

When you're working in a different project (e.g., `/Users/profa/coding/my-other-project`), you can call QE agents with the specific project path:

```javascript
// In Claude Code, while working on ANY project:
qe_risk_oracle({
  task: "Analyze this e-commerce application for security risks",
  projectPath: "/Users/profa/coding/my-ecommerce-app",
  analysisDepth: "deep"
})

qe_test_architect({
  task: "Design test strategy for the payment module",
  projectPath: "/Users/profa/coding/my-payment-service",
  analysisDepth: "deep"
})
```

### Step 3: Alternative - Current Project Analysis

If you don't specify `projectPath`, the MCP server analyzes the current working directory:

```javascript
// This will analyze wherever the MCP server was started from
qe_analyze_project({
  objective: "Complete quality assessment"
})
```

## Multiple VS Code Instances Setup

### Option A: Single MCP Server (Recommended)

1. **Start MCP server once** in the agentic-qe directory:
   ```bash
   cd /Users/profa/coding/agentic-qe
   npm run mcp:start
   ```

2. **Use from any VS Code instance** with Claude Code:
   - VS Code Instance 1 (Project A): Call `qe_risk_oracle({ projectPath: "/path/to/projectA" })`
   - VS Code Instance 2 (Project B): Call `qe_risk_oracle({ projectPath: "/path/to/projectB" })`
   - VS Code Instance 3 (Project C): Call `qe_risk_oracle({ projectPath: "/path/to/projectC" })`

### Option B: Project-Specific Configuration

For each project, create a `.claude/mcp-config.json`:

```json
{
  "mcpServers": {
    "qe-framework": {
      "command": "cd /Users/profa/coding/agentic-qe && npm run mcp",
      "env": {
        "DEFAULT_PROJECT_PATH": "/Users/profa/coding/current-project"
      }
    }
  }
}
```

## Examples for Different Project Types

### React Application
```javascript
qe_swarm({
  objective: "Test React component library",
  projectPath: "/Users/profa/coding/react-components",
  strategy: "comprehensive"
})
```

### Node.js API
```javascript
qe_security_sentinel({
  task: "Audit API endpoints for vulnerabilities",
  projectPath: "/Users/profa/coding/node-api",
  analysisDepth: "deep"
})
```

### Python ML Project
```javascript
qe_test_architect({
  task: "Design test strategy for ML pipeline",
  projectPath: "/Users/profa/coding/ml-project",
  includeTests: true
})
```

### Mobile App (React Native)
```javascript
qe_mobile_maestro({
  task: "Test mobile app navigation and state",
  projectPath: "/Users/profa/coding/mobile-app",
  analysisDepth: "deep"
})
```

## Advanced: Running MCP as a System Service

### Create a Launch Agent (macOS)

1. Create a plist file:
```bash
cat > ~/Library/LaunchAgents/com.qe.mcp-server.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.qe.mcp-server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/profa/coding/agentic-qe/mcp-server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/profa/coding/agentic-qe</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/tmp/qe-mcp-server.err</string>
    <key>StandardOutPath</key>
    <string>/tmp/qe-mcp-server.out</string>
</dict>
</plist>
EOF
```

2. Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.qe.mcp-server.plist
```

3. Now MCP server runs automatically and is always available!

## Quick Reference Card

### From Project A (React App)
```javascript
qe_risk_oracle({
  task: "Analyze authentication",
  projectPath: "/Users/profa/coding/project-a"
})
```

### From Project B (API Service)
```javascript
qe_test_architect({
  task: "Design API tests",
  projectPath: "/Users/profa/coding/project-b"
})
```

### From Project C (Data Pipeline)
```javascript
qe_chaos_engineer({
  task: "Test resilience",
  projectPath: "/Users/profa/coding/project-c"
})
```

## Benefits of Cross-Project Usage

1. **Consistent Testing**: Same QE agents across all projects
2. **Centralized Updates**: Update agents once, use everywhere
3. **Resource Efficient**: One MCP server for all projects
4. **Knowledge Transfer**: Agents learn patterns across projects
5. **Standardized Quality**: Uniform quality standards

## Troubleshooting

### MCP Server Not Available
```bash
# Check if running
ps aux | grep mcp-server

# Restart if needed
cd /Users/profa/coding/agentic-qe
npm run mcp:start
```

### Permission Issues
```bash
# Ensure read permissions for target project
chmod -R a+r /path/to/target/project
```

### Path Not Found
- Use absolute paths, not relative
- Verify path exists: `ls -la /path/to/project`

## Security Considerations

- MCP server has read access to specified directories
- Consider using read-only permissions for sensitive projects
- Audit agent actions in production codebases

---

With this setup, your QE agents become a system-wide testing and analysis service available to all your projects!