/**
 * memory/blackboard-post Test Suite
 *
 * Tests for blackboard pattern coordination hints.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BlackboardPostHandler } from '@mcp/handlers/memory/blackboard-post';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('BlackboardPostHandler', () => {
  let handler: BlackboardPostHandler;
  let registry: AgentRegistry;
  let hookExecutor: HookExecutor;
  let blackboard: Map<string, any[]>;

  beforeEach(() => {
    registry = new AgentRegistry();
    hookExecutor = new HookExecutor();
    blackboard = new Map();
    handler = new BlackboardPostHandler(registry, hookExecutor, blackboard);
  });

  describe('Happy Path - Task Coordination', () => {
    it('should post test generation task assignment', async () => {
      const response = await handler.handle({
        topic: 'test-generation',
        message: 'Generate unit tests for UserService.authenticateUser method',
        priority: 'high',
        agentId: 'qe-test-generator',
        metadata: {
          targetFile: 'src/services/UserService.ts',
          framework: 'jest',
          coverage: 'branch',
          estimatedTests: 12
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.posted).toBe(true);
      expect(response.data.hintId).toBeDefined();
      expect(response.data.topic).toBe('test-generation');
      expect(response.data.priority).toBe('high');
      expect(response.data.timestamp).toBeDefined();
    });

    it('should post coverage analysis request', async () => {
      const response = await handler.handle({
        topic: 'coverage-analysis',
        message: 'Analyze coverage gaps in authentication module using O(log n) algorithm',
        priority: 'medium',
        agentId: 'qe-coverage-analyzer',
        metadata: {
          module: 'authentication',
          currentCoverage: { lines: 78.5, branches: 65.2 },
          targetCoverage: 85,
          algorithm: 'sublinear'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.topic).toBe('coverage-analysis');
      expect(response.data.priority).toBe('medium');
    });

    it('should post critical security scan alert', async () => {
      const response = await handler.handle({
        topic: 'security-alerts',
        message: 'Critical vulnerability detected in JWT validation - immediate attention required',
        priority: 'critical',
        agentId: 'qe-security-scanner',
        metadata: {
          severity: 'critical',
          cve: 'CVE-2025-12345',
          affectedComponent: 'auth/jwt-validator',
          remediation: 'Upgrade jsonwebtoken to 9.0.2',
          impact: 'Authentication bypass possible'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.priority).toBe('critical');

      const hints = blackboard.get('security-alerts');
      expect(hints).toHaveLength(1);
      expect(hints![0].message).toContain('Critical vulnerability');
    });

    it('should post performance test coordination', async () => {
      const response = await handler.handle({
        topic: 'performance-testing',
        message: 'Initiating load test for API endpoints with 1000 concurrent users',
        priority: 'high',
        agentId: 'qe-performance-tester',
        metadata: {
          testType: 'load',
          tool: 'k6',
          vus: 1000,
          duration: '5m',
          endpoints: ['/api/auth/login', '/api/users', '/api/data/query'],
          thresholds: { p95: 200, p99: 500 }
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.topic).toBe('performance-testing');
    });

    it('should post deployment readiness assessment', async () => {
      const response = await handler.handle({
        topic: 'deployment-readiness',
        message: 'Pre-deployment validation complete - all quality gates passed',
        priority: 'high',
        agentId: 'qe-deployment-readiness',
        metadata: {
          environment: 'production',
          version: '1.4.2',
          qualityGates: {
            tests: 'passed',
            coverage: 'passed',
            security: 'passed',
            performance: 'passed'
          },
          riskScore: 0.12,
          recommendation: 'approved'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.priority).toBe('high');
    });
  });

  describe('Happy Path - Multiple Priority Levels', () => {
    it('should handle low priority informational hints', async () => {
      const response = await handler.handle({
        topic: 'test-metrics',
        message: 'Daily test execution metrics: 206 tests, 98% pass rate',
        priority: 'low',
        agentId: 'qe-test-executor',
        metadata: {
          date: '2025-11-03',
          totalTests: 206,
          passed: 198,
          failed: 4,
          skipped: 4,
          duration: 45678
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.priority).toBe('low');
    });

    it('should handle medium priority coordination hints', async () => {
      const response = await handler.handle({
        topic: 'regression-analysis',
        message: 'Smart test selection identified 45 high-risk tests for regression suite',
        priority: 'medium',
        agentId: 'qe-regression-risk-analyzer',
        metadata: {
          totalTests: 206,
          selectedTests: 45,
          riskFactors: ['recent-changes', 'historical-failures', 'code-coverage'],
          estimatedTime: '12m'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.priority).toBe('medium');
    });

    it('should handle high priority action required hints', async () => {
      const response = await handler.handle({
        topic: 'flaky-tests',
        message: 'Flaky test detected: AuthenticationTest.shouldHandleTokenExpiry - 30% failure rate',
        priority: 'high',
        agentId: 'qe-flaky-test-hunter',
        metadata: {
          testName: 'AuthenticationTest.shouldHandleTokenExpiry',
          flakiness: 0.30,
          runs: 100,
          failures: 30,
          rootCause: 'timing-dependency',
          recommendation: 'add-retry-logic'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.priority).toBe('high');
    });

    it('should handle critical priority emergency hints', async () => {
      const response = await handler.handle({
        topic: 'production-incident',
        message: 'Production test failure detected - rollback recommended',
        priority: 'critical',
        agentId: 'qe-production-intelligence',
        metadata: {
          environment: 'production',
          severity: 'critical',
          affectedUsers: 5000,
          errorRate: 15.7,
          action: 'rollback',
          rollbackVersion: '1.4.1'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.priority).toBe('critical');
    });
  });

  describe('Happy Path - TTL Expiration', () => {
    it('should set TTL for temporary coordination hints', async () => {
      const response = await handler.handle({
        topic: 'temp-coordination',
        message: 'Temporary lock acquired for test data generation',
        priority: 'medium',
        agentId: 'qe-test-data-architect',
        ttl: 60,
        metadata: {
          lockId: 'test-data-lock-123',
          resource: 'test-database',
          expires: Date.now() + 60000
        }
      });

      expect(response.success).toBe(true);
      expect(blackboard.get('temp-coordination')).toHaveLength(1);
    });

    it('should auto-expire hints after TTL', async () => {
      jest.useFakeTimers();

      await handler.handle({
        topic: 'expiring-hint',
        message: 'Test session active',
        priority: 'low',
        agentId: 'qe-test-executor',
        ttl: 2
      });

      expect(blackboard.get('expiring-hint')).toHaveLength(1);

      jest.advanceTimersByTime(3000);

      expect(blackboard.get('expiring-hint')).toHaveLength(0);

      jest.useRealTimers();
    });
  });

  describe('Happy Path - Topic Organization', () => {
    it('should organize hints by topic', async () => {
      await handler.handle({
        topic: 'api-testing',
        message: 'API contract validation started',
        priority: 'medium',
        agentId: 'qe-api-contract-validator'
      });

      await handler.handle({
        topic: 'api-testing',
        message: 'API breaking change detected',
        priority: 'high',
        agentId: 'qe-api-contract-validator'
      });

      await handler.handle({
        topic: 'visual-testing',
        message: 'Visual regression test passed',
        priority: 'low',
        agentId: 'qe-visual-tester'
      });

      expect(blackboard.get('api-testing')).toHaveLength(2);
      expect(blackboard.get('visual-testing')).toHaveLength(1);
    });
  });

  describe('Happy Path - Fleet Coordination', () => {
    it('should post fleet commander coordination message', async () => {
      const response = await handler.handle({
        topic: 'fleet-coordination',
        message: 'Initiating hierarchical swarm with 8 specialized QE agents',
        priority: 'high',
        agentId: 'qe-fleet-commander',
        metadata: {
          topology: 'hierarchical',
          agents: [
            'qe-test-generator',
            'qe-test-executor',
            'qe-coverage-analyzer',
            'qe-quality-gate',
            'qe-performance-tester',
            'qe-security-scanner',
            'qe-regression-risk-analyzer',
            'qe-flaky-test-hunter'
          ],
          strategy: 'adaptive',
          maxConcurrency: 5
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.topic).toBe('fleet-coordination');
    });

    it('should post agent status updates', async () => {
      const agents = [
        { id: 'qe-test-generator', status: 'active', task: 'generating-tests' },
        { id: 'qe-coverage-analyzer', status: 'active', task: 'analyzing-gaps' },
        { id: 'qe-test-executor', status: 'idle', task: null }
      ];

      for (const agent of agents) {
        const response = await handler.handle({
          topic: 'agent-status',
          message: `Agent ${agent.id} status: ${agent.status}`,
          priority: 'low',
          agentId: agent.id,
          metadata: {
            status: agent.status,
            currentTask: agent.task,
            uptime: Math.random() * 3600000
          }
        });

        expect(response.success).toBe(true);
      }

      expect(blackboard.get('agent-status')).toHaveLength(3);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing topic', async () => {
      const response = await handler.handle({
        message: 'Test message',
        priority: 'medium',
        agentId: 'test-agent'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject missing message', async () => {
      const response = await handler.handle({
        topic: 'test-topic',
        priority: 'medium',
        agentId: 'test-agent'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject missing priority', async () => {
      const response = await handler.handle({
        topic: 'test-topic',
        message: 'Test message',
        agentId: 'test-agent'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject missing agentId', async () => {
      const response = await handler.handle({
        topic: 'test-topic',
        message: 'Test message',
        priority: 'medium'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should accept optional metadata', async () => {
      const response = await handler.handle({
        topic: 'test-topic',
        message: 'Test message',
        priority: 'medium',
        agentId: 'test-agent'
      });

      expect(response.success).toBe(true);
    });

    it('should accept optional ttl', async () => {
      const response = await handler.handle({
        topic: 'test-topic',
        message: 'Test message',
        priority: 'medium',
        agentId: 'test-agent',
        ttl: 300
      });

      expect(response.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty object', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({
        topic: 'test'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
      expect(typeof response.error).toBe('string');
    });

    it('should handle invalid priority values gracefully', async () => {
      const response = await handler.handle({
        topic: 'test-topic',
        message: 'Test message',
        priority: 'invalid-priority' as any,
        agentId: 'test-agent'
      });

      expect(response.success).toBe(true);
      expect(blackboard.get('test-topic')).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long messages', async () => {
      const longMessage = 'A'.repeat(10000);

      const response = await handler.handle({
        topic: 'long-message',
        message: longMessage,
        priority: 'low',
        agentId: 'test-agent'
      });

      expect(response.success).toBe(true);
      expect(blackboard.get('long-message')![0].message).toHaveLength(10000);
    });

    it('should handle special characters in topic', async () => {
      const specialTopics = [
        'topic-with-dashes',
        'topic_with_underscores',
        'topic.with.dots',
        'topic:with:colons',
        'topic/with/slashes'
      ];

      for (const topic of specialTopics) {
        const response = await handler.handle({
          topic,
          message: 'Test message',
          priority: 'low',
          agentId: 'test-agent'
        });

        expect(response.success).toBe(true);
        expect(blackboard.has(topic)).toBe(true);
      }
    });

    it('should handle unicode characters', async () => {
      const response = await handler.handle({
        topic: 'unicode-test',
        message: '测试消息 🚀 Тестовое сообщение العربية',
        priority: 'low',
        agentId: 'test-agent',
        metadata: {
          languages: ['中文', 'русский', 'العربية'],
          emoji: '🔥💯✨'
        }
      });

      expect(response.success).toBe(true);
    });

    it('should handle concurrent posts to same topic', async () => {
      const promises = Array.from({ length: 20 }, (_, i) =>
        handler.handle({
          topic: 'concurrent-topic',
          message: `Message ${i}`,
          priority: 'medium',
          agentId: `agent-${i}`
        })
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      expect(blackboard.get('concurrent-topic')).toHaveLength(20);
    });

    it('should handle posts to different topics concurrently', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        handler.handle({
          topic: `topic-${i}`,
          message: `Message for topic ${i}`,
          priority: 'low',
          agentId: 'test-agent'
        })
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      expect(blackboard.size).toBe(10);
    });

    it('should handle empty metadata object', async () => {
      const response = await handler.handle({
        topic: 'test-topic',
        message: 'Test message',
        priority: 'low',
        agentId: 'test-agent',
        metadata: {}
      });

      expect(response.success).toBe(true);
      expect(blackboard.get('test-topic')![0].metadata).toEqual({});
    });

    it('should handle null metadata values', async () => {
      const response = await handler.handle({
        topic: 'test-topic',
        message: 'Test message',
        priority: 'low',
        agentId: 'test-agent',
        metadata: {
          value: null,
          undefined: undefined
        }
      });

      expect(response.success).toBe(true);
    });

    it('should handle zero TTL', async () => {
      const response = await handler.handle({
        topic: 'zero-ttl',
        message: 'Message with zero TTL',
        priority: 'low',
        agentId: 'test-agent',
        ttl: 0
      });

      expect(response.success).toBe(true);
      expect(blackboard.get('zero-ttl')).toHaveLength(1);
    });

    it('should handle negative TTL', async () => {
      const response = await handler.handle({
        topic: 'negative-ttl',
        message: 'Message with negative TTL',
        priority: 'low',
        agentId: 'test-agent',
        ttl: -1
      });

      expect(response.success).toBe(true);
      expect(blackboard.get('negative-ttl')).toHaveLength(1);
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const startTime = Date.now();
      await handler.handle({
        topic: 'perf-test',
        message: 'Performance test message',
        priority: 'medium',
        agentId: 'test-agent'
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle high volume of posts efficiently', async () => {
      const startTime = Date.now();

      const promises = Array.from({ length: 100 }, (_, i) =>
        handler.handle({
          topic: 'high-volume',
          message: `Message ${i}`,
          priority: 'low',
          agentId: 'test-agent'
        })
      );

      await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);
      expect(blackboard.get('high-volume')).toHaveLength(100);
    });

    it('should handle large metadata efficiently', async () => {
      const largeMetadata = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: `value-${i}`,
          timestamp: Date.now()
        }))
      };

      const startTime = Date.now();
      const response = await handler.handle({
        topic: 'large-metadata',
        message: 'Message with large metadata',
        priority: 'low',
        agentId: 'test-agent',
        metadata: largeMetadata
      });
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle test execution workflow coordination', async () => {
      await handler.handle({
        topic: 'test-workflow',
        message: 'Test generation phase started',
        priority: 'medium',
        agentId: 'qe-test-generator',
        metadata: { phase: 'generation', status: 'started' }
      });

      await handler.handle({
        topic: 'test-workflow',
        message: 'Generated 45 unit tests',
        priority: 'medium',
        agentId: 'qe-test-generator',
        metadata: { phase: 'generation', status: 'completed', testCount: 45 }
      });

      await handler.handle({
        topic: 'test-workflow',
        message: 'Test execution phase started',
        priority: 'medium',
        agentId: 'qe-test-executor',
        metadata: { phase: 'execution', status: 'started' }
      });

      await handler.handle({
        topic: 'test-workflow',
        message: 'Test execution completed - 43/45 passed',
        priority: 'high',
        agentId: 'qe-test-executor',
        metadata: { phase: 'execution', status: 'completed', passed: 43, failed: 2 }
      });

      expect(blackboard.get('test-workflow')).toHaveLength(4);
    });

    it('should handle multi-agent quality gate coordination', async () => {
      await handler.handle({
        topic: 'quality-gate',
        message: 'Code coverage check: 87.5% - PASS',
        priority: 'medium',
        agentId: 'qe-coverage-analyzer',
        metadata: { check: 'coverage', status: 'pass', value: 87.5, threshold: 80 }
      });

      await handler.handle({
        topic: 'quality-gate',
        message: 'Security scan: 0 critical, 2 high - PASS',
        priority: 'medium',
        agentId: 'qe-security-scanner',
        metadata: { check: 'security', status: 'pass', critical: 0, high: 2 }
      });

      await handler.handle({
        topic: 'quality-gate',
        message: 'Performance test: P95=456ms - FAIL',
        priority: 'high',
        agentId: 'qe-performance-tester',
        metadata: { check: 'performance', status: 'fail', p95: 456, threshold: 400 }
      });

      await handler.handle({
        topic: 'quality-gate',
        message: 'Quality gate failed - performance threshold exceeded',
        priority: 'critical',
        agentId: 'qe-quality-gate',
        metadata: { overallStatus: 'failed', failedChecks: ['performance'] }
      });

      expect(blackboard.get('quality-gate')).toHaveLength(4);
    });
  });
});
