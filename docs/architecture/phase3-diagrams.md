# Phase 3 Architecture Diagrams

**Version:** 1.0.0
**Date:** 2025-10-20
**Related:** phase3-architecture.md

---

## 1. System Component Diagram

### 1.1 High-Level Architecture

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                                 AQE Fleet v1.1.0                                  │
│                         (Phase 3: QUIC + Neural Training)                         │
└───────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
        ▼                                ▼                                ▼
┌───────────────────┐          ┌───────────────────┐          ┌───────────────────┐
│  FleetManager     │          │  QUICTransport    │          │  NeuralMatcher    │
│  - Agent lifecycle│          │  - QUIC server    │          │  - Training       │
│  - Task dispatch  │◄────────►│  - Peer discovery │◄────────►│  - Inference      │
│  - Configuration  │          │  - TCP fallback   │          │  - Online learn   │
└─────────┬─────────┘          └─────────┬─────────┘          └─────────┬─────────┘
          │                              │                              │
          │                              │                              │
          ▼                              ▼                              ▼
┌───────────────────┐          ┌───────────────────┐          ┌───────────────────┐
│  BaseAgent        │          │  SwarmMemoryMgr   │          │  QEReasoningBank  │
│  + QUICMixin      │◄────────►│  - Agent registry │◄────────►│  - Pattern store  │
│  + NeuralMixin    │          │  - Memory store   │          │  - Pattern search │
│  - Task execution │          │  - Access control │          │  - Versioning     │
└─────────┬─────────┘          └───────────────────┘          └───────────────────┘
          │
          │
          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                              Specialized QE Agents                                │
│                                                                                   │
│  TestGenerator  CoverageAnalyzer  SecurityScanner  PerformanceTester  ...       │
│  - Neural preds  - Gap detection  - SAST/DAST     - Load testing                │
│  - QUIC comms    - QUIC comms      - QUIC comms   - QUIC comms                  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. QUIC Transport Architecture

### 2.1 Connection Establishment Flow

```
Agent A                PeerRegistry         QUICServer (Agent B)        FallbackHandler
   │                        │                      │                          │
   │ 1. connectToPeer(B)    │                      │                          │
   ├───────────────────────►│                      │                          │
   │                        │ 2. Lookup B in       │                          │
   │                        │    agent_registry    │                          │
   │                        ├─────────────────────►│                          │
   │                        │                      │                          │
   │                        │◄─────────────────────┤                          │
   │                        │ 3. B metadata:       │                          │
   │                        │    quicAddress, etc  │                          │
   │◄───────────────────────┤                      │                          │
   │                        │                      │                          │
   │ 4. Attempt QUIC connection                    │                          │
   ├──────────────────────────────────────────────►│                          │
   │                        │                      │                          │
   │                        │              5. QUIC handshake (<10ms)          │
   │                        │                      │                          │
   │◄──────────────────────────────────────────────┤                          │
   │ 6. Connection established (0-RTT if known)    │                          │
   │                        │                      │                          │
   │ 7. sendMessage(msg)    │                      │                          │
   ├──────────────────────────────────────────────►│                          │
   │                        │                      │                          │
   │                        │              8. Deliver to Agent B              │
   │                        │                      │                          │
   │◄──────────────────────────────────────────────┤                          │
   │ 9. ACK received        │                      │                          │
   │                        │                      │                          │
   │                                                                          │
   │ ─────────────────── FAILURE SCENARIO ───────────────────────────────   │
   │                        │                      │                          │
   │ 10. QUIC connection fails (timeout/error)     │                          │
   │                        │                      ├─────────────────────────►│
   │                        │                      │                          │
   │                        │                      │  11. shouldAttemptQUIC(B)?│
   │                        │                      │      Circuit breaker check│
   │                        │                      │◄─────────────────────────┤
   │                        │                      │  12. No, try TCP         │
   │                        │                      │                          │
   │ 13. Fallback to TCP/HTTP EventBus             │                          │
   ├───────────────────────────────────────────────────────────────────────►│
   │                        │                      │                          │
   │ 14. Message delivered via TCP                 │                          │
   │◄───────────────────────────────────────────────────────────────────────┤
   │                        │                      │                          │
```

