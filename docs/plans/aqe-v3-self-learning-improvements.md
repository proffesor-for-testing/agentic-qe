# GOAP Implementation Plan: Self-Learning AQE with Optional Claude-Flow Enhancement

**Created**: 2026-01-23
**Updated**: 2026-01-23
**Status**: In Progress (Phase 1, 2, 3 & 4 Complete)
**Author**: goal-planner agent

---

## Implementation Progress

### ✅ Phase 1: Modular Init Architecture (COMPLETED)

Created modular init system with 12 phases:

```
v3/src/init/
├── orchestrator.ts              # Thin orchestrator (~180 lines)
├── phases/                      # 12 pipeline phases
│   ├── index.ts                 # Phase registry & exports
│   ├── phase-interface.ts       # InitPhase interface & BasePhase
│   ├── 01-detection.ts          # V2 detection (~180 lines)
│   ├── 02-analysis.ts           # Project analysis (~40 lines)
│   ├── 03-configuration.ts      # Config generation (~120 lines)
│   ├── 04-database.ts           # SQLite setup (~120 lines)
│   ├── 05-learning.ts           # Learning system (~130 lines)
│   ├── 06-code-intelligence.ts  # KG indexing (~145 lines)
│   ├── 07-hooks.ts              # Claude Code hooks (~245 lines)
│   ├── 08-mcp.ts                # MCP server config (~85 lines)
│   ├── 09-assets.ts             # Skills & agents (~110 lines)
│   ├── 10-workers.ts            # Background workers (~145 lines)
│   ├── 11-claude-md.ts          # CLAUDE.md generation (~145 lines)
│   └── 12-verification.ts       # Final verification (~225 lines)
├── enhancements/                # Optional claude-flow adapters
│   ├── index.ts                 # Enhancement registry
│   ├── detector.ts              # Detect available enhancements
│   ├── claude-flow-adapter.ts   # Bridge to CF MCP (~250 lines)
│   └── types.ts                 # Enhancement interfaces
└── migration/                   # v2 to v3 migration
    ├── index.ts                 # Migration exports
    ├── detector.ts              # V2 detection (~115 lines)
    ├── data-migrator.ts         # Pattern migration (~195 lines)
    └── config-migrator.ts       # Config migration (~120 lines)
```

**Key Features Implemented:**
- Phase-based pipeline with `InitPhase` interface
- `BasePhase` class with timing and error handling
- `ModularInitOrchestrator` for phase execution
- Optional claude-flow enhancement adapters
- V2 to v3 migration modules
- All phases properly typed and exported

---

### ✅ Phase 2: Enhancement Adapter Layer (COMPLETED)

Created Claude Flow adapter bridges with graceful degradation:

```
v3/src/adapters/claude-flow/
├── index.ts                    # Unified ClaudeFlowBridge class
├── types.ts                    # Trajectory, ModelRouting, Pretrain types
├── trajectory-bridge.ts        # SONA trajectory integration
├── model-router-bridge.ts      # 3-tier model routing (haiku/sonnet/opus)
└── pretrain-bridge.ts          # Codebase analysis pipeline
```

Created unified learning engine with graceful degradation:

```
v3/src/learning/
├── aqe-learning-engine.ts      # Unified AQELearningEngine class
└── index.ts                    # Updated exports
```

**Key Features:**
- `ClaudeFlowBridge` - Unified bridge managing trajectory, modelRouter, pretrain
- `TrajectoryBridge` - SONA trajectories (falls back to SQLite)
- `ModelRouterBridge` - 3-tier model routing (falls back to rule-based)
- `PretrainBridge` - Codebase analysis (falls back to local scanning)
- `AQELearningEngine` - Unified learning engine that works standalone:
  - Pattern storage/retrieval (always available)
  - HNSW vector search (always available)
  - Task routing to agents (always available)
  - SONA trajectories (when Claude Flow available)
  - Model routing (enhanced when Claude Flow available)
  - Codebase pretrain (enhanced when Claude Flow available)

