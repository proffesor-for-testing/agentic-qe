# agent-booster-wasm

WebAssembly bindings for the Agent Booster library, providing fast code editing capabilities using tree-sitter and similarity matching in Node.js and browser environments.

## Status

**Phase**: Initial implementation complete, waiting for core library API finalization.

The WASM bindings infrastructure is ready with:
- ✅ Type definitions and conversions
- ✅ WASM-bindgen setup
- ✅ JavaScript interop layer
- ⏳ Core `apply_edit` function (pending core library implementation)

## Installation

Once published, you can install via npm:

```bash
npm install agent-booster-wasm
```

## Building from Source

### Prerequisites

1. Install Rust (1.70+):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. Add WASM target:
   ```bash
   rustup target add wasm32-unknown-unknown
   ```

3. Install wasm-pack:
   ```bash
   curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
   ```

### Build Commands

```bash
# Build for Node.js
wasm-pack build --target nodejs

# Build for web browsers
wasm-pack build --target web

# Build for bundlers (webpack, rollup, etc.)
wasm-pack build --target bundler

# Release build (optimized)
wasm-pack build --release --target nodejs
```

## Usage

### Basic Example

```javascript
const { AgentBoosterWasm, WasmLanguage } = require('agent-booster-wasm');

// Create an instance
const booster = new AgentBoosterWasm();

// Parse language
const language = AgentBoosterWasm.parse_language('javascript');

// Apply an edit (once implemented)
try {
  const result = booster.apply_edit(
    originalCode,
    editSnippet,
    language
  );

  console.log('Merged code:', result.merged_code);
  console.log('Confidence:', result.confidence);
  console.log('Strategy:', result.strategy);
} catch (error) {
  console.error('Edit failed:', error);
}
```

### Configuration

```javascript
const { WasmConfig } = require('agent-booster-wasm');

// Create custom configuration
const config = new WasmConfig();
config.confidence_threshold = 0.7;
config.max_chunks = 100;

// Use with AgentBooster
const booster = AgentBoosterWasm.with_config(config);
```

### JSON API

For dynamic use cases, you can use the JSON API:

```javascript
const requestJson = JSON.stringify({
  original_code: "const x = 1;",
  edit_snippet: "const x = 2;",
  language: "JavaScript",
  confidence_threshold: 0.5
});

const result = booster.apply_edit_json(requestJson);
const resultData = JSON.parse(result.to_json());
```

## API Reference

### AgentBoosterWasm

Main interface for applying code edits.

#### Methods

- `new()` - Create with default configuration
- `with_config(config: WasmConfig)` - Create with custom configuration
- `parse_language(lang: string)` - Parse language string to WasmLanguage
- `apply_edit(original_code: string, edit_snippet: string, language: WasmLanguage)` - Apply an edit
- `apply_edit_json(request_json: string)` - Apply edit from JSON request
- `get_config()` - Get current configuration
- `set_config(config: WasmConfig)` - Update configuration
- `version()` - Get library version (static method)

### WasmLanguage

Supported programming languages:
- `JavaScript`
- `TypeScript`

### WasmMergeStrategy

Strategies for applying edits:
- `ExactReplace` - Replace exact match with high confidence
- `FuzzyReplace` - Replace with fuzzy text matching
- `InsertAfter` - Insert after matched location
- `InsertBefore` - Insert before matched location
- `Append` - Append to end of file

### WasmEditResult

Result of an edit operation:
- `merged_code: string` - The merged code after applying edit
- `confidence: f32` - Confidence score (0.0 - 1.0)
- `strategy: WasmMergeStrategy` - Strategy used for merging
- `chunks_found: usize` - Number of chunks extracted from original code
- `best_similarity: f32` - Best similarity score found
- `syntax_valid: bool` - Whether syntax validation passed
- `processing_time_ms?: u64` - Processing time in milliseconds
- `to_json()` - Convert to JSON string

### WasmConfig

Configuration for AgentBooster:
- `confidence_threshold: f32` - Minimum confidence threshold (default: 0.5)
- `max_chunks: usize` - Maximum number of chunks to consider (default: 50)
- `from_json(json: string)` - Create from JSON string (static method)
- `to_json()` - Convert to JSON string

### Helper Functions

- `parse_edit_request(json: string)` - Parse EditRequest from JSON
- `create_edit_request(original_code: string, edit_snippet: string, language: WasmLanguage, confidence_threshold?: f32)` - Create EditRequest JSON

## Performance

The WASM module is optimized for:
- **Small binary size**: Release builds use `opt-level = "z"` and LTO
- **Fast parsing**: Tree-sitter provides zero-copy parsing
- **Efficient similarity matching**: Rust's performance with minimal JavaScript overhead

Expected performance characteristics:
- Small code files (<1KB): < 1ms
- Medium files (1-10KB): 1-5ms
- Large files (10-100KB): 5-50ms

## Architecture

```
┌─────────────────────────────────────┐
│   JavaScript/TypeScript Application  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│     wasm-bindgen JS Glue Code       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   agent-booster-wasm (This Crate)   │
│   - Type conversions                 │
│   - Error handling                   │
│   - JS interop layer                 │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   agent-booster (Core Library)      │
│   - Tree-sitter parsing              │
│   - Similarity matching              │
│   - Code merging logic               │
└─────────────────────────────────────┘
```

## Testing

```bash
# Run WASM tests
wasm-pack test --node

# Run in browser (requires Chrome/Firefox)
wasm-pack test --headless --firefox
wasm-pack test --headless --chrome
```

## Size Optimization

The WASM binary is optimized for size:

1. **Compiler optimizations**: `opt-level = "z"` for maximum size reduction
2. **LTO**: Link-time optimization enabled
3. **Strip**: Debug symbols removed in release builds
4. **Optional allocator**: Can use `wee_alloc` for smaller binary

To enable `wee_alloc`:
```bash
wasm-pack build --release --target nodejs -- --features wee_alloc_feature
```

## Troubleshooting

### Build Errors

If you encounter build errors:

1. Ensure Rust toolchain is up to date:
   ```bash
   rustup update
   ```

2. Clean and rebuild:
   ```bash
   cargo clean
   wasm-pack build --target nodejs
   ```

3. Check that the core library builds:
   ```bash
   cd ../agent-booster
   cargo build
   ```

### Runtime Errors

Common issues:

1. **"apply_edit not yet implemented"**: The core library API is still being developed. This is expected during the initial phase.

2. **Memory issues**: WASM has a memory limit. For very large files, consider processing in chunks.

3. **Browser compatibility**: Ensure your target browsers support WebAssembly (most modern browsers do).

## Development Status

- [x] Project structure
- [x] Type definitions and conversions
- [x] WASM-bindgen integration
- [x] Configuration API
- [x] Helper functions
- [x] Documentation
- [ ] Core library integration (waiting for apply_edit implementation)
- [ ] Performance benchmarks
- [ ] Integration tests
- [ ] NPM package publication

## Contributing

This is part of the Agent Booster project. See the main project README for contribution guidelines.

## License

MIT - See LICENSE file for details.

## Links

- [Agent Booster Core](../agent-booster/)
- [Agent Booster Native (N-API)](../agent-booster-native/)
- [wasm-bindgen Documentation](https://rustwasm.github.io/wasm-bindgen/)
- [wasm-pack Documentation](https://rustwasm.github.io/wasm-pack/)
