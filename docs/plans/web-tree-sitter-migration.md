# Migration Plan: tree-sitter to web-tree-sitter

## Executive Summary

This document outlines the migration from native `tree-sitter` bindings to `web-tree-sitter` (WASM-based) to eliminate npm install warnings caused by native compilation requirements.

### Problem Statement
Users installing `agentic-qe@latest` encounter warnings/errors:
```
prebuild-install WARN install No prebuilt binaries found
gyp ERR! build error
```

### Solution
Replace native `tree-sitter` with `web-tree-sitter` which uses WebAssembly - no native compilation required.

---

## Current State Analysis

### Dependencies to Replace

| Current Package | Version | Replacement |
|-----------------|---------|-------------|
| `tree-sitter` | ^0.22.4 | `web-tree-sitter` |
| `tree-sitter-typescript` | ^0.23.2 | `.wasm` file |
| `tree-sitter-javascript` | ^0.23.0 | `.wasm` file |
| `tree-sitter-python` | ^0.23.5 | `.wasm` file |
| `tree-sitter-go` | ^0.23.3 | `.wasm` file |
| `tree-sitter-rust` | ^0.24.0 | `.wasm` file |

### Files Requiring Changes

**Core Parser (3 files):**
1. `src/code-intelligence/parser/TreeSitterParser.ts` - Main parser class
2. `src/code-intelligence/parser/extractors/BaseExtractor.ts` - Base extractor types
3. `src/code-intelligence/parser/index.ts` - Exports

**Language Extractors (5 files):**
4. `src/code-intelligence/parser/extractors/TypeScriptExtractor.ts`
5. `src/code-intelligence/parser/extractors/JavaScriptExtractor.ts`
6. `src/code-intelligence/parser/extractors/PythonExtractor.ts`
7. `src/code-intelligence/parser/extractors/GoExtractor.ts`
8. `src/code-intelligence/parser/extractors/RustExtractor.ts`

**Tests (3+ files):**
9. `tests/code-intelligence/parser/TreeSitterParser.test.ts`
10. `tests/code-intelligence/parser/validation.test.ts`
11. `tests/code-intelligence/benchmarks/chunking-accuracy.test.ts`

**Scripts (1 file):**
12. `scripts/validate-code-intelligence-setup.ts`

---

## API Differences

### Initialization

```typescript
// BEFORE: tree-sitter (synchronous)
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

// AFTER: web-tree-sitter (asynchronous)
import Parser from 'web-tree-sitter';

await Parser.init();  // REQUIRED: Must init WASM runtime first
const parser = new Parser();
const TypeScript = await Parser.Language.load('/path/to/tree-sitter-typescript.wasm');
parser.setLanguage(TypeScript);
```

### Key Differences

| Aspect | tree-sitter | web-tree-sitter |
|--------|-------------|-----------------|
| Initialization | Sync | Async (`Parser.init()`) |
| Language Loading | Sync import | Async `Language.load()` |
| Performance | Native (fastest) | WASM (~slower in Node.js) |
| Platform Support | Needs compilation | Universal |
| Node Types | `Parser.SyntaxNode` | Same API |
| Tree Walking | Same | Same |

### Type Compatibility

The `SyntaxNode` interface is nearly identical:
- `.type` - node type string
- `.text` - node text content
- `.startIndex`, `.endIndex` - byte positions
- `.startPosition`, `.endPosition` - row/column positions
- `.children` - child nodes array
- `.parent` - parent node

---

## Implementation Phases

### Phase 1: Infrastructure Setup (Low Risk)

**Duration:** 1-2 hours

1. **Add new dependencies:**
   ```bash
   npm install web-tree-sitter
   npm uninstall tree-sitter tree-sitter-typescript tree-sitter-javascript \
                  tree-sitter-python tree-sitter-go tree-sitter-rust
   ```

2. **Create WASM assets directory:**
   ```
   assets/
   └── wasm/
       ├── tree-sitter.wasm
       ├── tree-sitter-typescript.wasm
       ├── tree-sitter-tsx.wasm
       ├── tree-sitter-javascript.wasm
       ├── tree-sitter-python.wasm
       ├── tree-sitter-go.wasm
       └── tree-sitter-rust.wasm
   ```

