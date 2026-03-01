/**
 * Agentic QE v3 - Quality Criteria MCP Tool Unit Tests
 *
 * Tests verify REAL behavior:
 * - analyze action returns agentInvocation (NO fallbacks)
 * - validate-evidence works programmatically
 * - format works programmatically
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QualityCriteriaTool,
  qualityCriteriaTool,
  type QualityCriteriaParams,
  type AgentInvocation,
} from '../../../../src/mcp/tools/requirements-validation/quality-criteria';
import { MCPToolContext } from '../../../../src/mcp/tools/base';

describe('QualityCriteriaTool', () => {
  let tool: QualityCriteriaTool;

  beforeEach(() => {
    tool = new QualityCriteriaTool();
  });

  describe('config', () => {
    it('should have correct tool name', () => {
      expect(tool.name).toBe('qe/requirements/quality-criteria');
    });

    it('should have correct domain', () => {
      expect(tool.domain).toBe('requirements-validation');
    });

    it('should support streaming', () => {
      expect(tool.supportsStreaming).toBe(true);
    });

    it('should have description mentioning agentInvocation', () => {
      expect(tool.config.description).toContain('agentInvocation');
    });
  });

  describe('validate', () => {
    it('should require assessmentName', () => {
      const result = tool.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: assessmentName');
    });

    it('should accept valid params', () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        epicContent: 'Test content',
      };
      const result = tool.validate(params);
      expect(result.valid).toBe(true);
    });
  });

  describe('execute - analyze action', () => {
    const createContext = (): MCPToolContext => ({
      requestId: 'test-request-id',
      startTime: Date.now(),
    });

    it('should return agentInvocation for analyze action', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'User Authentication Epic',
        epicContent: '# User Authentication\n\nImplement secure login with OAuth2',
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.agentInvocation).toBeDefined();

      const invocation = result.data!.agentInvocation as AgentInvocation;
      expect(invocation.required).toBe(true);
      expect(invocation.agentType).toBe('qe-quality-criteria-recommender');
      expect(invocation.prompt).toContain('User Authentication Epic');
      expect(invocation.prompt).toContain('HTSM');
      expect(invocation.expectedOutput).toBe('QualityCriteriaAnalysis');
    });

    it('should include epic content in agent prompt', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Payment Processing',
        epicContent: 'Handle credit card payments securely',
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      const invocation = result.data!.agentInvocation!;
      expect(invocation.prompt).toContain('Handle credit card payments securely');
    });

    it('should include source paths in agent prompt when provided', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'API Security',
        epicContent: 'Secure the REST API',
        sourcePaths: ['src/api/**/*.ts', 'src/auth/**/*.ts'],
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      const invocation = result.data!.agentInvocation!;
      expect(invocation.prompt).toContain('src/api/**/*.ts');
      expect(invocation.prompt).toContain('src/auth/**/*.ts');
    });

    it('should include HTSM categories in agent prompt', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test',
        epicContent: 'Test content',
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      const invocation = result.data!.agentInvocation!;
      expect(invocation.prompt).toContain('Capability');
      expect(invocation.prompt).toContain('Reliability');
      expect(invocation.prompt).toContain('Security');
      expect(invocation.prompt).toContain('Performance');
      expect(invocation.prompt).toContain('Development');
    });

    it('should include never-omit categories in agent prompt', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test',
        epicContent: 'Test content',
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      const invocation = result.data!.agentInvocation!;
      expect(invocation.prompt).toContain('Categories That CANNOT Be Omitted');
    });

    it('should fail when no epic content provided', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test',
        // No epicContent or epicPath
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('epicPath or epicContent is required');
    });

    it('should return message explaining agent requirement', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test',
        epicContent: 'Test content',
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.message).toContain('AGENT INVOCATION REQUIRED');
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        epicContent: 'Test content',
      };
      const context: MCPToolContext = {
        requestId: 'test-request-id',
        startTime: Date.now(),
        abortSignal: controller.signal,
      };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operation aborted');
    });
  });

  describe('execute - validate-evidence action', () => {
    const createContext = (): MCPToolContext => ({
      requestId: 'test-request-id',
      startTime: Date.now(),
    });

    it('should validate correct evidence points', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        action: 'validate-evidence',
        evidencePoints: [
          {
            sourceReference: 'src/auth/login.ts:45-52',
            type: 'Direct',
            qualityImplication: 'Authentication security',
            reasoning: 'This function handles password validation which is critical for security',
          },
        ],
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.evidenceValidation).toBeDefined();
      expect(result.data!.evidenceValidation!.valid).toBe(true);
      expect(result.data!.evidenceValidation!.errors).toHaveLength(0);
    });

    it('should reject invalid evidence format', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        action: 'validate-evidence',
        evidencePoints: [
          {
            sourceReference: 'invalid reference without line numbers',
            type: 'Direct',
            qualityImplication: 'Test',
            reasoning: 'Short',
          },
        ],
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.evidenceValidation!.valid).toBe(false);
      expect(result.data!.evidenceValidation!.errors.length).toBeGreaterThan(0);
    });

    it('should require evidence points for validate-evidence action', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        action: 'validate-evidence',
        // No evidencePoints
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires evidencePoints');
    });
  });

  describe('execute - format action', () => {
    const createContext = (): MCPToolContext => ({
      requestId: 'test-request-id',
      startTime: Date.now(),
    });

    const completedAnalysis = {
      epic: 'Test Epic',
      component: 'Auth Module',
      timestamp: new Date(),
      coverageMetric: '8 of 10 HTSM Categories',
      categoriesAnalyzed: ['Capability', 'Reliability', 'Security', 'Performance', 'Development', 'Usability', 'Scalability', 'Compatibility'] as const,
      categoriesOmitted: [
        { category: 'Installability' as const, reason: 'SaaS only' },
        { category: 'Charisma' as const, reason: 'Backend service' },
      ],
      recommendations: [
        {
          category: 'Security' as const,
          priority: 'P0' as const,
          evidencePoints: [],
          testFocusAreas: ['Authentication', 'Authorization'],
          automationFitness: 'high' as const,
          whyItMatters: 'User data protection',
          businessImpact: 'Breach could cost millions',
        },
      ],
      crossCuttingConcerns: [],
      piPlanningGuidance: [],
      executiveSummary: 'Focus on security testing for auth module.',
    };

    it('should format analysis as HTML', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        action: 'format',
        outputFormat: 'html',
        completedAnalysis,
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.html).toBeDefined();
      expect(result.data!.html).toContain('Test Epic');
    });

    it('should format analysis as JSON', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        action: 'format',
        outputFormat: 'json',
        completedAnalysis,
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.json).toBeDefined();
      const parsed = JSON.parse(result.data!.json!);
      expect(parsed.epic).toBe('Test Epic');
      expect(parsed.coverageMetric).toBe('8 of 10 HTSM Categories');
    });

    it('should format analysis as Markdown', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        action: 'format',
        outputFormat: 'markdown',
        completedAnalysis,
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.markdown).toBeDefined();
      expect(result.data!.markdown).toContain('# Quality Criteria Recommendations');
      expect(result.data!.markdown).toContain('**Epic:** Test Epic');
    });

    it('should require completedAnalysis for format action', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        action: 'format',
        // No completedAnalysis
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires completedAnalysis');
    });
  });

  describe('invoke', () => {
    it('should validate and execute', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        epicContent: 'Test content',
      };

      const result = await tool.invoke(params);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.toolName).toBe('qe/requirements/quality-criteria');
      expect(result.metadata!.domain).toBe('requirements-validation');
    });

    it('should return validation error for missing required params', async () => {
      const result = await tool.invoke({} as QualityCriteriaParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });
  });
});

describe('qualityCriteriaTool singleton', () => {
  it('should be a QualityCriteriaTool instance', () => {
    expect(qualityCriteriaTool).toBeInstanceOf(QualityCriteriaTool);
  });

  it('should have correct name', () => {
    expect(qualityCriteriaTool.name).toBe('qe/requirements/quality-criteria');
  });
});
