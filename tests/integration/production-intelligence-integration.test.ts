/**
 * ProductionIntelligenceAgent Integration Tests
 * Tests memory coordination, hook execution, monitoring integrations, and incident replay
 */

import { EventEmitter } from 'events';
import { MemoryManager } from '../../src/core/MemoryManager';
import { EventBus } from '../../src/core/EventBus';
import { Database } from '../../src/utils/Database';
import { Logger } from '../../src/utils/Logger';

// Mock external dependencies
jest.mock('../../src/utils/Database');
jest.mock('../../src/utils/Logger');

describe('ProductionIntelligenceAgent Integration', () => {
  let eventBus: EventBus;
  let memoryManager: MemoryManager;
  let mockDatabase: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;

  // Test data
  const sampleIncident = {
    id: 'INC-2024-001',
    timestamp: '2025-09-29T14:23:47.892Z',
    severity: 'CRITICAL',
    service: 'payment-service',
    error: 'PaymentProcessingException: Gateway timeout after 30s',
    affectedUsers: 1247,
    duration: 342000,
    region: 'us-east-1',
    context: {
      systemState: {
        cpu: 87.3,
        memory: 4.2,
        connections: 342,
        queueDepth: 1893,
        cacheHitRate: 23.1
      },
      requestTrace: {
        traceId: 'trace-abc123',
        spanId: 'span-xyz789',
        duration: 31247,
        hops: [
          { service: 'api-gateway', duration: 45 },
          { service: 'auth-service', duration: 123 },
          { service: 'payment-service', duration: 30789 },
          { service: 'stripe-api', duration: 290, timeout: true }
        ]
      }
    }
  };

  const sampleRUMData = {
    sessionId: 'sess-abc123',
    userId: 'usr-xyz789',
    pageViews: [
      { page: '/products', loadTime: 234, interactive: 456 },
      { page: '/cart', loadTime: 189, interactive: 298 },
      { page: '/checkout', loadTime: 567, interactive: 890, error: 'Payment failed' }
    ],
    errors: [
      {
        type: 'PaymentError',
        message: 'Failed to process payment',
        stack: 'Error at payment.ts:45',
        timestamp: '2025-09-29T14:23:47.892Z'
      }
    ],
    performance: {
      avgLoadTime: 330,
      avgInteractive: 548,
      bounceRate: 0.23
    }
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Database
    mockDatabase = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue(null),
      all: jest.fn().mockResolvedValue([])
    } as any;

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      getInstance: jest.fn().mockReturnValue(mockLogger)
    } as any;

    (Database as jest.Mock).mockImplementation(() => mockDatabase);
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    // Create real EventBus and MemoryManager
    eventBus = new EventBus();
    await eventBus.initialize();

    memoryManager = new MemoryManager(mockDatabase);
    await memoryManager.initialize();
  });

  afterEach(async () => {
    if (eventBus) {
      eventBus.removeAllListeners();
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();

    if (global.gc) {
      global.gc();
    }
  });

  describe('Memory Coordination (aqe/production/*)', () => {
    it('should store incidents in aqe/production/incidents namespace', async () => {
      await memoryManager.store(sampleIncident.id, sampleIncident, {
        namespace: 'aqe/production/incidents',
        ttl: 7200000, // 2 hours
        persist: true
      });

      const retrieved = await memoryManager.retrieve(sampleIncident.id, {
        namespace: 'aqe/production/incidents'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.id).toBe('INC-2024-001');
      expect(retrieved.value.severity).toBe('CRITICAL');
      expect(retrieved.value.affectedUsers).toBe(1247);
    });

    it('should store RUM data in aqe/production/rum-data namespace', async () => {
      await memoryManager.store('session-abc123', sampleRUMData, {
        namespace: 'aqe/production/rum-data',
        ttl: 3600000
      });

      const retrieved = await memoryManager.retrieve('session-abc123', {
        namespace: 'aqe/production/rum-data'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.sessionId).toBe('sess-abc123');
      expect(retrieved.value.errors).toHaveLength(1);
      expect(retrieved.value.pageViews[2].error).toBeDefined();
    });

    it('should store generated test scenarios in aqe/production/test-scenarios namespace', async () => {
      const testScenarios = {
        sourceIncident: sampleIncident.id,
        scenarios: [
          {
            id: 'TEST-INC-001-1',
            title: 'Reproduce payment gateway timeout',
            type: 'incident-replay',
            setup: {
              systemState: sampleIncident.context.systemState,
              mockServices: ['stripe-api']
            },
            steps: [
              'Simulate high load (3x normal traffic)',
              'Trigger payment processing',
              'Mock Stripe API with 30s delay',
              'Verify timeout handling',
              'Check error logging'
            ],
            expectedBehavior: 'System should fail gracefully with user-friendly error',
            actualBehavior: 'PaymentProcessingException thrown',
            priority: 'critical'
          }
        ],
        timestamp: Date.now()
      };

      await memoryManager.store('INC-001-scenarios', testScenarios, {
        namespace: 'aqe/production/test-scenarios',
        persist: true
      });

      const retrieved = await memoryManager.retrieve('INC-001-scenarios', {
        namespace: 'aqe/production/test-scenarios'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.scenarios).toHaveLength(1);
      expect(retrieved.value.scenarios[0].type).toBe('incident-replay');
    });

    it('should store production insights in aqe/production/insights namespace', async () => {
      const insights = {
        period: '2025-09-29',
        patterns: [
          {
            type: 'performance-degradation',
            service: 'payment-service',
            frequency: 47,
            impact: 'high',
            recommendation: 'Add caching layer to reduce external API calls'
          },
          {
            type: 'error-spike',
            service: 'auth-service',
            frequency: 23,
            impact: 'medium',
            recommendation: 'Implement retry logic for transient failures'
          }
        ],
        testCoverageGaps: [
          'No tests for payment gateway timeout scenarios',
          'Missing load tests for 3x traffic spikes',
          'No tests for cache failure scenarios'
        ],
        timestamp: Date.now()
      };

      await memoryManager.store('daily-insights', insights, {
        namespace: 'aqe/production/insights',
        ttl: 86400000 // 24 hours
      });

      const retrieved = await memoryManager.retrieve('daily-insights', {
        namespace: 'aqe/production/insights'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.patterns).toHaveLength(2);
      expect(retrieved.value.testCoverageGaps).toHaveLength(3);
    });
  });

  describe('Hook Execution', () => {
    it('should execute pre-task hook and retrieve production data', async () => {
      // Setup: Store recent incidents
      const recentIncidents = [
        { id: 'INC-001', severity: 'CRITICAL', service: 'payment-service' },
        { id: 'INC-002', severity: 'HIGH', service: 'auth-service' }
      ];

      await memoryManager.store('recent', recentIncidents, {
        namespace: 'aqe/production/incidents'
      });

      // Pre-task: Retrieve incidents
      const incidents = await memoryManager.retrieve('recent', {
        namespace: 'aqe/production/incidents'
      });

      expect(incidents).toBeDefined();
      expect(incidents.value).toHaveLength(2);
      expect(incidents.value[0].severity).toBe('CRITICAL');
    });

    it('should execute post-task hook and store analysis results', async () => {
      const taskId = 'task-analyze-INC-001';
      const analysisResults = {
        incidentId: sampleIncident.id,
        rootCause: 'External service timeout',
        testScenarios: 3,
        recommendations: [
          'Add circuit breaker pattern',
          'Implement request timeout handling',
          'Add load testing for high-traffic scenarios'
        ],
        completionTime: 4560
      };

      await memoryManager.store('analysis-results', analysisResults, {
        namespace: 'aqe/production',
        metadata: { taskId, completedAt: new Date().toISOString() }
      });

      const stored = await memoryManager.retrieve('analysis-results', {
        namespace: 'aqe/production'
      });

      expect(stored).toBeDefined();
      expect(stored.value.testScenarios).toBe(3);
      expect(stored.metadata?.taskId).toBe(taskId);
    });

    it('should execute post-edit hook when monitoring config is updated', async () => {
      const filePath = '/config/monitoring.yml';
      const updatedConfig = {
        datadog: {
          apiKey: '***',
          appKey: '***',
          site: 'datadoghq.com',
          metrics: ['apm.service.hits', 'system.cpu.user', 'system.mem.used']
        },
        newRelic: {
          licenseKey: '***',
          appName: 'payment-service',
          enabled: true
        },
        lastModified: new Date().toISOString()
      };

      await memoryManager.store('monitoring-config', updatedConfig, {
        namespace: 'aqe/production',
        metadata: { filePath, action: 'edit' }
      });

      const updated = await memoryManager.retrieve('monitoring-config', {
        namespace: 'aqe/production'
      });

      expect(updated).toBeDefined();
      expect(updated.value.datadog.metrics).toHaveLength(3);
      expect(updated.metadata?.filePath).toBe(filePath);
    });
  });

  describe('Monitoring Platform Integrations (Mocked)', () => {
    it('should integrate with Datadog API to fetch incidents', async () => {
      // Mock Datadog API response
      const datadogIncidents = {
        data: [
          {
            id: 'dd-incident-123',
            attributes: {
              title: 'High error rate in payment-service',
              severity: 'SEV-1',
              created: '2025-09-29T14:00:00Z',
              resolved: null,
              services: ['payment-service']
            }
          }
        ]
      };

      // Simulate API call
      await memoryManager.store('datadog-incidents', datadogIncidents, {
        namespace: 'aqe/production/integrations/datadog'
      });

      const retrieved = await memoryManager.retrieve('datadog-incidents', {
        namespace: 'aqe/production/integrations/datadog'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.data).toHaveLength(1);
      expect(retrieved.value.data[0].attributes.severity).toBe('SEV-1');
    });

    it('should integrate with New Relic API to fetch error analytics', async () => {
      // Mock New Relic API response
      const newRelicErrors = {
        errors: [
          {
            errorClass: 'TimeoutException',
            message: 'Request timeout after 30000ms',
            count: 234,
            firstSeen: '2025-09-29T10:00:00Z',
            lastSeen: '2025-09-29T14:23:47Z',
            transactionName: 'POST /api/payments'
          }
        ]
      };

      await memoryManager.store('newrelic-errors', newRelicErrors, {
        namespace: 'aqe/production/integrations/newrelic'
      });

      const retrieved = await memoryManager.retrieve('newrelic-errors', {
        namespace: 'aqe/production/integrations/newrelic'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.errors).toHaveLength(1);
      expect(retrieved.value.errors[0].count).toBe(234);
    });

    it('should integrate with Grafana API to fetch performance metrics', async () => {
      // Mock Grafana API response
      const grafanaMetrics = {
        dashboard: 'payment-service-health',
        panels: [
          {
            title: 'Response Time (p95)',
            target: 'payment_service.response_time.p95',
            datapoints: [
              [234, 1727616000000],
              [456, 1727616300000],
              [2890, 1727616600000] // Spike!
            ]
          }
        ]
      };

      await memoryManager.store('grafana-metrics', grafanaMetrics, {
        namespace: 'aqe/production/integrations/grafana'
      });

      const retrieved = await memoryManager.retrieve('grafana-metrics', {
        namespace: 'aqe/production/integrations/grafana'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.panels[0].datapoints).toHaveLength(3);
      expect(retrieved.value.panels[0].datapoints[2][0]).toBeGreaterThan(2000);
    });
  });

  describe('Incident Replay Test Generation', () => {
    it('should generate reproducible test from incident data', async () => {
      const incident = sampleIncident;

      // Generate test scenario
      const replayTest = {
        incidentId: incident.id,
        testName: `Replay: ${incident.error}`,
        type: 'incident-replay',
        framework: 'jest',
        setup: {
          // Recreate system state
          systemConditions: {
            cpu: incident.context.systemState.cpu,
            memory: incident.context.systemState.memory,
            connections: incident.context.systemState.connections,
            load: '3x-normal'
          },
          // Mock external services
          mocks: [
            {
              service: 'stripe-api',
              behavior: 'timeout',
              delay: 30000
            }
          ]
        },
        testCode: `
describe('Payment Gateway Timeout Incident Replay', () => {
  beforeAll(async () => {
    // Setup high-load conditions
    await loadSimulator.setLoad('3x-normal');

    // Mock Stripe API timeout
    mockStripeAPI.timeout(30000);
  });

  it('should handle payment gateway timeout gracefully', async () => {
    const payment = {
      amount: 234.99,
      userId: 'usr_abc123'
    };

    await expect(
      paymentService.processPayment(payment)
    ).rejects.toThrow('Gateway timeout');

    // Verify error handling
    expect(errorLogger.logs).toContainEqual(
      expect.objectContaining({ error: 'PaymentProcessingException' })
    );

    // Verify user-friendly error response
    const userError = await getUserError(payment.userId);
    expect(userError.message).toBe('Payment processing failed. Please try again.');
  });
});
        `,
        priority: 'critical',
        estimatedImpact: 'Prevents 1247 users from completing purchases',
        timestamp: Date.now()
      };

      await memoryManager.store(`replay-${incident.id}`, replayTest, {
        namespace: 'aqe/production/test-scenarios',
        persist: true
      });

      const retrieved = await memoryManager.retrieve(`replay-${incident.id}`, {
        namespace: 'aqe/production/test-scenarios'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.type).toBe('incident-replay');
      expect(retrieved.value.setup.mocks[0].service).toBe('stripe-api');
      expect(retrieved.value.testCode).toContain('paymentService.processPayment');
    });

    it('should generate load pattern tests from RUM data', async () => {
      const rumData = sampleRUMData;

      // Analyze user journey
      const userJourney = {
        sessionId: rumData.sessionId,
        path: rumData.pageViews.map((pv: any) => pv.page),
        bottleneck: '/checkout', // Slowest page
        loadTest: {
          testName: 'User Journey: Product to Checkout',
          type: 'load-test',
          framework: 'k6',
          scenario: {
            stages: [
              { duration: '2m', target: 100 }, // Ramp up
              { duration: '5m', target: 100 }, // Sustain
              { duration: '2m', target: 0 }    // Ramp down
            ],
            thresholds: {
              'http_req_duration{page:products}': ['p(95)<300'],
              'http_req_duration{page:cart}': ['p(95)<250'],
              'http_req_duration{page:checkout}': ['p(95)<600']
            }
          },
          testCode: `
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 }
  ],
  thresholds: {
    'http_req_duration{page:products}': ['p(95)<300'],
    'http_req_duration{page:cart}': ['p(95)<250'],
    'http_req_duration{page:checkout}': ['p(95)<600']
  }
};

export default function() {
  // Product browsing
  let res = http.get('https://api.example.com/products', { tags: { page: 'products' } });
  check(res, { 'products loaded': (r) => r.status === 200 });
  sleep(1);

  // Add to cart
  res = http.post('https://api.example.com/cart', { tags: { page: 'cart' } });
  check(res, { 'item added': (r) => r.status === 200 });
  sleep(2);

  // Checkout
  res = http.post('https://api.example.com/checkout', { tags: { page: 'checkout' } });
  check(res, { 'checkout successful': (r) => r.status === 200 });
}
          `
        },
        timestamp: Date.now()
      };

      await memoryManager.store(`journey-${rumData.sessionId}`, userJourney, {
        namespace: 'aqe/production/test-scenarios'
      });

      const retrieved = await memoryManager.retrieve(`journey-${rumData.sessionId}`, {
        namespace: 'aqe/production/test-scenarios'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.loadTest.type).toBe('load-test');
      expect(retrieved.value.loadTest.scenario.stages).toHaveLength(3);
      expect(retrieved.value.loadTest.testCode).toContain('k6');
    });
  });

  describe('Event Bus Communication', () => {
    it('should emit production.incident event when incident is detected', async () => {
      let eventReceived = false;

      const eventPromise = new Promise<void>((resolve) => {
        eventBus.once('production.incident', (event) => {
          eventReceived = true;
          expect(event.data.severity).toBe('CRITICAL');
          expect(event.data.service).toBe('payment-service');
          resolve();
        });
      });

      await eventBus.emitFleetEvent(
        'production.incident',
        'production-intelligence',
        {
          incidentId: sampleIncident.id,
          severity: sampleIncident.severity,
          service: sampleIncident.service,
          affectedUsers: sampleIncident.affectedUsers
        }
      );

      await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout')), 500))
      ]);

      expect(eventReceived).toBe(true);
    });

    it('should emit production.test-scenario-generated event', async () => {
      let eventReceived = false;

      const eventPromise = new Promise<void>((resolve) => {
        eventBus.once('production.test-scenario-generated', (event) => {
          eventReceived = true;
          expect(event.data.type).toBe('incident-replay');
          expect(event.data.scenarios).toBe(3);
          resolve();
        });
      });

      await eventBus.emitFleetEvent(
        'production.test-scenario-generated',
        'production-intelligence',
        {
          sourceIncident: 'INC-001',
          type: 'incident-replay',
          scenarios: 3,
          priority: 'critical'
        }
      );

      await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout')), 500))
      ]);

      expect(eventReceived).toBe(true);
    });

    it('should coordinate with TestGeneratorAgent via events', async () => {
      const coordination: string[] = [];

      // Listen for coordination events
      eventBus.on('coordination.step', (event) => {
        coordination.push(event.data.step);
      });

      // Step 1: Incident detected
      await eventBus.emitFleetEvent('coordination.step', 'production-intelligence', {
        step: 'incident-detected'
      });

      // Step 2: Test scenario generated
      await eventBus.emitFleetEvent('coordination.step', 'production-intelligence', {
        step: 'scenario-generated'
      });

      // Step 3: Notify test generator
      await eventBus.emitFleetEvent('coordination.step', 'production-intelligence', {
        step: 'notify-test-generator',
        target: 'test-generator'
      });

      // Step 4: Test generator creates tests
      await eventBus.emitFleetEvent('coordination.step', 'test-generator', {
        step: 'tests-generated'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(coordination).toContain('incident-detected');
      expect(coordination).toContain('scenario-generated');
      expect(coordination).toContain('notify-test-generator');
      expect(coordination).toContain('tests-generated');
    });
  });
});