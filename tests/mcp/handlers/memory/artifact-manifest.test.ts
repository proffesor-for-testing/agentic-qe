/**
 * memory/artifact-manifest Test Suite
 *
 * Tests for artifact manifest management.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ArtifactManifestHandler } from '@mcp/handlers/memory/artifact-manifest';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('ArtifactManifestHandler', () => {
  let handler: ArtifactManifestHandler;
  let registry: AgentRegistry;
  let hookExecutor: HookExecutor;

  beforeEach(() => {
    registry = new AgentRegistry();
    hookExecutor = new HookExecutor();
    handler = new ArtifactManifestHandler(registry, hookExecutor);
  });

  describe('Happy Path - Create Manifests', () => {
    it('should create test results manifest successfully', async () => {
      const response = await handler.handle({
        action: 'create',
        manifestId: 'test-results-2025-11-03',
        artifacts: [
          {
            type: 'test-report',
            path: '/reports/test-results.json',
            metadata: {
              framework: 'jest',
              totalTests: 206,
              passed: 198,
              failed: 8,
              duration: 45678,
              coverage: { lines: 87.5, branches: 82.3, functions: 89.1 }
            }
          },
          {
            type: 'coverage-report',
            path: '/coverage/lcov.info',
            metadata: {
              format: 'lcov',
              timestamp: Date.now(),
              tool: 'jest',
              threshold: 80
            }
          },
          {
            type: 'junit-xml',
            path: '/reports/junit.xml',
            metadata: {
              format: 'xml',
              ci: 'github-actions',
              branch: 'main'
            }
          }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.created).toBe(true);
      expect(response.data.manifestId).toBe('test-results-2025-11-03');
      expect(response.data.artifactCount).toBe(3);
      expect(response.data.createdAt).toBeDefined();
    });

    it('should create build artifacts manifest', async () => {
      const response = await handler.handle({
        action: 'create',
        manifestId: 'build-artifacts-v1.4.2',
        artifacts: [
          {
            type: 'dist-bundle',
            path: '/dist/bundle.js',
            metadata: {
              size: 245678,
              minified: true,
              sourcemap: true,
              hash: 'sha256:abc123def456'
            }
          },
          {
            type: 'type-definitions',
            path: '/dist/index.d.ts',
            metadata: {
              size: 12345,
              typescript: '5.3.0'
            }
          },
          {
            type: 'package',
            path: '/dist/package.tgz',
            metadata: {
              version: '1.4.2',
              size: 567890,
              registry: 'npm'
            }
          },
          {
            type: 'docker-image',
            path: 'ghcr.io/org/agentic-qe:1.4.2',
            metadata: {
              size: 987654321,
              platform: 'linux/amd64',
              layers: 12
            }
          }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.data.artifactCount).toBe(4);
      expect(response.data.manifestId).toBe('build-artifacts-v1.4.2');
    });

    it('should create security scan manifest', async () => {
      const response = await handler.handle({
        action: 'create',
        manifestId: 'security-scan-20251103',
        artifacts: [
          {
            type: 'sast-report',
            path: '/security/sast-results.sarif',
            metadata: {
              tool: 'semgrep',
              critical: 0,
              high: 2,
              medium: 5,
              low: 12,
              info: 34
            }
          },
          {
            type: 'dependency-scan',
            path: '/security/dependency-check.json',
            metadata: {
              tool: 'snyk',
              vulnerabilities: 3,
              patchable: 2,
              upgradable: 1
            }
          },
          {
            type: 'license-report',
            path: '/security/licenses.json',
            metadata: {
              compliant: true,
              licenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause']
            }
          }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.data.artifactCount).toBe(3);
    });

    it('should create performance benchmark manifest', async () => {
      const response = await handler.handle({
        action: 'create',
        manifestId: 'perf-benchmark-20251103',
        artifacts: [
          {
            type: 'load-test-report',
            path: '/reports/k6-results.json',
            metadata: {
              tool: 'k6',
              vus: 100,
              duration: '5m',
              avgResponseTime: 124,
              p95: 456,
              p99: 789,
              throughput: 1234
            }
          },
          {
            type: 'flame-graph',
            path: '/reports/flamegraph.svg',
            metadata: {
              profiler: 'clinic',
              hotspots: ['authenticateUser', 'validateToken', 'queryDatabase']
            }
          }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.data.artifactCount).toBe(2);
    });

    it('should create deployment package manifest', async () => {
      const response = await handler.handle({
        action: 'create',
        manifestId: 'deployment-v1.4.2-prod',
        artifacts: [
          {
            type: 'helm-chart',
            path: '/charts/agentic-qe-1.4.2.tgz',
            metadata: {
              version: '1.4.2',
              appVersion: '1.4.2',
              chart: 'agentic-qe',
              values: { replicas: 3, resources: { cpu: '500m', memory: '1Gi' } }
            }
          },
          {
            type: 'terraform-plan',
            path: '/terraform/plan.json',
            metadata: {
              changes: { add: 5, change: 2, destroy: 0 },
              resources: ['aws_ecs_service', 'aws_alb', 'aws_rds_instance']
            }
          },
          {
            type: 'deployment-manifest',
            path: '/k8s/deployment.yaml',
            metadata: {
              namespace: 'production',
              strategy: 'RollingUpdate',
              maxSurge: 1,
              maxUnavailable: 0
            }
          }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.data.artifactCount).toBe(3);
    });
  });

  describe('Happy Path - Get Manifest', () => {
    beforeEach(async () => {
      await handler.handle({
        action: 'create',
        manifestId: 'test-manifest',
        artifacts: [
          { type: 'report', path: '/reports/test.json', metadata: { status: 'passed' } }
        ]
      });
    });

    it('should retrieve existing manifest', async () => {
      const response = await handler.handle({
        action: 'get',
        manifestId: 'test-manifest'
      });

      expect(response.success).toBe(true);
      expect(response.data.manifest).toBeDefined();
      expect(response.data.manifest.manifestId).toBe('test-manifest');
      expect(response.data.manifest.artifacts).toHaveLength(1);
      expect(response.data.manifest.createdAt).toBeDefined();
      expect(response.data.manifest.updatedAt).toBeDefined();
      expect(response.data.manifest.status).toBe('created');
    });

    it('should return complete artifact metadata', async () => {
      const response = await handler.handle({
        action: 'get',
        manifestId: 'test-manifest'
      });

      const artifact = response.data.manifest.artifacts[0];
      expect(artifact.type).toBe('report');
      expect(artifact.path).toBe('/reports/test.json');
      expect(artifact.metadata.status).toBe('passed');
    });
  });

  describe('Happy Path - List Manifests', () => {
    beforeEach(async () => {
      await handler.handle({
        action: 'create',
        manifestId: 'manifest-1',
        artifacts: [
          { type: 'test-report', path: '/reports/test1.json', metadata: {} }
        ]
      });
      await handler.handle({
        action: 'create',
        manifestId: 'manifest-2',
        artifacts: [
          { type: 'coverage-report', path: '/coverage/lcov.info', metadata: {} }
        ]
      });
      await handler.handle({
        action: 'create',
        manifestId: 'manifest-3',
        artifacts: [
          { type: 'test-report', path: '/reports/test3.json', metadata: {} }
        ]
      });
    });

    it('should list all manifests', async () => {
      const response = await handler.handle({
        action: 'list'
      });

      expect(response.success).toBe(true);
      expect(response.data.manifests).toBeDefined();
      expect(response.data.count).toBe(3);
      expect(response.data.manifests).toHaveLength(3);
    });

    it('should filter manifests by artifact type', async () => {
      const response = await handler.handle({
        action: 'list',
        filterBy: { type: 'test-report' }
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(2);
      response.data.manifests.forEach((manifest: any) => {
        expect(['manifest-1', 'manifest-3']).toContain(manifest.manifestId);
      });
    });

    it('should filter manifests by metadata', async () => {
      await handler.handle({
        action: 'create',
        manifestId: 'prod-manifest',
        artifacts: [
          { type: 'deployment', path: '/deploy/prod.yaml', metadata: { environment: 'production' } }
        ]
      });

      const response = await handler.handle({
        action: 'list',
        filterBy: { environment: 'production' }
      });

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(1);
      expect(response.data.manifests[0].manifestId).toBe('prod-manifest');
    });
  });

  describe('Happy Path - Update Manifest', () => {
    beforeEach(async () => {
      await handler.handle({
        action: 'create',
        manifestId: 'update-test',
        artifacts: [
          { type: 'report', path: '/reports/initial.json', metadata: {} }
        ]
      });
    });

    it('should update manifest status', async () => {
      const response = await handler.handle({
        action: 'update',
        manifestId: 'update-test',
        updates: {
          status: 'processed',
          metadata: { processedAt: Date.now(), processor: 'qe-coverage-analyzer' }
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.updated).toBe(true);
      expect(response.data.updatedAt).toBeDefined();

      const getResponse = await handler.handle({
        action: 'get',
        manifestId: 'update-test'
      });

      expect(getResponse.data.manifest.status).toBe('processed');
      expect(getResponse.data.manifest.metadata.processor).toBe('qe-coverage-analyzer');
    });

    it('should add more artifacts', async () => {
      const response = await handler.handle({
        action: 'update',
        manifestId: 'update-test',
        updates: {
          artifacts: [
            { type: 'report', path: '/reports/initial.json', metadata: {} },
            { type: 'coverage', path: '/coverage/updated.json', metadata: { added: true } }
          ]
        }
      });

      expect(response.success).toBe(true);

      const getResponse = await handler.handle({
        action: 'get',
        manifestId: 'update-test'
      });

      expect(getResponse.data.manifest.artifacts).toHaveLength(2);
    });
  });

  describe('Happy Path - Delete Manifest', () => {
    beforeEach(async () => {
      await handler.handle({
        action: 'create',
        manifestId: 'delete-test',
        artifacts: [
          { type: 'temp', path: '/tmp/data.json', metadata: {} }
        ]
      });
    });

    it('should delete existing manifest', async () => {
      const response = await handler.handle({
        action: 'delete',
        manifestId: 'delete-test'
      });

      expect(response.success).toBe(true);
      expect(response.data.deleted).toBe(true);
      expect(response.data.manifestId).toBe('delete-test');

      const getResponse = await handler.handle({
        action: 'get',
        manifestId: 'delete-test'
      });

      expect(getResponse.success).toBe(false);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing action', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject invalid action', async () => {
      const response = await handler.handle({
        action: 'invalid-action'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid action');
    });

    it('should reject create without manifestId', async () => {
      const response = await handler.handle({
        action: 'create',
        artifacts: []
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject create without artifacts', async () => {
      const response = await handler.handle({
        action: 'create',
        manifestId: 'test'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject get without manifestId', async () => {
      const response = await handler.handle({
        action: 'get'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject update without manifestId', async () => {
      const response = await handler.handle({
        action: 'update',
        updates: {}
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject delete without manifestId', async () => {
      const response = await handler.handle({
        action: 'delete'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle duplicate manifest creation', async () => {
      await handler.handle({
        action: 'create',
        manifestId: 'duplicate',
        artifacts: [{ type: 'test', path: '/test', metadata: {} }]
      });

      const response = await handler.handle({
        action: 'create',
        manifestId: 'duplicate',
        artifacts: [{ type: 'test2', path: '/test2', metadata: {} }]
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('already exists');
    });

    it('should handle get for non-existent manifest', async () => {
      const response = await handler.handle({
        action: 'get',
        manifestId: 'non-existent'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should handle update for non-existent manifest', async () => {
      const response = await handler.handle({
        action: 'update',
        manifestId: 'non-existent',
        updates: { status: 'updated' }
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should handle delete for non-existent manifest', async () => {
      const response = await handler.handle({
        action: 'delete',
        manifestId: 'non-existent'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
      expect(typeof response.error).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty artifacts array', async () => {
      const response = await handler.handle({
        action: 'create',
        manifestId: 'empty-artifacts',
        artifacts: []
      });

      expect(response.success).toBe(true);
      expect(response.data.artifactCount).toBe(0);
    });

    it('should handle very large artifact metadata', async () => {
      const largeMetadata = {
        testResults: Array.from({ length: 1000 }, (_, i) => ({
          testId: `test-${i}`,
          status: 'passed',
          duration: Math.random() * 1000,
          assertions: Math.floor(Math.random() * 10)
        }))
      };

      const response = await handler.handle({
        action: 'create',
        manifestId: 'large-metadata',
        artifacts: [
          { type: 'test-report', path: '/reports/large.json', metadata: largeMetadata }
        ]
      });

      expect(response.success).toBe(true);

      const getResponse = await handler.handle({
        action: 'get',
        manifestId: 'large-metadata'
      });

      expect(getResponse.data.manifest.artifacts[0].metadata.testResults).toHaveLength(1000);
    });

    it('should handle special characters in manifestId', async () => {
      const specialIds = [
        'manifest-with-dashes',
        'manifest_with_underscores',
        'manifest.with.dots',
        'manifest:with:colons'
      ];

      for (const id of specialIds) {
        const response = await handler.handle({
          action: 'create',
          manifestId: id,
          artifacts: [{ type: 'test', path: '/test', metadata: {} }]
        });

        expect(response.success).toBe(true);
        expect(response.data.manifestId).toBe(id);
      }
    });

    it('should handle concurrent manifest creation', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        handler.handle({
          action: 'create',
          manifestId: `concurrent-${i}`,
          artifacts: [{ type: 'test', path: `/test-${i}`, metadata: { index: i } }]
        })
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      const listResponse = await handler.handle({ action: 'list' });
      expect(listResponse.data.count).toBeGreaterThanOrEqual(10);
    });

    it('should handle artifacts with missing optional metadata', async () => {
      const response = await handler.handle({
        action: 'create',
        manifestId: 'minimal-artifact',
        artifacts: [
          { type: 'test', path: '/test' }
        ]
      });

      expect(response.success).toBe(true);

      const getResponse = await handler.handle({
        action: 'get',
        manifestId: 'minimal-artifact'
      });

      expect(getResponse.data.manifest.artifacts[0].metadata).toEqual({});
    });
  });

  describe('Performance', () => {
    it('should complete create within reasonable time', async () => {
      const startTime = Date.now();
      await handler.handle({
        action: 'create',
        manifestId: 'perf-test',
        artifacts: [
          { type: 'test', path: '/test', metadata: {} }
        ]
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle large number of artifacts efficiently', async () => {
      const artifacts = Array.from({ length: 100 }, (_, i) => ({
        type: 'artifact',
        path: `/artifacts/artifact-${i}.json`,
        metadata: { index: i, timestamp: Date.now() }
      }));

      const startTime = Date.now();
      const response = await handler.handle({
        action: 'create',
        manifestId: 'large-manifest',
        artifacts
      });
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(response.data.artifactCount).toBe(100);
      expect(endTime - startTime).toBeLessThan(500);
    });

    it('should list manifests efficiently', async () => {
      for (let i = 0; i < 50; i++) {
        await handler.handle({
          action: 'create',
          manifestId: `list-perf-${i}`,
          artifacts: [{ type: 'test', path: `/test-${i}`, metadata: {} }]
        });
      }

      const startTime = Date.now();
      const response = await handler.handle({ action: 'list' });
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle CI/CD pipeline artifact manifest', async () => {
      const response = await handler.handle({
        action: 'create',
        manifestId: 'ci-pipeline-run-12345',
        artifacts: [
          {
            type: 'test-report',
            path: '/artifacts/test-results.json',
            metadata: {
              pipeline: 'main',
              commit: 'abc123',
              branch: 'main',
              buildNumber: 12345,
              totalTests: 206,
              passed: 198
            }
          },
          {
            type: 'coverage',
            path: '/artifacts/coverage.json',
            metadata: {
              lines: 87.5,
              branches: 82.3,
              functions: 89.1,
              statements: 86.7
            }
          },
          {
            type: 'lint-report',
            path: '/artifacts/eslint.json',
            metadata: {
              errors: 0,
              warnings: 3,
              fixable: 2
            }
          },
          {
            type: 'bundle',
            path: '/artifacts/dist.tar.gz',
            metadata: {
              size: 1234567,
              compressed: true,
              hash: 'sha256:def456'
            }
          }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.data.artifactCount).toBe(4);
    });

    it('should handle QE agent coordination artifacts', async () => {
      const response = await handler.handle({
        action: 'create',
        manifestId: 'qe-coordination-session-001',
        artifacts: [
          {
            type: 'test-plan',
            path: '/aqe/test-plan.json',
            metadata: {
              agent: 'qe-test-generator',
              generatedTests: 45,
              frameworks: ['jest', 'vitest'],
              coverage: 'unit'
            }
          },
          {
            type: 'execution-results',
            path: '/aqe/execution-results.json',
            metadata: {
              agent: 'qe-test-executor',
              executed: 45,
              passed: 43,
              failed: 2,
              duration: 12345
            }
          },
          {
            type: 'coverage-analysis',
            path: '/aqe/coverage-gaps.json',
            metadata: {
              agent: 'qe-coverage-analyzer',
              gapsFound: 8,
              recommendations: 12,
              algorithm: 'sublinear-O(log-n)'
            }
          }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.data.artifactCount).toBe(3);
    });
  });
});
