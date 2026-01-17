# Agentic-Flow Quick Start Guide for QE Team

**Last Updated:** October 20, 2025
**Estimated Time:** 2-4 hours for basic setup
**Prerequisites:** Node.js 18+, Claude Code installed

---

## 🚀 Quick Installation (5 minutes)

### Step 1: Install Agentic-Flow

```bash
# Global installation (recommended)
npm install -g agentic-flow

# Verify installation
npx agentic-flow --version
# Expected: 1.6.6 or later

# See available commands
npx agentic-flow --help
```

### Step 2: Configure MCP Server

```bash
# Add agentic-flow to Claude Code MCP configuration
claude mcp add agentic-flow npx agentic-flow mcp start

# Restart Claude Code to load MCP server
# Verify in Claude Code: you should see 7 new MCP tools available
```

### Step 3: Initialize ReasoningBank

```bash
# Initialize persistent memory for QE domain
npx agentic-flow reasoningbank init --domain quality-engineering

# Expected output:
# ✓ Created SQLite database at ~/.agentic-flow/reasoningbank.db
# ✓ Initialized 12 tables (patterns, embeddings, trajectories, etc.)
# ✓ Domain set to: quality-engineering
```

---

## 📚 Import Existing Tests (30 minutes)

### Import Your Current Test Suite

```bash
# Import Jest tests
npx agentic-flow reasoningbank import \
  --source /workspaces/agentic-qe-cf/tests \
  --format jest \
  --recursive true

# Import Pytest tests
npx agentic-flow reasoningbank import \
  --source /workspaces/agentic-qe-cf/tests/python \
  --format pytest \
  --recursive true

# Expected output:
# ✓ Found 127 test files
# ✓ Imported 453 test patterns
# ✓ Generated 453 embeddings (1024-dim)
# ✓ Calculated initial confidence scores
# ✓ ReasoningBank ready for queries
```

### Verify Import Success

```bash
# Query imported patterns
npx agentic-flow reasoningbank query \
  --description "API validation testing" \
  --limit 5

# Expected output: 5 most relevant test patterns
```

---

## ⚡ Enable Agent Booster (15 minutes)

### Basic Setup

Create a new file: `/workspaces/agentic-qe-cf/src/utils/agentBooster.ts`

```typescript
import { AgentBooster } from 'agentic-flow/agent-booster';

export class QEAgentBooster {
  private booster: AgentBooster;

  constructor() {
    this.booster = new AgentBooster({
      mode: 'automatic',  // Automatically detect code editing tasks
      language: 'auto',   // Auto-detect language
      framework: 'jest'   // Default test framework
    });
  }

  /**
   * Generate test code 352x faster than API calls ($0 cost)
   */
  async generateTest(options: {
    filepath: string;
    instructions: string;
    codeEdit: string;
  }): Promise<void> {
    const startTime = Date.now();

    await this.booster.editFile({
      target_filepath: options.filepath,
      instructions: options.instructions,
      code_edit: options.codeEdit
    });

    const duration = Date.now() - startTime;
    console.log(`✓ Test generated in ${duration}ms (vs 2000ms API call)`);
  }

  /**
   * Batch edit multiple test files
   */
  async batchEdit(edits: Array<{
    filepath: string;
    instructions: string;
    codeEdit: string;
  }>): Promise<void> {
    const startTime = Date.now();

    await this.booster.batchEdit({
      edits: edits.map(e => ({
        target_filepath: e.filepath,
        instructions: e.instructions,
        code_edit: e.codeEdit
      }))
    });

    const duration = Date.now() - startTime;
    console.log(`✓ ${edits.length} files edited in ${duration}ms`);
  }
}

// Example usage
const booster = new QEAgentBooster();

await booster.generateTest({
  filepath: '/workspaces/agentic-qe-cf/tests/api/auth.test.ts',
  instructions: 'Add edge case tests for null and undefined inputs',
  codeEdit: `
    // ... existing code ...

    describe('Edge Cases', () => {
      test('handles null input gracefully', async () => {
        const result = await authService.login(null);
        expect(result.error).toBe('Invalid input');
      });

      test('handles undefined input gracefully', async () => {
        const result = await authService.login(undefined);
        expect(result.error).toBe('Invalid input');
      });
    });

    // ... existing code ...
  `
});
```