### 2.2 Peer Discovery Sequence

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Agent     │         │   PeerRegistry   │         │ SwarmMemoryMgr   │
└──────┬──────┘         └────────┬─────────┘         └────────┬─────────┘
       │                         │                             │
       │ 1. Start heartbeat      │                             │
       ├────────────────────────►│                             │
       │                         │                             │
       │                         │ 2. Register self in         │
       │                         │    agent_registry           │
       │                         ├────────────────────────────►│
       │                         │                             │
       │                         │    INSERT INTO agent_registry│
       │                         │    (id, type, status,       │
       │                         │     performance: {          │
       │                         │       quicAddress: "...",   │
       │                         │       quicEnabled: true     │
       │                         │     })                      │
       │                         │                             │
       │                         │◄────────────────────────────┤
       │                         │ 3. Registration confirmed   │
       │◄────────────────────────┤                             │
       │                         │                             │
       │                         │ 4. Periodic discovery       │
       │                         │    (every 60s)              │
       │                         ├────────────────────────────►│
       │                         │                             │
       │                         │    SELECT * FROM            │
       │                         │    agent_registry           │
       │                         │    WHERE status='active'    │
       │                         │                             │
       │                         │◄────────────────────────────┤
       │                         │ 5. List of active peers     │
       │                         │                             │
       │                         │ 6. Test connectivity        │
       │                         │    (QUIC ping)              │
       │                         │                             │
       │                         │ 7. Update peer metrics      │
       │                         ├────────────────────────────►│
       │                         │                             │
       │                         │    UPDATE agent_registry    │
       │                         │    SET performance = {...}  │
       │                         │    WHERE id = peer_id       │
       │                         │                             │
       │                         │◄────────────────────────────┤
       │                         │ 8. Metrics updated          │
       │                         │                             │
```

### 2.3 Circuit Breaker State Machine

```
                           ┌──────────┐
                           │  CLOSED  │◄──────────────┐
                           │ (Normal) │               │
                           └────┬─────┘               │
                                │                     │
                    Success rate │                    │ cooldown
                    drops below  │                    │ elapsed
                    threshold    │                    │ & test
                                 │                    │ succeeds
                                ▼                     │
                           ┌──────────┐               │
                           │   OPEN   │               │
                           │(Fallback)│──────────────►│
                           └────┬─────┘      After    │
                                │            cooldown │
                                │            period   │
                        Test    │            (5 min)  │
                        request │                     │
                                │                     │
                                ▼                     │
                           ┌──────────┐               │
                           │HALF-OPEN │               │
                           │ (Testing)│───────────────┘
                           └──────────┘
                                │
                                │ Test fails
                                │
                                ▼
                           (Back to OPEN)

States:
- CLOSED: Normal operation, all requests go through QUIC
- OPEN: Circuit breaker activated, all requests use TCP fallback
- HALF-OPEN: Testing if QUIC recovered, limited requests allowed

Thresholds:
- Failure rate > 50% over 5 requests → OPEN
- Cooldown period: 5 minutes
- Test requests in HALF-OPEN: 3 requests
- Success rate > 80% in HALF-OPEN → CLOSED
```

---

## 3. Neural Training Architecture

### 3.1 Training Pipeline Flow

```
┌────────────────────┐
│  QEReasoningBank   │
│                    │
│  100+ TestPatterns │
│  - Success metrics │
│  - Usage history   │
└──────────┬─────────┘
           │
           │ 1. Ingest patterns
           │
           ▼
