# RuVector Robotics Crates Research

## Crates Covered
1. ruvector-robotics - Cognitive robotics (behavior trees, 3-tier memory, A*, swarm)
2. agentic-robotics-core - ROS2-alternative middleware (540ns pub/sub, Zenoh)
3. agentic-robotics-embedded - no_std embedded support (RTIC, Embassy)
4. agentic-robotics-mcp - MCP server for AI-controlled robotics
5. agentic-robotics-node - NAPI-RS Node.js bindings
6. agentic-robotics-rt - Dual-runtime priority executor with HDR latency tracking
7. agentic-robotics-benchmarks - Criterion benchmarks

## Key Findings

### ruvector-robotics
- **Cognitive Core**: Perceive-think-act-learn loop with dual-process theory (Reactive/Deliberative/Emergency)
- **Behavior Trees**: Sequence, Selector, Parallel with threshold, Decorators (Inverter/Repeat/UntilFail/Timeout)
- **Three-tier Memory**: Working (importance-based eviction), Episodic (similarity recall), Semantic (embedding storage)
- **Decision Engine**: Multi-criteria utility = reward - risk*aversion - energy*weight + curiosity*novelty
- **Skill Learning**: Learning-from-demonstration via trajectory averaging
- **Swarm Intelligence**: Formation computation, capability-based task assignment, majority consensus
- **Planning**: A* grid search with octile heuristic, potential field planner
- **15 MCP tools** across 6 categories (Perception, Navigation, Cognition, Swarm, Memory, Planning)

### agentic-robotics-core
- 540ns serialization, 30ns channel messaging, 1.8M msg/sec
- 4-byte wire overhead (vs ROS2's 24-byte)
- Zenoh middleware for peer-to-peer discovery
- CDR (ROS2-compatible) + rkyv (zero-copy) + JSON serialization

### agentic-robotics-rt
- Dual Tokio runtime: high-priority (2 threads) + low-priority (4 threads)
- Deadline-based routing: <1ms = high priority runtime
- HDR histogram latency tracking (p50/p90/p99/p99.9)

## AQE Integration Opportunities
1. **Behavior trees for agent orchestration**: Sequence/Selector/Parallel maps directly to test strategies
2. **Cognitive perceive-think-act-learn loop**: Adaptive QE with attention threshold adjustment
3. **Three-tier memory**: Working (current test), Episodic (history replay), Semantic (patterns)
4. **Multi-criteria decision engine**: Intelligent test prioritization (reward, risk, energy, curiosity)
5. **Priority-based execution**: Critical tests on high-priority runtime, exploratory on low
6. **MCP server pattern**: Template for exposing AQE capabilities to AI assistants
