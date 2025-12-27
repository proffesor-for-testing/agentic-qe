# AI-Friendly Output Format - Architecture Diagram

**Version:** 1.0.0
**Created:** 2025-12-12
**Related:** [AI Output Format Spec](./ai-output-format-spec.md)

## System Architecture (C4 Model - Level 2)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         AI-Friendly Output System                          │
└────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            INPUT LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Test Results │  │   Coverage   │  │ Agent Status │  │   Quality    │  │
│  │    Data      │  │     Data     │  │     Data     │  │  Metrics     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │                 │           │
└─────────┼─────────────────┼──────────────────┼─────────────────┼───────────┘
          │                 │                  │                 │
          ▼                 ▼                  ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ENVIRONMENT DETECTION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │              OutputModeDetector.detectMode()                       │   │
│  │                                                                    │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │   │
│  │  │AQE_AI_OUTPUT │  │  CLAUDECODE  │  │  CURSOR_AI   │  ...      │   │
│  │  │     = 1      │  │     = 1      │  │     = 1      │           │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │   │
│  │         └────────────┬─────────────────┘                         │   │
│  │                      ▼                                            │   │
│  │              ┌───────────────┐                                   │   │
│  │              │  AI Mode = 1  │───────┐                           │   │
│  │              └───────────────┘       │                           │   │
│  │                                      │                           │   │
│  │              ┌───────────────┐       │                           │   │
│  │              │ Human Mode = 0│◄──────┘                           │   │
│  │              └───────────────┘                                   │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OUTPUT FORMATTER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   AI Mode = 1                          │    Human Mode = 0                 │
│   ───────────                          │    ─────────────                  │
│   ┌─────────────────────────┐         │    ┌──────────────────────┐       │
│   │  AIOutputGenerator      │         │    │  HumanOutputFormatter│       │
│   │                         │         │    │                      │       │
│   │  ┌──────────────────┐  │         │    │  ┌─────────────────┐ │       │
│   │  │ Schema Builder   │  │         │    │  │ Terminal Format │ │       │
│   │  │ - Base fields    │  │         │    │  │ - Colors/ANSI   │ │       │
│   │  │ - Metadata       │  │         │    │  │ - Tables        │ │       │
│   │  │ - Data payload   │  │         │    │  │ - Summaries     │ │       │
│   │  └──────────────────┘  │         │    │  └─────────────────┘ │       │
│   │                         │         │    │                      │       │
│   │  ┌──────────────────┐  │         │    └──────────────────────┘       │
│   │  │ Action Generator │  │         │                                     │
│   │  │ - Analyze data   │  │         │                                     │
│   │  │ - Create actions │  │         │                                     │
│   │  │ - Prioritize     │  │         │                                     │
│   │  └──────────────────┘  │         │                                     │
│   │                         │         │                                     │
│   │  ┌──────────────────┐  │         │                                     │
│   │  │ JSON Serializer  │  │         │                                     │
│   │  │ - Deterministic  │  │         │                                     │
│   │  │ - Compact/Pretty │  │         │                                     │
│   │  └──────────────────┘  │         │                                     │
│   └─────────────────────────┘         │                                     │
│                                        │                                     │
└────────────────────────────────────────┼─────────────────────────────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
┌───────────────────────────────┐         ┌───────────────────────────────┐
│      JSON OUTPUT              │         │    TERMINAL OUTPUT            │
├───────────────────────────────┤         ├───────────────────────────────┤
│                               │         │                               │
│  {                            │         │  ========================     │
│    "schemaVersion": "1.0.0",  │         │  Test Results - 150 tests    │
│    "outputType": "test_results│         │  ========================     │
│    "status": "failure",       │         │                               │
│    "data": {                  │         │  ✓ Passed: 145 (96.67%)      │
│      "summary": {             │         │  ✗ Failed: 3 (2.00%)         │
│        "total": 150,          │         │  ⊘ Skipped: 2 (1.33%)        │
│        "passed": 145,         │         │                               │
│        "failed": 3            │         │  ⚠️  Actions Required:        │
│      }                        │         │  1. Fix 3 test failures      │
│    },                         │         │  2. Stabilize flaky tests    │
│    "actionSuggestions": [     │         │                               │
│      {                        │         │  Duration: 12.5s             │
│        "action": "fix_...",   │         │  Coverage: 87.5%             │
│        "priority": "critical" │         │  ========================     │
│      }                        │         │                               │
│    ]                          │         │                               │
│  }                            │         │                               │
│                               │         │                               │
└───────────────────────────────┘         └───────────────────────────────┘
```

## Component Interactions (Sequence Diagram)

```
┌──────────┐     ┌─────────────┐     ┌────────────┐     ┌──────────────┐
│  Agent   │     │  Detector   │     │ Formatter  │     │    Output    │
└────┬─────┘     └──────┬──────┘     └─────┬──────┘     └──────┬───────┘
     │                  │                   │                   │
     │ execute()        │                   │                   │
     ├─────────────────►│                   │                   │
     │                  │                   │                   │
     │              detectMode()            │                   │
     │                  ├──────────────────►│                   │
     │                  │                   │                   │
     │                  │ Check ENV vars    │                   │
     │                  │ (CLAUDECODE, etc) │                   │
     │                  │                   │                   │
     │                  │   Mode: AI/HUMAN  │                   │
     │                  │◄──────────────────┤                   │
     │                  │                   │                   │
     │ format(data, mode)                   │                   │
     ├──────────────────┼──────────────────►│                   │
     │                  │                   │                   │
     │                  │              AI Mode?                 │
     │                  │                   ├─────┐             │
     │                  │                   │     │             │
     │                  │                   │ Yes │             │
     │                  │                   │◄────┘             │
     │                  │                   │                   │
     │                  │           generateSchema()            │
     │                  │                   ├─────┐             │
     │                  │                   │     │ Base fields │
     │                  │                   │     │ Metadata    │
     │                  │                   │     │ Data payload│
     │                  │                   │◄────┘             │
     │                  │                   │                   │
     │                  │        generateActionSuggestions()    │
     │                  │                   ├─────┐             │
     │                  │                   │     │ Analyze     │
     │                  │                   │     │ Prioritize  │
     │                  │                   │     │ Create steps│
     │                  │                   │◄────┘             │
     │                  │                   │                   │
     │                  │            JSON.stringify()           │
     │                  │                   ├─────┐             │
     │                  │                   │     │ Deterministic
     │                  │                   │     │ Compact     │
     │                  │                   │◄────┘             │
     │                  │                   │                   │
     │                  │   JSON Output     │                   │
     │◄─────────────────┼───────────────────┤                   │
     │                  │                   │                   │
     │ write(output)    │                   │                   │
     ├──────────────────┼───────────────────┼──────────────────►│
     │                  │                   │                   │
     │                  │                   │      stdout/file  │
     │                  │                   │                   ├───►
     │                  │                   │                   │
     ▼                  ▼                   ▼                   ▼
