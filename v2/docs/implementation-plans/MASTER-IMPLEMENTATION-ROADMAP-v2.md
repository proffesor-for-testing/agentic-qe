# Master Implementation Roadmap v2.0
**Agentic QE Fleet - Consolidated Implementation Plan**

**Date:** October 17, 2025
**Status:** READY FOR EXECUTION
**Version:** 2.0 (Revised - Memory System Already Complete)

---

## Executive Summary

This master implementation roadmap consolidates three high-priority improvement tracks:

1. **Test Coverage & Infrastructure Fixes** (106-144 hours)
2. **Deployment Readiness for v1.1.0** (12-16 hours)
3. **QE Fleet Enhancements** (excluding new agents - already have 17 + templates)

**CRITICAL DISCOVERY:**
- **Sprint 2 Memory System Implementation**: ❌ **NOT NEEDED** - Already complete with 15 SQLite tables
- SwarmMemoryManager.ts (1,989 lines) already implements all required functionality
- Original Sprint 2 plans were based on incorrect assumption

**Updated Scope:**
- Sprint 1: Test Infrastructure Fixes (40 hours)
- Sprint 2: ~~Memory System~~ → **REMOVED** (Already Complete)
- Sprint 3: Advanced Features & Agentic-Flow Integration (Optional, 60-80 hours)

---

## Table of Contents

