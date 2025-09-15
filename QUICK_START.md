# Agentic QE - Quick Start Guide (TypeScript)

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/proffesor-for-testing/agentic-qe.git
cd agentic-qe

# Install dependencies
npm install

# Build TypeScript
npm run build
```

## ✅ Verify Installation

Run the test to make sure everything is working:

```bash
# Run verification script
npm run verify

# Or run the test suite
npm test
```

You should see all tests passing with green checkmarks.

## 📖 Basic Usage Examples (TypeScript)

### 1. Analyze Requirements for Quality Issues

```typescript
import {
  RequirementsExplorerAgent,
  DistributedMemorySystem,
  AgentId,
  AgentConfig,
  TaskDefinition,
  PACTLevel
} from './src/agents';
import { EventEmitter } from 'events';

async function analyzeMyRequirements() {
  const logger = console;
  const eventBus = new EventEmitter();
  const memory = new DistributedMemorySystem(logger, eventBus);

  const agentId: AgentId = {
    id: 'req-001',
    swarmId: 'qe',
    type: 'requirements-explorer',
    instance: 1
  };

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
    environment: {
      runtime: 'node',
      version: '18.0.0',
      workingDirectory: '.',
      logLevel: 'info',
      timeout: 5000
    }
  };

  const agent = new RequirementsExplorerAgent(agentId, config, logger, eventBus, memory);
  await agent.initialize();

  const task: TaskDefinition = {
    id: 'task-001',
    type: 'analyze-requirements',
    priority: 'high',
    context: {
      requirements: [
        'The system should respond quickly',
        'Users must be able to login with email and password',
        'The application should be user-friendly',
        'Performance must be adequate for normal load'
      ]
    },
    constraints: {},
    dependencies: [],
    expectedOutcome: 'Requirements analysis',
    metadata: {}
  };

  const result = await agent.executeTask(task);

  console.log('Quality Issues Found:');
  console.log(`Decision: ${result.decision.action}`);
  console.log(`Confidence: ${(result.decision.confidence * 100).toFixed(0)}%`);

  if (result.decision.risks) {
    console.log('Risks identified:', result.decision.risks.length);
  }

  if (result.decision.recommendations) {
    console.log('Recommendations:', result.decision.recommendations);
  }
}

analyzeMyRequirements();
```

### 2. Assess Risk for Code Changes

```typescript
import { RiskOracleAgent } from './src/agents';
import { DistributedMemorySystem } from './src/memory/distributed-memory';
import { EventEmitter } from 'events';

async function assessDeploymentRisk() {
  const logger = console;
  const eventBus = new EventEmitter();
  const memory = new DistributedMemorySystem(logger, eventBus);

  const agent = new RiskOracleAgent(
    { id: 'risk-001', swarmId: 'qe', type: 'risk-oracle', instance: 1 },
    {
      name: 'Risk Oracle',
      type: 'risk-oracle',
      pactLevel: PACTLevel.PROACTIVE,
      capabilities: {
        maxConcurrentTasks: 3,
        supportedTaskTypes: ['risk-assessment'],
        pactLevel: PACTLevel.PROACTIVE,
        rstHeuristics: ['SFDIPOT'],
        contextAwareness: true,
        explainability: true,
        learningEnabled: true,
        securityClearance: 'internal'
      },
      environment: {
        runtime: 'node',
        version: '18.0.0',
        workingDirectory: '.',
        logLevel: 'info',
        timeout: 5000
      }
    },
    logger,
    eventBus,
    memory
  );

  await agent.initialize();

  const task: TaskDefinition = {
    id: 'risk-001',
    type: 'risk-assessment',
    priority: 'high',
    context: {
      changes: {
        linesChanged: 450,
        complexity: 12,
        critical: true,
        previousBugs: 5
      }
    },
    constraints: {},
    dependencies: [],
    expectedOutcome: 'Risk assessment',
    metadata: {}
  };

  const result = await agent.executeTask(task);

  console.log(`Risk Assessment:`);
  console.log(`- Overall Confidence: ${(result.decision.confidence * 100).toFixed(0)}%`);
  console.log(`- Decision: ${result.decision.action}`);

  if (result.decision.risks && result.decision.risks.length > 0) {
    console.log(`- Risks Found: ${result.decision.risks.length}`);
    result.decision.risks.forEach(risk => {
      console.log(`  • ${risk.category}: ${risk.description}`);
    });
  }

  console.log(`- Recommendations:`);
  result.decision.recommendations?.forEach(rec => {
    console.log(`  • ${rec}`);
  });
}

