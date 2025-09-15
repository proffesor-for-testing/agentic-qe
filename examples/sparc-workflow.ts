#!/usr/bin/env node

/**
 * SPARC Workflow Example
 * Demonstrates complete SPARC methodology with TDD
 */

import { AgenticQE } from '../src/index';
import {
  SpecificationAgent,
  PseudocodeAgent,
  ArchitectureAgent,
  RefinementAgent,
  SPARCCoordinatorAgent
} from '../src/agents';
import {
  AgentType,
  AgentConfig,
  RSTHeuristic,
  QualityGateStatus,
  TaskPriority
} from '../src/core/types';
import chalk from 'chalk';

interface ProjectContext {
  name: string;
  requirements: string[];
  complexity: 'low' | 'medium' | 'high';
  team: 'single' | 'distributed' | 'large';
  timeline: string;
}

interface SpecificationResult {
  ambiguities: string[];
  testability: { score: number };
  acceptanceCriteria: string[];
}

interface PseudocodeResult {
  algorithms: string[];
  edgeCases: string[];
  complexity: { time: string };
}

interface ArchitectureResult {
  components: string[];
  threatModel: { threats: string[] };
  qualityAttributes: Record<string, any>;
}

interface RefinementResult {
  testCoverage: number;
  testsCount: number;
  refactoringCycles: number;
  optimizations: string[];
}

interface CoordinationResult {
  qualityGate: { status: QualityGateStatus };
  productionReady: boolean;
  traceability: { complete: boolean };
  metrics: {
    requirementsCoverage: number;
    testCoverage: number;
    codeQuality: number;
    securityScore: number;
    performanceScore: number;
  };
  issues: Array<{ severity: string; description: string }>;
}

