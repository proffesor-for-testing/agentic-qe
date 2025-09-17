/**
 * QE Coordinator Examples - Demonstrates various usage patterns
 */

import {
  QECoordinator,
  QECoordinatorFactory,
  createQECoordinator,
  buildQECoordinator,
  createQualityThreshold,
  createQualityGate,
  QUALITY_THRESHOLDS,
  type TestingScenario,
  type QECoordinatorConfig
} from './index.js';

// ============================================================================
// Example 1: Quick Start with Predefined Scenarios
// ============================================================================

/**
 * Example: API Testing with minimal setup
 */
export async function apiTestingExample(): Promise<void> {
  console.log('🚀 Starting API Testing Example');

  // Create coordinator for API testing scenario
  const coordinator = createQECoordinator('api-testing', 'api-test-session-001', {
    neuralEnabled: true,
    parallelExecution: true,
    logLevel: 'info',
    timeout: 900000 // 15 minutes
  });

  // Set up event listeners
  coordinator.on('phase-start', (event) => {
    console.log(`📋 Phase started: ${event.phase}`);
  });

  coordinator.on('phase-complete', (event) => {
    console.log(`✅ Phase completed: ${event.phase} (${event.context.duration}ms)`);
  });

  coordinator.on('quality-gate-evaluated', (event) => {
    console.log(`🚦 Quality gate: ${event.gate.name} - ${event.result.passed ? 'PASSED' : 'FAILED'}`);
  });

  coordinator.on('agent-spawned', (event) => {
    console.log(`🤖 Agent spawned: ${event.agent.name}`);
  });

  try {
    // Start the coordination workflow
    await coordinator.startCoordination();

    // Get final metrics
    const metrics = coordinator.getSessionMetrics();
    console.log('📊 Final Metrics:', {
      completedPhases: metrics.completedPhases,
      totalAgentsSpawned: metrics.totalAgentsSpawned,
      overallQualityScore: metrics.overallQualityScore,
      totalExecutionTime: metrics.totalExecutionTime
    });

  } catch (error) {
    console.error('❌ API Testing failed:', error);
  } finally {
    await coordinator.stop();
  }
}

// ============================================================================
// Example 2: Security Testing with Custom Configuration
// ============================================================================

/**
 * Example: Advanced security testing with custom quality gates
 */
export async function securityTestingExample(): Promise<void> {
  console.log('🔒 Starting Security Testing Example');

  // Create coordinator with custom configuration
  const coordinator = QECoordinatorFactory.createForScenario('security-testing', 'security-test-001', {
    // Override default configuration
    swarmConfig: {
      topology: 'hierarchical',
      maxAgents: 8,
      minAgents: 4,
      scalingStrategy: 'adaptive',
      loadBalancing: true,
      failoverEnabled: true,
      communicationProtocol: 'event-bus'
    },
    // Add custom quality gates
    qualityGates: [
      createQualityGate('security-requirements-gate', 'Security Requirements Gate', 'requirements', 'test-planning', [
        createQualityThreshold('quality-score', 'gte', 0.95, 0.8, true),
        createQualityThreshold('artifact-count', 'gte', 3, 0.2, true)
      ]),
      createQualityGate('security-planning-gate', 'Security Planning Gate', 'test-planning', 'test-execution', [
        createQualityThreshold('test-coverage', 'gte', 0.98, 0.9, true),
        createQualityThreshold('quality-score', 'gte', 0.9, 0.1, false)
      ]),
      createQualityGate('security-execution-gate', 'Security Execution Gate', 'test-execution', 'validation', [
        createQualityThreshold('quality-score', 'gte', 0.98, 0.7, true),
        createQualityThreshold('defect-density', 'eq', 0, 0.2, true), // Zero tolerance for security defects
        createQualityThreshold('execution-efficiency', 'gte', 0.8, 0.1, false)
      ]),
      createQualityGate('security-validation-gate', 'Security Validation Gate', 'validation', 'reporting', [
        createQualityThreshold('quality-score', 'gte', 0.99, 1.0, true)
      ])
    ],
    logLevel: 'debug' // More detailed logging for security testing
  });

  // Enhanced event handling for security testing
  coordinator.on('quality-gate-evaluated', (event) => {
    if (!event.result.passed) {
      console.warn(`🚨 Security quality gate failed: ${event.gate.name}`, {
        blockers: event.result.blockers,
        score: event.result.score
      });
    }
  });

  coordinator.on('phase-failed', (event) => {
    console.error(`💥 Security phase failed: ${event.phase}`, {
      errors: event.context.errorLog.length,
      retryCount: event.context.retryCount
    });
  });

  try {
    await coordinator.startCoordination();

    // Security-specific metrics analysis
    const metrics = coordinator.getSessionMetrics();
    const neuralContext = coordinator.getNeuralContext();

    console.log('🔍 Security Testing Results:', {
      securityScore: metrics.overallQualityScore,
      phases: metrics.completedPhases,
      agents: metrics.totalAgentsSpawned,
      learningPatterns: neuralContext?.historicalPatterns.length || 0
    });

  } catch (error) {
    console.error('🚨 Security testing critical failure:', error);
    // In security testing, failures might need immediate escalation
  } finally {
    await coordinator.stop();
  }
}

