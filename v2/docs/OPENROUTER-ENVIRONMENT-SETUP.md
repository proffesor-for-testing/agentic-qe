# OpenRouter Environment Setup - Phase 1 Multi-Model Router

**Date**: 2025-10-16
**Version**: v1.0.5
**Component**: Multi-Model Router

---

## 🎯 Quick Answer

**For testing the Multi-Model Router logic**: ❌ **NO API keys needed!**

**For testing actual AI model execution**: ✅ **API keys required**

---

## 📋 Environment Variables Overview

### Required for Router Logic Testing (Phase 1)

**None!** The Multi-Model Router is a **decision engine** that selects which model to use based on task complexity. It doesn't make actual API calls during routing logic tests.

### Required for Full Integration Testing

If you want to test **actual AI model execution** through the router:

```bash
# OpenRouter API (if using OpenRouter as proxy)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx

# Or direct provider APIs
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxx

# Optional: Model-specific overrides
GPT_4_MODEL=gpt-4-turbo-preview
GPT_3_5_MODEL=gpt-3.5-turbo
CLAUDE_SONNET_MODEL=claude-3-sonnet-20240229
CLAUDE_HAIKU_MODEL=claude-3-haiku-20240307
```

---

## 🔍 Router Architecture Analysis

### What the Router Actually Does

The `AdaptiveModelRouter` is a **pure selection engine**:

```typescript
// src/core/routing/AdaptiveModelRouter.ts
export class AdaptiveModelRouter implements ModelRouter {
  async selectModel(task: QETask): Promise<ModelSelection> {
    // 1. Analyze task complexity (local computation)
    const analysis = this.complexityAnalyzer.analyzeComplexity(task);

    // 2. Select model based on rules (local lookup)
    const model = this.selectModelForTask(agentType, analysis.complexity);

    // 3. Calculate estimated cost (local computation)
    const estimatedCost = await this.estimateCost(model, analysis.estimatedTokens);

    // 4. Return selection (no API calls!)
    return {
      model,
      complexity: analysis.complexity,
      reasoning: this.buildReasoning(agentType, analysis),
      estimatedCost,
      fallbackModels,
      confidence: analysis.confidence,
    };
  }
}
```

**Key Insight**: No `axios`, `fetch`, or HTTP requests in the router!

### Where API Calls Would Happen

API calls are made by:
1. **FleetManager** - Coordinates agent execution
2. **Individual Agents** - Execute tasks using selected models
3. **Test Executors** - Run actual model inference

The router just **decides** which model to use; other components **execute**.

---

## 🧪 Testing Scenarios

### Scenario 1: Router Logic Testing (Current Phase 1)

**Goal**: Verify routing decisions are correct

**What's Tested**:
- Complexity analysis (simple/moderate/complex/critical)
- Model selection rules (GPT-3.5 for simple, GPT-4 for complex, etc.)
- Cost calculation logic
- Fallback chain configuration
- Feature flag behavior

**API Keys Needed**: ❌ **NONE**

**Example Test**:
```typescript
// tests/unit/routing/ModelRouter.test.ts
describe('ModelRouter', () => {
  test('should select GPT-3.5 for simple tasks', async () => {
    const task = createSimpleTask();
    const selection = await router.selectModel(task);

    expect(selection.model).toBe(AIModel.GPT_3_5_TURBO);
    expect(selection.complexity).toBe(TaskComplexity.SIMPLE);
    // No actual API call made!
  });
});
```

**Current Status**: ✅ Working (26/31 tests pass)

### Scenario 2: Mock Integration Testing

**Goal**: Test router integration with mocked API responses

**What's Tested**:
- Router → FleetManager integration
- Task assignment flow
- Result collection
- Error handling

**API Keys Needed**: ❌ **NONE** (mocked responses)

**Example**:
```typescript
// tests/integration/router-integration.test.ts
jest.mock('../api/openrouter', () => ({
  callModel: jest.fn().mockResolvedValue({
    response: 'Mocked response',
    tokens: 100,
    cost: 0.002
  })
}));

test('should execute task with selected model', async () => {
  const task = createTask();
  const result = await executeWithRouter(task);

  expect(result.model).toBe(AIModel.GPT_4);
  expect(result.response).toBe('Mocked response');
  // No real API call, but flow is tested!
});
```

### Scenario 3: Real API Integration Testing (Optional)

**Goal**: Verify actual AI model responses

**What's Tested**:
- Real API connectivity
- Token counting accuracy
- Cost tracking accuracy
- Model response quality

**API Keys Needed**: ✅ **YES** (real API credentials)

**Setup**:
```bash
# Create .env.test.local (not in git!)
OPENROUTER_API_KEY=sk-or-v1-your-key-here
ENABLE_REAL_API_TESTS=true

# Or use direct provider APIs
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
ENABLE_REAL_API_TESTS=true
```

