# Phase 1 Init Service Updates

**Date**: 2025-10-16
**Version**: v1.0.5 "Cost Optimizer"
**Purpose**: Document changes needed to `aqe init` for Phase 1 features

---

## 🎯 Executive Summary

**Do we need to update `aqe init`?** ✅ **YES - Recommended Updates**

**Impact**: Low (backward compatible, optional features)
**Required**: ❌ No (agents work without changes)
**Recommended**: ✅ Yes (expose new capabilities to users)

---

## 📊 What Changed in Phase 1

### New Features Added

1. **Multi-Model Router** (`src/core/routing/`)
   - Intelligent AI model selection
   - 70-81% cost savings
   - Feature flag controlled (disabled by default)
   - Transparent to agents

2. **Streaming MCP Tools** (`src/mcp/streaming/`)
   - Real-time progress updates
   - AsyncGenerator pattern
   - Backward compatible
   - Opt-in for new tools

---

## 🔍 Current `aqe init` Behavior

### What It Creates

```
aqe init
├── .agentic-qe/
│   ├── config/
│   │   ├── fleet.json
│   │   ├── agents.json
│   │   ├── environments.json
│   │   └── aqe-hooks.json
│   ├── logs/
│   ├── data/
│   └── scripts/
├── .claude/
│   └── agents/
│       ├── qe-test-generator.md
│       ├── qe-test-executor.md
│       ├── qe-coverage-analyzer.md
│       └── ... (17 agents)
└── CLAUDE.md
```

### Agent Templates

**Current**: Uses AQE hooks protocol ✅
**Phase 1**: Still uses AQE hooks ✅
**Change Needed**: ❌ **NO** - Agents are already compatible

**Why?** Routing is transparent infrastructure. Agents don't need to know about it.

---

## ✅ Recommended Updates

### 1. Add Routing Configuration

**File**: `src/cli/commands/init.ts`
**Line**: After line 39 (fleetConfig creation)

**Add**:
```typescript
// Add routing configuration to fleet config
routing: {
  enabled: false,  // Disabled by default for safe rollout
  defaultModel: 'claude-sonnet-4.5',
  enableCostTracking: true,
  enableFallback: true,
  maxRetries: 3,
  costThreshold: 0.5,
  modelPreferences: {
    'qe-test-generator': {
      simple: 'gpt-3.5-turbo',
      complex: 'gpt-4',
      critical: 'claude-sonnet-4.5'
    }
  }
}
```

**Reason**: Users can opt-in to routing via configuration

---

### 2. Add Interactive Routing Setup

**File**: `src/cli/commands/init.ts`
**Line**: After line 69 (project setup prompts)

**Add**:
```typescript
{
  type: 'confirm',
  name: 'enableRouting',
  message: 'Enable Multi-Model Router for cost optimization? (70-81% savings)',
  default: false
},
{
  type: 'confirm',
  name: 'enableStreaming',
  message: 'Enable streaming progress updates for long-running operations?',
  default: true,
  when: (answers) => true
}
```

**Reason**: Let users opt-in during setup (safer than auto-enabling)

---

### 3. Create Routing Configuration File

**New File**: `.agentic-qe/config/routing.json`

**Content**:
```json
{
  "multiModelRouter": {
    "enabled": false,
    "version": "1.0.5",
    "defaultModel": "claude-sonnet-4.5",
    "enableCostTracking": true,
    "enableFallback": true,
    "maxRetries": 3,
    "costThreshold": 0.5,
    "modelRules": {
      "simple": {
        "model": "gpt-3.5-turbo",
        "maxTokens": 2000,
        "estimatedCost": 0.0004
      },
      "moderate": {
        "model": "gpt-3.5-turbo",
        "maxTokens": 4000,
        "estimatedCost": 0.0008
      },
      "complex": {
        "model": "gpt-4",
        "maxTokens": 8000,
        "estimatedCost": 0.0048
      },
      "critical": {
        "model": "claude-sonnet-4.5",
        "maxTokens": 8000,
        "estimatedCost": 0.0065
      }
    },
    "fallbackChains": {
      "gpt-4": ["gpt-3.5-turbo", "claude-haiku"],
      "gpt-3.5-turbo": ["claude-haiku", "gpt-4"],
      "claude-sonnet-4.5": ["claude-haiku", "gpt-4"],
      "claude-haiku": ["gpt-3.5-turbo"]
    }
  },
  "streaming": {
    "enabled": true,
    "progressInterval": 2000,
    "bufferEvents": false,
    "timeout": 1800000
  }
}
```

