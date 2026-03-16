# RuVector MCP Brain, Cognitum & RuVLLM Research

## Crates Covered
1. mcp-brain - MCP client for cross-session learning (20 tools)
2. mcp-brain-server - Cloud REST API with cognitive engine (Hopfield + HDC)
3. cognitum-gate-kernel - no_std WASM coherence gate (~46KB/tile, 256-tile fabric)
4. ruvllm - Local LLM inference with SONA learning, Flash Attention 2, speculative decoding
5. ruvllm-wasm - 435KB browser LLM runtime
6. ruvllm-cli - CLI with OpenAI-compatible server
7. ruvix - Purpose-built OS kernel for AI agents (12 syscalls, proof-gated)

## Key Findings

### mcp-brain
- 20 MCP tools: Core (10), Brainpedia (5), WASM Executable Nodes (5)
- Cross-domain transfer via Thompson Sampling
- MinCut graph partitioning with coherence scores
- Federated LoRA sync with server-side consensus
- PII stripping before data leaves machine

### cognitum-gate-kernel
- 256-tile distributed coherence fabric (255 workers + TileZero arbiter)
- Three stacked filters: Structural (min-cut), Shift (distribution), Evidence (e-value)
- E-value sequential hypothesis testing with anytime-valid decisions
- ~46KB per tile, fits single 64KB WASM page
- SIMD hooks for AVX2 and wasm32 simd128

### ruvllm
- Multi-backend: Candle, Core ML (Apple ANE), Hybrid GPU+ANE, mistral-rs
- SONA three-tier learning: Instant (<1ms MicroLoRA), Background (~100ms), Deep (minutes)
- Flash Attention 2 with O(N) memory
- Speculative decoding (2-3x speedup)
- 5 task-specific LoRA adapters (coder, researcher, security, architect, reviewer)
- RuvLTRA custom architecture: Small (494M), Medium (3B)

### ruvix (Agent OS)
- 6 kernel primitives: Task, Capability, Region, Queue, Timer, Proof
- 12 syscalls only (vs thousands in Linux)
- IPC ~45ns (22x faster than Linux), permission check ~12ns
- ~2KB/task memory (98% less than Linux)
- Proof-gated mutation with 3 verification tiers
- Kernel-resident HNSW vector stores and graph mutation
- Boots from signed RVF packages
- Multi-core SMP (256-core), bare-metal AArch64, RPi 4/5 support

## AQE Integration Opportunities
1. **Shared Brain**: Cross-session QE pattern learning via mcp-brain
2. **Coherence gating**: cognitum-gate-kernel for agent action safety decisions
3. **Local LLM inference**: ruvllm for private test generation without cloud APIs
4. **Agent OS**: ruvix for proof-gated test orchestration with kernel-speed vector operations
5. **Browser LLM**: ruvllm-wasm (435KB) for client-side test intelligence
