# @ruvector Wrapper Testing - ARM64 Linux Support

## Status: SOLVED - Can Build from Source

### Original Problem

The @ruvector packages are **native Rust/NAPI modules** that require platform-specific binaries. Prebuilt ARM64 Linux binaries were not published to npm:

- `@ruvector/sona` (v0.1.5) → ARM64 binary existed
- `@ruvector/attention` (v0.1.4) → NO ARM64 binary published
- `@ruvector/gnn` (v0.1.22) → ARM64 binary outdated (v0.1.19 only)

### Solution: Build from Source

ARM64 Linux binaries can be built from the ruvector source repository:

```bash
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
export PATH="$HOME/.cargo/bin:$PATH"

# Clone and build
git clone https://github.com/ruvnet/ruvector.git
cd ruvector/crates/ruvector-gnn-node
npm install && npm run build

# Copy binary to node_modules
cp ruvector-gnn.linux-arm64-gnu.node /path/to/project/node_modules/@ruvector/gnn/
```

### Built Binaries (2026-01-12)

| Package | Binary Location | Size | Status |
|---------|-----------------|------|--------|
| @ruvector/gnn | `ruvector-gnn.linux-arm64-gnu.node` | 726 KB | ✅ Built and working |
| @ruvector/attention | `attention.linux-arm64-gnu.node` | 1 MB | ✅ Built and working |

### Verification

Both packages load successfully:

```bash
node -e 'const gnn = require("@ruvector/gnn"); console.log("GNN:", Object.keys(gnn));'
# Output: ['RuvectorLayer', 'TensorCompress', 'differentiableSearch', ...]

node -e 'const attn = require("@ruvector/attention"); console.log("Attention:", Object.keys(attn));'
# Output: ['DotProductAttention', 'MultiHeadAttention', 'FlashAttention', ...]
```

---

### For Future Setup

If you're on ARM64 Linux and @ruvector binaries are missing:

1. **Install Rust:**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source "$HOME/.cargo/env"
   ```

2. **Build Missing Binaries:**
   ```bash
   # Clone repo
   git clone https://github.com/ruvnet/ruvector.git /tmp/ruvector
   cd /tmp/ruvector

   # Build GNN
   cd crates/ruvector-gnn-node
   npm install && npm run build
   cp *.linux-arm64-gnu.node /path/to/project/node_modules/@ruvector/gnn/

   # Build Attention
   cd ../ruvector-attention-node
   npm install && npm run build
   cp *.linux-arm64-gnu.node /path/to/project/node_modules/@ruvector/attention/
   ```

3. **Fix Filenames (if needed):**
   ```bash
   # Attention binary may need renaming
   mv index.linux-arm64-gnu.node attention.linux-arm64-gnu.node
   ```

---

### Testing Approach

With native binaries available, we can now write **real integration tests** that:

1. Load the actual @ruvector packages
2. Create real HNSW indices
3. Run actual attention computations
4. Verify compression/decompression works

These tests will be skipped on platforms without the binaries, but run on ARM64 Linux where they're built from source.

---

### Related ADRs

- ADR-040: V3 QE Agentic-Flow Deep Integration
  - Documents @ruvector package integration
  - Notes custom SONA implementation (3,720 LOC) achieves 0.0099ms pattern adaptation
  - Notes Flash Attention WASM-SIMD shows mixed results (0.47x-11.01x speedup)