┌────────────────────────────────────────────────────────────┐
│                    TrainingPipeline                        │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │             FeatureExtractor                         │ │
│  │                                                      │ │
│  │  - Text embeddings (BERT): 384 dims                │ │
│  │  - Metadata features: 64 dims                      │ │
│  │  - Code complexity: 32 dims                        │ │
│  │  - Success metrics: 32 dims                        │ │
│  │  ────────────────────────────                       │ │
│  │  Total: 512-dim feature vector                     │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│                          │ 2. Extract features             │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │             DataLoader                               │ │
│  │                                                      │ │
│  │  - Split train/val/test: 70/20/10                  │ │
│  │  - Shuffle data                                     │ │
│  │  - Create batches (size: 32)                       │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│                          │ 3. Load batches                 │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │         TensorFlow Model Training                    │ │
│  │                                                      │ │
│  │  Input Layer: 512 dims                              │ │
│  │  ├─► Dense(256) + ReLU + Dropout(0.2)               │ │
│  │  ├─► Dense(128) + ReLU + Dropout(0.2)               │ │
│  │  ├─► Dense(64) + ReLU + Dropout(0.1)                │ │
│  │  └─► Output Layer: Softmax(num_patterns)            │ │
│  │                                                      │ │
│  │  Optimizer: Adam (lr=0.001)                         │ │
│  │  Loss: Categorical cross-entropy                    │ │
│  │  Epochs: 50 (with early stopping)                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│                          │ 4. Train model                  │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │             ModelValidator                           │ │
│  │                                                      │ │
│  │  - Validation accuracy: 88%                         │ │
│  │  - Precision: 0.87                                  │ │
│  │  - Recall: 0.85                                     │ │
│  │  - F1 Score: 0.86                                   │ │
│  │  - Confusion matrix                                 │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
└──────────────────────────┼─────────────────────────────────┘
                           │
                           │ 5. Save model
                           ▼
                 ┌─────────────────────┐
                 │  Model Checkpoint   │
                 │                     │
                 │  - Weights (.h5)    │
                 │  - Metadata (JSON)  │
                 │  - Version: 1.0.0   │
                 │  - Accuracy: 0.88   │
                 └─────────────────────┘
```

### 3.2 Inference Flow

```
Agent (Test Generator)
         │
         │ 1. Request pattern recommendation
         │    context = { codeType: 'test',
         │                framework: 'jest',
         │                keywords: ['api', 'controller'] }
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│              NeuralPatternMatcher                          │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │             InferenceEngine                          │ │
│  │                                                      │ │
│  │  ┌──────────────────┐                               │ │
│  │  │   PatternCache   │                               │ │
│  │  │   (LRU: 1000)    │                               │ │
│  │  │                  │                               │ │
│  │  │  2. Check cache  │                               │ │
│  │  │     for context  │                               │ │
│  │  │                  │                               │ │
│  │  │  ┌────────────┐  │                               │ │
│  │  │  │ Cache Miss │  │                               │ │
│  │  │  └────────────┘  │                               │ │
│  │  └──────────────────┘                               │ │
│  │           │                                          │ │
│  │           │ 3. Extract features                     │ │
│  │           ▼                                          │ │
│  │  ┌──────────────────┐                               │ │
│  │  │ FeatureExtractor │                               │ │
│  │  │  - Text embed    │                               │ │
│  │  │  - Metadata      │                               │ │
│  │  │  → 512-dim vec   │                               │ │
│  │  └──────────────────┘                               │ │
│  │           │                                          │ │
│  │           │ 4. Run inference                         │ │
│  │           ▼                                          │ │
│  │  ┌──────────────────┐                               │ │
│  │  │ TensorFlow Model │                               │ │
│  │  │  - Forward pass  │                               │ │
│  │  │  - Softmax       │                               │ │
│  │  │  → Probabilities │                               │ │
│  │  └──────────────────┘                               │ │
│  │           │                                          │ │
│  │           │ 5. Top-K selection                       │ │
│  │           ▼                                          │ │
│  │  ┌──────────────────┐                               │ │
│  │  │ Top-5 Patterns   │                               │ │
│  │  │  [0.92, 0.78,    │                               │ │
│  │  │   0.65, 0.54,    │                               │ │
│  │  │   0.42]          │                               │ │
│  │  └──────────────────┘                               │ │
│  │           │                                          │ │
│  │           │ 6. Cache result                          │ │
│  │           ▼                                          │ │
│  │  ┌──────────────────┐                               │ │
│  │  │  Update cache    │                               │ │
│  │  │  TTL: 1 hour     │                               │ │
│  │  └──────────────────┘                               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────┬───────────────────────────────────┘
                         │
                         │ 7. Return predictions
                         │    [Pattern A: 0.92,
                         │     Pattern B: 0.78, ...]
                         │
                         ▼
                    Agent
                         │
                         │ 8. Use highest confidence pattern
                         │    Generate tests
                         │
                         │ 9. Report outcome
                         ▼
              NeuralPatternMatcher
                         │
                         │ 10. Online learning
                         │     Update weights
                         │
                         ▼
                    (Learning complete)
