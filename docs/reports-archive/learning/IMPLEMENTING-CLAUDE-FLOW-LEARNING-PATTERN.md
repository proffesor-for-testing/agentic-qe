# Implementing Claude Flow Learning Pattern in Agentic QE

**Date**: 2025-11-12
**Based on**: Claude Flow architecture research
**Goal**: Enable QE agents to persist learning via Task tool execution

---

## Quick Start: What You Need to Know

**Claude Flow Pattern**: Agents call MCP tools directly from prompts like this:

```javascript
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/agent/findings",
  namespace: "coordination",
  value: JSON.stringify({ data: "here" })
}
```

**Agentic QE Equivalent**:

```javascript
mcp__agentic-qe__learning_store_experience {
  agentId: "qe-test-generator",
  taskType: "unit-test-generation",
  reward: 0.95,
  outcome: { tests: 15, coverage: 0.87 }
}
```

---

## Implementation Steps

### Step 1: Update Agent Prompts with MCP Examples

**File**: `/workspaces/agentic-qe-cf/.claude/agents/qe-test-generator.md`

Add this section at the end:

```markdown
## Learning & Coordination Protocol

This agent automatically learns from task execution. Use these MCP tools:

### Store Learning Experience

After generating tests, store the experience:

\`\`\`javascript
mcp__agentic-qe__learning_store_experience {
  agentId: "qe-test-generator",
  taskType: "unit-test-generation",
  reward: <0.0-1.0 based on success>,
  outcome: {
    tests_generated: <number>,
    coverage_achieved: <0.0-1.0>,
    patterns_used: [<array of patterns>],
    framework: "<jest|mocha|vitest>",
    edge_cases_covered: <number>
  },
  metadata: {
    execution_time_ms: <duration>,
    complexity: "<low|medium|high>",
    language: "<typescript|javascript|python>"
  }
}
\`\`\`

### Query Successful Patterns

Before generating tests, query similar successful patterns:

\`\`\`javascript
mcp__agentic-qe__learning_query {
  queryType: "patterns",
  taskType: "unit-test-generation",
  minReward: 0.8,
  limit: 5
}
\`\`\`

The response will include:
- Successful patterns from past test generations
- Confidence scores for each pattern
- Domain-specific recommendations
- Usage statistics

### Store Successful Pattern

When you discover a particularly effective approach:

\`\`\`javascript
mcp__agentic-qe__learning_store_pattern {
  pattern: "Use AAA (Arrange-Act-Assert) with Given-When-Then comments for clarity",
  confidence: 0.95,
  domain: "unit-test-generation",
  successRate: 0.92,
  usageCount: 47,
  metadata: {
    frameworks: ["jest", "vitest"],
    languages: ["typescript", "javascript"],
    complexity: "medium"
  }
}
\`\`\`

### Example: Full Test Generation Flow

\`\`\`javascript
// 1. Query successful patterns
const patterns = await mcp__agentic-qe__learning_query({
  queryType: "patterns",
  taskType: "unit-test-generation",
  minReward: 0.8
});

// 2. Generate tests using learned patterns
// ... test generation logic ...

// 3. Store experience
await mcp__agentic-qe__learning_store_experience({
  agentId: "qe-test-generator",
  taskType: "unit-test-generation",
  reward: calculateReward(result), // 0.0-1.0
  outcome: {
    tests_generated: 15,
    coverage_achieved: 0.87,
    patterns_used: ["AAA", "Given-When-Then", "Test Data Builders"],
    framework: "jest",
    edge_cases_covered: 8
  }
});

// 4. If very successful, store pattern
if (result.coverage >= 0.85) {
  await mcp__agentic-qe__learning_store_pattern({
    pattern: "Combine AAA with Test Data Builders for complex objects",
    confidence: 0.9,
    domain: "unit-test-generation"
  });
}
\`\`\`

### Coordination with Other Agents

Share findings with other agents via memory:

\`\`\`javascript
// Share test generation insights
mcp__agentic-qe__memory_store {
  key: "aqe/test-generator/insights",
  value: JSON.stringify({
    patterns_discovered: ["AAA", "Builder"],
    coverage_achieved: 0.87,
    recommended_approach: "Test Data Builders for complex scenarios"
  }),
  partition: "coordination",
  ttl: 86400 // 24 hours
}
\`\`\`

### Check Coordination Memory

Before starting, check what other agents discovered:

\`\`\`javascript
// Check coverage analyzer findings
const coverageGaps = await mcp__agentic-qe__memory_retrieve({
  key: "aqe/coverage-analyzer/gaps",
  partition: "coordination"
});

// Prioritize test generation for uncovered areas
\`\`\`
```

