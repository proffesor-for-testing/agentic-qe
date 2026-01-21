# SPEC-051-A: Agent Booster API Technical Specification

## Overview

This specification documents the Agent Booster API from the `agentic-flow` repository for integration with AQE v3. Agent Booster provides ultra-fast code transformations using a local WASM engine, achieving 352x speedup over cloud APIs at $0 cost.

**Source Repository**: `/tmp/agentic-flow/agentic-flow`

**Key Files**:
- `/tmp/agentic-flow/agentic-flow/src/intelligence/agent-booster-enhanced.ts` - Enhanced Agent Booster v2 with RuVector
- `/tmp/agentic-flow/agentic-flow/src/mcp/tools/agent-booster-tools.ts` - MCP tool definitions
- `/tmp/agentic-flow/agentic-flow/src/optimizations/agent-booster-migration.ts` - Migration utilities

---

## 1. Core Interfaces

### 1.1 EnhancedEditRequest

Input request for code transformation operations.

```typescript
interface EnhancedEditRequest {
  code: string;       // Original source code to transform
  edit: string;       // Target transformed code or transformation instruction
  language: string;   // Programming language (e.g., 'typescript', 'javascript', 'python')
  filePath?: string;  // Optional file path for co-edit tracking
  context?: string;   // Optional additional context
}
```

### 1.2 EnhancedEditResult

Result of a code transformation operation.

```typescript
interface EnhancedEditResult {
  output: string;           // Transformed code
  success: boolean;         // Whether transformation succeeded
  latency: number;          // Execution time in milliseconds
  confidence: number;       // Confidence score (0.0 - 1.0)
  strategy: EditStrategy;   // Strategy used for transformation
  cacheHit: boolean;        // Whether result came from cache
  learned: boolean;         // Whether pattern was learned from this edit
  patternId?: string;       // Pattern identifier if matched
  similarPatterns?: number; // Count of similar patterns found
  fuzzyScore?: number;      // Fuzzy match score (0.0 - 1.0) if fuzzy matched
}

type EditStrategy =
  | 'exact_cache'     // Exact pattern match from cache (0ms)
  | 'fuzzy_match'     // Semantic fuzzy match (1-5ms)
  | 'gnn_match'       // GNN differentiable search
  | 'agent_booster'   // Agent Booster WASM engine
  | 'fallback'        // Traditional method
  | 'error_avoided';  // Error pattern avoidance
```

### 1.3 LearnedPattern

Pattern stored for caching and learning.

```typescript
interface LearnedPattern {
  id: string;                    // Unique pattern identifier
  codeHash: string;              // Hash of original code
  editHash: string;              // Hash of edit/target
  language: string;              // Programming language
  embedding: number[];           // Vector embedding (384-dim)
  confidence: number;            // Current confidence score
  successCount: number;          // Successful applications
  failureCount: number;          // Failed applications
  avgLatency: number;            // Average latency
  lastUsed: number;              // Last used timestamp
  output?: string;               // Cached output
  codeNormalized?: string;       // Normalized code for fuzzy matching
  editType?: string;             // Detected edit type (see Section 2)
  compressed?: boolean;          // Whether embedding is compressed
  accessCount: number;           // Total access count
  createdAt: number;             // Creation timestamp
  compressionTier?: CompressionTier;  // Current compression tier
}

type CompressionTier = 'none' | 'half' | 'pq8' | 'pq4' | 'binary';
```

### 1.4 BoosterStats

Statistics for monitoring and optimization.

```typescript
interface BoosterStats {
  totalEdits: number;          // Total edits processed
  cacheHits: number;           // Exact cache hits
  fuzzyHits: number;           // Fuzzy match hits
  gnnHits: number;             // GNN search hits
  cacheMisses: number;         // Cache misses
  avgLatency: number;          // Average latency (ms)
  avgConfidence: number;       // Average confidence
  patternsLearned: number;     // Total patterns learned
  errorPatternsLearned: number;// Error patterns learned
  sonaUpdates: number;         // SONA learning updates
  gnnSearches: number;         // GNN searches performed
  hitRate: string;             // Cache hit rate percentage
  confidenceImprovement: string; // Confidence improvement percentage
  compressionRatio: string;    // Memory compression ratio
  onnxEnabled: boolean;        // ONNX embeddings status
  tierDistribution: {          // Pattern tier distribution
    hot: number;               // No compression (>0.8 freq)
    warm: number;              // Half compression (>0.4 freq)
    cool: number;              // PQ8 compression (>0.1 freq)
    cold: number;              // PQ4 compression (>0.01 freq)
    archive: number;           // Binary compression (<=0.01 freq)
  };
  totalPatternAccesses: number; // Total pattern accesses
  memorySavings: string;        // Memory savings percentage
}
```

