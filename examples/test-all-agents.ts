/**
 * Test All Agents - Comprehensive test to verify all agents are working
 */

import { AgenticQE } from '../src/index';
import {
  BaseAgent,
  RequirementsExplorerAgent,
  DesignChallengerAgent,
  SpecLinterAgent,
  TDDPairProgrammerAgent,
  ExploratoryNavigatorAgent,
  FunctionalStatefulAgent,
  SecurityInjectionAgent,
  SecuritySentinelAgent,
  PerformanceHunterAgent,
  DeploymentGuardianAgent,
  RiskOracleAgent,
  ProductionObserverAgent,
  MutationTestingSwarmAgent,
  PatternRecognitionSageAgent,
  QualityStorytellerAgent,
  ResilienceChallengerAgent
} from '../src/agents';
import {
  AgentType,
  SecurityReport,
  ExploratoryTestingSession,
  RequirementsAnalysis,
  RiskAssessment,
  TDDSuggestions,
  DeploymentValidation,
  ProductionMonitoring,
  AgentConfig
} from '../src/core/types';
import chalk from 'chalk';

interface TestResults {
  passed: string[];
  failed: Array<{ name: string; error: string }>;
  skipped: string[];
}

interface TestMetrics {
  cpuUsage: number;
  memoryUsage: number;
  responseTime: number;
}

interface TestChanges {
  linesChanged: number;
  complexity: number;
  critical: boolean;
  previousBugs: number;
}

interface TestDeployment {
  version: string;
  environment: string;
  strategy?: string;
  changes?: string[];
}

interface TestProductionMetrics {
  errorRate: number;
  latencyP99: number;
  traffic: number;
  saturation: number;
}

