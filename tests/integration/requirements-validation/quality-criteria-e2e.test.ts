/**
 * Quality Criteria E2E Integration Test
 *
 * Verifies the complete pipeline:
 * 1. MCP tool returns correct agentInvocation
 * 2. Agent prompt contains all HTSM requirements
 * 3. Evidence validation works programmatically
 * 4. Format action produces valid output
 * 5. Full workflow simulation
 *
 * This test does NOT spawn actual Claude agents (that requires LLM),
 * but verifies everything UP TO the agent spawn is correct.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  QualityCriteriaTool,
  qualityCriteriaTool,
  type QualityCriteriaParams,
} from '../../../src/mcp/tools/requirements-validation/quality-criteria';
import {
  QualityCriteriaService,
  createQualityCriteriaService,
  HTSM_CATEGORIES,
  NEVER_OMIT_CATEGORIES,
  type QualityCriteriaAnalysis,
  type EvidencePoint,
} from '../../../src/domains/requirements-validation/index';
import { MCPProtocolServer, createMCPProtocolServer } from '../../../src/mcp/protocol-server';
import { MCPToolContext } from '../../../src/mcp/tools/base';

// ============================================================================
// Test Data
// ============================================================================

const SAMPLE_EPIC = `# User Authentication System

## Overview
Implement a secure authentication system for the platform.

## Requirements
1. Users can register with email and password
2. Users can log in with credentials
3. Support OAuth2 (Google, GitHub)
4. Session management with JWT tokens
5. Password reset via email
6. MFA support (TOTP)

## Acceptance Criteria
- Login should complete in < 500ms
- Support 10,000 concurrent users
- OWASP Top 10 compliance
- WCAG 2.1 AA accessibility
`;

const SAMPLE_ANALYSIS: QualityCriteriaAnalysis = {
  epic: 'User Authentication System',
  component: 'Auth Module',
  timestamp: new Date(),
  coverageMetric: '10 of 10 HTSM Categories',
  categoriesAnalyzed: [...HTSM_CATEGORIES],
  categoriesOmitted: [],
  recommendations: [
    {
      category: 'Security',
      priority: 'P0',
      evidencePoints: [
        {
          sourceReference: 'src/auth/password.ts:45-52',
          type: 'Direct',
          qualityImplication: 'Password hashing implementation',
          reasoning: 'Uses bcrypt with salt rounds of 10, which meets OWASP guidelines',
        },
      ],
      testFocusAreas: ['Password hashing', 'JWT validation', 'OAuth2 flow', 'MFA verification'],
      automationFitness: 'high',
      whyItMatters: 'Security vulnerabilities in auth systems lead to data breaches affecting all users',
      businessImpact: 'A breach could affect 100% of users and trigger GDPR mandatory notification',
    },
    {
      category: 'Performance',
      priority: 'P1',
      evidencePoints: [
        {
          sourceReference: 'src/auth/login.ts:120-145',
          type: 'Direct',
          qualityImplication: 'Login latency target',
          reasoning: 'Requirements specify < 500ms login, current implementation has no caching',
        },
      ],
      testFocusAreas: ['Login latency under load', 'Session creation time', 'Token validation speed'],
      automationFitness: 'high',
      whyItMatters: 'Slow login causes user abandonment and support tickets',
      businessImpact: 'Every 100ms delay reduces conversion by 1% (Amazon study)',
    },
    {
      category: 'Reliability',
      priority: 'P0',
      evidencePoints: [
        {
          sourceReference: 'N/A (verified via Glob/Grep search)',
          type: 'Inferred',
          qualityImplication: 'No circuit breaker for OAuth providers',
          reasoning: 'If Google OAuth is down, entire login flow fails - no fallback mechanism found',
        },
      ],
      testFocusAreas: ['OAuth provider failover', 'Database connection resilience', 'Session recovery'],
      automationFitness: 'medium',
      whyItMatters: 'Auth system is a single point of failure - if down, nothing works',
      businessImpact: 'Auth downtime = complete platform outage for all users',
    },
  ],
  crossCuttingConcerns: [
    {
      concern: 'Error handling consistency',
      affectedCategories: ['Security', 'Reliability', 'Usability'],
      recommendation: 'Standardize error responses to prevent information leakage while providing useful feedback',
    },
  ],
  piPlanningGuidance: [
    {
      sprint: 'Current',
      focus: 'Security hardening',
      testingPriority: 'P0 security tests first, then performance baseline',
    },
  ],
  executiveSummary:
    'Authentication system requires immediate security and reliability testing focus. ' +
    'OWASP compliance testing and OAuth failover mechanisms are critical gaps. ' +
    'Performance baseline testing needed before load testing.',
};

// ============================================================================
// Test Suite
// ============================================================================

describe('Quality Criteria E2E Integration', () => {
  let tool: QualityCriteriaTool;
  let service: QualityCriteriaService;

  beforeAll(() => {
    tool = new QualityCriteriaTool();
    service = createQualityCriteriaService();
  });

  describe('MCP Tool → AgentInvocation Pipeline', () => {
    const createContext = (): MCPToolContext => ({
      requestId: `e2e-test-${Date.now()}`,
      startTime: Date.now(),
    });

    it('should return agentInvocation with complete HTSM prompt', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'User Authentication System',
        epicContent: SAMPLE_EPIC,
        sourcePaths: ['src/auth/**/*.ts', 'src/api/auth/**/*.ts'],
        outputFormat: 'html',
        action: 'analyze',
      };

      const result = await tool.execute(params, createContext());

      // Verify successful response
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.agentInvocation).toBeDefined();

      const invocation = result.data!.agentInvocation!;

      // Verify agentInvocation structure
      expect(invocation.required).toBe(true);
      expect(invocation.agentType).toBe('qe-quality-criteria-recommender');
      expect(invocation.timeout).toBe(300000); // 5 minutes
      expect(invocation.expectedOutput).toBe('QualityCriteriaAnalysis');

      // Verify prompt contains epic content
      expect(invocation.prompt).toContain('User Authentication System');
      expect(invocation.prompt).toContain('OAuth2');
      expect(invocation.prompt).toContain('JWT tokens');

      // Verify prompt contains all 10 HTSM categories
      for (const category of HTSM_CATEGORIES) {
        expect(invocation.prompt).toContain(category);
      }

      // Verify prompt contains never-omit categories
      for (const category of NEVER_OMIT_CATEGORIES) {
        expect(invocation.prompt).toContain(category);
      }

      // Verify prompt contains evidence classification rules
      expect(invocation.prompt).toContain('Direct');
      expect(invocation.prompt).toContain('Inferred');
      expect(invocation.prompt).toContain('Claimed');
      expect(invocation.prompt).toContain('requires verification');

      // Verify prompt contains priority definitions
      expect(invocation.prompt).toContain('P0');
      expect(invocation.prompt).toContain('P1');
      expect(invocation.prompt).toContain('P2');
      expect(invocation.prompt).toContain('P3');
      expect(invocation.prompt).toContain('Critical');

      // Verify prompt contains source paths
      expect(invocation.prompt).toContain('src/auth/**/*.ts');
      expect(invocation.prompt).toContain('src/api/auth/**/*.ts');

      // Verify message explains agent requirement
      expect(result.data!.message).toContain('AGENT INVOCATION REQUIRED');
    });

    it('should include instructions for Claude Code', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Test Epic',
        epicContent: 'Test content for instructions verification',
        action: 'analyze',
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      const invocation = result.data!.agentInvocation!;

      // Verify instructions tell Claude Code how to spawn
      expect(invocation.instructions).toContain('Claude Code MUST spawn');
      expect(invocation.instructions).toContain('qe-quality-criteria-recommender');
      expect(invocation.instructions).toContain('Task(');
    });

    it('should fail gracefully when no epic content provided', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Missing Epic Test',
        action: 'analyze',
        // No epicContent or epicPath
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('epicPath or epicContent is required');
    });
  });

  describe('Evidence Validation Pipeline', () => {
    const createContext = (): MCPToolContext => ({
      requestId: `e2e-evidence-${Date.now()}`,
      startTime: Date.now(),
    });

    it('should validate correct evidence through MCP tool', async () => {
      const validEvidence: EvidencePoint[] = [
        {
          sourceReference: 'src/auth/password.ts:45-52',
          type: 'Direct',
          qualityImplication: 'Password hashing implementation',
          reasoning: 'Uses bcrypt with appropriate salt rounds meeting security standards',
        },
        {
          sourceReference: 'N/A (verified via Glob/Grep search)',
          type: 'Inferred',
          qualityImplication: 'No rate limiting middleware found',
          reasoning: 'Searched entire codebase for rate limiting patterns, none found in auth routes',
        },
        {
          sourceReference: 'config/security.ts:10-25',
          type: 'Claimed',
          qualityImplication: 'Security headers configuration',
          reasoning: 'Configuration file that requires verification for proper header settings',
        },
      ];

      const params: QualityCriteriaParams = {
        assessmentName: 'Evidence Validation Test',
        action: 'validate-evidence',
        evidencePoints: validEvidence,
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.evidenceValidation).toBeDefined();
      expect(result.data!.evidenceValidation!.valid).toBe(true);
      expect(result.data!.evidenceValidation!.errors).toHaveLength(0);
    });

    it('should reject invalid source reference format', async () => {
      const invalidEvidence: EvidencePoint[] = [
        {
          sourceReference: 'somewhere in the auth module', // Invalid - no file:line
          type: 'Direct',
          qualityImplication: 'Test',
          reasoning: 'This is a sufficient reasoning explanation for the test',
        },
      ];

      const params: QualityCriteriaParams = {
        assessmentName: 'Invalid Evidence Test',
        action: 'validate-evidence',
        evidencePoints: invalidEvidence,
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.evidenceValidation!.valid).toBe(false);
      expect(result.data!.evidenceValidation!.errors[0]).toContain('Invalid source reference format');
    });

    it('should reject Claimed evidence without verification statement', async () => {
      const claimedEvidence: EvidencePoint[] = [
        {
          sourceReference: 'src/auth/oauth.ts:100-120',
          type: 'Claimed',
          qualityImplication: 'OAuth implementation',
          reasoning: 'This handles OAuth but may have issues', // Missing "requires verification"
        },
      ];

      const params: QualityCriteriaParams = {
        assessmentName: 'Claimed Evidence Test',
        action: 'validate-evidence',
        evidencePoints: claimedEvidence,
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.evidenceValidation!.valid).toBe(false);
      expect(result.data!.evidenceValidation!.errors[0]).toContain('must state "requires verification"');
    });

    it('should reject Claimed evidence with speculative language', async () => {
      const speculativeEvidence: EvidencePoint[] = [
        {
          sourceReference: 'src/auth/session.ts:50-70',
          type: 'Claimed',
          qualityImplication: 'Session management',
          reasoning: 'This could be a security risk and requires verification', // "could" is speculative
        },
      ];

      const params: QualityCriteriaParams = {
        assessmentName: 'Speculative Evidence Test',
        action: 'validate-evidence',
        evidencePoints: speculativeEvidence,
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.evidenceValidation!.valid).toBe(false);
      expect(result.data!.evidenceValidation!.errors[0]).toContain('must not speculate');
    });
  });

  describe('Format Pipeline', () => {
    const createContext = (): MCPToolContext => ({
      requestId: `e2e-format-${Date.now()}`,
      startTime: Date.now(),
    });

    it('should format analysis as HTML through MCP tool', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Format HTML Test',
        action: 'format',
        outputFormat: 'html',
        completedAnalysis: SAMPLE_ANALYSIS,
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.html).toBeDefined();
      expect(result.data!.html).toContain('User Authentication System');
      expect(result.data!.html).toContain('<!DOCTYPE html>');
    });

    it('should format analysis as Markdown through MCP tool', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Format Markdown Test',
        action: 'format',
        outputFormat: 'markdown',
        completedAnalysis: SAMPLE_ANALYSIS,
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.markdown).toBeDefined();
      expect(result.data!.markdown).toContain('# Quality Criteria Recommendations');
      expect(result.data!.markdown).toContain('**Epic:** User Authentication System');
      expect(result.data!.markdown).toContain('## Recommendations');
      expect(result.data!.markdown).toContain('### Security (P0)');
    });

    it('should format analysis as JSON through MCP tool', async () => {
      const params: QualityCriteriaParams = {
        assessmentName: 'Format JSON Test',
        action: 'format',
        outputFormat: 'json',
        completedAnalysis: SAMPLE_ANALYSIS,
      };

      const result = await tool.execute(params, createContext());

      expect(result.success).toBe(true);
      expect(result.data!.json).toBeDefined();

      const parsed = JSON.parse(result.data!.json!);
      expect(parsed.epic).toBe('User Authentication System');
      expect(parsed.coverageMetric).toBe('10 of 10 HTSM Categories');
      expect(parsed.recommendations).toHaveLength(3);
      expect(parsed.recommendations[0].category).toBe('Security');
    });
  });

  describe('Full Workflow Simulation', () => {
    const createContext = (): MCPToolContext => ({
      requestId: `e2e-workflow-${Date.now()}`,
      startTime: Date.now(),
    });

    it('should complete analyze → validate → format workflow', async () => {
      // Step 1: Analyze - get agentInvocation
      const analyzeResult = await tool.execute(
        {
          assessmentName: 'Auth System Analysis',
          epicContent: SAMPLE_EPIC,
          sourcePaths: ['src/auth/**/*.ts'],
          action: 'analyze',
        },
        createContext()
      );

      expect(analyzeResult.success).toBe(true);
      expect(analyzeResult.data!.agentInvocation).toBeDefined();
      expect(analyzeResult.data!.agentInvocation!.agentType).toBe('qe-quality-criteria-recommender');

      // Step 2: Simulate agent producing analysis (in real world, agent would be spawned)
      // For this test, we use SAMPLE_ANALYSIS as the "agent output"

      // Step 3: Validate the evidence points from "agent output"
      const validateResult = await tool.execute(
        {
          assessmentName: 'Auth System Analysis',
          action: 'validate-evidence',
          evidencePoints: SAMPLE_ANALYSIS.recommendations.flatMap(r => r.evidencePoints),
        },
        createContext()
      );

      expect(validateResult.success).toBe(true);
      expect(validateResult.data!.evidenceValidation!.valid).toBe(true);

      // Step 4: Format the validated analysis
      const formatResult = await tool.execute(
        {
          assessmentName: 'Auth System Analysis',
          action: 'format',
          outputFormat: 'html',
          completedAnalysis: SAMPLE_ANALYSIS,
        },
        createContext()
      );

      expect(formatResult.success).toBe(true);
      expect(formatResult.data!.html).toBeDefined();
      expect(formatResult.data!.html).toContain('User Authentication System');
    });
  });

  describe('Service Direct Integration', () => {
    it('should produce consistent results between service and tool', async () => {
      const epicContent = SAMPLE_EPIC;
      const assessmentName = 'Consistency Test';

      // Call service directly
      const serviceResult = service.analyze({
        assessmentName,
        epicContent,
      });

      // Call tool
      const toolResult = await tool.execute(
        {
          assessmentName,
          epicContent,
          action: 'analyze',
        },
        { requestId: 'consistency-test', startTime: Date.now() }
      );

      // Both should return agentInvocation with same agent type
      expect(serviceResult.agentInvocation.agentType).toBe('qe-quality-criteria-recommender');
      expect(toolResult.data!.agentInvocation!.agentType).toBe('qe-quality-criteria-recommender');

      // Both should have same timeout
      expect(serviceResult.agentInvocation.timeout).toBe(toolResult.data!.agentInvocation!.timeout);

      // Both prompts should contain the epic content
      expect(serviceResult.agentInvocation.prompt).toContain(assessmentName);
      expect(toolResult.data!.agentInvocation!.prompt).toContain(assessmentName);
    });

    it('should validate evidence consistently between service and tool', async () => {
      const evidence: EvidencePoint[] = [
        {
          sourceReference: 'src/test.ts:10-20',
          type: 'Direct',
          qualityImplication: 'Test implication',
          reasoning: 'This is a sufficiently detailed reasoning for the validation test',
        },
      ];

      // Validate via service
      const serviceValidation = service.validateEvidence(evidence);

      // Validate via tool
      const toolResult = await tool.execute(
        {
          assessmentName: 'Validation Consistency',
          action: 'validate-evidence',
          evidencePoints: evidence,
        },
        { requestId: 'validation-consistency', startTime: Date.now() }
      );

      // Both should return same validity
      expect(serviceValidation.valid).toBe(toolResult.data!.evidenceValidation!.valid);
      expect(serviceValidation.errors.length).toBe(toolResult.data!.evidenceValidation!.errors.length);
    });
  });

  describe('MCP Protocol Server Integration', () => {
    /**
     * Note: The MCP Protocol Server has its own tool registration mechanism
     * that registers fleet/task/memory tools. QE domain tools (qe/requirements/*)
     * are registered separately via registerAllQETools() and are tested
     * directly through the tool classes above.
     *
     * This test verifies the protocol server can start/stop correctly
     * in the context of quality criteria testing.
     */
    let server: MCPProtocolServer;

    beforeAll(async () => {
      server = createMCPProtocolServer({
        name: 'aqe-v3-quality-criteria-test',
        version: '3.0.0-test',
      });
      await server.start();
    }, 30000);

    afterAll(async () => {
      if (server) {
        await server.stop();
      }
    });

    it('should start MCP server with QE tools registry available', async () => {
      // Verify server is running
      expect(server).toBeDefined();

      // Verify QE tool is available via direct invocation
      const toolResult = await qualityCriteriaTool.invoke({
        assessmentName: 'MCP Context Test',
        epicContent: SAMPLE_EPIC,
        action: 'analyze',
      });

      expect(toolResult.success).toBe(true);
      expect(toolResult.data?.agentInvocation).toBeDefined();
      expect(toolResult.data?.agentInvocation?.agentType).toBe('qe-quality-criteria-recommender');
    });

    it('should have quality criteria tool in QE_TOOLS registry', async () => {
      // Import the registry to verify tool is registered
      const { QE_TOOLS, getQETool } = await import('../../../src/mcp/tools/registry');

      const tool = getQETool('qe/requirements/quality-criteria');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('qe/requirements/quality-criteria');
      expect(tool?.domain).toBe('requirements-validation');

      // Verify it's in the QE_TOOLS array
      const found = QE_TOOLS.find(t => t.name === 'qe/requirements/quality-criteria');
      expect(found).toBeDefined();
    });
  });
});

describe('HTSM Category Coverage', () => {
  it('should have exactly 10 HTSM categories', () => {
    expect(HTSM_CATEGORIES).toHaveLength(10);
  });

  it('should have 5 never-omit categories', () => {
    expect(NEVER_OMIT_CATEGORIES).toHaveLength(5);
    expect(NEVER_OMIT_CATEGORIES).toContain('Capability');
    expect(NEVER_OMIT_CATEGORIES).toContain('Reliability');
    expect(NEVER_OMIT_CATEGORIES).toContain('Security');
    expect(NEVER_OMIT_CATEGORIES).toContain('Performance');
    expect(NEVER_OMIT_CATEGORIES).toContain('Development');
  });

  it('should have all never-omit categories in HTSM categories', () => {
    for (const category of NEVER_OMIT_CATEGORIES) {
      expect(HTSM_CATEGORIES).toContain(category);
    }
  });
});
