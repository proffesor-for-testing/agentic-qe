# v3-qe-integration

## Purpose
Guide the implementation of cross-domain integration for AQE v3, ensuring seamless communication between bounded contexts and external systems.

## Activation
- When implementing cross-domain workflows
- When integrating with external systems
- When building domain event handlers
- When creating integration tests

## Integration Architecture

### 1. Domain Event Integration

```typescript
// v3/src/integration/events/DomainEventRouter.ts
import { DomainEvent, EventHandler } from '@aqe/shared-kernel';

export class DomainEventRouter {
  private readonly handlers: Map<string, EventHandler[]> = new Map();
  private readonly deadLetterQueue: DomainEvent[] = [];

  // Register cross-domain event handlers
  registerHandler(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  // Route events to appropriate handlers
  async route(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];

    if (handlers.length === 0) {
      console.warn(`No handler for event: ${event.type}`);
      this.deadLetterQueue.push(event);
      return;
    }

    await Promise.all(handlers.map(h => this.safeExecute(h, event)));
  }

  private async safeExecute(handler: EventHandler, event: DomainEvent): Promise<void> {
    try {
      await handler(event);
    } catch (error) {
      await this.handleError(error, event);
    }
  }
}

// Cross-domain event handlers
export const CROSS_DOMAIN_HANDLERS = {
  // Test Generation → Coverage Analysis
  'TestSuiteCreated': async (event: TestSuiteCreated) => {
    const coverageAnalyzer = await getCoverageAnalyzer();
    await coverageAnalyzer.scheduleAnalysis(event.testSuiteId);
  },

  // Coverage Analysis → Quality Assessment
  'CoverageAnalyzed': async (event: CoverageAnalyzed) => {
    const qualityGate = await getQualityGate();
    await qualityGate.updateCoverageMetrics(event.coverage);
  },

  // Test Execution → Defect Intelligence
  'TestFailed': async (event: TestFailed) => {
    const defectPredictor = await getDefectPredictor();
    await defectPredictor.analyzeFailure(event.failure);
  },

  // Defect Intelligence → Learning
  'DefectPatternDetected': async (event: DefectPatternDetected) => {
    const learningCoordinator = await getLearningCoordinator();
    await learningCoordinator.learnFromPattern(event.pattern);
  },

  // Quality Gate → All Domains
  'QualityGateFailed': async (event: QualityGateFailed) => {
    await notifyAllAgents(event);
    await pauseDeploymentPipeline(event.reason);
  }
};
```

### 2. Anti-Corruption Layer

```typescript
// v3/src/integration/acl/ExternalSystemACL.ts
export class ExternalSystemACL {
  // Translate external CI/CD events to domain events
  async translateCIEvent(ciEvent: CIEvent): Promise<DomainEvent> {
    switch (ciEvent.type) {
      case 'build.completed':
        return new BuildCompleted({
          buildId: ciEvent.id,
          status: this.mapStatus(ciEvent.status),
          artifacts: this.mapArtifacts(ciEvent.artifacts)
        });

      case 'test.run.completed':
        return new ExternalTestRunCompleted({
          runId: ciEvent.id,
          results: this.mapTestResults(ciEvent.results),
          coverage: this.mapCoverage(ciEvent.coverage)
        });

      default:
        throw new UnknownEventTypeError(ciEvent.type);
    }
  }

  // Translate domain commands to external API calls
  async executeExternalCommand(command: DomainCommand): Promise<void> {
    switch (command.type) {
      case 'TriggerCIBuild':
        await this.ciClient.triggerBuild({
          branch: command.branch,
          config: this.mapBuildConfig(command.config)
        });
        break;

      case 'DeployToEnvironment':
        await this.deployClient.deploy({
          environment: command.environment,
          version: command.version,
          config: this.mapDeployConfig(command.config)
        });
        break;
    }
  }

  private mapStatus(externalStatus: string): DomainStatus {
    const mapping: Record<string, DomainStatus> = {
      'success': 'passed',
      'failure': 'failed',
      'cancelled': 'cancelled',
      'timeout': 'timeout'
    };
    return mapping[externalStatus] || 'unknown';
  }
}
```

### 3. Integration Workflows