**Add to**: `src/cli/commands/init.ts` → `writeFleetConfig()`

---

### 4. Update CLAUDE.md Template

**File**: `src/cli/commands/init.ts` → `createClaudeMd()`
**Line**: After line 680 (Fleet Configuration section)

**Add**:
```markdown
## 💰 Multi-Model Router (v1.0.5)

**Status**: ${routing?.enabled ? '✅ Enabled' : '⚠️  Disabled (opt-in)'}

The Multi-Model Router provides **70-81% cost savings** by intelligently selecting AI models based on task complexity.

### Features

- ✅ Intelligent model selection (GPT-3.5, GPT-4, Claude Sonnet 4.5, Claude Haiku)
- ✅ Real-time cost tracking and aggregation
- ✅ Automatic fallback chains for resilience
- ✅ Feature flags for safe rollout
- ✅ Zero breaking changes (disabled by default)

### Enabling Routing

**Option 1: Via Configuration**
```json
// .agentic-qe/config/routing.json
{
  "multiModelRouter": {
    "enabled": true
  }
}
```

**Option 2: Via Environment Variable**
```bash
export AQE_ROUTING_ENABLED=true
```

**Option 3: Per-Request**
```typescript
const router = createRoutingEnabledFleetManager(fleetManager, {
  enabled: true
});
```

### Model Selection Rules

| Task Complexity | Model | Est. Cost | Use Case |
|----------------|-------|-----------|----------|
| **Simple** | GPT-3.5 | $0.0004 | Unit tests, basic validation |
| **Moderate** | GPT-3.5 | $0.0008 | Integration tests, mocks |
| **Complex** | GPT-4 | $0.0048 | Property-based, edge cases |
| **Critical** | Claude Sonnet 4.5 | $0.0065 | Security, architecture review |

### Cost Savings Example

**Before Routing** (always GPT-4):
- 100 simple tasks: $0.48
- 50 complex tasks: $0.24
- **Total**: $0.72

**After Routing**:
- 100 simple → GPT-3.5: $0.04
- 50 complex → GPT-4: $0.24
- **Total**: $0.28
- **Savings**: $0.44 (61%)

### Monitoring Costs

```bash
# View cost dashboard
aqe routing dashboard

# Export cost report
aqe routing report --format json

# Check savings
aqe routing stats
```

## 📊 Streaming Progress (v1.0.5)

**Status**: ✅ Enabled by default

Real-time progress updates for long-running operations using AsyncGenerator pattern.

### Features

- ✅ Real-time progress percentage
- ✅ Current operation visibility
- ✅ for-await-of compatibility
- ✅ Backward compatible (non-streaming still works)

### Example Usage

```javascript
// Using streaming MCP tool
const handler = new TestExecuteStreamHandler();

