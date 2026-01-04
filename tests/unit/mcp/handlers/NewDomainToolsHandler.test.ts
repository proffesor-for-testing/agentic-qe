/**
 * Unit tests for NewDomainToolsHandler
 *
 * Tests the 8 NewDomain MCP tool handlers:
 * - Chaos Engineering (3 tools)
 * - Integration Testing (2 tools)
 * - Token-Optimized (3 tools)
 *
 * Note: These tests verify the handler interface and response structure.
 */

import { NewDomainToolsHandler } from '../../../../src/mcp/handlers/NewDomainToolsHandler';
import { AgentRegistry } from '../../../../src/mcp/services/AgentRegistry';
import { HookExecutor } from '../../../../src/mcp/services/HookExecutor';

describe('NewDomainToolsHandler', () => {
  let handler: NewDomainToolsHandler;
  let mockRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockRegistry = {
      getAgent: jest.fn(),
      listAgents: jest.fn(),
    } as unknown as AgentRegistry;

    mockHookExecutor = {
      executeHook: jest.fn(),
    } as unknown as HookExecutor;

    handler = new NewDomainToolsHandler(mockRegistry, mockHookExecutor);
  });

  // Increase timeout for async operations
  jest.setTimeout(10000);

  describe('Chaos Engineering Tools', () => {
    describe('handleChaosInjectLatency', () => {
      it('should inject latency successfully', async () => {
        const result = await handler.handleChaosInjectLatency({
          target: 'api-service',
          latencyMs: 500,
          percentage: 30,
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('target', 'api-service');
        expect(result.data).toHaveProperty('injectedLatencyMs', 500);
        expect(result.data).toHaveProperty('affectedPercentage', 30);
      });

      it('should fail when target is missing', async () => {
        const result = await handler.handleChaosInjectLatency({
          latencyMs: 500,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Target is required');
      });
    });

    describe('handleChaosInjectFailure', () => {
      it('should inject failure successfully', async () => {
        const result = await handler.handleChaosInjectFailure({
          target: 'database-service',
          failureType: 'timeout',
          percentage: 20,
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('target', 'database-service');
        expect(result.data).toHaveProperty('failureType', 'timeout');
      });

      it('should fail when target is missing', async () => {
        const result = await handler.handleChaosInjectFailure({
          failureType: 'error',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Target is required');
      });
    });

    describe('handleChaosResilienceTest', () => {
      it('should run resilience test successfully', async () => {
        const result = await handler.handleChaosResilienceTest({
          target: 'payment-service',
          scenarios: ['latency', 'failure', 'partition'],
          duration: 60,
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('target', 'payment-service');
        expect(result.data).toHaveProperty('scenariosExecuted');
        expect(result.data).toHaveProperty('resilienceScore');
      });

      it('should fail when target is missing', async () => {
        const result = await handler.handleChaosResilienceTest({
          scenarios: ['latency'],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Target is required');
      });
    });
  });

  describe('Integration Testing Tools', () => {
    describe('handleDependencyCheck', () => {
      it('should check dependencies with proper response structure', async () => {
        const result = await handler.handleDependencyCheck({
          services: ['postgres-db', 'redis-cache'],
          timeout: 500, // Short timeout for tests
        });

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('metadata');

        if (result.success) {
          expect(result.data).toHaveProperty('dependencies');
          expect(result.data).toHaveProperty('healthScore');
        }
      }, 15000);

      it('should fail when services array is missing', async () => {
        const result = await handler.handleDependencyCheck({
          timeout: 500,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Services array is required');
      });

      it('should fail when services array is empty', async () => {
        const result = await handler.handleDependencyCheck({
          services: [],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Services array is required');
      });
    });

    describe('handleIntegrationTestOrchestrate', () => {
      it('should return response with proper structure', async () => {
        const result = await handler.handleIntegrationTestOrchestrate({
          services: ['api', 'database'],
          scenario: 'end-to-end',
          parallel: true,
        });

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('metadata');

        if (result.success) {
          expect(result.data).toHaveProperty('scenario');
          expect(result.data).toHaveProperty('servicesInvolved');
        }
      });

      it('should fail when services array is missing', async () => {
        const result = await handler.handleIntegrationTestOrchestrate({
          scenario: 'test',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Services array is required');
      });
    });
  });

  describe('Token-Optimized Tools', () => {
    describe('handleTestExecuteFiltered', () => {
      it('should execute filtered tests successfully', async () => {
        const result = await handler.handleTestExecuteFiltered({
          testPath: 'tests/unit',
          topN: 10,
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('summary');
        expect(result.data).toHaveProperty('failures');
        expect(result.data).toHaveProperty('tokenReduction');
      });

      it('should fail when testPath is missing', async () => {
        const result = await handler.handleTestExecuteFiltered({
          topN: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('testPath is required');
      });
    });

    describe('handlePerformanceTestFiltered', () => {
      it('should execute filtered performance tests successfully', async () => {
        const result = await handler.handlePerformanceTestFiltered({
          target: 'api-endpoint',
          duration: 60,
          vus: 10,
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('summary');
        expect(result.data).toHaveProperty('bottlenecks');
        expect(result.data).toHaveProperty('tokenReduction');
      });

      it('should fail when target is missing', async () => {
        const result = await handler.handlePerformanceTestFiltered({
          duration: 60,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('target is required');
      });
    });

    describe('handleQualityAssessFiltered', () => {
      it('should assess quality with filtering successfully', async () => {
        const result = await handler.handleQualityAssessFiltered({
          target: 'src/',
          topN: 20,
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('summary');
        expect(result.data).toHaveProperty('issues');
        expect(result.data).toHaveProperty('tokenReduction');
      });

      it('should fail when target is missing', async () => {
        const result = await handler.handleQualityAssessFiltered({
          topN: 20,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('target is required');
      });
    });
  });
});
