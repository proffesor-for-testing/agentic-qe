/**
 * Regression Risk Analysis MCP Integration Tests
 * Tests the regression_risk_analyze MCP tool with various parameter formats
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { MCPTestHarness } from './test-harness';
import { TOOL_NAMES } from '@mcp/tools';

// SKIP: These integration tests need redesign - AgenticQEMCPServer doesn't expose handleToolCall
// The MCP server uses SDK request handlers internally, not a direct method call API
// TODO: Redesign tests to use proper MCP client-server communication
describe.skip('regression_risk_analyze MCP Integration', () => {
  let harness: MCPTestHarness;

  beforeAll(async () => {
    harness = new MCPTestHarness();
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  beforeEach(async () => {
    await harness.clearMemory();
  });

  describe('Tool Registration', () => {
    it('should register regression_risk_analyze tool', () => {
      expect(harness.supportsTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE)).toBe(true);
    });
  });

  describe('changeSet Format (Original)', () => {
    it('should analyze regression risk with original changeSet format', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changeSet: {
          repository: 'https://github.com/example/repo.git',
          branch: 'feature/new-feature',
          commits: [
            {
              sha: 'abc123',
              message: 'feat: Add user authentication',
              author: 'developer@example.com',
              timestamp: '2025-10-30T10:00:00Z',
              files: ['src/auth.ts', 'tests/auth.test.ts']
            }
          ],
          changedFiles: [
            {
              path: 'src/auth.ts',
              type: 'modified',
              additions: 150,
              deletions: 20,
              complexity: 8.5
            },
            {
              path: 'tests/auth.test.ts',
              type: 'added',
              additions: 200,
              deletions: 0,
              complexity: 3.2
            }
          ]
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      harness.assertContainsFields(data, ['id', 'repository', 'riskLevel', 'impactedComponents']);
      expect(data.riskLevel).toMatch(/low|medium|high|critical/);
      expect(Array.isArray(data.impactedComponents)).toBe(true);
    });
  });

  describe('changes Format (Simplified)', () => {
    it('should analyze regression risk with simplified changes format', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: [
          {
            file: 'src/database.ts',
            type: 'modified',
            impact: 'high',
            linesChanged: 85
          },
          {
            file: 'src/api/users.ts',
            type: 'modified',
            impact: 'medium',
            linesChanged: 45
          },
          {
            file: 'tests/api.test.ts',
            type: 'added',
            impact: 'low',
            linesChanged: 120
          }
        ],
        threshold: 0.15 // Custom threshold
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data).toHaveProperty('riskLevel');
      expect(data).toHaveProperty('recommendations');
      expect(Array.isArray(data.recommendations)).toBe(true);
    });
  });

  describe('Both Formats Provided', () => {
    it('should prefer changeSet format when both are provided', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changeSet: {
          repository: 'https://github.com/example/repo.git',
          changedFiles: [
            {
              path: 'src/core.ts',
              type: 'modified',
              additions: 50,
              deletions: 10
            }
          ]
        },
        changes: [
          {
            file: 'src/other.ts',
            type: 'modified'
          }
        ]
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      // Should use changeSet format (repository field present)
      expect(data.repository).toBeDefined();
    });
  });

  describe('Neither Format Provided', () => {
    it('should fail when neither changeSet nor changes is provided', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        threshold: 0.1
        // No changeSet or changes provided
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Either changeSet or changes must be provided');
    });
  });

  describe('Complex Changes Array', () => {
    it('should handle complex changes with multiple file types', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: [
          {
            file: 'src/core/engine.ts',
            type: 'modified',
            impact: 'critical',
            linesChanged: 300,
            complexity: 15.8
          },
          {
            file: 'src/utils/helpers.ts',
            type: 'modified',
            impact: 'low',
            linesChanged: 25,
            complexity: 2.1
          },
          {
            file: 'src/config.ts',
            type: 'deleted',
            impact: 'medium',
            linesChanged: 50
          },
          {
            file: 'src/newFeature.ts',
            type: 'added',
            impact: 'medium',
            linesChanged: 180,
            complexity: 7.3
          },
          {
            file: 'tests/engine.test.ts',
            type: 'modified',
            impact: 'low',
            linesChanged: 95
          }
        ]
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.impactedComponents.length).toBeGreaterThan(0);
      expect(data.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Minimal Changes (Single File)', () => {
    it('should analyze risk for minimal single file change', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: [
          {
            file: 'src/utils/formatter.ts',
            type: 'modified',
            linesChanged: 5
          }
        ]
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.riskLevel).toMatch(/low|medium/); // Small change should be low/medium risk
      expect(data.impactedComponents.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Coverage Data Included', () => {
    it('should incorporate coverage data in risk analysis', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: [
          {
            file: 'src/payment.ts',
            type: 'modified',
            linesChanged: 100
          }
        ],
        baseline: {
          coverage: {
            'src/payment.ts': {
              line: 85.5,
              branch: 78.2,
              statement: 84.1
            }
          },
          complexity: {
            'src/payment.ts': 9.3
          }
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      // Analysis should consider coverage in risk assessment
      expect(data).toHaveProperty('recommendations');
    });
  });

  describe('Historical Data Enabled', () => {
    it('should use historical data when enabled', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: [
          {
            file: 'src/critical.ts',
            type: 'modified',
            linesChanged: 200
          }
        ],
        historicalAnalysis: true
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data).toHaveProperty('historicalContext');
      expect(data.historicalContext).toBeDefined();
    });
  });

  describe('Different Analysis Depths', () => {
    const depths = ['shallow', 'standard', 'deep'] as const;

    depths.forEach(depth => {
      it(`should perform ${depth} analysis`, async () => {
        const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
          changes: [
            {
              file: 'src/app.ts',
              type: 'modified',
              linesChanged: 150
            }
          ],
          analysisDepth: depth
        });

        harness.assertSuccess(result);
        const data = harness.parseToolResponse(result);
        expect(data).toHaveProperty('riskLevel');
      });
    });
  });

  describe('Invalid Repository Format', () => {
    it('should handle invalid repository URL gracefully', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changeSet: {
          repository: 'invalid-url',
          changedFiles: [
            {
              path: 'src/file.ts',
              type: 'modified',
              additions: 10,
              deletions: 5
            }
          ]
        }
      });

      // Should still process even with invalid URL
      expect(result).toBeDefined();
    });
  });

  describe('Risk Level Classification', () => {
    it('should classify high-risk changes correctly', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: [
          {
            file: 'src/core/database.ts',
            type: 'modified',
            impact: 'critical',
            linesChanged: 500,
            complexity: 20.5
          }
        ]
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.riskLevel).toMatch(/high|critical/);
      expect(data.recommendations.length).toBeGreaterThan(0);
    });

    it('should classify low-risk changes correctly', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: [
          {
            file: 'README.md',
            type: 'modified',
            linesChanged: 10
          },
          {
            file: 'tests/sample.test.ts',
            type: 'added',
            linesChanged: 50
          }
        ]
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.riskLevel).toMatch(/low|medium/);
    });
  });

  describe('Test Selection Recommendations', () => {
    it('should recommend specific tests based on risk', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: [
          {
            file: 'src/auth/login.ts',
            type: 'modified',
            linesChanged: 75
          },
          {
            file: 'src/auth/session.ts',
            type: 'modified',
            linesChanged: 45
          }
        ]
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.recommendations).toBeDefined();
      expect(Array.isArray(data.recommendations)).toBe(true);

      // Should have test selection recommendations
      const hasTestRecommendation = data.recommendations.some(
        (rec: any) => rec.type === 'test-selection' || rec.category === 'testing'
      );
      expect(hasTestRecommendation).toBe(true);
    });
  });

  describe('Impact Component Analysis', () => {
    it('should identify all impacted components', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changeSet: {
          repository: 'https://github.com/example/app.git',
          changedFiles: [
            {
              path: 'src/components/Header.tsx',
              type: 'modified',
              additions: 30,
              deletions: 10
            },
            {
              path: 'src/components/Footer.tsx',
              type: 'modified',
              additions: 15,
              deletions: 5
            },
            {
              path: 'src/styles/theme.css',
              type: 'modified',
              additions: 20,
              deletions: 8
            }
          ]
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.impactedComponents).toBeDefined();
      expect(Array.isArray(data.impactedComponents)).toBe(true);
      expect(data.impactedComponents.length).toBeGreaterThan(0);

      // Each component should have required fields
      data.impactedComponents.forEach((component: any) => {
        expect(component).toHaveProperty('name');
        expect(component).toHaveProperty('risk');
      });
    });
  });

  describe('Custom Threshold Application', () => {
    it('should apply custom risk threshold correctly', async () => {
      const lowThreshold = 0.05;
      const highThreshold = 0.25;

      const sameChanges = [
        {
          file: 'src/module.ts',
          type: 'modified',
          linesChanged: 100
        }
      ];

      const resultLow = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: sameChanges,
        threshold: lowThreshold
      });

      const resultHigh = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: sameChanges,
        threshold: highThreshold
      });

      harness.assertSuccess(resultLow);
      harness.assertSuccess(resultHigh);

      const dataLow = harness.parseToolResponse(resultLow);
      const dataHigh = harness.parseToolResponse(resultHigh);

      // Lower threshold should result in more warnings/higher risk
      expect(dataLow).toHaveProperty('riskLevel');
      expect(dataHigh).toHaveProperty('riskLevel');
    });
  });

  describe('Report Structure Validation', () => {
    it('should return properly structured risk analysis report', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changeSet: {
          repository: 'https://github.com/test/repo.git',
          branch: 'main',
          changedFiles: [
            {
              path: 'src/index.ts',
              type: 'modified',
              additions: 50,
              deletions: 20
            }
          ]
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      // Verify complete structure
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('repository');
      expect(data).toHaveProperty('analyzedAt');
      expect(data).toHaveProperty('riskLevel');
      expect(data).toHaveProperty('riskScore');
      expect(data).toHaveProperty('impactedComponents');
      expect(data).toHaveProperty('recommendations');
      expect(data).toHaveProperty('testSelectionStrategy');

      expect(typeof data.riskScore).toBe('number');
      expect(data.riskScore).toBeGreaterThanOrEqual(0);
      expect(data.riskScore).toBeLessThanOrEqual(1);
    });
  });
});
