/**
 * Agentic QE v3 - Quality Criteria Service Unit Tests
 *
 * Tests the QualityCriteriaService for:
 * - analyze(): Returns agentInvocation for real semantic HTSM analysis
 * - Evidence validation (programmatic)
 * - HTML/Markdown/JSON generation (programmatic)
 *
 * CRITICAL: The analyze() method returns agentInvocation, NOT fake analysis.
 * Claude Code MUST spawn the qe-quality-criteria-recommender agent to get real analysis.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QualityCriteriaService,
  createQualityCriteriaService,
  HTSM_CATEGORIES,
  NEVER_OMIT_CATEGORIES,
  PRIORITY_DEFINITIONS,
  type EvidencePoint,
  type QualityCriteriaAnalysis,
  type AgentInvocation,
} from '../../../../src/domains/requirements-validation/index';

describe('QualityCriteriaService', () => {
  let service: QualityCriteriaService;

  beforeEach(() => {
    service = createQualityCriteriaService();
  });

  describe('analyze', () => {
    it('should return agentInvocation for semantic HTSM analysis', () => {
      const result = service.analyze({
        assessmentName: 'Test Assessment',
        epicContent: '# User Authentication Epic\n\nAs a user, I want to log in securely.',
      });

      expect(result.agentInvocation).toBeDefined();
      expect(result.agentInvocation.required).toBe(true);
      expect(result.agentInvocation.agentType).toBe('qe-quality-criteria-recommender');
      expect(result.message).toContain('AGENT INVOCATION REQUIRED');
    });

    it('should include all HTSM categories in the agent prompt', () => {
      const result = service.analyze({
        assessmentName: 'HTSM Test',
        epicContent: 'Test epic content for analysis.',
      });

      const prompt = result.agentInvocation.prompt;

      // Verify all 10 HTSM categories are in the prompt
      for (const category of HTSM_CATEGORIES) {
        expect(prompt).toContain(category);
      }
    });

    it('should include never-omit categories in the agent prompt', () => {
      const result = service.analyze({
        assessmentName: 'Never Omit Test',
        epicContent: 'Test content.',
      });

      const prompt = result.agentInvocation.prompt;

      // Verify never-omit categories are mentioned
      for (const category of NEVER_OMIT_CATEGORIES) {
        expect(prompt).toContain(category);
      }
    });

    it('should include evidence classification rules in prompt', () => {
      const result = service.analyze({
        assessmentName: 'Evidence Test',
        epicContent: 'Test content.',
      });

      const prompt = result.agentInvocation.prompt;

      expect(prompt).toContain('Direct');
      expect(prompt).toContain('Inferred');
      expect(prompt).toContain('Claimed');
      expect(prompt).toContain('requires verification');
    });

    it('should include priority definitions in prompt', () => {
      const result = service.analyze({
        assessmentName: 'Priority Test',
        epicContent: 'Test content.',
      });

      const prompt = result.agentInvocation.prompt;

      expect(prompt).toContain('P0');
      expect(prompt).toContain('P1');
      expect(prompt).toContain('P2');
      expect(prompt).toContain('P3');
      expect(prompt).toContain('Critical');
    });

    it('should include epic content in the agent prompt', () => {
      const epicContent = '# My Epic\n\nThis is my specific epic content for testing.';
      const result = service.analyze({
        assessmentName: 'Epic Content Test',
        epicContent,
      });

      expect(result.agentInvocation.prompt).toContain(epicContent);
    });

    it('should include assessment name in the agent prompt', () => {
      const result = service.analyze({
        assessmentName: 'Unique Assessment Name XYZ',
        epicContent: 'Test content.',
      });

      expect(result.agentInvocation.prompt).toContain('Unique Assessment Name XYZ');
    });

    it('should include source paths when provided', () => {
      const result = service.analyze({
        assessmentName: 'Source Paths Test',
        epicContent: 'Test content.',
        sourcePaths: ['src/auth/', 'src/api/'],
      });

      expect(result.agentInvocation.prompt).toContain('src/auth/');
      expect(result.agentInvocation.prompt).toContain('src/api/');
    });

    it('should include output format when specified', () => {
      const result = service.analyze({
        assessmentName: 'Output Format Test',
        epicContent: 'Test content.',
        outputFormat: 'markdown',
      });

      expect(result.agentInvocation.prompt).toContain('markdown');
    });

    it('should throw error when neither epicPath nor epicContent provided', () => {
      expect(() => {
        service.analyze({
          assessmentName: 'Missing Epic Test',
        });
      }).toThrow('Either epicPath or epicContent is required for analysis');
    });

    it('should have proper timeout for thorough analysis', () => {
      const result = service.analyze({
        assessmentName: 'Timeout Test',
        epicContent: 'Test content.',
      });

      // 5 minutes = 300000ms for thorough HTSM analysis
      expect(result.agentInvocation.timeout).toBe(300000);
    });

    it('should expect QualityCriteriaAnalysis as output', () => {
      const result = service.analyze({
        assessmentName: 'Expected Output Test',
        epicContent: 'Test content.',
      });

      expect(result.agentInvocation.expectedOutput).toBe('QualityCriteriaAnalysis');
    });

    it('should include instructions for Claude Code', () => {
      const result = service.analyze({
        assessmentName: 'Instructions Test',
        epicContent: 'Test content.',
      });

      expect(result.agentInvocation.instructions).toContain('Claude Code MUST spawn');
      expect(result.agentInvocation.instructions).toContain('qe-quality-criteria-recommender');
    });
  });

  describe('validateEvidence', () => {
    it('should validate correct evidence points', () => {
      const evidence: EvidencePoint[] = [
        {
          sourceReference: 'src/auth/login.ts:45-52',
          type: 'Direct',
          qualityImplication: 'Authentication security',
          reasoning: 'This function handles password validation which is critical for security',
        },
      ];

      const result = service.validateEvidence(evidence);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid source reference format', () => {
      const evidence: EvidencePoint[] = [
        {
          sourceReference: 'invalid reference without line numbers',
          type: 'Direct',
          qualityImplication: 'Test',
          reasoning: 'This is a valid reasoning explanation',
        },
      ];

      const result = service.validateEvidence(evidence);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid source reference format');
    });

    it('should accept N/A source reference for search results', () => {
      const evidence: EvidencePoint[] = [
        {
          sourceReference: 'N/A (verified via Glob/Grep search)',
          type: 'Inferred',
          qualityImplication: 'No security middleware found',
          reasoning: 'Searched entire codebase and found no security middleware implementation',
        },
      ];

      const result = service.validateEvidence(evidence);

      expect(result.valid).toBe(true);
    });

    it('should reject Claimed evidence without verification statement', () => {
      const evidence: EvidencePoint[] = [
        {
          sourceReference: 'config/settings.ts:10-20',
          type: 'Claimed',
          qualityImplication: 'Configuration security',
          reasoning: 'This configuration file handles secrets',
        },
      ];

      const result = service.validateEvidence(evidence);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must state "requires verification"');
    });

    it('should accept Claimed evidence with verification statement', () => {
      const evidence: EvidencePoint[] = [
        {
          sourceReference: 'config/settings.ts:10-20',
          type: 'Claimed',
          qualityImplication: 'Configuration security',
          reasoning: 'Configuration file that requires verification for secret handling',
        },
      ];

      const result = service.validateEvidence(evidence);

      expect(result.valid).toBe(true);
    });

    it('should reject Claimed evidence with speculative language', () => {
      const evidence: EvidencePoint[] = [
        {
          sourceReference: 'src/api.ts:100-120',
          type: 'Claimed',
          qualityImplication: 'API security',
          reasoning: 'This could be a security risk and requires verification',
        },
      ];

      const result = service.validateEvidence(evidence);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must not speculate');
    });

    it('should reject evidence with too short reasoning', () => {
      const evidence: EvidencePoint[] = [
        {
          sourceReference: 'src/test.ts:1-5',
          type: 'Direct',
          qualityImplication: 'Test',
          reasoning: 'Short',
        },
      ];

      const result = service.validateEvidence(evidence);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Reasoning too short');
    });

    it('should validate multiple evidence points', () => {
      const evidence: EvidencePoint[] = [
        {
          sourceReference: 'src/auth.ts:10-20',
          type: 'Direct',
          qualityImplication: 'Authentication',
          reasoning: 'Handles user authentication and session management',
        },
        {
          sourceReference: 'src/api.ts:30-40',
          type: 'Inferred',
          qualityImplication: 'API reliability',
          reasoning: 'No rate limiting found in API endpoints',
        },
      ];

      const result = service.validateEvidence(evidence);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('generateHTML', () => {
    it('should generate HTML output with epic name', () => {
      const analysis: QualityCriteriaAnalysis = {
        epic: 'Test Epic',
        timestamp: new Date(),
        coverageMetric: '10 of 10 HTSM Categories',
        categoriesAnalyzed: [...HTSM_CATEGORIES],
        categoriesOmitted: [],
        recommendations: [],
        crossCuttingConcerns: [],
        piPlanningGuidance: [],
        executiveSummary: '',
      };

      const html = service.generateHTML(analysis);

      expect(html).toContain('Test Epic');
      // Should contain Quality Criteria in some form
      expect(html.toLowerCase()).toContain('quality');
    });
  });

  describe('generateMarkdown', () => {
    it('should include all HTSM categories in markdown', () => {
      const analysis: QualityCriteriaAnalysis = {
        epic: 'Test Epic',
        component: 'Auth Module',
        timestamp: new Date(),
        coverageMetric: '10 of 10 HTSM Categories',
        categoriesAnalyzed: [...HTSM_CATEGORIES],
        categoriesOmitted: [],
        recommendations: [],
        crossCuttingConcerns: [],
        piPlanningGuidance: [],
        executiveSummary: 'Test summary',
      };

      const markdown = service.generateMarkdown(analysis);

      expect(markdown).toContain('# Quality Criteria Recommendations');
      expect(markdown).toContain('**Epic:** Test Epic');
      expect(markdown).toContain('**Component:** Auth Module');
      expect(markdown).toContain('## Categories Analyzed');
      expect(markdown).toContain('- Capability');
      expect(markdown).toContain('- Security');
    });

    it('should include recommendations in markdown', () => {
      const analysis: QualityCriteriaAnalysis = {
        epic: 'Test Epic',
        timestamp: new Date(),
        coverageMetric: '8 of 10 HTSM Categories',
        categoriesAnalyzed: [...HTSM_CATEGORIES],
        categoriesOmitted: [],
        recommendations: [
          {
            category: 'Security' as const,
            priority: 'P0' as const,
            evidencePoints: [],
            testFocusAreas: ['Authentication', 'Authorization'],
            automationFitness: 'high' as const,
            whyItMatters: 'Security is critical for user trust',
            businessImpact: 'Data breach could cost millions',
          },
        ],
        crossCuttingConcerns: [],
        piPlanningGuidance: [],
        executiveSummary: '',
      };

      const markdown = service.generateMarkdown(analysis);

      expect(markdown).toContain('## Recommendations');
      expect(markdown).toContain('### Security (P0)');
      expect(markdown).toContain('**Why It Matters:** Security is critical for user trust');
      expect(markdown).toContain('**Business Impact:** Data breach could cost millions');
      expect(markdown).toContain('- Authentication');
    });

    it('should include omitted categories with reasons', () => {
      const analysis: QualityCriteriaAnalysis = {
        epic: 'Test Epic',
        timestamp: new Date(),
        coverageMetric: '8 of 10 HTSM Categories',
        categoriesAnalyzed: HTSM_CATEGORIES.slice(0, 8),
        categoriesOmitted: [
          { category: 'Installability' as const, reason: 'Cloud-only deployment' },
          { category: 'Charisma' as const, reason: 'Backend service only' },
        ],
        recommendations: [],
        crossCuttingConcerns: [],
        piPlanningGuidance: [],
        executiveSummary: '',
      };

      const markdown = service.generateMarkdown(analysis);

      expect(markdown).toContain('## Categories Omitted');
      expect(markdown).toContain('**Installability**: Cloud-only deployment');
      expect(markdown).toContain('**Charisma**: Backend service only');
    });
  });
});

describe('HTSM Constants', () => {
  it('should have 10 HTSM categories', () => {
    expect(HTSM_CATEGORIES).toHaveLength(10);
  });

  it('should include all required categories', () => {
    expect(HTSM_CATEGORIES).toContain('Capability');
    expect(HTSM_CATEGORIES).toContain('Reliability');
    expect(HTSM_CATEGORIES).toContain('Usability');
    expect(HTSM_CATEGORIES).toContain('Charisma');
    expect(HTSM_CATEGORIES).toContain('Security');
    expect(HTSM_CATEGORIES).toContain('Scalability');
    expect(HTSM_CATEGORIES).toContain('Compatibility');
    expect(HTSM_CATEGORIES).toContain('Performance');
    expect(HTSM_CATEGORIES).toContain('Installability');
    expect(HTSM_CATEGORIES).toContain('Development');
  });

  it('should have correct never-omit categories', () => {
    expect(NEVER_OMIT_CATEGORIES).toContain('Capability');
    expect(NEVER_OMIT_CATEGORIES).toContain('Reliability');
    expect(NEVER_OMIT_CATEGORIES).toContain('Security');
    expect(NEVER_OMIT_CATEGORIES).toContain('Performance');
    expect(NEVER_OMIT_CATEGORIES).toContain('Development');
  });

  it('should have all priority definitions', () => {
    expect(PRIORITY_DEFINITIONS.P0).toBeDefined();
    expect(PRIORITY_DEFINITIONS.P0.name).toBe('Critical');
    expect(PRIORITY_DEFINITIONS.P1).toBeDefined();
    expect(PRIORITY_DEFINITIONS.P1.name).toBe('High');
    expect(PRIORITY_DEFINITIONS.P2).toBeDefined();
    expect(PRIORITY_DEFINITIONS.P2.name).toBe('Medium');
    expect(PRIORITY_DEFINITIONS.P3).toBeDefined();
    expect(PRIORITY_DEFINITIONS.P3.name).toBe('Low');
  });
});

describe('Factory Function', () => {
  it('should create service with default config', () => {
    const service = createQualityCriteriaService();
    expect(service).toBeInstanceOf(QualityCriteriaService);
  });

  it('should create service with custom config', () => {
    const service = createQualityCriteriaService({
      defaultOutputFormat: 'json',
      minimumCategories: 6,
    });
    expect(service).toBeInstanceOf(QualityCriteriaService);
  });
});