// ============================================================================
// Example 3: Performance Testing with Parallel Execution
// ============================================================================

/**
 * Example: Performance testing with parallel agent execution
 */
export async function performanceTestingExample(): Promise<void> {
  console.log('⚡ Starting Performance Testing Example');

  const coordinator = createQECoordinator('performance-testing', 'perf-test-001', {
    parallelExecution: true, // Enable parallel execution for performance
    neuralEnabled: true,
    logLevel: 'info'
  });

  // Track performance-specific metrics
  let phaseTimings: Record<string, number> = {};

  coordinator.on('phase-start', (event) => {
    phaseTimings[event.phase] = Date.now();
    console.log(`⏱️  Performance phase started: ${event.phase}`);
  });

  coordinator.on('phase-complete', (event) => {
    const duration = Date.now() - phaseTimings[event.phase];
    console.log(`🏁 Performance phase completed: ${event.phase} (${duration}ms)`, {
      efficiency: event.context.metrics.executionEfficiency,
      agentUtilization: event.context.metrics.agentUtilization
    });
  });

  coordinator.on('metrics-updated', (event) => {
    console.log(`📈 Performance metrics for ${event.phase}:`, {
      qualityScore: event.metrics.qualityScore,
      efficiency: event.metrics.executionEfficiency,
      collaboration: event.metrics.collaborationIndex
    });
  });

  try {
    await coordinator.startCoordination();

    const metrics = coordinator.getSessionMetrics();
    console.log('🎯 Performance Testing Summary:', {
      totalTime: metrics.totalExecutionTime,
      averagePhaseTime: metrics.averagePhaseTime,
      coordinationEfficiency: metrics.coordinationEfficiency,
      resourceUtilization: metrics.resourceUtilization
    });

  } catch (error) {
    console.error('⚠️ Performance testing encountered issues:', error);
  } finally {
    await coordinator.stop();
  }
}

// ============================================================================
// Example 4: Custom Configuration with Builder Pattern
// ============================================================================

/**
 * Example: Custom testing workflow using builder pattern
 */
export async function customWorkflowExample(): Promise<void> {
  console.log('🛠️ Starting Custom Workflow Example');

  // Build a custom coordinator configuration
  const coordinator = buildQECoordinator('custom-workflow-001')
    .withPhases(['requirements', 'test-execution', 'validation', 'reporting']) // Skip test-planning
    .withSwarmConfig({
      topology: 'mesh',
      maxAgents: 6,
      minAgents: 2,
      scalingStrategy: 'exponential',
      loadBalancing: true,
      failoverEnabled: true,
      communicationProtocol: 'message-queue'
    })
    .addQualityGate(createQualityGate('custom-requirements-gate', 'Custom Requirements Gate', 'requirements', 'test-execution', [
      createQualityThreshold('quality-score', 'gte', QUALITY_THRESHOLDS.GOOD_QUALITY, 1.0, true)
    ]))
    .addQualityGate(createQualityGate('custom-execution-gate', 'Custom Execution Gate', 'test-execution', 'validation', [
      createQualityThreshold('test-coverage', 'gte', QUALITY_THRESHOLDS.MINIMUM_COVERAGE, 0.5, false),
      createQualityThreshold('execution-efficiency', 'gte', QUALITY_THRESHOLDS.GOOD_EFFICIENCY, 0.3, false),
      createQualityThreshold('error-count', 'lte', 2, 0.2, true) // Allow up to 2 errors
    ]))
    .addQualityGate(createQualityGate('custom-validation-gate', 'Custom Validation Gate', 'validation', 'reporting', [
      createQualityThreshold('quality-score', 'gte', QUALITY_THRESHOLDS.HIGH_QUALITY, 1.0, true)
    ]))
    .withNeuralContext(true)
    .withMetrics(true)
    .withParallelExecution(false) // Sequential for this custom workflow
    .withTimeout(2400000, 2) // 40 minutes, 2 retries
    .withLogLevel('debug')
    .create();

  // Custom event handling
  coordinator.on('phase-handoff', (handoff) => {
    console.log(`🔄 Custom handoff: ${handoff.fromPhase} → ${handoff.toPhase}`, {
      recommendations: handoff.recommendations.length,
      risks: handoff.risks.length,
      dataKeys: Object.keys(handoff.data).length
    });
  });

  coordinator.on('hook-event', (event) => {
    console.log(`🪝 Hook event: ${event.type}`, {
      timestamp: event.timestamp,
      dataKeys: Object.keys(event.data).length
    });
  });

  try {
    await coordinator.startCoordination();

    // Analyze custom workflow results
    const finalMetrics = coordinator.getSessionMetrics();
    console.log('🎊 Custom Workflow Completed:', {
      success: finalMetrics.completedPhases === 4, // All 4 phases
      adaptationRate: finalMetrics.adaptationRate,
      learningProgress: finalMetrics.learningProgress
    });

  } catch (error) {
    console.error('💣 Custom workflow failed:', error);
  } finally {
    await coordinator.stop();
  }
}