```typescript
// v3/src/integration/workflows/QualityPipelineWorkflow.ts
export class QualityPipelineWorkflow {
  constructor(
    private readonly testGenerator: TestGenerationService,
    private readonly coverageAnalyzer: CoverageAnalysisService,
    private readonly qualityGate: QualityAssessmentService,
    private readonly executor: TestExecutionService
  ) {}

  // Full quality pipeline workflow
  async execute(change: CodeChange): Promise<PipelineResult> {
    const steps: WorkflowStep[] = [];

    // Step 1: Generate tests for changed code
    const generatedTests = await this.executeStep('generate-tests', async () => {
      return this.testGenerator.generateForChange(change);
    });
    steps.push(generatedTests);

    // Step 2: Execute all tests
    const executionResult = await this.executeStep('execute-tests', async () => {
      return this.executor.executeAll({
        includingGenerated: generatedTests.output.tests,
        parallelism: 4
      });
    });
    steps.push(executionResult);

    // Step 3: Analyze coverage
    const coverageResult = await this.executeStep('analyze-coverage', async () => {
      return this.coverageAnalyzer.analyze(executionResult.output.coverageData);
    });
    steps.push(coverageResult);

    // Step 4: Evaluate quality gate
    const gateResult = await this.executeStep('quality-gate', async () => {
      return this.qualityGate.evaluate({
        testResults: executionResult.output,
        coverage: coverageResult.output,
        change
      });
    });
    steps.push(gateResult);

    return {
      passed: gateResult.output.passed,
      steps,
      summary: this.generateSummary(steps)
    };
  }

  private async executeStep<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<WorkflowStep<T>> {
    const start = Date.now();
    try {
      const output = await fn();
      return {
        name,
        status: 'completed',
        duration: Date.now() - start,
        output
      };
    } catch (error) {
      return {
        name,
        status: 'failed',
        duration: Date.now() - start,
        error: error.message
      };
    }
  }
}
```

### 4. External System Integrations

```typescript
// v3/src/integration/external/GitHubIntegration.ts
export class GitHubIntegration {
  constructor(
    private readonly client: Octokit,
    private readonly eventRouter: DomainEventRouter
  ) {}

  // Webhook handler
  async handleWebhook(event: GitHubWebhookEvent): Promise<void> {
    switch (event.action) {
      case 'pull_request.opened':
      case 'pull_request.synchronize':
        await this.handlePullRequest(event);
        break;

      case 'check_run.completed':
        await this.handleCheckRun(event);
        break;

      case 'workflow_run.completed':
        await this.handleWorkflowRun(event);
        break;
    }
  }

  private async handlePullRequest(event: PREvent): Promise<void> {
    // Trigger quality analysis for PR
    const change = this.extractChange(event);

    await this.eventRouter.route(new PullRequestOpened({
      prNumber: event.number,
      branch: event.head.ref,
      changes: change.files,
      author: event.user.login
    }));
  }

  // Post quality results back to GitHub
  async postQualityResults(prNumber: number, results: QualityResults): Promise<void> {
    // Create check run
    await this.client.checks.create({
      owner: this.config.owner,
      repo: this.config.repo,
      name: 'AQE Quality Gate',
      head_sha: results.commitSha,
      status: 'completed',
      conclusion: results.passed ? 'success' : 'failure',
      output: {
        title: 'Quality Gate Results',
        summary: this.formatSummary(results),
        text: this.formatDetails(results)
      }
    });

    // Post comment with details
    await this.client.issues.createComment({
      owner: this.config.owner,
      repo: this.config.repo,
      issue_number: prNumber,
      body: this.formatComment(results)
    });
  }
}

// v3/src/integration/external/SlackIntegration.ts
export class SlackIntegration {
  async notifyQualityGateResult(result: QualityGateResult): Promise<void> {
    const color = result.passed ? '#36a64f' : '#ff0000';
    const icon = result.passed ? ':white_check_mark:' : ':x:';

    await this.client.chat.postMessage({
      channel: this.config.channel,
      attachments: [{
        color,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${icon} *Quality Gate ${result.passed ? 'Passed' : 'Failed'}*`
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Coverage:* ${result.coverage}%` },
              { type: 'mrkdwn', text: `*Tests:* ${result.testsPassed}/${result.testsTotal}` },
              { type: 'mrkdwn', text: `*Branch:* ${result.branch}` },
              { type: 'mrkdwn', text: `*Commit:* ${result.commitSha.slice(0, 7)}` }
            ]
          }
        ]
      }]
    });
  }
}
```

