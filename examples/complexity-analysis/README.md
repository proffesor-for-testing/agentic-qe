# Code Complexity Analyzer - Learning Example

This example demonstrates the complete Agentic QE Fleet architecture through a practical Code Complexity Analyzer agent.

## 🎯 What You'll Learn

By studying this example, you'll understand:

1. **BaseAgent Pattern** - How all agents extend the base class with lifecycle hooks
2. **Memory System** - Storing and retrieving agent data for coordination
3. **Event-Driven Architecture** - How agents communicate via events
4. **Learning Integration** - How agents improve over time
5. **Testing Patterns** - Comprehensive test coverage strategies
6. **Agent Coordination** - How multiple agents work together

## 📁 Files Created

### Agent Implementation
**Location**: `src/agents/CodeComplexityAnalyzerAgent.ts`

The main agent class demonstrating:
- Custom configuration and thresholds
- Core analysis methods (cyclomatic, cognitive complexity)
- Memory integration for storing results
- Event emission for coordination
- Lifecycle hooks (pre-task, post-task, error handling)
- Quality scoring algorithm
- AI-powered recommendation generation

**Key Features**:
```typescript
export class CodeComplexityAnalyzerAgent extends BaseAgent {
  // Analyzes code complexity metrics
  async analyzeComplexity(request: ComplexityAnalysisRequest): Promise<ComplexityAnalysisResult>

  // Lifecycle hooks
  protected async onPreTask(data: { assignment: any }): Promise<void>
  protected async onPostTask(data: PostTaskData): Promise<void>
  protected async onTaskError(data: { assignment: any; error: Error }): Promise<void>
}
```

### Comprehensive Tests
**Location**: `tests/agents/CodeComplexityAnalyzerAgent.test.ts`

Test suite covering:
- ✅ Initialization and capabilities
- ✅ Complexity analysis (simple and complex code)
- ✅ Issue detection (cyclomatic, cognitive, size)
- ✅ Recommendation generation
- ✅ Memory integration
- ✅ Event integration
- ✅ Lifecycle hooks
- ✅ Quality scoring
- ✅ Performance benchmarks

**Test Structure**:
```typescript
describe('CodeComplexityAnalyzerAgent', () => {
  describe('initialization', () => { /* ... */ })
  describe('complexity analysis', () => { /* ... */ })
  describe('recommendations', () => { /* ... */ })
  describe('memory integration', () => { /* ... */ })
  describe('event integration', () => { /* ... */ })
  describe('lifecycle hooks', () => { /* ... */ })
  describe('quality scoring', () => { /* ... */ })
  describe('performance', () => { /* ... */ })
});
```

### Interactive Demo
**Location**: `examples/complexity-analysis/demo.ts`

Interactive demonstration showing:
1. Agent initialization with custom config
2. Simple code analysis (high score)
3. Complex code analysis (issues detected)
4. Multiple file analysis
5. Memory storage verification
6. Agent coordination patterns

### Claude Code Integration
**Location**: `.claude/agents/qe-code-complexity.md`

Agent definition for Claude Code enabling:
- Natural language task execution
- Capability documentation
- Usage examples
- Integration patterns

## 🚀 Running the Example

### Prerequisites

```bash
# Install dependencies (if not already installed)
cd /home/user/agentic-qe
npm install
```

### Run the Interactive Demo

```bash
# Run the demo to see the agent in action
npx ts-node examples/complexity-analysis/demo.ts
```

**Expected Output**:
```
🚀 CodeComplexityAnalyzerAgent Demo

Step 1: Initializing agent...
  ✅ Agent initialized

Step 2: Analyzing simple code...
  Results:
    Quality Score: 100/100
    Issues Found: 0
    Analysis Time: 15ms
    Cyclomatic Complexity: 1.00
    Cognitive Complexity: 1.00
    Lines of Code: 12
    Function Count: 3

Step 3: Analyzing complex code with issues...
  Results:
    Quality Score: 65/100
    Issues Found: 2
    Analysis Time: 8ms
    Cyclomatic Complexity: 23.00
    Cognitive Complexity: 29.00

  ⚠️  Issues Detected:
    1. [HIGH] cyclomatic
       Current: 23, Threshold: 10
       Consider breaking down complex logic into smaller functions

    2. [MEDIUM] cognitive
       Current: 29, Threshold: 15
       Reduce nesting levels and simplify control flow

  💡 Recommendations:
    1. Apply Extract Method refactoring to reduce cyclomatic complexity
    2. Use early returns to reduce nesting levels
    3. Extract nested loops into separate methods

... [more steps]

✅ Demo completed successfully!
```