```

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          DATA SOURCES                                │
└──────────────────────────────────────────────────────────────────────┘
     │                │                │                │
     │ Test Results   │ Coverage Data  │ Agent Status   │ Quality Metrics
     │                │                │                │
     ▼                ▼                ▼                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA TRANSFORMATION                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌────────────┐      ┌────────────┐      ┌────────────┐             │
│  │  Validate  │─────►│  Normalize │─────►│  Enrich    │             │
│  │   Input    │      │    Data    │      │  Metadata  │             │
│  └────────────┘      └────────────┘      └────────────┘             │
│                                                                        │
└────────────────────────────────────────────┬───────────────────────────┘
                                             │
                                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      SCHEMA GENERATION                                 │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                   Base Schema Builder                         │    │
│  │                                                               │    │
│  │  schemaVersion ────► "1.0.0"                                 │    │
│  │  outputType    ────► "test_results"                          │    │
│  │  timestamp     ────► ISO 8601                                │    │
│  │  executionId   ────► Deterministic Hash                      │    │
│  │  status        ────► success | failure | warning | error     │    │
│  │  metadata      ────► Agent info, duration, environment       │    │
│  │  data          ────► Type-specific payload                   │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │              Action Suggestion Generator                      │    │
│  │                                                               │    │
│  │  Analyze Data ────► Detect issues                            │    │
│  │                     - Test failures                          │    │
│  │                     - Coverage gaps                          │    │
│  │                     - Flaky tests                            │    │
│  │                     - Quality issues                         │    │
│  │                                                               │    │
│  │  Create Actions ──► For each issue:                          │    │
│  │                     - Action type                            │    │
│  │                     - Priority                               │    │
│  │                     - Reason                                 │    │
│  │                     - Steps                                  │    │
│  │                     - Automation                             │    │
│  │                                                               │    │
│  │  Prioritize ──────► Sort by priority weight                  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
└────────────────────────────────────────────┬───────────────────────────┘
                                             │
                                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        JSON SERIALIZATION                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Deterministic Ordering ─────► Same input = Same JSON                 │
│  Field Consistency   ─────────► All required fields present           │
│  Number Precision    ─────────► Fixed decimal places                  │
│  ISO 8601 Timestamps ─────────► Standard format                       │
│                                                                        │
│  ┌──────────────┐           ┌──────────────┐                         │
│  │   Compact    │           │  Pretty-Print│                         │
│  │  (Default)   │           │  (Debug Mode)│                         │
│  │  No spaces   │           │  Indented    │                         │
│  │  Minimal size│           │  Readable    │                         │
│  └──────┬───────┘           └──────┬───────┘                         │
│         │                          │                                  │
└─────────┼──────────────────────────┼──────────────────────────────────┘
          │                          │
          ▼                          ▼
┌───────────────────┐      ┌──────────────────────┐
│  Production JSON  │      │   Development JSON   │
│  (AI Consumption) │      │   (Human Debug)      │
│                   │      │                      │
│  {"schema..."}    │      │  {                   │
│                   │      │    "schemaVersion": ..│
│  Fast parsing     │      │    "outputType": ... │
│  < 1ms            │      │  }                   │
│                   │      │                      │
└───────────────────┘      └──────────────────────┘
```