**Graceful Degradation:**
- All Claude Flow features are optional
- Engine works fully standalone without Claude Flow
- Claude Flow enhances capabilities when detected
- No breaking changes for users without Claude Flow

---

### ✅ Phase 3: Init Command Implementation (COMPLETED)

Created standalone init command with Claude Flow integration:

```
v3/src/cli/commands/
├── init.ts                     # Standalone init command (~440 lines)
│   ├── createInitCommand()     # Main init command with subcommands
│   ├── runInit()               # Init action using ModularInitOrchestrator
│   ├── checkStatus()           # Status subcommand
│   ├── runMigration()          # v2 to v3 migration
│   └── runReset()              # Reset configuration
└── claude-flow-setup.ts        # Claude Flow integration setup (~400 lines)
    ├── detectClaudeFlow()      # Detection via MCP, CLI, or npm
    ├── detectFeatures()        # Feature availability check
    ├── generateClaudeFlowConfig() # Config generation
    ├── updateMCPConfig()       # MCP server configuration
    └── runPretrainAnalysis()   # Initial codebase analysis
```

**Key Features:**
- Uses `ModularInitOrchestrator` from Phase 1
- Claude Flow detection via 3 methods: MCP settings, CLI, npm package
- Feature detection for trajectories, modelRouting, pretrain, workers
- Graceful degradation when Claude Flow unavailable
- v2 to v3 migration with proper interfaces
- Status, migrate, and reset subcommands

**CLI Options:**
- `--auto`: Auto-configure without prompts
- `--auto-migrate`: Automatically migrate from v2
- `--minimal`: Minimal installation
- `--with-claude-flow`: Force Claude Flow setup
- `--skip-claude-flow`: Skip Claude Flow integration
- `--with-n8n`: Include n8n workflow testing

---

### ✅ Phase 4: Self-Learning Features (COMPLETED)

Created comprehensive self-learning infrastructure:

```
v3/src/learning/
├── experience-capture.ts      # Task experience capture & pattern extraction
├── aqe-learning-engine.ts     # Unified engine with experience capture integration
└── index.ts                   # Updated exports for experience capture
```

**ExperienceCaptureService Features:**
- `startCapture(task, options)` - Begin capturing task execution experience
- `recordStep(experienceId, step)` - Record steps during execution
- `completeCapture(experienceId, outcome)` - Complete and evaluate experience
- `extractPattern(experience)` - Extract reusable patterns from successful experiences
- `shareAcrossDomains(experience)` - Share high-quality experiences with related domains

**Pattern Promotion System:**
- Patterns tracked with `successCount` and `usageCount`
- Automatic promotion after threshold uses (default: 3 successful uses)
- Quality score calculation combining success rate and average quality
- Promotes to long-term storage when quality >= 0.8 and threshold met

**Cross-Domain Learning:**
- Already implemented in `LearningOptimizationCoordinator`
- `shareCrossDomainLearnings()` handles knowledge transfer
- `getRelatedDomains()` defines domain relationships:
  - test-generation ↔ test-execution, coverage-analysis
  - quality-assessment ↔ test-execution, coverage-analysis, defect-intelligence
  - etc.

**Claude Flow Trajectory Integration:**
- `AQELearningEngine.startTask()` starts both SONA trajectory and experience capture
- Experiences linked to trajectories via `trajectoryId`
- Graceful degradation when Claude Flow unavailable
- Local experience capture always works standalone

**Key Interfaces:**
```typescript
interface TaskExperience {
  id: string;
  task: string;
  domain: QEDomain;
  agent?: string;
  startTime: Date;
  endTime?: Date;
  steps: ExperienceStep[];
  outcome?: { success: boolean; quality: number; error?: string };
  trajectoryId?: string;  // Links to SONA trajectory
  metadata?: Record<string, unknown>;
}

interface PatternExtractionResult {
  extracted: boolean;
  pattern?: QEPattern;
  promoted: boolean;
  quality: number;
  reason?: string;
}
```

---

## 1. Current State Analysis

