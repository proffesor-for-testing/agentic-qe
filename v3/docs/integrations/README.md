# AQE v3 Integrations

This directory contains integration guides for external tools and services used by AQE v3 agents.

## Available Integrations

### 1. Vibium MCP Server

Browser automation and UI testing capabilities for AQE v3 agents.

**Files:**
- `vibium-setup.md` - Complete installation and configuration guide
- `vibium-agent-usage.md` - How to use Vibium in AQE agents

**Quick Start:**
```bash
# Vibium is automatically configured in .claude/mcp.json
# Verify configuration
cat /workspaces/agentic-qe/.claude/mcp.json | jq '.mcpServers.vibium'
```

**Key Features:**
- Visual regression testing
- Accessibility auditing (WCAG compliance)
- End-to-end test automation
- Performance metrics collection
- Mobile device emulation
- Network throttling simulation

**Agent Domains:**
- `visual-testing` - Visual regression specialists
- `accessibility-testing` - WCAG compliance auditors
- `e2e-testing` - User workflow automation

## MCP Server Configuration

All MCP servers are configured in `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "agentic-qe-v3": { /* ... */ },
    "agentic-qe": { /* ... */ },
    "claude-flow": { /* ... */ },
    "ruv-swarm": { /* ... */ },
    "vibium": {
      "command": "npx",
      "args": ["-y", "vibium"],
      "env": {
        "NODE_NO_WARNINGS": "1",
        "VIBIUM_HEADLESS": "false"
      }
    }
  }
}
```

## Quick Reference: Integration Tasks

### Using Vibium

**1. Setup (One-time)**
```bash
# Verify Vibium is in MCP configuration
cat /workspaces/agentic-qe/.claude/mcp.json | grep -A 5 '"vibium"'

# Restart Claude Code to load Vibium
```

**2. Spawn Visual Testing Agent**
```javascript
const visualAgent = await agentic_qe__agent_spawn({
  domain: 'visual-testing',
  type: 'specialist'
});
```

**3. Run Visual Regression Test**
```javascript
const result = await vibiumClient.visualRegression({
  baseline: 'home-page-desktop',
  url: 'https://app.example.com',
  threshold: 0.99
});
```

**4. Store Results**
```javascript
await agentic_qe__memory_store({
  key: 'visual-test-result-' + timestamp,
  namespace: 'visual-testing',
  value: result
});
```

## Configuration Environments

### Development
- **Headless**: `false` (visible browser)
- **Debug**: `true`
- **Timeout**: `60000ms`

### Production/CI
- **Headless**: `true` (no UI)
- **Debug**: `false`
- **Timeout**: `30000ms`
- **Memory**: `NODE_OPTIONS=--max-old-space-size=4096`

## Integration Checklist

For each integration, ensure:

- [ ] Configuration added to `.claude/mcp.json`
- [ ] Documentation created in this directory
- [ ] Environment variables documented
- [ ] Error handling examples provided
- [ ] CI/CD configuration examples included
- [ ] Troubleshooting section complete
- [ ] Performance tuning guidance provided
- [ ] Security considerations documented

## Troubleshooting Guide

### Vibium Server Not Starting

```bash
# Check if Vibium can be called
npx -y vibium --version

# Clear cache and retry
npm cache clean --force
npx -y vibium@latest
```

### Chrome Not Found

```bash
# Install Chrome
npx @vibium/cli install-chrome
```

### Port Conflicts

Vibium auto-assigns ports if needed. Specify explicitly if required:

```json
{
  "vibium": {
    "env": {
      "VIBIUM_PORT": "9999"
    }
  }
}
```

### Memory Issues in CI/CD

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run test:visual
```

## Adding New Integrations

1. Create new markdown files in this directory
2. Add MCP server configuration to `.claude/mcp.json`
3. Document environment variables and setup
4. Include troubleshooting section
5. Add examples for AQE agent integration
6. Update this README with new integration

## MCP Protocol Resources

- **Official Docs**: https://modelcontextprotocol.io/
- **MCP Spec**: https://spec.modelcontextprotocol.io/
- **Implementation Guide**: https://github.com/modelcontextprotocol/specification

## Performance Benchmarks

### Vibium (Visual Testing)

| Operation | Time | Memory |
|-----------|------|--------|
| Baseline capture | 2-3s | 150MB |
| Visual comparison | 1-2s | 200MB |
| Accessibility audit | 3-5s | 250MB |
| E2E scenario (10 steps) | 10-15s | 300MB |

### Parallel Execution (5 agents)

| Operation | Total Time | Memory |
|-----------|-----------|---------|
| Visual tests | 3-4s | 750MB |
| Accessibility audits | 5-6s | 1.2GB |
| E2E scenarios | 12-15s | 1.5GB |

## Contributing

To improve integrations:

1. Test thoroughly in your environment
2. Document any custom configurations
3. Report issues with reproduction steps
4. Share performance metrics
5. Suggest enhancements

## Support

For issues:

1. Check the integration-specific troubleshooting guide
2. Review MCP protocol documentation
3. Check GitHub issues
4. File a new issue with reproduction steps

## Related Documentation

- `../reference/aqe-fleet.md` - AQE v3 fleet configuration
- `../reference/claude-flow.md` - Claude Flow integration
- `../policies/` - Operational policies
