# QE-QX-Partner Agent Research Report

**Date**: December 1, 2025  
**Purpose**: Design foundation for new `qe-qx-partner` agent integrating Quality Advocacy (QA) and User Experience (UX)  
**Research Scope**: Agentic-QE framework architecture, agent patterns, integration mechanisms

---

## Executive Summary

This report provides comprehensive research on the agentic-qe framework's agent architecture to inform the design of a new **qe-qx-partner** agent. This agent will embody Quality Experience (QX) principles—a marriage between Quality Advocacy (QA) and User Experience (UX)—to co-create quality experiences for all stakeholders (end-users AND builders).

**Key Findings:**
- ✅ **Mature Agent Architecture**: BaseAgent provides 1,296 LOC of battle-tested lifecycle, coordination, and memory infrastructure
- ✅ **Service-Based Decomposition**: Three core service classes reduce agent complexity (AgentLifecycleManager, AgentCoordinator, AgentMemoryService)
- ✅ **Skills System Integration**: 70+ skills available in `.claude/skills/` for extending agent capabilities
- ✅ **Learning & Intelligence**: Optional PerformanceTracker, LearningEngine, and AgentDB for adaptive behavior
- ✅ **Strong Type System**: Comprehensive type definitions in `src/types/index.ts` with 20+ agent types already defined

---

## Table of Contents