### 1.1 What Currently Works

**In `.claude/helpers/` (Legacy/Helper Layer):**
- `learning-service.mjs`: Custom HNSW indexing, SQLite pattern storage, short-term to long-term promotion
- `learning-hooks.sh`: Session lifecycle management, pattern storage/search CLI
- `router.js`: Basic regex-based task routing to agents

**In `v3/src/` (Core AQE v3):**
- `learning/qe-reasoning-bank.ts`: Full pattern learning with HNSW, QE domains, agent routing
- `learning/pattern-store.ts`: Pattern storage with quality scoring
- `domains/learning-optimization/`: Domain services for cross-domain learning
- `adapters/trajectory-adapter.ts`: Browser trajectory to pattern conversion
- `integrations/embeddings/`: ONNX embeddings with HNSW indexing

**Dependencies:**
- `better-sqlite3`: Database storage
- `hnswlib-node`: Vector search (native binary)
- `@xenova/transformers`: ONNX embeddings
- `@ruvector/*`: Optional advanced learning (GNN, SONA, attention)

### 1.2 What's Missing/Unused

**Claude Flow MCP Features NOT Integrated:**
1. **Trajectory Tracking (SONA)** - `hooks_intelligence_trajectory-*`
2. **3-Tier Model Routing** - `hooks_model-route/outcome/stats`
3. **Pretrain Analysis Pipeline** - `hooks_pretrain`, `hooks_build-agents`
4. **Transfer Learning** - `hooks_transfer`
5. **Worker Auto-Detection** - `hooks_worker-detect`
6. **DAA (Decentralized Autonomous Agents)** - `daa_*`
7. **AIDefence Security** - `aidefence_*`

### 1.3 Key Architectural Issues

1. **Duplicate Learning Systems**: Helper layer vs. v3 core have separate implementations
2. **No `aqe init` in v3**: The init command only exists in v2
3. **Claude-flow dependency confusion**: Some features require MCP, others don't
4. **No clear upgrade path**: v2 -> v3 migration unclear

---

## 2. Goal State Definition

### 2.1 Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Agentic QE v3 (Standalone)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     AQE Core Learning Engine                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ Pattern     │  │ Experience  │  │ HNSW        │  │ Agent       │ │   │
│  │  │ Store       │  │ Replay      │  │ Index       │  │ Router      │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────▼───────────────────────────────────┐   │
│  │                    Enhancement Adapter Layer                         │   │
│  │  ┌─────────────────────┐          ┌─────────────────────────────┐   │   │
│  │  │ Claude-Flow Adapter │          │ RuVector Adapter            │   │   │
│  │  │ (Optional)          │          │ (Optional)                  │   │   │
│  │  └─────────────────────┘          └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                        ┌─────────────▼─────────────┐
                        │    External Enhancers     │
                        │  ┌───────────────────┐    │
                        │  │ Claude-Flow MCP   │    │
                        │  │ (when available)  │    │
                        │  └───────────────────┘    │
                        │  ┌───────────────────┐    │
                        │  │ RuVector Docker   │    │
                        │  │ (when available)  │    │
                        │  └───────────────────┘    │
                        └───────────────────────────┘
```

### 2.2 Key Design Principles

1. **AQE Core Works Standalone**: All learning features work without claude-flow
2. **Optional Enhancement**: Claude-flow/RuVector add capabilities, not requirements
3. **Single Init Command**: `aqe init` handles all scenarios
4. **Graceful Degradation**: Features adapt to available dependencies
5. **No Breaking Changes**: Existing users upgrade seamlessly

---

## 3. GOAP Action Plan

### 3.1 Phase 1: Core Consolidation (Preconditions: None)

**Goal State**: Single unified learning engine in v3

**Actions:**

```
Action: consolidate_learning_systems
  Preconditions: {v3_exists: true}
  Effects: {learning_unified: true, duplicate_code_removed: true}
  Cost: 8
  Files:
    - DELETE: .claude/helpers/learning-service.mjs (move to v3)
    - MODIFY: v3/src/learning/aqe-learning-engine.ts (new unified engine)
    - MODIFY: v3/src/learning/index.ts (export unified API)