---

## Step 2: Implement Hooks in BaseAgent

**File**: `/workspaces/agentic-qe-cf/src/agents/BaseAgent.ts`

```typescript
import { EventEmitter } from 'events';

export abstract class BaseAgent extends EventEmitter {
  // ... existing code ...

  /**
   * Execute task with automatic learning hooks
   */
  async executeTask(assignment: TaskAssignment): Promise<any> {
    const startTime = Date.now();

    try {
      // PRE-TASK HOOK: Store task initiation
      await this.callPreTaskHook(assignment);

      // Execute the actual task
      const result = await this.performTask(assignment);

      // POST-TASK HOOK: Store learning experience
      await this.callPostTaskHook(assignment, result, Date.now() - startTime);

      return result;
    } catch (error) {
      // ERROR HOOK: Store failure for learning
      await this.callErrorHook(assignment, error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Pre-task hook: Initialize learning context
   */
  protected async callPreTaskHook(assignment: TaskAssignment): Promise<void> {
    try {
      // Store task initiation
      await this.memoryStore.store(`aqe/learning/task-${assignment.id}/start`, {
        agentId: this.agentId.type,
        taskType: assignment.type,
        startedAt: Date.now(),
        description: assignment.description
      }, {
        partition: 'learning',
        ttl: 604800 // 7 days
      });

      // Query successful patterns for this task type
      const patterns = await this.querySuccessfulPatterns(assignment.type);

      // Store patterns in task context for easy access
      if (patterns.length > 0) {
        await this.memoryStore.store(`aqe/learning/task-${assignment.id}/patterns`, patterns, {
          partition: 'learning',
          ttl: 86400 // 24 hours
        });

        this.logger.info(`Pre-task: Loaded ${patterns.length} successful patterns`, {
          agent: this.agentId.type,
          taskType: assignment.type
        });
      }

      // Emit pre-task event
      this.emit('task:pre', { assignment, patterns });
    } catch (error) {
      this.logger.warn('Pre-task hook failed', { error });
      // Don't fail task if hook fails
    }
  }

  /**
   * Post-task hook: Store learning experience
   */
  protected async callPostTaskHook(
    assignment: TaskAssignment,
    result: any,
    durationMs: number
  ): Promise<void> {
    try {
      // Calculate reward (success metric 0-1)
      const reward = this.calculateReward(assignment, result);

      // Store learning experience via MCP tool
      // This will be persisted to AgentDB for cross-session learning
      const experience = {
        agentId: this.agentId.type,
        taskType: assignment.type,
        reward,
        outcome: {
          success: reward > 0.5,
          durationMs,
          result: this.sanitizeResult(result)
        },
        metadata: {
          timestamp: Date.now(),
          taskId: assignment.id
        }
      };

      // Store via memory (will trigger learning persistence)
      await this.memoryStore.store(`aqe/learning/experience-${Date.now()}`, experience, {
        partition: 'learning',
        ttl: 0 // Permanent
      });

      // If task was very successful, extract patterns
      if (reward >= 0.85) {
        const patterns = await this.extractSuccessfulPatterns(assignment, result);
        for (const pattern of patterns) {
          await this.storeSuccessfulPattern(pattern);
        }
      }

      // Emit post-task event
      this.emit('task:post', { assignment, result, reward });

      this.logger.info('Post-task: Learning experience stored', {
        agent: this.agentId.type,
        reward,
        durationMs
      });
    } catch (error) {
      this.logger.warn('Post-task hook failed', { error });
      // Don't fail task if hook fails
    }
  }

  /**
   * Error hook: Learn from failures
   */
  protected async callErrorHook(
    assignment: TaskAssignment,
    error: Error,
    durationMs: number
  ): Promise<void> {
    try {
      // Store failure experience with reward 0
      const experience = {
        agentId: this.agentId.type,
        taskType: assignment.type,
        reward: 0,
        outcome: {
          success: false,
          error: error.message,
          stack: error.stack,
          durationMs
        },
        metadata: {
          timestamp: Date.now(),
          taskId: assignment.id
        }
      };

      await this.memoryStore.store(`aqe/learning/failure-${Date.now()}`, experience, {
        partition: 'learning',
        ttl: 0 // Keep failures for analysis
      });

      // Emit error event
      this.emit('task:error', { assignment, error });

      this.logger.error('Error hook: Failure experience stored', {
        agent: this.agentId.type,
        error: error.message
      });
    } catch (hookError) {
      this.logger.warn('Error hook failed', { error: hookError });
    }
  }

  /**
   * Query successful patterns for task type
   */
  private async querySuccessfulPatterns(taskType: string): Promise<any[]> {
    try {
      // Query learning memory for successful patterns
      const patterns = await this.memoryStore.query({
        pattern: `aqe/learning/pattern-${taskType}-*`,
        partition: 'learning',
        limit: 10
      });

      // Filter by confidence and success rate
      return patterns.filter((p: any) =>
        p.confidence >= 0.8 && p.successRate >= 0.7
      );
    } catch (error) {
      this.logger.warn('Failed to query patterns', { error });
      return [];
    }
  }

  /**
   * Calculate reward based on task outcome
   */
  protected calculateReward(assignment: TaskAssignment, result: any): number {
    // Override in subclasses for domain-specific reward calculation
    // Default: Binary success (0 or 1)
    return result?.success ? 1.0 : 0.0;
  }

  /**
   * Sanitize result for storage (remove large data)
   */
  protected sanitizeResult(result: any): any {
    // Override in subclasses to extract key metrics
    return {
      success: result?.success || false,
      metrics: result?.metrics || {}
    };
  }

  /**
   * Extract successful patterns from task result
   */
  protected async extractSuccessfulPatterns(
    assignment: TaskAssignment,
    result: any
  ): Promise<any[]> {
    // Override in subclasses to extract domain-specific patterns
    return [];
  }

  /**
   * Store successful pattern for future learning
   */
  protected async storeSuccessfulPattern(pattern: any): Promise<void> {
    await this.memoryStore.store(
      `aqe/learning/pattern-${pattern.domain}-${Date.now()}`,
      pattern,
      {
        partition: 'learning',
        ttl: 0 // Permanent
      }
    );

    this.logger.info('Stored successful pattern', {
      domain: pattern.domain,
      confidence: pattern.confidence
    });
  }
}
```

