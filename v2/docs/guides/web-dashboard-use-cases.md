# Web Dashboard Use Cases

## Overview

The Agentic QE Web Dashboard is a **browser-based monitoring and coordination interface** for the Edge Server. It is **NOT** designed to be a local code generator or agent launcher with filesystem access.

## Important Limitations

Due to browser security sandbox restrictions:

- **No local filesystem access** - Browsers cannot read/write files on the user's machine
- **No project context** - Cannot access user's local codebase
- **No direct tool execution** - Cannot run CLI tools, npm, git, etc.

For local code generation and QE agent execution, use the **CLI** (`aqe`) or **VS Code Extension**.

## Actual Use Cases

### 1. Pattern Sharing Network

Share and discover testing patterns across the community:

- **Share patterns**: Contribute successful test patterns from your projects
- **Discover patterns**: Find patterns others have shared for similar scenarios
- **Rate patterns**: Help surface the best patterns through community voting
- **Filter by framework**: Jest, Vitest, Playwright, Cypress patterns

### 2. CI/CD Integration Dashboard

Monitor QE agents running in CI/CD pipelines:

- **View pipeline status**: See which agents are running across your builds
- **Aggregate results**: Centralized view of test coverage, quality gates
- **Compare runs**: Track improvements or regressions over time
- **Alert configuration**: Set up notifications for quality threshold breaches

### 3. Agent Activity Monitoring

Real-time visualization of distributed QE agent activity:

- **Active agents**: See agents running across your organization
- **Task progress**: Monitor long-running analysis tasks
- **Resource usage**: Track compute utilization
- **Error tracking**: Identify failing agents and patterns

### 4. Team Collaboration

Coordinate QE efforts across teams:

- **Shared dashboards**: Team-wide visibility into quality metrics
- **Knowledge base**: Centralized testing documentation
- **Best practices**: Organization-specific guidelines

### 5. P2P Pattern Synchronization

Peer-to-peer sharing of QE patterns:

- **Direct peer connection**: Share patterns with specific team members
- **Room-based discovery**: Find peers working on similar projects
- **Offline-first**: Patterns cached locally for offline access

## What the Dashboard is NOT For

| Don't Use Dashboard For | Use This Instead |
|------------------------|------------------|
| Generating tests for local code | CLI: `aqe generate tests ./src` |
| Running QE agents on your project | CLI: `aqe spawn test-generator` |
| Code analysis with filesystem access | VS Code Extension |
| Executing MCP tools on local files | Claude Desktop with MCP |

## Architecture Comparison

### Current Implementation (Limited)

```
[Browser Dashboard] → [Edge Server] → [Signaling Server]
        ↓
   No filesystem access
   No local tool execution
   Limited to API calls only
```

### Recommended Architecture

```
[CLI / VS Code] → [Local QE Agents] → [Your Codebase]
        ↓
[Web Dashboard] ← [Metrics/Patterns only] ← [Edge Server]
```

The dashboard should receive **results and metrics** from local agents, not try to run agents itself.

## Ruv's Edge-Net Model (Reference)

The [ruvector/edge-net](https://github.com/ruvnet/ruvector) dashboard uses a **compute contribution** model:

- Users contribute CPU/GPU resources via WebAssembly
- Tasks are distributed across the network
- Contributors earn credits for compute provided
- Real cryptographic identity (PiKey)
- WASM-based task processing in browser sandbox

This model works because WASM can perform general compute tasks (ML inference, data processing) without needing filesystem access.

## Future Enhancements

Potential improvements based on Ruv's implementation:

1. **Compute Contribution Mode**: Let users contribute compute for shared analysis tasks
2. **Credit Economy**: Reward users for contributing resources
3. **WASM Test Execution**: Run portable test code in browser WASM sandbox
4. **Pattern Mining**: Distributed analysis of anonymized test patterns

## Getting Started

### For Monitoring (Current)

```bash
# Start Edge Server
npm run edge:start

# Open dashboard
open http://localhost:3000
```

### For Local QE Work

```bash
# Use CLI for actual QE work
aqe init
aqe spawn test-generator --context ./src
aqe coverage analyze ./src
```

## Summary

| Feature | Dashboard | CLI | VS Code |
|---------|-----------|-----|---------|
| Pattern browsing | ✅ | - | - |
| Agent monitoring | ✅ | - | - |
| CI/CD dashboard | ✅ | - | - |
| Test generation | ❌ | ✅ | ✅ |
| Code analysis | ❌ | ✅ | ✅ |
| Local file access | ❌ | ✅ | ✅ |
| MCP tool execution | ❌ | ✅ | ✅ |

**Bottom line**: Use the dashboard for monitoring and pattern sharing. Use CLI or VS Code for actual QE work on your code.