Action: create_v3_init_command
  Preconditions: {v3_exists: true}
  Effects: {init_command_exists: true}
  Cost: 10
  Files:
    - CREATE: v3/src/cli/commands/init.ts
    - CREATE: v3/src/init/orchestrator.ts
    - MODIFY: v3/src/cli/index.ts (register init command)

Action: implement_standalone_pattern_learning
  Preconditions: {learning_unified: true}
  Effects: {standalone_learning: true}
  Cost: 6
  Description: Pattern learning works without any external dependencies
  Files:
    - MODIFY: v3/src/learning/pattern-store.ts (ensure no external deps)
    - MODIFY: v3/src/learning/qe-reasoning-bank.ts (graceful fallbacks)
```

### 3.2 Phase 2: Enhancement Adapter Layer (Preconditions: Phase 1)

**Goal State**: Clean adapter interfaces for optional integrations

**Actions:**

```
Action: create_claude_flow_adapter
  Preconditions: {learning_unified: true, init_command_exists: true}
  Effects: {claude_flow_adapter: true}
  Cost: 8
  Files:
    - CREATE: v3/src/adapters/claude-flow/index.ts
    - CREATE: v3/src/adapters/claude-flow/trajectory-bridge.ts
    - CREATE: v3/src/adapters/claude-flow/model-router-bridge.ts
    - CREATE: v3/src/adapters/claude-flow/pretrain-bridge.ts

Action: create_enhancement_detector
  Preconditions: {claude_flow_adapter: true}
  Effects: {enhancement_detection: true}
  Cost: 4
  Files:
    - CREATE: v3/src/init/enhancement-detector.ts
  Description: Detects if claude-flow MCP, RuVector, etc. are available

Action: implement_graceful_degradation
  Preconditions: {enhancement_detection: true}
  Effects: {graceful_degradation: true}
  Cost: 6
  Files:
    - MODIFY: v3/src/learning/aqe-learning-engine.ts
  Description: Engine uses enhancers when available, falls back gracefully
```

### 3.3 Phase 3: Init Command Implementation (Preconditions: Phase 2)

**Goal State**: Comprehensive `aqe init` that handles all scenarios

**Actions:**

```
Action: implement_init_orchestrator
  Preconditions: {init_command_exists: true, enhancement_detection: true}
  Effects: {init_orchestrator: true}
  Cost: 12
  Files:
    - MODIFY: v3/src/init/orchestrator.ts
  Steps:
    1. Detect project type (new/existing/upgrade)
    2. Analyze project (frameworks, languages)
    3. Detect available enhancements
    4. Generate optimal configuration
    5. Initialize databases and patterns
    6. Install agents and skills
    7. Configure hooks integration

Action: implement_upgrade_detection
  Preconditions: {init_orchestrator: true}
  Effects: {upgrade_support: true}
  Cost: 6
  Files:
    - CREATE: v3/src/init/upgrade-detector.ts
    - CREATE: v3/src/init/migration-runner.ts
  Description: Detect v2 installations and migrate data

Action: implement_claude_flow_integration
  Preconditions: {init_orchestrator: true, claude_flow_adapter: true}
  Effects: {claude_flow_integration: true}
  Cost: 8
  Files:
    - CREATE: v3/src/init/claude-flow-setup.ts
  Description: When claude-flow detected, register enhanced features
```

### 3.4 Phase 4: Self-Learning Features (Preconditions: Phase 3)

**Goal State**: AQE learns from every operation

**Actions:**

```
Action: implement_experience_capture
  Preconditions: {learning_unified: true}
  Effects: {experience_capture: true}
  Cost: 8
  Files:
    - MODIFY: v3/src/learning/experience-capture.ts
    - CREATE: v3/src/hooks/post-task-hook.ts
  Description: Capture task outcomes for learning

