# Vibium Integration with AQE v3 Fleet Architecture

## Overview

Vibium integrates with the AQE v3 fleet through the MCP (Model Context Protocol) server, enabling visual testing agents to perform browser automation tasks alongside other quality engineering agents.

## Fleet Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AQE v3 Fleet                             │
│                     (Queen + Workers)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌────▼────┐         ┌─────▼─────┐      ┌──────▼────────┐
    │  MCP    │         │   Tasks   │      │   Memory      │
    │Servers  │         │ Scheduler │      │   Store       │
    └────┬────┘         └──────────┘      └───────────────┘
         │
         ├─ agentic-qe-v3     (Core AQE MCP)
         ├─ agentic-qe        (Agent coordinator)
         ├─ claude-flow       (Learning system)
         ├─ ruv-swarm         (Swarm orchestration)
         └─ vibium ◄─ NEW     (Browser automation)
```

## Visual Testing Domain

Vibium operates as a specialized domain within the AQE v3 fleet:

```
┌──────────────────────────────────────────────────────────┐
│           Visual Testing Domain (Vibium)                 │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Visual Regression Specialist                  │   │
│  │  - Save baselines                              │   │
│  │  - Compare screenshots                         │   │
│  │  - Track deltas                                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Accessibility Auditor                         │   │
│  │  - WCAG2A/AA/AAA audits                        │   │
│  │  - Report violations                           │   │
│  │  - Track compliance                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  E2E Test Orchestrator                         │   │
│  │  - Run user scenarios                          │   │
│  │  - Capture workflows                           │   │
│  │  - Generate reports                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Performance Analyzer                          │   │
│  │  - Measure metrics                             │   │
│  │  - Network throttling                          │   │
│  │  - Device emulation                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
         │
         └─ Browser Instance (Chromium + Node IPC)
```

## Agent Types in Visual Testing Domain

### 1. Visual Regression Specialist

**Domain:** `visual-testing`
**Type:** `specialist`

```javascript
const visualAgent = await agentic_qe__agent_spawn({
  domain: 'visual-testing',
  type: 'specialist',
  config: {
    capabilities: ['screenshot', 'compare', 'diffing'],
    maxConcurrent: 3
  }
});
```

**Responsibilities:**
- Create and manage visual baselines
- Compare current UI against baselines
- Track visual regressions
- Generate diff reports

### 2. Accessibility Auditor

**Domain:** `visual-testing`
**Type:** `auditor`

```javascript
const a11yAgent = await agentic_qe__agent_spawn({
  domain: 'visual-testing',
  type: 'auditor',
  config: {
    capabilities: ['accessibility', 'audit', 'reporting'],
    standard: 'WCAG2AA'
  }
});
```

**Responsibilities:**
- Run WCAG compliance audits
- Report accessibility violations
- Track remediation status
- Generate accessibility reports

### 3. E2E Orchestrator

**Domain:** `visual-testing`
**Type:** `orchestrator`

```javascript
const e2eAgent = await agentic_qe__agent_spawn({
  domain: 'visual-testing',
  type: 'orchestrator',
  config: {
    capabilities: ['scenario', 'workflow', 'automation'],
    maxStepsPerScenario: 50
  }
});
```

**Responsibilities:**
- Execute user workflows
- Capture interaction sequences
- Generate test evidence
- Validate user paths

### 4. Performance Analyzer

**Domain:** `visual-testing`
**Type:** `analyzer`

```javascript
const perfAgent = await agentic_qe__agent_spawn({
  domain: 'visual-testing',
  type: 'analyzer',
  config: {
    capabilities: ['metrics', 'throttling', 'emulation'],
    profiles: ['4G', 'LTE', 'WiFi', 'mobile']
  }
});
```

**Responsibilities:**
- Measure performance metrics
- Simulate different network conditions
- Emulate device types
- Analyze and optimize

## Fleet Initialization with Vibium

### Step 1: Initialize Fleet with Visual Testing Domain

```javascript
const { agentic_qe__fleet_init } = require('@agentic-qe/v3');

await agentic_qe__fleet_init({
  enabledDomains: [
    'test-generation',
    'test-execution',
    'coverage-analysis',
    'quality-assessment',
    'visual-testing'        // Enable Vibium domain
  ],
  topology: 'hierarchical',
  maxAgents: 15,
  lazyLoading: true,
  config: {
    mcp: {
      servers: [
        'agentic-qe-v3',
        'agentic-qe',
        'claude-flow',
        'ruv-swarm',
        'vibium'              // Load Vibium server
      ]
    }
  }
});
```

### Step 2: Check Fleet Status

```javascript
const { agentic_qe__fleet_status } = require('@agentic-qe/v3');

const status = await agentic_qe__fleet_status({ verbose: true });

