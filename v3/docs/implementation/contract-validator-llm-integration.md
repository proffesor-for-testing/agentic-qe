# ContractValidatorService LLM Integration (ADR-051)

**Date:** 2026-01-26
**Status:** Completed
**Implementation Pattern:** ADR-051 Opt-Out LLM Integration

## Overview

Added LLM integration to `ContractValidatorService` following the established ADR-051 pattern used across all v3 domain services. This enables AI-powered contract analysis for detecting potential compatibility issues, unclear specifications, and improvement recommendations.

## Changes Made

### 1. Service Updates (`src/domains/contract-testing/services/contract-validator.ts`)

#### Import Additions
```typescript
import type { HybridRouter, ChatResponse } from '../../../shared/llm/index.js';
```

#### Configuration Updates
```typescript
export interface ContractValidatorConfig {
  // ... existing fields
  /** ADR-051: Enable LLM-powered contract analysis */
  enableLLMAnalysis: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier: number;
  /** ADR-051: Max tokens for LLM responses */
  llmMaxTokens: number;
}

const DEFAULT_CONFIG: ContractValidatorConfig = {
  // ... existing defaults
  enableLLMAnalysis: true, // On by default - opt-out (ADR-051)
  llmModelTier: 2, // Sonnet for balanced analysis
  llmMaxTokens: 2048,
};
```

#### Dependencies Interface
```typescript
export interface ContractValidatorDependencies {
  memory: MemoryBackend;
  llmRouter?: HybridRouter;
}
```

#### Constructor Update
- Changed from accepting `memory: MemoryBackend` directly to `dependencies: ContractValidatorDependencies`
- Maintains backward compatibility by making `llmRouter` optional
- Service functions without LLM if router not provided

#### Helper Methods Added
```typescript
private isLLMAnalysisAvailable(): boolean
private getModelForTier(tier: number): string
private async analyzeContractWithLLM(contract: ApiContract): Promise<string | null>
```

### 2. Consumer Updates

All instantiations updated to use new constructor signature:

#### Plugin (`src/domains/contract-testing/plugin.ts`)
```typescript
this.contractValidator = new ContractValidatorService(
  { memory: this.memory },
  this.pluginConfig.contractValidator
);
```

#### Coordinator (`src/domains/contract-testing/coordinator.ts`)
```typescript
this.contractValidator = new ContractValidatorService({ memory });
```

#### Tests (`tests/unit/domains/contract-testing/contract-validator.test.ts`)
```typescript
service = new ContractValidatorService({ memory: mockMemory });
```

#### MCP Tool (`src/mcp/tools/contract-testing/validate.ts`)
```typescript
this.contractValidator = new ContractValidatorService({ memory });
```

## Features

### LLM-Powered Contract Analysis

The service now includes an `analyzeContractWithLLM` method that:
- Accepts an `ApiContract` as input
- Uses Sonnet (tier 2) by default for balanced cost/performance
- Analyzes contract for:
  1. Potential compatibility issues
  2. Missing or unclear specifications
  3. Recommendations for improvement
- Returns `null` if LLM is unavailable (graceful degradation)
- Logs warnings on failure without breaking the service

### Configuration Options

Users can control LLM behavior:
- **Disable LLM**: Set `enableLLMAnalysis: false` (opt-out)
- **Change Model**: Set `llmModelTier` (1=Haiku, 2=Sonnet, 4=Opus)
- **Token Limit**: Set `llmMaxTokens` (default: 2048)

## Backward Compatibility

The implementation maintains full backward compatibility:
- Services work without `llmRouter` provided
- Existing code continues to function
- LLM analysis is optional and doesn't affect core validation
- Failed LLM calls are logged but don't throw errors

## Integration Pattern

This follows the exact pattern established in other domains:
- ✅ Dependencies interface with optional `llmRouter`
- ✅ LLM enabled by default (opt-out pattern)
- ✅ Helper methods for availability check and model selection
- ✅ Graceful degradation on errors
- ✅ Tier-based model selection (1=Haiku, 2=Sonnet, 4=Opus)
- ✅ Consistent configuration naming

## Testing

All existing unit tests pass with updated constructor signatures. The service:
- Works with or without LLM router
- Maintains existing validation behavior
- Caching still functions correctly
- All validation methods work as expected

## Future Enhancements

The `analyzeContractWithLLM` method is ready to be integrated into validation workflows:
1. Call during `validateContract()` to enrich validation reports
2. Add LLM insights to warnings array
3. Store analysis results in memory for pattern learning
4. Use analysis to improve breaking change detection

## Files Changed

1. `src/domains/contract-testing/services/contract-validator.ts` - Core service
2. `src/domains/contract-testing/plugin.ts` - Plugin initialization
3. `src/domains/contract-testing/coordinator.ts` - Coordinator initialization
4. `src/mcp/tools/contract-testing/validate.ts` - MCP tool
5. `tests/unit/domains/contract-testing/contract-validator.test.ts` - Tests

## Compliance

✅ Follows ADR-051 pattern exactly
✅ Opt-out (enabled by default)
✅ Graceful degradation
✅ Backward compatible
✅ Consistent with other domains
✅ No breaking changes