Action: implement_pattern_promotion
  Preconditions: {experience_capture: true}
  Effects: {pattern_promotion: true}
  Cost: 6
  Files:
    - MODIFY: v3/src/learning/aqe-learning-engine.ts
  Description: Short-term patterns promoted after 3+ successful uses

Action: implement_cross_domain_learning
  Preconditions: {pattern_promotion: true}
  Effects: {cross_domain_learning: true}
  Cost: 6
  Files:
    - MODIFY: v3/src/domains/learning-optimization/coordinator.ts
  Description: Share learnings across QE domains

Action: integrate_claude_flow_trajectories
  Preconditions: {claude_flow_adapter: true, experience_capture: true}
  Effects: {trajectory_integration: true}
  Cost: 8
  Files:
    - MODIFY: v3/src/adapters/claude-flow/trajectory-bridge.ts
  Description: When claude-flow available, use SONA trajectories
```

---

## 4. `aqe init` Command Specification

### 4.1 Command Interface

```bash
# Fresh installation (new project)
aqe init

# Auto-detect and upgrade from v2
aqe init --auto-migrate

# Quick auto-configuration (no prompts)
aqe init --auto

# Minimal installation (no skills, patterns, or workers)
aqe init --minimal

# Include n8n workflow testing platform
aqe init --with-n8n

# Skip pattern loading
aqe init --skip-patterns

# Combined options
aqe init --auto --auto-migrate --with-n8n
```

### 4.2 Init Phases

```typescript
interface InitPhase {
  name: string;
  critical: boolean;
  execute: (config: AQEConfig) => Promise<void>;
  rollback?: (config: AQEConfig) => Promise<void>;
}