3. **Generate WASM files:**
   ```bash
   # Install tree-sitter-cli for WASM generation
   npm install -g tree-sitter-cli

   # Clone and build each grammar
   git clone https://github.com/tree-sitter/tree-sitter-typescript
   cd tree-sitter-typescript
   tree-sitter build --wasm
   # Copy tree-sitter-typescript.wasm to assets/wasm/
   ```

   **Alternative:** Use pre-built WASM from [@aspect-build](https://github.com/aspect-build/aspect-build) or generate at build time.

4. **Update package.json files array:**
   ```json
   {
     "files": [
       "dist",
       "assets/wasm",
       ...
     ]
   }
   ```

### Phase 2: Create Async Parser Wrapper (Medium Risk)

**Duration:** 2-3 hours

Create a new async-compatible parser that wraps web-tree-sitter:

```typescript
// src/code-intelligence/parser/WebTreeSitterParser.ts

import Parser, { Language, Tree, SyntaxNode } from 'web-tree-sitter';
import { join } from 'path';
import { Language as CodeLanguage, ParseResult } from './types.js';

export class WebTreeSitterParser {
  private static initialized = false;
  private parsers: Map<CodeLanguage, Parser> = new Map();
  private languages: Map<CodeLanguage, Language> = new Map();
  private treeCache: Map<string, { tree: Tree; content: string; language: CodeLanguage }> = new Map();

  /**
   * Initialize the WASM runtime - MUST be called before parsing
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;
    await Parser.init();
    this.initialized = true;
  }

  /**
   * Load a language grammar
   */
  async loadLanguage(lang: CodeLanguage): Promise<void> {
    if (this.languages.has(lang)) return;

    await WebTreeSitterParser.initialize();

    const wasmPath = this.getWasmPath(lang);
    const language = await Parser.Language.load(wasmPath);
    this.languages.set(lang, language);

    const parser = new Parser();
    parser.setLanguage(language);
    this.parsers.set(lang, parser);
  }

  /**
   * Get WASM file path for a language
   */
  private getWasmPath(lang: CodeLanguage): string {
    const wasmDir = join(__dirname, '../../../assets/wasm');
    const files: Record<CodeLanguage, string> = {
      typescript: 'tree-sitter-typescript.wasm',
      javascript: 'tree-sitter-javascript.wasm',
      python: 'tree-sitter-python.wasm',
      go: 'tree-sitter-go.wasm',
      rust: 'tree-sitter-rust.wasm',
    };
    return join(wasmDir, files[lang]);
  }

  /**
   * Parse file (async version)
   */
  async parseFile(
    filePath: string,
    content: string,
    language?: string
  ): Promise<ParseResult> {
    const detectedLanguage = language as CodeLanguage ?? this.detectLanguage(filePath);
    if (!detectedLanguage) {
      throw new Error(`Cannot detect language for: ${filePath}`);
    }

    await this.loadLanguage(detectedLanguage);
    const parser = this.parsers.get(detectedLanguage)!;

    const tree = parser.parse(content);

    // Cache for incremental updates
    this.treeCache.set(filePath, {
      tree,
      content,
      language: detectedLanguage,
    });

    return this.extractEntities(tree.rootNode, content, filePath, detectedLanguage);
  }

  // ... rest of implementation follows same pattern as TreeSitterParser
}
```

### Phase 3: Update Extractors (Low Risk)

**Duration:** 1-2 hours

The extractors use `Parser.SyntaxNode` type which is compatible. Update imports:

```typescript
// BEFORE
import Parser from 'tree-sitter';

// AFTER
import type { SyntaxNode } from 'web-tree-sitter';

// Update method signatures
export abstract class BaseExtractor {
  abstract extractFunctions(node: SyntaxNode): ExtractedSymbol[];
  abstract extractClasses(node: SyntaxNode): ExtractedSymbol[];
  abstract extractMethods(classNode: SyntaxNode): ExtractedSymbol[];

  protected findChildByType(node: SyntaxNode, type: string): SyntaxNode | null {
    return node.children.find(child => child.type === type) || null;
  }
  // ...
}
```

### Phase 4: Update Consumers (Medium Risk)

**Duration:** 2-3 hours

Update all code that uses `TreeSitterParser`:

```typescript
// BEFORE
const parser = new TreeSitterParser();
const result = parser.parseFile(filePath, content);

// AFTER
const parser = new WebTreeSitterParser();
await parser.loadLanguage('typescript'); // Pre-load for performance
const result = await parser.parseFile(filePath, content);
```

**Key consumers to update:**
- `src/code-intelligence/service/CodeIntelligenceService.ts`
- `src/code-intelligence/graph/GraphBuilder.ts`
- Any CLI commands using parsing

### Phase 5: Update Tests (Low Risk)

**Duration:** 1-2 hours

Convert test setup to async:

```typescript
// BEFORE
describe('TreeSitterParser', () => {
  let parser: TreeSitterParser;

  beforeEach(() => {
    parser = new TreeSitterParser();
  });

  it('parses TypeScript', () => {
    const result = parser.parseFile('test.ts', 'const x = 1;');
    expect(result.entities).toHaveLength(1);
  });
});

// AFTER
describe('WebTreeSitterParser', () => {
  let parser: WebTreeSitterParser;

  beforeAll(async () => {
    await WebTreeSitterParser.initialize();
  });

  beforeEach(() => {
    parser = new WebTreeSitterParser();
  });

  it('parses TypeScript', async () => {
    const result = await parser.parseFile('test.ts', 'const x = 1;');
    expect(result.entities).toHaveLength(1);
  });
});
```

### Phase 6: Remove Old Dependencies (Low Risk)

**Duration:** 30 minutes

1. Remove from package.json:
   ```json
   // Remove these
   "tree-sitter": "^0.22.4",
   "tree-sitter-go": "^0.23.3",
   "tree-sitter-javascript": "^0.23.0",
   "tree-sitter-python": "^0.23.5",
   "tree-sitter-rust": "^0.24.0",
   "tree-sitter-typescript": "^0.23.2",
   ```

2. Remove overrides section (no longer needed):
   ```json
   // Remove entire overrides block
   "overrides": {
     "tree-sitter-go": { ... },
     ...
   }
   ```

3. Run `npm install` to verify clean install

---

## WASM File Distribution Options

### Option A: Bundle in Package (Recommended)

Include WASM files in the npm package:
```json
{
  "files": ["dist", "assets/wasm"]
}
```

**Pros:** Self-contained, works offline
**Cons:** Larger package size (~5-10MB)

### Option B: Download on First Use

Fetch WASM files on first parse:
```typescript
async function downloadWasm(lang: string): Promise<Buffer> {
  const url = `https://cdn.example.com/wasm/tree-sitter-${lang}.wasm`;
  const response = await fetch(url);
  return Buffer.from(await response.arrayBuffer());
}
```

**Pros:** Smaller package
**Cons:** Requires network, first-parse latency

### Option C: Optional Peer Dependency

Make code-intelligence optional:
```json
{
  "optionalDependencies": {
    "web-tree-sitter": "^0.26.3"
  }
}
```

Users who need parsing install it explicitly.

**Pros:** Zero impact for users not using code-intelligence
**Cons:** More complex setup

---

## Performance Considerations

### Benchmarks (Expected)

| Operation | tree-sitter (native) | web-tree-sitter (WASM) |
|-----------|---------------------|------------------------|
| First parse | 1x (baseline) | ~1.5-2x slower |
| Incremental | 1x (baseline) | ~1.5-2x slower |
| Memory | 1x (baseline) | ~1.2x |

### Mitigations

1. **Lazy Loading:** Only load languages when needed
2. **Caching:** Keep parsed trees in memory
3. **Pre-initialization:** Call `Parser.init()` at startup
4. **Consider oxc-parser:** For TS/JS only, 2x faster than even native tree-sitter

---

## Rollback Strategy

If issues arise, revert by:
1. Restore `tree-sitter` dependencies in package.json
2. Git revert parser changes
3. Remove `assets/wasm` directory
4. Republish

---

## Testing Checklist

- [ ] All existing parser tests pass
- [ ] Incremental parsing works correctly
- [ ] All 5 languages parse correctly (TS, JS, Python, Go, Rust)
- [ ] `npm install agentic-qe@latest` shows no warnings
- [ ] Package installs on: Linux, macOS, Windows
- [ ] Package installs on: Node 18, 20, 22
- [ ] CI pipeline passes
- [ ] Code-intelligence CLI commands work

---

## Timeline Estimate

| Phase | Duration | Risk |
|-------|----------|------|
| Phase 1: Infrastructure | 1-2 hours | Low |
| Phase 2: Async Parser | 2-3 hours | Medium |
| Phase 3: Update Extractors | 1-2 hours | Low |
| Phase 4: Update Consumers | 2-3 hours | Medium |
| Phase 5: Update Tests | 1-2 hours | Low |
| Phase 6: Cleanup | 30 min | Low |
| **Total** | **8-12 hours** | |

---

## Alternative: Hybrid Approach

For optimal performance while eliminating warnings:

1. Use **web-tree-sitter** as the default (no warnings)
2. Optionally use **native tree-sitter** if available:
   ```typescript
   let Parser: typeof import('tree-sitter') | typeof import('web-tree-sitter');
   try {
     Parser = await import('tree-sitter');
   } catch {
     Parser = await import('web-tree-sitter');
     await Parser.init();
   }
   ```

This gives users native performance if compilation succeeds, with WASM fallback.

---

## Decision Required

Choose implementation approach:

1. **Full WASM Migration** - Simplest, eliminates all native deps
2. **Hybrid with Fallback** - Best performance, more complex
3. **Optional Code Intelligence** - Make entire feature opt-in

**Recommendation:** Option 1 (Full WASM Migration) for simplicity and reliability.
