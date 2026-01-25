# Claude Flow Agent Task Definitions - AQE Improvement Implementation

**Generated**: 2025-10-17
**Project**: Agentic QE Fleet @ /workspaces/agentic-qe-cf
**Methodology**: SPARC-GOAP Multi-Agent Coordination
**Target Agents**: coder, tester, reviewer, researcher, qe-*, github-*, sparc-*

---

## Executive Summary

This document provides **executable task definitions** optimized for Claude Flow agent swarms to implement the complete AQE improvement plan. Tasks are designed for:

- **Parallel execution** with minimal blocking dependencies
- **Multi-agent coordination** using memory, events, and hooks
- **SPARC methodology** integration (Specification, Pseudocode, Architecture, Refinement, Completion)
- **Incremental delivery** with validation at each milestone

### Implementation Status

Based on `/workspaces/agentic-qe-cf/docs/IMPLEMENTATION-PROGRESS-ANALYSIS.md`:

- ✅ **54% Complete** (7/13 major areas)
- ✅ **MCP Server**: 52 tools fully implemented
- ✅ **Agents**: 16 production-ready agents
- ⚠️ **Memory System**: Basic (needs 12-table SQLite schema)
- ⚠️ **Test Fixes**: 31 unit tests failing (non-blocking)
- ❌ **Sublinear Algorithms**: Not started
- ❌ **Neural Training**: Not started

---

## Swarm Configuration

```json
{
  "swarm_id": "aqe-improvement-sprint",
  "topology": "hierarchical",
  "max_agents": 15,
  "coordination_mode": "event-driven",
  "memory_backend": "SwarmMemoryManager",
  "event_bus": "enabled",
  "execution_strategy": "parallel-with-gates",

  "agent_pools": {
    "core_development": {
      "types": ["coder", "sparc-coder", "backend-dev"],
      "count": 5,
      "priority": "high"
    },
    "quality_assurance": {
      "types": ["tester", "qe-test-executor", "qe-coverage-analyzer"],
      "count": 3,
      "priority": "high"
    },
    "review_and_validation": {
      "types": ["reviewer", "qe-quality-gate", "code-analyzer"],
      "count": 2,
      "priority": "medium"
    },
    "research_and_planning": {
      "types": ["researcher", "planner", "system-architect"],
      "count": 2,
      "priority": "medium"
    },
    "specialized": {
      "types": ["qe-security-scanner", "qe-performance-tester", "qe-deployment-readiness"],
      "count": 3,
      "priority": "low"
    }
  },

  "memory_namespaces": {
    "aqe/tasks": "Task progress and results",
    "aqe/coordination": "Agent coordination state",
    "aqe/artifacts": "Build and test artifacts",
    "aqe/metrics": "Performance and quality metrics",
    "aqe/checkpoints": "Workflow checkpoints",
    "shared/sprint-state": "Sprint-wide shared state"
  },

  "event_channels": [
    "task:started",
    "task:completed",
    "task:failed",
    "task:blocked",
    "sprint:gate-passed",
    "sprint:gate-failed",
    "coordination:consensus-needed"
  ]
}
```

---

## Sprint 1: Test Infrastructure & Quality Foundation (Week 1-2)

**Goal**: Achieve 100% passing unit tests and establish quality gates

**Success Criteria**:
- ✅ 0 unit test failures (currently 31)
- ✅ TypeScript: 0 errors
- ✅ Test coverage: >80%
- ✅ Build: green

### Task Group 1.1: Test Mock Fixes (Parallel Execution)

#### CF-001: Fix TestGeneratorAgent Capability Registration