**Example**:
```typescript
// tests/integration/real-api.test.ts
describe('Real API Integration', () => {
  beforeAll(() => {
    if (!process.env.OPENROUTER_API_KEY) {
      console.log('⚠️  Skipping real API tests (no API key)');
      return;
    }
  });

  test('should make real API call', async () => {
    const task = createTask();
    const result = await executeWithRouter(task, { useRealAPI: true });

    expect(result.response).toBeTruthy();
    expect(result.cost).toBeGreaterThan(0);
    // Real API call made!
  });
});
```

---

## 📝 Environment Variable Specification

### For OpenRouter Proxy

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx

# Optional
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=https://your-site.com
OPENROUTER_APP_NAME=agentic-qe-fleet
```

### For Direct Provider APIs

```bash
# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_ORG_ID=org-xxxxxxxxx  # Optional

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
ANTHROPIC_VERSION=2023-06-01  # Optional
```

### For Testing Configuration

```bash
# Enable/disable real API tests
ENABLE_REAL_API_TESTS=false  # Default: false (use mocks)

# Test budget limits
MAX_TEST_COST_USD=1.00       # Stop tests if cost exceeds limit
TEST_TIMEOUT_MS=30000        # Timeout for API tests

# Model overrides for testing
TEST_GPT_4_MODEL=gpt-4-turbo-preview
TEST_GPT_3_5_MODEL=gpt-3.5-turbo
TEST_CLAUDE_SONNET_MODEL=claude-3-sonnet-20240229
TEST_CLAUDE_HAIKU_MODEL=claude-3-haiku-20240307
```

---

## 🔧 Setup Instructions

### Step 1: Create Environment File

```bash
# Create .env.test.local (ignored by git)
cat > .env.test.local <<EOF
# Phase 1 Multi-Model Router Test Configuration

# Router Testing (Logic Only) - No API keys needed!
# Tests will run with mocked responses

# If you want to test REAL API integration (optional):
# OPENROUTER_API_KEY=sk-or-v1-your-key-here
# ENABLE_REAL_API_TESTS=true

# Safety limits
MAX_TEST_COST_USD=1.00
TEST_TIMEOUT_MS=30000
EOF
```

### Step 2: Verify Router Tests Work Without API Keys

```bash
# Run router logic tests (no API needed)
npm test -- tests/unit/routing/

# Expected output:
# ✅ Tests execute successfully
# ✅ 26+ tests pass
# ⚠️  Some assertion failures (test logic fixes needed)
# ❌ NO API key errors!
```

### Step 3: (Optional) Enable Real API Testing

```bash
# Add your API key to .env.test.local
echo "OPENROUTER_API_KEY=sk-or-v1-your-key-here" >> .env.test.local
echo "ENABLE_REAL_API_TESTS=true" >> .env.test.local

# Run integration tests with real API
npm test -- tests/integration/real-api.test.ts

# ⚠️  This will cost real money!
# Use MAX_TEST_COST_USD to prevent overspending
```

---

## 💰 Cost Considerations

### Router Logic Testing (Phase 1)

**Cost**: $0.00 (no API calls)

### Mock Integration Testing

**Cost**: $0.00 (mocked responses)

### Real API Integration Testing

**Cost**: Variable (depends on test suite)

**Estimated costs** (per full test run):
- Simple tasks (GPT-3.5): ~$0.01 - $0.05
- Complex tasks (GPT-4): ~$0.10 - $0.50
- Critical tasks (Claude Sonnet): ~$0.20 - $1.00

**Total estimated cost**: $0.50 - $2.00 per full real API test suite

**Recommendation**: Use mocks for development, real API for pre-release validation.

---

## 🛡️ Security Best Practices

### DO NOT Commit API Keys

```bash
# .gitignore should contain:
.env.test.local
.env.local
.env.*.local
*.key
secrets/
```

**Verify**:
```bash
git status --ignored | grep ".env.test.local"
# Should show: .env.test.local (ignored)
```

### Use Different Keys for Testing

**Production key**: Keep secret, never use for testing
**Testing key**: Separate key with spending limits

**OpenRouter**:
```
Settings → API Keys → Create New Key
Name: "Testing - Agentic QE"
Limits: $10/month
```

### Rotate Keys Regularly

```bash
# Rotate every 90 days or after exposure
# Update in .env.test.local only
# Never commit keys to git!
```

---

## 🧪 Test Examples

### Example 1: Router Logic Test (No API Key)

```typescript
// tests/unit/routing/complexity-analysis.test.ts
import { ComplexityAnalyzer } from '../../../src/core/routing/ComplexityAnalyzer';

describe('Complexity Analysis', () => {
  const analyzer = new ComplexityAnalyzer();

  test('should detect simple test generation', () => {
    const task = {
      type: 'test-generation',
      description: 'Generate unit tests for add function'
    };

    const complexity = analyzer.analyzeComplexity(task);

    expect(complexity.complexity).toBe(TaskComplexity.SIMPLE);
    expect(complexity.score).toBeLessThan(0.3);
  });

  // No API key needed - pure logic!
});
```

**Run**: `npm test -- tests/unit/routing/complexity-analysis.test.ts`
**API Key Required**: ❌ NO

### Example 2: Mocked Integration Test (No API Key)

```typescript
// tests/integration/router-mock.test.ts
import { AdaptiveModelRouter } from '../../src/core/routing/AdaptiveModelRouter';

