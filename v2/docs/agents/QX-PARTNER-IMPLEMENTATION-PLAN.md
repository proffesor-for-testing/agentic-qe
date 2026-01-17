# QE-QX-Partner Agent Implementation Plan

**Agent Name**: `qe-qx-partner`  
**Purpose**: Quality Experience (QX) co-creation through QA + UX collaboration  
**Date**: December 1, 2025  
**Status**: Planning Phase  
**Estimated Timeline**: 5 weeks

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Goal Breakdown](#goal-breakdown)
3. [Task Hierarchy & Dependencies](#task-hierarchy--dependencies)
4. [Priority Matrix](#priority-matrix)
5. [Implementation Phases](#implementation-phases)
6. [Integration Points](#integration-points)
7. [Skills Requirements](#skills-requirements)
8. [Success Criteria](#success-criteria)
9. [Risk Assessment](#risk-assessment)
10. [Implementation Details](#implementation-details)

---

## Executive Summary

The **qe-qx-partner** agent bridges Quality Advocacy (QA) and User Experience (UX) to solve the fundamental challenge: **"Quality is value to someone who matters"** — and multiple stakeholders matter.

### Core Value Proposition

- **Oracle Problem Resolution**: When testers can't decide quality criteria
- **Stakeholder Balance**: Finding equilibrium between user needs and business needs
- **Early Collaboration**: QA+UX partnership in design phase
- **Comprehensive Analysis**: UX testing heuristics + testability principles
- **Impact Visibility**: Identifying both visible and invisible impacts

### Key Technical Approach

- Extend `BaseAgent` (1,296 LOC battle-tested foundation)
- Integrate with existing agents (visual-tester, quality-analyzer)
- Leverage testability-scoring skill as model
- Optional learning for pattern detection
- Service-based decomposition for maintainability

---

## Goal Breakdown

### Primary Goals

| Goal ID | Goal | Success Measure |
|---------|------|-----------------|
| **G1** | Perform QX analysis combining QA + UX perspectives | QX score generated with 6 dimensions |
| **G2** | Identify and resolve oracle problems | Oracle problems detected and resolution frameworks provided |
| **G3** | Apply UX testing heuristics comprehensively | All 10 UX heuristics evaluated with scores |
| **G4** | Assess visible and invisible impacts | Complete impact map generated |
| **G5** | Balance stakeholder needs | Tradeoff analysis with recommendations |
| **G6** | Generate actionable QX recommendations | Prioritized recommendations with effort/impact |

### Secondary Goals

| Goal ID | Goal | Success Measure |
|---------|------|-----------------|
| **G7** | Learn common oracle problem patterns | Pattern catalog grows over time |
| **G8** | Integrate with existing agent ecosystem | Successful coordination with 3+ agents |
| **G9** | Provide real-time QX feedback | Analysis completes in < 60 seconds |
| **G10** | Support multiple stakeholder personas | Configurable stakeholder models |

---

## Task Hierarchy & Dependencies

```
qe-qx-partner Agent Implementation
│
├── Phase 1: Foundation (Week 1)
│   ├── T1.1: Type System Setup [P0] ⚡
│   │   ├── T1.1.1: Add QX_PARTNER to QEAgentType enum
│   │   ├── T1.1.2: Create src/types/qx.ts with interfaces
│   │   └── T1.1.3: Define QXPartnerConfig interface
│   │
│   ├── T1.2: Agent Skeleton [P0] ⚡
│   │   ├── T1.2.1: Create src/agents/QXPartnerAgent.ts
│   │   ├── T1.2.2: Extend BaseAgent with constructor
│   │   ├── T1.2.3: Implement 4 abstract methods (stubs)
│   │   └── T1.2.4: Add logger and basic config handling
│   │   [DEPENDS ON: T1.1]
│   │
│   ├── T1.3: Agent Registration [P0] ⚡
│   │   ├── T1.3.1: Add to src/agents/index.ts factory
│   │   ├── T1.3.2: Add to agent-system-matrix.md
│   │   └── T1.3.3: Add to agent-availability-matrix.md
│   │   [DEPENDS ON: T1.2]
│   │
│   └── T1.4: Basic Testing [P0] ⚡
│       ├── T1.4.1: Create tests/agents/QXPartnerAgent.test.ts
│       ├── T1.4.2: Write initialization tests
│       └── T1.4.3: Write lifecycle tests
│       [DEPENDS ON: T1.3]
│
├── Phase 2: Core Capabilities (Week 2)
│   ├── T2.1: UX Heuristics Engine [P0] ⚡
│   │   ├── T2.1.1: Design heuristics data model
│   │   ├── T2.1.2: Implement 10 UX heuristics
│   │   ├── T2.1.3: Create heuristics scoring logic
│   │   └── T2.1.4: Add configurable weights
│   │
│   ├── T2.2: Oracle Problem Detector [P0] ⚡
│   │   ├── T2.2.1: Define oracle problem patterns
│   │   ├── T2.2.2: Implement detection algorithms
│   │   ├── T2.2.3: Create resolution framework
│   │   └── T2.2.4: Build stakeholder mapping
│   │   [DEPENDS ON: T2.1]
│   │
│   ├── T2.3: Impact Analysis Engine [P0] ⚡
│   │   ├── T2.3.1: Design impact map structure
│   │   ├── T2.3.2: Implement visible impact detection
│   │   ├── T2.3.3: Implement invisible impact detection
│   │   └── T2.3.4: Add cross-functional impact analysis
│   │
│   ├── T2.4: QX Analysis Implementation [P0] ⚡
│   │   ├── T2.4.1: Implement performQXAnalysis()
│   │   ├── T2.4.2: Implement QX score calculation
│   │   ├── T2.4.3: Implement balance scoring
│   │   └── T2.4.4: Add confidence metrics
│   │   [DEPENDS ON: T2.1, T2.2, T2.3]
│   │
│   └── T2.5: Recommendation Engine [P1] 🔥
│       ├── T2.5.1: Design recommendation structure
│       ├── T2.5.2: Implement priority assignment logic
│       ├── T2.5.3: Add effort estimation
│       └── T2.5.4: Create impact descriptions
│       [DEPENDS ON: T2.4]
│
├── Phase 3: Skills & Integration (Week 3)
│   ├── T3.1: Testability Integration [P0] ⚡
│   │   ├── T3.1.1: Add testability-scoring skill invocation
│   │   ├── T3.1.2: Map testability scores to QA perspective
│   │   └── T3.1.3: Handle testability errors gracefully
│   │
│   ├── T3.2: Visual Tester Integration [P1] 🔥
│   │   ├── T3.2.1: Coordinate with qe-visual-tester agent
│   │   ├── T3.2.2: Get accessibility scores
│   │   ├── T3.2.3: Map UX scores to QX dimensions
│   │   └── T3.2.4: Handle agent communication errors
│   │
│   ├── T3.3: Quality Analyzer Integration [P1] 🔥
│   │   ├── T3.3.1: Coordinate with qe-quality-analyzer
│   │   ├── T3.3.2: Get code quality metrics
│   │   └── T3.3.3: Incorporate into QX analysis
│   │
│   ├── T3.4: QX-Specific Skill [P1] 🔥
│   │   ├── T3.4.1: Create .claude/skills/qx-analysis/
│   │   ├── T3.4.2: Define skill.json manifest
│   │   ├── T3.4.3: Implement qx-heuristics.js
│   │   ├── T3.4.4: Create skill README.md
│   │   └── T3.4.5: Add example configurations
│   │
│   └── T3.5: Multi-Agent Coordination [P2] 📅
│       ├── T3.5.1: Implement coordinator message patterns
│       ├── T3.5.2: Add event-based communication
│       └── T3.5.3: Handle coordination timeouts
│
├── Phase 4: Learning & Intelligence (Week 4)
│   ├── T4.1: Performance Tracking [P1] 🔥
│   │   ├── T4.1.1: Enable PerformanceTracker integration
│   │   ├── T4.1.2: Define QX-specific metrics
│   │   └── T4.1.3: Track analysis quality over time
│   │
│   ├── T4.2: Pattern Learning [P2] 📅
│   │   ├── T4.2.1: Enable LearningEngine integration
│   │   ├── T4.2.2: Implement oracle problem pattern detection
│   │   ├── T4.2.3: Learn common UX issues
│   │   └── T4.2.4: Build recommendation improvement loop
│   │
│   ├── T4.3: AgentDB Integration [P2] 📅
│   │   ├── T4.3.1: Setup AgentDB for QX agent
│   │   ├── T4.3.2: Enable QUIC sync for distributed coordination
│   │   └── T4.3.3: Store QX analysis patterns
│   │
│   └── T4.4: Optimization [P2] 📅
│       ├── T4.4.1: Profile performance bottlenecks
│       ├── T4.4.2: Optimize heuristics evaluation
│       └── T4.4.3: Add caching for repeated analyses
│
└── Phase 5: Documentation & Polish (Week 5)
    ├── T5.1: Agent Documentation [P1] 🔥
    │   ├── T5.1.1: Create .claude/agents/qx-partner.md
    │   ├── T5.1.2: Document QX concepts and principles
    │   ├── T5.1.3: Add configuration reference
    │   └── T5.1.4: Create troubleshooting guide
    │
    ├── T5.2: API Documentation [P1] 🔥
    │   ├── T5.2.1: Generate TypeDoc for QXPartnerAgent
    │   ├── T5.2.2: Document all public interfaces
    │   └── T5.2.3: Add code examples
    │
    ├── T5.3: User Guide [P2] 📅
    │   ├── T5.3.1: Write getting started guide
    │   ├── T5.3.2: Create example workflows
    │   ├── T5.3.3: Add common use cases
    │   └── T5.3.4: Document integration patterns
    │
    ├── T5.4: Testing Coverage [P1] 🔥
    │   ├── T5.4.1: Achieve 80%+ unit test coverage
    │   ├── T5.4.2: Write integration tests
    │   ├── T5.4.3: Create E2E test scenarios
    │   └── T5.4.4: Add performance benchmarks
    │
    └── T5.5: Examples & Demos [P2] 📅
        ├── T5.5.1: Create example task scripts
        ├── T5.5.2: Build demo application
        └── T5.5.3: Record tutorial video
```

### Legend
- ⚡ **P0**: Critical path, must implement
- 🔥 **P1**: High priority, should implement
- 📅 **P2**: Nice-to-have, can defer

---

## Priority Matrix

### P0 - Critical Path (MVP)

| Task | Component | Deliverable | Blocker For |
|------|-----------|-------------|-------------|
| T1.1 | Type System | QX type definitions | T1.2, T1.3 |
| T1.2 | Agent Core | QXPartnerAgent class | T1.3, T2.x |
| T1.3 | Registration | Agent factory integration | T1.4 |
| T1.4 | Testing | Basic test suite | T2.x |
| T2.1 | Heuristics | UX heuristics engine | T2.4 |
| T2.2 | Oracle | Oracle problem detection | T2.4 |
| T2.3 | Impact | Impact analysis engine | T2.4 |
| T2.4 | Analysis | QX analysis implementation | T2.5, T3.x |
| T3.1 | Testability | Skill integration | T2.4 |

**MVP Definition**: Agent can perform basic QX analysis with heuristics and oracle detection.

### P1 - High Priority (Production Ready)

| Task | Component | Deliverable | Adds Value |
|------|-----------|-------------|------------|
| T2.5 | Recommendations | Actionable recommendations | User guidance |
| T3.2 | Visual Tester | UX scores integration | Complete UX perspective |
| T3.3 | Quality | Code quality integration | Complete QA perspective |
| T3.4 | Skills | QX-specific skill | Reusable tooling |
| T4.1 | Performance | Metrics tracking | Quality improvement |
| T5.1 | Docs (Agent) | Agent documentation | Usability |
| T5.2 | Docs (API) | API documentation | Developer experience |
| T5.4 | Tests | Comprehensive testing | Reliability |

**Production Ready Definition**: Agent is reliable, well-tested, documented, and integrates with ecosystem.

### P2 - Nice-to-Have (Future Enhancements)

| Task | Component | Deliverable | Future Value |
|------|-----------|-------------|--------------|
| T3.5 | Coordination | Advanced multi-agent patterns | Scalability |
| T4.2 | Learning | Pattern learning | Intelligence |
| T4.3 | AgentDB | Distributed coordination | Scale |
| T4.4 | Optimization | Performance tuning | Speed |
| T5.3 | User Guide | Comprehensive guide | Onboarding |
| T5.5 | Examples | Demo applications | Marketing |

---

## Implementation Phases

### Phase 1: Foundation (Week 1) - Days 1-5

**Goal**: Agent skeleton with basic lifecycle, registered in framework

**Daily Breakdown**:

**Day 1-2: Type System & Agent Core**
- Create `src/types/qx.ts` with all interfaces
- Add `QX_PARTNER` to `QEAgentType` enum
- Create `QXPartnerAgent.ts` extending `BaseAgent`
- Implement constructor with config validation
- Implement 4 abstract methods (stubs only)

**Day 3: Registration & Factory**
- Add agent to `src/agents/index.ts` factory
- Update documentation matrices
- Verify agent can be instantiated

**Day 4-5: Testing Infrastructure**
- Create `tests/agents/QXPartnerAgent.test.ts`
- Write initialization tests
- Write lifecycle tests (start, stop, terminate)
- Verify test coverage > 60%

**Phase 1 Exit Criteria**:
- ✅ Agent initializes successfully
- ✅ Agent transitions through all lifecycle states
- ✅ Agent can be created via factory
- ✅ Basic tests pass
- ✅ No TypeScript compilation errors

---

### Phase 2: Core Capabilities (Week 2) - Days 6-12

**Goal**: Functional QX analysis with heuristics, oracle detection, and impact assessment

**Daily Breakdown**:

**Day 6-7: UX Heuristics Engine**
- Design heuristics data model
- Implement 10 UX heuristics evaluation:
  1. Rule of Three (similar changes scope)
  2. Must Not Change (critical invariants)
  3. Impact Analysis (visible + invisible)
  4. User vs Business Balance
  5. Oracle Problem Detection
  6. Consistency Check
  7. Accessibility Validation
  8. Usability Assessment
  9. Explainability Evaluation
  10. Controllability Test
- Create scoring logic with configurable weights
- Write unit tests for each heuristic

**Day 8-9: Oracle Problem Detector**
- Define oracle problem patterns:
  - Ambiguous requirements
  - Multiple valid interpretations
  - Stakeholder disagreements
  - Undefined edge cases
- Implement detection algorithms
- Create resolution framework:
  - Identify stakeholders
  - Present tradeoffs
  - Recommend decision criteria
- Build stakeholder mapping logic

**Day 10-11: Impact Analysis Engine**
- Implement visible impact detection:
  - UI changes
  - Workflow modifications
  - Performance impacts
- Implement invisible impact detection:
  - Data integrity
  - Security implications
  - Maintainability concerns
  - Scalability issues
- Add cross-functional analysis:
  - Documentation needs
  - Training requirements
  - Support implications

**Day 12: QX Analysis & Recommendation**
- Implement `performQXAnalysis()` method
- Calculate QX score (QA + UX + Balance)
- Implement recommendation generation
- Add confidence scoring
- Integration testing for end-to-end flow

**Phase 2 Exit Criteria**:
- ✅ All 10 heuristics evaluate successfully
- ✅ Oracle problems detected with resolutions
- ✅ Impact maps generated correctly
- ✅ QX score calculated with 6 dimensions
- ✅ Recommendations include priority, effort, impact
- ✅ Unit tests cover 80%+ of core logic

---

### Phase 3: Skills & Integration (Week 3) - Days 13-19

**Goal**: Integration with existing framework components and agents

**Daily Breakdown**:

**Day 13-14: Testability Integration**
- Invoke `testability-scoring` skill
- Map 10 testability principles to QA perspective:
  - Observability → QX Observability
  - Controllability → QX Controllability
  - Explainability → QX Explainability
  - (others mapped to dimensions)
- Handle skill invocation errors
- Cache testability results
- Write integration tests

**Day 15-16: Agent Coordination**
- Coordinate with `qe-visual-tester`:
  - Get accessibility scores
  - Get visual consistency metrics
  - Get usability heuristics
- Coordinate with `qe-quality-analyzer`:
  - Get code quality metrics
  - Get complexity scores
  - Get maintainability index
- Implement message-based coordination patterns
- Handle timeout and errors gracefully

**Day 17-18: QX-Specific Skill**
- Create `.claude/skills/qx-analysis/` directory
- Create `skill.json` manifest:
  ```json
  {
    "name": "qx-analysis",
    "version": "1.0.0",
    "description": "Quality Experience analysis combining QA and UX",
    "category": "quality",
    "commands": {
      "qx-analyze": "scripts/qx-analyze.js",
      "qx-heuristics": "scripts/qx-heuristics.js",
      "qx-oracle": "scripts/qx-oracle.js"
    }
  }
  ```
- Implement skill scripts
- Create comprehensive README.md
- Add example configurations

**Day 19: Integration Testing**
- End-to-end tests with real skill invocations
- Multi-agent coordination tests
- Performance testing (< 60s for analysis)

**Phase 3 Exit Criteria**:
- ✅ Testability scores integrated successfully
- ✅ Visual tester coordination working
- ✅ Quality analyzer coordination working
- ✅ QX skill installable and functional
- ✅ Integration tests passing
- ✅ Analysis completes in < 60 seconds

---

### Phase 4: Learning & Intelligence (Week 4) - Days 20-26

**Goal**: Adaptive behavior through learning and optimization

**Daily Breakdown**:

**Day 20-21: Performance Tracking**
- Enable `PerformanceTracker` in agent config
- Define QX-specific metrics:
  - Analysis accuracy
  - Oracle resolution success rate
  - Recommendation adoption rate
  - False positive rate
  - Time to analysis
- Implement metric collection hooks
- Create performance dashboard

**Day 22-23: Pattern Learning (Optional)**
- Enable `LearningEngine` integration
- Implement oracle problem pattern detection
- Learn common UX issues by domain
- Build recommendation improvement loop
- Test pattern learning with historical data

**Day 24-25: AgentDB Integration (Optional)**
- Setup AgentDB configuration
- Enable QUIC sync for distributed coordination
- Store QX analysis patterns in AgentDB
- Test multi-instance coordination

**Day 26: Optimization**
- Profile performance bottlenecks
- Optimize heuristics evaluation (parallelization)
- Add caching for repeated analyses
- Optimize agent coordination timeouts

**Phase 4 Exit Criteria**:
- ✅ Performance metrics tracked
- ✅ Learning improves over time (if enabled)
- ✅ Analysis time < 45 seconds (optimized)
- ✅ AgentDB functional (if enabled)
- ✅ No memory leaks

---

### Phase 5: Documentation & Polish (Week 5) - Days 27-31

**Goal**: Production-ready with comprehensive documentation

**Daily Breakdown**:

**Day 27-28: Documentation**
- Create `.claude/agents/qx-partner.md`:
  - QX concepts and principles
  - Configuration reference
  - Task types and payloads
  - Integration patterns
  - Troubleshooting guide
- Generate TypeDoc API documentation
- Add JSDoc comments to all public methods
- Update agent matrix documents

**Day 29-30: Testing & Quality**
- Achieve 80%+ unit test coverage
- Write integration tests for all coordination patterns
- Create E2E test scenarios:
  1. QX analysis of public website
  2. Oracle problem resolution workflow
  3. Multi-agent coordination flow
- Add performance benchmarks
- Fix any remaining bugs

**Day 31: Examples & Release**
- Create example task scripts:
  - `examples/qx-partner/basic-analysis.ts`
  - `examples/qx-partner/oracle-resolution.ts`
  - `examples/qx-partner/multi-agent-flow.ts`
- Build demo application (optional)
- Record tutorial video (optional)
- Prepare release notes
- Update CHANGELOG.md

**Phase 5 Exit Criteria**:
- ✅ All documentation complete
- ✅ Test coverage > 80%
- ✅ All tests passing
- ✅ Examples functional
- ✅ Ready for release

---

## Integration Points

### 1. BaseAgent Framework

**File**: `src/agents/BaseAgent.ts`

**Integration Pattern**:
```typescript
import { BaseAgent, BaseAgentConfig } from './BaseAgent';

export class QXPartnerAgent extends BaseAgent {
  constructor(config: QXPartnerConfig & BaseAgentConfig) {
    super({
      type: QEAgentType.QX_PARTNER,
      capabilities: [...],
      context: config.context,
      memoryStore: config.memoryStore,
      eventBus: config.eventBus,
      enableLearning: true
    });
  }
}
```

**Hooks Used**:
- `initializeComponents()`: Setup heuristics, oracle detector, impact analyzer
- `loadKnowledge()`: Load UX patterns, oracle catalog, stakeholder models
- `performTask()`: Route tasks to appropriate handlers
- `cleanup()`: Save state, patterns, resolutions
- `onPreTask()`, `onPostTask()`: Performance tracking

---

### 2. Service Classes

#### AgentLifecycleManager
**File**: `src/agents/lifecycle/AgentLifecycleManager.ts`

**Usage**: Automatic via BaseAgent
- Status transitions: `INITIALIZING → ACTIVE → BUSY → IDLE`
- State validation
- Thread-safe initialization

#### AgentCoordinator
**File**: `src/agents/coordination/AgentCoordinator.ts`

**Integration**:
```typescript
// Coordinate with visual tester
const uxScores = await this.coordinator.sendMessage(
  { id: 'qe-visual-tester', type: QEAgentType.VISUAL_TESTER, created: new Date() },
  'analyze-accessibility',
  { url: targetUrl },
  'high'
);
```

#### AgentMemoryService
**File**: `src/agents/memory/AgentMemoryService.ts`

**Integration**:
```typescript
// Store QX patterns
await this.memoryService.storeNamespaced('qx-patterns', patterns);

// Retrieve oracle catalog
const catalog = await this.memoryService.retrieveSharedNamespaced(
  QEAgentType.QX_PARTNER,
  'oracle-catalog'
);
```

---

### 3. Skills System

#### Testability-Scoring Skill
**Location**: `.claude/skills/testability-scoring/`

**Integration**:
```typescript
private async getTestabilityScores(url: string): Promise<TestabilityScores> {
  // Option 1: Direct script invocation
  const result = await this.invokeSkill('testability-scoring', {
    url,
    browser: 'chromium'
  });
  
  // Option 2: Run assessment script
  const proc = spawn('.claude/skills/testability-scoring/scripts/run-assessment.sh', [url]);
  
  return parseTestabilityResults(result);
}
```

**Skills to Create**:
1. **qx-analysis** (`.claude/skills/qx-analysis/`)
   - Scripts: `qx-analyze.js`, `qx-heuristics.js`, `qx-oracle.js`
   - UX heuristics evaluation
   - Oracle problem detection
   - Impact assessment

---

### 4. Agent Coordination

#### Visual Tester Agent
**Type**: `QEAgentType.VISUAL_TESTER`

**Coordination**:
```typescript
const visualData = await this.coordinator.sendMessage(
  visualTesterAgent,
  'visual-analysis',
  { url, includeAccessibility: true },
  'high'
);

// Extract UX metrics
const uxScore = {
  usability: visualData.usability || 0,
  accessibility: visualData.accessibility || 0,
  consistency: visualData.consistency || 0
};
```

#### Quality Analyzer Agent
**Type**: `QEAgentType.QUALITY_ANALYZER`

**Coordination**:
```typescript
const qualityData = await this.coordinator.sendMessage(
  qualityAnalyzerAgent,
  'code-analysis',
  { repository, branch: 'main' },
  'medium'
);

// Extract QA metrics
const qaScore = {
  maintainability: qualityData.maintainability || 0,
  complexity: qualityData.complexity || 0,
  coverage: qualityData.coverage?.line || 0
};
```

---

### 5. Memory & State Management

#### Agent-Specific Memory (Namespaced)
```typescript
// Store QX analysis history
await this.storeMemory('qx-analysis-history', analysisResults);

// Retrieve heuristics patterns
const patterns = await this.retrieveMemory('ux-heuristics-patterns');
```

#### Shared Memory (Cross-Agent)
```typescript
// Store oracle problem catalog (shared with all QX agents)
await this.storeSharedMemory(
  QEAgentType.QX_PARTNER,
  'oracle-catalog',
  oracleCatalog
);

// Retrieve shared patterns
const sharedPatterns = await this.retrieveSharedMemory(
  QEAgentType.QX_PARTNER,
  'learned-patterns'
);
```

#### AgentDB (Distributed, Optional)
```typescript
constructor(config: QXPartnerConfig) {
  super({
    ...baseConfig,
    agentDBPath: './data/agentdb/qx-partner',
    enableQUICSync: true,
    syncPort: 5000,
    quantizationType: 'scalar'
  });
}
```

---

### 6. Event System

#### Events Emitted
```typescript
// QX analysis completed
this.coordinator.emitEvent({
  id: generateId(),
  type: 'qx.analysis.completed',
  source: this.agentId,
  timestamp: Date.now(),
  payload: {
    qxScore,
    oracleProblems,
    recommendations
  }
});

// Oracle problem detected
this.coordinator.emitEvent({
  id: generateId(),
  type: 'qx.oracle.detected',
  source: this.agentId,
  timestamp: Date.now(),
  payload: { problem, severity: 'high' }
});
```

#### Events Subscribed
```typescript
protected async initializeComponents(): Promise<void> {
  // Listen for visual analysis updates
  this.eventBus.on('visual.analysis.completed', this.handleVisualUpdate.bind(this));
  
  // Listen for quality gate failures
  this.eventBus.on('quality.gate.failed', this.handleQualityFailure.bind(this));
}
```

---

### 7. Type System Extensions

**File**: `src/types/qx.ts` (NEW)

```typescript
// Export from main types file
// File: src/types/index.ts
export * from './qx';

// Add to QEAgentType enum
export enum QEAgentType {
  // ... existing types ...
  QX_PARTNER = 'qx-partner',
}

// Import in agent
import { 
  QXAnalysis, 
  OracleProblem, 
  QXRecommendation, 
  ImpactMap 
} from '@types/qx';
```

---

## Skills Requirements

### Existing Skills to Leverage

| Skill | Purpose | Integration Priority |
|-------|---------|---------------------|
| **testability-scoring** | Get 10 testability principles scores | P0 ⚡ |
| **accessibility-testing** | Evaluate accessibility compliance | P1 🔥 |
| **exploratory-testing-advanced** | UX heuristics inspiration | P2 📅 |
| **context-driven-testing** | Oracle problem patterns | P2 📅 |
| **holistic-testing-pact** | Stakeholder perspectives | P2 📅 |

### New Skills to Create

#### 1. qx-analysis Skill

**Location**: `.claude/skills/qx-analysis/`

**Purpose**: Standalone QX analysis tooling

**Components**:
```
.claude/skills/qx-analysis/
├── skill.json                      # Skill manifest
├── README.md                       # Documentation
├── scripts/
│   ├── qx-analyze.js              # Main analysis script
│   ├── qx-heuristics.js           # Heuristics evaluation
│   ├── qx-oracle.js               # Oracle detection
│   └── generate-qx-report.js      # HTML report generator
├── config/
│   ├── heuristics.config.js       # Heuristics weights
│   └── oracle-patterns.json       # Oracle problem patterns
└── tests/
    └── qx-analysis.spec.js        # Skill tests
```

**Skill Manifest** (`skill.json`):
```json
{
  "name": "qx-analysis",
  "version": "1.0.0",
  "description": "Quality Experience (QX) analysis combining QA and UX perspectives",
  "category": "quality",
  "author": "Agentic-QE Framework",
  "license": "MIT",
  "commands": {
    "qx-analyze": {
      "script": "scripts/qx-analyze.js",
      "description": "Perform comprehensive QX analysis",
      "parameters": {
        "url": "Target URL to analyze",
        "includeOracle": "Detect oracle problems (default: true)",
        "includeImpact": "Perform impact analysis (default: true)",
        "output": "Output format (json|html|both, default: both)"
      }
    },
    "qx-heuristics": {
      "script": "scripts/qx-heuristics.js",
      "description": "Apply UX testing heuristics",
      "parameters": {
        "url": "Target URL",
        "heuristics": "Specific heuristics to apply (comma-separated)"
      }
    },
    "qx-oracle": {
      "script": "scripts/qx-oracle.js",
      "description": "Detect oracle problems",
      "parameters": {
        "context": "Context description",
        "specifications": "Path to specification files"
      }
    }
  },
  "dependencies": {
    "playwright": "^1.40.0",
    "axe-core": "^4.8.0"
  }
}
```

#### 2. qx-heuristics Skill (Alternative: Part of qx-analysis)

**10 UX Testing Heuristics**:

1. **Rule of Three Heuristic**
   - Detect sets of 3+ similar changes
   - Flag inconsistent patterns
   - Recommend unification

2. **Must Not Change Heuristic**
   - Identify critical invariants
   - Detect breaking changes
   - Assess regression risk

3. **Impact Analysis Heuristic**
   - Map visible impacts (UI, workflows)
   - Map invisible impacts (security, data)
   - Map cross-functional impacts (docs, training)

4. **User vs Business Balance Heuristic**
   - Identify user-centric needs
   - Identify business-centric needs
   - Find equilibrium points

5. **Oracle Problem Detection Heuristic**
   - Detect ambiguous requirements
   - Identify stakeholder conflicts
   - Flag undefined edge cases

6. **Consistency Check Heuristic**
   - Evaluate UI consistency
   - Check terminology consistency
   - Assess behavioral consistency

7. **Accessibility Validation Heuristic**
   - WCAG 2.1 compliance
   - Keyboard navigation
   - Screen reader support

8. **Usability Assessment Heuristic**
   - Task completion efficiency
   - Error recovery
   - Learnability

9. **Explainability Evaluation Heuristic**
   - Clear labels and help text
   - Meaningful error messages
   - System status visibility

10. **Controllability Test Heuristic**
    - User control over actions
    - Undo/redo capabilities
    - Escape routes

---

## Success Criteria

### Phase 1 Success Criteria (Foundation)

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| Agent initializes | Lifecycle test passes | 100% |
| Agent registered | Factory creates instance | ✅ |
| Type system complete | No TypeScript errors | 0 errors |
| Basic tests passing | Test suite runs | 100% pass |
| Documentation started | README exists | ✅ |

### Phase 2 Success Criteria (Core Capabilities)

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| Heuristics functional | All 10 evaluate without errors | 100% |
| Oracle detection works | Detects test cases | 90%+ accuracy |
| Impact maps generated | Covers all 3 categories | 100% |
| QX score calculated | Returns score 0-100 | ✅ |
| Recommendations generated | Includes priority/effort/impact | ✅ |
| Unit test coverage | Line coverage | 80%+ |

### Phase 3 Success Criteria (Integration)

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| Testability integrated | Successfully invokes skill | 100% |
| Visual tester coordinated | Receives UX scores | 95%+ |
| Quality analyzer coordinated | Receives QA metrics | 95%+ |
| QX skill functional | All commands work | 100% |
| Integration tests pass | E2E scenarios | 100% |
| Analysis performance | Time to complete | < 60s |

### Phase 4 Success Criteria (Learning)

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| Performance tracked | Metrics collected | 100% |
| Learning improves accuracy | Accuracy over time | +5% |
| No memory leaks | Memory usage stable | ✅ |
| AgentDB functional | Multi-instance sync | 100% |
| Optimized performance | Analysis time | < 45s |

### Phase 5 Success Criteria (Production Ready)

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| Documentation complete | All sections written | 100% |
| API documented | TypeDoc generated | 100% |
| Test coverage | Overall coverage | 80%+ |
| All tests passing | CI/CD green | 100% |
| Examples functional | Can run without errors | 100% |
| Ready for release | Checklist complete | ✅ |

### Overall Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **QX Analysis Accuracy** | 85%+ | Compare with manual expert analysis |
| **Oracle Detection Rate** | 90%+ | Test against known oracle problems |
| **Recommendation Quality** | 80%+ user satisfaction | User feedback surveys |
| **Analysis Performance** | < 60s for standard site | Automated benchmarks |
| **Integration Reliability** | 95%+ success rate | Monitor coordination failures |
| **Test Coverage** | 80%+ | Jest coverage reports |
| **Code Quality** | A grade | SonarQube analysis |
| **Documentation Completeness** | 100% | Manual checklist |

---

## Risk Assessment

### Technical Risks

| Risk | Severity | Probability | Impact | Mitigation Strategy |
|------|----------|-------------|--------|---------------------|
| **R1: Complexity of UX Heuristics** | High | Medium | High | Start with 5 core heuristics, add 5 more iteratively. Reference established UX frameworks (Nielsen, ISO 9241). |
| **R2: Oracle Problem Detection Accuracy** | High | High | High | Build comprehensive test cases from literature. Start with pattern matching, evolve to ML if needed. Accept initial false positives. |
| **R3: Agent Coordination Failures** | Medium | Medium | High | Implement robust timeout handling, fallback strategies, retry logic. Test with network failures. |
| **R4: Skill Invocation Errors** | Medium | Medium | Medium | Graceful degradation—continue analysis without failed skill. Log errors for debugging. |
| **R5: Performance Bottlenecks** | Medium | Medium | Medium | Profile early, optimize hotspots. Parallelize heuristics evaluation. Cache repeated analyses. |
| **R6: Memory Leaks** | Low | Low | High | Use memory profilers. Clean up event listeners in cleanup(). Test long-running scenarios. |
| **R7: Type System Complexity** | Low | Medium | Low | Keep interfaces simple. Use discriminated unions for variants. Extensive JSDoc comments. |

### Integration Risks

| Risk | Severity | Probability | Impact | Mitigation Strategy |
|------|----------|-------------|--------|---------------------|
| **R8: Visual Tester Unavailable** | Medium | Low | Medium | Fallback to standalone accessibility checks. Degrade gracefully. |
| **R9: Testability Skill Breaking Changes** | Low | Low | Medium | Version lock skill dependencies. Test with multiple skill versions. |
| **R10: EventBus Message Loss** | Low | Low | High | Use message acknowledgment patterns. Add correlation IDs for tracking. |
| **R11: Memory Store Corruption** | Low | Very Low | High | Validate data before storage. Use transactions where possible. Regular backups. |

### Project Risks

| Risk | Severity | Probability | Impact | Mitigation Strategy |
|------|----------|-------------|--------|---------------------|
| **R12: Scope Creep** | High | High | High | Strictly follow P0→P1→P2 priority. Defer P2 features to v2.0. |
| **R13: Timeline Slippage** | Medium | Medium | Medium | Build MVP first (Phase 1-2). Phase 3-5 can extend if needed. |
| **R14: Unclear QX Requirements** | High | Medium | High | Validate with QX literature (Huib Schoots, DEWT). Build prototypes early. |
| **R15: Testing Inadequacy** | Medium | Medium | High | TDD approach. Aim for 80% coverage from Phase 2 onward. |
| **R16: Documentation Debt** | Low | Medium | Medium | Document as you build. Reserve entire Week 5 for documentation. |

### Mitigation Priorities

**Immediate Actions (Week 1)**:
1. ✅ Validate QX concepts with literature review (DONE: research doc exists)
2. ⚡ Create comprehensive test cases for oracle problems
3. ⚡ Setup performance profiling infrastructure
4. ⚡ Define graceful degradation patterns

**Ongoing Actions**:
1. 📊 Monitor test coverage weekly (target: 80%+)
2. 📊 Profile performance after each phase
3. 📊 Review integration patterns with senior developers
4. 📊 Validate QX analysis accuracy against manual reviews

**Contingency Plans**:

**If Oracle Detection Accuracy < 80%**:
- Reduce scope to 5 common oracle patterns
- Add manual override for edge cases
- Plan ML enhancement for v2.0

**If Performance > 60s**:
- Parallelize heuristics evaluation
- Add progressive analysis (quick scan first)
- Implement caching for repeated URLs

**If Integration Fails**:
- Build standalone mode (no agent coordination)
- Use direct skill invocation as fallback
- Provide manual data input option

---

## Implementation Details

### File Structure

```
agentic-qe/
├── src/
│   ├── agents/
│   │   ├── QXPartnerAgent.ts              # [NEW] Main agent implementation
│   │   ├── BaseAgent.ts                   # [EXISTS] Extend from this
│   │   └── index.ts                       # [MODIFY] Add factory case
│   │
│   ├── types/
│   │   ├── index.ts                       # [MODIFY] Add QX_PARTNER enum
│   │   └── qx.ts                          # [NEW] QX-specific types
│   │
│   └── utils/
│       └── qx/                            # [NEW] QX utilities
│           ├── heuristics.ts              # Heuristics engine
│           ├── oracle-detector.ts         # Oracle problem detection
│           └── impact-analyzer.ts         # Impact assessment
│
├── .claude/
│   ├── agents/
│   │   └── qx-partner.md                  # [NEW] Agent documentation
│   │
│   └── skills/
│       └── qx-analysis/                   # [NEW] QX skill
│           ├── skill.json
│           ├── README.md
│           ├── scripts/
│           │   ├── qx-analyze.js
│           │   ├── qx-heuristics.js
│           │   └── qx-oracle.js
│           └── config/
│               ├── heuristics.config.js
│               └── oracle-patterns.json
│
├── tests/
│   ├── agents/
│   │   └── QXPartnerAgent.test.ts         # [NEW] Unit tests
│   │
│   └── integration/
│       └── qx-partner-integration.test.ts # [NEW] Integration tests
│
├── examples/
│   └── qx-partner/                        # [NEW] Example usage
│       ├── basic-analysis.ts
│       ├── oracle-resolution.ts
│       └── multi-agent-flow.ts
│
└── docs/
    ├── agents/
    │   └── QX-PARTNER-IMPLEMENTATION-PLAN.md # [THIS FILE]
    │
    └── research/
        └── QE-QX-PARTNER-AGENT-RESEARCH.md    # [EXISTS] Background research
```

### Code Templates

#### 1. Agent Constructor Template

```typescript
export class QXPartnerAgent extends BaseAgent {
  private readonly config: QXPartnerConfig;
  protected readonly logger: Logger = new ConsoleLogger();
  private heuristicsEngine?: HeuristicsEngine;
  private oracleDetector?: OracleDetector;
  private impactAnalyzer?: ImpactAnalyzer;

  constructor(config: QXPartnerConfig & { 
    context: AgentContext; 
    memoryStore: MemoryStore; 
    eventBus: EventEmitter;
  }) {
    const baseConfig: BaseAgentConfig = {
      type: QEAgentType.QX_PARTNER,
      capabilities: [],
      context: config.context,
      memoryStore: config.memoryStore,
      eventBus: config.eventBus,
      enableLearning: true
    };
    super(baseConfig);

    this.config = this.mergeConfig(config);
  }

  private mergeConfig(config: QXPartnerConfig): QXPartnerConfig {
    return {
      heuristics: {
        enabled: config.heuristics?.enabled || DEFAULT_HEURISTICS,
        weights: config.heuristics?.weights || DEFAULT_WEIGHTS
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
}
```

#### 2. Task Routing Template

```typescript
protected async performTask(task: QETask): Promise<any> {
  const taskType = task.type;
  const taskData = task.payload;

  this.logger.info(`QXPartnerAgent performing task: ${taskType}`);

  try {
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
  } catch (error) {
    this.logger.error(`Task execution failed: ${taskType}`, error);
    throw error;
  }
}
```

#### 3. Integration Pattern Template

```typescript
private async getTestabilityScores(url: string): Promise<TestabilityScores> {
  try {
    this.logger.debug(`Getting testability scores for ${url}`);
    
    // Invoke testability-scoring skill
    const result = await this.invokeSkill('testability-scoring', {
      url,
      browser: 'chromium',
      timeout: 45000
    });
    
    if (!result || !result.principles) {
      throw new Error('Invalid testability scoring result');
    }
    
    // Map to QX dimensions
    return {
      observability: result.principles.observability || 0,
      controllability: result.principles.controllability || 0,
      explainability: result.principles.explainability || 0,
      algorithmic_simplicity: result.principles.algorithmic_simplicity || 0,
      algorithmic_transparency: result.principles.algorithmic_transparency || 0,
      unbugginess: result.principles.unbugginess || 0,
      similarity: result.principles.similarity || 0,
      algorithmic_stability: result.principles.algorithmic_stability || 0,
      smallness: result.principles.smallness || 0,
      decomposability: result.principles.decomposability || 0
    };
  } catch (error) {
    this.logger.warn(`Failed to get testability scores, using defaults`, error);
    return this.getDefaultTestabilityScores();
  }
}

private async invokeSkill(skillName: string, params: any): Promise<any> {
  // Implementation depends on skill invocation pattern
  // Option 1: Direct script execution
  const { spawn } = await import('child_process');
  const proc = spawn('node', [
    `.claude/skills/${skillName}/scripts/${skillName}.js`,
    JSON.stringify(params)
  ]);
  
  return new Promise((resolve, reject) => {
    let output = '';
    proc.stdout.on('data', (data) => output += data);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(JSON.parse(output));
      } else {
        reject(new Error(`Skill invocation failed: ${code}`));
      }
    });
  });
}
```

#### 4. Heuristics Engine Template

```typescript
// File: src/utils/qx/heuristics.ts

export interface HeuristicResult {
  id: string;
  name: string;
  score: number;
  findings: string[];
  recommendations: string[];
  confidence: number;
}

export class HeuristicsEngine {
  private readonly weights: Map<string, number>;
  private readonly logger: Logger;

  constructor(weights: Record<string, number> = {}, logger: Logger) {
    this.weights = new Map(Object.entries(weights));
    this.logger = logger;
  }

  async evaluateAll(context: HeuristicContext): Promise<HeuristicResult[]> {
    const heuristics = [
      this.ruleOfThree,
      this.mustNotChange,
      this.impactAnalysis,
      this.userVsBusiness,
      this.oracleDetection,
      this.consistencyCheck,
      this.accessibilityValidation,
      this.usabilityAssessment,
      this.explainabilityEvaluation,
      this.controllabilityTest
    ];

    const results = await Promise.all(
      heuristics.map(h => h.call(this, context))
    );

    return results;
  }

  private async ruleOfThree(context: HeuristicContext): Promise<HeuristicResult> {
    // Implementation
    return {
      id: 'rule-of-three',
      name: 'Rule of Three',
      score: 85,
      findings: [],
      recommendations: [],
      confidence: 0.9
    };
  }

  // ... other heuristics
}
```

---

## Next Steps

### Immediate Actions (This Week)

1. **Review & Approve Plan** (Day 1)
   - Review this document with team
   - Get stakeholder sign-off
   - Identify any gaps or concerns

2. **Setup Development Environment** (Day 1)
   - Create feature branch: `feature/qx-partner-agent`
   - Setup IDE for TypeScript development
   - Verify all dependencies installed

3. **Start Phase 1 Implementation** (Day 1-2)
   - Create `src/types/qx.ts`
   - Add `QX_PARTNER` to enum
   - Start `QXPartnerAgent.ts` skeleton

### Weekly Milestones

- **End of Week 1**: Phase 1 complete (foundation)
- **End of Week 2**: Phase 2 complete (core capabilities)
- **End of Week 3**: Phase 3 complete (integration)
- **End of Week 4**: Phase 4 complete (learning)
- **End of Week 5**: Phase 5 complete (documentation)

### Success Checkpoints

**Daily Standups**: Report on:
1. Tasks completed yesterday
2. Tasks planned for today
3. Any blockers or risks

**Weekly Reviews**: Assess:
1. Phase completion percentage
2. Test coverage status
3. Integration health
4. Risk mitigation progress

**Phase Gate Reviews**:
1. Demo working functionality
2. Review test results
3. Check documentation
4. Go/No-Go decision for next phase

---

## Appendix

### A. QX Concepts Reference

**Quality Experience (QX)**: The practice of co-creating quality experiences through collaboration between Quality Advocacy (QA) and User Experience (UX) professionals.

**Key Principles**:
1. Quality is "value to someone who matters"
2. Multiple stakeholders matter (users AND builders)
3. Oracle problems require collaborative resolution
4. Early QA+UX collaboration prevents defects
5. Impact analysis must cover visible and invisible changes

**Oracle Problem**: A situation where testers cannot independently decide quality criteria due to ambiguous requirements, multiple valid interpretations, or stakeholder conflicts.

**Testability**: The degree to which a system supports testing, measured across 10 principles (Observability, Controllability, Decomposability, etc.).

### B. References

**Research Documents**:
- `docs/research/QE-QX-PARTNER-AGENT-RESEARCH.md` (1,666 lines)
- Existing agent implementations in `src/agents/`
- Skills in `.claude/skills/testability-scoring/`

**Literature**:
- Huib Schoots: Quality Experience concepts
- DEWT (Dutch Exploratory Workshop on Testing): Oracle problems
- Bach & Bolton: Context-Driven Testing
- ISO 9241: Usability standards
- WCAG 2.1: Accessibility guidelines

### C. Glossary

- **QX**: Quality Experience (QA + UX)
- **QA**: Quality Advocacy (testing perspective)
- **UX**: User Experience (design perspective)
- **Oracle**: Decision authority for expected behavior
- **Heuristic**: Rule of thumb for evaluation
- **Testability**: Ease of testing
- **Impact Map**: Structured view of change consequences
- **Stakeholder**: Person who cares about quality (user, dev, PM, etc.)

---

**Document Control**

- **Version**: 1.0
- **Author**: agent-goal-planner
- **Date**: December 1, 2025
- **Status**: Ready for Implementation
- **Next Review**: After Phase 1 completion

---

**END OF IMPLEMENTATION PLAN**