---

## Step 3: Update Specific Agent Classes

**Example**: `/workspaces/agentic-qe-cf/src/agents/QETestGeneratorAgent.ts`

```typescript
export class QETestGeneratorAgent extends BaseAgent {
  /**
   * Override reward calculation for test generation
   */
  protected calculateReward(assignment: TaskAssignment, result: any): number {
    if (!result?.success) return 0.0;

    // Calculate weighted reward based on multiple factors
    const coverageScore = result.coverage || 0;
    const testsGeneratedScore = Math.min(result.testsGenerated / 20, 1.0); // Normalize to 1.0
    const edgeCasesScore = Math.min(result.edgeCasesCovered / 10, 1.0);

    // Weighted average
    return (
      coverageScore * 0.5 +
      testsGeneratedScore * 0.3 +
      edgeCasesScore * 0.2
    );
  }

  /**
   * Extract successful patterns from test generation
   */
  protected async extractSuccessfulPatterns(
    assignment: TaskAssignment,
    result: any
  ): Promise<any[]> {
    const patterns = [];

    // Pattern 1: High coverage with specific approach
    if (result.coverage >= 0.85) {
      patterns.push({
        pattern: `Achieved ${(result.coverage * 100).toFixed(0)}% coverage using ${result.approach}`,
        confidence: result.coverage,
        domain: 'unit-test-generation',
        successRate: 1.0,
        usageCount: 1,
        metadata: {
          framework: result.framework,
          patterns: result.patternsUsed || []
        }
      });
    }

    // Pattern 2: Effective edge case handling
    if (result.edgeCasesCovered >= 8) {
      patterns.push({
        pattern: `Effective edge case coverage: ${result.edgeCasesCovered} cases`,
        confidence: 0.9,
        domain: 'edge-case-testing',
        successRate: 1.0,
        usageCount: 1
      });
    }

    return patterns;
  }

  /**
   * Sanitize result for storage
   */
  protected sanitizeResult(result: any): any {
    return {
      success: result?.success || false,
      testsGenerated: result?.testsGenerated || 0,
      coverage: result?.coverage || 0,
      framework: result?.framework || 'unknown',
      patternsUsed: result?.patternsUsed || [],
      edgeCasesCovered: result?.edgeCasesCovered || 0
    };
  }
}
```

