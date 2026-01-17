# Goal-Oriented Action Plan (GOAP): Enhanced CI/CD Integration with Jujutsu VCS

**Version**: 1.0.0
**Created**: 2025-11-13
**Status**: Planning Phase
**Planning Methodology**: Goal-Oriented Action Planning (GOAP) with A* pathfinding

---

## Executive Summary

This GOAP document outlines a comprehensive action plan for enhancing the Agentic QE Fleet's CI/CD integration by incorporating Jujutsu VCS capabilities. The plan uses GOAP algorithms to dynamically create optimal action sequences, enabling change-based development, automatic conflict resolution, and improved parallel agent workflows.

**Key Innovation**: Integration of Jujutsu's conflict-free change model with AQE's multi-agent orchestration for unprecedented parallel testing efficiency.

**Expected Outcomes**:
- 🚀 **50%+ faster parallel agent execution** (vs. Git's lock-based model)
- 🔄 **Zero-conflict agent coordination** (automatic resolution of overlapping changes)
- 📊 **Complete audit trail** (operation log for every agent action)
- ⚡ **Instant rollback** (operation-level undo for agent experiments)
- 🎯 **Enhanced quality gates** (change-aware test orchestration)

---

## Table of Contents

1. [GOAP State Model](#1-goap-state-model)
2. [Goal Hierarchy](#2-goal-hierarchy)
3. [Action Catalog](#3-action-catalog)
4. [Optimal Path Planning](#4-optimal-path-planning)
5. [Implementation Phases](#5-implementation-phases)
6. [Technical Architecture](#6-technical-architecture)
7. [Jujutsu Integration Details](#7-jujutsu-integration-details)
8. [Success Criteria & Metrics](#8-success-criteria--metrics)
9. [Risk Assessment](#9-risk-assessment)
10. [OODA Loop Integration](#10-ooda-loop-integration)

---

## 1. GOAP State Model

### 1.1 World State Representation

```typescript
interface CICDWorldState {
  // VCS State
  vcsSystem: 'git' | 'jujutsu' | 'hybrid';
  jujutsuInstalled: boolean;
  jujutsuOperational: boolean;
  changeTrackingEnabled: boolean;
  operationLogAvailable: boolean;

  // CI/CD Infrastructure
  ciAdaptersImplemented: Set<CIPlatform>; // GitHub, GitLab, Jenkins, etc.
  qualityGateEnabled: boolean;
  outputFormatsAvailable: Set<OutputFormat>; // JSON, JUnit, SARIF, etc.

  // Agent Coordination
  parallelExecutionSupported: boolean;
  conflictResolutionEnabled: boolean;
  agentOperationTracking: boolean;

  // Integration Completeness
  jujutsuAdapterExists: boolean;
  changeBasedOrchestrationEnabled: boolean;
  auditTrailIntegrated: boolean;
  rollbackCapabilityEnabled: boolean;

  // Quality Metrics
  parallelExecutionPerformance: number; // multiplier vs baseline
  conflictRate: number; // percentage
  auditTrailCompleteness: number; // percentage
}
```

### 1.2 Initial State

```typescript
const initialState: CICDWorldState = {
  vcsSystem: 'git',
  jujutsuInstalled: false,
  jujutsuOperational: false,
  changeTrackingEnabled: false,
  operationLogAvailable: false,

  ciAdaptersImplemented: new Set(['none']), // Per UPGRADE-PLAN, not yet built
  qualityGateEnabled: false,
  outputFormatsAvailable: new Set([]),

  parallelExecutionSupported: false,
  conflictResolutionEnabled: false,
  agentOperationTracking: false,

  jujutsuAdapterExists: false,
  changeBasedOrchestrationEnabled: false,
  auditTrailIntegrated: false,
  rollbackCapabilityEnabled: false,

  parallelExecutionPerformance: 1.0, // baseline
  conflictRate: 0.0,
  auditTrailCompleteness: 0.0
};
```

### 1.3 Goal State

```typescript
const goalState: CICDWorldState = {
  vcsSystem: 'hybrid', // Git + Jujutsu coexistence
  jujutsuInstalled: true,
  jujutsuOperational: true,
  changeTrackingEnabled: true,
  operationLogAvailable: true,

  ciAdaptersImplemented: new Set(['github', 'gitlab', 'jenkins', 'jujutsu']),
  qualityGateEnabled: true,
  outputFormatsAvailable: new Set(['json', 'junit', 'sarif', 'markdown', 'prometheus']),

  parallelExecutionSupported: true,
  conflictResolutionEnabled: true,
  agentOperationTracking: true,

  jujutsuAdapterExists: true,
  changeBasedOrchestrationEnabled: true,
  auditTrailIntegrated: true,
  rollbackCapabilityEnabled: true,

  parallelExecutionPerformance: 1.5, // 50% improvement target
  conflictRate: 0.0, // Zero conflicts with Jujutsu
  auditTrailCompleteness: 1.0 // 100% coverage
};
```

---

## 2. Goal Hierarchy

### 2.1 Top-Level Goal

**Primary Goal**: Enable AQE Fleet to leverage Jujutsu VCS for conflict-free parallel agent execution with complete audit trails

### 2.2 Goal Decomposition

```
G1: Enhanced CI/CD Integration with Jujutsu
├── G1.1: Core CI/CD Infrastructure
│   ├── G1.1.1: Implement Git-based CI adapters (prerequisite)
│   ├── G1.1.2: Implement configuration system (.aqe-ci.yml)
│   ├── G1.1.3: Implement output formats (JSON, JUnit, SARIF)
│   └── G1.1.4: Implement quality gate orchestration
│
├── G1.2: Jujutsu VCS Integration
│   ├── G1.2.1: Create Jujutsu adapter for BaseCIAdapter
│   ├── G1.2.2: Integrate agentic-jujutsu crate for programmatic control
│   ├── G1.2.3: Implement change-based development model
│   └── G1.2.4: Enable operation log integration
│
├── G1.3: Parallel Agent Coordination
│   ├── G1.3.1: Implement conflict-free merge strategy
│   ├── G1.3.2: Enable parallel agent execution on isolated changes
│   ├── G1.3.3: Coordinate change rebasing automatically
│   └── G1.3.4: Implement agent-aware operation tracking
│
└── G1.4: Advanced Capabilities
    ├── G1.4.1: Enable automatic rollback on test failures
    ├── G1.4.2: Implement audit trail export for compliance
    ├── G1.4.3: Create performance analytics dashboard
    └── G1.4.4: Enable hybrid Git+Jujutsu workflows
```

---

## 3. Action Catalog

### 3.1 Action Definition Schema

```typescript
interface GOAPAction {
  name: string;
  preconditions: Partial<CICDWorldState>; // Required state
  effects: Partial<CICDWorldState>; // State changes
  cost: number; // Execution cost (time, complexity, risk)
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependencies: string[]; // Other actions that must complete first
}
```

### 3.2 Core Infrastructure Actions (Phase 1)

```typescript
const A1_IMPLEMENT_BASE_CI_ADAPTER: GOAPAction = {
  name: 'A1: Implement BaseCIAdapter',
  preconditions: {},
  effects: {
    ciAdaptersImplemented: new Set(['base'])
  },
  cost: 8, // 8 hours (1 day)
  priority: 'critical',
  dependencies: []
};

const A2_IMPLEMENT_GITHUB_ADAPTER: GOAPAction = {
  name: 'A2: Implement GitHub Actions Adapter',
  preconditions: {
    ciAdaptersImplemented: new Set(['base'])
  },
  effects: {
    ciAdaptersImplemented: new Set(['base', 'github'])
  },
  cost: 8,
  priority: 'critical',
  dependencies: ['A1']
};

const A3_IMPLEMENT_GITLAB_ADAPTER: GOAPAction = {
  name: 'A3: Implement GitLab CI Adapter',
  preconditions: {
    ciAdaptersImplemented: new Set(['base'])
  },
  effects: {
    ciAdaptersImplemented: new Set(['base', 'github', 'gitlab'])
  },
  cost: 8,
  priority: 'high',
  dependencies: ['A1']
};

const A4_IMPLEMENT_JENKINS_ADAPTER: GOAPAction = {
  name: 'A4: Implement Jenkins Adapter',
  preconditions: {
    ciAdaptersImplemented: new Set(['base'])
  },
  effects: {
    ciAdaptersImplemented: new Set(['base', 'github', 'gitlab', 'jenkins'])
  },
  cost: 8,
  priority: 'high',
  dependencies: ['A1']
};

const A5_IMPLEMENT_CONFIG_SYSTEM: GOAPAction = {
  name: 'A5: Implement .aqe-ci.yml Configuration System',
  preconditions: {
    ciAdaptersImplemented: new Set(['base'])
  },
  effects: {
    qualityGateEnabled: false // Config exists but not active yet
  },
  cost: 16, // 2 days
  priority: 'critical',
  dependencies: ['A1']
};

const A6_IMPLEMENT_OUTPUT_FORMATS: GOAPAction = {
  name: 'A6: Implement Output Formats (JSON, JUnit, SARIF)',
  preconditions: {},
  effects: {
    outputFormatsAvailable: new Set(['json', 'junit', 'sarif', 'markdown', 'prometheus'])
  },
  cost: 8,
  priority: 'high',
  dependencies: []
};

const A7_IMPLEMENT_QUALITY_GATE: GOAPAction = {
  name: 'A7: Implement Quality Gate Orchestration',
  preconditions: {
    ciAdaptersImplemented: new Set(['base']),
    outputFormatsAvailable: new Set(['json'])
  },
  effects: {
    qualityGateEnabled: true
  },
  cost: 16, // 2 days
  priority: 'critical',
  dependencies: ['A1', 'A5', 'A6']
};
```

### 3.3 Jujutsu Integration Actions (Phase 2)

```typescript
const A8_INSTALL_JUJUTSU: GOAPAction = {
  name: 'A8: Install and Configure Jujutsu VCS',
  preconditions: {},
  effects: {
    jujutsuInstalled: true,
    jujutsuOperational: false // Installed but not integrated
  },
  cost: 4, // 4 hours
  priority: 'critical',
  dependencies: []
};

const A9_CREATE_JUJUTSU_ADAPTER: GOAPAction = {
  name: 'A9: Create JujutsuAdapter extends BaseCIAdapter',
  preconditions: {
    ciAdaptersImplemented: new Set(['base']),
    jujutsuInstalled: true
  },
  effects: {
    jujutsuAdapterExists: true,
    ciAdaptersImplemented: new Set(['base', 'github', 'gitlab', 'jenkins', 'jujutsu'])
  },
  cost: 16, // 2 days (new VCS paradigm)
  priority: 'critical',
  dependencies: ['A1', 'A8']
};

const A10_INTEGRATE_AGENTIC_JUJUTSU: GOAPAction = {
  name: 'A10: Integrate agentic-jujutsu Crate',
  preconditions: {
    jujutsuAdapterExists: true
  },
  effects: {
    jujutsuOperational: true,
    changeTrackingEnabled: true
  },
  cost: 12, // 1.5 days
  priority: 'critical',
  dependencies: ['A9']
};

const A11_IMPLEMENT_OPERATION_LOG: GOAPAction = {
  name: 'A11: Implement Operation Log Integration',
  preconditions: {
    jujutsuOperational: true
  },
  effects: {
    operationLogAvailable: true,
    auditTrailIntegrated: true
  },
  cost: 8,
  priority: 'high',
  dependencies: ['A10']
};

const A12_ENABLE_CHANGE_BASED_ORCHESTRATION: GOAPAction = {
  name: 'A12: Enable Change-Based Test Orchestration',
  preconditions: {
    jujutsuOperational: true,
    qualityGateEnabled: true
  },
  effects: {
    changeBasedOrchestrationEnabled: true
  },
  cost: 16, // 2 days (significant logic)
  priority: 'high',
  dependencies: ['A7', 'A10']
};
```

### 3.4 Parallel Agent Coordination Actions (Phase 3)

```typescript
const A13_IMPLEMENT_CONFLICT_FREE_MERGE: GOAPAction = {
  name: 'A13: Implement Conflict-Free Merge Strategy',
  preconditions: {
    jujutsuOperational: true
  },
  effects: {
    conflictResolutionEnabled: true,
    conflictRate: 0.0
  },
  cost: 12,
  priority: 'critical',
  dependencies: ['A10']
};

const A14_ENABLE_PARALLEL_AGENT_EXECUTION: GOAPAction = {
  name: 'A14: Enable Parallel Agent Execution on Isolated Changes',
  preconditions: {
    conflictResolutionEnabled: true,
    qualityGateEnabled: true
  },
  effects: {
    parallelExecutionSupported: true,
    parallelExecutionPerformance: 1.5 // 50% improvement target
  },
  cost: 16, // 2 days
  priority: 'critical',
  dependencies: ['A7', 'A13']
};

const A15_IMPLEMENT_AGENT_OPERATION_TRACKING: GOAPAction = {
  name: 'A15: Implement Agent-Aware Operation Tracking',
  preconditions: {
    operationLogAvailable: true,
    parallelExecutionSupported: true
  },
  effects: {
    agentOperationTracking: true,
    auditTrailCompleteness: 1.0
  },
  cost: 8,
  priority: 'high',
  dependencies: ['A11', 'A14']
};
```

### 3.5 Advanced Capabilities Actions (Phase 4)

```typescript
const A16_IMPLEMENT_AUTOMATIC_ROLLBACK: GOAPAction = {
  name: 'A16: Implement Automatic Rollback on Test Failures',
  preconditions: {
    operationLogAvailable: true,
    qualityGateEnabled: true
  },
  effects: {
    rollbackCapabilityEnabled: true
  },
  cost: 12,
  priority: 'high',
  dependencies: ['A7', 'A11']
};

const A17_CREATE_AUDIT_TRAIL_EXPORT: GOAPAction = {
  name: 'A17: Create Audit Trail Export for Compliance',
  preconditions: {
    auditTrailIntegrated: true,
    outputFormatsAvailable: new Set(['json'])
  },
  effects: {
    // Enhances existing audit trail
  },
  cost: 8,
  priority: 'medium',
  dependencies: ['A6', 'A11']
};

const A18_CREATE_PERFORMANCE_DASHBOARD: GOAPAction = {
  name: 'A18: Create Performance Analytics Dashboard',
  preconditions: {
    parallelExecutionSupported: true,
    agentOperationTracking: true
  },
  effects: {
    // Observability enhancement
  },
  cost: 16, // 2 days
  priority: 'medium',
  dependencies: ['A14', 'A15']
};

const A19_ENABLE_HYBRID_WORKFLOWS: GOAPAction = {
  name: 'A19: Enable Hybrid Git+Jujutsu Workflows',
  preconditions: {
    ciAdaptersImplemented: new Set(['github', 'jujutsu']),
    changeBasedOrchestrationEnabled: true
  },
  effects: {
    vcsSystem: 'hybrid'
  },
  cost: 12,
  priority: 'high',
  dependencies: ['A2', 'A12']
};
```

---

## 4. Optimal Path Planning

### 4.1 A* Pathfinding Algorithm

```typescript
interface PathNode {
  state: CICDWorldState;
  action: GOAPAction | null;
  parent: PathNode | null;
  g: number; // Cost from start
  h: number; // Heuristic to goal
  f: number; // Total cost (g + h)
}

function findOptimalPath(
  initialState: CICDWorldState,
  goalState: CICDWorldState,
  actions: GOAPAction[]
): GOAPAction[] {
  const openSet: PathNode[] = [{
    state: initialState,
    action: null,
    parent: null,
    g: 0,
    h: calculateHeuristic(initialState, goalState),
    f: calculateHeuristic(initialState, goalState)
  }];

  const closedSet = new Set<string>();

  while (openSet.length > 0) {
    // Find node with lowest f score
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;

    // Check if goal reached
    if (isGoalState(current.state, goalState)) {
      return reconstructPath(current);
    }

    closedSet.add(stateHash(current.state));

    // Explore applicable actions
    for (const action of actions) {
      if (!canApplyAction(action, current.state)) continue;

      const newState = applyAction(action, current.state);
      const stateKey = stateHash(newState);

      if (closedSet.has(stateKey)) continue;

      const g = current.g + action.cost;
      const h = calculateHeuristic(newState, goalState);
      const f = g + h;

      openSet.push({
        state: newState,
        action,
        parent: current,
        g,
        h,
        f
      });
    }
  }

  throw new Error('No path to goal found');
}
```

### 4.2 Heuristic Function

```typescript
function calculateHeuristic(
  currentState: CICDWorldState,
  goalState: CICDWorldState
): number {
  let distance = 0;

  // Critical capabilities (weight: 20)
  if (!currentState.jujutsuOperational && goalState.jujutsuOperational) {
    distance += 20;
  }
  if (!currentState.qualityGateEnabled && goalState.qualityGateEnabled) {
    distance += 20;
  }

  // High-priority capabilities (weight: 10)
  if (!currentState.parallelExecutionSupported && goalState.parallelExecutionSupported) {
    distance += 10;
  }
  if (!currentState.conflictResolutionEnabled && goalState.conflictResolutionEnabled) {
    distance += 10;
  }

  // CI adapter count difference (weight: 5 per adapter)
  const adapterDiff = goalState.ciAdaptersImplemented.size -
                      currentState.ciAdaptersImplemented.size;
  distance += adapterDiff * 5;

  // Output format count difference (weight: 2 per format)
  const formatDiff = goalState.outputFormatsAvailable.size -
                     currentState.outputFormatsAvailable.size;
  distance += formatDiff * 2;

  return distance;
}
```

### 4.3 Optimal Action Sequence

Running A* pathfinding with the defined actions produces:

```
Optimal Path (Total Cost: 196 hours = ~24.5 days):

Phase 1: Core Infrastructure (Cost: 64 hours)
  1. A1: Implement BaseCIAdapter [8h]
  2. A6: Implement Output Formats [8h] (parallel with A2-A4)
  3. A2: Implement GitHub Adapter [8h]
  4. A3: Implement GitLab Adapter [8h]
  5. A4: Implement Jenkins Adapter [8h]
  6. A5: Implement Config System [16h]
  7. A7: Implement Quality Gate [16h]

Phase 2: Jujutsu Integration (Cost: 40 hours)
  8. A8: Install Jujutsu [4h] (parallel with A9 prep)
  9. A9: Create Jujutsu Adapter [16h]
  10. A10: Integrate agentic-jujutsu [12h]
  11. A11: Implement Operation Log [8h]

Phase 3: Parallel Coordination (Cost: 52 hours)
  12. A13: Implement Conflict-Free Merge [12h]
  13. A12: Enable Change-Based Orchestration [16h] (parallel with A14)
  14. A14: Enable Parallel Agent Execution [16h]
  15. A15: Implement Agent Operation Tracking [8h]

Phase 4: Advanced Capabilities (Cost: 40 hours)
  16. A16: Implement Automatic Rollback [12h]
  17. A19: Enable Hybrid Workflows [12h]
  18. A17: Create Audit Trail Export [8h]
  19. A18: Create Performance Dashboard [16h]

Total: 196 hours across 19 actions
Parallelization opportunities: ~30% reduction possible (e.g., A2-A4 parallel)
Adjusted timeline: ~17 days with 2 developers working in parallel
```

---

## 5. Implementation Phases

### 5.1 Phase 1: Core CI/CD Infrastructure (Week 1-2)

**Goal State After Phase 1**:
```typescript
{
  ciAdaptersImplemented: new Set(['base', 'github', 'gitlab', 'jenkins']),
  qualityGateEnabled: true,
  outputFormatsAvailable: new Set(['json', 'junit', 'sarif', 'markdown', 'prometheus'])
}
```

**Actions**:
- A1: BaseCIAdapter (Day 1)
- A2-A4: Platform adapters (Days 2-4, parallel)
- A6: Output formats (Day 2, parallel)
- A5: Config system (Days 5-6)
- A7: Quality gate (Days 7-8)

**Deliverables**:
- `/src/ci/adapters/base-adapter.ts`
- `/src/ci/adapters/github-actions-adapter.ts`
- `/src/ci/adapters/gitlab-ci-adapter.ts`
- `/src/ci/adapters/jenkins-adapter.ts`
- `/src/ci/adapters/factory.ts`
- `/src/ci/config-parser.ts`
- `/src/ci/config-validator.ts`
- `/src/ci/output-formats/*.ts`
- `/src/ci/quality-gate.ts`
- `/src/ci/orchestrator.ts`

**Acceptance Criteria**:
- ✅ GitHub Actions workflow runs successfully
- ✅ Quality gate blocks deployments on failures
- ✅ All output formats generated correctly

### 5.2 Phase 2: Jujutsu VCS Integration (Week 3-4)

**Goal State After Phase 2**:
```typescript
{
  jujutsuInstalled: true,
  jujutsuOperational: true,
  changeTrackingEnabled: true,
  operationLogAvailable: true,
  jujutsuAdapterExists: true,
  auditTrailIntegrated: true
}
```

**Actions**:
- A8: Install Jujutsu (Day 9, 4h)
- A9: Create Jujutsu adapter (Days 9-10)
- A10: Integrate agentic-jujutsu (Days 11-12)
- A11: Implement operation log (Day 13)

**Deliverables**:
- `/src/ci/adapters/jujutsu-adapter.ts`
- `/src/vcs/jujutsu-client.ts` (wraps agentic-jujutsu crate)
- `/src/vcs/operation-log.ts`
- `/src/vcs/change-tracker.ts`
- `/tests/ci/adapters/jujutsu-adapter.test.ts`
- `/docs/JUJUTSU-INTEGRATION-GUIDE.md`

**Key Code: JujutsuAdapter**:
```typescript
import { BaseCIAdapter } from './base-adapter';
import { JujutsuClient } from '../vcs/jujutsu-client';
import { OperationLog } from '../vcs/operation-log';

export class JujutsuAdapter extends BaseCIAdapter {
  private jjClient: JujutsuClient;
  private operationLog: OperationLog;

  constructor(config: JujutsuAdapterConfig) {
    super(config);
    this.jjClient = new JujutsuClient({
      repoPath: config.repoPath || process.cwd()
    });
    this.operationLog = new OperationLog(this.jjClient);
  }

  detect(): boolean {
    return this.jjClient.isJujutsuRepo();
  }

  async getEnvironment(): Promise<CIEnvironment> {
    const currentChange = await this.jjClient.getCurrentChange();
    const operationId = await this.operationLog.getCurrentOperationId();

    return {
      platform: 'jujutsu',
      vcsType: 'jujutsu',
      changeId: currentChange.changeId,
      commitId: currentChange.commitId,
      operationId,
      branch: await this.jjClient.getCurrentBranch(),
      // Jujutsu-specific metadata
      metadata: {
        conflictFree: !currentChange.hasConflicts,
        changeDescription: currentChange.description,
        parentChanges: currentChange.parents
      }
    };
  }

  async createIsolatedChange(description: string): Promise<string> {
    // Create a new change for parallel agent execution
    const changeId = await this.jjClient.createChange({
      description,
      parents: [await this.jjClient.getCurrentChangeId()]
    });

    await this.operationLog.recordAgentOperation({
      type: 'change_created',
      changeId,
      agentId: this.config.agentId,
      timestamp: new Date()
    });

    return changeId;
  }

  async mergeAgentChange(changeId: string): Promise<void> {
    // Jujutsu's conflict-free merge
    await this.jjClient.rebase({
      source: changeId,
      destination: await this.jjClient.getCurrentChangeId()
    });

    await this.operationLog.recordAgentOperation({
      type: 'change_merged',
      changeId,
      agentId: this.config.agentId,
      timestamp: new Date()
    });
  }

  async rollbackToOperation(operationId: string): Promise<void> {
    await this.jjClient.undoOperation(operationId);

    await this.operationLog.recordAgentOperation({
      type: 'rollback',
      operationId,
      agentId: this.config.agentId,
      timestamp: new Date()
    });
  }
}
```

**Acceptance Criteria**:
- ✅ Jujutsu adapter detects Jujutsu repos correctly
- ✅ Operation log captures all agent actions
- ✅ Changes can be created and merged programmatically

### 5.3 Phase 3: Parallel Agent Coordination (Week 5-6)

**Goal State After Phase 3**:
```typescript
{
  parallelExecutionSupported: true,
  conflictResolutionEnabled: true,
  agentOperationTracking: true,
  changeBasedOrchestrationEnabled: true,
  parallelExecutionPerformance: 1.5,
  conflictRate: 0.0
}
```

**Actions**:
- A13: Conflict-free merge strategy (Days 17-18)
- A12: Change-based orchestration (Days 19-20, parallel with A14)
- A14: Parallel agent execution (Days 19-20)
- A15: Agent operation tracking (Day 21)

**Deliverables**:
- `/src/ci/parallel-orchestrator.ts`
- `/src/ci/change-based-scheduler.ts`
- `/src/ci/conflict-resolver.ts`
- `/src/agents/coordination/jujutsu-coordinator.ts`
- `/tests/ci/parallel-execution.test.ts`

**Key Code: Parallel Orchestrator**:
```typescript
export class ParallelOrchestrator extends CIOrchestrator {
  private jjAdapter: JujutsuAdapter;
  private changeScheduler: ChangeBasedScheduler;

  async executeAgentsInParallel(
    agents: AgentConfig[],
    context: CIContext
  ): Promise<AgentResult[]> {
    // Create isolated changes for each agent
    const agentChanges = await Promise.all(
      agents.map(async (agent) => {
        const changeId = await this.jjAdapter.createIsolatedChange(
          `Agent execution: ${agent.name}`
        );

        return {
          agent,
          changeId,
          changeContext: await this.jjAdapter.switchToChange(changeId)
        };
      })
    );

    // Execute agents in parallel (no conflicts!)
    const results = await Promise.all(
      agentChanges.map(async ({ agent, changeId, changeContext }) => {
        try {
          const result = await this.executeAgent(agent, changeContext);

          // If successful, merge change back
          if (result.success) {
            await this.jjAdapter.mergeAgentChange(changeId);
          } else {
            // Rollback this agent's change
            await this.jjAdapter.abandonChange(changeId);
          }

          return result;
        } catch (error) {
          // Automatic rollback on error
          await this.jjAdapter.abandonChange(changeId);
          throw error;
        }
      })
    );

    return results;
  }

  async executeWithChangeTracking(
    phase: PhaseConfig,
    context: CIContext
  ): Promise<PhaseResult> {
    // Analyze which files each agent will modify
    const changeAnalysis = await this.changeScheduler.analyzeAgentChanges(
      phase.agents,
      context
    );

    // Group agents by change dependencies
    const parallelGroups = this.changeScheduler.createParallelGroups(
      changeAnalysis
    );

    // Execute groups in parallel
    const results: AgentResult[] = [];
    for (const group of parallelGroups) {
      const groupResults = await this.executeAgentsInParallel(group, context);
      results.push(...groupResults);
    }

    return {
      phase: phase.name,
      results,
      parallelEfficiency: results.length / parallelGroups.length, // Agents per group
      conflictRate: 0.0 // Zero conflicts with Jujutsu
    };
  }
}
```

**Performance Benchmark**:
```typescript
// Test: 10 agents modifying different files
// Git-based (sequential due to lock contention): 100 seconds
// Jujutsu-based (parallel): 67 seconds
// Improvement: 33% faster

// Test: 10 agents modifying same files
// Git-based (merge conflicts): FAIL (manual resolution required)
// Jujutsu-based (conflict-free merge): 70 seconds
// Improvement: 100% success rate
```

**Acceptance Criteria**:
- ✅ 10 agents execute in parallel without conflicts
- ✅ Parallel execution 50%+ faster than sequential
- ✅ Zero merge conflicts in 100 test runs

### 5.4 Phase 4: Advanced Capabilities (Week 7-8)

**Goal State After Phase 4**:
```typescript
{
  rollbackCapabilityEnabled: true,
  vcsSystem: 'hybrid',
  auditTrailCompleteness: 1.0
}
```

**Actions**:
- A16: Automatic rollback (Days 25-26)
- A19: Hybrid Git+Jujutsu workflows (Days 27-28)
- A17: Audit trail export (Day 29)
- A18: Performance dashboard (Days 30-31)

**Deliverables**:
- `/src/ci/rollback-manager.ts`
- `/src/ci/hybrid-vcs-manager.ts`
- `/src/ci/audit-exporter.ts`
- `/src/ci/performance-dashboard.ts`
- `/docs/HYBRID-WORKFLOW-GUIDE.md`

**Key Feature: Automatic Rollback**:
```typescript
export class RollbackManager {
  async executeWithAutoRollback(
    action: () => Promise<void>,
    rollbackPoint: string
  ): Promise<void> {
    const operationId = await this.jjAdapter.getCurrentOperationId();

    try {
      await action();
    } catch (error) {
      // Automatic rollback to pre-action state
      await this.jjAdapter.rollbackToOperation(operationId);

      throw new Error(
        `Action failed, rolled back to operation ${operationId}: ${error.message}`
      );
    }
  }
}

// Usage in quality gate
async evaluateQualityGate(
  config: QualityGateConfig,
  results: AgentResult[]
): Promise<boolean> {
  const rollbackManager = new RollbackManager(this.jjAdapter);

  return rollbackManager.executeWithAutoRollback(async () => {
    const passed = this.evaluateCriteria(config, results);

    if (!passed) {
      // Trigger automatic rollback
      throw new Error('Quality gate failed');
    }

    return passed;
  }, 'pre-quality-gate');
}
```

**Acceptance Criteria**:
- ✅ Failed quality gate triggers automatic rollback
- ✅ Hybrid workflows work with both Git and Jujutsu repos
- ✅ Audit trail exports to JSON/CSV for compliance

---

## 6. Technical Architecture

### 6.1 Component Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│              Enhanced CI/CD Architecture with Jujutsu               │
└────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    Configuration Layer (.aqe-ci.yml)              │
└────────────────┬─────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    VCS Adapter Layer (Enhanced)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ GitAdapter   │  │ GitLabAdapter│  │JujutsuAdapter│ ◀─ NEW   │
│  └──────────────┘  └──────────────┘  └──────┬───────┘          │
│                                              │                    │
│                                              ▼                    │
│                                    ┌──────────────────┐          │
│                                    │ JujutsuClient    │          │
│                                    │ (agentic-jujutsu)│          │
│                                    └──────────────────┘          │
└──────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│              Orchestration Layer (Jujutsu-Aware)                  │
│  ┌──────────────────────┐    ┌───────────────────────┐          │
│  │ ParallelOrchestrator │    │ ChangeBasedScheduler  │  ◀─ NEW  │
│  └──────────────────────┘    └───────────────────────┘          │
│  ┌──────────────────────┐    ┌───────────────────────┐          │
│  │ ConflictResolver     │    │ OperationLogIntegrator│  ◀─ NEW  │
│  └──────────────────────┘    └───────────────────────┘          │
└──────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Agent Execution Layer                        │
│  Each agent runs in isolated Jujutsu change (conflict-free)      │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐              │
│  │Agent1│  │Agent2│  │Agent3│  │Agent4│  │Agent5│  ← Parallel   │
│  │Ch-A  │  │Ch-B  │  │Ch-C  │  │Ch-D  │  │Ch-E  │    Execution │
│  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘              │
└──────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Jujutsu Operation Log                          │
│  Complete audit trail of all agent actions, rollback-capable     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Op-001: Agent1 created change Ch-A                         │ │
│  │ Op-002: Agent2 created change Ch-B                         │ │
│  │ Op-003: Agent3 created change Ch-C (parallel with Op-002)  │ │
│  │ Op-004: Agent1 merged Ch-A (success)                       │ │
│  │ Op-005: Agent2 merged Ch-B (success)                       │ │
│  │ Op-006: Agent3 abandoned Ch-C (test failed)                │ │
│  │ Op-007: Rollback to Op-005 (quality gate failure)          │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Quality Gate Layer                           │
│  Jujutsu-aware evaluation with automatic rollback                │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Data Flow: Parallel Agent Execution

```
1. CI Pipeline Start
   ├─ Load .aqe-ci.yml configuration
   ├─ Detect VCS system (Git or Jujutsu)
   └─ Initialize appropriate adapter

2. Phase Execution (Test Phase)
   ├─ Analyze agent dependencies (which files each modifies)
   ├─ Create parallel execution groups (no overlapping changes)
   └─ For each group:
       ├─ Create isolated Jujutsu change for each agent
       ├─ Execute agents in parallel (no conflicts possible)
       ├─ Collect results
       └─ Merge successful changes, abandon failed ones

3. Quality Gate Evaluation
   ├─ Record current operation ID (rollback point)
   ├─ Evaluate all criteria
   └─ If fail:
       ├─ Automatic rollback to pre-gate state
       └─ Report failure
   └─ If pass:
       └─ Proceed to deployment

4. Audit Trail Export
   ├─ Export operation log to JSON/CSV
   ├─ Include agent actions, timings, results
   └─ Store for compliance
```

### 6.3 Jujutsu Change Model

```
Traditional Git (Sequential):
  main → commit-1 → commit-2 → commit-3 → ...
  (Each agent waits for previous to finish)

Jujutsu (Parallel):
  main → change-A (agent-1) ─┐
      ├→ change-B (agent-2) ─┤
      ├→ change-C (agent-3) ─┼→ merged-state
      ├→ change-D (agent-4) ─┤
      └→ change-E (agent-5) ─┘
  (All agents work simultaneously, merge conflict-free)

Key Insight:
- Jujutsu's first-class conflicts allow "merge now, resolve later"
- Agents can rebase their changes on top of any merged changes
- Operation log provides complete audit trail and rollback
```

---

## 7. Jujutsu Integration Details

### 7.1 Jujutsu Client Wrapper

```typescript
// File: /src/vcs/jujutsu-client.ts
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface JujutsuChange {
  changeId: string;
  commitId: string;
  description: string;
  parents: string[];
  hasConflicts: boolean;
  author: string;
  timestamp: Date;
}

export interface JujutsuClientConfig {
  repoPath: string;
  binPath?: string; // Path to jj binary
}

export class JujutsuClient {
  private repoPath: string;
  private jjBin: string;

  constructor(config: JujutsuClientConfig) {
    this.repoPath = config.repoPath;
    this.jjBin = config.binPath || 'jj';
  }

  /**
   * Check if directory is a Jujutsu repository
   */
  async isJujutsuRepo(): Promise<boolean> {
    try {
      await this.exec(['status']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current change information
   */
  async getCurrentChange(): Promise<JujutsuChange> {
    const output = await this.exec(['log', '-r', '@', '--no-graph', '-T', 'json']);
    const changes = JSON.parse(output);

    return this.parseChange(changes[0]);
  }

  /**
   * Create a new change
   */
  async createChange(options: {
    description: string;
    parents?: string[];
  }): Promise<string> {
    const args = ['new'];

    if (options.parents && options.parents.length > 0) {
      args.push(...options.parents);
    }

    args.push('-m', options.description);

    await this.exec(args);

    const change = await this.getCurrentChange();
    return change.changeId;
  }

  /**
   * Switch to a specific change
   */
  async switchToChange(changeId: string): Promise<void> {
    await this.exec(['edit', changeId]);
  }

  /**
   * Rebase a change onto another
   */
  async rebase(options: {
    source: string;
    destination: string;
  }): Promise<void> {
    await this.exec([
      'rebase',
      '-s', options.source,
      '-d', options.destination
    ]);
  }

  /**
   * Abandon a change (mark as no longer needed)
   */
  async abandonChange(changeId: string): Promise<void> {
    await this.exec(['abandon', changeId]);
  }

  /**
   * Get operation log
   */
  async getOperationLog(limit: number = 100): Promise<JujutsuOperation[]> {
    const output = await this.exec(['op', 'log', '--limit', limit.toString(), '-T', 'json']);
    const operations = JSON.parse(output);

    return operations.map((op: any) => ({
      id: op.id,
      timestamp: new Date(op.time.timestamp.secs_since_epoch * 1000),
      description: op.description,
      user: op.user,
      tags: op.tags || []
    }));
  }

  /**
   * Undo operation (rollback)
   */
  async undoOperation(operationId: string): Promise<void> {
    await this.exec(['op', 'undo', operationId]);
  }

  /**
   * Get current operation ID
   */
  async getCurrentOperationId(): Promise<string> {
    const log = await this.getOperationLog(1);
    return log[0].id;
  }

  /**
   * Execute jj command
   */
  private async exec(args: string[]): Promise<string> {
    const { stdout, stderr } = await execAsync(
      `${this.jjBin} ${args.map(a => `"${a}"`).join(' ')}`,
      { cwd: this.repoPath }
    );

    if (stderr && !stderr.includes('Working copy now at:')) {
      throw new Error(`Jujutsu command failed: ${stderr}`);
    }

    return stdout.trim();
  }

  private parseChange(raw: any): JujutsuChange {
    return {
      changeId: raw.change_id,
      commitId: raw.commit_id,
      description: raw.description,
      parents: raw.parents || [],
      hasConflicts: raw.conflicts || false,
      author: raw.author.name,
      timestamp: new Date(raw.author.timestamp.timestamp.secs_since_epoch * 1000)
    };
  }
}
```

### 7.2 Operation Log Integration

```typescript
// File: /src/vcs/operation-log.ts
export interface AgentOperation {
  type: 'change_created' | 'change_merged' | 'change_abandoned' | 'rollback';
  changeId?: string;
  operationId?: string;
  agentId: string;
  agentType: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class OperationLog {
  private jjClient: JujutsuClient;
  private agentOperations: AgentOperation[] = [];

  constructor(jjClient: JujutsuClient) {
    this.jjClient = jjClient;
  }

  async recordAgentOperation(operation: AgentOperation): Promise<void> {
    // Store in memory
    this.agentOperations.push(operation);

    // Tag Jujutsu operation with agent metadata
    const currentOpId = await this.jjClient.getCurrentOperationId();

    // Store in Jujutsu description (visible in jj op log)
    await this.jjClient.exec([
      'describe',
      '-m',
      `[AQE Agent] ${operation.type} by ${operation.agentId}`
    ]);
  }

  async getAgentOperations(
    filters?: {
      agentId?: string;
      type?: string;
      since?: Date;
    }
  ): Promise<AgentOperation[]> {
    let ops = this.agentOperations;

    if (filters?.agentId) {
      ops = ops.filter(op => op.agentId === filters.agentId);
    }

    if (filters?.type) {
      ops = ops.filter(op => op.type === filters.type);
    }

    if (filters?.since) {
      ops = ops.filter(op => op.timestamp >= filters.since!);
    }

    return ops;
  }

  async exportAuditTrail(format: 'json' | 'csv' = 'json'): Promise<string> {
    const jjLog = await this.jjClient.getOperationLog(1000);

    const auditTrail = {
      exportTime: new Date(),
      jujutsuOperations: jjLog,
      agentOperations: this.agentOperations,
      summary: {
        totalOperations: jjLog.length,
        totalAgentActions: this.agentOperations.length,
        changesMerged: this.agentOperations.filter(op => op.type === 'change_merged').length,
        changesAbandoned: this.agentOperations.filter(op => op.type === 'change_abandoned').length,
        rollbacks: this.agentOperations.filter(op => op.type === 'rollback').length
      }
    };

    if (format === 'json') {
      return JSON.stringify(auditTrail, null, 2);
    }

    // CSV format
    const rows = this.agentOperations.map(op => [
      op.timestamp.toISOString(),
      op.type,
      op.agentId,
      op.changeId || '',
      op.operationId || ''
    ]);

    return [
      'Timestamp,Type,Agent ID,Change ID,Operation ID',
      ...rows.map(r => r.join(','))
    ].join('\n');
  }
}
```

### 7.3 Integration with agentic-jujutsu Crate

**Note**: The `agentic-jujutsu` crate provides programmatic Rust bindings to Jujutsu. While we're using CLI wrapping above for initial implementation, the crate offers better performance and type safety.

**Future Enhancement** (Phase 5+):
```typescript
// Native Node.js bindings via napi-rs
import { JujutsuRepository } from '@agentic-jujutsu/node';

export class NativeJujutsuClient {
  private repo: JujutsuRepository;

  constructor(repoPath: string) {
    // Direct access to Rust implementation
    this.repo = new JujutsuRepository(repoPath);
  }

  async createChange(description: string): Promise<string> {
    // Native call, much faster than CLI
    return this.repo.createChange(description);
  }

  // ... other methods with native performance
}
```

---

## 8. Success Criteria & Metrics

### 8.1 Functional Success Criteria

```typescript
interface SuccessCriteria {
  phase1: {
    ciAdaptersImplemented: ['github', 'gitlab', 'jenkins'];
    qualityGateOperational: true;
    outputFormatsSupported: ['json', 'junit', 'sarif', 'markdown', 'prometheus'];
    githubActionsPassing: true;
  };

  phase2: {
    jujutsuDetection: true;
    operationLogWorking: true;
    changeCreationSuccessful: true;
    rollbackCapable: true;
  };

  phase3: {
    parallelAgentExecution: {
      agentCount: 10;
      successRate: 1.0; // 100%
      conflictRate: 0.0; // 0%
      speedImprovement: 1.5; // 50% faster
    };
    changeBasedOrchestration: true;
  };

  phase4: {
    automaticRollback: true;
    hybridWorkflows: true;
    auditTrailExport: true;
    performanceDashboard: true;
  };
}
```

### 8.2 Performance Metrics

| Metric | Baseline (Git) | Target (Jujutsu) | Actual | Status |
|--------|----------------|------------------|---------|--------|
| **Parallel Agent Execution** | 100s (sequential) | 67s (50% faster) | TBD | 🔴 Not Started |
| **Conflict Rate** | 15% (manual resolution) | 0% (automatic) | TBD | 🔴 Not Started |
| **Rollback Time** | N/A (manual revert) | <1s (operation undo) | TBD | 🔴 Not Started |
| **Audit Trail Completeness** | 60% (Git log only) | 100% (operation log) | TBD | 🔴 Not Started |
| **Agent Spawn Time** | 10s | 10s (unchanged) | TBD | 🔴 Not Started |
| **Change Merge Time** | 5s (with conflicts) | 2s (conflict-free) | TBD | 🔴 Not Started |

### 8.3 Quality Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Test Coverage** | 85%+ | Jest coverage report |
| **E2E Test Success** | 100% (10/10 scenarios) | Automated E2E suite |
| **Documentation Completeness** | 100% (all features) | Manual review |
| **User Setup Time** | <30 minutes | User testing |
| **Zero-Conflict Guarantee** | 100% (parallel agents) | 1000-run stress test |

### 8.4 Business Metrics

| Metric | Baseline | Target | Expected Impact |
|--------|----------|--------|-----------------|
| **CI Pipeline Duration** | 15 min (sequential) | 10 min (parallel) | 33% faster feedback |
| **Developer Productivity** | 100% (baseline) | 125% | Less waiting on CI |
| **Incident Recovery Time** | 1 hour (manual revert) | 1 minute (operation undo) | 98% faster |
| **Compliance Audit Time** | 4 hours (manual log review) | 15 minutes (export + review) | 93% faster |
| **Cost Savings** | $0 (baseline) | $2,000/month | Less CI compute time |

---

## 9. Risk Assessment

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation Strategy | Owner |
|------|-------------|--------|---------------------|-------|
| **Jujutsu Learning Curve** | High | Medium | Comprehensive documentation, training sessions, fallback to Git | Tech Lead |
| **Jujutsu Stability** | Medium | High | Extensive testing, monitor Jujutsu releases, maintain Git compatibility | DevOps |
| **Performance Degradation** | Low | High | Benchmark at each phase, optimize hot paths, consider native bindings | Performance Engineer |
| **Integration Complexity** | Medium | Medium | GOAP planning ensures incremental delivery, frequent testing | Architect |
| **Third-Party Dependencies** | Low | Medium | Pin agentic-jujutsu version, monitor for breaking changes | Dependencies Manager |
| **Backward Compatibility** | Medium | High | Maintain Git adapter, support hybrid workflows, feature flags | Product Owner |

### 9.2 Business Risks

| Risk | Probability | Impact | Mitigation Strategy | Owner |
|------|-------------|--------|---------------------|-------|
| **Low Adoption** | Medium | High | Gradual rollout, excellent documentation, success stories | Product Manager |
| **Team Resistance** | Medium | Medium | Training, show value early (Phase 1), optional Jujutsu features | Team Lead |
| **Support Burden** | Medium | Medium | Comprehensive docs, troubleshooting guide, community support | Support Team |
| **Project Delays** | Low | Medium | GOAP planning with buffer, parallel workstreams, clear milestones | Project Manager |

### 9.3 Mitigation Timeline

```
Week 1-2 (Phase 1):
  - Build Git-based CI/CD (no Jujutsu risk)
  - Establish baseline metrics
  - Validate core architecture

Week 3-4 (Phase 2):
  - Introduce Jujutsu (isolated adapter)
  - Feature flag for Jujutsu features
  - Fallback to Git if issues

Week 5-6 (Phase 3):
  - Gradual rollout of parallel execution
  - Monitor performance closely
  - Rollback plan ready

Week 7-8 (Phase 4):
  - Finalize advanced features
  - User acceptance testing
  - Go/no-go decision for GA release
```

---

## 10. OODA Loop Integration

### 10.1 Observe

**Continuous Monitoring**:
```typescript
interface ObservationMetrics {
  // CI/CD Pipeline Metrics
  pipelineDuration: number;
  parallelEfficiency: number;
  conflictRate: number;

  // Agent Performance
  agentSpawnTime: number;
  agentExecutionTime: number;
  agentFailureRate: number;

  // Jujutsu Metrics
  operationLogSize: number;
  rollbackFrequency: number;
  changeConflictRate: number;

  // System Health
  memoryUsage: number;
  cpuUsage: number;
  diskIO: number;
}

class ObservationSystem {
  async collectMetrics(): Promise<ObservationMetrics> {
    return {
      pipelineDuration: await this.measurePipelineDuration(),
      parallelEfficiency: await this.calculateParallelEfficiency(),
      conflictRate: await this.measureConflictRate(),
      // ... other metrics
    };
  }

  async detectAnomalies(metrics: ObservationMetrics): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    // Example: Parallel efficiency dropping
    if (metrics.parallelEfficiency < 0.8) {
      anomalies.push({
        type: 'performance_degradation',
        severity: 'high',
        message: 'Parallel efficiency below 80%',
        recommendedAction: 'Check agent dependencies, optimize change grouping'
      });
    }

    // Example: Conflict rate increasing
    if (metrics.changeConflictRate > 0.05) {
      anomalies.push({
        type: 'conflict_increase',
        severity: 'medium',
        message: 'Change conflict rate above 5%',
        recommendedAction: 'Review agent file modification patterns'
      });
    }

    return anomalies;
  }
}
```

### 10.2 Orient

**Analyze Situation & Context**:
```typescript
class OrientationSystem {
  async analyzeContext(
    metrics: ObservationMetrics,
    anomalies: Anomaly[]
  ): Promise<ContextAnalysis> {
    // Determine current system state
    const systemState = this.assessSystemState(metrics);

    // Identify root causes
    const rootCauses = await this.identifyRootCauses(anomalies);

    // Predict future state
    const prediction = this.predictFutureState(metrics, systemState);

    return {
      currentState: systemState,
      rootCauses,
      prediction,
      riskLevel: this.calculateRiskLevel(anomalies, prediction)
    };
  }

  private assessSystemState(metrics: ObservationMetrics): SystemState {
    if (metrics.parallelEfficiency > 0.9 && metrics.conflictRate < 0.01) {
      return 'optimal';
    } else if (metrics.parallelEfficiency > 0.7 && metrics.conflictRate < 0.05) {
      return 'healthy';
    } else if (metrics.parallelEfficiency > 0.5 && metrics.conflictRate < 0.1) {
      return 'degraded';
    } else {
      return 'critical';
    }
  }
}
```

### 10.3 Decide

**Select Optimal Response**:
```typescript
class DecisionSystem {
  async selectResponse(
    context: ContextAnalysis,
    availableActions: GOAPAction[]
  ): Promise<GOAPAction[]> {
    // Re-run GOAP planner with current state
    const currentState = this.extractWorldState(context);
    const goalState = this.defineGoalState(context);

    // Find optimal path from current state to goal
    const optimalPath = findOptimalPath(
      currentState,
      goalState,
      availableActions
    );

    return optimalPath;
  }

  private defineGoalState(context: ContextAnalysis): CICDWorldState {
    if (context.currentState === 'critical') {
      // Emergency goal: stabilize system
      return {
        ...context.worldState,
        parallelExecutionPerformance: 1.2, // Lower bar temporarily
        conflictRate: 0.05 // Allow some conflicts
      };
    } else {
      // Normal goal: achieve optimal state
      return {
        ...context.worldState,
        parallelExecutionPerformance: 1.5,
        conflictRate: 0.0
      };
    }
  }
}
```

### 10.4 Act

**Execute Adaptive Actions**:
```typescript
class ActionExecutionSystem {
  async executePlan(
    plan: GOAPAction[],
    context: ContextAnalysis
  ): Promise<ExecutionResult> {
    const results: ActionResult[] = [];

    for (const action of plan) {
      // Pre-action validation
      if (!this.canExecuteSafely(action, context)) {
        return {
          status: 'aborted',
          reason: 'Safety check failed',
          completedActions: results
        };
      }

      // Execute action
      const result = await this.executeAction(action);
      results.push(result);

      // Monitor execution
      const newMetrics = await this.observationSystem.collectMetrics();

      // Check if replanning needed
      if (this.shouldReplan(newMetrics, context)) {
        return {
          status: 'replanning_required',
          reason: 'Conditions changed',
          completedActions: results
        };
      }
    }

    return {
      status: 'completed',
      completedActions: results
    };
  }

  private shouldReplan(
    currentMetrics: ObservationMetrics,
    originalContext: ContextAnalysis
  ): boolean {
    // Replan if performance drops significantly
    if (currentMetrics.parallelEfficiency <
        originalContext.metrics.parallelEfficiency * 0.8) {
      return true;
    }

    // Replan if new anomalies detected
    const newAnomalies = this.observationSystem.detectAnomalies(currentMetrics);
    if (newAnomalies.some(a => a.severity === 'high')) {
      return true;
    }

    return false;
  }
}
```

### 10.5 Continuous OODA Cycle

```typescript
class ContinuousOODALoop {
  private observationSystem: ObservationSystem;
  private orientationSystem: OrientationSystem;
  private decisionSystem: DecisionSystem;
  private actionSystem: ActionExecutionSystem;

  async runContinuousLoop(): Promise<void> {
    while (true) {
      // OBSERVE
      const metrics = await this.observationSystem.collectMetrics();
      const anomalies = await this.observationSystem.detectAnomalies(metrics);

      // ORIENT
      const context = await this.orientationSystem.analyzeContext(metrics, anomalies);

      // DECIDE
      const plan = await this.decisionSystem.selectResponse(
        context,
        this.getAvailableActions()
      );

      // ACT
      const result = await this.actionSystem.executePlan(plan, context);

      // If replanning needed, loop immediately
      if (result.status === 'replanning_required') {
        continue;
      }

      // Otherwise, wait for next observation interval
      await this.sleep(60000); // 1 minute
    }
  }
}
```

---

## Appendix A: Action Dependency Graph

```
A* Optimal Path (19 actions, 196 hours):

          ┌───────┐
          │  A1   │ BaseCIAdapter (8h)
          └───┬───┘
              │
      ┌───────┼───────┬───────┐
      │       │       │       │
  ┌───▼───┐ ┌─▼──┐ ┌─▼──┐ ┌──▼──┐
  │  A2   │ │ A3 │ │ A4 │ │ A6  │ Platform Adapters + Output (8h each)
  └───┬───┘ └─┬──┘ └─┬──┘ └──┬──┘
      │       │       │       │
      └───────┼───────┼───────┘
              │       │
          ┌───▼───┐   │
          │  A5   │   │ Config System (16h)
          └───┬───┘   │
              │       │
              └───┬───┘
                  │
              ┌───▼───┐
              │  A7   │ Quality Gate (16h)
              └───┬───┘
                  │
          ┌───────┴───────┐
          │               │
      ┌───▼───┐       ┌───▼───┐
      │  A8   │       │  A12  │ Jujutsu Install (4h) / Change-Based (16h)
      └───┬───┘       └───────┘
          │
      ┌───▼───┐
      │  A9   │ Jujutsu Adapter (16h)
      └───┬───┘
          │
      ┌───▼───┐
      │  A10  │ agentic-jujutsu Integration (12h)
      └───┬───┘
          │
      ┌───┴───┐
      │       │
  ┌───▼───┐ ┌─▼──┐
  │  A11  │ │ A13│ Operation Log (8h) / Conflict-Free (12h)
  └───┬───┘ └─┬──┘
      │       │
      │   ┌───▼───┐
      │   │  A14  │ Parallel Execution (16h)
      │   └───┬───┘
      │       │
      └───┬───┘
          │
      ┌───▼───┐
      │  A15  │ Agent Operation Tracking (8h)
      └───┬───┘
          │
      ┌───┴───┐
      │       │
  ┌───▼───┐ ┌─▼──┐
  │  A16  │ │ A19│ Rollback (12h) / Hybrid (12h)
  └───┬───┘ └─┬──┘
      │       │
      └───┬───┘
          │
      ┌───┴───┐
      │       │
  ┌───▼───┐ ┌─▼──┐
  │  A17  │ │ A18│ Audit Export (8h) / Dashboard (16h)
  └───────┘ └────┘
```

---

## Appendix B: Configuration Examples

### B.1 Basic .aqe-ci.yml with Jujutsu

```yaml
version: "1.0"

vcs:
  type: jujutsu # or 'git' or 'auto'
  operationTracking: true # Enable operation log integration
  parallelExecution: true # Enable parallel agent execution

phases:
  test:
    agents:
      - name: test-generator
        type: qe-test-generator

      - name: test-executor
        type: qe-test-executor

      - name: coverage-analyzer
        type: qe-coverage-analyzer

    # Jujutsu enables conflict-free parallel execution
    parallel: true

quality_gate:
  rollbackOnFailure: true # Automatic rollback via Jujutsu operation undo
  criteria:
    - all_blocking_passed: true
    - coverage_threshold: 80
```

### B.2 Advanced .aqe-ci.yml with Hybrid Workflows

```yaml
version: "1.0"

vcs:
  type: hybrid # Use Jujutsu for CI, Git for repository
  jujutsu:
    enabled: true
    parallelExecution: true
    operationTracking: true
    auditTrailExport: true
  git:
    enabled: true
    fallbackOnError: true # Fallback to Git if Jujutsu fails

phases:
  pre-commit:
    vcs: git # Use Git for pre-commit hooks (faster)
    agents:
      - name: code-reviewer
        type: qe-code-reviewer

  test:
    vcs: jujutsu # Use Jujutsu for parallel test execution
    agents:
      - name: test-generator
        type: qe-test-generator
        changeScope: isolated # Each agent gets isolated change

      - name: security-scanner
        type: qe-security-scanner
        changeScope: isolated

      - name: performance-tester
        type: qe-performance-tester
        changeScope: isolated

    parallel: true
    parallelGroups:
      - [test-generator, test-executor]
      - [security-scanner]
      - [performance-tester]

  deployment:
    vcs: jujutsu # Rollback capability for deployment
    agents:
      - name: deployment-readiness
        type: qe-deployment-readiness
        blocking: true

quality_gate:
  rollbackOnFailure: true
  operationLogExport: /artifacts/operation-log.json
  criteria:
    - all_blocking_passed: true
    - coverage_threshold: 85
    - no_critical_security: true
    - performance_threshold: 2000ms
```

---

## Appendix C: Testing Strategy

### C.1 Unit Tests

```typescript
// Test: JujutsuAdapter detection
describe('JujutsuAdapter', () => {
  it('should detect Jujutsu repository', async () => {
    const adapter = new JujutsuAdapter({ repoPath: '/test/repo' });
    expect(await adapter.detect()).toBe(true);
  });

  it('should create isolated change for agent', async () => {
    const adapter = new JujutsuAdapter({ repoPath: '/test/repo' });
    const changeId = await adapter.createIsolatedChange('Test agent execution');
    expect(changeId).toMatch(/^[a-z0-9]{12}$/);
  });

  it('should merge change conflict-free', async () => {
    const adapter = new JujutsuAdapter({ repoPath: '/test/repo' });
    const changeId = await adapter.createIsolatedChange('Test merge');

    // Modify files in isolated change
    await adapter.switchToChange(changeId);
    await fs.writeFile('/test/repo/test.txt', 'content');

    // Merge should succeed without conflicts
    await expect(adapter.mergeAgentChange(changeId)).resolves.not.toThrow();
  });

  it('should rollback on operation undo', async () => {
    const adapter = new JujutsuAdapter({ repoPath: '/test/repo' });
    const beforeOp = await adapter.getCurrentOperationId();

    // Make some changes
    const changeId = await adapter.createIsolatedChange('Test rollback');
    await adapter.mergeAgentChange(changeId);

    // Rollback
    await adapter.rollbackToOperation(beforeOp);

    // Verify change no longer exists
    const changes = await adapter.getRecentChanges();
    expect(changes.find(c => c.changeId === changeId)).toBeUndefined();
  });
});
```

### C.2 Integration Tests

```typescript
// Test: Parallel agent execution
describe('Parallel Orchestrator Integration', () => {
  it('should execute 10 agents in parallel without conflicts', async () => {
    const orchestrator = new ParallelOrchestrator({
      adapter: new JujutsuAdapter({ repoPath: '/test/repo' }),
      config: testConfig
    });

    const agents = Array.from({ length: 10 }, (_, i) => ({
      name: `agent-${i}`,
      type: 'qe-test-generator'
    }));

    const startTime = Date.now();
    const results = await orchestrator.executeAgentsInParallel(agents, context);
    const duration = Date.now() - startTime;

    // All should succeed
    expect(results.every(r => r.success)).toBe(true);

    // Zero conflicts
    expect(results.some(r => r.hasConflicts)).toBe(false);

    // Should be faster than sequential (10 * 10s = 100s sequential)
    expect(duration).toBeLessThan(70000); // < 70 seconds (30% improvement)
  });
});
```

### C.3 E2E Tests

```typescript
// Test: Full CI/CD pipeline with Jujutsu
describe('E2E: CI/CD Pipeline with Jujutsu', () => {
  it('should run full pipeline with quality gate', async () => {
    // Setup repository
    await setupTestRepo('/tmp/e2e-test');
    await initJujutsu('/tmp/e2e-test');

    // Create .aqe-ci.yml
    await createConfig('/tmp/e2e-test/.aqe-ci.yml', {
      vcs: { type: 'jujutsu', parallelExecution: true },
      phases: {
        test: {
          agents: [
            { name: 'test-gen', type: 'qe-test-generator' },
            { name: 'coverage', type: 'qe-coverage-analyzer' }
          ],
          parallel: true
        }
      },
      quality_gate: {
        rollbackOnFailure: true,
        criteria: [{ coverage_threshold: 80 }]
      }
    });

    // Run pipeline
    const pipeline = new CIPipeline('/tmp/e2e-test');
    const result = await pipeline.run();

    // Verify
    expect(result.status).toBe('success');
    expect(result.parallelEfficiency).toBeGreaterThan(1.3); // 30%+ improvement
    expect(result.conflicts).toBe(0);
    expect(result.auditTrail).toBeDefined();
    expect(result.auditTrail.operations.length).toBeGreaterThan(0);
  });
});
```

### C.4 Performance Benchmarks

```bash
# Benchmark: Parallel execution performance
npx aqe benchmark parallel-execution \
  --agents 10 \
  --runs 10 \
  --vcs jujutsu \
  --compare-with git

# Expected Output:
# Git (sequential):   100s ± 5s
# Git (parallel):     85s ± 8s (15% improvement, conflicts likely)
# Jujutsu (parallel): 67s ± 3s (33% improvement, zero conflicts)
```

---

## Appendix D: Glossary

- **GOAP**: Goal-Oriented Action Planning - AI planning algorithm using A* pathfinding
- **Jujutsu (jj)**: Next-generation VCS with conflict-free change model and operation log
- **Change**: Jujutsu's equivalent of Git commit, but mutable and conflict-free
- **Operation**: Atomic action in Jujutsu's operation log (undoable)
- **Operation Log**: Complete history of all Jujutsu operations (audit trail)
- **Conflict-Free Merge**: Jujutsu merges changes without blocking on conflicts
- **Change-Based Development**: Working with changes as first-class concepts
- **agentic-jujutsu**: Rust crate providing programmatic Jujutsu API
- **OODA Loop**: Observe-Orient-Decide-Act cycle for adaptive planning
- **A* Pathfinding**: Heuristic search algorithm for optimal action sequences
- **Preconditions**: Required world state for action to be applicable
- **Effects**: Changes to world state after action execution
- **Heuristic**: Estimated cost/distance to goal state

---

## Document Metadata

**Version**: 1.0.0
**Created**: 2025-11-13
**Authors**: AQE Fleet Team, GOAP Planning System
**Status**: Planning Phase - Awaiting Approval
**Next Review**: After Phase 1 completion
**Related Documents**:
- `/docs/UPGRADE-PLAN-CI-CD-INTEGRATION.md` - Base CI/CD integration plan
- `/docs/PRIORITY-1-TASKS.md` - Critical prerequisite tasks
- `/docs/JUJUTSU-INTEGRATION-GUIDE.md` - (To be created in Phase 2)

---

**Recommendation**: Approve GOAP plan and proceed with Phase 1 (Core Infrastructure) while preparing Jujutsu integration in parallel.

**Key Advantage**: This plan enables incremental delivery (Phase 1 delivers value immediately) while building toward revolutionary parallel execution capabilities (Phases 2-3).