### Run the Tests

```bash
# Run tests for the complexity analyzer agent
npm test tests/agents/CodeComplexityAnalyzerAgent.test.ts
```

### Use from Claude Code CLI

```bash
# Analyze a single file
claude "Use qe-code-complexity to analyze src/services/order-processor.ts"

# Analyze multiple files
claude "Run complexity analysis on all files in src/services/"

# Get refactoring recommendations
claude "Analyze src/utils/validator.ts and suggest refactorings"
```

## 🧠 Architecture Deep Dive

### 1. BaseAgent Lifecycle

```typescript
// Initialization sequence
constructor(config) → super(...) → setupEventHandlers() → setupLifecycleHooks()
                                      ↓
                            initialize() → executeHook('pre-initialization')
                                          → loadKnowledge()
                                          → restoreState()
                                          → status = IDLE

// Task execution sequence
executeTask(task) → onPreTask(assignment)          // Load context
                   → analyzeComplexity(request)     // Do work
                   → onPostTask(result)             // Store results
                   → emit('complexity:analysis:completed')  // Notify

// Error handling
executeTask(task) → onPreTask(assignment)
                   → analyzeComplexity(request)
                   → ERROR!
                   → onTaskError(error)             // Handle error
                   → store error in memory
```

### 2. Memory Coordination Pattern

```typescript
// Store results for other agents
await memoryStore.store(
  `aqe/complexity/${agentId}/latest-result`,
  result,
  86400  // 24 hour TTL
);

// Other agents retrieve results
const complexityData = await memoryStore.retrieve(
  `aqe/complexity/${agentId}/latest-result`
);

// Test generator can now prioritize complex code
if (complexityData.score < 70) {
  await generateExtraTests(complexityData.issues);
}
```

### 3. Event-Driven Coordination

```typescript
// Complexity analyzer emits events
eventBus.emit('complexity:analysis:completed', {
  agentId: this.agentId,
  result: analysisResult,
  timestamp: new Date()
});

// Test generator subscribes
eventBus.on('complexity:analysis:completed', async (event) => {
  const criticalAreas = event.result.issues
    .filter(i => i.severity === 'critical')
    .map(i => i.file);

  await testGeneratorAgent.generateTests({
    focusAreas: criticalAreas,
    extraCoverage: true
  });
});

// Coverage analyzer subscribes
eventBus.on('complexity:analysis:completed', async (event) => {
  await coverageAnalyzerAgent.prioritizeAreas({
    highComplexity: event.result.issues.map(i => i.file)
  });
});
```

### 4. Configuration Customization

```typescript
const agent = new CodeComplexityAnalyzerAgent({
  type: QEAgentType.QUALITY_ANALYZER,
  capabilities: [],
  context: { /* ... */ },
  memoryStore,
  eventBus,

  // Customize thresholds
  thresholds: {
    cyclomaticComplexity: 10,  // Fail above 10
    cognitiveComplexity: 15,   // Fail above 15
    linesOfCode: 300           // Fail above 300 LOC
  },

  // Toggle features
  enableRecommendations: true,  // Generate AI recommendations
  enableLearning: true          // Learn from past analyses
});
```

## 💡 Key Concepts Demonstrated

### 1. Separation of Concerns

- **BaseAgent**: Handles lifecycle, events, memory access
- **CodeComplexityAnalyzerAgent**: Focuses only on complexity analysis
- **Tests**: Verify behavior in isolation
- **Demo**: Shows real-world usage

### 2. Memory as Coordination Mechanism

Instead of direct agent-to-agent communication:
```typescript
// ❌ BAD: Direct coupling
await testGeneratorAgent.useComplexityData(complexityAgent.getData());

// ✅ GOOD: Memory-based coordination
await memoryStore.store('aqe/complexity/result', data);
const data = await memoryStore.retrieve('aqe/complexity/result');
```

### 3. Event-Driven Decoupling

Agents don't need to know about each other:
```typescript
// Agent A emits
eventBus.emit('complexity:analysis:completed', data);

// Agent B, C, D subscribe independently
eventBus.on('complexity:analysis:completed', handlerB);
eventBus.on('complexity:analysis:completed', handlerC);
eventBus.on('complexity:analysis:completed', handlerD);
```

