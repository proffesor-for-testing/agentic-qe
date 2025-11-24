# Agentic QE Fleet - Usage Guide

## Getting Started

For comprehensive usage examples and workflows, please visit:
https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/reference/usage.md

## Quick Commands

```bash
# Initialize the fleet
aqe init

# Generate tests
aqe test generate src/

# Analyze coverage
aqe coverage analyze

# Check learning status
aqe learn status

# List learned patterns
aqe patterns list
```

## MCP Server Integration

```bash
# Add MCP server to Claude Code
claude mcp add agentic-qe npx aqe-mcp

# Verify connection
claude mcp list
```

For more details, see the online documentation.