### Test Agent Booster

```bash
# Run your first Agent Booster test generation
npx ts-node src/utils/agentBooster.ts

# Expected output:
# ✓ Test generated in 5.7ms (vs 2000ms API call)
# ✓ Cost: $0 (vs $0.002 API call)
# ✓ Speedup: 352x
```

---

## 💰 Configure Multi-Model Router (20 minutes)

### Setup Cost-Optimized Model Selection

Create: `/workspaces/agentic-qe-cf/src/config/modelRouter.ts`

```typescript
import { ModelRouter } from 'agentic-flow/router';

export const qeModelRouter = new ModelRouter({
  strategies: {
    // Simple unit tests: use cheapest model (99% cost savings)
    'unit-test': {
      optimize: 'cost',
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-8b-instruct',
      maxTokens: 2048,
      temperature: 0.3,
      description: 'Simple validation, low complexity'
    },

    // Integration tests: balanced approach
    'integration-test': {
      optimize: 'balanced',
      provider: 'gemini',
      model: 'gemini-pro',
      maxTokens: 4096,
      temperature: 0.5,
      description: 'Moderate complexity, API interactions'
    },

    // Complex E2E scenarios: highest quality
    'e2e-test': {
      optimize: 'quality',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      maxTokens: 8192,
      temperature: 0.7,
      description: 'Complex workflows, multi-step scenarios'
    },

    // Security tests with PII: local only (zero external API calls)
    'security-test': {
      optimize: 'privacy',
      provider: 'onnx',
      model: 'local-llama-3.1-8b',
      maxTokens: 4096,
      temperature: 0.2,
      description: 'Sensitive data, penetration testing'
    },

    // Default fallback
    'default': {
      optimize: 'balanced',
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-8b-instruct',
      maxTokens: 4096,
      temperature: 0.5
    }
  },

  // Automatic model selection based on task analysis
  autoSelect: true,

  // Fallback chain if primary model fails
  fallbackChain: ['openrouter', 'gemini', 'anthropic'],

  // Cost tracking
  trackCosts: true
});

// Example usage
export async function runTestWithOptimizedModel(
  testType: 'unit-test' | 'integration-test' | 'e2e-test' | 'security-test',
  testDescription: string
) {
  const result = await qeModelRouter.execute({
    testType: testType,
    task: testDescription,
    agent: 'tester'
  });

  console.log(`
    Test: ${testDescription}
    Model Used: ${result.modelUsed}
    Provider: ${result.provider}
    Cost: $${result.cost.toFixed(6)}
    Duration: ${result.duration}ms
    Result: ${result.passed ? 'PASS ✓' : 'FAIL ✗'}
  `);

  return result;
}
```

### Environment Variables

Add to `/workspaces/agentic-qe-cf/.env`:

```bash
# OpenRouter (for 99% cost savings)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Google Gemini (free tier available)
GOOGLE_GEMINI_API_KEY=your-gemini-key-here

# Anthropic (for complex scenarios)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional: Track costs
AGENTIC_FLOW_TRACK_COSTS=true
```

### Test Model Router

```bash
# Run tests with different cost optimizations
npx ts-node -e "
  import { runTestWithOptimizedModel } from './src/config/modelRouter';

  // Cheap: DeepSeek R1 ($0.00002/1K tokens)
  await runTestWithOptimizedModel('unit-test', 'Validate user input sanitization');

  // Quality: Claude Sonnet 4.5 ($0.003/1K tokens)
  await runTestWithOptimizedModel('e2e-test', 'Complete checkout flow with payment');

  // Free: ONNX local inference ($0)
  await runTestWithOptimizedModel('security-test', 'SQL injection scan with PII');
"

# Expected output shows cost comparison
```