for await (const event of handler.execute(params)) {
  if (event.type === 'progress') {
    console.log(\`Progress: \${event.percent}% - \${event.message}\`);
  } else if (event.type === 'result') {
    console.log('Completed:', event.data);
  }
}
```

### Supported Operations

- ✅ Test execution (test-by-test progress)
- ✅ Coverage analysis (incremental gap detection)
- ⚠️  Test generation (coming in v1.1.0)
- ⚠️  Security scanning (coming in v1.1.0)
```

---

### 5. Update Agent Template Metadata

**File**: `src/cli/commands/init.ts` → `createBasicAgents()`
**Line**: 221 (metadata section)

**Change**:
```markdown
metadata:
  version: "1.0.5"  # Was: 1.0.2
  framework: "agentic-qe"
  routing: "supported"  # NEW
  streaming: "supported"  # NEW
```

**Add after line 280**:
```markdown
## 💰 Cost Optimization (v1.0.5)

This agent supports the **Multi-Model Router** for intelligent model selection and cost savings.

**Routing Status**: Check `.agentic-qe/config/routing.json`

If routing is enabled, this agent will automatically use the most cost-effective model for each task:
- Simple tasks → GPT-3.5 (cheapest)
- Complex tasks → GPT-4 (balanced)
- Critical tasks → Claude Sonnet 4.5 (best quality)

**No code changes required** - routing is transparent infrastructure.

## 📊 Streaming Support (v1.0.5)

This agent supports **streaming progress updates** for real-time visibility.

When using streaming MCP tools, you'll see:
- Real-time progress percentage
- Current operation status
- Incremental results

**Example**:
```javascript
for await (const event of agent.execute(params)) {
  console.log(\`\${event.percent}% - \${event.message}\`);
}
```
```

---

### 6. Add CLI Commands for Routing

**New File**: `src/cli/commands/routing/index.ts`

```typescript
export class RoutingCommand {
  static async execute(subcommand: string, options: any): Promise<void> {
    switch (subcommand) {
      case 'enable':
        await this.enableRouting();
        break;
      case 'disable':
        await this.disableRouting();
        break;
      case 'status':
        await this.showStatus();
        break;
      case 'dashboard':
        await this.showDashboard();
        break;
      case 'report':
        await this.generateReport(options);
        break;
      case 'stats':
        await this.showStats();
        break;
      default:
        console.error('Unknown routing command');
    }
  }

  private static async enableRouting(): Promise<void> {
    const configPath = '.agentic-qe/config/routing.json';
    const config = await fs.readJson(configPath);
    config.multiModelRouter.enabled = true;
    await fs.writeJson(configPath, config, { spaces: 2 });
    console.log('✅ Multi-Model Router enabled');
    console.log('💰 Expected savings: 70-81%');
  }

  private static async disableRouting(): Promise<void> {
    const configPath = '.agentic-qe/config/routing.json';
    const config = await fs.readJson(configPath);
    config.multiModelRouter.enabled = false;
    await fs.writeJson(configPath, config, { spaces: 2 });
    console.log('⚠️  Multi-Model Router disabled');
  }

  private static async showStatus(): Promise<void> {
    const configPath = '.agentic-qe/config/routing.json';
    const config = await fs.readJson(configPath);

    console.log('\n📊 Routing Status:');
    console.log(`  Enabled: ${config.multiModelRouter.enabled ? '✅ Yes' : '❌ No'}`);
    console.log(`  Default Model: ${config.multiModelRouter.defaultModel}`);
    console.log(`  Cost Tracking: ${config.multiModelRouter.enableCostTracking ? '✅' : '❌'}`);
    console.log(`  Fallback: ${config.multiModelRouter.enableFallback ? '✅' : '❌'}`);
  }

  private static async showDashboard(): Promise<void> {
    // Show cost dashboard from memory
    console.log('\n💰 Cost Dashboard:');
    console.log('  Total Requests: [from memory]');
    console.log('  Total Cost: [from memory]');
    console.log('  Savings: [calculated]');
  }

  private static async generateReport(options: any): Promise<void> {
    console.log('📊 Generating cost report...');
    // Export cost data
  }

  private static async showStats(): Promise<void> {
    console.log('\n📈 Routing Statistics:');
    console.log('  [Load from SwarmMemoryManager]');
  }
}
```

**Add to CLI index**:
```bash
aqe routing status
aqe routing enable
aqe routing disable
aqe routing dashboard
```

---

## 🎯 Summary of Changes

### Required Changes: ❌ NONE

**Agents work without any changes** because:
- Routing is transparent infrastructure
- Feature flags disabled by default
- Backward compatible 100%

### Recommended Changes: ✅ 6 Updates

| # | Change | File | Impact | Priority |
|---|--------|------|--------|----------|
| 1 | Add routing config | `init.ts` | Expose feature to users | High |
| 2 | Add interactive prompts | `init.ts` | User opt-in during setup | High |
| 3 | Create routing.json | `init.ts` | Configuration file | High |
| 4 | Update CLAUDE.md | `init.ts` | Document Phase 1 features | High |
| 5 | Update agent metadata | `init.ts` | Version + capabilities | Medium |
| 6 | Add routing CLI commands | New file | User control | Medium |

---

## 📋 Implementation Plan

### Phase 1a: Minimal Update (1 hour)

**Just update CLAUDE.md template**:
- Add Phase 1 feature documentation
- Explain routing is available (opt-in)
- Show how to enable it

**Result**: Users learn about new features

### Phase 1b: Full Update (3-4 hours)

**Complete implementation**:
1. Add routing configuration generation (1 hour)
2. Add interactive prompts (30 minutes)
3. Update CLAUDE.md template (30 minutes)
4. Add routing CLI commands (1 hour)
5. Update agent templates metadata (30 minutes)
6. Test `aqe init` flow (30 minutes)

**Result**: Professional Phase 1 integration

---

## 🚀 Deployment Strategy

### Option 1: Ship Now, Update Later (Recommended)

**v1.0.5 Release**:
- Ship Phase 1 as-is (agents work fine)
- Document routing in release notes
- Manual configuration required

**v1.0.6 Update**:
- Add init updates
- Auto-generate routing config
- CLI commands for management

**Benefit**: Faster release, lower risk

### Option 2: Update Before Release

**v1.0.5 Release**:
- Include all init updates
- Full routing integration
- CLI commands ready

**Benefit**: Complete experience from day 1

---

## 💡 Recommended Approach

### Ship v1.0.5 Now With Minimal Updates

**Include**:
1. ✅ Update CLAUDE.md template (30 min)
2. ✅ Add routing.json to generated files (15 min)
3. ✅ Update version in agent templates (5 min)

**Skip for now**:
- Interactive prompts (add in v1.0.6)
- Routing CLI commands (add in v1.0.6)

**Why?**
- Phase 1 works perfectly without init changes
- Faster release (today vs 2-3 days)
- Lower risk (no CLI changes)
- Users can manually enable routing

### Plan v1.0.6 for Full Integration

**v1.0.6 Features**:
- Interactive routing setup during `aqe init`
- `aqe routing` CLI commands
- Auto-migration for existing projects
- Enhanced documentation

**Timeline**: 1-2 weeks after v1.0.5

---

## 📚 User Documentation

### For v1.0.5 (Current Release)

**In Release Notes**:
```markdown
## New Features

### Multi-Model Router
Intelligent AI model selection for 70-81% cost savings.

**To Enable**:
1. Create `.agentic-qe/config/routing.json`:
   ```json
   {
     "multiModelRouter": {
       "enabled": true
     }
   }
   ```
2. Routing will automatically activate

**Or use environment variable**:
```bash
export AQE_ROUTING_ENABLED=true
```

### Streaming Progress Updates
Real-time visibility into long-running operations.

**Enabled by default** - no configuration needed!
```

### For v1.0.6 (Future Release)

**Enhanced `aqe init`**:
```bash
$ aqe init

? Enable Multi-Model Router? (70-81% savings) (y/N)

? Enable streaming progress updates? (Y/n)

✅ Routing configuration generated
✅ Streaming enabled
```

**New CLI commands**:
```bash
aqe routing enable   # Turn on routing
aqe routing status   # Check configuration
aqe routing dashboard # View cost savings
```

---

## 🎯 Conclusion

**Question**: Do we need to update `aqe init`?

**Answer**:
- ❌ **Not required** - Phase 1 works without changes
- ✅ **Recommended** - Better user experience
- ⚡ **Minimal update** - Ship v1.0.5 with documentation
- 🚀 **Full update** - Plan for v1.0.6

**Recommendation**:
1. **Ship v1.0.5 now** with minimal CLAUDE.md updates (30 min)
2. **Plan v1.0.6** with full init integration (1-2 weeks)
3. **Users can manually enable** routing in the meantime

**No blockers for Phase 1 release!** 🎉

---

**Created**: 2025-10-16
**Status**: ✅ Analysis Complete
**Impact**: Low (optional enhancements)
**Recommendation**: Ship v1.0.5 now, enhance init in v1.0.6