```json
{
  "task_id": "CF-001",
  "title": "Fix TestGeneratorAgent capability registration (21 tests)",
  "agent_type": "coder",
  "priority": "critical",
  "estimated_effort": "2h",
  "sparc_phase": "refinement",

  "context": {
    "issue": "TestGeneratorAgent.initialize() doesn't register capabilities",
    "affected_files": [
      "/workspaces/agentic-qe-cf/src/agents/TestGeneratorAgent.ts",
      "/workspaces/agentic-qe-cf/tests/unit/agents/TestGeneratorAgent.test.ts"
    ],
    "failing_tests": 21,
    "root_cause": "initializeComponents() sets up AI engines but doesn't call registerCapability()"
  },

  "input": {
    "requirements": [
      "Add capability registration to initializeComponents()",
      "Register framework-specific capabilities dynamically",
      "Support task types: unit-test-generation, mock-generation, integration-test-generation"
    ],
    "test_files": [
      "tests/unit/agents/TestGeneratorAgent.test.ts"
    ]
  },

  "implementation": {
    "approach": "TDD",
    "steps": [
      "Read current TestGeneratorAgent.ts implementation",
      "Identify initializeComponents() method",
      "Add registerCapability() calls based on config.framework",
      "Run tests to verify all 21 tests pass",
      "Update tests if needed for proper mocking"
    ],
    "code_changes": {
      "file": "src/agents/TestGeneratorAgent.ts",
      "method": "initializeComponents()",
      "add_after_line": 42,
      "code": `
  // Register framework-specific capabilities
  this.registerCapability({
    name: \`\${this.config.framework}-test-generation\`,
    version: '1.0.0',
    description: \`Generate \${this.config.framework} tests with TypeScript support\`,
    taskTypes: ['unit-test-generation', 'mock-generation', 'integration-test-generation']
  });

  // Register advanced capabilities if optimization enabled
  if (this.config.optimization === 'sublinear') {
    this.registerCapability({
      name: 'sublinear-optimization',
      version: '1.0.0',
      description: 'O(log n) test optimization',
      taskTypes: ['test-optimization']
    });
  }
`
    }
  },

  "validation": {
    "commands": [
      "npm run test:unit -- TestGeneratorAgent.test.ts",
      "npm run typecheck"
    ],
    "success_criteria": [
      "All 21 TestGeneratorAgent tests pass",
      "No TypeScript errors",
      "getCapabilities() returns array with at least 1 capability"
    ]
  },

  "output": {
    "modified_files": [
      "src/agents/TestGeneratorAgent.ts"
    ],
    "test_results": "aqe/test-results/CF-001",
    "memory_keys": [
      "aqe/tasks/CF-001/status",
      "aqe/tasks/CF-001/result"
    ]
  },

  "coordination": {
    "depends_on": [],
    "unblocks": ["CF-010"],
    "memory_write": "aqe/tasks/CF-001/completed",
    "event_emit": "task:completed:CF-001",
    "notify_agents": ["CF-002-agent", "sprint-coordinator"]
  }
}
```

#### CF-002: Fix Agent Lifecycle Async Timing (6 tests)

```json
{
  "task_id": "CF-002",
  "title": "Fix Agent.stop() async timing issues (6 tests)",
  "agent_type": "coder",
  "priority": "critical",
  "estimated_effort": "1.5h",
  "sparc_phase": "refinement",

  "context": {
    "issue": "waitForCompletion not being called before stop() returns",
    "affected_files": [
      "/workspaces/agentic-qe-cf/src/core/Agent.ts",
      "/workspaces/agentic-qe-cf/tests/unit/Agent.test.ts"
    ],
    "failing_tests": 6,
    "root_cause": "stop() completes before task status changes from PENDING to RUNNING"
  },

  "implementation": {
    "approach": "TDD",
    "steps": [
      "Read Agent.test.ts failing test cases",
      "Add proper async timing waits in tests",
      "Ensure task status changes are awaited",
      "Verify stop() waits for RUNNING tasks",
      "Run tests to confirm all 6 pass"
    ],
    "test_changes": {
      "file": "tests/unit/Agent.test.ts",
      "pattern": "should wait for current task completion before stopping",
      "fix": `
// Wait for task to actually start running
await new Promise(resolve => setTimeout(resolve, 50));
expect(mockTask.getStatus()).toHaveBeenCalledWith(TaskStatus.RUNNING);

// Now stop should wait for completion
const stopPromise = agent.stop();
expect(mockTask.waitForCompletion).toHaveBeenCalled();
await stopPromise;
`
    }
  },

  "validation": {
    "commands": [
      "npm run test:unit -- Agent.test.ts",
      "npm run test:agents"
    ],
    "success_criteria": [
      "All 6 Agent lifecycle tests pass",
      "No race conditions in async operations",
      "waitForCompletion called when task is RUNNING"
    ]
  },

  "coordination": {
    "depends_on": [],
    "parallel_with": ["CF-001", "CF-003"],
    "event_emit": "task:completed:CF-002"
  }
}
```

#### CF-003: Fix EventBus Logger Call Count Tests (4 tests)

```json
{
  "task_id": "CF-003",
  "title": "Update EventBus test expectations for logger calls",
  "agent_type": "coder",
  "priority": "high",
  "estimated_effort": "1h",
  "sparc_phase": "refinement",

  "context": {
    "issue": "Logger.info call counts don't match implementation",
    "affected_files": [
      "/workspaces/agentic-qe-cf/tests/unit/EventBus.test.ts"
    ],
    "failing_tests": 4,
    "root_cause": "EventBus logs multiple messages per operation, tests expect exact counts"
  },

  "implementation": {
    "approach": "Update test expectations, not implementation",
    "steps": [
      "Review EventBus initialization logging",
      "Count actual log calls per operation",
      "Update test expectations to match",
      "Change from exact count checks to message content checks"
    ],
    "test_changes": {
      "file": "tests/unit/EventBus.test.ts",
      "strategy": "Check for specific messages instead of counts",
      "examples": [
        "expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('EventBus initialized'))",
        "expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Fleet started'), expect.any(Object))"
      ]
    }
  },

  "validation": {
    "commands": [
      "npm run test:unit -- EventBus.test.ts"
    ],
    "success_criteria": [
      "All 4 EventBus tests pass",
      "Tests verify message content, not call counts",
      "No flaky test behavior"
    ]
  },

  "coordination": {
    "parallel_with": ["CF-001", "CF-002"],
    "event_emit": "task:completed:CF-003"
  }
}
```

### Task Group 1.2: Integration Test Validation

#### CF-004: Comprehensive Test Suite Execution

```json
{
  "task_id": "CF-004",
  "title": "Run full test suite and document results",
  "agent_type": "qe-test-executor",
  "priority": "high",
  "estimated_effort": "2h",
  "sparc_phase": "completion",

  "context": {
    "goal": "Execute all 126 test files and validate fixes",
    "test_count": 126,
    "test_categories": ["unit", "integration", "agents", "mcp", "cli", "utils", "performance"]
  },

  "implementation": {
    "test_suites": [
      {
        "name": "unit-tests",
        "command": "npm run test:unit",
        "expected_result": "100% pass rate",
        "timeout": "5m"
      },
      {
        "name": "integration-tests",
        "command": "npm run test:integration",
        "expected_result": "100% pass rate",
        "timeout": "10m"
      },
      {
        "name": "agent-tests",
        "command": "npm run test:agents",
        "expected_result": "100% pass rate",
        "timeout": "5m"
      }
    ],
    "parallel_execution": false,
    "retry_flaky": true,
    "max_retries": 2
  },

  "validation": {
    "success_criteria": [
      "Unit tests: 0 failures",
      "Integration tests: 0 failures",
      "No memory leaks detected",
      "No timeout failures"
    ],
    "metrics_to_collect": [
      "Total test count",
      "Pass rate by category",
      "Execution time per suite",
      "Memory usage peaks",
      "Flaky test detection"
    ]
  },

  "output": {
    "test_report": "/workspaces/agentic-qe-cf/docs/test-results/sprint1-full-suite.md",
    "coverage_report": "/workspaces/agentic-qe-cf/coverage/sprint1/",
    "memory_keys": [
      "aqe/test-results/sprint1/summary",
      "aqe/test-results/sprint1/failures",
      "aqe/metrics/test-execution-time"
    ]
  },

  "coordination": {
    "depends_on": ["CF-001", "CF-002", "CF-003"],
    "blocks": ["CF-005"],
    "event_emit": "sprint:tests-validated"
  }
}
```

#### CF-005: Quality Gate Check - Test Infrastructure

```json
{
  "task_id": "CF-005",
  "title": "Execute quality gate for Sprint 1",
  "agent_type": "qe-quality-gate",
  "priority": "critical",
  "estimated_effort": "1h",
  "sparc_phase": "completion",

  "context": {
    "gate_criteria": {
      "test_pass_rate": 100,
      "coverage_threshold": 80,
      "build_status": "green",
      "typescript_errors": 0,
      "security_issues": 0
    }
  },

  "implementation": {
    "validation_checks": [
      {
        "check": "test_coverage",
        "command": "npm run test:coverage-safe",
        "threshold": 80,
        "metric": "line_coverage"
      },
      {
        "check": "build_validation",
        "command": "npm run build",
        "expected": "exit_code_0"
      },
      {
        "check": "typescript_check",
        "command": "npm run typecheck",
        "expected": "0_errors"
      },
      {
        "check": "lint_check",
        "command": "npm run lint",
        "expected": "0_errors"
      }
    ],
    "decision_logic": "AND",
    "on_failure": "block_sprint2"
  },

  "validation": {
    "success_criteria": [
      "All checks pass",
      "Coverage >= 80%",
      "Build succeeds",
      "No type errors"
    ]
  },

  "output": {
    "gate_report": "/workspaces/agentic-qe-cf/docs/quality-gates/sprint1-gate.md",
    "decision": "pass|fail|conditional",
    "memory_keys": [
      "aqe/quality-gates/sprint1/result",
      "aqe/quality-gates/sprint1/metrics"
    ]
  },

  "coordination": {
    "depends_on": ["CF-004"],
    "blocks": ["ALL_SPRINT2_TASKS"],
    "event_emit": "sprint:gate-completed",
    "consensus_required": true,
    "consensus_quorum": 2,
    "consensus_agents": ["qe-quality-gate", "qe-deployment-readiness"]
  }
}
```

---

## Sprint 2: Memory System & Coordination (Week 3-4)

**Goal**: Implement 12-table SQLite memory schema with coordination patterns

**Success Criteria**:
- ✅ SQLite database at `.aqe/memory.db`
- ✅ 12 tables implemented with proper schema
- ✅ Blackboard coordination working
- ✅ Consensus gating operational
- ✅ Migration from in-memory to SQLite complete

### Task Group 2.1: Database Schema Implementation

#### CF-010: Design and Implement SQLite Memory Schema

```json
{
  "task_id": "CF-010",
  "title": "Implement 12-table SQLite memory schema",
  "agent_type": "backend-dev",
  "priority": "critical",
  "estimated_effort": "8h",
  "sparc_phase": "architecture",

  "context": {
    "current_state": "In-memory namespace-based storage",
    "target_state": "SQLite database with 12 coordinated tables",
    "reference": "/workspaces/agentic-qe-cf/docs/AQE-IMPROVEMENT-PLAN.md#1-memory-system-enhancement"
  },

  "implementation": {
    "database_location": "/workspaces/agentic-qe-cf/.aqe/memory.db",
    "orm": "better-sqlite3",
    "schema_tables": [
      {
        "name": "shared_state",
        "purpose": "Blackboard coordination hints",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "key TEXT NOT NULL UNIQUE",
          "value TEXT",
          "ttl INTEGER DEFAULT 1800",
          "owner TEXT",
          "timestamp INTEGER",
          "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
        ],
        "indexes": ["CREATE INDEX idx_shared_state_key ON shared_state(key)"]
      },
      {
        "name": "events",
        "purpose": "Audit trail and event stream",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "type TEXT NOT NULL",
          "payload TEXT",
          "timestamp INTEGER DEFAULT (strftime('%s', 'now'))",
          "source TEXT",
          "ttl INTEGER DEFAULT 2592000"
        ],
        "indexes": ["CREATE INDEX idx_events_type ON events(type)", "CREATE INDEX idx_events_timestamp ON events(timestamp)"]
      },
      {
        "name": "workflow_state",
        "purpose": "Checkpoints for resumability",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "workflow_id TEXT NOT NULL",
          "step TEXT",
          "status TEXT CHECK(status IN ('pending', 'in_progress', 'completed', 'failed'))",
          "checkpoint TEXT",
          "sha TEXT",
          "ttl INTEGER DEFAULT 0",
          "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
        ],
        "indexes": ["CREATE INDEX idx_workflow_id ON workflow_state(workflow_id)"]
      },
      {
        "name": "patterns",
        "purpose": "Reusable tactics and rules",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "pattern TEXT NOT NULL",
          "confidence REAL DEFAULT 0.0",
          "usage_count INTEGER DEFAULT 0",
          "ttl INTEGER DEFAULT 604800",
          "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
        ]
      },
      {
        "name": "consensus_state",
        "purpose": "Voting and approval records",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "decision_id TEXT NOT NULL UNIQUE",
          "decision TEXT",
          "proposer TEXT",
          "votes TEXT",
          "quorum INTEGER",
          "status TEXT DEFAULT 'pending'",
          "version INTEGER DEFAULT 1",
          "ttl INTEGER DEFAULT 604800",
          "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
        ]
      },
      {
        "name": "performance_metrics",
        "purpose": "Telemetry data",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "metric TEXT NOT NULL",
          "value REAL",
          "unit TEXT",
          "timestamp INTEGER DEFAULT (strftime('%s', 'now'))",
          "agent_id TEXT"
        ],
        "indexes": ["CREATE INDEX idx_metrics_timestamp ON performance_metrics(timestamp)"]
      },
      {
        "name": "artifacts",
        "purpose": "Manifest storage for large outputs",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "artifact_id TEXT NOT NULL UNIQUE",
          "kind TEXT CHECK(kind IN ('code', 'doc', 'data', 'config'))",
          "path TEXT",
          "sha256 TEXT",
          "tags TEXT",
          "metadata TEXT",
          "ttl INTEGER DEFAULT 0",
          "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
        ]
      },
      {
        "name": "sessions",
        "purpose": "Session resumability",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "session_id TEXT NOT NULL UNIQUE",
          "mode TEXT CHECK(mode IN ('swarm', 'hive-mind'))",
          "state TEXT",
          "checkpoints TEXT",
          "created_at INTEGER DEFAULT (strftime('%s', 'now'))",
          "last_resumed INTEGER"
        ]
      },
      {
        "name": "agent_registry",
        "purpose": "Agent lifecycle tracking",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "agent_id TEXT NOT NULL UNIQUE",
          "type TEXT",
          "capabilities TEXT",
          "status TEXT CHECK(status IN ('active', 'idle', 'terminated'))",
          "performance TEXT",
          "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
        ]
      },
      {
        "name": "memory_store",
        "purpose": "General key-value storage",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "key TEXT NOT NULL UNIQUE",
          "value TEXT",
          "namespace TEXT",
          "ttl INTEGER",
          "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
        ],
        "indexes": ["CREATE INDEX idx_memory_namespace ON memory_store(namespace)"]
      },
      {
        "name": "neural_patterns",
        "purpose": "AI training data",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "pattern_type TEXT",
          "input_data TEXT",
          "output_data TEXT",
          "accuracy REAL",
          "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
        ]
      },
      {
        "name": "swarm_status",
        "purpose": "Fleet health data",
        "columns": [
          "id INTEGER PRIMARY KEY AUTOINCREMENT",
          "swarm_id TEXT",
          "topology TEXT",
          "active_agents INTEGER",
          "health_score REAL",
          "timestamp INTEGER DEFAULT (strftime('%s', 'now'))"
        ]
      }
    ],
    "migrations": {
      "strategy": "Create new tables, migrate data, deprecate old",
      "rollback_plan": "Keep in-memory as fallback for 1 sprint"
    }
  },

  "validation": {
    "commands": [
      "sqlite3 .aqe/memory.db '.schema'",
      "npm run test:integration -- memory"
    ],
    "success_criteria": [
      "All 12 tables created with correct schema",
      "Indexes created for performance",
      "TTL columns present where specified",
      "Foreign key constraints if needed",
      "Database file created at .aqe/memory.db"
    ]
  },

  "output": {
    "database_file": "/workspaces/agentic-qe-cf/.aqe/memory.db",
    "migration_script": "/workspaces/agentic-qe-cf/src/core/memory/migrations/001_initial_schema.ts",
    "memory_manager_update": "/workspaces/agentic-qe-cf/src/core/memory/EnhancedSwarmMemoryManager.ts",
    "memory_keys": [
      "aqe/memory/schema-version",
      "aqe/memory/migration-status"
    ]
  },

  "coordination": {
    "depends_on": ["CF-001"],
    "blocks": ["CF-011", "CF-012", "CF-013"],
    "event_emit": "memory:schema-ready",
    "artifact_manifest": {
      "kind": "data",
      "path": ".aqe/memory.db",
      "tags": ["database", "memory", "sqlite"]
    }
  }
}
```

#### CF-011: Implement TTL and Cleanup System

```json
{
  "task_id": "CF-011",
  "title": "Implement TTL policies and automatic cleanup",
  "agent_type": "coder",
  "priority": "high",
  "estimated_effort": "4h",
  "sparc_phase": "refinement",

  "context": {
    "ttl_policies": {
      "artifacts": 0,
      "shared_state": 1800,
      "patterns": 604800,
      "events": 2592000,
      "workflow_state": 0,
      "consensus_state": 604800
    }
  },

  "implementation": {
    "cleanup_service": {
      "class": "TTLCleanupService",
      "file": "src/core/memory/TTLCleanupService.ts",
      "schedule": "Every 5 minutes",
      "logic": "DELETE FROM {table} WHERE ttl > 0 AND (created_at + ttl) < strftime('%s', 'now')"
    },
    "features": [
      "Background cleanup task",
      "Configurable cleanup interval",
      "Per-table TTL policies",
      "Cleanup metrics and logging",
      "Manual cleanup trigger via MCP tool"
    ]
  },

  "validation": {
    "test_scenarios": [
      "Create entry with TTL=60, verify deleted after 60s",
      "Create entry with TTL=0, verify never deleted",
      "Verify cleanup doesn't impact active data",
      "Test cleanup performance with 10k+ entries"
    ]
  },

  "coordination": {
    "depends_on": ["CF-010"],
    "parallel_with": ["CF-012"],
    "event_emit": "memory:ttl-service-ready"
  }
}
```

### Task Group 2.2: Coordination Patterns Implementation

#### CF-012: Implement Blackboard Coordination Pattern

```json
{
  "task_id": "CF-012",
  "title": "Implement Blackboard coordination with shared_state table",
  "agent_type": "backend-dev",
  "priority": "high",
  "estimated_effort": "6h",
  "sparc_phase": "architecture",

  "context": {
    "pattern": "Blackboard architecture for agent coordination",
    "table": "shared_state",
    "use_case": "Agents post coordination hints, other agents read and act"
  },

  "implementation": {
    "class": "BlackboardCoordination",
    "file": "src/core/coordination/BlackboardCoordination.ts",
    "api": {
      "postHint": {
        "signature": "async postHint(key: string, value: any, ttl?: number): Promise<void>",
        "description": "Post coordination hint to blackboard",
        "example": "await blackboard.postHint('aqe/test-queue/next', { priority: 'high', module: 'auth' }, 1800)"
      },
      "readHints": {
        "signature": "async readHints(pattern: string): Promise<any[]>",
        "description": "Read coordination hints matching pattern",
        "example": "const hints = await blackboard.readHints('aqe/test-queue/*')"
      },
      "subscribeToHints": {
        "signature": "subscribeToHints(pattern: string, handler: (hint: any) => void): void",
        "description": "Subscribe to hint updates",
        "example": "blackboard.subscribeToHints('aqe/*', (hint) => console.log(hint))"
      }
    },
    "integration": {
      "eventbus": "Emit 'blackboard:hint-posted' events",
      "memory": "Use shared_state table",
      "ttl": "Default 1800s (30 min)"
    }
  },

  "validation": {
    "test_scenarios": [
      "Agent A posts hint, Agent B reads it",
      "Hint expires after TTL",
      "Pattern matching works correctly",
      "Event emitted on hint post",
      "Multiple agents can read same hint"
    ]
  },

  "output": {
    "implementation_file": "src/core/coordination/BlackboardCoordination.ts",
    "test_file": "tests/unit/coordination/BlackboardCoordination.test.ts",
    "mcp_tools": [
      "mcp__agentic_qe__blackboard_post",
      "mcp__agentic_qe__blackboard_read"
    ]
  },

  "coordination": {
    "depends_on": ["CF-010"],
    "parallel_with": ["CF-011", "CF-013"],
    "event_emit": "coordination:blackboard-ready"
  }
}
```

#### CF-013: Implement Consensus Gating Pattern

```json
{
  "task_id": "CF-013",
  "title": "Implement Consensus gating for critical operations",
  "agent_type": "backend-dev",
  "priority": "high",
  "estimated_effort": "6h",
  "sparc_phase": "architecture",

  "context": {
    "pattern": "Consensus-based decision making",
    "table": "consensus_state",
    "use_case": "Critical operations require multi-agent approval"
  },

  "implementation": {
    "class": "ConsensusGating",
    "file": "src/core/coordination/ConsensusGating.ts",
    "api": {
      "propose": {
        "signature": "async propose(proposal: ConsensusProposal): Promise<string>",
        "description": "Propose decision for consensus voting",
        "example": "const id = await consensus.propose({ decision: 'deploy-v2', quorum: 3 })"
      },
      "vote": {
        "signature": "async vote(proposalId: string, agentId: string): Promise<boolean>",
        "description": "Vote on consensus proposal",
        "returns": "true if quorum reached, false otherwise"
      },
      "getStatus": {
        "signature": "async getStatus(proposalId: string): Promise<ConsensusStatus>",
        "description": "Get current consensus status"
      }
    },
    "features": [
      "Configurable quorum requirements",
      "Timeout for proposal expiry (via TTL)",
      "Vote tracking and validation",
      "Event emission on consensus reached",
      "Audit trail in consensus_state table"
    ]
  },

  "validation": {
    "test_scenarios": [
      "Proposal created, 3 votes, consensus reached",
      "Proposal created, 2 votes, consensus not reached",
      "Proposal expires after TTL",
      "Duplicate votes rejected",
      "Event emitted when consensus reached"
    ]
  },

  "output": {
    "implementation_file": "src/core/coordination/ConsensusGating.ts",
    "test_file": "tests/unit/coordination/ConsensusGating.test.ts",
    "mcp_tools": [
      "mcp__agentic_qe__consensus_propose",
      "mcp__agentic_qe__consensus_vote"
    ]
  },

  "coordination": {
    "depends_on": ["CF-010"],
    "parallel_with": ["CF-011", "CF-012"],
    "event_emit": "coordination:consensus-ready"
  }
}
```

#### CF-014: Quality Gate - Memory System

```json
{
  "task_id": "CF-014",
  "title": "Execute quality gate for Sprint 2 (Memory System)",
  "agent_type": "qe-quality-gate",
  "priority": "critical",
  "estimated_effort": "2h",
  "sparc_phase": "completion",

  "context": {
    "gate_criteria": {
      "database_created": true,
      "all_tables_present": 12,
      "ttl_service_working": true,
      "blackboard_functional": true,
      "consensus_functional": true,
      "test_coverage": 85,
      "performance_acceptable": true
    }
  },

  "implementation": {
    "validation_checks": [
      {
        "check": "database_integrity",
        "command": "sqlite3 .aqe/memory.db 'SELECT name FROM sqlite_master WHERE type=\"table\"' | wc -l",
        "expected": 12
      },
      {
        "check": "ttl_cleanup",
        "script": "Insert test data with TTL, wait, verify cleanup"
      },
      {
        "check": "blackboard_coordination",
        "script": "Post hint, read hint, verify event emission"
      },
      {
        "check": "consensus_voting",
        "script": "Create proposal, vote, verify consensus"
      },
      {
        "check": "performance_test",
        "script": "Insert 10k records, measure query time < 100ms"
      }
    ]
  },

  "validation": {
    "success_criteria": [
      "All 12 tables exist",
      "TTL cleanup working",
      "Blackboard coordination functional",
      "Consensus gating operational",
      "Query performance acceptable",
      "Test coverage >= 85%"
    ]
  },

  "coordination": {
    "depends_on": ["CF-010", "CF-011", "CF-012", "CF-013"],
    "blocks": ["ALL_SPRINT3_TASKS"],
    "event_emit": "sprint:gate-sprint2-completed",
    "consensus_required": true
  }
}
```

---

## Sprint 3: Advanced Coordination & CLI (Week 5-6)

**Goal**: GOAP/OODA planning, artifact workflows, expanded CLI commands

### Task Group 3.1: Planning Patterns

#### CF-020: Implement GOAP Planning Pattern

```json
{
  "task_id": "CF-020",
  "title": "Implement Goal-Oriented Action Planning (GOAP)",
  "agent_type": "system-architect",
  "priority": "medium",
  "estimated_effort": "8h",
  "sparc_phase": "architecture",

  "context": {
    "pattern": "GOAP for task sequencing and planning",
    "reference": "AQE-IMPROVEMENT-PLAN.md#8-coordination-patterns",
    "use_case": "Automatically plan optimal action sequences to achieve goals"
  },

  "implementation": {
    "class": "GOAPPlanner",
    "file": "src/core/coordination/GOAPPlanner.ts",
    "algorithm": "A* search with preconditions and effects",
    "api": {
      "plan": {
        "signature": "async plan(goal: GOAPGoal, actions: GOAPAction[]): Promise<GOAPAction[]>",
        "description": "Generate action sequence to achieve goal"
      },
      "registerAction": {
        "signature": "registerAction(action: GOAPAction): void",
        "description": "Register available action with preconditions and effects"
      }
    },
    "data_structures": {
      "GOAPGoal": {
        "id": "string",
        "conditions": "string[]",
        "cost": "number"
      },
      "GOAPAction": {
        "id": "string",
        "preconditions": "string[]",
        "effects": "string[]",
        "cost": "number"
      }
    }
  },

  "validation": {
    "test_scenarios": [
      "Simple goal: write_tests → run_tests → ship (2 actions)",
      "Complex goal with branching",
      "Goal with no valid plan (should throw)",
      "Optimal path selection (lowest cost)"
    ]
  },

  "coordination": {
    "depends_on": ["CF-014"],
    "parallel_with": ["CF-021"],
    "event_emit": "coordination:goap-ready"
  }
}
```

#### CF-021: Implement OODA Loop Pattern

```json
{
  "task_id": "CF-021",
  "title": "Implement Observe-Orient-Decide-Act (OODA) Loop",
  "agent_type": "system-architect",
  "priority": "medium",
  "estimated_effort": "8h",
  "sparc_phase": "architecture",

  "context": {
    "pattern": "OODA decision loop for adaptive behavior",
    "phases": ["Observe", "Orient", "Decide", "Act"],
    "use_case": "Continuous decision-making based on real-time observations"
  },

  "implementation": {
    "class": "OODALoop",
    "file": "src/core/coordination/OODALoop.ts",
    "phases": {
      "observe": "Query events, metrics, artifacts from memory",
      "orient": "Build context bundle, compare to patterns",
      "decide": "Generate decision, propose for consensus",
      "act": "Execute decision, record event"
    },
    "integration": {
      "memory": "Read from events, performance_metrics, artifacts tables",
      "patterns": "Match against patterns table",
      "consensus": "Use ConsensusGating for decisions",
      "events": "Emit action events"
    }
  },

  "validation": {
    "test_scenarios": [
      "Full OODA cycle with mock data",
      "Pattern matching works",
      "Consensus integration",
      "Event emission on actions"
    ]
  },

  "coordination": {
    "depends_on": ["CF-013", "CF-014"],
    "parallel_with": ["CF-020"],
    "event_emit": "coordination:ooda-ready"
  }
}
```

### Task Group 3.2: Artifact Workflow

#### CF-022: Implement Artifact-Centric Workflow

```json
{
  "task_id": "CF-022",
  "title": "Implement artifact manifests and reference-based workflows",
  "agent_type": "backend-dev",
  "priority": "medium",
  "estimated_effort": "6h",
  "sparc_phase": "architecture",

  "context": {
    "pattern": "Store large outputs as artifacts, reference by manifest",
    "table": "artifacts",
    "benefit": "Reduce memory usage, enable versioning, SHA verification"
  },

  "implementation": {
    "class": "ArtifactWorkflow",
    "file": "src/core/ArtifactWorkflow.ts",
    "api": {
      "createArtifact": {
        "signature": "async createArtifact(content: string, metadata: ArtifactMetadata): Promise<string>",
        "description": "Store artifact and create manifest",
        "returns": "artifact_id"
      },
      "retrieveArtifact": {
        "signature": "async retrieveArtifact(artifactId: string): Promise<{ manifest: any, content: string }>",
        "description": "Retrieve artifact with integrity check"
      }
    },
    "features": [
      "SHA256 integrity verification",
      "File system storage for content",
      "Manifest in artifacts table",
      "Support for code, doc, data, config types",
      "Tagging and metadata"
    ]
  },

  "validation": {
    "test_scenarios": [
      "Create artifact, retrieve, verify content matches",
      "SHA256 integrity check fails on corrupted file",
      "Multiple artifacts with same content (deduplication)",
      "Query artifacts by tags"
    ]
  },

  "coordination": {
    "depends_on": ["CF-010"],
    "parallel_with": ["CF-020", "CF-021"],
    "event_emit": "coordination:artifacts-ready"
  }
}
```

### Task Group 3.3: CLI Expansion

#### CF-023: Implement Advanced CLI Commands (20+ new commands)

```json
{
  "task_id": "CF-023",
  "title": "Expand CLI from 8 to 30+ commands",
  "agent_type": "coder",
  "priority": "medium",
  "estimated_effort": "12h",
  "sparc_phase": "refinement",

  "context": {
    "current_commands": 8,
    "target_commands": 30,
    "categories": [
      "Fleet management (10)",
      "Memory operations (8)",
      "Workflow orchestration (6)",
      "Monitoring (6)"
    ]
  },

  "implementation": {
    "new_commands": [
      {
        "category": "Fleet Management",
        "commands": [
          "aqe fleet scale --agent-type <type> --count <n>",
          "aqe fleet monitor --mode real-time",
          "aqe fleet health --export-report",
          "aqe fleet topology --mode mesh",
          "aqe agent list --filter active",
          "aqe agent metrics --agent-id <id>",
          "aqe agent logs --agent-id <id> --tail 100",
          "aqe agent kill --agent-id <id> --graceful"
        ]
      },
      {
        "category": "Memory Operations",
        "commands": [
          "aqe memory query --search <pattern> --namespace <ns>",
          "aqe memory backup --export backup.json",
          "aqe memory restore --import backup.json",
          "aqe blackboard post --key <key> --value <json>",
          "aqe blackboard read --pattern <pattern>",
          "aqe consensus propose --decision <desc> --quorum <n>",
          "aqe consensus vote --proposal-id <id> --agent-id <id>",
          "aqe consensus status --proposal-id <id>"
        ]
      },
      {
        "category": "Workflow",
        "commands": [
          "aqe workflow create --name <name> --file workflow.yaml",
          "aqe workflow execute --workflow-id <id>",
          "aqe workflow status --workflow-id <id> --watch",
          "aqe workflow checkpoint --workflow-id <id>",
          "aqe workflow resume --session-id <id>",
          "aqe task orchestrate --task <desc> --agents <n>"
        ]
      },
      {
        "category": "Monitoring",
        "commands": [
          "aqe monitor fleet --dashboard",
          "aqe monitor agent --agent-id <id>",
          "aqe report generate --type performance",
          "aqe metrics export --format prometheus",
          "aqe logs tail --component all --follow",
          "aqe health-check --export-report"
        ]
      }
    ],
    "output_formats": ["json", "yaml", "table", "csv"],
    "interactive_prompts": "Use inquirer for complex commands"
  },

  "validation": {
    "test_each_command": true,
    "success_criteria": [
      "All 22+ new commands functional",
      "Help text clear and accurate",
      "Output formatting works",
      "Error handling comprehensive"
    ]
  },

  "coordination": {
    "depends_on": ["CF-012", "CF-013"],
    "parallel_with": ["CF-024"],
    "event_emit": "cli:expansion-complete"
  }
}
```

---

## Sprint 4: Performance & Optimization (Week 7-8)

**Goal**: Sublinear algorithms, neural training foundation, performance benchmarks

### CF-030: Implement Sublinear Test Selection

```json
{
  "task_id": "CF-030",
  "title": "Implement O(log n) test selection optimization",
  "agent_type": "qe-coverage-analyzer",
  "priority": "high",
  "estimated_effort": "12h",
  "sparc_phase": "architecture",

  "context": {
    "algorithm": "Sublinear optimization for test selection",
    "goal": "Minimize test count while maximizing coverage",
    "reference": "AQE-IMPROVEMENT-PLAN.md#6-sublinear-algorithm-integration"
  },

  "implementation": {
    "approach": "Johnson-Lindenstrauss dimension reduction + greedy selection",
    "steps": [
      "Build coverage matrix (tests × code lines)",
      "Apply JL reduction to O(log n) dimensions",
      "Use greedy algorithm to select minimal test set",
      "Verify coverage threshold met"
    ],
    "mcp_integration": "Use mcp__sublinear-solver__solveTrueSublinear"
  },

  "validation": {
    "test_scenarios": [
      "1000 tests → 100 tests (90% coverage maintained)",
      "Execution time < 5s for 10k test suite",
      "Verify O(log n) complexity empirically"
    ]
  },

  "coordination": {
    "depends_on": ["CF-014"],
    "event_emit": "optimization:sublinear-ready"
  }
}
```

---

## Parallel Execution Plan

### Wave 1 (Sprint 1 - Week 1)
**Can run in parallel:**
- CF-001 (TestGeneratorAgent fixes)
- CF-002 (Agent lifecycle fixes)
- CF-003 (EventBus fixes)

**Sequential:**
- CF-004 (Full test suite) → Depends on CF-001, CF-002, CF-003
- CF-005 (Quality gate) → Depends on CF-004

### Wave 2 (Sprint 2 - Week 3)
**Can run in parallel after CF-005:**
- CF-010 (SQLite schema) - blocks others
- CF-011 (TTL service) - depends on CF-010
- CF-012 (Blackboard) - depends on CF-010
- CF-013 (Consensus) - depends on CF-010

**Sequential:**
- CF-014 (Quality gate) → Depends on CF-010, CF-011, CF-012, CF-013

### Wave 3 (Sprint 3 - Week 5)
**Can run in parallel after CF-014:**
- CF-020 (GOAP)
- CF-021 (OODA)
- CF-022 (Artifacts)
- CF-023 (CLI expansion)

---

## Execution Scripts

See companion files:
- `/workspaces/agentic-qe-cf/scripts/claude-flow/execute-sprint1.sh`
- `/workspaces/agentic-qe-cf/scripts/claude-flow/execute-sprint2.sh`
- `/workspaces/agentic-qe-cf/scripts/claude-flow/execute-sprint3.sh`
- `/workspaces/agentic-qe-cf/scripts/claude-flow/monitor-progress.sh`

---

## Memory Coordination Schema

All tasks use these memory namespaces:

```
aqe/tasks/{task_id}/status       - Task execution status
aqe/tasks/{task_id}/result       - Task output
aqe/tasks/{task_id}/artifacts    - Generated artifacts
aqe/coordination/sprint-state    - Sprint-level coordination
aqe/quality-gates/{sprint}/result - Quality gate outcomes
aqe/metrics/{category}            - Performance metrics
shared/sprint-progress            - Cross-task progress tracking
```

---

## Success Metrics

### Sprint 1
- ✅ 0 unit test failures
- ✅ Build: green
- ✅ Coverage: >80%

### Sprint 2
- ✅ SQLite database operational
- ✅ 12 tables implemented
- ✅ Blackboard + Consensus working

### Sprint 3
- ✅ GOAP + OODA operational
- ✅ Artifact workflows functional
- ✅ CLI: 30+ commands

### Sprint 4
- ✅ Sublinear optimization working
- ✅ O(log n) test selection validated

---

**End of Task Definitions**

*For execution instructions, see companion shell scripts in `/scripts/claude-flow/`*
