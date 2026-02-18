# KG-Assisted Test Generation Benchmark

## Problem

Issue #266 revealed that QE agents completely bypassed the Knowledge Graph (KG) during test generation. When `aqe code index .` indexed 5,073 vectors into the KG, test generation produced identical output as without KG. The root cause: `TestGeneratorService.generateTestsForFile()` read source files via `fs.readFileSync()` and built `TestGenerationContext` with no KG context.

## Solution

Wired KG dependency and semantic context into the test generation pipeline:

1. **KG query integration** — `TestGeneratorService` now queries KG for dependency graph (imports, importedBy, callers, callees) and similar code snippets before generating tests
2. **Mock generation from KG** — All three generators (pytest, jest/vitest, mocha) emit framework-appropriate mock declarations from KG-discovered dependencies:
   - **pytest**: `@patch('module.path')` decorators on test methods + `from unittest.mock import patch, MagicMock`
   - **jest/vitest**: `vi.mock('dep')` / `jest.mock('dep')` declarations
   - **mocha**: `sinon.stub()` setup/teardown in `beforeEach`/`afterEach`
3. **Consumer-aware tests** — When KG reveals modules that import the file under test, generators emit API surface stability tests
4. **CLI output** — `aqe test generate` now outputs the generated test code, not just metadata

## Benchmark Configuration

| Parameter | Value |
|-----------|-------|
| Test subject | github.com/maxritter/claude-pilot (202 files) |
| KG vectors | 5,073 (768-dim MiniLM embeddings) |
| KG nodes | 915 |
| KG edges | 1,156 |
| Benchmark files | 3 (1 complex, 2 medium) |
| Framework | pytest |
| Platform | Linux aarch64, Node.js v24.13.0 |

## Results

### Per-File Comparison

| File | Complexity | Lines | Ctrl Assertions | KG Assertions | KG Mocks | File Reads Avoided |
|------|-----------|-------|----------------|--------------|----------|-------------------|
| dependencies.py | complex | 714 | 1 | 1 | 1 | 0 |
| ui.py | medium | 374 | 3 | 3 | 6 | 5 |
| tdd_enforcer.py | medium | 365 | 5 | 12 | 1 | 0 |

### Aggregate Results

| Metric | Control (no KG) | Treatment (KG) | Delta |
|--------|----------------|----------------|-------|
| Tests generated | 3 | 3 | 0 |
| Total assertions | 9 | 16 | **+7 (+78%)** |
| Avg coverage estimate | 8.1% | 11.0% | **+2.9%** |
| KG mocks generated | 0 | 8 | **+8** |
| File reads avoided | 0 | 5 | **+5** |
| Wall time (generation) | 2.0s | 2.7s | +0.7s |

### Token Efficiency (estimated ~4 chars/token)

| Metric | Control | KG | Delta |
|--------|---------|-----|-------|
| Prompt tokens | 12,223 | 12,273 | +50 (negligible) |
| Output tokens | 2,135 | 2,541 | +406 |
| Total tokens | 14,358 | 14,814 | +456 (+3.2%) |

### Initialization Overhead

| Phase | Control | KG |
|-------|---------|-----|
| Init | 0.9s | 4.2s |
| Code indexing | — | 1.5s |
| Total setup | 0.9s | 5.7s |
| KG DB size | 536KB | 22,556KB |

## Key Findings

1. **KG improves assertion quality** — +78% more assertions at +3.2% token cost. The KG dependency context enables richer test generation (dependency interaction tests, API surface tests, mock-based isolation tests).

2. **File reads avoided** — 5 file reads avoided via KG-discovered dependency mocks. Each mock declaration from KG means the agent doesn't need to read that dependency file to understand what to mock.

3. **Medium-complexity files benefit most** — `ui.py` (374 lines, 6 imports) gained 6 KG mocks and 5 file reads avoided. Complex files with many internal helpers show less benefit since KG primarily helps with cross-module dependencies.

4. **Token cost is negligible** — KG adds ~50 prompt tokens (dependency context injection) and ~406 output tokens (the mock declarations themselves). This is a 3.2% increase for 78% more assertions.

5. **Latency is acceptable** — Test generation overhead is +0.7s total (+35%), well within the 50% threshold. The one-time KG indexing cost (1.5s) amortizes across all subsequent generations.

## Files Changed

| File | Change |
|------|--------|
| `v3/src/domains/test-generation/services/test-generator.ts` | KG query integration: `queryKGDependencies()`, `queryKGSimilarCode()`, `hasKGVectors()` |
| `v3/src/domains/test-generation/generators/pytest-generator.ts` | `@patch()` decorators from KG deps on test methods |
| `v3/src/domains/test-generation/generators/jest-vitest-generator.ts` | `vi.mock()`/`jest.mock()` in both `generateTests()` and `generateStubTests()` |
| `v3/src/domains/test-generation/generators/mocha-generator.ts` | `sinon.stub()` setup/teardown from KG deps in both code paths |
| `v3/src/domains/test-generation/interfaces/test-generator.interface.ts` | `KGDependencyContext`, `KGSimilarCodeContext` types |
| `v3/src/cli/commands/test.ts` | Output generated test code in CLI |
| `scripts/benchmark-kg-assisted.ts` | Token counting, file-reads-avoided metrics |

## Reproducing

```bash
npm run build
npx tsx scripts/benchmark-kg-assisted.ts --files 3
# Or with existing clone:
npx tsx scripts/benchmark-kg-assisted.ts --files 3 --skip-clone
```