1. [Critical Path Analysis](#1-critical-path-analysis)
2. [Sprint 1: Test Infrastructure & Deployment Readiness](#2-sprint-1-test-infrastructure--deployment-readiness)
3. [Sprint 3: Advanced Features (Optional)](#3-sprint-3-advanced-features-optional)
4. [Task Dependency Graph](#4-task-dependency-graph)
5. [Consolidated Task List (JSON)](#5-consolidated-task-list-json)
6. [Execution Timeline](#6-execution-timeline)
7. [Success Metrics](#7-success-metrics)

---

## 1. Critical Path Analysis

### 1.1 Immediate Priorities (Week 1)

**BLOCKER RESOLUTION:**

```
Priority 1: Deployment Readiness (8-10 hours)
├─ DEPLOY-001: Fix Jest environment (process.cwd() issue) → Unblocks 46 tests
├─ DEPLOY-002-006: Fix remaining 7 test issues
└─ DEPLOY-007: Coverage validation (80%+ target)

Priority 2: Test Infrastructure (Week 1-2, 40 hours)
├─ TEST-001: Fix coverage instrumentation (CRITICAL)
├─ TEST-002-005: Fix failing tests
└─ Phase 1 completion
```

### 1.2 Updated Sprint Structure

**Original Plan:**
- Sprint 1: Test Infrastructure (40h)
- Sprint 2: Memory System (60h) ← **REMOVED**
- Sprint 3: Advanced Features (80h)

**NEW Plan:**
- Sprint 1: Test Infrastructure + Deployment Fixes (48h)
- Sprint 2: **SKIPPED** - Memory already complete
- Sprint 3: Advanced Features (Optional, 60-80h)

### 1.3 ROI Impact

**Time Saved:**
- Sprint 2 Memory System: 60 hours saved ✅
- Cost Saved: $9,000 (@$150/hr) ✅
- Faster to Production: 2 weeks earlier ✅

---

## 2. Sprint 1: Test Infrastructure & Deployment Readiness

### 2.1 Critical Path Tasks (Week 1)

#### DEPLOY-001: Fix Jest Environment (CRITICAL - 0.5-1h)

**Issue:** `ENOENT: no such file or directory, uv_cwd` affects 46 tests (86.8% of failures)

**Fix:**
```typescript
// File: jest.setup.ts (CREATE)
const originalCwd = process.cwd.bind(process);

process.cwd = jest.fn(() => {
  try {
    return originalCwd();
  } catch (error) {
    return '/workspaces/agentic-qe-cf';
  }
});

afterAll(() => {
  process.cwd = originalCwd;
});

jest.setTimeout(30000);
```

```javascript
// File: jest.config.js (UPDATE)
module.exports = {
  // ... existing config
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironmentOptions: {
    cwd: process.cwd()
  },
};
```

**Success Criteria:**
- ✅ No ENOENT errors
- ✅ 46+ tests now able to run
- ✅ `process.cwd()` returns valid path

**Agent:** coder
**Priority:** CRITICAL
**Effort:** 0.5-1 hour
**Dependencies:** None

---

#### DEPLOY-002: Fix Database Mock Initialization (1h)

**Issue:** `TypeError: this.database.initialize is not a function`

**Affected Tests:**
- tests/unit/fleet-manager.test.ts
- tests/cli/advanced-commands.test.ts

**Fix:**
```typescript
// Complete database mock
const mockDatabase = {
  initialize: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue({ rows: [] }),
  close: jest.fn().mockResolvedValue(undefined),
  prepare: jest.fn(),
  run: jest.fn(),
  get: jest.fn(),
  all: jest.fn().mockResolvedValue([])
};
```

**Success Criteria:**
- ✅ No "initialize is not a function" errors
- ✅ Fleet manager tests pass
- ✅ CLI advanced commands tests pass

**Agent:** coder
**Priority:** HIGH
**Effort:** 1 hour
**Dependencies:** DEPLOY-001

---

#### DEPLOY-003: Fix Statistical Analysis Precision (0.5h)

**Issue:** Floating point precision errors in StatisticalAnalysis.test.ts

**Fix:**
```typescript
// Use toBeCloseTo with proper precision
expect(passRate).toBeCloseTo(0.6, 2); // 2 decimal places

// OR: Round before comparing
expect(Math.round(passRate * 100) / 100).toBe(0.60);
```

**Agent:** coder
**Priority:** MEDIUM
**Effort:** 0.5 hours
**Dependencies:** DEPLOY-001

---

#### DEPLOY-004: Fix Module Import Paths (0.5h)

**Issue:** `Cannot find module '../../src/cli/commands/agent/spawn'`

**Fix:**
```bash
# Find actual module location
find src/cli/commands -name "*.ts" | grep -i spawn

# Update import path
import { spawn } from '../../src/cli/commands/agent';
```

**Agent:** coder
**Priority:** HIGH
**Effort:** 0.5 hours
**Dependencies:** DEPLOY-001

---

#### DEPLOY-005: Fix EventBus Timing (0.5h)

**Issue:** Async event timing causing call count mismatches

**Fix:**
```typescript
test('should handle multiple initialization calls gracefully', async () => {
  // Await async initialization
  await eventBus.initialize();
  await eventBus.initialize();

  // Wait for event propagation
  await new Promise(resolve => setImmediate(resolve));

  expect(mockHandler).toHaveBeenCalledTimes(2);
});
```

**Agent:** coder
**Priority:** MEDIUM
**Effort:** 0.5 hours
**Dependencies:** DEPLOY-001

---

#### DEPLOY-006: Fix Learning System Tests (1h)

**Issue:** ML models not properly initialized before detection

**Fix:**
```typescript
describe('detectFlakyTests', () => {
  test('should detect intermittent flaky test', async () => {
    // ADD: Train model with sufficient data
    const trainingData = [
      { testId: 'test-1', history: [true, true, true, true, true] },
      { testId: 'test-2', history: [true, true, true, true, true] },
      { testId: 'test-3', history: [true, false, true, false, true] },
    ];

    await detector.train(trainingData);

    // Now test detection
    const flaky = detector.detectFlakyTests(testResults);
    expect(flaky.length).toBe(1);
  });
});
```

**Agent:** coder
**Priority:** MEDIUM
**Effort:** 1 hour
**Dependencies:** DEPLOY-001

---

#### DEPLOY-007: Coverage Validation (1h)

**Objective:** Validate test coverage meets 80%+ threshold after all fixes

**Steps:**
```bash
# 1. Run full test suite
npm test

# 2. Run coverage analysis
npm run test:coverage-safe

# 3. Check coverage thresholds
cat coverage/coverage-summary.json | jq '.total'

# 4. Identify gaps if <80%
find coverage/lcov-report -name "*.html" | xargs grep -l "0.00%"
```

**Success Criteria:**
- ✅ All tests passing (0 failures)
- ✅ Statements coverage ≥ 80%
- ✅ Branches coverage ≥ 80%
- ✅ Functions coverage ≥ 80%
- ✅ Lines coverage ≥ 80%

**Agent:** qe-coverage-analyzer
**Priority:** CRITICAL
**Effort:** 1 hour
**Dependencies:** DEPLOY-001 through DEPLOY-006

---

#### INTEGRATION-001: SwarmMemoryManager Integration in QE Agents (2h)

**Issue:** Agent Task tool agents create markdown documentation but don't actually store data in SwarmMemoryManager database

**Problem:** Previous agent runs (yesterday) did NOT integrate with the database:
- Agents modified files and created reports
- No database entries were created in .swarm/memory.db
- Documentation was aspirational, not actual integration

**Objective:** Ensure ALL future QE fleet agents properly integrate with SwarmMemoryManager by:
1. Storing task status in database with proper keys
2. Emitting events via EventBus for coordination
3. Storing patterns in the patterns table
4. Creating performance metrics entries

**Implementation:**

```typescript
// Example: Proper SwarmMemoryManager integration in agents
// File: src/agents/BaseAgent.ts (or any QE agent)

import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { EventBus } from '../core/EventBus';
import * as path from 'path';

export class IntegratedQEAgent extends BaseAgent {
  private memoryStore: SwarmMemoryManager;
  private eventBus: EventBus;

  async initialize() {
    // Initialize memory store
    const dbPath = path.join(process.cwd(), '.swarm/memory.db');
    this.memoryStore = new SwarmMemoryManager(dbPath);
    await this.memoryStore.initialize();

    // Initialize event bus
    this.eventBus = EventBus.getInstance();
    await this.eventBus.initialize();
  }

  // Pre-task hook - called BEFORE task execution
  protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
    const taskId = data.assignment.task.id;

    // Store task start in memory
    await this.memoryStore.store(`tasks/${taskId}/status`, {
      status: 'started',
      timestamp: Date.now(),
      agent: this.agentId,
      taskType: data.assignment.task.type
    }, {
      partition: 'coordination',
      ttl: 86400 // 24 hours
    });

    // Emit task started event
    await this.eventBus.emit('task.started', {
      taskId,
      agentId: this.agentId,
      timestamp: Date.now()
    });

    this.logger.info(`Task ${taskId} started - stored in database`);
  }

  // Post-task hook - called AFTER task completion
  protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
    const taskId = data.assignment.task.id;

    // Store task completion in memory
    await this.memoryStore.store(`tasks/${taskId}/status`, {
      status: 'completed',
      timestamp: Date.now(),
      agent: this.agentId,
      result: data.result,
      filesModified: data.result.filesModified || [],
      testsFixed: data.result.testsFixed || 0
    }, {
      partition: 'coordination',
      ttl: 86400
    });

    // Store learned pattern if applicable
    if (data.result.pattern) {
      await this.memoryStore.storePattern({
        pattern: data.result.pattern.name,
        confidence: data.result.pattern.confidence || 0.9,
        usageCount: 1,
        metadata: {
          taskId,
          timestamp: Date.now(),
          description: data.result.pattern.description
        }
      });
    }

    // Emit task completed event
    await this.eventBus.emit('task.completed', {
      taskId,
      agentId: this.agentId,
      timestamp: Date.now(),
      success: true,
      result: data.result
    });

    // Store performance metrics
    if (data.result.executionTime) {
      await this.memoryStore.storePerformanceMetric({
        metric: 'task_execution_time',
        value: data.result.executionTime,
        unit: 'ms',
        agentId: this.agentId,
        timestamp: Date.now(),
        metadata: { taskId }
      });
    }

    this.logger.info(`Task ${taskId} completed - all data stored in database`);
  }

  // Error handler - called on task failure
  protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
    const taskId = data.assignment.task.id;

    // Store error in memory
    await this.memoryStore.store(`tasks/${taskId}/error`, {
      status: 'failed',
      timestamp: Date.now(),
      agent: this.agentId,
      error: {
        message: data.error.message,
        stack: data.error.stack
      }
    }, {
      partition: 'coordination',
      ttl: 86400
    });

    // Emit error event
    await this.eventBus.emit('task.error', {
      taskId,
      agentId: this.agentId,
      timestamp: Date.now(),
      error: data.error.message
    });
  }

  async cleanup() {
    await this.memoryStore.close();
  }
}
```

**Validation Script:**

```typescript
// scripts/verify-agent-integration.ts
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as path from 'path';

async function verifyIntegration() {
  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memory = new SwarmMemoryManager(dbPath);
  await memory.initialize();

  // Check for task status entries
  const tasks = await memory.query('tasks/%', { partition: 'coordination' });
  console.log(`Found ${tasks.length} task entries`);

  // Check for events
  const events = await memory.queryEvents('task.completed');
  console.log(`Found ${events.length} task completion events`);

  // Check for patterns
  const patterns = await memory.queryPatternsByConfidence(0.0);
  console.log(`Found ${patterns.length} learned patterns`);

  // Check for metrics
  const stats = await memory.stats();
  console.log('Database stats:', JSON.stringify(stats, null, 2));

  await memory.close();
}
```

**Success Criteria:**
- ✅ New database entries created for each task execution
- ✅ Events emitted to EventBus for each task lifecycle stage
- ✅ Patterns stored in patterns table when learned
- ✅ Performance metrics recorded for task execution times
- ✅ Verification script shows entries from TODAY's date

**Agent:** coder
**Priority:** CRITICAL
**Effort:** 2 hours
**Dependencies:** DEPLOY-007

**Files to Modify:**
- src/agents/BaseAgent.ts (add memory integration example)
- scripts/verify-agent-integration.ts (create new verification script)
- docs/guides/AGENT-INTEGRATION-GUIDE.md (create integration guide)

---

### 2.2 Test Infrastructure Fixes (Week 1-2, 40h)

#### TEST-001: Fix Coverage Instrumentation (4-6h)

**Problem:** Coverage reports show 0% despite 329 passing tests

**Implementation:**
```javascript
// jest.config.js - Verify coverage configuration
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // CRITICAL: Ensure coverage collection is enabled
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/__mocks__/**',
    '!src/**/types/**'
  ],

  coverageThresholds: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  },

  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageDirectory: 'coverage',

  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      diagnostics: true
    }]
  },

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
```

**Success Criteria:**
- ✅ Coverage report shows actual percentages (not 0%)
- ✅ Coverage HTML report generated in `/coverage` directory
- ✅ `npm run test:coverage` completes without errors

**Agent:** coder
**Priority:** CRITICAL
**Effort:** 4-6 hours
**Dependencies:** DEPLOY-001

---

#### TEST-002 through TEST-011: Additional Test Fixes

See [test-coverage-implementation-plan.md](./test-coverage-implementation-plan.md) for complete details:

- **TEST-002:** Fix EventBus tests (4h)
- **TEST-003:** Fix FleetManager tests (6h)
- **TEST-004:** Fix FlakyTestDetector tests (4h)
- **TEST-005:** Create BaseAgent edge case tests (16h)
- **TEST-006:** Multi-agent load testing (12h)
- **TEST-007:** E2E QE workflow tests (16h)
- **TEST-008:** SwarmMemoryManager security tests (16h)
- **TEST-009:** Performance benchmarking (16h)
- **TEST-010:** Chaos engineering tests (20h)
- **TEST-011:** Property-based testing (12h)

**Total Effort:** 106-144 hours across 4 phases

---

## 3. Sprint 3: Advanced Features (Optional)

### 3.1 Agentic-Flow Integration (60-80h)

**Note:** This sprint focuses on enhancing existing capabilities, NOT creating new agents.

#### AF-001: Multi-Model Router Expansion (24h)

**Objective:** Extend from 4 models to 100+ with 5-tier architecture

**Current:**
- 4 models (GPT-3.5, GPT-4, Claude Haiku, Claude Sonnet 4.5)
- 70-81% cost savings

**Enhanced:**
- 100+ models via OpenRouter
- 5 tiers: Flagship, Cost-Effective, Budget, Local (ONNX), Ultra-Budget
- 85-90% cost savings

**Implementation:**
```typescript
// src/routing/EnhancedModelRouter.ts (create)
export class EnhancedModelRouter {
  private tiers: ModelTier[] = [
    { name: 'flagship', models: ['claude-sonnet-4.5', 'gpt-4o'] },
    { name: 'cost-effective', models: ['deepseek-r1', 'claude-haiku'] },
    { name: 'budget', models: ['llama-3.1-8b', 'gpt-3.5-turbo'] },
    { name: 'local', models: ['phi-4-onnx'] },
    { name: 'ultra-budget', models: ['qwen-2.5'] }
  ];

  async selectModel(complexity: string, preferences: any): Promise<string> {
    // Intelligent routing based on complexity and budget
  }
}
```

**Success Criteria:**
- ✅ 100+ models supported
- ✅ 85-90% cost savings
- ✅ Local model fallback works offline

**Agent:** coder
**Priority:** HIGH
**Effort:** 24 hours
**ROI:** $51,000/year savings

---

#### AF-002: Local Model Integration (Phi-4 ONNX) (16h)

**Objective:** Zero-cost offline operations via local ONNX model

**Implementation:**
```typescript
// src/models/Phi4ONNXRunner.ts (create)
import * as onnx from 'onnxruntime-node';

export class Phi4ONNXRunner {
  private session: onnx.InferenceSession;

  async initialize(modelPath: string): Promise<void> {
    this.session = await onnx.InferenceSession.create(modelPath);
  }

  async generate(prompt: string): Promise<string> {
    // Run inference locally (zero API cost)
  }
}
```

**Success Criteria:**
- ✅ Local model runs offline
- ✅ Zero API cost
- ✅ Quality ≥75%

**Agent:** coder
**Priority:** HIGH
**Effort:** 16 hours
**ROI:** $10,000/year savings

---

#### AF-007 through AF-012: QUIC Transport & Agent Booster

**QUIC Transport (64h):**
- AF-007: Implement QUIC Transport Layer (40h)
- AF-008: Integrate QUIC with EventBus (24h)
- **Benefit:** 50-70% faster agent coordination

**Agent Booster (104h):**
- AF-009: Build Rust/WASM Booster Module (40h)
- AF-010: Create TypeScript WASM Wrapper (16h)
- AF-011: Integrate Booster with TestGeneratorAgent (24h)
- AF-012: Optimize Pattern Bank with WASM (24h)
- **Benefit:** 352x faster deterministic operations

**Total Sprint 3 Effort:** 168-200 hours (optional)

---

## 4. Task Dependency Graph

```
┌──────────────────────────────────────────────────────────┐
│ CRITICAL PATH: Deployment Readiness (8-10 hours)        │
└──────────────────────────────────────────────────────────┘
              ↓
┌──────────────────────────────────────────────────────────┐
│ DEPLOY-001: Jest Environment Fix (0.5-1h)               │
│ ⚠️ BLOCKS 46 TESTS (86.8% of failures)                  │
└──────────────────────────────────────────────────────────┘
              ↓
    ┌─────────┴─────────┬─────────┬─────────┬─────────┐
    ↓                   ↓         ↓         ↓         ↓
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│DEPLOY-002│  │DEPLOY-003│  │DEPLOY-004│  │DEPLOY-005│  │DEPLOY-006│
│DB Mocks  │  │Stats Fix │  │Imports   │  │EventBus  │  │Learning  │
│(1h)      │  │(0.5h)    │  │(0.5h)    │  │(0.5h)    │  │Tests(1h) │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     └─────────────┴─────────────┴─────────────┴─────────────┘
                                ↓
                    ┌───────────────────────┐
                    │ DEPLOY-007: Coverage  │
                    │ Validation (1h)       │
                    └───────────────────────┘
                                ↓
                    ┌───────────────────────┐
                    │ PRODUCTION READY      │
                    │ (v1.1.0)              │
                    └───────────────────────┘

PARALLEL TRACK (Can run concurrently with deployment fixes):
┌──────────────────────────────────────────────────────────┐
│ Test Infrastructure Improvements (40 hours)              │
├──────────────────────────────────────────────────────────┤
│ TEST-001: Coverage Instrumentation (6h)                  │
│ TEST-002-005: Unit Test Fixes (30h)                     │
│ TEST-006-007: Integration Tests (28h)                   │
│ TEST-008: Security Tests (16h)                          │
│ TEST-009-010: Performance & Chaos Tests (36h)           │
│ TEST-011: Property-Based Tests (12h)                    │
└──────────────────────────────────────────────────────────┘

OPTIONAL TRACK (Sprint 3 - After production deployment):
┌──────────────────────────────────────────────────────────┐
│ Advanced Features (168-200 hours, optional)              │
├──────────────────────────────────────────────────────────┤
│ AF-001-002: Multi-Model Router + Local Models (40h)     │
│ AF-007-008: QUIC Transport (64h)                        │
│ AF-009-012: Agent Booster WASM (104h)                   │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Consolidated Task List (JSON)

```json
{
  "master_roadmap_v2": {
    "project": "Agentic QE Fleet",
    "version": "2.0",
    "last_updated": "2025-10-17",
    "critical_discovery": "Sprint 2 Memory System already complete with 15 SQLite tables in SwarmMemoryManager.ts",
    "time_saved": "60 hours",
    "cost_saved": "$9,000",

    "sprints": [
      {
        "id": "sprint-1",
        "name": "Test Infrastructure & Deployment Readiness",
        "duration_weeks": 2,
        "effort_hours": 48,
        "priority": "CRITICAL",

        "phase_1_deployment_readiness": {
          "duration": "8-10 hours",
          "critical_path": true,
          "tasks": [
            {
              "id": "DEPLOY-001",
              "title": "Fix Jest environment - process.cwd() issue",
              "agent": "coder",
              "effort_hours": 1,
              "priority": "CRITICAL",
              "blocks": "46 tests (86.8% of failures)",
              "files": ["jest.config.js", "jest.setup.ts"],
              "dependencies": [],
              "success_criteria": [
                "No ENOENT errors",
                "46+ tests now able to run",
                "process.cwd() returns valid path"
              ]
            },
            {
              "id": "DEPLOY-002",
              "title": "Fix database mock initialization methods",
              "agent": "coder",
              "effort_hours": 1,
              "priority": "HIGH",
              "files": [
                "tests/unit/fleet-manager.test.ts",
                "tests/cli/advanced-commands.test.ts"
              ],
              "dependencies": ["DEPLOY-001"],
              "success_criteria": [
                "No 'initialize is not a function' errors",
                "Fleet manager tests pass",
                "CLI advanced commands tests pass"
              ]
            },
            {
              "id": "DEPLOY-003",
              "title": "Fix statistical analysis floating point precision",
              "agent": "coder",
              "effort_hours": 0.5,
              "priority": "MEDIUM",
              "files": ["tests/unit/learning/StatisticalAnalysis.test.ts"],
              "dependencies": ["DEPLOY-001"],
              "success_criteria": [
                "No floating point precision errors",
                "Statistical analysis tests pass"
              ]
            },
            {
              "id": "DEPLOY-004",
              "title": "Fix agent test module import paths",
              "agent": "coder",
              "effort_hours": 0.5,
              "priority": "HIGH",
              "files": ["tests/cli/agent.test.ts"],
              "dependencies": ["DEPLOY-001"],
              "success_criteria": [
                "No module import errors",
                "Agent CLI tests pass"
              ]
            },
            {
              "id": "DEPLOY-005",
              "title": "Fix EventBus initialization timing issue",
              "agent": "coder",
              "effort_hours": 0.5,
              "priority": "MEDIUM",
              "files": ["tests/unit/EventBus.test.ts"],
              "dependencies": ["DEPLOY-001"],
              "success_criteria": [
                "No timing-related test failures",
                "EventBus tests pass consistently"
              ]
            },
            {
              "id": "DEPLOY-006",
              "title": "Fix learning system test model initialization",
              "agent": "coder",
              "effort_hours": 1,
              "priority": "MEDIUM",
              "files": [
                "tests/unit/learning/FlakyTestDetector.test.ts",
                "tests/unit/learning/SwarmIntegration.test.ts"
              ],
              "dependencies": ["DEPLOY-001"],
              "success_criteria": [
                "ML models properly initialized before tests",
                "Flaky detection tests pass",
                "Swarm integration tests pass"
              ]
            },
            {
              "id": "DEPLOY-007",
              "title": "Validate test coverage meets 80%+ threshold",
              "agent": "qe-coverage-analyzer",
              "effort_hours": 1,
              "priority": "CRITICAL",
              "files": [],
              "dependencies": [
                "DEPLOY-001",
                "DEPLOY-002",
                "DEPLOY-003",
                "DEPLOY-004",
                "DEPLOY-005",
                "DEPLOY-006"
              ],
              "success_criteria": [
                "All tests passing (0 failures)",
                "Statements coverage ≥ 80%",
                "Branches coverage ≥ 80%",
                "Functions coverage ≥ 80%",
                "Lines coverage ≥ 80%",
                "Coverage report generated successfully"
              ]
            }
          ]
        },

        "phase_2_test_infrastructure": {
          "duration": "40 hours (parallel with deployment)",
          "critical_path": false,
          "tasks": [
            {
              "id": "TEST-001",
              "title": "Fix coverage instrumentation",
              "agent": "coder",
              "effort_hours": 6,
              "priority": "CRITICAL",
              "files": ["jest.config.js", "package.json"],
              "dependencies": [],
              "success_criteria": [
                "Coverage report shows actual percentages",
                "Coverage HTML report generated",
                "npm run test:coverage completes without errors"
              ]
            },
            {
              "id": "TEST-002",
              "title": "Fix EventBus initialization test",
              "agent": "tester",
              "effort_hours": 4,
              "priority": "CRITICAL",
              "files": ["tests/unit/EventBus.test.ts"],
              "dependencies": ["TEST-001"],
              "success_criteria": [
                "Test passes consistently",
                "Idempotent initialization verified"
              ]
            },
            {
              "id": "TEST-003",
              "title": "Fix FleetManager database initialization",
              "agent": "coder",
              "effort_hours": 6,
              "priority": "CRITICAL",
              "files": ["tests/unit/fleet-manager.test.ts"],
              "dependencies": ["TEST-001"],
              "success_criteria": [
                "All FleetManager tests pass",
                "Database initialization verified"
              ]
            },
            {
              "id": "TEST-004",
              "title": "Fix FlakyTestDetector ML model tests",
              "agent": "tester",
              "effort_hours": 4,
              "priority": "HIGH",
              "files": ["tests/unit/learning/FlakyTestDetector.test.ts"],
              "dependencies": ["TEST-001"],
              "success_criteria": [
                "ML model tests pass consistently",
                "Deterministic behavior with fixed seed"
              ]
            },
            {
              "id": "TEST-005",
              "title": "Create BaseAgent edge case tests",
              "agent": "tester",
              "effort_hours": 16,
              "priority": "HIGH",
              "files": ["tests/agents/BaseAgent.edge-cases.test.ts"],
              "dependencies": ["TEST-001"],
              "success_criteria": [
                "All edge case tests pass",
                "Hook failure scenarios covered",
                "Concurrent operation safety verified"
              ]
            }
          ]
        }
      },

      {
        "id": "sprint-2",
        "name": "SKIPPED - Memory System Already Complete",
        "status": "NOT_NEEDED",
        "reason": "SwarmMemoryManager.ts already implements 15 SQLite tables with full feature set",
        "evidence": "src/core/memory/SwarmMemoryManager.ts (1,989 lines)",
        "time_saved": "60 hours",
        "cost_saved": "$9,000"
      },

      {
        "id": "sprint-3",
        "name": "Advanced Features (Optional)",
        "duration_weeks": 8,
        "effort_hours": 168,
        "priority": "OPTIONAL",
        "start_condition": "After v1.1.0 production deployment",

        "tasks": [
          {
            "id": "AF-001",
            "title": "Create Enhanced Multi-Model Router",
            "agent": "coder",
            "effort_hours": 24,
            "priority": "HIGH",
            "roi_annual": 51000,
            "files": [
              "src/routing/EnhancedModelRouter.ts",
              "src/config/models.config.ts",
              "tests/routing/EnhancedModelRouter.test.ts"
            ],
            "dependencies": [],
            "success_criteria": [
              "100+ models supported",
              "85-90% cost savings achieved",
              "All tests pass"
            ]
          },
          {
            "id": "AF-002",
            "title": "Integrate Phi-4 ONNX Local Model",
            "agent": "coder",
            "effort_hours": 16,
            "priority": "HIGH",
            "roi_annual": 10000,
            "files": [
              "src/models/Phi4ONNXRunner.ts",
              "models/phi-4.onnx",
              "tests/models/Phi4ONNXRunner.test.ts"
            ],
            "dependencies": ["AF-001"],
            "success_criteria": [
              "Local model runs offline",
              "Zero API cost for offline ops",
              "Quality ≥75%"
            ]
          },
          {
            "id": "AF-007",
            "title": "Implement QUIC Transport Layer",
            "agent": "coder",
            "effort_hours": 40,
            "priority": "MEDIUM",
            "roi_annual": 10800,
            "files": [
              "src/transport/QUICTransport.ts",
              "tests/transport/QUICTransport.test.ts"
            ],
            "dependencies": [],
            "success_criteria": [
              "QUIC operational",
              "50-70% latency reduction",
              "0-RTT working",
              "100+ streams supported"
            ]
          },
          {
            "id": "AF-008",
            "title": "Integrate QUIC with EventBus",
            "agent": "coder",
            "effort_hours": 24,
            "priority": "MEDIUM",
            "roi_annual": 10800,
            "files": ["src/core/EventBus.ts"],
            "dependencies": ["AF-007"],
            "success_criteria": [
              "QUIC integration complete",
              "Fallback to TCP works",
              "Latency reduced 50-70%"
            ]
          },
          {
            "id": "AF-009",
            "title": "Build Rust/WASM Booster Module",
            "agent": "coder",
            "effort_hours": 40,
            "priority": "MEDIUM",
            "roi_annual": 36000,
            "files": [
              "booster/src/lib.rs",
              "booster/Cargo.toml",
              "scripts/build-wasm.sh"
            ],
            "dependencies": [],
            "success_criteria": [
              "WASM module compiles",
              "1000 templates in <1s",
              "352x speedup achieved"
            ]
          },
          {
            "id": "AF-010",
            "title": "Create TypeScript WASM Wrapper",
            "agent": "coder",
            "effort_hours": 16,
            "priority": "MEDIUM",
            "roi_annual": 36000,
            "files": [
              "src/acceleration/AgentBooster.ts",
              "tests/acceleration/AgentBooster.test.ts"
            ],
            "dependencies": ["AF-009"],
            "success_criteria": [
              "TypeScript wrapper works",
              "All methods functional",
              "Performance maintained"
            ]
          },
          {
            "id": "AF-011",
            "title": "Integrate Booster with TestGeneratorAgent",
            "agent": "coder",
            "effort_hours": 24,
            "priority": "MEDIUM",
            "roi_annual": 36000,
            "files": ["src/agents/TestGeneratorAgent.ts"],
            "dependencies": ["AF-010"],
            "success_criteria": [
              "Hybrid mode operational",
              "352x speedup for templates",
              "100% cost reduction for patterns"
            ]
          },
          {
            "id": "AF-012",
            "title": "Optimize Pattern Bank with WASM",
            "agent": "coder",
            "effort_hours": 24,
            "priority": "LOW",
            "roi_annual": 12000,
            "files": ["src/learning/PatternBank.ts"],
            "dependencies": ["AF-010"],
            "success_criteria": [
              "Pattern application <1s",
              "Zero API cost",
              "Quality maintained"
            ]
          }
        ]
      }
    ],

    "summary": {
      "total_sprints": 2,
      "sprint_2_removed": true,
      "total_effort_hours": 216,
      "critical_path_hours": 48,
      "optional_hours": 168,
      "time_saved": 60,
      "cost_saved": 9000,
      "weeks_saved": 2,

      "immediate_focus": [
        "Deploy v1.1.0 (8-10 hours)",
        "Fix 53 test failures (majority from 1 issue)",
        "Achieve 80%+ test coverage",
        "Validate deployment readiness"
      ],

      "optional_enhancements": [
        "Multi-model router expansion (85-90% cost savings)",
        "Local ONNX model support (offline operation)",
        "QUIC transport (50-70% faster coordination)",
        "WASM booster (352x faster operations)"
      ]
    }
  }
}
```

---

## 6. Execution Timeline

### Week 1: Critical Path (8-10 hours)

```
Day 1 (0-4 hours):
├─ DEPLOY-001: Jest environment fix [0.5-1h] ──┐
├─ DEPLOY-002: Database mocks [1h]             ├─→ DEPLOY-007: Coverage [1h]
├─ DEPLOY-003: Statistical precision [0.5h]    │
├─ DEPLOY-004: Module imports [0.5h]           │
├─ DEPLOY-005: EventBus timing [0.5h]          │
└─ DEPLOY-006: Learning tests [1h] ────────────┘

Parallel Track (Day 1-2):
└─ TEST-001: Coverage instrumentation [6h]

Day 2-3 (4-10 hours):
├─ TEST-002: EventBus tests [4h]
├─ TEST-003: FleetManager tests [6h]
└─ TEST-004: FlakyTestDetector [4h]
```

**Milestone:** v1.1.0 Production Ready (End of Week 1)

### Week 2-3: Test Infrastructure (30-40 hours)

```
Week 2:
├─ TEST-005: BaseAgent edge cases [16h]
├─ TEST-006: Multi-agent load testing [12h]
└─ TEST-007: E2E QE workflow [16h]

Week 3:
├─ TEST-008: Security tests [16h]
├─ TEST-009: Performance benchmarks [16h]
├─ TEST-010: Chaos engineering [20h]
└─ TEST-011: Property-based tests [12h]
```

**Milestone:** 80%+ Test Coverage (End of Week 3)

### Week 4-12: Advanced Features (Optional, 168h)

```
Week 4-5: Multi-Model Router + Local Models
├─ AF-001: Enhanced router [24h]
└─ AF-002: Phi-4 ONNX integration [16h]

Week 6-8: QUIC Transport
├─ AF-007: QUIC implementation [40h]
└─ AF-008: EventBus integration [24h]

Week 9-12: Agent Booster (WASM)
├─ AF-009: Rust/WASM module [40h]
├─ AF-010: TypeScript wrapper [16h]
├─ AF-011: TestGenerator integration [24h]
└─ AF-012: Pattern Bank optimization [24h]
```

**Milestone:** Enhanced capabilities operational (End of Week 12)

---

## 7. Success Metrics

### 7.1 Deployment Readiness Gate (Week 1)

- [ ] **Gate 1:** All tests passing (0 failures)
- [ ] **Gate 2:** Coverage ≥ 80% (all metrics)
- [ ] **Gate 3:** No critical bugs
- [ ] **Gate 4:** Performance benchmarks pass
- [ ] **Gate 5:** Security scan clean

**Status:** READY when all gates pass

### 7.2 Test Infrastructure Gate (Week 2-3)

- [ ] Coverage > 80% across all modules
- [ ] Pass rate 100% (382/382 tests)
- [ ] Edge cases covered for core modules
- [ ] Integration tests comprehensive
- [ ] Performance benchmarks established

### 7.3 Advanced Features Gate (Week 4-12, Optional)

- [ ] Cost savings 85-90% (vs current 70-81%)
- [ ] Coordination latency -50-70%
- [ ] Template expansion 352x faster
- [ ] Local model operational (offline support)

---

## Conclusion

This revised master roadmap correctly reflects the current state:

✅ **Sprint 2 Memory System:** Already complete (15 tables, 1,989 lines)
✅ **Time Saved:** 60 hours ($9,000 @ $150/hr)
✅ **Faster to Production:** 2 weeks earlier

**Recommended Execution:**

1. **Week 1:** Deploy v1.1.0 (critical path: 8-10 hours)
2. **Week 2-3:** Test infrastructure improvements (parallel)
3. **Week 4+:** Advanced features (optional, evaluate ROI)

**Next Steps:**

1. Confirm updated plan with stakeholders
2. Begin DEPLOY-001 (Jest environment fix)
3. Monitor progress with daily standups
4. Evaluate Sprint 3 features after v1.1.0 deployment

---

**Document Version:** 2.0 (Revised)
**Last Updated:** October 17, 2025
**Author:** Claude (Code-Goal-Planner Agent)
**Approval Status:** PENDING