### 1.5 ErrorPattern

Learned error patterns to avoid.

```typescript
interface ErrorPattern {
  pattern: string;        // Normalized pattern string
  errorType: string;      // Type of error
  suggestedFix: string;   // Suggested fix (often original code)
  occurrences: number;    // Number of occurrences
  lastSeen: number;       // Last seen timestamp
}
```

### 1.6 PrefetchResult

Result of prefetch operation for context-aware optimization.

```typescript
interface PrefetchResult {
  file: string;           // File path
  likelyEdits: string[];  // Predicted likely edits
  confidence: number;     // Confidence in predictions
}
```

---

## 2. Supported Transform Types (Edit Types)

The Agent Booster automatically detects and categorizes edit types:

| Edit Type | Description | Example |
|-----------|-------------|---------|
| `var_to_const` | Convert `var` to `const` | `var x = 1;` -> `const x = 1;` |
| `var_to_let` | Convert `var` to `let` | `var x = 1;` -> `let x = 1;` |
| `add_types` | Add TypeScript type annotations | `function foo(x)` -> `function foo(x: any)` |
| `to_async` | Convert `.then()` to async/await | `.then(x => {})` -> `await x` |
| `remove_console` | Remove console statements | `console.log(x);` -> `` |
| `add_async` | Add async keyword to function | `function foo()` -> `async function foo()` |
| `to_esm` | Convert CommonJS to ES modules | `require('x')` -> `import x from 'x'` |
| `general` | General/unclassified transformations | Any other edit |

**Edit Type Detection Logic** (from source):
```typescript
private detectEditType(code: string, edit: string): string {
  if (/\bvar\b/.test(code) && /\bconst\b/.test(edit)) return 'var_to_const';
  if (/\bvar\b/.test(code) && /\blet\b/.test(edit)) return 'var_to_let';
  if (!/:/.test(code) && /:/.test(edit)) return 'add_types';
  if (/\.then\(/.test(code) && /await/.test(edit)) return 'to_async';
  if (/console\./.test(code) && !edit.trim()) return 'remove_console';
  if (/function/.test(code) && /async function/.test(edit)) return 'add_async';
  if (/require\(/.test(code) && /import/.test(edit)) return 'to_esm';
  return 'general';
}
```

---

## 3. API Functions

### 3.1 EnhancedAgentBooster Class

Main class for Agent Booster operations.

```typescript
class EnhancedAgentBooster {
  constructor(options?: {
    storagePath?: string;      // Pattern storage path (default: ~/.agentic-flow/booster-patterns-v2)
    enableOnnx?: boolean;      // Enable ONNX embeddings (default: true)
    enableSona?: boolean;      // Enable SONA learning (default: true)
    maxPatterns?: number;      // Maximum patterns to store (default: 100000)
    fuzzyThreshold?: number;   // Fuzzy match threshold (default: 0.85)
  });

  // Initialize the booster (load patterns, init ONNX)
  async init(): Promise<void>;

  // Apply code transformation
  async apply(request: EnhancedEditRequest): Promise<EnhancedEditResult>;

  // Apply multiple transformations in parallel
  async applyBatch(requests: EnhancedEditRequest[], maxConcurrency?: number): Promise<EnhancedEditResult[]>;

  // Prefetch likely edits for a file
  async prefetch(filePath: string): Promise<PrefetchResult>;

  // Record edit outcome for learning
  async recordOutcome(patternId: string, success: boolean): Promise<void>;

  // Get current statistics
  getStats(): BoosterStats;

  // Persist patterns to disk
  async persist(): Promise<void>;

  // Pretrain with common patterns
  async pretrain(): Promise<{ patterns: number; timeMs: number }>;

  // Force SONA learning cycle
  tick(): string | null;

  // Get intelligence engine statistics
  getIntelligenceStats(): any;

  // Get likely next files to edit
  getLikelyNextFiles(filePath: string, topK?: number): Array<{ file: string; score: number }>;
}
```

### 3.2 Factory Functions

```typescript
// Get singleton enhanced booster instance
function getEnhancedBooster(): EnhancedAgentBooster;

// Quick apply function
async function enhancedApply(
  code: string,
  edit: string,
  language: string
): Promise<EnhancedEditResult>;

// Benchmark enhanced vs baseline
async function benchmark(iterations?: number): Promise<{
  baseline: { avgLatency: number; avgConfidence: number };
  enhanced: { avgLatency: number; avgConfidence: number; cacheHitRate: number; fuzzyHitRate: number };
  improvement: { latency: string; confidence: string };
}>;
```