1. [Agent Architecture Patterns](#agent-architecture-patterns)
2. [BaseAgent Core Structure](#baseagent-core-structure)
3. [Agent Implementation Examples](#agent-implementation-examples)
4. [Service Classes & Integration Points](#service-classes--integration-points)
5. [Skills System & Tools](#skills-system--tools)
6. [Type System & Interfaces](#type-system--interfaces)
7. [Recommended Architecture for qe-qx-partner](#recommended-architecture-for-qe-qx-partner)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Code Examples & Templates](#code-examples--templates)

---

## 1. Agent Architecture Patterns

### 1.1 Two Base Classes Available

The framework provides two architectural foundations:

#### **Option A: BaseAgent** (`src/agents/BaseAgent.ts`)
- **Purpose**: Production-ready base for specialized QE agents
- **Size**: 1,296 lines (mature, feature-complete)
- **Capabilities**:
  - Lifecycle management (initialize, start, stop, terminate)
  - Event-driven coordination
  - Memory store integration (agent-specific and shared)
  - Optional learning (PerformanceTracker, LearningEngine)
  - Optional AgentDB for distributed coordination
  - Verification hooks (pre/post task, error handling)
  - QUIC transport layer support
- **Status**: ✅ Actively used by all production agents

#### **Option B: Agent** (`src/core/Agent.ts`)
- **Purpose**: Legacy/minimal base class
- **Size**: 386 lines (simpler, less opinionated)
- **Capabilities**: Basic lifecycle, task execution, metrics
- **Status**: ⚠️ Less commonly used, may be deprecated

**Recommendation**: **Use BaseAgent** for qe-qx-partner—it provides everything needed.

---

### 1.2 Agent Lifecycle Pattern

All agents follow this lifecycle:

```typescript
INITIALIZING → ACTIVE → (BUSY ↔ IDLE) → TERMINATING → TERMINATED
                ↓
              ERROR
```

**Lifecycle Hooks**:
- `initializeComponents()`: Setup agent-specific logic
- `loadKnowledge()`: Load memory/patterns/configuration
- `performTask(task)`: Execute assigned tasks
- `cleanup()`: Release resources on shutdown
- `onPreTask()`, `onPostTask()`, `onTaskError()`: Verification hooks

---

### 1.3 Service-Based Decomposition

BaseAgent delegates to three service classes (reducing its complexity):

| Service | Responsibility | LOC Saved |
|---------|---------------|-----------|
| **AgentLifecycleManager** | Status transitions, state validation | ~150 |
| **AgentCoordinator** | Event emission, message broadcasting | ~200 |
| **AgentMemoryService** | Namespaced memory operations | ~150 |

**Total Impact**: Reduced BaseAgent from ~1,800 LOC to 1,296 LOC (30% reduction)

---

## 2. BaseAgent Core Structure

### 2.1 BaseAgentConfig Interface

```typescript
export interface BaseAgentConfig {
  id?: string;                                      // Optional: auto-generated if not provided
  type: AgentType;                                  // Required: QEAgentType enum value
  capabilities: AgentCapability[];                  // Required: what this agent can do
  context: AgentContext;                            // Required: agent metadata
  memoryStore: MemoryStore;                         // Required: shared memory system
  eventBus: EventEmitter;                           // Required: inter-agent communication
  
  // Optional features
  enableLearning?: boolean;                         // Enable PerformanceTracker integration
  learningConfig?: Partial<LearningConfig>;         // Q-learning configuration
  agentDBConfig?: Partial<AgentDBConfig>;           // Distributed coordination
  
  // AgentDB shorthand properties
  agentDBPath?: string;
  enableQUICSync?: boolean;
  syncPort?: number;
  syncPeers?: string[];
  quantizationType?: 'scalar' | 'binary' | 'product' | 'none';
}
```

### 2.2 Abstract Methods (Must Implement)

Every agent extending BaseAgent must implement:

```typescript
protected abstract initializeComponents(): Promise<void>;
protected abstract performTask(task: QETask): Promise<any>;
protected abstract loadKnowledge(): Promise<void>;
protected abstract cleanup(): Promise<void>;
```

### 2.3 Optional Lifecycle Hooks

Override these for custom behavior:

```typescript
protected async onPreInitialization(): Promise<void> {}
protected async onPostInitialization(): Promise<void> {}
protected async onPreTermination(): Promise<void> {}

// Task execution hooks (automatic if using executeTask)
protected async onPreTask(data: PreTaskData): Promise<void> {}
protected async onPostTask(data: PostTaskData): Promise<void> {}
protected async onTaskError(data: TaskErrorData): Promise<void> {}
```

### 2.4 Built-in Features

BaseAgent provides these methods out-of-the-box:

**Memory Operations**:
```typescript
await this.storeMemory(key, value, ttl?)
await this.retrieveMemory(key)
await this.storeSharedMemory(key, value, ttl?)
await this.retrieveSharedMemory(agentType, key)
```

**Event/Coordination**:
```typescript
this.emitEvent(type, data, priority)
await this.broadcastMessage(type, payload, priority)
await this.sendMessage(toAgentId, type, payload, priority)
```

**Status Management**:
```typescript
this.getStatus()
this.getPerformanceMetrics()
this.getCapabilities()
```

**Learning (if enabled)**:
```typescript
await this.getLearningStatus()
await this.recommendStrategy(taskState)
```

---

## 3. Agent Implementation Examples

### 3.1 QualityAnalyzerAgent (Simple Pattern)

**File**: `src/agents/QualityAnalyzerAgent.ts`

**Key Characteristics**:
- ✅ Clean constructor with config merging
- ✅ Tool validation in `initializeComponents()`
- ✅ Task routing in `performTask()` via switch statement
- ✅ Knowledge loading from memory
- ✅ Resource cleanup

**Constructor Pattern**:
```typescript
export class QualityAnalyzerAgent extends BaseAgent {
  private readonly config: QualityAnalyzerConfig;
  protected readonly logger: Logger = new ConsoleLogger();

  constructor(config: QualityAnalyzerConfig & { 
    context: AgentContext; 
    memoryStore: MemoryStore; 
    eventBus: EventEmitter 
  }) {
    const baseConfig: BaseAgentConfig = {
      type: QEAgentType.QUALITY_ANALYZER,
      capabilities: [],
      context: config.context,
      memoryStore: config.memoryStore,
      eventBus: config.eventBus
    };
    super(baseConfig);
    
    this.config = {
      tools: config.tools || ['eslint', 'sonarqube', 'codecov'],
      thresholds: config.thresholds || { /* defaults */ },
      reportFormat: config.reportFormat || 'json'
    };
  }
}
```

**Task Routing Pattern**:
```typescript
protected async performTask(task: QETask): Promise<any> {
  const taskType = task.type;
  const taskData = task.payload;

  switch (taskType) {
    case 'code-analysis':
      return await this.analyzeCode(taskData);
    case 'complexity-analysis':
      return await this.analyzeComplexity(taskData);
    case 'style-check':
      return await this.checkStyle(taskData);
    case 'security-scan':
      return await this.scanSecurity(taskData);
    default:
      throw new Error(`Unsupported task type: ${taskType}`);
  }
}
```

---

### 3.2 TestGeneratorAgent (Advanced Pattern)

**File**: `src/agents/TestGeneratorAgent.ts` (1,575 lines)

**Key Characteristics**:
- ✅ Pattern-based generation with QEReasoningBank integration
- ✅ Optional learning components (PerformanceTracker, LearningEngine)
- ✅ Complex initialization with database connections
- ✅ AI engine placeholders for future neural integration
- ✅ Input validation with detailed error messages

**Configuration Pattern**:
```typescript
export interface TestGeneratorConfig extends BaseAgentConfig {
  enablePatterns?: boolean;
  enableLearning?: boolean;
  minPatternConfidence?: number;
  patternMatchTimeout?: number;
}

constructor(config: TestGeneratorConfig) {
  super(config);

  this.patternConfig = {
    enabled: config.enablePatterns !== false,
    minConfidence: config.minPatternConfidence || 0.85,
    matchTimeout: config.patternMatchTimeout || 50,
    learningEnabled: config.enableLearning !== false
  };

  if (this.patternConfig.enabled) {
    this.reasoningBank = new QEReasoningBank({ minQuality: 0.7 });
    this.patternExtractor = new PatternExtractor({ /* config */ });
  }
}
```

**Database Integration in initializeComponents()**:
```typescript
protected async initializeComponents(): Promise<void> {
  if (this.reasoningBank) {
    try {
      const swarmMemory = this.memoryStore as any;
      if (swarmMemory?.getDatabase && typeof swarmMemory.getDatabase === 'function') {
        const db = swarmMemory.getDatabase();
        if (db) {
          this.reasoningBank = new QEReasoningBank({
            minQuality: 0.7,
            database: db
          });
          await this.reasoningBank.initialize();
          this.logger.info('ReasoningBank pattern database loaded');
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize ReasoningBank:', error);
    }
  }
}
```

---

### 3.3 LearningAgent (Learning Pattern)

**File**: `src/agents/LearningAgent.ts`

**Key Characteristics**:
- ✅ Demonstrates learning integration
- ✅ ImprovementLoop for continuous optimization
- ✅ Performance tracking and recording
- ✅ Post-task learning hooks

**Learning Hook Example**:
```typescript
protected async onPostTask(data: PostTaskData): Promise<void> {
  await super.onPostTask(data);

  if (!this.learningEnabled) return;

  try {
    // Learn from task execution
    const learning = await this.learningEngine.learnFromExecution(
      data.assignment.task,
      data.result,
      await this.getUserFeedback(data.assignment.id)
    );

    // Record performance snapshot
    await this.recordPerformance(data);

    // Apply improvements if learned
    if (learning.improved) {
      await this.applyLearning(learning);
    }

    this.emitEvent('learning.completed', {
      agentId: this.agentId,
      taskId: data.assignment.id,
      improvement: learning.improvementRate
    });
  } catch (error) {
    console.error('Learning failed:', error);
  }
}
```

---

## 4. Service Classes & Integration Points

### 4.1 AgentLifecycleManager

**File**: `src/agents/lifecycle/AgentLifecycleManager.ts`

**Responsibilities**:
- Status management (INITIALIZING → ACTIVE → IDLE → BUSY → TERMINATING → TERMINATED → ERROR)
- State transition validation
- Lifecycle hook coordination
- Status change callbacks

**Key Methods**:
```typescript
public async initialize(hooks?: LifecycleHooks): Promise<void>
public async terminate(hooks?: LifecycleHooks): Promise<void>
public getStatus(): AgentStatus
public isInStatus(status: AgentStatus): boolean
public canAcceptTasks(): boolean
public markActive(): void
public markIdle(): void
public markError(reason: string): void
```

**Usage in BaseAgent**:
```typescript
this.lifecycleManager = new AgentLifecycleManager(this.agentId);
this.lifecycleManager.setStatusChangeCallback((status) => {
  this.emitStatusChange(status);
});
```

---

### 4.2 AgentCoordinator

**File**: `src/agents/coordination/AgentCoordinator.ts`

**Responsibilities**:
- Event emission to event bus
- Message broadcasting to other agents
- Direct agent-to-agent messaging
- Event handler registration

**Key Methods**:
```typescript
public registerEventHandler<T>(handler: EventHandler<T>): void
public emitEvent(type: string, data: any, priority: 'low' | 'medium' | 'high' | 'critical'): void
public async broadcastMessage(type: string, payload: any, priority): Promise<void>
public async sendMessage(toAgentId: AgentId, type: string, payload: any, priority): Promise<void>
```

**Usage Example**:
```typescript
this.coordinator = new AgentCoordinator({
  agentId: this.agentId,
  eventBus: this.eventBus,
  memoryStore: this.memoryStore
});

// Emit event
this.coordinator.emitEvent('qx.analysis.complete', {
  score: 85,
  recommendations: [...]
}, 'high');
```

---

### 4.3 AgentMemoryService

**File**: `src/agents/memory/AgentMemoryService.ts`

**Responsibilities**:
- Agent-specific memory (namespaced by agent ID)
- Shared memory (namespaced by agent type)
- Task result storage
- State persistence

**Key Methods**:
```typescript
// Agent-specific memory
public async store(key: string, value: any, ttl?: number): Promise<void>
public async retrieve(key: string): Promise<any>
public async has(key: string): Promise<boolean>
public async delete(key: string): Promise<void>

// Shared memory
public async storeShared(key: string, value: any, ttl?: number): Promise<void>
public async retrieveShared(agentType: AgentType, key: string): Promise<any>

// Task results
public async storeTaskResult(taskId: string, result: TaskResultData): Promise<void>
public async retrieveTaskResult(taskId: string): Promise<TaskResultData | null>
```

**Automatic Namespacing**:
```typescript
// Internal key transformation
buildAgentKey(key: string): string {
  return `agent:${this.agentId.id}:${key}`;
}

buildSharedKey(key: string): string {
  return `shared:${this.agentId.type}:${key}`;
}
```

---

## 5. Skills System & Tools

### 5.1 Skills Directory Structure

**Location**: `.claude/skills/`

**Available Skills** (70+ total):
- **Testing Specializations**: accessibility-testing, mobile-testing, performance-testing, security-testing, visual-testing-advanced
- **QE Practices**: context-driven-testing, exploratory-testing-advanced, shift-left-testing, shift-right-testing
- **Quality Analysis**: brutal-honesty-review, quality-metrics, testability-scoring, code-review-quality
- **Collaboration**: pair-programming, consultancy-practices, technical-writing
- **Advanced Patterns**: chaos-engineering-resilience, mutation-testing, contract-testing, risk-based-testing

### 5.2 Testability Scoring Skill (Relevant Example)

**Location**: `.claude/skills/testability-scoring/`

**What It Does**:
- Automated testability assessment using 10 principles
- Playwright-based web app analysis
- Generates HTML reports with scores and recommendations
- Principles include: Observability, Controllability, Explainability, etc.

**Why Relevant to QX**:
- ✅ Assesses quality from UX perspective (is it testable?)
- ✅ Generates actionable recommendations
- ✅ Balances technical quality with user understanding
- ✅ Provides quantitative + qualitative insights

**Architecture Pattern** (could be reused):
```
.claude/skills/testability-scoring/
├── SKILL.md              # Skill documentation
├── README.md             # Quick reference
├── scripts/
│   ├── run-assessment.sh
│   └── generate-html-report.js
├── docs/
│   └── principles.md
└── resources/
    └── templates/
```

---

### 5.3 Skills Usage Pattern

Agents can invoke skills programmatically:

```typescript
// In agent implementation
protected async analyzeTestability(url: string): Promise<TestabilityScore> {
  // Invoke testability-scoring skill
  const result = await this.invokeSkill('testability-scoring', {
    url,
    principles: ['observability', 'explainability', 'controllability']
  });
  
  return result;
}
```

**Skill Invocation API** (conceptual, based on patterns):
```typescript
interface SkillInvocation {
  skillName: string;
  parameters: Record<string, any>;
  timeout?: number;
}

protected async invokeSkill(name: string, params: any): Promise<any> {
  // Skill execution logic
  // Could shell out to .claude/skills/{name}/scripts/
  // Or load as module if TypeScript/JavaScript
}
```

---

## 6. Type System & Interfaces

### 6.1 Core Type Definitions

**File**: `src/types/index.ts` (703 lines)

**Key Interfaces**:

```typescript
// Agent Identity
export interface AgentId {
  id: string;
  type: QEAgentType;
  created: Date;
}

// Agent Configuration
export interface AgentConfig {
  type: string;
  count: number;
  config: Record<string, any>;
}

// Agent Status
export enum AgentStatus {
  INITIALIZING = 'initializing',
  IDLE = 'idle',
  ACTIVE = 'active',
  BUSY = 'busy',
  ERROR = 'error',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated'
}

// Agent Capability
export interface AgentCapability {
  name: string;
  version: string;
  description: string;
  parameters?: Record<string, any>;
}
```

---

### 6.2 Agent Types Enum

20+ agent types already defined:

```typescript
export enum QEAgentType {
  TEST_GENERATOR = 'test-generator',
  TEST_EXECUTOR = 'test-executor',
  COVERAGE_ANALYZER = 'coverage-analyzer',
  QUALITY_ANALYZER = 'quality-analyzer',
  PERFORMANCE_TESTER = 'performance-tester',
  SECURITY_SCANNER = 'security-scanner',
  QUALITY_GATE = 'quality-gate',
  CHAOS_ENGINEER = 'chaos-engineer',
  VISUAL_TESTER = 'visual-tester',
  FLEET_COMMANDER = 'fleet-commander',
  REQUIREMENTS_VALIDATOR = 'requirements-validator',
  PRODUCTION_INTELLIGENCE = 'production-intelligence',
  DEPLOYMENT_READINESS = 'deployment-readiness',
  REGRESSION_RISK_ANALYZER = 'regression-risk-analyzer',
  TEST_DATA_ARCHITECT = 'test-data-architect',
  API_CONTRACT_VALIDATOR = 'api-contract-validator',
  FLAKY_TEST_HUNTER = 'flaky-test-hunter'
}
```

**Recommendation**: Add new type for QX agent:
```typescript
QX_PARTNER = 'qx-partner',
```

---

### 6.3 Task & Event Types

```typescript
export interface QETask {
  id: string;
  type: string;
  payload: any;
  priority: number;
  status: string;
  result?: any;
  error?: Error;
  description?: string;
  context?: Record<string, any>;
  requirements?: {
    capabilities?: string[];
    resources?: Record<string, any>;
  };
}

export interface QEEvent {
  id: string;
  type: string;
  source: AgentId;
  target?: AgentId;
  data: any;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  scope: 'local' | 'global';
  category?: 'agent' | 'test' | 'quality' | 'system';
}
```

---

## 7. Recommended Architecture for qe-qx-partner

Based on research, here's the recommended architecture:

### 7.1 Agent Design Overview

**Name**: `QXPartnerAgent`  
**Type**: `QEAgentType.QX_PARTNER`  
**Base Class**: `BaseAgent`  
**Purpose**: Bridge QA and UX perspectives to co-create quality experiences

**Core Responsibilities**:
1. **Cross-Discipline Analysis**: Understand quality from both QA and UX perspectives
2. **Oracle Problem Solving**: Help teams make informed decisions when correct behavior is unclear
3. **Impact Assessment**: Analyze visible and invisible impacts of changes
4. **Heuristic Application**: Apply UX testing heuristics (Rule of Three, What Must Not Change, etc.)
5. **Stakeholder Balance**: Find balance between user needs and business needs
6. **Recommendation Generation**: Provide actionable insights that improve both quality and experience

---

### 7.2 Proposed Capabilities

```typescript
export interface QXPartnerCapability extends AgentCapability {
  name: 'qx-analysis' | 'oracle-resolution' | 'impact-assessment' | 
        'heuristic-application' | 'stakeholder-analysis' | 'ux-testing';
  version: '1.0.0';
  description: string;
  heuristics?: string[]; // e.g., ['rule-of-three', 'must-not-change', 'impact-analysis']
}
```

**Suggested Capabilities**:

1. **qx-analysis** (v1.0.0)
   - Description: Comprehensive quality experience analysis combining QA and UX perspectives
   - Inputs: Application URL, user flows, test results
   - Outputs: QX score, recommendations, risk areas

2. **oracle-resolution** (v1.0.0)
   - Description: Resolve oracle problems by analyzing expected vs actual behavior
   - Inputs: Behavior description, stakeholder contexts, business rules
   - Outputs: Decision recommendation, rationale, confidence level

3. **impact-assessment** (v1.0.0)
   - Description: Analyze visible and invisible impacts of changes
   - Inputs: Change description, affected components, user flows
   - Outputs: Impact map, risk level, mitigation strategies

4. **heuristic-application** (v1.0.0)
   - Description: Apply UX testing heuristics to quality assessment
   - Inputs: Feature description, user personas, testing context
   - Outputs: Heuristic analysis results, test scenarios, edge cases

5. **stakeholder-analysis** (v1.0.0)
   - Description: Balance user needs vs business needs
   - Inputs: Requirements, user feedback, business goals
   - Outputs: Balanced recommendations, trade-off analysis

---

### 7.3 Task Types

```typescript
export enum QXTaskType {
  ANALYZE_QX = 'qx-analyze',
  RESOLVE_ORACLE = 'qx-oracle-resolve',
  ASSESS_IMPACT = 'qx-impact-assess',
  APPLY_HEURISTIC = 'qx-heuristic-apply',
  BALANCE_STAKEHOLDERS = 'qx-stakeholder-balance',
  TEST_UX = 'qx-ux-test',
  GENERATE_SCENARIOS = 'qx-scenario-generate'
}
```

---

### 7.4 Configuration Schema

```typescript
export interface QXPartnerConfig extends BaseAgentConfig {
  // UX Testing Configuration
  heuristics?: {
    enabled: string[];  // e.g., ['rule-of-three', 'must-not-change', 'impact-analysis']
    weights?: Record<string, number>;  // Custom weighting for heuristics
  };
  
  // Analysis Configuration
  analysis?: {
    includedAspects: ('qa' | 'ux' | 'business' | 'technical')[];
    depthLevel: 'surface' | 'standard' | 'deep';
    confidenceThreshold: number;  // 0-1
  };
  
  // Integration Configuration
  integrations?: {
    visualTester?: boolean;      // Integrate with qe-visual-tester
    qualityAnalyzer?: boolean;   // Integrate with qe-quality-analyzer
    testabilityScoring?: boolean; // Use testability-scoring skill
  };
  
  // Stakeholder Configuration
  stakeholders?: {
    userPersonas?: string[];
    businessRoles?: string[];
    technicalRoles?: string[];
  };
}
```

---

### 7.5 Data Structures

```typescript
// QX Analysis Result
export interface QXAnalysis {
  qxScore: number;              // 0-100 overall QX score
  qaScore: number;              // Quality Advocacy score
  uxScore: number;              // User Experience score
  balanceScore: number;         // How well QA and UX are balanced
  
  dimensions: {
    observability: number;      // Can we see what's happening?
    controllability: number;    // Can we control behavior?
    explainability: number;     // Can users understand it?
    usability: number;          // Is it easy to use?
    accessibility: number;      // Is it accessible to all?
    consistency: number;        // Is behavior consistent?
  };
  
  oracleProblems: OracleProblem[];
  recommendations: QXRecommendation[];
  impactMap: ImpactMap;
  
  metadata: {
    analyzedAt: Date;
    analyzedBy: string;
    confidence: number;
  };
}

// Oracle Problem
export interface OracleProblem {
  id: string;
  description: string;
  context: string;
  expectedBehaviors: string[];  // Multiple valid interpretations
  stakeholders: string[];       // Who cares about this decision?
  resolution?: {
    recommendation: string;
    rationale: string;
    confidence: number;
    tradeoffs: string[];
  };
}

// QX Recommendation
export interface QXRecommendation {
  id: string;
  type: 'qa' | 'ux' | 'both';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  rationale: string;
  impact: {
    users: string;
    business: string;
    technical: string;
  };
  effort: 'low' | 'medium' | 'high';
  heuristic?: string;           // Which heuristic identified this?
}

// Impact Map
export interface ImpactMap {
  visible: {
    ui: string[];
    workflows: string[];
    performance: string[];
  };
  invisible: {
    dataIntegrity: string[];
    security: string[];
    maintainability: string[];
    scalability: string[];
  };
  crossFunctional: {
    documentation: string[];
    training: string[];
    support: string[];
  };
}
```

---

### 7.6 Integration with Existing Agents

The QX Partner agent should collaborate with:

| Agent | Integration Purpose |
|-------|---------------------|
| **qe-visual-tester** | Get accessibility scores, visual consistency data |
| **qe-quality-analyzer** | Get code quality metrics, complexity scores |
| **qe-test-generator** | Provide UX-aware test scenarios |
| **qe-requirements-validator** | Validate requirements from UX perspective |
| **qe-production-intelligence** | Get real user feedback, production metrics |

**Example Collaboration**:
```typescript
protected async performQXAnalysis(url: string): Promise<QXAnalysis> {
  // 1. Get visual testing data
  const visualData = await this.coordinator.sendMessage(
    { id: 'qe-visual-tester', type: QEAgentType.VISUAL_TESTER, created: new Date() },
    'analyze-accessibility',
    { url },
    'high'
  );
  
  // 2. Get testability scores
  const testabilityData = await this.invokeSkill('testability-scoring', { url });
  
  // 3. Combine perspectives
  return this.synthesizeQXAnalysis(visualData, testabilityData);
}
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Create `src/agents/QXPartnerAgent.ts`
- [ ] Extend `BaseAgent` with basic lifecycle
- [ ] Define `QXPartnerConfig` interface
- [ ] Implement 4 abstract methods (initializeComponents, performTask, loadKnowledge, cleanup)
- [ ] Add `QX_PARTNER` to `QEAgentType` enum
- [ ] Create basic logger and config handling
- [ ] Write unit tests for agent initialization

### Phase 2: Core Capabilities (Week 2)
- [ ] Implement `qx-analyze` task type
- [ ] Implement UX heuristics engine
- [ ] Implement oracle problem detector
- [ ] Implement impact assessment logic
- [ ] Create `QXAnalysis` data structures
- [ ] Write integration tests for core capabilities

### Phase 3: Skills Integration (Week 3)
- [ ] Integrate with `testability-scoring` skill
- [ ] Create QX-specific skill (`.claude/skills/qx-analysis/`)
- [ ] Implement skill invocation patterns
- [ ] Add multi-agent coordination
- [ ] Write E2E tests with skill invocation

### Phase 4: Learning & Intelligence (Week 4)
- [ ] Enable PerformanceTracker integration
- [ ] Implement LearningEngine for pattern detection
- [ ] Create QX-specific patterns (e.g., common oracle problems)
- [ ] Add improvement loop for recommendations
- [ ] Measure and optimize agent performance

### Phase 5: Documentation & Examples (Week 5)
- [ ] Write agent documentation (`.claude/agents/qx-partner.md`)
- [ ] Create example tasks and workflows
- [ ] Generate API documentation
- [ ] Write user guide
- [ ] Create tutorial videos/guides

---

## 9. Code Examples & Templates

### 9.1 Basic Agent Skeleton

```typescript
/**
 * QXPartnerAgent - Quality Experience Partner Agent
 * 
 * Bridges QA and UX perspectives to co-create quality experiences
 * for all stakeholders (end-users AND builders).
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { QETask, AgentCapability, QEAgentType, AgentContext, MemoryStore } from '../types';
import { EventEmitter } from 'events';

// Logger interface
interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

class ConsoleLogger implements Logger {
  info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${message}`, ...args);
  }
  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }
  error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }
  debug(message: string, ...args: any[]): void {
    console.debug(`[DEBUG] ${message}`, ...args);
  }
}

// QX-specific configuration
export interface QXPartnerConfig {
  heuristics?: {
    enabled: string[];
    weights?: Record<string, number>;
  };
  analysis?: {
    includedAspects: ('qa' | 'ux' | 'business' | 'technical')[];
    depthLevel: 'surface' | 'standard' | 'deep';
    confidenceThreshold: number;
  };
  integrations?: {
    visualTester?: boolean;
    qualityAnalyzer?: boolean;
    testabilityScoring?: boolean;
  };
  stakeholders?: {
    userPersonas?: string[];
    businessRoles?: string[];
    technicalRoles?: string[];
  };
}

// QX Analysis Result
export interface QXAnalysis {
  qxScore: number;
  qaScore: number;
  uxScore: number;
  balanceScore: number;
  dimensions: {
    observability: number;
    controllability: number;
    explainability: number;
    usability: number;
    accessibility: number;
    consistency: number;
  };
  oracleProblems: OracleProblem[];
  recommendations: QXRecommendation[];
  impactMap: ImpactMap;
  metadata: {
    analyzedAt: Date;
    analyzedBy: string;
    confidence: number;
  };
}

export interface OracleProblem {
  id: string;
  description: string;
  context: string;
  expectedBehaviors: string[];
  stakeholders: string[];
  resolution?: {
    recommendation: string;
    rationale: string;
    confidence: number;
    tradeoffs: string[];
  };
}

export interface QXRecommendation {
  id: string;
  type: 'qa' | 'ux' | 'both';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  rationale: string;
  impact: {
    users: string;
    business: string;
    technical: string;
  };
  effort: 'low' | 'medium' | 'high';
  heuristic?: string;
}

export interface ImpactMap {
  visible: {
    ui: string[];
    workflows: string[];
    performance: string[];
  };
  invisible: {
    dataIntegrity: string[];
    security: string[];
    maintainability: string[];
    scalability: string[];
  };
  crossFunctional: {
    documentation: string[];
    training: string[];
    support: string[];
  };
}

export class QXPartnerAgent extends BaseAgent {
  private readonly config: QXPartnerConfig;
  protected readonly logger: Logger = new ConsoleLogger();

  constructor(config: QXPartnerConfig & { 
    context: AgentContext; 
    memoryStore: MemoryStore; 
    eventBus: EventEmitter 
  }) {
    const baseConfig: BaseAgentConfig = {
      type: QEAgentType.QX_PARTNER, // Add to enum first!
      capabilities: [],
      context: config.context,
      memoryStore: config.memoryStore,
      eventBus: config.eventBus,
      enableLearning: true // Enable learning by default
    };
    super(baseConfig);

    // Merge QX-specific config with defaults
    this.config = {
      heuristics: {
        enabled: config.heuristics?.enabled || [
          'rule-of-three',
          'must-not-change',
          'impact-analysis',
          'user-vs-business',
          'oracle-detection'
        ],
        weights: config.heuristics?.weights || {}
      },
      analysis: {
        includedAspects: config.analysis?.includedAspects || ['qa', 'ux', 'business'],
        depthLevel: config.analysis?.depthLevel || 'standard',
        confidenceThreshold: config.analysis?.confidenceThreshold || 0.7
      },
      integrations: {
        visualTester: config.integrations?.visualTester !== false,
        qualityAnalyzer: config.integrations?.qualityAnalyzer !== false,
        testabilityScoring: config.integrations?.testabilityScoring !== false
      },
      stakeholders: config.stakeholders || {}
    };
  }

  // ============================================================================
  // BaseAgent Abstract Methods Implementation
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    this.logger.info(`QXPartnerAgent ${this.agentId.id} initializing components`);

    // Initialize UX heuristics engine
    await this.initializeHeuristicsEngine();

    // Initialize oracle problem detector
    await this.initializeOracleDetector();

    // Initialize impact analysis engine
    await this.initializeImpactAnalyzer();

    // Load UX testing patterns
    await this.loadUXPatterns();

    // Setup integrations with other agents
    if (this.config.integrations?.visualTester) {
      await this.setupVisualTesterIntegration();
    }
    if (this.config.integrations?.qualityAnalyzer) {
      await this.setupQualityAnalyzerIntegration();
    }

    this.logger.info(`QXPartnerAgent ${this.agentId.id} components initialized`);
  }

  protected async performTask(task: QETask): Promise<any> {
    const taskType = task.type;
    const taskData = task.payload;

    switch (taskType) {
      case 'qx-analyze':
        return await this.performQXAnalysis(taskData);
      case 'qx-oracle-resolve':
        return await this.resolveOracleProblem(taskData);
      case 'qx-impact-assess':
        return await this.assessImpact(taskData);
      case 'qx-heuristic-apply':
        return await this.applyHeuristics(taskData);
      case 'qx-stakeholder-balance':
        return await this.balanceStakeholders(taskData);
      case 'qx-ux-test':
        return await this.performUXTest(taskData);
      case 'qx-scenario-generate':
        return await this.generateScenarios(taskData);
      default:
        throw new Error(`Unsupported QX task type: ${taskType}`);
    }
  }

  protected async loadKnowledge(): Promise<void> {
    this.logger.info('Loading QX knowledge base');

    // Load UX heuristics patterns
    const heuristicPatterns = await this.retrieveMemory('ux-heuristics-patterns');
    if (heuristicPatterns) {
      this.logger.info('Loaded UX heuristics patterns from memory');
    } else {
      await this.initializeDefaultHeuristics();
    }

    // Load oracle problem catalog
    const oracleProblems = await this.retrieveSharedMemory(
      QEAgentType.QX_PARTNER,
      'oracle-problem-catalog'
    );
    if (oracleProblems) {
      this.logger.info('Loaded oracle problem catalog');
    }

    // Load stakeholder patterns
    const stakeholderPatterns = await this.retrieveMemory('stakeholder-patterns');
    if (stakeholderPatterns) {
      this.logger.info('Loaded stakeholder patterns');
    }

    this.logger.info('QX knowledge loaded successfully');
  }

  protected async cleanup(): Promise<void> {
    this.logger.info(`QXPartnerAgent ${this.agentId.id} cleaning up resources`);

    // Save current QX analysis state
    await this.saveQXState();

    // Save learned heuristics patterns
    await this.saveHeuristicsPatterns();

    // Save oracle problem resolutions
    await this.saveOracleResolutions();

    this.logger.info(`QXPartnerAgent ${this.agentId.id} cleanup completed`);
  }

  // ============================================================================
  // QX-Specific Implementation Methods
  // ============================================================================

  private async performQXAnalysis(data: any): Promise<QXAnalysis> {
    const { url, userFlows, testResults } = data;

    this.logger.info(`Performing QX analysis on: ${url}`);

    // 1. Get testability scores (QA perspective)
    const testabilityData = await this.getTestabilityScores(url);

    // 2. Get accessibility/UX scores (UX perspective)
    const uxData = await this.getUXScores(url);

    // 3. Detect oracle problems
    const oracleProblems = await this.detectOracleProblems(userFlows);

    // 4. Assess impacts
    const impactMap = await this.buildImpactMap(testResults);

    // 5. Generate recommendations
    const recommendations = await this.generateRecommendations(
      testabilityData,
      uxData,
      oracleProblems,
      impactMap
    );

    // 6. Calculate QX score
    const qxScore = this.calculateQXScore(testabilityData, uxData);

    return {
      qxScore: qxScore.overall,
      qaScore: qxScore.qa,
      uxScore: qxScore.ux,
      balanceScore: qxScore.balance,
      dimensions: {
        observability: testabilityData.observability || 0,
        controllability: testabilityData.controllability || 0,
        explainability: testabilityData.explainability || 0,
        usability: uxData.usability || 0,
        accessibility: uxData.accessibility || 0,
        consistency: uxData.consistency || 0
      },
      oracleProblems,
      recommendations,
      impactMap,
      metadata: {
        analyzedAt: new Date(),
        analyzedBy: this.agentId.id,
        confidence: this.config.analysis?.confidenceThreshold || 0.7
      }
    };
  }

  private async resolveOracleProblem(data: any): Promise<any> {
    // Oracle problem resolution logic
    this.logger.info('Resolving oracle problem');
    // TODO: Implement
    return { resolved: true };
  }

  private async assessImpact(data: any): Promise<ImpactMap> {
    // Impact assessment logic
    this.logger.info('Assessing impact');
    // TODO: Implement
    return {
      visible: { ui: [], workflows: [], performance: [] },
      invisible: { dataIntegrity: [], security: [], maintainability: [], scalability: [] },
      crossFunctional: { documentation: [], training: [], support: [] }
    };
  }

  private async applyHeuristics(data: any): Promise<any> {
    // Apply UX testing heuristics
    this.logger.info('Applying heuristics');
    // TODO: Implement
    return { heuristics: [] };
  }

  private async balanceStakeholders(data: any): Promise<any> {
    // Balance user needs vs business needs
    this.logger.info('Balancing stakeholders');
    // TODO: Implement
    return { balanced: true };
  }

  private async performUXTest(data: any): Promise<any> {
    // Perform UX testing
    this.logger.info('Performing UX test');
    // TODO: Implement
    return { passed: true };
  }

  private async generateScenarios(data: any): Promise<any> {
    // Generate test scenarios
    this.logger.info('Generating scenarios');
    // TODO: Implement
    return { scenarios: [] };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async initializeHeuristicsEngine(): Promise<void> {
    // Initialize UX heuristics engine
    this.logger.debug('Initializing heuristics engine');
    // TODO: Implement
  }

  private async initializeOracleDetector(): Promise<void> {
    // Initialize oracle problem detector
    this.logger.debug('Initializing oracle detector');
    // TODO: Implement
  }

  private async initializeImpactAnalyzer(): Promise<void> {
    // Initialize impact analysis engine
    this.logger.debug('Initializing impact analyzer');
    // TODO: Implement
  }

  private async loadUXPatterns(): Promise<void> {
    // Load UX testing patterns
    this.logger.debug('Loading UX patterns');
    // TODO: Implement
  }

  private async setupVisualTesterIntegration(): Promise<void> {
    // Setup integration with qe-visual-tester
    this.logger.debug('Setting up visual tester integration');
    // TODO: Implement
  }

  private async setupQualityAnalyzerIntegration(): Promise<void> {
    // Setup integration with qe-quality-analyzer
    this.logger.debug('Setting up quality analyzer integration');
    // TODO: Implement
  }

  private async initializeDefaultHeuristics(): Promise<void> {
    // Initialize default UX heuristics
    this.logger.debug('Initializing default heuristics');
    // TODO: Implement
  }

  private async getTestabilityScores(url: string): Promise<any> {
    // Get testability scores from testability-scoring skill
    this.logger.debug(`Getting testability scores for ${url}`);
    // TODO: Invoke testability-scoring skill
    return {
      observability: 85,
      controllability: 75,
      explainability: 80
    };
  }

  private async getUXScores(url: string): Promise<any> {
    // Get UX scores from visual tester
    this.logger.debug(`Getting UX scores for ${url}`);
    // TODO: Coordinate with qe-visual-tester
    return {
      usability: 90,
      accessibility: 85,
      consistency: 88
    };
  }

  private async detectOracleProblems(userFlows: any): Promise<OracleProblem[]> {
    // Detect oracle problems in user flows
    this.logger.debug('Detecting oracle problems');
    // TODO: Implement
    return [];
  }

  private async buildImpactMap(testResults: any): Promise<ImpactMap> {
    // Build impact map from test results
    this.logger.debug('Building impact map');
    // TODO: Implement
    return {
      visible: { ui: [], workflows: [], performance: [] },
      invisible: { dataIntegrity: [], security: [], maintainability: [], scalability: [] },
      crossFunctional: { documentation: [], training: [], support: [] }
    };
  }

  private async generateRecommendations(
    testabilityData: any,
    uxData: any,
    oracleProblems: OracleProblem[],
    impactMap: ImpactMap
  ): Promise<QXRecommendation[]> {
    // Generate QX recommendations
    this.logger.debug('Generating recommendations');
    // TODO: Implement
    return [];
  }

  private calculateQXScore(testabilityData: any, uxData: any): {
    overall: number;
    qa: number;
    ux: number;
    balance: number;
  } {
    // Calculate QX score
    const qaScore = (testabilityData.observability + testabilityData.controllability + testabilityData.explainability) / 3;
    const uxScore = (uxData.usability + uxData.accessibility + uxData.consistency) / 3;
    const balance = 100 - Math.abs(qaScore - uxScore);
    const overall = (qaScore + uxScore + balance) / 3;

    return { overall, qa: qaScore, ux: uxScore, balance };
  }

  private async saveQXState(): Promise<void> {
    // Save QX state
    this.logger.debug('Saving QX state');
    // TODO: Implement
  }

  private async saveHeuristicsPatterns(): Promise<void> {
    // Save heuristics patterns
    this.logger.debug('Saving heuristics patterns');
    // TODO: Implement
  }

  private async saveOracleResolutions(): Promise<void> {
    // Save oracle resolutions
    this.logger.debug('Saving oracle resolutions');
    // TODO: Implement
  }
}
```

---

### 9.2 Type Definition Updates

**File**: `src/types/index.ts`

Add to QEAgentType enum:
```typescript
export enum QEAgentType {
  // ... existing types ...
  QX_PARTNER = 'qx-partner',
}
```

---

### 9.3 Agent Factory Registration

**File**: `src/agents/index.ts`

Add to agent factory:
```typescript
import { QXPartnerAgent } from './QXPartnerAgent';

// In createAgent() function
case QEAgentType.QX_PARTNER:
  return new QXPartnerAgent({
    context: agentConfig?.context || defaultContext,
    memoryStore: agentConfig?.memoryStore || defaultMemoryStore,
    eventBus: agentConfig?.eventBus || defaultEventBus,
    heuristics: agentConfig?.heuristics || {
      enabled: ['rule-of-three', 'must-not-change', 'impact-analysis']
    },
    analysis: agentConfig?.analysis || {
      includedAspects: ['qa', 'ux', 'business'],
      depthLevel: 'standard',
      confidenceThreshold: 0.7
    },
    integrations: agentConfig?.integrations || {
      visualTester: true,
      qualityAnalyzer: true,
      testabilityScoring: true
    }
  });
```

---

### 9.4 Unit Test Template

**File**: `tests/agents/QXPartnerAgent.test.ts`

```typescript
import { QXPartnerAgent } from '@agents/QXPartnerAgent';
import { QEAgentType, AgentContext, MemoryStore } from '@types';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { EventEmitter } from 'events';

describe('QXPartnerAgent', () => {
  let agent: QXPartnerAgent;
  let memoryStore: MemoryStore;
  let eventBus: EventEmitter;

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager();
    await (memoryStore as SwarmMemoryManager).initialize();
    eventBus = new EventEmitter();

    const context: AgentContext = {
      id: 'test-qx-partner',
      type: QEAgentType.QX_PARTNER,
      status: 'initializing' as any,
      metadata: {}
    };

    agent = new QXPartnerAgent({
      context,
      memoryStore,
      eventBus,
      heuristics: {
        enabled: ['rule-of-three', 'must-not-change']
      }
    });
  });

  afterEach(async () => {
    await agent.terminate();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await agent.initialize();
      expect(agent.getStatus()).toBe('active');
    });

    it('should load default heuristics', async () => {
      await agent.initialize();
      // Verify heuristics are loaded
    });
  });

  describe('QX analysis', () => {
    it('should perform QX analysis on URL', async () => {
      await agent.initialize();
      const task = {
        id: 'task-1',
        type: 'qx-analyze',
        payload: {
          url: 'https://example.com',
          userFlows: [],
          testResults: {}
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);
      expect(result).toBeDefined();
      expect(result.qxScore).toBeGreaterThan(0);
    });
  });

  describe('oracle problem resolution', () => {
    it('should resolve oracle problem', async () => {
      await agent.initialize();
      const task = {
        id: 'task-2',
        type: 'qx-oracle-resolve',
        payload: {
          description: 'Unclear expected behavior',
          context: 'User registration flow',
          expectedBehaviors: ['Option A', 'Option B']
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);
      expect(result.resolved).toBe(true);
    });
  });
});
```

---

## Summary & Next Steps

### Key Takeaways

1. **BaseAgent is Production-Ready**: Use it as foundation—1,296 LOC of mature infrastructure
2. **Service-Based Architecture**: Leverage AgentLifecycleManager, AgentCoordinator, AgentMemoryService
3. **Skills System is Rich**: 70+ skills available, including testability-scoring (perfect model)
4. **Type System is Comprehensive**: Strong typing with 20+ agent types, extensible interfaces
5. **Learning is Optional**: Enable PerformanceTracker/LearningEngine for adaptive behavior

### Recommended Next Steps

1. **Create Type Definition**:
   - Add `QX_PARTNER = 'qx-partner'` to `QEAgentType` enum

2. **Implement Agent Skeleton**:
   - Create `src/agents/QXPartnerAgent.ts` using template above
   - Implement 4 abstract methods (initializeComponents, performTask, loadKnowledge, cleanup)

3. **Define Data Structures**:
   - Create `src/types/qx.ts` with QXAnalysis, OracleProblem, QXRecommendation interfaces

4. **Build Core Logic**:
   - Implement UX heuristics engine
   - Implement oracle problem detector
   - Implement impact analyzer

5. **Integrate with Skills**:
   - Connect to testability-scoring skill
   - Connect to qe-visual-tester agent
   - Connect to qe-quality-analyzer agent

6. **Add Learning**:
   - Enable PerformanceTracker for metrics
   - Implement pattern detection for common oracle problems

7. **Write Tests**:
   - Unit tests for agent methods
   - Integration tests with other agents
   - E2E tests for QX workflows

8. **Document**:
   - Create `.claude/agents/qx-partner.md`
   - Update agent matrix documentation
   - Write user guide

### Files to Reference

**Core Agent Files**:
- `src/agents/BaseAgent.ts` (base class)
- `src/agents/QualityAnalyzerAgent.ts` (simple example)
- `src/agents/TestGeneratorAgent.ts` (advanced example)
- `src/agents/LearningAgent.ts` (learning example)

**Service Classes**:
- `src/agents/lifecycle/AgentLifecycleManager.ts`
- `src/agents/coordination/AgentCoordinator.ts`
- `src/agents/memory/AgentMemoryService.ts`

**Type Definitions**:
- `src/types/index.ts` (core types)

**Skills**:
- `.claude/skills/testability-scoring/` (excellent model)
- `.claude/skills/exploratory-testing-advanced/` (UX heuristics)

**Tests**:
- `tests/agents/BaseAgent.lifecycle.test.ts` (test patterns)

---

**END OF REPORT**