assessDeploymentRisk();
```

### 3. Security Testing with Byzantine Consensus

```typescript
import {
  SecuritySentinelAgent,
  ByzantineCoordinator
} from './src/agents';
import { DistributedMemorySystem } from './src/memory/distributed-memory';
import { EventEmitter } from 'events';

async function runSecurityTesting() {
  const logger = console;
  const eventBus = new EventEmitter();
  const memory = new DistributedMemorySystem(logger, eventBus);

  // Create security agent
  const securityAgent = new SecuritySentinelAgent(
    { id: 'sec-001', swarmId: 'qe', type: 'security-sentinel', instance: 1 },
    {
      name: 'Security Sentinel',
      type: 'security-sentinel',
      pactLevel: PACTLevel.TARGETED,
      capabilities: {
        maxConcurrentTasks: 3,
        supportedTaskTypes: ['security-scan'],
        pactLevel: PACTLevel.TARGETED,
        rstHeuristics: ['SFDIPOT'],
        contextAwareness: true,
        explainability: true,
        learningEnabled: true,
        securityClearance: 'elevated'
      },
      environment: {
        runtime: 'node',
        version: '18.0.0',
        workingDirectory: '.',
        logLevel: 'info',
        timeout: 5000
      }
    },
    logger,
    eventBus,
    memory
  );

  await securityAgent.initialize();

  const task: TaskDefinition = {
    id: 'sec-task-001',
    type: 'security-scan',
    priority: 'critical',
    context: {
      endpoints: ['/api/auth', '/api/payment', '/api/user'],
      authentication: 'OAuth2',
      vulnerabilities: ['SQL Injection', 'XSS', 'CSRF']
    },
    constraints: {},
    dependencies: [],
    expectedOutcome: 'Security vulnerabilities identified',
    metadata: {}
  };

  const result = await securityAgent.executeTask(task);

  console.log('Security Assessment:');
  console.log(`- Decision: ${result.decision.action}`);
  console.log(`- Confidence: ${(result.decision.confidence * 100).toFixed(0)}%`);

  if (result.decision.risks && result.decision.risks.length > 0) {
    console.log('- Security Issues Found:');
    result.decision.risks.forEach(risk => {
      console.log(`  • [${risk.severity}] ${risk.description}`);
      if (risk.mitigation) {
        console.log(`    Mitigation: ${risk.mitigation}`);
      }
    });
  }
}

runSecurityTesting();
```

### 4. SPARC Workflow Implementation

```typescript
import {
  SPARCCoordinatorAgent,
  SpecificationAgent,
  PseudocodeAgent,
  ArchitectureAgent,
  RefinementAgent,
  SPARCCoderAgent
} from './src/agents';
import { DistributedMemorySystem } from './src/memory/distributed-memory';
import { EventEmitter } from 'events';

async function runSPARCWorkflow() {
  const logger = console;
  const eventBus = new EventEmitter();
  const memory = new DistributedMemorySystem(logger, eventBus);

  // Create SPARC agents
  const coordinator = new SPARCCoordinatorAgent(/* config */);
  const specification = new SpecificationAgent(/* config */);
  const pseudocode = new PseudocodeAgent(/* config */);
  const architecture = new ArchitectureAgent(/* config */);
  const refinement = new RefinementAgent(/* config */);
  const coder = new SPARCCoderAgent(/* config */);

  // Initialize all agents
  await Promise.all([
    coordinator.initialize(),
    specification.initialize(),
    pseudocode.initialize(),
    architecture.initialize(),
    refinement.initialize(),
    coder.initialize()
  ]);

  // Execute SPARC phases
  console.log('Starting SPARC Workflow...\n');

  // Phase 1: Specification
  const specResult = await specification.executeTask({
    id: 'spec-001',
    type: 'analyze-requirements',
    priority: 'high',
    context: {
      requirements: ['Build a user authentication system']
    },
    constraints: {},
    dependencies: [],
    expectedOutcome: 'Formal specification',
    metadata: {}
  });

  console.log('✓ Specification phase complete');

  // Phase 2: Pseudocode
  const pseudoResult = await pseudocode.executeTask({
    id: 'pseudo-001',
    type: 'generate-pseudocode',
    priority: 'high',
    context: { specification: specResult },
    constraints: {},
    dependencies: [],
    expectedOutcome: 'Algorithm design',
    metadata: {}
  });

  console.log('✓ Pseudocode phase complete');

  // Continue with remaining phases...
}