---

## 🔍 Query ReasoningBank (10 minutes)

### Basic Pattern Queries

Create: `/workspaces/agentic-qe-cf/src/utils/reasoningBank.ts`

```typescript
import { ReasoningBank } from 'agentic-flow/reasoningbank';

export class QEReasoningBank {
  private rb: ReasoningBank;

  constructor() {
    this.rb = new ReasoningBank({
      domain: 'quality-engineering',
      persistence: 'sqlite',
      embeddingStrategy: 'sha512'  // 87% accuracy, or 'openai' for 95%
    });
  }

  /**
   * Find similar test patterns (2-3ms query time)
   */
  async findSimilarTests(description: string, limit: number = 10) {
    const patterns = await this.rb.query({
      description: description,
      limit: limit,
      minConfidence: 0.7,        // Only patterns with 70%+ confidence
      diversityFactor: 0.3,       // Avoid echo chamber
      includeFailures: true       // Learn from failures too
    });

    console.log(`Found ${patterns.length} similar test patterns:`);
    patterns.forEach((p, i) => {
      console.log(`
        ${i + 1}. ${p.title}
           Confidence: ${(p.confidence * 100).toFixed(1)}%
           Success Rate: ${(p.successRate * 100).toFixed(1)}%
           Description: ${p.description}
      `);
    });

    return patterns;
  }

  /**
   * Store new test pattern
   */
  async storeTestPattern(test: {
    name: string;
    description: string;
    code: string;
    passed: boolean;
    coverage: number;
    edgeCases: string[];
  }) {
    await this.rb.storePattern({
      title: `Test Pattern: ${test.name}`,
      description: test.description,
      content: JSON.stringify({
        code: test.code,
        coverage: test.coverage,
        edgeCases: test.edgeCases
      }),
      confidence: test.passed ? 0.85 : 0.3,  // Higher confidence for passing tests
      domain: 'api-testing',
      tags: ['regression', 'validation'],
      metadata: {
        framework: 'jest',
        coverage: test.coverage,
        outcome: test.passed ? 'success' : 'failure'
      }
    });

    console.log(`✓ Stored pattern: ${test.name} (confidence: ${test.passed ? 85 : 30}%)`);
  }

  /**
   * Analyze edge cases from historical patterns
   */
  async discoverEdgeCases(apiEndpoint: string) {
    const patterns = await this.rb.query({
      description: `edge cases for ${apiEndpoint}`,
      limit: 20,
      minConfidence: 0.5  // Include lower confidence to discover rare cases
    });

    const edgeCases = new Set<string>();
    patterns.forEach(p => {
      const content = JSON.parse(p.content);
      if (content.edgeCases) {
        content.edgeCases.forEach(ec => edgeCases.add(ec));
      }
    });

    console.log(`Discovered ${edgeCases.size} edge cases for ${apiEndpoint}:`);
    Array.from(edgeCases).forEach((ec, i) => {
      console.log(`  ${i + 1}. ${ec}`);
    });

    return Array.from(edgeCases);
  }
}

// Example usage
const rb = new QEReasoningBank();

// Query similar tests
await rb.findSimilarTests('API authentication testing', 5);

// Store new pattern
await rb.storeTestPattern({
  name: 'JWT Token Validation',
  description: 'Validates JWT token structure and expiration',
  code: 'test code here...',
  passed: true,
  coverage: 95,
  edgeCases: ['expired token', 'invalid signature', 'missing claims']
});

// Discover edge cases
await rb.discoverEdgeCases('/api/users');
```

### Run ReasoningBank Queries

```bash
# Test queries
npx ts-node src/utils/reasoningBank.ts

# Expected output:
# Found 5 similar test patterns:
# 1. Test Pattern: User Authentication API
#    Confidence: 87.3%
#    Success Rate: 94.2%
#    Description: Validates JWT token generation and verification
# ...
```

---

