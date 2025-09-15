import { AgenticQE } from '../src/agents';
import {
  RequirementsAnalysis,
  RiskAssessment,
  TDDSuggestions,
  DeploymentValidation,
  ExploratoryTestingSession,
  ProductionMonitoring,
  QualityGateResults
} from '../src/core/types';

interface Requirements {
  linesChanged: number;
  complexity: number;
  critical: boolean;
  previousBugs: number;
}

interface ProductionMetrics {
  errorRate: number;
  latencyP99: number;
  traffic: number;
  saturation: number;
}

interface DeploymentConfig {
  version: string;
  environment: string;
  strategy: string;
  changes: string[];
}

async function main(): Promise<void> {
  // Initialize Agentic QE
  const aqe = new AgenticQE({
    claudeFlow: {
      apiKey: process.env.ANTHROPIC_API_KEY
    }
  });

  // Example 1: Analyze Requirements
  console.log('📋 Analyzing Requirements...\n');

  const requirements: string[] = [
    'As a user, I want to login quickly to access my dashboard',
    'The system should handle 1000 concurrent users',
    'Payment processing must be secure and comply with PCI DSS',
    'API response time should not exceed 200ms for 95% of requests'
  ];

  const reqAnalysis: RequirementsAnalysis = await aqe.analyzeRequirements(requirements);

  console.log('Ambiguities found:', reqAnalysis.ambiguities);
  console.log('Risk areas:', reqAnalysis.risks);
  console.log('Test charters:', reqAnalysis.charters);
  console.log('\n---\n');

  // Example 2: Risk Assessment
  console.log('⚠️  Assessing Risk...\n');

  const changes: Requirements = {
    linesChanged: 450,
    complexity: 12,
    critical: true,
    previousBugs: 5
  };

  const riskAssessment: RiskAssessment = await aqe.assessRisk(changes);

  console.log('Risk Score:', (riskAssessment.overallRisk * 100).toFixed(0) + '%');
  console.log('Test Priorities:', riskAssessment.priorities);
  console.log('Recommendations:', riskAssessment.recommendations);
  console.log('\n---\n');

  // Example 3: TDD Support
  console.log('🧪 TDD Pair Programming...\n');

  const code: string = `
    class ShoppingCart {
      private items: any[] = [];

      constructor() {
        this.items = [];
      }

      addItem(item: any): void {
        this.items.push(item);
      }

      getTotal(): number {
        return this.items.reduce((sum, item) => sum + item.price, 0);
      }
    }
  `;

  const tddSuggestions: TDDSuggestions = await aqe.suggestTests(code);

  console.log('Next test to write:', tddSuggestions.nextTest);
  console.log('Missing test cases:', tddSuggestions.missingTests);
  console.log('Refactoring opportunities:', tddSuggestions.refactoring);
  console.log('\n---\n');

  // Example 4: Deployment Validation
  console.log('🚀 Validating Deployment...\n');

  const deployment: DeploymentConfig = {
    version: '2.1.0',
    environment: 'staging',
    strategy: 'canary',
    changes: ['API updates', 'Database migration', 'UI improvements']
  };

  const deploymentValidation: DeploymentValidation = await aqe.validateDeployment(deployment);

  console.log('Smoke tests:', deploymentValidation.smokeTests);
  console.log('Canary analysis:', deploymentValidation.canaryAnalysis);
  console.log('Rollback decision:', deploymentValidation.rollbackDecision);
  console.log('\n---\n');

  // Example 5: Exploratory Testing Session
  console.log('🔍 Starting Exploratory Testing Session...\n');

  const session: ExploratoryTestingSession = await aqe.runExploratorySession({
    charter: 'Explore the checkout flow for edge cases and unexpected behaviors',
    timeBox: 30,
    tour: 'saboteur'
  });

  console.log('Session ID:', session.id);
  console.log('Charter:', session.charter);
  console.log('Tour type:', session.tour);
  console.log('Time box:', session.timeBox, 'minutes');
  console.log('\n---\n');

  // Example 6: Production Monitoring
  console.log('📊 Monitoring Production...\n');

  const productionMetrics: ProductionMetrics = {
    errorRate: 0.08,
    latencyP99: 1200,
    traffic: 1500,
    saturation: 0.85
  };

  const monitoring: ProductionMonitoring = await aqe.monitorProduction(productionMetrics);

  console.log('Anomalies detected:', monitoring.anomalies);
  console.log('Test gaps identified:', monitoring.testGaps);
  console.log('Alerts generated:', monitoring.alerts);
  console.log('\n---\n');

  // Example 7: Full Quality Gate
  console.log('🎯 Running Full Quality Gate...\n');

  const qualityGate: QualityGateResults = await aqe.runQualityGate({
    requirements,
    changes,
    code,
    deployment
  });

  console.log('Quality Gate Results:');
  console.log('- Requirements:', qualityGate.requirements ? 'Analyzed' : 'Skipped');
  console.log('- Risk Assessment:', qualityGate.risks ? 'Complete' : 'Skipped');
  console.log('- Test Coverage:', qualityGate.tests ? 'Evaluated' : 'Skipped');
  console.log('- Deployment:', qualityGate.deployment ? 'Validated' : 'Skipped');
}

// Run the examples
main().catch((error: Error) => {
  console.error('Error running examples:', error);
  process.exit(1);
});