```

### 3.3 Online Learning Flow

```
Agent completes task
         │
         │ Task ID: "task-123"
         │ Pattern ID: "pattern-api-test-jest"
         │ Success: true
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│              NeuralPatternMatcher                          │
│                                                            │
│  learnFromTask(taskId, patternId, success)                │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  1. Retrieve task context from memory                │ │
│  │     - Code context                                   │ │
│  │     - Pattern used                                   │ │
│  │     - Outcome                                        │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  2. Extract features                                 │ │
│  │     - Same as training pipeline                      │ │
│  │     - 512-dim feature vector                         │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  3. Create training sample                           │ │
│  │     - Input: feature vector                          │ │
│  │     - Label: pattern ID (one-hot encoded)            │ │
│  │     - Weight: 1.0 if success, 0.5 if failure         │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  4. Incremental weight update                        │ │
│  │     - Single gradient descent step                   │ │
│  │     - Learning rate: 0.0001 (lower than training)    │ │
│  │     - No need for full retraining                    │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  5. Update pattern statistics                        │ │
│  │     - Usage count++                                  │ │
│  │     - Success rate = EMA(success)                    │ │
│  │     - Confidence adjustment                          │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  6. Invalidate cache                                 │ │
│  │     - Clear related cache entries                    │ │
│  │     - Force fresh predictions                        │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 4. Agent Integration Diagrams

### 4.1 BaseAgent Enhancement

```
┌────────────────────────────────────────────────────────────────────────┐
│                          BaseAgent (Phase 3)                           │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                     Core Components                              │ │
│  │                                                                  │ │
│  │  - agentId: AgentId                                             │ │
│  │  - status: AgentStatus                                          │ │
│  │  - capabilities: Map<string, AgentCapability>                   │ │
│  │  - memoryStore: MemoryStore                                     │ │
│  │  - eventBus: EventEmitter                                       │ │
│  │  - performanceTracker?: PerformanceTracker                      │ │
│  │  - learningEngine?: LearningEngine                              │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                   Phase 3 Additions                              │ │
│  │                                                                  │ │
│  │  + quicManager?: QUICTransportManager  ◄──┐                     │ │
│  │  + neuralMatcher?: NeuralPatternMatcher   │                     │ │
│  │  + enableQuic: boolean                     │                     │ │
│  │  + enableNeural: boolean                   │                     │ │
│  └────────────────────────────────────────────┼──────────────────────┘ │
│                                               │                        │
│  ┌────────────────────────────────────────────┼──────────────────────┐ │
│  │                 New Methods                │                      │ │
│  │                                            │                      │ │
│  │  + sendMessageToAgent(agentId, message)    │                      │ │
│  │    ├─► Try QUIC first ──────────────────────┘                      │ │
│  │    └─► Fallback to EventBus                                      │ │
│  │                                                                  │ │
│  │  + subscribeToMessages(type, handler)                           │ │
│  │    ├─► Subscribe via QUIC                                       │ │
│  │    └─► Subscribe via EventBus (compat)                          │ │
│  │                                                                  │ │
│  │  + getPatternRecommendation(context)                            │ │
│  │    ├─► Try Neural prediction                                    │ │
│  │    └─► Fallback to QEReasoningBank                              │ │
│  │                                                                  │ │
│  │  + reportTaskOutcome(taskId, patternId, success)                │ │
│  │    └─► Neural online learning                                   │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Feature Opt-In Matrix

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Feature Enablement Matrix                        │
│                                                                     │
│  ┌───────────────┬──────────┬──────────┬──────────────────────┐   │
│  │    Agent      │   QUIC   │  Neural  │    Behavior          │   │
│  ├───────────────┼──────────┼──────────┼──────────────────────┤   │
│  │ Legacy Agent  │  false   │  false   │ HTTP + Rule-based    │   │
│  │               │          │          │ (Phase 1-2)          │   │
│  ├───────────────┼──────────┼──────────┼──────────────────────┤   │
│  │ QUIC Agent    │  true    │  false   │ QUIC + Rule-based    │   │
│  │               │          │          │ Fast comms only      │   │
│  ├───────────────┼──────────┼──────────┼──────────────────────┤   │
│  │ Neural Agent  │  false   │  true    │ HTTP + Neural pred   │   │
│  │               │          │          │ Smart patterns only  │   │
│  ├───────────────┼──────────┼──────────┼──────────────────────┤   │
│  │ Full Agent    │  true    │  true    │ QUIC + Neural        │   │
│  │               │          │          │ Best performance     │   │
│  └───────────────┴──────────┴──────────┴──────────────────────┘   │
│                                                                     │
│  Configuration:                                                     │
│  {                                                                  │
│    enableQuic: true/false,                                         │
│    enableNeural: true/false,                                       │
│    quicConfig: { ... },      // Required if enableQuic=true       │
│    neuralConfig: { ... }      // Required if enableNeural=true    │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Graceful Degradation Flow

```
Agent sends message to peer
         │
         ├──────────────────────────────────────┐
         │                                      │
         ▼                                      ▼
    QUIC Enabled?                         QUIC Disabled
         │                                      │
         │ YES                                  │ NO
         │                                      │
         ▼                                      ▼
  Try QUIC connection                   Use EventBus (HTTP)
         │                                      │
         ├──────────────────┐                  │
         │                  │                  │
         ▼                  ▼                  │
   Success?           Failure?                 │
         │                  │                  │
         │ YES              │ NO               │
         │                  │                  │
         ▼                  ▼                  │
  QUIC delivery      Fallback Handler         │
         │                  │                  │
         │                  ├──────────────────┘
         │                  │
         │                  ▼
         │          Circuit breaker open?
         │                  │
         │                  ├──────────────┐
         │                  │              │
         │                  ▼              ▼
         │              NO (retry)      YES (use TCP)
         │                  │              │
         │                  ▼              │
         │          Retry QUIC (1x)        │
         │                  │              │
         │                  ├──────────────┘
         │                  │              │
         │                  ▼              ▼
         │            Still fails?    Use EventBus
         │                  │              │
         │                  │ YES          │
         │                  ├──────────────┘
         │                  │
         │                  ▼
         │            Open circuit
         │            Use EventBus
         │                  │
         └──────────────────┼──────────────┘
                            │
                            ▼
                      Message delivered