// ============================================================================
// Example 5: Mobile Testing with Device-Specific Configuration
// ============================================================================

/**
 * Example: Mobile testing with device compatibility focus
 */
export async function mobileTestingExample(): Promise<void> {
  console.log('📱 Starting Mobile Testing Example');

  const coordinator = QECoordinatorFactory.createForScenario('mobile-testing', 'mobile-test-001', {
    // Mobile-specific configuration
    swarmConfig: {
      topology: 'star', // Centralized coordination for device testing
      maxAgents: 8, // More agents for multiple device testing
      minAgents: 3,
      scalingStrategy: 'adaptive',
      loadBalancing: true,
      failoverEnabled: true,
      communicationProtocol: 'event-bus'
    },
    parallelExecution: true, // Test multiple devices in parallel
    neuralEnabled: true,
    timeout: 3000000 // 50 minutes for comprehensive mobile testing
  });

  // Mobile-specific event tracking
  let deviceTestResults: Record<string, any> = {};

  coordinator.on('agent-completed', (event) => {
    if (event.agent.type === 'mobile-tester') {
      const deviceInfo = event.artifact.metadata.device || 'unknown';
      deviceTestResults[deviceInfo] = {
        artifact: event.artifact.name,
        size: event.artifact.size,
        timestamp: event.artifact.timestamp
      };
      console.log(`📲 Device test completed: ${deviceInfo}`);
    }
  });

  coordinator.on('quality-gate-evaluated', (event) => {
    if (event.gate.phase === 'test-execution') {
      console.log(`📊 Mobile execution quality: ${event.result.score}`, {
        coveragePassed: event.result.thresholdResults.find(t => t.metric === 'test-coverage')?.passed,
        qualityPassed: event.result.thresholdResults.find(t => t.metric === 'quality-score')?.passed
      });
    }
  });

  try {
    await coordinator.startCoordination();

    const metrics = coordinator.getSessionMetrics();
    console.log('📱 Mobile Testing Summary:', {
      devicesTests: Object.keys(deviceTestResults).length,
      overallQuality: metrics.overallQualityScore,
      resourceUtilization: metrics.resourceUtilization,
      coordinationEfficiency: metrics.coordinationEfficiency
    });

    console.log('📋 Device Test Results:', deviceTestResults);

  } catch (error) {
    console.error('📱💥 Mobile testing failed:', error);
  } finally {
    await coordinator.stop();
  }
}

// ============================================================================
// Example 6: Smoke Testing - Minimal Quick Validation
// ============================================================================

/**
 * Example: Quick smoke testing for basic functionality validation
 */
export async function smokeTestingExample(): Promise<void> {
  console.log('💨 Starting Smoke Testing Example');

  // Smoke testing with minimal configuration
  const coordinator = createQECoordinator('smoke-testing', 'smoke-test-001', {
    neuralEnabled: false, // No learning needed for simple smoke tests
    parallelExecution: true, // Fast execution
    logLevel: 'warn', // Minimal logging
    timeout: 300000 // 5 minutes max
  });

  // Simple event handling for smoke tests
  coordinator.on('phase-complete', (event) => {
    console.log(`💨✅ Smoke phase done: ${event.phase} (${event.context.duration}ms)`);
  });

  coordinator.on('quality-gate-evaluated', (event) => {
    if (!event.result.passed) {
      console.error(`💨🚨 Smoke test gate failed: ${event.gate.name}`);
      // In smoke testing, any failure is critical
    }
  });

  try {
    const startTime = Date.now();
    await coordinator.startCoordination();
    const duration = Date.now() - startTime;

    const metrics = coordinator.getSessionMetrics();
    console.log('💨🎯 Smoke Test Results:', {
      passed: metrics.failedPhases === 0,
      duration: duration,
      agents: metrics.totalAgentsSpawned,
      efficiency: metrics.coordinationEfficiency
    });

  } catch (error) {
    console.error('💨💥 Smoke testing failed - critical system issues detected:', error);
  } finally {
    await coordinator.stop();
  }
}

// ============================================================================
// Example 7: Multi-Scenario Testing Pipeline
// ============================================================================

/**
 * Example: Running multiple testing scenarios in sequence
 */