---

## 4. MCP Tool Definitions

### 4.1 agent_booster_edit_file

Edit a single file using Agent Booster.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "target_filepath": {
      "type": "string",
      "description": "Path of the file to modify"
    },
    "instructions": {
      "type": "string",
      "description": "First-person instruction (e.g., 'I will add error handling')"
    },
    "code_edit": {
      "type": "string",
      "description": "Precise code lines to edit, using '// ... existing code ...' for unchanged sections"
    },
    "language": {
      "type": "string",
      "description": "Programming language (auto-detected from file extension if not provided)"
    }
  },
  "required": ["target_filepath", "instructions", "code_edit"]
}
```

### 4.2 agent_booster_batch_edit

Apply multiple edits in a single operation.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "edits": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "target_filepath": { "type": "string" },
          "instructions": { "type": "string" },
          "code_edit": { "type": "string" },
          "language": { "type": "string" }
        },
        "required": ["target_filepath", "instructions", "code_edit"]
      }
    }
  },
  "required": ["edits"]
}
```

**Return Type**:
```typescript
{
  results: MorphApplyResponse[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalLatency: number;
    avgLatency: number;
    totalBytes: number;
    speedupVsCloud: number;
  }
}
```

### 4.3 agent_booster_parse_markdown

Parse markdown code blocks and apply all edits.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "markdown": {
      "type": "string",
      "description": "Markdown text with code blocks containing filepath= and instruction= metadata"
    }
  },
  "required": ["markdown"]
}
```

**Markdown Format**:
````markdown
```typescript filepath="src/file.ts" instruction="I will add types"
// Code edit here
```
````

---

## 5. Configuration Options

### 5.1 Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storagePath` | string | `~/.agentic-flow/booster-patterns-v2` | Pattern storage directory |
| `enableOnnx` | boolean | `true` | Enable ONNX embeddings for semantic matching |
| `enableSona` | boolean | `true` | Enable SONA continual learning |
| `maxPatterns` | number | `100000` | Maximum patterns to store |
| `fuzzyThreshold` | number | `0.85` | Cosine similarity threshold for fuzzy matching |

### 5.2 AgentBooster Engine Options (via `agent-booster` package)

```typescript
{
  confidenceThreshold: 0.5,  // Minimum confidence for successful transformation
  maxChunks: 100             // Maximum code chunks to process
}
```

---

## 6. Performance Characteristics

### 6.1 Latency Targets

| Strategy | Expected Latency | Notes |
|----------|------------------|-------|
| `exact_cache` | 0ms | Exact hash match |
| `fuzzy_match` | 1-5ms | Cosine similarity search |
| `gnn_match` | 5-20ms | GNN differentiable search |
| `agent_booster` | ~650ms | Full Agent Booster WASM engine |
| `fallback` | N/A | Error or unsupported |

### 6.2 Compression Tiers

| Tier | Access Frequency | Compression | Memory Savings |
|------|------------------|-------------|----------------|
| Hot (`none`) | >0.8 | None | 0% |
| Warm (`half`) | >0.4 | Half precision | 50% |
| Cool (`pq8`) | >0.1 | Product quantization 8-bit | 87.5% |
| Cold (`pq4`) | >0.01 | Product quantization 4-bit | 93.75% |
| Archive (`binary`) | <=0.01 | Binary | 96.9% |

### 6.3 Supported Languages

```typescript
const supportedLanguages = [
  'typescript', 'javascript', 'python', 'java', 'cpp', 'c',
  'rust', 'go', 'ruby', 'php', 'swift', 'kotlin', 'scala',
  'haskell', 'elixir', 'clojure', 'r', 'julia', 'dart'
];
```

---

## 7. Error Handling

### 7.1 Error Types

| Error Scenario | Handling |
|----------------|----------|
| Transformation fails | Returns `success: false`, learns error pattern |
| Confidence below threshold | Falls back to Agent Booster engine |
| File read error | Returns error response with message |
| WASM unavailable | Falls back to traditional method |
| Network timeout (npx) | 30s timeout, returns fallback |

### 7.2 Error Pattern Learning

When a transformation fails:
1. Pattern is normalized and stored in `errorPatterns` map
2. Occurrences are tracked
3. After 2+ occurrences, edit is avoided with `error_avoided` strategy
4. Suggested fix (usually original code) is returned

---

## 8. Integration Points for AQE v3

### 8.1 Recommended Integration Pattern

