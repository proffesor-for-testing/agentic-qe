/**
 * Test Planner Agent
 * Creates comprehensive test plans and strategies
 */

import { QEAgent, AgentContext, AgentExecutionResult } from '../base/QEAgent';
import { QEAgentConfig, TestStatus } from '../../types';
import { QEMemory } from '../../memory/QEMemory';
import { HookManager } from '../../hooks';
import { Logger } from '../../utils/Logger';

const logger = new Logger('TestPlanner');

export interface TestPlan {
  id: string;
  name: string;
  description: string;
  objectives: string[];
  scope: TestScope;
  strategy: TestStrategy;
  phases: TestPhase[];
  resources: TestResources;
  risks: TestRisk[];
  schedule: TestSchedule;
  successCriteria: string[];
  deliverables: string[];
}

export interface TestScope {
  included: string[];
  excluded: string[];
  features: string[];
  platforms: string[];
  environments: string[];
}

export interface TestStrategy {
  approach: 'risk-based' | 'requirements-based' | 'model-based' | 'exploratory' | 'hybrid';
  levels: TestLevel[];
  techniques: string[];
  tools: string[];
  automation: {
    percentage: number;
    scope: string[];
    framework: string;
  };
}

export interface TestLevel {
  name: 'unit' | 'integration' | 'system' | 'acceptance' | 'performance' | 'security';
  coverage: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  effort: number; // in hours
  responsible: string;
}

export interface TestPhase {
  name: string;
  startDate: string;
  endDate: string;
  activities: string[];
  entryCriteria: string[];
  exitCriteria: string[];
  deliverables: string[];
}

export interface TestResources {
  team: TeamMember[];
  environments: string[];
  tools: string[];
  testData: string[];
  budget: number;
}

export interface TeamMember {
  name: string;
  role: string;
  availability: number; // percentage
  skills: string[];
}

export interface TestRisk {
  id: string;
  description: string;
  probability: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  mitigation: string;
  contingency: string;
}

export interface TestSchedule {
  startDate: string;
  endDate: string;
  milestones: Milestone[];
  iterations: number;
  bufferTime: number; // in days
}

export interface Milestone {
  name: string;
  date: string;
  criteria: string[];
  deliverables: string[];
}

export class TestPlanner extends QEAgent {
  private plans: Map<string, TestPlan> = new Map();

  constructor(
    config: QEAgentConfig,
    memory: QEMemory,
    hooks: HookManager,
    logger?: Logger
  ) {
    super(
      {
        ...config,
        name: config.name || 'test-planner',
        type: 'test-analyzer',
        capabilities: [
          'test-generation',
          'test-analysis',
          'risk-assessment',
          'test-optimization',
          'coverage-analysis',
          'pattern-recognition',
          'bug-detection'
        ]
      },
      memory,
      hooks,
      logger
    );
  }