### 5. Integration Testing

```typescript
// v3/src/integration/tests/IntegrationTestFramework.ts
export class IntegrationTestFramework {
  private readonly eventCapture: EventCapture;
  private readonly mockServer: MockServer;

  constructor() {
    this.eventCapture = new EventCapture();
    this.mockServer = new MockServer();
  }

  // Test cross-domain integration
  async testCrossDomainFlow(scenario: IntegrationScenario): Promise<TestResult> {
    // Setup
    await this.setup(scenario.setup);

    // Trigger initial event
    await this.triggerEvent(scenario.trigger);

    // Wait for cascading events
    await this.waitForEvents(scenario.expectedEvents);

    // Verify final state
    const finalState = await this.captureFinalState(scenario.domains);
    return this.verify(finalState, scenario.expectedState);
  }

  private async waitForEvents(expected: ExpectedEvent[]): Promise<void> {
    const timeout = 5000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const captured = this.eventCapture.getAll();
      const allReceived = expected.every(e =>
        captured.some(c => c.type === e.type && this.matchPayload(c, e))
      );

      if (allReceived) return;
      await sleep(100);
    }

    throw new TimeoutError('Expected events not received');
  }
}

// Example integration test
describe('Cross-Domain Integration', () => {
  it('should trigger coverage analysis when test suite is created', async () => {
    await framework.testCrossDomainFlow({
      setup: {
        agents: ['v3-qe-test-architect', 'v3-qe-coverage-specialist']
      },
      trigger: new TestSuiteCreated({
        testSuiteId: 'suite-1',
        path: 'src/user.ts'
      }),
      expectedEvents: [
        { type: 'CoverageAnalysisScheduled', payload: { testSuiteId: 'suite-1' } },
        { type: 'CoverageAnalyzed', payload: { testSuiteId: 'suite-1' } }
      ],
      expectedState: {
        'coverage-analysis': { hasReport: true }
      }
    });
  });
});
```

### 6. Message Queue Integration

```typescript
// v3/src/integration/messaging/QEMessageBroker.ts
export class QEMessageBroker {
  private readonly publisher: Publisher;
  private readonly consumer: Consumer;

  constructor(config: MessageBrokerConfig) {
    this.publisher = new Publisher(config);
    this.consumer = new Consumer(config);
  }

  // Publish domain events to message queue
  async publishEvent(event: DomainEvent): Promise<void> {
    const message = {
      id: event.id,
      type: event.type,
      payload: event.payload,
      timestamp: event.timestamp,
      correlationId: event.correlationId
    };

    await this.publisher.publish(
      `qe.events.${event.domain}`,
      message
    );
  }

  // Subscribe to events from specific domains
  async subscribe(
    domain: string,
    handler: (event: DomainEvent) => Promise<void>
  ): Promise<void> {
    await this.consumer.subscribe(
      `qe.events.${domain}`,
      async (message) => {
        const event = this.deserialize(message);
        await handler(event);
      }
    );
  }

  // Request-reply pattern for synchronous queries
  async query<T>(domain: string, query: Query): Promise<T> {
    const replyTo = `qe.replies.${uuid()}`;
    const correlationId = uuid();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new TimeoutError()), 5000);

      this.consumer.subscribeOnce(replyTo, (message) => {
        clearTimeout(timeout);
        resolve(message.payload);
      });

      this.publisher.publish(`qe.queries.${domain}`, {
        ...query,
        replyTo,
        correlationId
      });
    });
  }
}
```

## Integration Patterns

| Pattern | Use Case | Example |
|---------|----------|---------|
| Event-Driven | Async cross-domain | TestCreated → CoverageAnalysis |
| Anti-Corruption | External systems | CI/CD events → Domain events |
| Saga | Multi-step workflows | Quality Pipeline |
| Request-Reply | Sync queries | Get coverage for PR |
| Publish-Subscribe | Broadcast events | Quality gate failed |

## Implementation Checklist

- [ ] Implement DomainEventRouter
- [ ] Create Anti-Corruption Layer
- [ ] Build integration workflows
- [ ] Add GitHub integration
- [ ] Add Slack notifications
- [ ] Create integration test framework
- [ ] Implement message broker
- [ ] Write integration tests

## Related Skills
- v3-qe-core-implementation - Domain events
- v3-qe-fleet-coordination - Agent orchestration
- v3-qe-mcp - External tool integration
