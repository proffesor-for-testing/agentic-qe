/**
 * QE Agents Demo
 * Demonstrates usage of the new QE agent implementations
 */

import { QEMemory } from '../memory/QEMemory';
import { HookManager } from '../hooks';
import {
  registerQEAgents,
  createQEAgent,
  getDefaultQEAgentConfig,
  getQEAgentTypes
} from '../agents/factories/QEAgentFactories';
import { AgentContext } from '../agents/base/QEAgent';

/**
 * Demo function showcasing QE agents
 */
export async function demonstrateQEAgents(): Promise<void> {
  console.log('🚀 QE Agents Demo Starting...\n');

  // Initialize dependencies
  const memory = new QEMemory();
  const hooks = new HookManager();

  // Register all QE agents
  registerQEAgents();
  console.log('✅ QE agents registered\n');

  // List available QE agent types
  const qeAgentTypes = getQEAgentTypes();
  console.log('📋 Available QE Agent Types:');
  qeAgentTypes.forEach(type => console.log(`  - ${type}`));
  console.log();

  // Create sample execution context
  const context: AgentContext = {
    sessionId: 'demo-session-001',
    testSuiteId: 'demo-test-suite',
    testCaseId: 'demo-test-case',
    environment: 'demo',
    configuration: {
      baseUrl: 'https://demo-app.example.com',
      timeout: 30000
    },
    startTime: new Date(),
    metadata: {
      demo: true,
      version: '1.0.0'
    }
  };

  // Demonstrate each QE agent
  for (const agentType of qeAgentTypes) {
    console.log(`🤖 Demonstrating ${agentType}:`);

    try {
      // Create agent with default configuration
      const agent = createQEAgent(agentType, memory, hooks, {
        name: `demo-${agentType}`,
        priority: 5
      });

      console.log(`  ✨ Created agent: ${agent.name}`);
      console.log(`  🏷️  Type: ${agent.type}`);
      console.log(`  🛠️  Capabilities: ${agent.capabilities.join(', ')}`);

      // Execute the agent
      const result = await agent.execute(context);

      if (result.success) {
        console.log(`  ✅ Execution successful: ${result.message}`);
        console.log(`  📊 Metrics: ${JSON.stringify(result.metrics, null, 2)}`);
        console.log(`  📁 Artifacts: ${result.artifacts.join(', ')}`);
      } else {
        console.log(`  ❌ Execution failed: ${result.error?.message}`);
      }

      // Check agent health
      const health = agent.getHealth();
      console.log(`  💓 Health: State=${health.state}, Uptime=${health.uptime}ms`);

      // Clean up
      await agent.destroy();
      console.log(`  🧹 Agent cleaned up\n`);

    } catch (error) {
      console.error(`  💥 Error with ${agentType}:`, error);
      console.log();
    }
  }

  console.log('🎉 QE Agents Demo Complete!');
}

/**
 * Demo function showing agent configuration customization
 */
export async function demonstrateAgentConfiguration(): Promise<void> {
  console.log('⚙️ Agent Configuration Demo\n');

  // Show default configurations for each agent type
  const qeAgentTypes = getQEAgentTypes();

  console.log('📋 Default Agent Configurations:');
  qeAgentTypes.forEach(agentType => {
    const defaultConfig = getDefaultQEAgentConfig(agentType);
    console.log(`\n${agentType}:`);
    console.log(`  - ID: ${defaultConfig.id}`);
    console.log(`  - Priority: ${defaultConfig.priority}`);
    console.log(`  - Timeout: ${defaultConfig.timeout / 1000}s`);
    console.log(`  - Retry Count: ${defaultConfig.retryCount}`);
    console.log(`  - Capabilities: ${defaultConfig.capabilities.join(', ')}`);
  });

  // Demonstrate custom configuration
  console.log('\n🎛️ Custom Configuration Example:');
  const customConfig = getDefaultQEAgentConfig('risk-oracle', {
    name: 'high-priority-risk-oracle',
    priority: 10,
    timeout: 120000, // 2 minutes
    retryCount: 5,
    metadata: {
      team: 'quality-engineering',
      environment: 'production',
      customSetting: 'high-sensitivity'
    }
  });

  console.log('Custom Risk Oracle Configuration:');
  console.log(JSON.stringify(customConfig, null, 2));
}

/**
 * Demo function showing agent capabilities mapping
 */
export async function demonstrateAgentCapabilities(): Promise<void> {
  console.log('\n🛠️ Agent Capabilities Mapping:\n');

  const agentCapabilityMap = {
    'exploratory-testing-navigator': [
      'Session-based test management',
      'RST (Rapid Software Testing) principles',
      'Testing tours (Money, Landmark, Saboteur, etc.)',
      'PROOF methodology reporting',
      'Observation documentation'
    ],
    'risk-oracle': [
      'Predictive risk assessment',
      'Test prioritization based on risk',
      'Failure likelihood prediction',
      'Technical, business, and context risk analysis',
      'Mitigation strategy recommendations'
    ],
    'tdd-pair-programmer': [
      'London and Chicago school TDD support',
      'Test suggestion generation',
      'Missing test case identification',
      'Refactoring recommendations',
      'TDD cycle management'
    ],
    'production-observer': [
      'Continuous production monitoring',
      'Anomaly detection (statistical, ML, rule-based)',
      'Synthetic user journey validation',
      'Test gap identification from incidents',
      'Golden Signals monitoring'
    ],
    'deployment-guardian': [
      'Progressive deployment validation',
      'Smoke test generation',
      'Canary analysis with statistical significance',
      'Automated rollback decisions',
      'Blue-green, canary, rolling deployment support'
    ],
    'requirements-explorer': [
      'SFDIPOT heuristic application',
      'FEW HICCUPPS analysis',
      'Ambiguity detection and resolution',
      'Testability assessment',
      'Risk heatmap generation'
    ]
  };

  Object.entries(agentCapabilityMap).forEach(([agentType, capabilities]) => {
    console.log(`🤖 ${agentType}:`);
    capabilities.forEach(capability => {
      console.log(`  ✨ ${capability}`);
    });
    console.log();
  });
}

/**
 * Main demo runner
 */
export async function runQEAgentsDemo(): Promise<void> {
  try {
    await demonstrateAgentConfiguration();
    await demonstrateAgentCapabilities();
    await demonstrateQEAgents();
  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Run demo if this file is executed directly
if (require.main === module) {
  runQEAgentsDemo().catch(console.error);
}