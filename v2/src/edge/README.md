# @ruvector/edge Integration for Agentic QE Fleet

Browser-compatible AI agent capabilities using WASM-compiled vector operations.

## Overview

This module enables Agentic QE agents to run directly in the browser, providing:

- **WASM-compiled HNSW** for in-browser vector similarity search
- **IndexedDB storage** for persistent agent memory
- **Chrome DevTools panel** for agent debugging and inspection
- **Sub-100ms search latency** on modern browsers

## Phase 0: Proof of Concept

Current implementation focuses on validating:

1. Browser agent viability with WASM
2. HNSW performance in browser environments
3. DevTools integration for debugging

## Installation

```bash
# @ruvector/edge is an optional dependency
npm install

# Or explicitly install
npm install @ruvector/edge --save-optional
```

## Build Configuration

### WASM TypeScript Config

The `wasm/tsconfig.wasm.json` configures TypeScript for browser/WASM compatibility:

- ES2020 target with ESNext modules
- Bundler module resolution
- Isolated modules for WASM compatibility
- DOM type definitions

### Build Scripts

```bash
# Build edge module
npm run build:edge

# Watch mode for development
npm run build:edge:watch
```

## Directory Structure

```
src/edge/
├── adapters/           # Browser storage adapters
│   ├── IndexedDBStorage.ts
│   └── BrowserHNSWAdapter.ts
├── browser/            # Browser-compatible agent code
│   └── BrowserAgent.ts
├── devtools/           # Chrome DevTools panel
│   ├── manifest.json
│   ├── panel.html
│   └── panel.ts
├── types/              # TypeScript type definitions
│   ├── browser-agent.types.ts
│   └── storage.types.ts
├── wasm/               # WASM build configuration
│   ├── tsconfig.wasm.json
│   └── shims.ts
├── index.ts            # Main entry point
└── README.md           # This file
```

## Usage

```typescript
import {
  BrowserAgent,
  BrowserHNSWAdapter,
  IndexedDBStorage,
  isEdgeRuntime,
  getEdgeCapabilities
} from 'agentic-qe/edge';

// Check runtime environment
if (isEdgeRuntime()) {
  const capabilities = getEdgeCapabilities();

  if (capabilities.hasWASM && capabilities.hasIndexedDB) {
    // Initialize browser storage
    const storage = new IndexedDBStorage('agentic-qe-memory');
    await storage.initialize();

    // Create HNSW adapter
    const hnswAdapter = new BrowserHNSWAdapter(storage);
    await hnswAdapter.initialize();

    // Create browser agent
    const agent = new BrowserAgent({
      id: 'browser-agent-1',
      type: 'analyzer',
      memory: hnswAdapter
    });

    await agent.start();
  }
}
```

## Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| Bundle size (gzipped) | <= 400KB | Pending |
| HNSW search latency | < 100ms | Pending |
| DevTools load time | < 500ms | Pending |
| Memory usage | < 50MB | Pending |

## DevTools Panel

The Chrome DevTools panel provides:

- Real-time agent status monitoring
- Memory vector visualization
- Pattern matching inspection
- Performance metrics

### Installation

1. Build the edge module: `npm run build:edge`
2. Open Chrome DevTools
3. Navigate to "Agentic QE" panel

## Memory Coordination

Phase 0 uses the following memory namespaces:

- `edge/poc/setup/*` - Development environment artifacts
- `edge/poc/wasm/*` - WASM compilation artifacts
- `edge/poc/adapters/*` - Storage adapter artifacts
- `edge/poc/devtools/*` - DevTools panel artifacts

## Dependencies

### Required (Optional in package.json)

- `@ruvector/edge` - WASM-compiled vector operations

### Bundled

- IndexedDB wrapper
- WASM shims for Node.js compatibility

## Contributing

See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for development guidelines.

## License

MIT - See [LICENSE](../../../LICENSE)