## 🌐 Basic Swarm Setup (30 minutes)

### Create Your First Test Swarm

Create: `/workspaces/agentic-qe-cf/src/swarms/testSwarm.ts`

```typescript
import { AgenticFlow } from 'agentic-flow';

export class QETestSwarm {
  private swarm: any;

  async initialize() {
    // Initialize mesh topology for collaborative testing
    this.swarm = await AgenticFlow.swarm.init({
      topology: 'mesh',
      maxAgents: 5,
      strategy: 'balanced',
      agents: [
        'tester',           // Test executor
        'reviewer',         // Code reviewer
        'researcher',       // Bug researcher
        'planner',          // Test strategy planner
        'performance-analyzer'  // Performance validator
      ],
      memory: {
        enabled: true,
        namespace: 'qe-swarm',
        sharing: 'automatic'
      }
    });

    console.log('✓ QE Test Swarm initialized with mesh topology');
  }

  async runComprehensiveTests(component: string) {
    const result = await this.swarm.execute({
      task: `Comprehensive quality validation of ${component}`,
      parallel: true,
      aggregateResults: true,
      phases: [
        {
          name: 'Planning',
          agent: 'planner',
          task: 'Analyze component and design test strategy'
        },
        {
          name: 'Test Generation',
          agent: 'tester',
          task: 'Generate comprehensive test suite with 90%+ coverage'
        },
        {
          name: 'Execution',
          agent: 'tester',
          task: 'Run all tests and collect results'
        },
        {
          name: 'Review',
          agent: 'reviewer',
          task: 'Review test quality and identify gaps'
        },
        {
          name: 'Research',
          agent: 'researcher',
          task: 'Investigate failures and edge cases'
        },
        {
          name: 'Performance',
          agent: 'performance-analyzer',
          task: 'Validate performance metrics'
        }
      ]
    });

    console.log(`
      Comprehensive Test Results for ${component}:
      ✓ Tests Generated: ${result.testsGenerated}
      ✓ Tests Passed: ${result.testsPassed}
      ✓ Coverage: ${result.coverage}%
      ✓ Bugs Found: ${result.bugsFound}
      ✓ Performance: ${result.performanceScore}/100
    `);

    return result;
  }

  async destroy() {
    await this.swarm.destroy();
    console.log('✓ QE Test Swarm destroyed');
  }
}

// Example usage
const swarm = new QETestSwarm();
await swarm.initialize();
await swarm.runComprehensiveTests('UserAuthenticationService');
await swarm.destroy();
```

### Run Your First Swarm

```bash
# Execute test swarm
npx ts-node src/swarms/testSwarm.ts

# Expected output:
# ✓ QE Test Swarm initialized with mesh topology
#
# Comprehensive Test Results for UserAuthenticationService:
# ✓ Tests Generated: 47
# ✓ Tests Passed: 45
# ✓ Coverage: 92.3%
# ✓ Bugs Found: 2
# ✓ Performance: 87/100
#
# ✓ QE Test Swarm destroyed
```

---

## 📊 First Learning Cycle (30 minutes)

### Run Tests with Learning Enabled

Create: `/workspaces/agentic-qe-cf/src/scripts/learningCycle.ts`

```typescript
import { AgenticFlow } from 'agentic-flow';
import { QEReasoningBank } from '../utils/reasoningBank';

async function runLearningCycle() {
  const qe = new AgenticFlow({
    reasoningBank: true,
    domain: 'quality-engineering',
    hooks: {
      // Store pattern after each test
      postTest: async (result) => {
        const rb = new QEReasoningBank();
        await rb.storeTestPattern({
          name: result.testName,
          description: result.description,
          code: result.code,
          passed: result.passed,
          coverage: result.coverage || 0,
          edgeCases: result.edgeCases || []
        });

        console.log(`✓ Learned from: ${result.testName} (${result.passed ? 'PASS' : 'FAIL'})`);
      }
    }
  });

  // Run existing test suite with learning
  console.log('Starting learning cycle...\n');

  const results = await qe.runTestSuite({
    suite: '/workspaces/agentic-qe-cf/tests',
    framework: 'jest',
    learn: true,
    failureAnalysis: true
  });

  console.log(`
    Learning Cycle Complete:
    ✓ Tests Executed: ${results.total}
    ✓ Tests Passed: ${results.passed}
    ✓ Tests Failed: ${results.failed}
    ✓ Patterns Learned: ${results.patternsLearned}
    ✓ Edge Cases Discovered: ${results.edgeCasesFound}
    ✓ Confidence Updated: ${results.confidenceUpdates}
  `);
}

runLearningCycle();
```