## Streaming Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   LONG-RUNNING OPERATION                       │
│                  (Test Execution, Coverage)                    │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                     STREAM CONTROLLER                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Phase 1: START                                               │
│  ─────────────────                                            │
│  {                                                            │
│    "streamType": "start",                                     │
│    "executionId": "exec_123",                                 │
│    "metadata": { "totalTests": 150 }                          │
│  }                                                            │
│                                                                │
│  ▼                                                            │
│                                                                │
│  Phase 2: PROGRESS (Incremental)                             │
│  ─────────────────────────────────                            │
│  {"streamType": "progress", "completed": 25, "total": 150}    │
│  {"streamType": "progress", "completed": 50, "total": 150}    │
│  {"streamType": "progress", "completed": 75, "total": 150}    │
│  ...                                                          │
│                                                                │
│  ▼                                                            │
│                                                                │
│  Phase 3: COMPLETE (Full Schema)                             │
│  ─────────────────────────────────                            │
│  {                                                            │
│    "streamType": "complete",                                  │
│    "schemaVersion": "1.0.0",                                  │
│    "outputType": "test_results",                              │
│    "data": { ... full result ... },                           │
│    "actionSuggestions": [ ... ]                               │
│  }                                                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                      STREAM OUTPUT                             │
│                 (Newline-Delimited JSON)                       │
└────────────────────────────────────────────────────────────────┘
```

## Integration Points

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI AGENTS & TOOLS                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ Claude Code  │  │  Cursor AI   │  │   Aider AI   │            │
│  │ CLAUDECODE=1 │  │ CURSOR_AI=1  │  │ AIDER_AI=1   │            │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │
│         │                 │                  │                     │
│         └─────────────────┼──────────────────┘                     │
│                           │                                        │
└───────────────────────────┼────────────────────────────────────────┘
                            │ Auto-detect AI mode
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   OUTPUT FORMATTER MODULE                           │
│                 (/src/output/OutputFormatter.ts)                    │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            │ Structured JSON
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        CONSUMERS                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │  AI Agents   │  │   CI/CD      │  │  Dashboards  │            │
│  │  Parse JSON  │  │  jq parsing  │  │  Visualize   │            │
│  │  Execute     │  │  Log analysis│  │  Trends      │            │
│  │  Actions     │  │  Automation  │  │  Metrics     │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Schema Evolution Path

```
Version 1.0.0 (Current)
─────────────────────────
• Base schema with 4 output types
• 10 action suggestion types
• Environment auto-detection
• Streaming support

         │
         │ Additive changes only
         ▼

Version 1.1.0 (Future)
─────────────────────────
• New output type: 'performance_metrics'
• New action: 'optimize_database_queries'
• Additional metadata fields
• Enhanced streaming with checkpoints

         │
         │ Backward compatible
         ▼

Version 1.2.0 (Future)
─────────────────────────
• New output type: 'security_scan'
• Action automation improvements
• Multi-language support
• Compressed streaming

         │
         │ Breaking changes
         ▼

Version 2.0.0 (Future)
─────────────────────────
• Restructured schema
• New action framework
• Enhanced determinism
• Binary format option
```

---

**Architecture Designer:** System Architecture Designer Agent
**Version:** 1.0.0
**Date:** 2025-12-12