const phases: InitPhase[] = [
  // Phase 1: Detection
  { name: 'detect-project', critical: true },      // Analyze project structure
  { name: 'detect-existing', critical: true },     // Check for v2/v3 installations
  { name: 'detect-enhancements', critical: false }, // Claude-flow, RuVector

  // Phase 2: Core Setup
  { name: 'create-directories', critical: true },
  { name: 'init-database', critical: true },
  { name: 'init-learning-engine', critical: true },
  { name: 'seed-patterns', critical: false },

  // Phase 3: Assets
  { name: 'install-agents', critical: false },
  { name: 'install-skills', critical: false },
  { name: 'install-hooks', critical: false },

  // Phase 4: Integration
  { name: 'setup-claude-flow', critical: false },   // Optional
  { name: 'setup-ruvector', critical: false },      // Optional
  { name: 'generate-config', critical: true },

  // Phase 5: Verification
  { name: 'verify-installation', critical: true },
  { name: 'display-summary', critical: false },
];
```

### 4.3 Configuration Detection Logic

```typescript
async function detectConfiguration(): Promise<AQEConfig> {
  const config: AQEConfig = createDefaultConfig();

  // 1. Detect project type
  const analysis = await analyzeProject(process.cwd());
  config.frameworks = analysis.frameworks;
  config.languages = analysis.languages;

  // 2. Detect existing installation
  if (await exists('.agentic-qe/memory.db')) {
    config.upgradeFrom = 'v2';
  }

  // 3. Detect enhancements
  config.enhancements = {
    claudeFlow: await detectClaudeFlow(),
    ruvector: await detectRuVector(),
  };

  // 4. Configure learning based on available features
  if (config.enhancements.claudeFlow) {
    config.learning = {
      ...config.learning,
      useTrajectories: true,    // SONA trajectories
      useModelRouting: true,    // 3-tier routing
      usePretrain: true,        // Codebase analysis
    };
  }

  return config;
}
```

---

## 5. File Changes Summary

### 5.0 Current Init Structure (Already Modular)

The v3 init system already has good separation:
```
v3/src/init/
├── init-wizard.ts        # 2042 lines ⚠️ TOO LARGE - needs refactoring
├── self-configurator.ts  # 485 lines ✓
├── skills-installer.ts   # 459 lines ✓
├── agents-installer.ts   # ~300 lines ✓
├── n8n-installer.ts      # ~300 lines ✓
├── project-analyzer.ts   # ~400 lines ✓
├── fleet-integration.ts  # ~200 lines ✓
├── token-bootstrap.ts    # 221 lines ✓
├── types.ts              # 472 lines ✓
└── index.ts              # exports
```

### 5.1 Modular Architecture: Extract from init-wizard.ts

**Strategy**: Break `InitOrchestrator` into pipeline phases as separate modules.

```
v3/src/init/
├── orchestrator.ts                  # Thin orchestrator (~200 lines)
├── phases/                          # Pipeline phases
│   ├── index.ts                     # Phase registry
│   ├── phase-interface.ts           # InitPhase interface
│   ├── 01-detection.ts              # Project & v2 detection
│   ├── 02-analysis.ts               # Project analysis (uses project-analyzer)
│   ├── 03-configuration.ts          # Config generation (uses self-configurator)
│   ├── 04-database.ts               # SQLite persistence setup
│   ├── 05-learning.ts               # Learning system init
│   ├── 06-code-intelligence.ts      # KG indexing
│   ├── 07-hooks.ts                  # Claude Code hooks
│   ├── 08-mcp.ts                    # MCP server config
│   ├── 09-assets.ts                 # Skills & agents (uses installers)
│   ├── 10-workers.ts                # Background workers
│   ├── 11-claude-md.ts              # CLAUDE.md generation
│   └── 12-verification.ts           # Final verification
├── enhancements/                    # Optional enhancement adapters
│   ├── index.ts                     # Enhancement registry
│   ├── detector.ts                  # Detect available enhancements
│   ├── claude-flow-adapter.ts       # Claude-flow MCP bridge
│   ├── ruvector-adapter.ts          # RuVector integration
│   └── types.ts                     # Enhancement interfaces
├── migration/                       # v2 to v3 migration
│   ├── index.ts                     # Migration orchestrator
│   ├── detector.ts                  # Detect v2 installation
│   ├── data-migrator.ts             # Migrate patterns/experiences
│   ├── config-migrator.ts           # Migrate config files
│   └── agent-migrator.ts            # Migrate agents
└── [existing files...]              # Keep existing modular files
```

### 5.2 New Files to Create

```
# Phase System (Extract from init-wizard.ts)
v3/src/init/orchestrator.ts                    # Thin phase runner (~200 lines)
v3/src/init/phases/index.ts                    # Phase registry & types
v3/src/init/phases/phase-interface.ts          # InitPhase interface
v3/src/init/phases/01-detection.ts             # ~100 lines
v3/src/init/phases/02-analysis.ts              # ~50 lines (delegates)
v3/src/init/phases/03-configuration.ts         # ~100 lines
v3/src/init/phases/04-database.ts              # ~150 lines
v3/src/init/phases/05-learning.ts              # ~200 lines
v3/src/init/phases/06-code-intelligence.ts     # ~150 lines
v3/src/init/phases/07-hooks.ts                 # ~250 lines
v3/src/init/phases/08-mcp.ts                   # ~100 lines
v3/src/init/phases/09-assets.ts                # ~100 lines (delegates)
v3/src/init/phases/10-workers.ts               # ~150 lines
v3/src/init/phases/11-claude-md.ts             # ~300 lines
v3/src/init/phases/12-verification.ts          # ~100 lines

# Enhancement Adapters (NEW - for optional claude-flow)
v3/src/init/enhancements/index.ts              # Enhancement registry
v3/src/init/enhancements/detector.ts           # Detect claude-flow/ruvector
v3/src/init/enhancements/claude-flow-adapter.ts # Bridge to CF MCP
v3/src/init/enhancements/types.ts              # Enhancement interfaces

# Migration (Extract from init-wizard.ts)
v3/src/init/migration/index.ts                 # Migration orchestrator
v3/src/init/migration/detector.ts              # V2 detection logic
v3/src/init/migration/data-migrator.ts         # Pattern migration
v3/src/init/migration/config-migrator.ts       # Config migration

