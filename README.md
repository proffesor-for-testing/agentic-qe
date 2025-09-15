# Agentic QE Framework

[![Version](https://img.shields.io/npm/v/agentic-qe)](https://www.npmjs.com/package/agentic-qe)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Security](https://img.shields.io/badge/security-OWASP%20compliant-green)](docs/SECURITY.md)

A **TypeScript-based** multi-agent Quality Engineering framework built on claude-flow, providing autonomous testing and quality assurance capabilities with 40+ specialized agents.

## 🚀 Key Features

- **🎯 40+ TypeScript Agents** - Complete type-safe implementation
- **🧠 Distributed Memory System** - Shared knowledge and collaboration
- **💡 Explainable AI** - Full decision transparency with reasoning traces
- **📐 SPARC Methodology** - Systematic development with TDD practices
- **🤝 Consensus Protocols** - Byzantine, Raft, Gossip, CRDT support
- **🔗 GitHub Integration** - PR management, issue tracking, CI/CD automation
- **🛡️ Security-First** - OWASP compliance and security best practices
- **🎨 PACT Framework** - Proactive, Autonomous, Collaborative, Targeted

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/proffesor-for-testing/agentic-qe.git
cd agentic-qe

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

## 🏗️ Architecture

### Technology Stack
- **Language**: TypeScript 5.0+
- **Runtime**: Node.js 18+
- **Framework**: Built on claude-flow
- **Testing**: Jest with TypeScript support
- **Type Safety**: Strict TypeScript configuration

### Core Components

```typescript
// Type-safe agent implementation
import {
  RequirementsExplorerAgent,
  RiskOracleAgent,
  DistributedMemorySystem
} from './src/agents';
```

## 🤖 Agent Catalog (40+ Agents)

### Core QE Agents
| Agent | Purpose | Key Features |
|-------|---------|--------------|
| `RequirementsExplorerAgent` | Requirements analysis | Ambiguity detection, testability assessment |
| `RiskOracleAgent` | Risk prediction | ML-based risk assessment, prioritization |
| `SecuritySentinelAgent` | Security testing | OWASP compliance, vulnerability detection |
| `PerformanceHunterAgent` | Performance testing | Bottleneck identification, optimization |
| `ExploratoryNavigatorAgent` | Exploratory testing | Unknown unknown discovery |

### Swarm Coordination Agents
| Agent | Purpose | Topology |
|-------|---------|----------|
| `AdaptiveCoordinatorAgent` | Dynamic topology | Self-optimizing |
| `HierarchicalCoordinatorAgent` | Queen-led swarm | Tree structure |
| `MeshCoordinatorAgent` | P2P coordination | Mesh network |
| `CollectiveIntelligenceCoordinatorAgent` | Emergent intelligence | Collective |

### Consensus & Distributed Systems
| Agent | Consensus Type | Use Case |
|-------|---------------|----------|
| `ByzantineCoordinatorAgent` | Byzantine fault tolerance | Untrusted networks |
| `RaftManagerAgent` | Raft consensus | Leader election |
| `GossipCoordinatorAgent` | Gossip protocol | Eventually consistent |
| `QuorumManagerAgent` | Quorum voting | Distributed decisions |
| `CRDTSynchronizerAgent` | CRDT | Conflict-free sync |

### SPARC Methodology Agents
| Agent | SPARC Phase | Responsibility |
|-------|-------------|----------------|
| `SPARCCoordinatorAgent` | Orchestration | Workflow management |
| `SpecificationAgent` | Specification | Requirements formalization |
| `PseudocodeAgent` | Pseudocode | Algorithm design |
| `ArchitectureAgent` | Architecture | System design |
| `RefinementAgent` | Refinement | Iterative improvement |
| `SPARCCoderAgent` | Implementation | TDD coding |

### Testing & Quality Agents
- `TDDPairProgrammerAgent` - Test-first development
- `MutationTestingSwarmAgent` - Mutation testing
- `FunctionalStatefulAgent` - Functional testing
- `SpecLinterAgent` - Specification validation
- `QualityStorytellerAgent` - Quality narratives
- `DesignChallengerAgent` - Design validation
- `PatternRecognitionSageAgent` - Pattern detection
- `ResilienceChallengerAgent` - Chaos engineering

### GitHub & Deployment Agents
- `GitHubModesAgent` - GitHub integration
- `PRManagerAgent` - Pull request management
- `CodeReviewSwarmAgent` - Code review automation
- `IssueTrackerAgent` - Issue management
- `ReleaseManagerAgent` - Release coordination
- `WorkflowAutomationAgent` - CI/CD automation
- `DeploymentGuardianAgent` - Safe deployments
- `ProductionObserverAgent` - Production monitoring

### Context & Security Agents
- `ContextOrchestratorAgent` - Context management
- `SwarmMemoryManagerAgent` - Memory coordination
- `SecurityInjectionAgent` - Security testing

## 💻 Usage Examples

### Basic Agent Usage (TypeScript)

```typescript
import {
  RequirementsExplorerAgent,
  DistributedMemorySystem,
  AgentId,
  AgentConfig,
  TaskDefinition,
  PACTLevel
} from 'agentic-qe';
import { EventEmitter } from 'events';

// Setup
const logger = console;
const eventBus = new EventEmitter();
const memory = new DistributedMemorySystem(logger, eventBus);

// Agent configuration
const config: AgentConfig = {
  name: 'Requirements Explorer',
  type: 'requirements-explorer',
  pactLevel: PACTLevel.COLLABORATIVE,
  capabilities: {
    maxConcurrentTasks: 3,
    supportedTaskTypes: ['analyze-requirements'],
    pactLevel: PACTLevel.COLLABORATIVE,
    rstHeuristics: ['SFDIPOT', 'FEW_HICCUPPS'],
    contextAwareness: true,
    explainability: true,
    learningEnabled: true,
    securityClearance: 'internal'
  },
  // ... other config
};

// Create agent
const agent = new RequirementsExplorerAgent(
  { id: 'req-001', swarmId: 'qe', type: 'requirements-explorer', instance: 1 },
  config,
  logger,
  eventBus,
  memory
);

// Execute task
const result = await agent.executeTask({
  id: 'task-001',
  type: 'analyze-requirements',
  priority: 'high',
  context: {
    requirements: [
      'User must be able to login',
      'System should handle 10000 concurrent users'
    ]
  },
  constraints: {},
  dependencies: [],
  expectedOutcome: 'Requirements analysis',
  metadata: {}
});
```

### Multi-Agent Collaboration

```typescript
import {
  SPARCCoordinatorAgent,
  RiskOracleAgent,
  SecuritySentinelAgent,
  PerformanceHunterAgent
} from 'agentic-qe';

// Shared memory for collaboration
const sharedMemory = new DistributedMemorySystem(logger, eventBus);

// Create agent swarm
const agents = {
  coordinator: new SPARCCoordinatorAgent(/*...*/),
  risk: new RiskOracleAgent(/*...*/),
  security: new SecuritySentinelAgent(/*...*/),
  performance: new PerformanceHunterAgent(/*...*/),
};

// Initialize all agents
await Promise.all(
  Object.values(agents).map(agent => agent.initialize())
);

// Execute parallel quality assessment
const results = await Promise.all([
  agents.risk.executeTask(task),
  agents.security.executeTask(task),
  agents.performance.executeTask(task)
]);

// Coordinator aggregates results
const assessment = await agents.coordinator.executeTask({
  type: 'aggregate-assessment',
  context: { results }
});
```

### Consensus-Based Testing

```typescript
import {
  ByzantineCoordinatorAgent,
  QuorumManagerAgent
} from 'agentic-qe';

// Setup Byzantine fault-tolerant testing
const byzantine = new ByzantineCoordinatorAgent(/*...*/);
const quorum = new QuorumManagerAgent(/*...*/);

// Execute with Byzantine consensus
const consensusResult = await byzantine.executeTask({
  type: 'consensus-coordination',
  context: {
    nodes: ['agent1', 'agent2', 'agent3', 'agent4'],
    faultTolerance: 1, // Tolerate 1 Byzantine node
    decision: 'approve-deployment'
  }
});
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=agents

# Run with coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint

# Build
npm run build
```

## 📊 Key Concepts

### PACT Framework Levels

```typescript
enum PACTLevel {
  PROACTIVE = 'proactive',      // Anticipates issues
  AUTONOMOUS = 'autonomous',     // Independent decisions
  COLLABORATIVE = 'collaborative', // Team coordination
  TARGETED = 'targeted'          // Focused objectives
}
```

### RST Heuristics

The framework implements Rapid Software Testing heuristics:

- **SFDIPOT**: Structure, Function, Data, Interfaces, Platform, Operations, Time
- **FEW HICCUPPS**: Testing wisdom mnemonic
- **CRUSSPIC**: Coverage model
- **RCRCRC**: Risk-based testing

### Explainable AI Structure

```typescript
interface AgentDecision {
  id: string;
  action: string;
  reasoning: {
    factors: ReasoningFactor[];
    evidence: Evidence[];
    heuristics: string[];
  };
  confidence: number;
  alternatives: Alternative[];
  risks: Risk[];
  recommendations: string[];
}
```

## 🔧 Configuration

```typescript
const agentConfig: AgentConfig = {
  name: string;
  type: AgentType;
  pactLevel: PACTLevel;
  capabilities: {
    maxConcurrentTasks: number;
    supportedTaskTypes: TaskType[];
    rstHeuristics: string[];
    contextAwareness: boolean;
    explainability: boolean;
    learningEnabled: boolean;
  };
  environment: {
    runtime: string;
    version: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    timeout: number;
  };
  learning: {
    enabled: boolean;
    strategy: 'reinforcement' | 'supervised' | 'unsupervised';
    learningRate: number;
  };
  security: {
    enablePromptInjectionProtection: boolean;
    enableOutputSanitization: boolean;
    enableAuditLogging: boolean;
    rateLimiting: {
      requests: number;
      window: number;
    };
  };
};
```

## 📁 Project Structure

```
agentic-qe/
├── src/
│   ├── agents/                 # 40+ TypeScript agent implementations
│   │   ├── base-agent.ts       # Base agent class
│   │   ├── requirements-explorer.ts
│   │   ├── risk-oracle.ts
│   │   ├── security-sentinel.ts
│   │   └── ... (40+ agents)
│   ├── core/
│   │   └── types.ts            # TypeScript type definitions
│   ├── memory/
│   │   └── distributed-memory.ts # Shared memory system
│   ├── integrations/
│   │   └── github-api.ts       # GitHub integration
│   └── security/
│       └── github-security.ts  # Security features
├── examples/
│   ├── typescript-agents.ts    # TypeScript examples
│   └── multi-agent-collaboration.ts
├── docs/
│   ├── LOCAL_TESTING_GUIDE.md
│   └── API.md
├── tests/
│   └── agents/
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Advanced Features

### Distributed Memory System
- **Partitioned Storage**: Separate memory spaces by domain
- **Vector Clocks**: Conflict resolution in distributed systems
- **Caching Layer**: High-performance memory access
- **Replication**: Fault-tolerant memory storage

### Consensus Protocols
- **Byzantine Fault Tolerance**: 3f+1 node resilience
- **Raft Leadership**: Strong consistency guarantees
- **Gossip Protocol**: Eventually consistent dissemination
- **CRDT**: Automatic conflict resolution

### Event-Driven Architecture
- **Real-time Coordination**: Event bus for agent communication
- **Publish-Subscribe**: Decoupled agent interactions
- **Event Replay**: Debugging and audit capabilities

## 📚 Documentation

- [API Documentation](docs/API.md)
- [Local Testing Guide](docs/LOCAL_TESTING_GUIDE.md)
- [Agent Specifications](docs/agentic-qe-fleet-instructions.md)
- [Security Guidelines](docs/AI%20&%20Agentic%20Security%20Best%20Practices.md)

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built on top of the [claude-flow](https://github.com/ruvnet/claude-flow) framework.

## 🔒 Security

For security issues, please email security@agentic-qe.dev instead of using the issue tracker.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)
- **Discussions**: [GitHub Discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)
- **Email**: support@agentic-qe.dev