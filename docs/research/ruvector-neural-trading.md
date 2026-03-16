# RuVector Neural Trading Crates Research

## Crates Covered
1. neural-trader-core - Market event types, 10-node/12-edge heterogeneous graph schema
2. neural-trader-coherence - MinCut coherence gate, CUSUM drift, proof-gated mutation
3. neural-trader-replay - Coherence-gated experience replay with 7 segment kinds
4. neural-trader-wasm - 172KB WASM binary with BigInt-safe timestamps

## Key Findings

### Heterogeneous Market Graph (neural-trader-core)
- 10 node types: Symbol, Venue, PriceLevel, Order, Trade, Event, Participant, TimeBucket, Regime, StrategyState
- 12 edge types: AtLevel, NextTick, Generated, Matched, etc.
- 17 property keys as enum discriminants (zero-allocation hot path)
- Fixed-point i64 pricing (avoids floating-point issues)
- GraphDelta for incremental mutation

### Coherence Gate (neural-trader-coherence)
- Regime-adaptive MinCut thresholds: Calm=12, Normal=9, Volatile=6
- 4-tier permission: allow_retrieve > allow_write > allow_act > allow_learn (strictest)
- CUSUM drift detection (threshold 4.5)
- Boundary stability tracking (8 consecutive stable windows)
- Proof-gated mutation: features -> coherence gate -> policy kernel -> VerifiedToken -> mutation -> WitnessReceipt

### Experience Replay (neural-trader-replay)
- 7 SegmentKinds: HighUncertainty, LargeImpact, RegimeTransition, StructuralAnomaly, RareQueuePattern, HeadDisagreement, Routine
- Coherence-gated writes: rejected writes return false without modifying store
- Each segment carries witness hash + coherence stats at write time

## AQE Integration Opportunities
1. **Coherence-gated agent operations**: Tiered permission system for agent actions
2. **Witnessable audit trails**: Tamper-evident receipts for quality gate decisions
3. **Replay memory for learning**: Store test experiences classified by outcome type, gate writes by coherence
4. **CUSUM drift detection**: Monitor test suite performance regression, flaky rate changes
5. **Graph-based quality modeling**: Model codebases as typed graphs with MinCut for architectural weak points