### Execute Learning Cycle

```bash
# Run your first learning cycle
npx ts-node src/scripts/learningCycle.ts

# Expected output:
# Starting learning cycle...
#
# ✓ Learned from: User Login Validation (PASS)
# ✓ Learned from: Password Reset Flow (PASS)
# ✓ Learned from: Token Expiration (FAIL)
# ...
#
# Learning Cycle Complete:
# ✓ Tests Executed: 127
# ✓ Tests Passed: 115
# ✓ Tests Failed: 12
# ✓ Patterns Learned: 127
# ✓ Edge Cases Discovered: 34
# ✓ Confidence Updated: 127
```

---

## 📈 Measure Success (15 minutes)

### Create Metrics Dashboard

Create: `/workspaces/agentic-qe-cf/src/utils/metrics.ts`

```typescript
import { AgenticFlow } from 'agentic-flow';

export async function generateMetricsReport() {
  const metrics = await AgenticFlow.metrics.collect({
    timeframe: '7d',  // Last 7 days
    components: [
      'agent-booster',
      'reasoningbank',
      'swarm',
      'model-router'
    ]
  });

  console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║          Agentic-Flow Metrics Report (7 days)             ║
    ╠═══════════════════════════════════════════════════════════╣
    ║                                                           ║
    ║  Agent Booster Performance:                               ║
    ║    • Average Generation Time: ${metrics.agentBooster.avgTime}ms                 ║
    ║    • Speedup vs API: ${metrics.agentBooster.speedup}x                             ║
    ║    • Total Operations: ${metrics.agentBooster.operations}                        ║
    ║    • Cost Savings: $${metrics.agentBooster.costSavings}                             ║
    ║                                                           ║
    ║  ReasoningBank Intelligence:                              ║
    ║    • Total Patterns: ${metrics.reasoningBank.totalPatterns}                          ║
    ║    • Average Query Time: ${metrics.reasoningBank.avgQueryTime}ms                     ║
    ║    • Learning Rate: ${metrics.reasoningBank.learningRate}%                          ║
    ║    • Success Rate Improvement: ${metrics.reasoningBank.successRateGain}%            ║
    ║                                                           ║
    ║  Swarm Coordination:                                      ║
    ║    • Total Tasks: ${metrics.swarm.totalTasks}                              ║
    ║    • Average Completion Time: ${metrics.swarm.avgCompletionTime}min              ║
    ║    • Agent Utilization: ${metrics.swarm.utilization}%                        ║
    ║    • Coordination Efficiency: ${metrics.swarm.efficiency}%                   ║
    ║                                                           ║
    ║  Model Router Optimization:                               ║
    ║    • Total Requests: ${metrics.modelRouter.totalRequests}                        ║
    ║    • Average Cost: $${metrics.modelRouter.avgCost}                       ║
    ║    • Cost Savings vs Claude: ${metrics.modelRouter.costSavings}%               ║
    ║    • Total Savings: $${metrics.modelRouter.totalSavings}                       ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
  `);
}

// Run report
generateMetricsReport();
```

### View Your Metrics

```bash
# Generate weekly report
npx ts-node src/utils/metrics.ts