```

---

## 5. Performance Comparison Diagrams

### 5.1 Latency Comparison

```
Message Latency (p95)

HTTP (Baseline)     ████████████████████████████████████████████████  50ms
QUIC (Phase 3)      ███████████████  15ms
                    │
                    └─── 70% improvement

Connection Setup

HTTP (TCP+TLS)      ████████████████████████████████████████  200ms
QUIC (0-RTT)        █  <10ms
                    │
                    └─── 95% improvement

Throughput (messages/second)

HTTP                ████████████  1,000 msg/s
QUIC                ████████████████████████████████████████████████████  5,000 msg/s
                    │
                    └─── 5x improvement
```

### 5.2 Accuracy Comparison

```
Pattern Prediction Accuracy

Rule-Based          ███████████████████████████████████████  75%
Neural (Phase 3)    ████████████████████████████████████████████████  85-90%
                    │
                    └─── 10-15% improvement

Test Quality (Bug Detection Rate)

Rule-Based          ████████████████████████████████  60%
Neural (Phase 3)    ████████████████████████████████████████████  72%
                    │
                    └─── 20% improvement

Manual Test Reduction

Without Neural      ████████████████████████████████████████████████  100%
With Neural         ████████████████████████████████  65%
                    │
                    └─── 35% reduction in manual effort
```

---

## 6. Deployment Architecture

### 6.1 Single Host Deployment

```
┌─────────────────────────────────────────────────────────────────────┐
│                        localhost / 127.0.0.1                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Fleet Manager                            │  │
│  │                    Port: 3000 (HTTP)                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                 │                                  │
│         ┌───────────────────────┼───────────────────────┐         │
│         │                       │                       │         │
│         ▼                       ▼                       ▼         │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │  Agent A     │      │  Agent B     │      │  Agent C     │   │
│  │  QUIC: 4433  │◄────►│  QUIC: 4434  │◄────►│  QUIC: 4435  │   │
│  │  HTTP: 8001  │      │  HTTP: 8002  │      │  HTTP: 8003  │   │
│  └──────────────┘      └──────────────┘      └──────────────┘   │
│         │                       │                       │         │
│         └───────────────────────┼───────────────────────┘         │
│                                 ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              SwarmMemoryManager (SQLite)                    │  │
│  │              ./fleet.db                                     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Multi-Host Deployment

