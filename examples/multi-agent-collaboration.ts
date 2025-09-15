#!/usr/bin/env ts-node

/**
 * Multi-Agent Collaboration Example
 * Demonstrates multiple TypeScript agents working together with shared memory
 */

import { EventEmitter } from 'events';
import {
  RequirementsExplorerAgent,
  RiskOracleAgent,
  SecuritySentinelAgent,
  PerformanceHunterAgent,
  ExploratoryNavigatorAgent
} from '../src/agents';
import { DistributedMemorySystem } from '../src/memory/distributed-memory';
import {
  AgentId,
  AgentConfig,
  TaskDefinition,
  PACTLevel,
  ILogger,
  IEventBus
} from '../src/core/types';

// Logger implementation
class ConsoleLogger implements ILogger {
  debug(message: string, context?: any): void {
    console.log(`[DEBUG] ${message}`, context || '');
  }
  info(message: string, context?: any): void {
    console.log(`[INFO] ${message}`, context || '');
  }
  warn(message: string, context?: any): void {
    console.warn(`[WARN] ${message}`, context || '');
  }
  error(message: string, context?: any): void {
    console.error(`[ERROR] ${message}`, context || '');
  }
}

// Event bus
class SimpleEventBus extends EventEmitter implements IEventBus {
  emit(event: string, data: any): boolean {
    console.log(`📡 Event: ${event}`);
    return super.emit(event, data);
  }
}