### 4. Learning from Experience

```typescript
// Pre-task: Load historical data
protected async onPreTask() {
  const history = await this.memoryStore.retrieve('history');
  // Adjust thresholds based on past analyses
}

// Post-task: Store for learning
protected async onPostTask(data) {
  await this.memoryStore.store('history', data.result);
  // Future analyses benefit from this data
}
```

## 🔍 Code Walkthrough

### 1. Agent Structure

```typescript
export class CodeComplexityAnalyzerAgent extends BaseAgent {
  // Configuration
  private thresholds: { /* ... */ };
  private enableRecommendations: boolean;

  // Core methods
  async analyzeComplexity(request): Promise<Result> { /* ... */ }
  private async analyzeFile(file): Promise<Metrics> { /* ... */ }
  private detectIssues(metrics): Issue[] { /* ... */ }
  private calculateQualityScore(metrics, issues): number { /* ... */ }
  private async generateRecommendations(issues): Promise<string[]> { /* ... */ }

  // Lifecycle hooks
  protected async onPreTask(data): Promise<void> { /* ... */ }
  protected async onPostTask(data): Promise<void> { /* ... */ }
  protected async onTaskError(data): Promise<void> { /* ... */ }
}
```

### 2. Analysis Flow

```typescript
async analyzeComplexity(request) {
  // 1. Store request for coordination
  await this.memoryStore.store('current-request', request);

  // 2. Analyze each file
  for (const file of request.files) {
    const metrics = await this.analyzeFile(file);
    const issues = this.detectIssues(file.path, metrics);
    // ...
  }

  // 3. Calculate overall quality
  const score = this.calculateQualityScore(overall, issues);

  // 4. Generate recommendations
  const recommendations = await this.generateRecommendations(issues);

  // 5. Store results
  await this.memoryStore.store('latest-result', result);

  // 6. Emit event
  this.eventBus.emit('complexity:analysis:completed', { result });

  return result;
}
```

### 3. Test Structure

```typescript
describe('CodeComplexityAnalyzerAgent', () => {
  let agent, memoryStore, eventBus;

  beforeEach(async () => {
    // Setup test environment
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    eventBus = new EventEmitter();

    agent = new CodeComplexityAnalyzerAgent({ /* ... */ });
    await agent.initialize();
  });

  afterEach(async () => {
    // Cleanup
    await agent.terminate();
    await memoryStore.close();
  });

  it('should analyze simple code', async () => {
    const result = await agent.analyzeComplexity({ /* ... */ });
    expect(result.score).toBeGreaterThan(90);
  });
});
```

## 📚 Next Steps

After understanding this example:

1. **Explore Other Agents**
   - `TestGeneratorAgent` - See test generation patterns
   - `CoverageAnalyzerAgent` - Learn O(log n) algorithms
   - `FlakyTestHunterAgent` - Study ML integration

2. **Build Your Own Agent**
   - Extend `BaseAgent`
   - Define custom capabilities
   - Implement lifecycle hooks
   - Add comprehensive tests

3. **Study Agent Coordination**
   - Check `FleetManager` for multi-agent orchestration
   - Review `SwarmMemoryManager` for distributed coordination
   - Explore `LearningEngine` for continuous improvement

4. **Integrate with Real Projects**
   - Use agents in your CI/CD pipeline
   - Coordinate multiple agents for comprehensive QE
   - Track quality metrics over time

## 🎓 Learning Resources

- **BaseAgent Source**: `src/agents/BaseAgent.ts`
- **Memory System**: `src/core/memory/SwarmMemoryManager.ts`
- **Event System**: Node.js EventEmitter
- **Learning Engine**: `src/learning/LearningEngine.ts`
- **Test Patterns**: All files in `tests/agents/`

## 🤝 Contributing

Want to enhance this example?

1. Add more complexity metrics (Halstead, maintainability index)
2. Integrate with real static analysis tools (ESLint, SonarQube)
3. Add visualization of complexity trends
4. Implement ML-based threshold learning
5. Create integration with CI/CD platforms

## 📝 Summary

This example shows you **everything** you need to build agents in the Agentic QE Fleet:

✅ Extend BaseAgent with custom logic
✅ Use lifecycle hooks for coordination
✅ Store results in memory for other agents
✅ Emit events for real-time coordination
✅ Write comprehensive tests
✅ Integrate with Claude Code

**You now understand the complete architecture!** 🎉

Use this as a template for building your own specialized QE agents.