runSPARCWorkflow();
```

### 5. Multi-Agent Swarm Coordination

```typescript
import {
  HierarchicalCoordinatorAgent,
  MeshCoordinatorAgent,
  AdaptiveCoordinatorAgent
} from './src/agents';
import { DistributedMemorySystem } from './src/memory/distributed-memory';
import { EventEmitter } from 'events';

async function orchestrateSwarm() {
  const logger = console;
  const eventBus = new EventEmitter();
  const memory = new DistributedMemorySystem(logger, eventBus);

  // Create different coordinator types
  const hierarchical = new HierarchicalCoordinatorAgent(/* config */);
  const mesh = new MeshCoordinatorAgent(/* config */);
  const adaptive = new AdaptiveCoordinatorAgent(/* config */);

  // Initialize coordinators
  await Promise.all([
    hierarchical.initialize(),
    mesh.initialize(),
    adaptive.initialize()
  ]);

  // Run different coordination patterns
  console.log('Testing different swarm topologies:\n');

  // Hierarchical (Queen-led)
  const hierResult = await hierarchical.executeTask({
    id: 'hier-001',
    type: 'coordinate-swarm',
    priority: 'high',
    context: {
      topology: 'hierarchical',
      agents: ['worker1', 'worker2', 'worker3'],
      task: 'Distributed testing'
    },
    constraints: {},
    dependencies: [],
    expectedOutcome: 'Coordinated test execution',
    metadata: {}
  });

  console.log('✓ Hierarchical coordination complete');
  console.log(`  Confidence: ${(hierResult.decision.confidence * 100).toFixed(0)}%`);

  // Mesh (Peer-to-peer)
  const meshResult = await mesh.executeTask({
    id: 'mesh-001',
    type: 'coordinate-swarm',
    priority: 'high',
    context: {
      topology: 'mesh',
      agents: ['peer1', 'peer2', 'peer3'],
      task: 'Collaborative analysis'
    },
    constraints: {},
    dependencies: [],
    expectedOutcome: 'Peer coordination',
    metadata: {}
  });

  console.log('✓ Mesh coordination complete');
  console.log(`  Confidence: ${(meshResult.decision.confidence * 100).toFixed(0)}%`);

  // Adaptive (Self-optimizing)
  const adaptiveResult = await adaptive.executeTask({
    id: 'adaptive-001',
    type: 'coordinate-swarm',
    priority: 'high',
    context: {
      topology: 'adaptive',
      agents: ['agent1', 'agent2', 'agent3'],
      task: 'Dynamic optimization'
    },
    constraints: {},
    dependencies: [],
    expectedOutcome: 'Optimized coordination',
    metadata: {}
  });

  console.log('✓ Adaptive coordination complete');
  console.log(`  Confidence: ${(adaptiveResult.decision.confidence * 100).toFixed(0)}%`);
}

orchestrateSwarm();
```

## 🔧 Advanced Usage

### GitHub Integration

```typescript
import {
  GitHubModesAgent,
  PRManagerAgent,
  CodeReviewSwarmAgent,
  IssueTrackerAgent
} from './src/agents';

async function automateGitHubWorkflow() {
  // Create GitHub automation agents
  const githubModes = new GitHubModesAgent(/* config */);
  const prManager = new PRManagerAgent(/* config */);
  const codeReview = new CodeReviewSwarmAgent(/* config */);
  const issueTracker = new IssueTrackerAgent(/* config */);

  // Initialize agents
  await Promise.all([
    githubModes.initialize(),
    prManager.initialize(),
    codeReview.initialize(),
    issueTracker.initialize()
  ]);

  // Manage pull request
  const prResult = await prManager.executeTask({
    id: 'pr-001',
    type: 'manage-pr',
    priority: 'high',
    context: {
      repository: 'owner/repo',
      prNumber: 123,
      action: 'review'
    },
    constraints: {},
    dependencies: [],
    expectedOutcome: 'PR reviewed and managed',
    metadata: {}
  });

  console.log('PR Management Result:', prResult.decision.action);
}
```

### Production Monitoring

```typescript
import {
  ProductionObserverAgent,
  DeploymentGuardianAgent
} from './src/agents';