async function demonstrateMultiAgentCollaboration() {
  console.log('\n🚀 Multi-Agent QE Collaboration Demonstration\n');
  console.log('This example shows multiple TypeScript agents collaborating:');
  console.log('- Requirements Explorer: Analyzes requirements');
  console.log('- Risk Oracle: Predicts risks');
  console.log('- Security Sentinel: Finds vulnerabilities');
  console.log('- Performance Hunter: Identifies bottlenecks');
  console.log('- Exploratory Navigator: Discovers unknowns\n');

  // Initialize core services
  const logger = new ConsoleLogger();
  const eventBus = new SimpleEventBus();
  const memory = new DistributedMemorySystem(logger, eventBus);

  // Create agent configurations
  const baseConfig = (type: string): AgentConfig => ({
    name: `${type} Agent`,
    type,
    pactLevel: PACTLevel.COLLABORATIVE,
    capabilities: {
      maxConcurrentTasks: 3,
      supportedTaskTypes: [type],
      pactLevel: PACTLevel.COLLABORATIVE,
      rstHeuristics: ['SFDIPOT', 'FEW_HICCUPPS'],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'internal' as any
    },
    environment: {
      runtime: 'node',
      version: '18.0.0',
      workingDirectory: './agents',
      logLevel: 'info',
      timeout: 30000
    },
    learning: {
      enabled: true,
      strategy: 'reinforcement',
      learningRate: 0.1,
      memoryRetention: 0.9,
      experienceSharing: true
    },
    security: {
      enablePromptInjectionProtection: true,
      enableOutputSanitization: true,
      enableAuditLogging: true,
      rateLimiting: {
        requests: 100,
        window: 60000
      },
      permissions: ['read', 'write', 'share']
    },
    collaboration: {
      maxCollaborators: 5,
      communicationProtocol: 'pubsub',
      consensusRequired: false,
      sharingStrategy: 'selective'
    },
    explainability: {
      enabled: true,
      detailLevel: 'detailed',
      includeAlternatives: true,
      includeConfidence: true,
      includeEvidence: true
    }
  });

  // Create agents
  console.log('🤖 Creating QE Agent Swarm...\n');

  const agents = {
    requirements: new RequirementsExplorerAgent(
      { id: 'req-001', swarmId: 'qe-swarm', type: 'requirements-explorer', instance: 1 },
      baseConfig('requirements-explorer'),
      logger,
      eventBus,
      memory
    ),
    risk: new RiskOracleAgent(
      { id: 'risk-001', swarmId: 'qe-swarm', type: 'risk-oracle', instance: 1 },
      baseConfig('risk-oracle'),
      logger,
      eventBus,
      memory
    ),
    security: new SecuritySentinelAgent(
      { id: 'sec-001', swarmId: 'qe-swarm', type: 'security-sentinel', instance: 1 },
      baseConfig('security-sentinel'),
      logger,
      eventBus,
      memory
    ),
    performance: new PerformanceHunterAgent(
      { id: 'perf-001', swarmId: 'qe-swarm', type: 'performance-hunter', instance: 1 },
      baseConfig('performance-hunter'),
      logger,
      eventBus,
      memory
    ),
    explorer: new ExploratoryNavigatorAgent(
      { id: 'exp-001', swarmId: 'qe-swarm', type: 'exploratory-navigator', instance: 1 },
      baseConfig('exploratory-navigator'),
      logger,
      eventBus,
      memory
    )
  };

  // Initialize all agents
  await Promise.all(Object.values(agents).map(agent => agent.initialize()));
  console.log('✅ All agents initialized\n');

  // Create a comprehensive testing task
  const task: TaskDefinition = {
    id: 'comprehensive-test-001',
    type: 'comprehensive-quality-assessment',
    priority: 'high',
    context: {
      domain: 'e-commerce',
      environment: 'production',
      testingPhase: 'pre-release',
      application: {
        name: 'E-Commerce Platform',
        version: '2.0',
        components: 15,
        features: 30,
        complexity: 75
      },
      requirements: [
        'System must handle 10,000 concurrent users',
        'Payment processing must be PCI compliant',
        'Page load time should be under 2 seconds',
        'User data must be encrypted at rest and in transit',
        'The checkout process should be intuitive'
      ],
      securityRequirements: [
        { type: 'encryption', level: 'confidential' as any, mandatory: true },
        { type: 'authentication', level: 'critical' as any, mandatory: true }
      ],
      sla: {
        minThroughput: 1000,
        maxResponseTime: 500,
        availability: 99.9
      }
    },
    constraints: {
      timeLimit: 120000,
      qualityThreshold: 0.9,
      securityRequirements: []
    },
    dependencies: [],
    expectedOutcome: 'Comprehensive quality assessment',
    metadata: {
      client: 'Demo Corp',
      project: 'E-Commerce Platform v2.0'
    }
  };

  console.log('📋 Testing Context:');
  console.log(`  Application: ${task.context.application.name} v${task.context.application.version}`);
  console.log(`  Environment: ${task.context.environment}`);
  console.log(`  Phase: ${task.context.testingPhase}`);
  console.log(`  Complexity: ${task.context.application.complexity}/100\n`);

  // Execute tasks in parallel with all agents
  console.log('🔍 Executing Parallel Quality Assessment...\n');

  const results = await Promise.all([
    agents.requirements.executeTask(task),
    agents.risk.executeTask(task),
    agents.security.executeTask(task),
    agents.performance.executeTask(task),
    agents.explorer.executeTask(task)
  ]);

  // Display results from each agent
  console.log('📊 Quality Assessment Results:\n');

  // Requirements Analysis
  const reqResult = results[0];
  console.log('1️⃣ Requirements Analysis:');
  if (reqResult.success && reqResult.data) {
    console.log(`  ✅ Analyzed ${task.context.requirements.length} requirements`);
    console.log(`  📈 Confidence: ${(reqResult.confidence * 100).toFixed(0)}%`);
    if (reqResult.data.ambiguities?.length > 0) {
      console.log(`  ⚠️  Found ${reqResult.data.ambiguities.length} ambiguities`);
    }
    if (reqResult.data.testability?.length > 0) {
      console.log(`  ⚠️  Found ${reqResult.data.testability.length} testability issues`);
    }
  }

  // Risk Assessment
  const riskResult = results[1];
  console.log('\n2️⃣ Risk Assessment:');
  if (riskResult.success && riskResult.data) {
    console.log(`  ✅ Identified ${riskResult.data.risks?.length || 0} risks`);
    console.log(`  📈 Confidence: ${(riskResult.confidence * 100).toFixed(0)}%`);
    console.log(`  🎯 Overall Risk Score: ${riskResult.data.overallRisk?.toFixed(1) || 'N/A'}`);
    const critical = riskResult.data.risks?.filter((r: any) => r.severity === 'critical').length || 0;
    if (critical > 0) {
      console.log(`  🔴 Critical risks: ${critical}`);
    }
  }

  // Security Assessment
  const secResult = results[2];
  console.log('\n3️⃣ Security Assessment:');
  if (secResult.success && secResult.data) {
    console.log(`  ✅ Found ${secResult.data.vulnerabilities?.length || 0} vulnerabilities`);
    console.log(`  📈 Confidence: ${(secResult.confidence * 100).toFixed(0)}%`);
    console.log(`  🔒 Security Score: ${secResult.data.securityScore || 'N/A'}/100`);
    const criticalVulns = secResult.data.vulnerabilities?.filter((v: any) => v.severity === 'critical').length || 0;
    if (criticalVulns > 0) {
      console.log(`  🔴 Critical vulnerabilities: ${criticalVulns}`);
    }
  }

  // Performance Assessment
  const perfResult = results[3];
  console.log('\n4️⃣ Performance Assessment:');
  if (perfResult.success && perfResult.data) {
    console.log(`  ✅ Identified ${perfResult.data.bottlenecks?.length || 0} bottlenecks`);
    console.log(`  📈 Confidence: ${(perfResult.confidence * 100).toFixed(0)}%`);
    if (perfResult.data.scalability) {
      console.log(`  📊 Scalability Factor: ${perfResult.data.scalability.scalabilityFactor}x`);
      console.log(`  💪 Max Capacity: ${perfResult.data.scalability.maxCapacity} users`);
    }
  }

  // Exploration Results
  const expResult = results[4];
  console.log('\n5️⃣ Exploratory Testing:');
  if (expResult.success && expResult.data) {
    console.log(`  ✅ Discovered ${expResult.data.findings?.length || 0} findings`);
    console.log(`  📈 Confidence: ${(expResult.confidence * 100).toFixed(0)}%`);
    console.log(`  🗺️  Coverage: ${expResult.data.coverage?.percentage || 0}%`);
    console.log(`  💡 Generated ${expResult.data.insights?.length || 0} insights`);
  }

  // Demonstrate shared memory
  console.log('\n💾 Shared Memory Statistics:\n');

  const memStats = memory.getStatistics();
  console.log(`  Total entries: ${memStats.totalEntries}`);
  console.log(`  Partitions: ${memStats.partitionCount}`);
  console.log(`  Cache hit rate: ${(memStats.cacheHitRate * 100).toFixed(0)}%`);
  console.log(`  Replication health: ${(memStats.replicationHealth * 100).toFixed(0)}%`);

  // Query shared knowledge
  const sharedFindings = await memory.query({
    type: 'knowledge',
    tags: ['shared'],
    limit: 10
  });

  console.log(`  Shared knowledge items: ${sharedFindings.length}`);

  // Show collaboration
  console.log('\n🤝 Agent Collaboration:\n');

  // Agents can now access each other's findings through shared memory
  const riskAssessments = await memory.query({
    type: 'knowledge',
    tags: ['risk', 'assessment'],
    limit: 5
  });

  const securityAssessments = await memory.query({
    type: 'knowledge',
    tags: ['security', 'assessment'],
    limit: 5
  });

  console.log(`  Risk assessments shared: ${riskAssessments.length}`);
  console.log(`  Security assessments shared: ${securityAssessments.length}`);

  // Demonstrate explainability
  console.log('\n🧠 Explainable Decisions:\n');

  const decisions = await memory.query({
    type: 'decision',
    tags: ['explainable'],
    limit: 5
  });

  if (decisions.length > 0) {
    const firstDecision = decisions[0].value;
    console.log(`  Decision: ${firstDecision.action}`);
    console.log(`  Agent: ${firstDecision.agentId}`);
    console.log(`  Confidence: ${(firstDecision.confidence * 100).toFixed(0)}%`);
    console.log('  Top Factors:');
    firstDecision.reasoning.factors
      .slice(0, 3)
      .forEach((factor: any) => {
        console.log(`    • ${factor.name}: ${factor.explanation}`);
      });
  }

  // Generate consolidated recommendations
  console.log('\n📝 Consolidated Recommendations:\n');

  const allRecommendations = new Set<string>();
  results.forEach(result => {
    if (result.decision?.recommendations) {
      result.decision.recommendations.forEach(rec => allRecommendations.add(rec));
    }
  });

  Array.from(allRecommendations).slice(0, 10).forEach((rec, index) => {
    console.log(`  ${index + 1}. ${rec}`);
  });

  // Calculate overall quality score
  const overallConfidence = results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length;
  const successRate = results.filter(r => r.success).length / results.length;

  console.log('\n🎯 Overall Quality Assessment:');
  console.log(`  Success Rate: ${(successRate * 100).toFixed(0)}%`);
  console.log(`  Average Confidence: ${(overallConfidence * 100).toFixed(0)}%`);
  console.log(`  Quality Grade: ${overallConfidence > 0.8 ? 'A' : overallConfidence > 0.6 ? 'B' : 'C'}`);

  // Cleanup
  await Promise.all(Object.values(agents).map(agent => agent.shutdown()));
  console.log('\n✅ All agents shutdown complete');

  console.log('\n🎉 Multi-Agent Collaboration Complete!\n');
  console.log('Key Achievements:');
  console.log('✅ 5 specialized QE agents working in parallel');
  console.log('✅ Shared memory for collaboration');
  console.log('✅ Explainable AI decisions');
  console.log('✅ Comprehensive quality assessment');
  console.log('✅ Risk prediction and prioritization');
  console.log('✅ Security vulnerability detection');
  console.log('✅ Performance bottleneck identification');
  console.log('✅ Unknown issue discovery through exploration');
}

// Run the demonstration
if (require.main === module) {
  demonstrateMultiAgentCollaboration()
    .then(() => {
      console.log('\nExiting...');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { demonstrateMultiAgentCollaboration };