---

## Step 4: Connect Memory to AgentDB Learning

**File**: `/workspaces/agentic-qe-cf/src/core/memory/SwarmMemoryManager.ts`

```typescript
export class SwarmMemoryManager {
  // ... existing code ...

  /**
   * Store with automatic learning persistence
   */
  async store(
    key: string,
    value: any,
    options: { partition?: string; ttl?: number } = {}
  ): Promise<void> {
    // Standard memory store
    await this.adapter.store(key, value, options);

    // If this is a learning partition, persist to AgentDB
    if (options.partition === 'learning' && key.includes('/experience-')) {
      await this.persistLearningExperience(value);
    }

    // If this is a pattern, persist to AgentDB
    if (options.partition === 'learning' && key.includes('/pattern-')) {
      await this.persistLearningPattern(value);
    }
  }

  /**
   * Persist learning experience to AgentDB
   */
  private async persistLearningExperience(experience: any): Promise<void> {
    try {
      const agentDb = await this.getAgentDB();
      await agentDb.storeExperience({
        agentId: experience.agentId,
        taskType: experience.taskType,
        reward: experience.reward,
        outcome: experience.outcome,
        timestamp: experience.metadata?.timestamp || Date.now()
      });

      this.logger.debug('Learning experience persisted to AgentDB', {
        agentId: experience.agentId,
        reward: experience.reward
      });
    } catch (error) {
      this.logger.warn('Failed to persist to AgentDB', { error });
      // Don't fail if AgentDB persistence fails
    }
  }

  /**
   * Persist learning pattern to AgentDB
   */
  private async persistLearningPattern(pattern: any): Promise<void> {
    try {
      const agentDb = await this.getAgentDB();
      await agentDb.storePattern({
        pattern: pattern.pattern,
        confidence: pattern.confidence,
        domain: pattern.domain,
        successRate: pattern.successRate || 1.0,
        usageCount: pattern.usageCount || 1
      });

      this.logger.debug('Learning pattern persisted to AgentDB', {
        domain: pattern.domain,
        confidence: pattern.confidence
      });
    } catch (error) {
      this.logger.warn('Failed to persist pattern to AgentDB', { error });
    }
  }

  /**
   * Get AgentDB instance (lazy load)
   */
  private async getAgentDB() {
    if (!this.agentDbInstance) {
      const { EnhancedAgentDBService } = await import('./EnhancedAgentDBService');
      this.agentDbInstance = new EnhancedAgentDBService();
      await this.agentDbInstance.initialize();
    }
    return this.agentDbInstance;
  }
}
```

---

## Step 5: Test End-to-End Learning

**Test Script**: `/workspaces/agentic-qe-cf/scripts/test-learning-e2e.ts`