# Learning Engine (Consolidate from helpers)
v3/src/learning/aqe-learning-engine.ts         # Unified learning engine
v3/src/learning/experience-capture.ts          # Experience recording

# Hooks CLI Commands
v3/src/cli/commands/hooks.ts                   # Hooks subcommands
```

### 5.3 Files to Refactor

```
v3/src/init/init-wizard.ts                     # DEPRECATE - split into phases
v3/src/init/index.ts                           # Update exports
v3/src/learning/index.ts                       # Export unified API
v3/src/learning/qe-reasoning-bank.ts           # Add graceful fallbacks
```

### 5.4 Files to Deprecate (Keep for Backward Compat)

```
.claude/helpers/learning-service.mjs           # Keep - used by helpers
.claude/helpers/learning-hooks.sh              # Keep - CLI integration
.claude/helpers/router.js                      # Keep - simple routing
v3/src/init/init-wizard.ts                     # Keep temporarily during migration
```

### 5.5 Phase Interface Design

```typescript
// v3/src/init/phases/phase-interface.ts
export interface InitPhase {
  name: string;
  description: string;
  order: number;
  critical: boolean;  // If true, failure stops init

  // Dependencies
  requiresPhases?: string[];  // Must complete before this phase
  requiresEnhancements?: string[];  // Optional enhancements used

  // Execution
  shouldRun(context: InitContext): Promise<boolean>;
  execute(context: InitContext): Promise<PhaseResult>;
  rollback?(context: InitContext): Promise<void>;
}

export interface InitContext {
  projectRoot: string;
  options: InitOptions;
  config: Partial<AQEInitConfig>;
  analysis?: ProjectAnalysis;
  enhancements: EnhancementRegistry;
  results: Map<string, PhaseResult>;
}

export interface PhaseResult {
  success: boolean;
  data?: unknown;
  error?: Error;
  durationMs: number;
}
```

### 5.6 Thin Orchestrator Design

```typescript
// v3/src/init/orchestrator.ts (~200 lines)
export class InitOrchestrator {
  private phases: InitPhase[] = [];
  private context: InitContext;

  constructor(options: InitOptions) {
    this.context = this.createContext(options);
    this.registerPhases();
  }

  private registerPhases(): void {
    // Phases auto-registered from phases/ directory
    this.phases = [
      new DetectionPhase(),
      new AnalysisPhase(),
      new ConfigurationPhase(),
      new DatabasePhase(),
      new LearningPhase(),
      new CodeIntelligencePhase(),
      new HooksPhase(),
      new MCPPhase(),
      new AssetsPhase(),
      new WorkersPhase(),
      new ClaudeMDPhase(),
      new VerificationPhase(),
    ].sort((a, b) => a.order - b.order);
  }

