---
name: swarm-advanced
description: "Implement advanced swarm orchestration patterns for research, development, testing, and analysis workflows using mesh, hierarchical, star, and ring topologies. Use when coordinating multi-agent distributed tasks or building complex parallel execution pipelines."
---

# Advanced Swarm Orchestration

Advanced swarm patterns for distributed research, development, testing, and analysis workflows using MCP tools and CLI commands.

## Quick Start

```bash
npm install -g claude-flow@alpha
claude mcp add claude-flow npx claude-flow@alpha mcp start
```

```javascript
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 6 })
mcp__claude-flow__agent_spawn({ type: "researcher", name: "Agent 1" })
mcp__claude-flow__task_orchestrate({ task: "...", strategy: "parallel" })
```

## Topology Selection Guide

| Topology | Communication | Best For |
|----------|--------------|----------|
| **Mesh** | Peer-to-peer | Research, analysis, brainstorming |
| **Hierarchical** | Coordinator + subordinates | Development, structured workflows |
| **Star** | Central coordinator | Testing, validation, QA |
| **Ring** | Sequential chain | Multi-stage pipelines |

## Pattern 1: Research Swarm

```javascript
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 6, strategy: "adaptive" })

// Spawn research team
["Web Researcher", "Academic Researcher", "Data Analyst", "Pattern Analyzer", "Report Writer"]
  .forEach(name => mcp__claude-flow__agent_spawn({ type: "researcher", name }))

// Phase 1: Parallel information gathering
mcp__claude-flow__parallel_execute({ tasks: [
  { id: "web-search", command: "search recent publications" },
  { id: "academic-search", command: "search academic databases" },
  { id: "data-collection", command: "gather relevant datasets" }
]})

// Phase 2: Analysis and validation
mcp__claude-flow__pattern_recognize({ data: researchData, patterns: ["trend", "correlation", "outlier"] })
mcp__claude-flow__quality_assess({ target: "research-sources", criteria: ["credibility", "relevance"] })

// Phase 3: Report generation
mcp__claude-flow__task_orchestrate({ task: "generate research report", strategy: "sequential" })
```

**CLI fallback:**
```bash
npx claude-flow swarm "research AI trends in 2025" --strategy research --max-agents 6 --parallel
```

## Pattern 2: Development Swarm

```javascript
mcp__claude-flow__swarm_init({ topology: "hierarchical", maxAgents: 8, strategy: "balanced" })

// Spawn development team
const devTeam = [
  { type: "architect", name: "System Architect", role: "coordinator" },
  { type: "coder", name: "Backend Developer" },
  { type: "coder", name: "Frontend Developer" },
  { type: "tester", name: "QA Engineer" },
  { type: "reviewer", name: "Code Reviewer" }
]

// Architecture → Parallel Implementation → Testing → Review → Deploy
mcp__claude-flow__parallel_execute({ tasks: [
  { id: "backend-api", command: "implement REST API", assignTo: "Backend Developer" },
  { id: "frontend-ui", command: "build UI components", assignTo: "Frontend Developer" },
  { id: "api-docs", command: "create API documentation", assignTo: "Technical Writer" }
]})
```

**CLI fallback:**
```bash
npx claude-flow swarm "build REST API with authentication" --strategy development --mode hierarchical
```

## Pattern 3: Testing Swarm

```javascript
mcp__claude-flow__swarm_init({ topology: "star", maxAgents: 7, strategy: "parallel" })

// Parallel test execution
mcp__claude-flow__parallel_execute({ tasks: [
  { id: "unit-tests", command: "npm run test:unit" },
  { id: "integration-tests", command: "npm run test:integration" },
  { id: "e2e-tests", command: "npm run test:e2e" },
  { id: "performance-tests", command: "npm run test:performance" },
  { id: "security-tests", command: "npm run test:security" }
]})

// Bottleneck analysis
mcp__claude-flow__bottleneck_analyze({ component: "application", metrics: ["response-time", "throughput", "memory"] })
```

## Pattern 4: Analysis Swarm

```javascript
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 5, strategy: "adaptive" })

mcp__claude-flow__parallel_execute({ tasks: [
  { id: "analyze-code", command: "analyze codebase structure and quality" },
  { id: "analyze-security", command: "scan for security vulnerabilities" },
  { id: "analyze-performance", command: "identify performance bottlenecks" },
  { id: "analyze-architecture", command: "assess architectural patterns" }
]})
```

## Error Handling & Fault Tolerance

```javascript
mcp__claude-flow__daa_fault_tolerance({ agentId: "all", strategy: "auto-recovery" })

try {
  await mcp__claude-flow__task_orchestrate({ task: "complex operation", strategy: "parallel" })
} catch (error) {
  const status = await mcp__claude-flow__swarm_status({})
  await mcp__claude-flow__error_analysis({ logs: [error.message] })
  if (status.healthy) {
    await mcp__claude-flow__task_orchestrate({ task: "retry", strategy: "sequential" })
  }
}
```

## Memory & State Management

```javascript
// Cross-session persistence
mcp__claude-flow__memory_persist({ sessionId: "swarm-session-001" })
mcp__claude-flow__state_snapshot({ name: "development-checkpoint-1" })
mcp__claude-flow__context_restore({ snapshotId: "development-checkpoint-1" })
```

## Workflow Automation

```javascript
mcp__claude-flow__workflow_create({
  name: "full-stack-development",
  steps: [
    { phase: "design", agents: ["architect"] },
    { phase: "implement", agents: ["backend-dev", "frontend-dev"], parallel: true },
    { phase: "test", agents: ["tester", "security-tester"], parallel: true },
    { phase: "review", agents: ["reviewer"] },
    { phase: "deploy", agents: ["devops"] }
  ],
  triggers: ["on-commit", "scheduled-daily"]
})
```

## Performance Optimization

```javascript
mcp__claude-flow__topology_optimize({ swarmId: "current-swarm" })
mcp__claude-flow__load_balance({ swarmId: "development-swarm", tasks: taskQueue })
mcp__claude-flow__swarm_scale({ swarmId: "development-swarm", targetSize: 12 })
```

## Monitoring

```javascript
mcp__claude-flow__swarm_monitor({ swarmId: "active-swarm", interval: 3000 })
mcp__claude-flow__health_check({ components: ["swarm", "agents", "neural", "memory"] })
mcp__claude-flow__trend_analysis({ metric: "agent-performance", period: "7d" })
```

## Best Practices

1. **Topology**: Mesh for research, hierarchical for dev, star for testing, ring for pipelines
2. **Agent Specialization**: Specific capabilities per agent, avoid overlapping responsibilities
3. **Parallel Execution**: Identify independent tasks, use sequential for dependent ones
4. **Memory Management**: Use namespaces, set TTLs, create regular backups
5. **Error Recovery**: Implement fault tolerance, use auto-recovery, analyze error patterns

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Agents not coordinating | Check topology, verify memory, enable monitoring |
| Parallel execution failing | Verify dependencies, check resource limits, add error handling |
| Memory persistence broken | Verify namespaces, check TTL, ensure backup config |
| Performance degradation | Optimize topology, reduce agent count, analyze bottlenecks |