export async function multiScenarioExample(): Promise<void> {
  console.log('🔄 Starting Multi-Scenario Testing Pipeline');

  const scenarios: TestingScenario[] = [
    'smoke-testing',      // Quick validation first
    'api-testing',        // Core API functionality
    'security-testing',   // Security validation
    'accessibility-testing' // Accessibility compliance
  ];

  const results: Array<{ scenario: TestingScenario; success: boolean; metrics: any }> = [];

  for (const scenario of scenarios) {
    console.log(`\n🎯 Running scenario: ${scenario}`);

    const sessionId = `multi-${scenario}-${Date.now()}`;
    const coordinator = createQECoordinator(scenario, sessionId, {
      logLevel: 'warn' // Reduce noise in pipeline
    });

    try {
      await coordinator.startCoordination();
      const metrics = coordinator.getSessionMetrics();

      results.push({
        scenario,
        success: metrics.failedPhases === 0,
        metrics: {
          quality: metrics.overallQualityScore,
          duration: metrics.totalExecutionTime,
          agents: metrics.totalAgentsSpawned
        }
      });

      console.log(`✅ ${scenario} completed successfully`);

    } catch (error) {
      console.error(`❌ ${scenario} failed:`, (error as Error).message);
      results.push({
        scenario,
        success: false,
        metrics: { error: (error as Error).message }
      });

      // Decide whether to continue pipeline based on scenario criticality
      if (scenario === 'smoke-testing') {
        console.error('🚨 Smoke testing failed - stopping pipeline');
        break;
      }
    } finally {
      await coordinator.stop();
    }
  }

  // Pipeline summary
  const successful = results.filter(r => r.success).length;
  const total = results.length;

  console.log(`\n🏁 Pipeline Summary: ${successful}/${total} scenarios passed`);
  console.table(results.map(r => ({
    Scenario: r.scenario,
    Success: r.success ? '✅' : '❌',
    Quality: r.metrics.quality ? r.metrics.quality.toFixed(3) : 'N/A',
    Duration: r.metrics.duration ? `${Math.round(r.metrics.duration / 1000)}s` : 'N/A',
    Agents: r.metrics.agents || 'N/A'
  })));
}

// ============================================================================
// Utility Functions for Examples
// ============================================================================

/**
 * Run all examples in sequence
 */
export async function runAllExamples(): Promise<void> {
  const examples = [
    { name: 'API Testing', fn: apiTestingExample },
    { name: 'Security Testing', fn: securityTestingExample },
    { name: 'Performance Testing', fn: performanceTestingExample },
    { name: 'Custom Workflow', fn: customWorkflowExample },
    { name: 'Mobile Testing', fn: mobileTestingExample },
    { name: 'Smoke Testing', fn: smokeTestingExample },
    { name: 'Multi-Scenario Pipeline', fn: multiScenarioExample }
  ];

  console.log('🚀 Running All QE Coordinator Examples\n');

  for (const example of examples) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🎯 Running: ${example.name}`);
      console.log(`${'='.repeat(60)}`);

      await example.fn();

      console.log(`✅ ${example.name} completed successfully\n`);

    } catch (error) {
      console.error(`❌ ${example.name} failed:`, (error as Error).message);
    }

    // Small delay between examples
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🏁 All examples completed');
}

/**
 * Interactive example selector
 */
export async function selectExample(): Promise<void> {
  const examples = [
    { id: 1, name: 'API Testing', fn: apiTestingExample },
    { id: 2, name: 'Security Testing', fn: securityTestingExample },
    { id: 3, name: 'Performance Testing', fn: performanceTestingExample },
    { id: 4, name: 'Custom Workflow', fn: customWorkflowExample },
    { id: 5, name: 'Mobile Testing', fn: mobileTestingExample },
    { id: 6, name: 'Smoke Testing', fn: smokeTestingExample },
    { id: 7, name: 'Multi-Scenario Pipeline', fn: multiScenarioExample },
    { id: 8, name: 'All Examples', fn: runAllExamples }
  ];

  console.log('\n📋 Available QE Coordinator Examples:');
  examples.forEach(ex => {
    console.log(`  ${ex.id}. ${ex.name}`);
  });

  // In a real CLI, you'd get user input here
  // For demo purposes, run the first example
  const selectedExample = examples[0];
  console.log(`\n🎯 Running: ${selectedExample.name}\n`);
  await selectedExample.fn();
}

// Export all examples for easy access
export const examples = {
  apiTesting: apiTestingExample,
  securityTesting: securityTestingExample,
  performanceTesting: performanceTestingExample,
  customWorkflow: customWorkflowExample,
  mobileTesting: mobileTestingExample,
  smokeTesting: smokeTestingExample,
  multiScenario: multiScenarioExample,
  runAll: runAllExamples,
  select: selectExample
};