  async initialize(): Promise<InitResult> {
    for (const phase of this.phases) {
      if (!(await phase.shouldRun(this.context))) continue;

      const result = await this.runPhase(phase);
      this.context.results.set(phase.name, result);

      if (!result.success && phase.critical) {
        return this.createFailureResult(phase, result);
      }
    }
    return this.createSuccessResult();
  }
}
```

---

## 6. Upgrade Migration Strategy

### 6.1 v2 to v3 Migration

```typescript
async function migrateFromV2(): Promise<MigrationResult> {
  const result: MigrationResult = { success: false, actions: [] };

  // 1. Backup existing data
  await backupDatabase('.agentic-qe/memory.db');
  result.actions.push('backup-database');

  // 2. Detect v2 patterns and experiences
  const v2Data = await extractV2Data();
  result.actions.push(`found-${v2Data.patterns.length}-patterns`);

  // 3. Migrate to v3 schema
  const migrated = await migrateToV3Schema(v2Data);
  result.actions.push('schema-migration');

  // 4. Import into new learning engine
  await importPatterns(migrated.patterns);
  await importExperiences(migrated.experiences);
  result.actions.push('data-import');

  // 5. Update configuration
  await updateConfigToV3();
  result.actions.push('config-update');

  result.success = true;
  return result;
}
```

### 6.2 Claude-Flow Integration Path

```typescript
async function integrateClaudeFlow(): Promise<void> {
  // Check if claude-flow MCP is available
  const claudeFlowAvailable = await checkClaudeFlowMCP();

  if (!claudeFlowAvailable) {
    console.log('Claude-flow not detected. AQE will use standalone learning.');
    return;
  }

  // Register enhanced features
  await registerTrajectoryBridge();   // SONA trajectories
  await registerModelRouter();         // 3-tier model routing
  await registerPretrainPipeline();    // Codebase analysis
  await registerTransferLearning();    // Cross-project patterns

  console.log('Claude-flow integration enabled. Enhanced learning active.');
}
```

---

## 7. Success Criteria

### 7.1 Functional Requirements

| Requirement | Verification |
|-------------|--------------|
| `aqe init` works on fresh project | `aqe init && aqe status` shows healthy |
| `aqe init --upgrade` migrates v2 data | Patterns/experiences preserved |
| Standalone learning works without claude-flow | Pattern storage/retrieval functional |
| Claude-flow enhances when available | SONA trajectories recorded |
| No breaking changes for existing users | v2 commands still work |

### 7.2 Performance Requirements

| Metric | Target |
|--------|--------|
| `aqe init` completion time | < 30 seconds |
| Pattern search latency | < 10ms (HNSW) |
| Embedding generation | < 100ms |
| Memory footprint | < 100MB idle |

### 7.3 Compatibility Matrix

| Scenario | Expected Behavior |
|----------|-------------------|
| Fresh project, no claude-flow | Full AQE features, standalone learning |
| Fresh project, claude-flow present | Full AQE + enhanced trajectories |
| Upgrade from v2, no claude-flow | Migration + standalone learning |
| Upgrade from v2, claude-flow present | Migration + enhanced features |

---

## 8. Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1: Consolidation | 3-4 days | Unified learning engine |
| Phase 2: Adapter Layer | 2-3 days | Enhancement adapters |
| Phase 3: Init Command | 3-4 days | Complete `aqe init` |
| Phase 4: Self-Learning | 2-3 days | Experience capture & promotion |
| Testing & Documentation | 2 days | Integration tests, docs |
| **Total** | **12-16 days** | |

---

## 9. Risk Assessment

| Risk | Mitigation |
|------|------------|
| HNSW binary compatibility | Provide hash-based fallback |
| Claude-flow API changes | Version-pinned adapter layer |
| Data migration errors | Mandatory backup before migration |
| Performance regression | Benchmark suite in CI |

---

## 10. Replanning Triggers

The plan should be revisited if:
1. Claude-flow MCP API changes significantly
2. New major dependency is introduced
3. Performance targets not met in Phase 1
4. User feedback indicates different priorities
5. v2 user base reports migration issues

---

## 11. Appendix: Feature Utilization Analysis

### Current Claude Flow v3 MCP Feature Usage

| Feature | Available | Currently Used | Planned |
|---------|-----------|----------------|---------|
| Hooks (26 total) | ✅ | 8 (31%) | 18+ (70%) |
| Background Workers (12) | ✅ | 0 | 6+ |
| Trajectory Tracking | ✅ | 0 | Full |
| Model Routing (ADR-026) | ✅ | 0 | Full |
| DAA Features (7) | ✅ | 0 | 3 |
| Neural Features (6) | ✅ | 0 | Optional |
| AIDefence (4) | ✅ | 0 | 2 |
| Claims System (11) | ✅ | 0 | 4 |

### Key Integration Points

1. **Trajectory Bridge**: Connect AQE task execution → Claude Flow SONA
2. **Model Router Bridge**: AQE agent spawning → Claude Flow 3-tier routing
3. **Pretrain Bridge**: AQE init → Claude Flow codebase analysis
4. **Worker Bridge**: AQE scheduled tasks → Claude Flow background workers

---

*This plan was generated by the goal-planner agent and should be reviewed before implementation.*