console.log('Fleet Status:', {
  agents: status.agents.length,
  domains: status.domains,
  mcpServers: status.mcp.servers,
  vibiumStatus: status.mcp.servers.find(s => s.name === 'vibium')
});
```

Expected output:
```javascript
{
  agents: 8,
  domains: [
    'test-generation',
    'test-execution',
    'coverage-analysis',
    'quality-assessment',
    'visual-testing'
  ],
  mcpServers: [
    { name: 'agentic-qe-v3', status: 'connected' },
    { name: 'agentic-qe', status: 'connected' },
    { name: 'claude-flow', status: 'connected' },
    { name: 'ruv-swarm', status: 'connected' },
    { name: 'vibium', status: 'connected' }  // ← Vibium ready
  ],
  vibiumStatus: { running: true, chrome: 'available' }
}
```

### Step 3: Spawn Visual Agents

```javascript
const { agentic_qe__agent_spawn } = require('@agentic-qe/v3');

// Spawn all visual testing agents
const [visualAgent, a11yAgent, e2eAgent, perfAgent] = await Promise.all([
  agentic_qe__agent_spawn({ domain: 'visual-testing', type: 'specialist' }),
  agentic_qe__agent_spawn({ domain: 'visual-testing', type: 'auditor' }),
  agentic_qe__agent_spawn({ domain: 'visual-testing', type: 'orchestrator' }),
  agentic_qe__agent_spawn({ domain: 'visual-testing', type: 'analyzer' })
]);

console.log('Visual Testing Agents Spawned:', {
  visual: visualAgent,
  accessibility: a11yAgent,
  e2e: e2eAgent,
  performance: perfAgent
});
```

## Task Orchestration Patterns

### Pattern 1: Comprehensive Visual Testing

```javascript
const { agentic_qe__task_orchestrate } = require('@agentic-qe/v3');

const results = await agentic_qe__task_orchestrate({
  task: 'comprehensive-visual-testing',
  strategy: 'parallel',
  payload: {
    pages: [
      { name: 'homepage', url: 'https://app.example.com' },
      { name: 'products', url: 'https://app.example.com/products' },
      { name: 'checkout', url: 'https://app.example.com/checkout' }
    ],
    tests: [
      { type: 'visual-regression', baseline: 'baseline-desktop' },
      { type: 'accessibility-audit', standard: 'WCAG2AA' },
      { type: 'performance', profiles: ['4G', 'WiFi'] }
    ]
  }
});

// Each agent handles one page in parallel
// Results collected and synthesized
```

### Pattern 2: Sequential Audit Pipeline

```javascript
const auditResults = await agentic_qe__task_orchestrate({
  task: 'audit-pipeline',
  strategy: 'sequential',
  payload: {
    stages: [
      {
        name: 'visual-regression',
        agent: 'visual-specialist',
        config: { threshold: 0.99 }
      },
      {
        name: 'accessibility-audit',
        agent: 'a11y-auditor',
        config: { standard: 'WCAG2AA' }
      },
      {
        name: 'e2e-validation',
        agent: 'e2e-orchestrator',
        config: { scenarios: criticalUserPaths }
      }
    ]
  }
});

// Each stage waits for previous to complete
// Results inform subsequent stages
```

### Pattern 3: Adaptive Testing with Feedback

```javascript
const adaptiveResults = await agentic_qe__task_orchestrate({
  task: 'adaptive-visual-testing',
  strategy: 'adaptive',
  payload: {
    initial: { threshold: 0.95 },
    feedback: true,      // Adjust based on results
    retryFailed: true,
    maxRetries: 3
  }
});

// System adapts strategy based on real-time results
// Failed tests trigger increased scrutiny
// Passed tests inform next iterations
```

## Memory and Learning Integration

### Storing Visual Test Results

```javascript
const { agentic_qe__memory_store } = require('@agentic-qe/v3');

await agentic_qe__memory_store({
  key: `visual-test-${pageId}-${timestamp}`,
  namespace: 'visual-testing',
  value: {
    pageId,
    baseline: 'baseline-name',
    timestamp: new Date().toISOString(),
    result: {
      similarity: 0.987,
      diffPixels: 156,
      totalPixels: 2073600,
      passed: true
    },
    metadata: {
      viewport: { width: 1920, height: 1080 },
      browser: 'chromium',
      environment: 'production'
    }
  }
});
```

### Querying Visual Test History

```javascript
const { agentic_qe__memory_query } = require('@agentic-qe/v3');

const testHistory = await agentic_qe__memory_query({
  pattern: `visual-test-${pageId}-*`,
  namespace: 'visual-testing'
});