```typescript
import { QETestGeneratorAgent } from '../src/agents/QETestGeneratorAgent';
import { EnhancedAgentDBService } from '../src/core/memory/EnhancedAgentDBService';

async function testLearningFlow() {
  console.log('🧪 Testing End-to-End Learning Flow\n');

  // 1. Initialize AgentDB
  const agentDb = new EnhancedAgentDBService();
  await agentDb.initialize();

  // 2. Create test generator agent
  const agent = new QETestGeneratorAgent({
    id: { type: 'qe-test-generator', instanceId: 'test-1' },
    fleetId: 'test-fleet',
    coordinationMode: 'hierarchical'
  });

  // 3. Execute task (will trigger hooks)
  const result = await agent.executeTask({
    id: 'task-1',
    type: 'unit-test-generation',
    description: 'Generate tests for Calculator class',
    priority: 'high'
  });

  console.log('✅ Task completed:', result);

  // 4. Query learning data
  console.log('\n📊 Querying Learning Data:\n');

  const experiences = await agentDb.queryExperiences({
    agentId: 'qe-test-generator',
    taskType: 'unit-test-generation',
    limit: 5
  });

  console.log(`Found ${experiences.length} learning experiences`);
  experiences.forEach((exp, i) => {
    console.log(`\n  Experience ${i + 1}:`);
    console.log(`    Reward: ${exp.reward}`);
    console.log(`    Success: ${exp.outcome.success}`);
    console.log(`    Coverage: ${exp.outcome.result.coverage}`);
  });

  // 5. Query patterns
  const patterns = await agentDb.queryPatterns({
    domain: 'unit-test-generation',
    minConfidence: 0.8,
    limit: 5
  });

  console.log(`\n✨ Found ${patterns.length} successful patterns`);
  patterns.forEach((pattern, i) => {
    console.log(`\n  Pattern ${i + 1}:`);
    console.log(`    ${pattern.pattern}`);
    console.log(`    Confidence: ${(pattern.confidence * 100).toFixed(0)}%`);
    console.log(`    Success Rate: ${(pattern.successRate * 100).toFixed(0)}%`);
  });

  console.log('\n✅ Learning flow test complete!');
}

testLearningFlow().catch(console.error);
```

---

## Step 6: Update All Agent Prompts

Use this template for all 18 QE agents:

```bash
#!/bin/bash
# Update all agent prompts with learning integration

AGENTS_DIR=".claude/agents"

for agent_file in $AGENTS_DIR/qe-*.md; do
  echo "Updating $agent_file..."

  # Append learning section if not already present
  if ! grep -q "Learning & Coordination Protocol" "$agent_file"; then
    cat >> "$agent_file" << 'EOF'

## Learning & Coordination Protocol

This agent automatically learns from task execution using MCP tools.

### Store Learning Experience

\`\`\`javascript
mcp__agentic-qe__learning_store_experience {
  agentId: "<agent-id>",
  taskType: "<task-type>",
  reward: <0.0-1.0>,
  outcome: { /* task results */ }
}
\`\`\`

### Query Successful Patterns

\`\`\`javascript
mcp__agentic-qe__learning_query {
  queryType: "patterns",
  taskType: "<task-type>",
  minReward: 0.8
}
\`\`\`
EOF
  fi
done

echo "✅ All agents updated with learning protocol"
```

---

## Expected Behavior After Implementation

### When User Spawns Agent via Task Tool

```javascript
Task("Generate tests", "Create unit tests for Calculator", "qe-test-generator")
```

### Agent Execution Flow

1. **Pre-task hook triggers**:
   - Stores task initiation in memory
   - Queries successful patterns from AgentDB
   - Loads patterns into task context

2. **Agent executes task**:
   - Uses Claude Code tools (Read, Write, Bash, etc.)
   - Can call MCP learning tools from prompt
   - Accesses loaded patterns for guidance

3. **Post-task hook triggers**:
   - Calculates reward based on outcome
   - Stores experience in memory
   - Memory manager persists to AgentDB
   - Extracts and stores successful patterns

4. **Cross-session learning**:
   - Next task queries patterns from AgentDB
   - Learns from previous successes/failures
   - Improves over time

---

## Verification Checklist

- [ ] Agent prompts updated with MCP tool examples
- [ ] BaseAgent implements pre/post/error hooks
- [ ] Memory manager persists to AgentDB
- [ ] Test script verifies end-to-end flow
- [ ] Learning data survives across sessions
- [ ] Patterns are successfully queried
- [ ] Rewards are calculated correctly
- [ ] All 18 agents have learning protocol

---

## Next Steps

1. **Update one agent first** (qe-test-generator) as proof of concept
2. **Test with Calculator example** to verify learning works
3. **Roll out to remaining 17 agents** using template
4. **Document learning protocol** for users
5. **Add learning dashboard** to visualize progress

---

**Implementation Guide Complete**: 2025-11-12