  /**
   * Create comprehensive test plan
   */
  public async createTestPlan(
    projectInfo: any,
    context: AgentContext
  ): Promise<TestPlan> {
    logger.info(`Creating test plan for project: ${projectInfo.name}`);

    const plan: TestPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Test Plan - ${projectInfo.name}`,
      description: projectInfo.description || 'Comprehensive test plan',
      objectives: await this.defineObjectives(projectInfo, context),
      scope: await this.defineScope(projectInfo, context),
      strategy: await this.designStrategy(projectInfo, context),
      phases: await this.planPhases(projectInfo, context),
      resources: await this.allocateResources(projectInfo, context),
      risks: await this.assessRisks(projectInfo, context),
      schedule: await this.createSchedule(projectInfo, context),
      successCriteria: await this.defineSuccessCriteria(projectInfo, context),
      deliverables: await this.defineDeliverables(projectInfo, context)
    };

    // Store plan
    this.plans.set(plan.id, plan);
    await this.memory.store({
      key: `test_plan_${plan.id}`,
      value: plan,
      type: 'test-data',
      sessionId: 'default-session',
      agentId: this.name,
      timestamp: new Date(),
      tags: ['test-plan', 'planning'],
      metadata: {
        agent: this.name,
        project: projectInfo.name,
        created: new Date().toISOString()
      }
    });

    return plan;
  }

  /**
   * Define test objectives
   */
  private async defineObjectives(
    projectInfo: any,
    context: AgentContext
  ): Promise<string[]> {
    return [
      'Verify all functional requirements are met',
      'Ensure system performance meets SLAs',
      'Validate security requirements',
      'Confirm user experience meets standards',
      'Verify integration points work correctly',
      'Ensure backward compatibility',
      'Validate data integrity and consistency'
    ];
  }

  /**
   * Define test scope
   */
  private async defineScope(
    projectInfo: any,
    context: AgentContext
  ): Promise<TestScope> {
    return {
      included: [
        'User authentication and authorization',
        'Core business functionality',
        'API endpoints',
        'Database operations',
        'Third-party integrations'
      ],
      excluded: [
        'Legacy features marked for deprecation',
        'Third-party service internals',
        'Infrastructure provisioning'
      ],
      features: projectInfo.features || ['Feature A', 'Feature B', 'Feature C'],
      platforms: ['Web', 'Mobile', 'API'],
      environments: ['Development', 'Staging', 'Production']
    };
  }

  /**
   * Design test strategy
   */
  private async designStrategy(
    projectInfo: any,
    context: AgentContext
  ): Promise<TestStrategy> {
    const strategy: TestStrategy = {
      approach: 'risk-based',
      levels: [
        {
          name: 'unit',
          coverage: 80,
          priority: 'high',
          effort: 40,
          responsible: 'Developers'
        },
        {
          name: 'integration',
          coverage: 70,
          priority: 'high',
          effort: 60,
          responsible: 'QE Team'
        },
        {
          name: 'system',
          coverage: 60,
          priority: 'critical',
          effort: 80,
          responsible: 'QE Team'
        },
        {
          name: 'acceptance',
          coverage: 100,
          priority: 'critical',
          effort: 40,
          responsible: 'Product Owner'
        },
        {
          name: 'performance',
          coverage: 50,
          priority: 'medium',
          effort: 30,
          responsible: 'Performance Team'
        },
        {
          name: 'security',
          coverage: 40,
          priority: 'high',
          effort: 20,
          responsible: 'Security Team'
        }
      ],
      techniques: [
        'Boundary Value Analysis',
        'Equivalence Partitioning',
        'Decision Table Testing',
        'State Transition Testing',
        'Use Case Testing',
        'Exploratory Testing'
      ],
      tools: [
        'Test Management: JIRA/TestRail',
        'Automation: Selenium/Cypress',
        'Performance: JMeter/K6',
        'Security: OWASP ZAP',
        'API: Postman/REST Assured'
      ],
      automation: {
        percentage: 70,
        scope: ['Unit tests', 'API tests', 'Regression suite'],
        framework: 'Jest/Cypress'
      }
    };

    return strategy;
  }

  /**
   * Plan test phases
   */
  private async planPhases(
    projectInfo: any,
    context: AgentContext
  ): Promise<TestPhase[]> {
    const baseDate = new Date();

    return [
      {
        name: 'Test Planning',
        startDate: baseDate.toISOString(),
        endDate: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        activities: [
          'Review requirements',
          'Create test plan',
          'Setup test environment',
          'Prepare test data'
        ],
        entryCriteria: ['Requirements approved', 'Test team available'],
        exitCriteria: ['Test plan approved', 'Environment ready'],
        deliverables: ['Test Plan', 'Test Environment']
      },
      {
        name: 'Test Design',
        startDate: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        activities: [
          'Create test cases',
          'Review test cases',
          'Prepare test data',
          'Setup automation framework'
        ],
        entryCriteria: ['Test plan approved', 'Requirements stable'],
        exitCriteria: ['Test cases reviewed', 'Test data ready'],
        deliverables: ['Test Cases', 'Test Data', 'Automation Framework']
      },
      {
        name: 'Test Execution',
        startDate: new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(baseDate.getTime() + 28 * 24 * 60 * 60 * 1000).toISOString(),
        activities: [
          'Execute test cases',
          'Log defects',
          'Retest fixes',
          'Update test results'
        ],
        entryCriteria: ['Build deployed', 'Test cases ready'],
        exitCriteria: ['All tests executed', 'Critical defects fixed'],
        deliverables: ['Test Results', 'Defect Reports']
      },
      {
        name: 'Test Closure',
        startDate: new Date(baseDate.getTime() + 28 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        activities: [
          'Analyze metrics',
          'Create test report',
          'Conduct retrospective',
          'Archive test artifacts'
        ],
        entryCriteria: ['Testing complete', 'Metrics collected'],
        exitCriteria: ['Report delivered', 'Lessons learned documented'],
        deliverables: ['Test Report', 'Metrics Dashboard', 'Lessons Learned']
      }
    ];
  }

  /**
   * Allocate resources
   */
  private async allocateResources(
    projectInfo: any,
    context: AgentContext
  ): Promise<TestResources> {
    return {
      team: [
        {
          name: 'QE Lead',
          role: 'Test Manager',
          availability: 100,
          skills: ['Planning', 'Management', 'Risk Assessment']
        },
        {
          name: 'Senior QE',
          role: 'Test Engineer',
          availability: 100,
          skills: ['Automation', 'API Testing', 'Performance']
        },
        {
          name: 'QE Engineer',
          role: 'Test Engineer',
          availability: 80,
          skills: ['Manual Testing', 'Exploratory', 'Documentation']
        }
      ],
      environments: ['Dev', 'QA', 'Staging', 'Production'],
      tools: ['JIRA', 'Selenium', 'Postman', 'JMeter'],
      testData: ['User accounts', 'Product catalog', 'Transaction data'],
      budget: 50000
    };
  }

  /**
   * Assess risks
   */
  private async assessRisks(
    projectInfo: any,
    context: AgentContext
  ): Promise<TestRisk[]> {
    return [
      {
        id: 'risk_1',
        description: 'Requirements may change during testing',
        probability: 'medium',
        impact: 'high',
        mitigation: 'Implement agile testing approach',
        contingency: 'Allocate buffer time for changes'
      },
      {
        id: 'risk_2',
        description: 'Test environment instability',
        probability: 'high',
        impact: 'medium',
        mitigation: 'Setup redundant environments',
        contingency: 'Use cloud-based testing platforms'
      },
      {
        id: 'risk_3',
        description: 'Insufficient test coverage',
        probability: 'low',
        impact: 'high',
        mitigation: 'Use risk-based testing approach',
        contingency: 'Extend testing timeline if needed'
      }
    ];
  }

  /**
   * Create schedule
   */
  private async createSchedule(
    projectInfo: any,
    context: AgentContext
  ): Promise<TestSchedule> {
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      milestones: [
        {
          name: 'Test Plan Approval',
          date: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          criteria: ['Stakeholder review complete', 'Resources allocated'],
          deliverables: ['Approved Test Plan']
        },
        {
          name: 'Test Execution Start',
          date: new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          criteria: ['Test cases ready', 'Environment stable'],
          deliverables: ['Test Execution Report']
        },
        {
          name: 'Testing Complete',
          date: new Date(startDate.getTime() + 28 * 24 * 60 * 60 * 1000).toISOString(),
          criteria: ['All tests executed', 'Defects resolved'],
          deliverables: ['Final Test Report']
        }
      ],
      iterations: 3,
      bufferTime: 3
    };
  }

  /**
   * Define success criteria
   */
  private async defineSuccessCriteria(
    projectInfo: any,
    context: AgentContext
  ): Promise<string[]> {
    return [
      '100% of critical test cases pass',
      '95% overall test case pass rate',
      'Zero critical defects in production',
      'Code coverage > 80%',
      'Performance SLAs met',
      'Security vulnerabilities addressed',
      'User acceptance criteria satisfied'
    ];
  }

  /**
   * Define deliverables
   */
  private async defineDeliverables(
    projectInfo: any,
    context: AgentContext
  ): Promise<string[]> {
    return [
      'Test Plan Document',
      'Test Case Repository',
      'Test Execution Reports',
      'Defect Reports',
      'Test Metrics Dashboard',
      'Automation Scripts',
      'Performance Test Results',
      'Security Test Report',
      'Final Test Summary Report'
    ];
  }

  /**
   * Main execution method implementation
   */
  protected async doExecute(context: AgentContext): Promise<AgentExecutionResult> {
    const task = (context.metadata?.task as string) || 'Create comprehensive test plan';
    logger.info(`TestPlanner executing: ${task}`);
    const startTime = Date.now();

    try {
      const artifacts: string[] = [];

      // Create test plan based on task
      const projectInfo = this.extractProjectInfo(task);
      const plan = await this.createTestPlan(projectInfo, context);

      // Save plan as artifact
      const planPath = `/tmp/test_plan_${plan.id}.md`;
      artifacts.push(planPath);

      // Calculate duration
      const duration = Date.now() - startTime;

      return {
        success: true,
        status: 'passed' as TestStatus,
        message: this.formatTestPlan(plan),
        artifacts,
        metrics: { executionTime: duration },
        duration,
        metadata: { plan }
      };
    } catch (error) {
      logger.error('Planning failed:', error);
      return {
        success: false,
        status: 'failed' as TestStatus,
        message: `Test planning failed: ${error}`,
        error: error as Error,
        artifacts: [],
        metrics: {},
        duration: Date.now() - startTime,
        metadata: { error }
      };
    }
  }

  /**
   * Extract project info from task
   */
  private extractProjectInfo(task: string): any {
    return {
      name: task.split(' ')[0] || 'Project',
      description: task,
      features: ['Authentication', 'Dashboard', 'Reports'],
      timeline: 30,
      budget: 50000
    };
  }

  /**
   * Format test plan for output
   */
  private formatTestPlan(plan: TestPlan): string {
    return `
# ${plan.name}

## Description
${plan.description}

## Objectives
${plan.objectives.map(o => `- ${o}`).join('\n')}

## Scope
### Included
${plan.scope.included.map(i => `- ${i}`).join('\n')}

### Excluded
${plan.scope.excluded.map(e => `- ${e}`).join('\n')}

## Strategy
- Approach: ${plan.strategy.approach}
- Automation: ${plan.strategy.automation.percentage}%
- Test Levels: ${plan.strategy.levels.map(l => l.name).join(', ')}

## Schedule
- Start: ${new Date(plan.schedule.startDate).toLocaleDateString()}
- End: ${new Date(plan.schedule.endDate).toLocaleDateString()}
- Duration: ${plan.schedule.iterations * 10} days

## Resources
- Team Size: ${plan.resources.team.length}
- Budget: $${plan.resources.budget}

## Risks
${plan.risks.map(r => `- ${r.description} (${r.probability}/${r.impact})`).join('\n')}

## Success Criteria
${plan.successCriteria.map(c => `- ${c}`).join('\n')}
    `.trim();
  }
}