```typescript
import {
  EnhancedAgentBooster,
  getEnhancedBooster,
  type EnhancedEditRequest,
  type EnhancedEditResult,
} from '@agentic-flow/intelligence';

// Initialize once
const booster = getEnhancedBooster();
await booster.init();

// Apply transformation
const result = await booster.apply({
  code: 'var x = 1;',
  edit: 'const x = 1;',
  language: 'javascript'
});

// Check result
if (result.success && result.confidence >= 0.7) {
  // Use transformed code
  console.log(result.output);
} else {
  // Fall back to LLM-based transformation
}
```

### 8.2 Batch Processing Pattern

```typescript
const edits: EnhancedEditRequest[] = files.map(file => ({
  code: readFileSync(file, 'utf8'),
  edit: generateTargetCode(file),
  language: getLanguage(file),
  filePath: file
}));

const results = await booster.applyBatch(edits, 4); // 4 concurrent
```

### 8.3 Statistics Integration

```typescript
// Expose stats for monitoring
const stats = booster.getStats();
metrics.recordGauge('agent_booster.hit_rate', parseFloat(stats.hitRate));
metrics.recordGauge('agent_booster.avg_latency', stats.avgLatency);
metrics.recordCounter('agent_booster.total_edits', stats.totalEdits);
```

---

## 9. Exports from intelligence/index.ts

The following are exported for public use:

```typescript
// Classes
export { EnhancedAgentBooster } from './agent-booster-enhanced.js';

// Factory functions
export { getEnhancedBooster, enhancedApply, benchmark as benchmarkEnhancedBooster } from './agent-booster-enhanced.js';

// Types
export type {
  EnhancedEditRequest,
  EnhancedEditResult,
  LearnedPattern as BoosterPattern,
  BoosterStats,
  ErrorPattern,
  PrefetchResult,
} from './agent-booster-enhanced.js';
```

---

## 10. Appendix: Pretrained Patterns

The `pretrain()` method initializes these common patterns:

```typescript
const commonPatterns = [
  // Variable conversions
  { code: 'var x = 1;', edit: 'const x = 1;', lang: 'javascript' },
  { code: 'var arr = [];', edit: 'const arr = [];', lang: 'javascript' },
  { code: 'var obj = {};', edit: 'const obj = {};', lang: 'javascript' },
  { code: 'let x = 1;', edit: 'const x = 1;', lang: 'javascript' },

  // Type annotations
  { code: 'function foo(x) {}', edit: 'function foo(x: any) {}', lang: 'typescript' },
  { code: 'const x = 1', edit: 'const x: number = 1', lang: 'typescript' },
  { code: 'let arr = []', edit: 'let arr: any[] = []', lang: 'typescript' },

  // Async patterns
  { code: '.then(x => {})', edit: 'await x', lang: 'javascript' },
  { code: 'function foo() {}', edit: 'async function foo() {}', lang: 'javascript' },
  { code: 'const foo = () => {}', edit: 'const foo = async () => {}', lang: 'javascript' },

  // Error handling
  { code: 'JSON.parse(str)', edit: 'try { JSON.parse(str) } catch (e) {}', lang: 'javascript' },
  { code: 'await fetch(url)', edit: 'try { await fetch(url) } catch (e) {}', lang: 'javascript' },

  // Console removal
  { code: 'console.log(x);', edit: '', lang: 'javascript' },
  { code: 'console.debug(x);', edit: '', lang: 'javascript' },
  { code: 'console.error(x);', edit: '', lang: 'javascript' },

  // Python patterns
  { code: 'print x', edit: 'print(x)', lang: 'python' },
  { code: 'def foo():', edit: 'def foo() -> None:', lang: 'python' },
  { code: 'def foo(x):', edit: 'def foo(x: Any) -> Any:', lang: 'python' },

  // Import patterns
  { code: "require('x')", edit: "import x from 'x'", lang: 'javascript' },
  { code: 'module.exports = x', edit: 'export default x', lang: 'javascript' },
  { code: "const x = require('x')", edit: "import x from 'x'", lang: 'javascript' },

  // Arrow functions
  { code: 'function foo(x) { return x; }', edit: 'const foo = (x) => x;', lang: 'javascript' },
  { code: 'function foo() { return 1; }', edit: 'const foo = () => 1;', lang: 'javascript' },

  // Template literals
  { code: '"Hello " + name', edit: '`Hello ${name}`', lang: 'javascript' },

  // Object shorthand
  { code: '{ x: x, y: y }', edit: '{ x, y }', lang: 'javascript' },

  // Spread operator
  { code: 'Object.assign({}, obj)', edit: '{ ...obj }', lang: 'javascript' },
  { code: 'arr.concat(arr2)', edit: '[...arr, ...arr2]', lang: 'javascript' },
];
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Research Agent | Initial specification |

---

**End of Specification**