```
┌─────────────────────────────┐       ┌─────────────────────────────┐
│      Host A (10.0.1.10)     │       │      Host B (10.0.1.11)     │
│                             │       │                             │
│  ┌───────────────────────┐  │       │  ┌───────────────────────┐  │
│  │  Agent A1             │  │       │  │  Agent B1             │  │
│  │  QUIC: 10.0.1.10:4433 │◄─┼───────┼─►│  QUIC: 10.0.1.11:4433 │  │
│  └───────────────────────┘  │       │  └───────────────────────┘  │
│                             │       │                             │
│  ┌───────────────────────┐  │       │  ┌───────────────────────┐  │
│  │  Agent A2             │  │       │  │  Agent B2             │  │
│  │  QUIC: 10.0.1.10:4434 │◄─┼───────┼─►│  QUIC: 10.0.1.11:4434 │  │
│  └───────────────────────┘  │       │  └───────────────────────┘  │
│            │                 │       │            │                 │
└────────────┼─────────────────┘       └────────────┼─────────────────┘
             │                                      │
             │        ┌─────────────────────┐       │
             └───────►│  Shared Database    │◄──────┘
                      │  PostgreSQL/SQLite  │
                      │  10.0.1.100:5432    │
                      └─────────────────────┘
```

---

## 7. Security Architecture

### 7.1 QUIC TLS 1.3 Security

```
┌────────────────────────────────────────────────────────────────────┐
│                      QUIC Security Layers                          │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  Application Layer                           │ │
│  │  - AgentMessage serialization                                │ │
│  │  - JSON encoding                                             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                               │                                    │
│                               ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  QUIC Stream Layer                           │ │
│  │  - Stream multiplexing                                       │ │
│  │  - Flow control                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                               │                                    │
│                               ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  TLS 1.3 Encryption                          │ │
│  │  - ChaCha20-Poly1305 or AES-256-GCM                          │ │
│  │  - Forward secrecy (ephemeral keys)                          │ │
│  │  - Certificate validation                                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                               │                                    │
│                               ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  QUIC Connection Layer                       │ │
│  │  - Connection ID (prevents spoofing)                         │ │
│  │  - Replay protection                                         │ │
│  │  - Path validation                                           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                               │                                    │
│                               ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  UDP Transport                               │ │
│  │  - Packet framing                                            │ │
│  │  - Loss detection and recovery                               │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 7.2 Certificate Management

```
┌─────────────────────────────────────────────────────────────────┐
│                  Certificate Hierarchy                          │
│                                                                 │
│                    ┌────────────────┐                           │
│                    │  Root CA       │                           │
│                    │  (Self-signed) │                           │
│                    └────────┬───────┘                           │
│                             │                                    │
│            ┌────────────────┼────────────────┐                  │
│            │                │                │                  │
│            ▼                ▼                ▼                  │
│     ┌──────────┐     ┌──────────┐     ┌──────────┐            │
│     │ Agent A  │     │ Agent B  │     │ Agent C  │            │
│     │   Cert   │     │   Cert   │     │   Cert   │            │
│     └──────────┘     └──────────┘     └──────────┘            │
│                                                                 │
│  Certificate Contents:                                         │
│  - Common Name (CN): agent-{id}                                │
│  - Organization (O): AQE Fleet                                 │
│  - Validity: 1 year                                            │
│  - Key Usage: Digital Signature, Key Encipherment             │
│  - Extended Key Usage: TLS Server Authentication               │
│  - Subject Alternative Name: DNS:agent-{id}.local              │
│                                                                 │
│  Storage:                                                       │
│  - Private key: ./certs/agent-{id}.key (chmod 600)             │
│  - Certificate: ./certs/agent-{id}.crt                         │
│  - CA cert: ./certs/ca.crt                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary

This document provides comprehensive architectural diagrams for Phase 3 features:

1. **QUIC Transport**: Connection flows, peer discovery, circuit breaker, fallback handling
2. **Neural Training**: Training pipeline, inference flow, online learning
3. **Agent Integration**: BaseAgent enhancements, feature opt-in, graceful degradation
4. **Performance**: Latency/accuracy comparisons, deployment architectures
5. **Security**: TLS 1.3 layers, certificate management

All diagrams support the detailed architecture specification in `phase3-architecture.md`.