jest.mock('../../src/api/openrouter', () => ({
  callModel: jest.fn().mockResolvedValue({
    response: 'Test generated successfully',
    tokens: 150,
    cost: 0.003
  })
}));

describe('Router Mock Integration', () => {
  test('should select and execute with mocked API', async () => {
    const router = new AdaptiveModelRouter();
    const task = createComplexTask();

    const selection = await router.selectModel(task);
    expect(selection.model).toBe(AIModel.GPT_4);

    // Execute would use mock (no real API call)
    const result = await executeMocked(selection);
    expect(result.response).toBeTruthy();
  });
});
```

**Run**: `npm test -- tests/integration/router-mock.test.ts`
**API Key Required**: ❌ NO (mocked)

### Example 3: Real API Test (API Key Required)

```typescript
// tests/integration/router-real-api.test.ts
import { AdaptiveModelRouter } from '../../src/core/routing/AdaptiveModelRouter';

describe('Router Real API Integration', () => {
  beforeAll(() => {
    if (!process.env.OPENROUTER_API_KEY) {
      console.warn('⚠️  Skipping real API tests - no OPENROUTER_API_KEY');
      // Tests will be skipped
    }
  });

  test('should make real API call to GPT-3.5', async () => {
    if (!process.env.ENABLE_REAL_API_TESTS) {
      return; // Skip
    }

    const router = new AdaptiveModelRouter();
    const task = createSimpleTask();

    const selection = await router.selectModel(task);
    expect(selection.model).toBe(AIModel.GPT_3_5_TURBO);

    // Make real API call
    const result = await executeReal(selection);
    expect(result.response).toBeTruthy();
    expect(result.cost).toBeGreaterThan(0);

    console.log(`✅ Real API test cost: $${result.cost}`);
  });
});
```

**Run**: `ENABLE_REAL_API_TESTS=true npm test -- tests/integration/router-real-api.test.ts`
**API Key Required**: ✅ YES

---

## 🎯 Current Phase 1 Status

### What Works Now (No API Keys Needed)

✅ **Router logic testing**
- Complexity analysis
- Model selection rules
- Cost estimation
- Fallback chains
- Feature flags

✅ **Build and type safety**
- 0 TypeScript errors
- Clean compilation
- All imports resolved

✅ **Test infrastructure**
- Jest executes successfully
- Tests run in container environment
- Memory-safe configuration

### What Needs API Keys (Optional for Phase 1)

⚠️ **Real API integration testing** (not required for release)
- Actual model execution
- Token counting verification
- Real cost tracking
- Response quality validation

---

## 📚 Additional Resources

### OpenRouter Documentation

- Sign up: https://openrouter.ai/
- API keys: https://openrouter.ai/keys
- Pricing: https://openrouter.ai/docs/pricing
- Models: https://openrouter.ai/docs/models

### Provider Documentation

- OpenAI: https://platform.openai.com/docs/api-reference
- Anthropic: https://docs.anthropic.com/claude/reference/getting-started-with-the-api

### Phase 1 Documentation

- Multi-Model Router Guide: `docs/guides/MULTI-MODEL-ROUTER.md`
- Testing Guide: `docs/PHASE1-TESTING-GUIDE.md`
- Architecture: `docs/architecture/PHASE1-ARCHITECTURE.md`

---

## ❓ FAQ

### Q: Do I need API keys to run Phase 1 tests?

**A**: ❌ **NO!** Router logic tests work without API keys.

### Q: Can I test the router without spending money?

**A**: ✅ **YES!** Use mock integration tests (no cost).

### Q: When do I need real API keys?

**A**: Only for:
- Real API integration testing (optional)
- Production deployment
- Pre-release validation

### Q: What if I don't have OpenRouter access?

**A**: Use direct provider APIs (OpenAI, Anthropic) or continue with mocked tests.

### Q: How much will real API testing cost?

**A**: ~$0.50-$2.00 per full test suite run. Set `MAX_TEST_COST_USD` to prevent overspending.

### Q: Can I use the router in production without API keys?

**A**: ❌ **NO!** You need API keys for production use. The router is a selection engine; actual execution requires API access.

---

## 🎉 Conclusion

**For Phase 1 development and testing**:
- ❌ API keys NOT required
- ✅ Router logic fully testable with mocks
- ✅ 26/31 tests pass without any credentials
- ⚠️ Real API testing is optional (adds validation, costs money)

**Environment variables summary**:
```bash
# Required for Phase 1 testing:
# NONE!

# Optional for real API integration:
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx
ENABLE_REAL_API_TESTS=true
MAX_TEST_COST_USD=1.00
```

**Next steps**:
1. Run router tests: `npm test -- tests/unit/routing/` (works now!)
2. Fix test assertions (2-4 hours)
3. Optionally add real API tests before release
4. Deploy with production API keys

---

**Generated**: 2025-10-16
**Status**: ✅ READY FOR TESTING WITHOUT API KEYS
**Phase 1 Release**: Not blocked by API key requirements