async function runSPARCWorkflow(): Promise<void> {
  console.log(chalk.blue.bold('\n🚀 SPARC Workflow Example\n'));

  const aqe = new AgenticQE({
    security: {
      enablePromptInjectionProtection: true,
      enableAuditLogging: true
    }
  });

  // Project context
  const projectContext: ProjectContext = {
    name: 'payment-gateway',
    requirements: [
      'Process credit card payments securely',
      'Support multiple payment providers',
      'Handle refunds and chargebacks',
      'Provide real-time transaction status',
      'Ensure PCI DSS compliance'
    ],
    complexity: 'high',
    team: 'distributed',
    timeline: '3 months'
  };

  console.log(chalk.yellow('1. Specification Phase'));
  console.log('─'.repeat(40));

  // Create specification agent
  const specConfig: AgentConfig = {
    type: 'specification' as AgentType,
    pactLevel: 2,
    capabilities: {
      maxConcurrentTasks: 3,
      supportedTaskTypes: ['requirements-analysis'],
      pactLevel: 2,
      rstHeuristics: ['SFDIPOT', 'FEW_HICCUPPS'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: false,
      securityClearance: 'internal' as any
    },
    learning: { enabled: false }
  };

  const specAgent = aqe.createAgent('specification' as AgentType, specConfig);

  // Analyze requirements
  const specObservation = await specAgent.perceive(projectContext);
  const specDecision = await specAgent.decide(specObservation);
  const specResult = await specAgent.act(specDecision) as SpecificationResult;

  console.log(chalk.green('✓ Requirements analyzed'));
  console.log(`  - Ambiguities found: ${specResult.ambiguities.length}`);
  console.log(`  - Testability score: ${specResult.testability.score}/10`);
  console.log(`  - Acceptance criteria: ${specResult.acceptanceCriteria.length}`);

  console.log(chalk.yellow('\n2. Pseudocode Phase'));
  console.log('─'.repeat(40));

  // Create pseudocode agent
  const pseudoAgent = aqe.createAgent('pseudocode' as AgentType, {
    type: 'pseudocode' as AgentType,
    pactLevel: 2,
    capabilities: {
      maxConcurrentTasks: 2,
      supportedTaskTypes: ['algorithm-design'],
      pactLevel: 2,
      rstHeuristics: ['SFDIPOT'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: false,
      securityClearance: 'internal' as any
    },
    learning: { enabled: false }
  });

  // Design algorithms
  const pseudoObservation = await pseudoAgent.perceive({
    specifications: specResult,
    domain: 'financial'
  });
  const pseudoDecision = await pseudoAgent.decide(pseudoObservation);
  const pseudoResult = await pseudoAgent.act(pseudoDecision) as PseudocodeResult;

  console.log(chalk.green('✓ Algorithms designed'));
  console.log(`  - Core algorithms: ${pseudoResult.algorithms.length}`);
  console.log(`  - Edge cases identified: ${pseudoResult.edgeCases.length}`);
  console.log(`  - Complexity analysis: O(${pseudoResult.complexity.time})`);

  console.log(chalk.yellow('\n3. Architecture Phase'));
  console.log('─'.repeat(40));

  // Create architecture agent
  const archAgent = aqe.createAgent('architecture' as AgentType, {
    type: 'architecture' as AgentType,
    pactLevel: 3,
    capabilities: {
      maxConcurrentTasks: 3,
      supportedTaskTypes: ['system-design'],
      pactLevel: 3,
      rstHeuristics: ['CRUSSPIC'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: false,
      securityClearance: 'confidential' as any
    },
    learning: { enabled: false }
  });

  // Design system architecture
  const archObservation = await archAgent.perceive({
    specifications: specResult,
    algorithms: pseudoResult,
    constraints: {
      scalability: 'high',
      security: 'critical',
      performance: '< 100ms p99'
    }
  });
  const archDecision = await archAgent.decide(archObservation);
  const archResult = await archAgent.act(archDecision) as ArchitectureResult;

  console.log(chalk.green('✓ Architecture designed'));
  console.log(`  - Components: ${archResult.components.length}`);
  console.log(`  - Security threats: ${archResult.threatModel.threats.length}`);
  console.log(`  - Quality attributes: ${Object.keys(archResult.qualityAttributes).join(', ')}`);

  console.log(chalk.yellow('\n4. Refinement Phase (TDD)'));
  console.log('─'.repeat(40));

  // Create refinement agent with TDD focus
  const refineAgent = aqe.createAgent('refinement' as AgentType, {
    type: 'refinement' as AgentType,
    pactLevel: 3,
    capabilities: {
      maxConcurrentTasks: 5,
      supportedTaskTypes: ['tdd-implementation'],
      pactLevel: 3,
      rstHeuristics: ['SFDIPOT', 'CRUSSPIC'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'internal' as any
    },
    learning: { enabled: true }
  });

  // Implement with TDD
  const refineObservation = await refineAgent.perceive({
    specifications: specResult,
    pseudocode: pseudoResult,
    architecture: archResult
  });
  const refineDecision = await refineAgent.decide(refineObservation);
  const refineResult = await refineAgent.act(refineDecision) as RefinementResult;

  console.log(chalk.green('✓ TDD Implementation complete'));
  console.log(`  - Test coverage: ${refineResult.testCoverage}%`);
  console.log(`  - Tests written: ${refineResult.testsCount}`);
  console.log(`  - Refactoring cycles: ${refineResult.refactoringCycles}`);
  console.log(`  - Performance optimizations: ${refineResult.optimizations.length}`);

  console.log(chalk.yellow('\n5. Completion & Coordination'));
  console.log('─'.repeat(40));

  // Create SPARC coordinator
  const coordinator = aqe.createAgent('sparc-coord' as AgentType, {
    type: 'sparc-coord' as AgentType,
    pactLevel: 4,
    capabilities: {
      maxConcurrentTasks: 10,
      supportedTaskTypes: ['workflow-coordination'],
      pactLevel: 4,
      rstHeuristics: ['SFDIPOT', 'CRUSSPIC', 'FEW_HICCUPPS'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'confidential' as any
    },
    learning: { enabled: true }
  });

  // Orchestrate final validation
  const coordObservation = await coordinator.perceive({
    phases: {
      specification: specResult,
      pseudocode: pseudoResult,
      architecture: archResult,
      refinement: refineResult
    }
  });
  const coordDecision = await coordinator.decide(coordObservation);
  const coordResult = await coordinator.act(coordDecision) as CoordinationResult;

  console.log(chalk.green('✓ SPARC workflow complete'));
  console.log(`  - Quality gate status: ${coordResult.qualityGate.status}`);
  console.log(`  - Production readiness: ${coordResult.productionReady ? 'YES' : 'NO'}`);
  console.log(`  - Traceability matrix: ${coordResult.traceability.complete ? 'Complete' : 'Incomplete'}`);

  // Generate final report
  console.log(chalk.blue('\n📋 Final Report'));
  console.log('─'.repeat(40));
  console.log(chalk.cyan('Requirements Coverage: ') + coordResult.metrics.requirementsCoverage + '%');
  console.log(chalk.cyan('Test Coverage: ') + coordResult.metrics.testCoverage + '%');
  console.log(chalk.cyan('Code Quality: ') + coordResult.metrics.codeQuality + '/10');
  console.log(chalk.cyan('Security Score: ') + coordResult.metrics.securityScore + '/10');
  console.log(chalk.cyan('Performance: ') + coordResult.metrics.performanceScore + '/10');

  if (coordResult.issues.length > 0) {
    console.log(chalk.yellow('\n⚠️  Issues to Address:'));
    coordResult.issues.forEach(issue => {
      console.log(`  - ${issue.severity}: ${issue.description}`);
    });
  }

  console.log(chalk.green.bold('\n✅ SPARC Workflow Demonstration Complete!\n'));
}

// Run the example
if (require.main === module) {
  runSPARCWorkflow()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    });
}

export { runSPARCWorkflow };