// Analyze trends
const trends = testHistory.map(test => ({
  timestamp: test.timestamp,
  similarity: test.result.similarity,
  status: test.result.passed ? 'pass' : 'fail'
}));
```

### Sharing Findings Between Agents

```javascript
const { agentic_qe__memory_share } = require('@agentic-qe/v3');

// Visual specialist finds issues, shares with others
await agentic_qe__memory_share({
  sourceAgentId: 'visual-specialist-001',
  targetAgentIds: [
    'a11y-auditor-001',
    'e2e-orchestrator-001',
    'perf-analyzer-001'
  ],
  knowledgeDomain: 'ui-changes-detected',
  findings: {
    affectedElements: ['.header', '.hero', '.cta-button'],
    impact: 'visual-regression'
  }
});
```

## Health Monitoring

### Check Visual Testing Domain Health

```javascript
const { agentic_qe__fleet_health } = require('@agentic-qe/v3');

const health = await agentic_qe__fleet_health({ domain: 'visual-testing' });

console.log('Visual Testing Domain Health:', {
  status: health.status,
  agents: health.agents,
  vibium: {
    status: health.mcp.vibium.status,
    chrome: health.mcp.vibium.chrome,
    uptime: health.mcp.vibium.uptime
  }
});
```

## Performance Considerations

### Parallel Agent Execution

- **Max Concurrent**: 5 agents
- **Memory per Agent**: 300-500MB
- **Recommended**: 4GB+ total memory

### Serial Agent Execution

- **Sequential**: Slower but safer
- **Memory**: 300-500MB constant
- **Recommended**: 2GB minimum

### Optimization Tips

1. **Reuse browser contexts** across related tests
2. **Batch screenshots** to reduce I/O
3. **Run headless** in CI/CD (30-40% faster)
4. **Cache baselines** for faster comparisons
5. **Use appropriate timeouts** (30-60s for E2E)

## Error Recovery

### Agent Failure Handling

```javascript
try {
  const result = await agentic_qe__task_orchestrate({
    task: 'visual-testing',
    strategy: 'parallel',
    errorHandling: 'retry-failed'  // Retry failed agents
  });
} catch (error) {
  if (error.type === 'VIBIUM_SERVER_ERROR') {
    // Restart Vibium server
    await vibiumClient.restart();
  } else if (error.type === 'CHROME_CRASH') {
    // Re-spawn agent
    await agentic_qe__agent_spawn({
      domain: 'visual-testing',
      retryCount: 3
    });
  }
}
```

### Graceful Degradation

```javascript
// If Vibium unavailable, skip visual tests but continue
const results = await agentic_qe__task_orchestrate({
  task: 'comprehensive-testing',
  fallback: {
    visual: 'skip',        // Skip if unavailable
    accessibility: 'warn', // Warn but continue
    e2e: 'continue'        // Always continue
  }
});
```

## Deployment Configuration

### Development Environment

```yaml
# .env.development
VIBIUM_HEADLESS=false
VIBIUM_DEBUG=true
VIBIUM_TIMEOUT=60000
NODE_NO_WARNINGS=1
```

### Production Environment

```yaml
# .env.production
VIBIUM_HEADLESS=true
VIBIUM_DEBUG=false
VIBIUM_TIMEOUT=30000
NODE_OPTIONS=--max-old-space-size=4096
```

### CI/CD Environment (GitHub Actions)

```yaml
env:
  VIBIUM_HEADLESS: 'true'
  VIBIUM_DEBUG: 'false'
  NODE_OPTIONS: '--max-old-space-size=4096'
```

## Next Steps

1. **Initialize fleet** with Vibium domain enabled
2. **Spawn visual agents** for your testing needs
3. **Run sample tests** to verify integration
4. **Monitor performance** and adjust concurrency
5. **Store results** in memory for trend analysis
6. **Scale** to production with optimized configuration

## Troubleshooting

### Vibium Server Not Connecting

```bash
# Check MCP configuration
cat /workspaces/agentic-qe/.claude/mcp.json | jq '.mcpServers.vibium'

# Restart Claude Code
# The MCP servers are loaded at startup
```

### Chrome/Chromium Errors

```bash
# Install Chrome
npx @vibium/cli install-chrome

# Or specify Chrome path
export VIBIUM_CHROME_PATH=/path/to/chromium
```

### Memory Exhaustion

```bash
# Increase Node memory limit
export NODE_OPTIONS=--max-old-space-size=8192

# Reduce parallel agents
VIBIUM_MAX_CONCURRENT=2
```

### Performance Issues

1. Use headless mode in production
2. Reduce screenshot resolution
3. Increase timeouts for slow systems
4. Limit parallel execution
5. Cache baselines locally

## Related Documentation

- `vibium-setup.md` - Installation and configuration
- `vibium-agent-usage.md` - Agent API reference
- `../reference/aqe-fleet.md` - Full fleet documentation