async function testAllAgents(): Promise<boolean> {
  console.log(chalk.blue.bold('\n🤖 Testing Agentic QE Framework - All Agents\n'));
  console.log(chalk.gray('=' .repeat(60)));

  const aqe = new AgenticQE({
    security: {
      enablePromptInjectionProtection: true,
      enableAuditLogging: true,
      rateLimiting: { requests: 1000, window: 60000 }
    }
  });

  const results: TestResults = {
    passed: [],
    failed: [],
    skipped: []
  };

  // Test helper function
  async function testAgent(name: string, testFn: () => Promise<void>): Promise<boolean> {
    process.stdout.write(chalk.yellow(`Testing ${name}...`));
    try {
      await testFn();
      results.passed.push(name);
      console.log(chalk.green(' ✓ PASSED'));
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.failed.push({ name, error: errorMessage });
      console.log(chalk.red(' ✗ FAILED'));
      console.log(chalk.red(`  Error: ${errorMessage}`));
      return false;
    }
  }

  // 1. Test Context Orchestrator
  await testAgent('Context Orchestrator', async () => {
    const orchestrator = aqe.createAgent('context-orchestrator' as AgentType);
    const observation = await orchestrator.perceive({
      techStack: ['Node.js', 'React'],
      teamSize: 5,
      riskLevel: 'medium'
    });
    const decision = await orchestrator.decide(observation);
    if (!decision.strategy) throw new Error('No strategy selected');
  });

  // 2. Test Requirements Explorer
  await testAgent('Requirements Explorer', async () => {
    const analysis: RequirementsAnalysis = await aqe.analyzeRequirements([
      'The system should respond quickly',
      'Users must login with email and password'
    ]);
    if (!analysis.ambiguities) throw new Error('No ambiguity analysis');
    if (!analysis.risks) throw new Error('No risk analysis');
  });

  // 3. Test Design Challenger
  await testAgent('Design Challenger', async () => {
    const challenger = aqe.createAgent('design-challenger' as AgentType);
    const observation = await challenger.perceive({
      architecture: 'microservices',
      components: ['auth', 'payment', 'inventory']
    });
    if (!observation) throw new Error('Failed to perceive design');
  });

  // 4. Test Spec Linter
  await testAgent('Spec Linter', async () => {
    const linter = aqe.createAgent('spec-linter' as AgentType);
    const analysis = await linter.perceive({
      specification: {
        paths: { '/api/users': {} },
        components: { schemas: {} }
      }
    });
    if (analysis.qualityScore === undefined) throw new Error('No quality score');
  });

  // 5. Test TDD Pair Programmer
  await testAgent('TDD Pair Programmer', async () => {
    const tests: TDDSuggestions = await aqe.suggestTests('function add(a: number, b: number): number { return a + b; }');
    if (!tests.nextTest) throw new Error('No test suggestion');
  });

  // 6. Test Exploratory Testing Navigator
  await testAgent('Exploratory Testing Navigator', async () => {
    const session: ExploratoryTestingSession = await aqe.runExploratorySession({
      charter: 'Explore login flow',
      timeBox: 30,
      tour: 'money'
    });
    if (!session.id) throw new Error('No session created');
  });

  // 7. Test Functional Stateful
  await testAgent('Functional Stateful', async () => {
    const stateful = aqe.createAgent('functional-stateful' as AgentType);
    const observation = await stateful.perceive({
      workflow: ['create', 'update', 'delete'],
      resources: ['user', 'profile']
    });
    if (!observation) throw new Error('Failed to model workflow');
  });

  // 8. Test Security Injection
  await testAgent('Security Injection', async () => {
    const injector = aqe.createAgent('security-injection' as AgentType);
    const decision = await injector.decide({
      endpoint: '/api/login',
      method: 'POST'
    });
    if (!decision.payloads || decision.payloads.length === 0) {
      throw new Error('No injection payloads generated');
    }
  });

  // 9. Test Security Sentinel
  await testAgent('Security Sentinel', async () => {
    const sentinel = aqe.createAgent('security-sentinel' as AgentType);
    const scan = await sentinel.perceive({
      endpoints: ['/api/users', '/api/admin'],
      authentication: 'JWT'
    });
    if (scan.vulnerabilities === undefined) throw new Error('No vulnerability scan');
  });

  // 10. Test Performance Hunter
  await testAgent('Performance Hunter', async () => {
    const hunter = aqe.createAgent('performance-hunter' as AgentType);
    const metrics: TestMetrics = {
      cpuUsage: 75,
      memoryUsage: 85,
      responseTime: 500
    };
    const analysis = await hunter.perceive({ metrics });
    if (!analysis.bottlenecks) throw new Error('No bottleneck analysis');
  });

  // 11. Test Deployment Guardian
  await testAgent('Deployment Guardian', async () => {
    const deployment: TestDeployment = {
      version: '2.0.0',
      environment: 'staging'
    };
    const validation: DeploymentValidation = await aqe.validateDeployment(deployment);
    if (!validation.smokeTests) throw new Error('No smoke tests generated');
  });

  // 12. Test Risk Oracle
  await testAgent('Risk Oracle', async () => {
    const changes: TestChanges = {
      linesChanged: 300,
      complexity: 10,
      critical: false,
      previousBugs: 3
    };
    const assessment: RiskAssessment = await aqe.assessRisk(changes);
    if (assessment.overallRisk === undefined) throw new Error('No risk score');
  });

  // 13. Test Production Observer
  await testAgent('Production Observer', async () => {
    const metrics: TestProductionMetrics = {
      errorRate: 0.02,
      latencyP99: 800,
      traffic: 1000,
      saturation: 0.7
    };
    const monitoring: ProductionMonitoring = await aqe.monitorProduction(metrics);
    if (!monitoring.anomalies) throw new Error('No anomaly detection');
  });

  // 14. Test Mutation Testing Swarm
  await testAgent('Mutation Testing Swarm', async () => {
    const swarm = aqe.createAgent('mutation-testing-swarm' as AgentType);
    const decision = await swarm.decide({
      code: 'function multiply(a: number, b: number): number { return a * b; }',
      tests: ['expect(multiply(2, 3)).toBe(6)']
    });
    if (!decision.mutations || decision.mutations.length === 0) {
      throw new Error('No mutations generated');
    }
  });

  // 15. Test Pattern Recognition Sage
  await testAgent('Pattern Recognition Sage', async () => {
    const sage = aqe.createAgent('pattern-recognition-sage' as AgentType);
    const patterns = await sage.perceive({
      historicalData: [
        { type: 'failure', component: 'auth', time: '2024-01-01' },
        { type: 'failure', component: 'auth', time: '2024-01-08' }
      ]
    });
    if (!patterns.patterns) throw new Error('No patterns recognized');
  });

  // 16. Test Quality Storyteller
  await testAgent('Quality Storyteller', async () => {
    const storyteller = aqe.createAgent('quality-storyteller' as AgentType);
    const decision = await storyteller.decide({
      testResults: { passed: 95, failed: 5 },
      coverage: 85,
      bugs: 3
    });
    if (!decision.narrative) throw new Error('No narrative created');
  });

  // 17. Test Resilience Challenger
  await testAgent('Resilience Challenger', async () => {
    const challenger = aqe.createAgent('resilience-challenger' as AgentType);
    const experiment = await challenger.decide({
      system: 'payment-service',
      dependencies: ['database', 'cache', 'queue']
    });
    if (!experiment.experiment) throw new Error('No chaos experiment designed');
  });

  // Test Agent Communication
  await testAgent('Agent Communication', async () => {
    const source = aqe.createAgent('requirements-explorer' as AgentType);
    const target = aqe.createAgent('risk-oracle' as AgentType);

    // This should work as requirements-explorer can communicate
    const response = await source.communicate(target,
      JSON.stringify({ type: 'risk_assessment', requirements: ['login'] })
    );
    if (!response.acknowledged) throw new Error('Communication failed');
  });

  // Test Swarm Spawning
  await testAgent('Swarm Spawning', async () => {
    const swarm = aqe.spawnSwarm('mutation-testing-swarm' as AgentType, 3);
    if (swarm.length !== 3) throw new Error('Incorrect swarm size');

    // Test that each agent in swarm works
    for (const agent of swarm) {
      const decision = await agent.decide({ code: 'test' });
      if (!decision) throw new Error('Swarm agent failed');
    }
  });

  // Test Security Framework
  await testAgent('Security Framework', async () => {
    const report: SecurityReport = aqe.getSecurityReport();
    if (report.totalValidations === undefined) throw new Error('No security report');
  });

  // Print Summary
  console.log(chalk.gray('\n' + '=' .repeat(60)));
  console.log(chalk.blue.bold('\n📊 Test Summary:\n'));

  console.log(chalk.green(`✓ Passed: ${results.passed.length}/${results.passed.length + results.failed.length}`));
  if (results.passed.length > 0) {
    results.passed.forEach(test => {
      console.log(chalk.green(`  • ${test}`));
    });
  }

  if (results.failed.length > 0) {
    console.log(chalk.red(`\n✗ Failed: ${results.failed.length}`));
    results.failed.forEach(({ name, error }) => {
      console.log(chalk.red(`  • ${name}: ${error}`));
    });
  }

  // Get final security report
  const finalReport: SecurityReport = aqe.getSecurityReport();
  console.log(chalk.blue('\n🔒 Security Report:'));
  console.log(`  • Total validations: ${finalReport.totalValidations}`);
  console.log(`  • Security issues: ${finalReport.securityIssues.length}`);
  console.log(`  • Blocked requests: ${finalReport.blockedRequests.length}`);

  // Overall result
  const allPassed = results.failed.length === 0;
  console.log(chalk.gray('\n' + '=' .repeat(60)));
  if (allPassed) {
    console.log(chalk.green.bold('\n✅ All tests PASSED! Framework is working correctly.\n'));
  } else {
    console.log(chalk.red.bold('\n❌ Some tests FAILED. Please check the errors above.\n'));
    process.exit(1);
  }

  return allPassed;
}

// Run tests if called directly
if (require.main === module) {
  testAllAgents().catch((error: Error) => {
    console.error(chalk.red('\n💥 Fatal error:'), error);
    process.exit(1);
  });
}

export { testAllAgents };