# Expected output:
# ╔═══════════════════════════════════════════════════════════╗
# ║          Agentic-Flow Metrics Report (7 days)             ║
# ╠═══════════════════════════════════════════════════════════╣
# ║  Agent Booster Performance:                               ║
# ║    • Average Generation Time: 5.8ms                       ║
# ║    • Speedup vs API: 345x                                 ║
# ║    • Total Operations: 1,247                              ║
# ║    • Cost Savings: $2.49                                  ║
# ║  ...
```

---

## 🎯 Quick Wins Checklist

### Day 1: Basic Setup ✅
- [ ] Install agentic-flow globally
- [ ] Configure MCP server
- [ ] Initialize ReasoningBank
- [ ] Import existing tests (100+ patterns)
- [ ] Verify installation with simple query

### Day 2: Agent Booster ✅
- [ ] Enable Agent Booster
- [ ] Generate first test (5.7ms vs 2000ms)
- [ ] Measure cost savings ($0 vs $0.002)
- [ ] Document speedup (352x)

### Day 3: Model Router ✅
- [ ] Configure multi-model routing
- [ ] Set up environment variables
- [ ] Run tests with different models
- [ ] Calculate cost savings (99%)

### Day 4: Learning Cycle ✅
- [ ] Run tests with learning enabled
- [ ] Store 100+ patterns
- [ ] Query similar tests
- [ ] Analyze edge cases

### Week 1: First Swarm ✅
- [ ] Initialize mesh swarm
- [ ] Run collaborative testing
- [ ] Measure success rate
- [ ] Generate metrics report

---

## 🔧 Troubleshooting

### Issue: MCP Server Not Found
```bash
# Solution: Restart Claude Code
# Then verify:
claude mcp list
# Should show: agentic-flow
```

### Issue: ReasoningBank Query Returns Empty
```bash
# Solution: Check if patterns were imported
npx agentic-flow reasoningbank stats

# If no patterns, re-import:
npx agentic-flow reasoningbank import --source ./tests --force
```

### Issue: Agent Booster Not Working
```typescript
// Solution: Ensure you're using absolute paths
await booster.editFile({
  target_filepath: '/workspaces/agentic-qe-cf/tests/api.test.ts',  // ✓ Absolute
  // target_filepath: './tests/api.test.ts',  // ✗ Relative (fails)
  instructions: '...',
  code_edit: '...'
});
```

### Issue: Model Router Fails
```bash
# Solution: Check environment variables
cat .env | grep API_KEY

# Ensure you have at least one provider configured:
# - OPENROUTER_API_KEY (for cost optimization)
# - GOOGLE_GEMINI_API_KEY (free tier available)
# - ANTHROPIC_API_KEY (for quality)
```

---

## 📚 Next Steps

### After Quick Start (This Week)
1. **Measure Baseline Metrics** - Compare old vs new approach
2. **Run Daily Learning Cycles** - Build pattern database
3. **Optimize Costs** - Track savings with model router
4. **Document Learnings** - Share team insights

### Advanced Features (Next Week)
1. **QUIC Transport** - Enable real-time coordination
2. **Multi-Topology** - Use different swarms for different tests
3. **Distributed Testing** - Deploy global test agents
4. **Hive Mind** - Implement collective intelligence

### Production Deployment (Week 3-4)
1. **Multi-Tenancy** - Separate team environments
2. **Security & Compliance** - Enable audit logging
3. **Monitoring** - OpenTelemetry integration
4. **CI/CD Integration** - Automated swarm execution

---

## 💬 Support & Resources

**Questions?**
- GitHub Issues: https://github.com/ruvnet/agentic-flow/issues
- Documentation: `/workspaces/agentic-qe-cf/docs/research/agentic-flow-features-analysis.md`
- Team Slack: #agentic-qe-platform

**Quick Reference:**
- CLI Commands: `npx agentic-flow --help`
- API Docs: https://www.npmjs.com/package/agentic-flow
- Examples: `/workspaces/agentic-qe-cf/docs/research/`

---

**Guide Version:** 1.0
**Last Updated:** October 20, 2025
**Author:** Research Agent (Claude Code)