async function monitorProduction() {
  const observer = new ProductionObserverAgent(/* config */);
  const guardian = new DeploymentGuardianAgent(/* config */);

  await observer.initialize();
  await guardian.initialize();

  // Monitor production metrics
  const metrics = await observer.executeTask({
    id: 'prod-001',
    type: 'monitor-production',
    priority: 'high',
    context: {
      metrics: {
        errorRate: 0.08,
        latencyP99: 1500,
        traffic: 2000,
        saturation: 0.85
      }
    },
    constraints: {},
    dependencies: [],
    expectedOutcome: 'Production health assessment',
    metadata: {}
  });

  if (metrics.decision.risks && metrics.decision.risks.length > 0) {
    console.log('⚠️ Production Issues Detected:');
    metrics.decision.risks.forEach(risk => {
      console.log(`  • [${risk.severity}] ${risk.description}`);
    });
  }
}
```

## 📚 Available Agents (40+ TypeScript Implementations)

### Core QE Agents
- `RequirementsExplorerAgent` - Requirements analysis
- `RiskOracleAgent` - Risk prediction and assessment
- `SecuritySentinelAgent` - Security testing
- `PerformanceHunterAgent` - Performance testing
- `ExploratoryNavigatorAgent` - Exploratory testing

### Swarm Coordination
- `AdaptiveCoordinatorAgent` - Self-optimizing swarms
- `HierarchicalCoordinatorAgent` - Queen-led coordination
- `MeshCoordinatorAgent` - Peer-to-peer networks
- `CollectiveIntelligenceCoordinatorAgent` - Emergent intelligence

### Consensus Protocols
- `ByzantineCoordinator` - Byzantine fault tolerance
- `RaftManager` - Raft consensus
- `GossipCoordinator` - Gossip protocols
- `QuorumManager` - Quorum voting
- `CRDTSynchronizer` - Conflict-free replicated data types

### SPARC Methodology
- `SPARCCoordinatorAgent` - Workflow orchestration
- `SpecificationAgent` - Requirements formalization
- `PseudocodeAgent` - Algorithm design
- `ArchitectureAgent` - System design
- `RefinementAgent` - Iterative improvement
- `SPARCCoderAgent` - TDD implementation

### Testing & Quality
- `TDDPairProgrammerAgent` - Test-driven development
- `MutationTestingSwarmAgent` - Mutation testing
- `FunctionalStatefulAgent` - Functional testing
- `SpecLinterAgent` - Specification validation
- `QualityStorytellerAgent` - Quality narratives
- `DesignChallengerAgent` - Design validation
- `PatternRecognitionSageAgent` - Pattern detection
- `ResilienceChallengerAgent` - Chaos engineering

### GitHub & Deployment
- `GitHubModesAgent` - GitHub integration
- `PRManagerAgent` - Pull request management
- `CodeReviewSwarmAgent` - Code review automation
- `IssueTrackerAgent` - Issue management
- `ReleaseManagerAgent` - Release coordination
- `WorkflowAutomationAgent` - CI/CD automation
- `DeploymentGuardianAgent` - Safe deployments
- `ProductionObserverAgent` - Production monitoring

### Context & Security
- `ContextOrchestrator` - Context management
- `SwarmMemoryManager` - Memory coordination
- `SecurityInjection` - Security testing

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

# Build TypeScript
npm run build

# Verify all agents
npm run verify
```

## 🔒 Security Features

All agents include built-in security:
- Prompt injection protection
- Output sanitization
- Rate limiting
- Permission controls
- Audit logging
- Byzantine fault tolerance

## 📖 Next Steps

1. Explore the [full documentation](README.md)
2. Check out [TypeScript examples](examples/)
3. Read about [security architecture](docs/SECURITY.md)
4. Learn about [agent development](docs/agent-development.md)

## 💡 Tips

- Use TypeScript for type safety and better IDE support
- Start with requirements analysis to catch issues early
- Use risk assessment before deployments
- Run exploratory sessions regularly
- Monitor production continuously
- Review security reports periodically

## 🆘 Need Help?

- Check the [README](README.md) for comprehensive documentation
- Look at [examples](examples/) for more use cases
- Report issues on [GitHub](https://github.com/proffesor-for-testing/agentic-qe/issues)

---

Happy Testing with TypeScript! 🚀