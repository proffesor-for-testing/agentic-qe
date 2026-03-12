/**
 * Validation Pipeline MCP Handler E2E Test (BMAD-003)
 *
 * Verifies the validation pipeline can be invoked through the MCP handler
 * and produces structured results.
 */

import { describe, it, expect } from 'vitest';
import { handleValidationPipeline } from '../../../../src/mcp/handlers/validation-pipeline-handler.js';

describe('handleValidationPipeline', () => {
  it('should execute full 13-step pipeline on a well-formed document', async () => {
    const result = await handleValidationPipeline({
      content: [
        '# User Management Requirements',
        '',
        '## Overview',
        'This document specifies the requirements for user management.',
        '',
        '## Requirements',
        '',
        '### REQ-001: User Registration',
        'As a visitor, I want to register an account so I can access the platform.',
        '',
        '**Acceptance Criteria:**',
        '- User can register with email and password (8+ chars, 1 uppercase, 1 number)',
        '- Duplicate email rejected with clear error message',
        '- Verification email sent within 30 seconds',
        '',
        '## Scope',
        'In scope: registration, login.',
        'Out of scope: social login.',
      ].join('\n'),
      pipeline: 'requirements',
      format: 'json',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.pipelineId).toBe('requirements-validation');
    expect(result.data!.pipelineName).toBe('Requirements Validation Pipeline');
    expect(result.data!.overall).toMatch(/^(pass|fail|warn)$/);
    expect(result.data!.score).toBeGreaterThanOrEqual(0);
    expect(result.data!.score).toBeLessThanOrEqual(100);
    expect(result.data!.stepsExecuted).toBe(13);
    expect(result.data!.steps).toHaveLength(13);
    expect(result.data!.halted).toBe(false);

    // Verify step structure
    for (const step of result.data!.steps) {
      expect(step.stepId).toBeTruthy();
      expect(step.stepName).toBeTruthy();
      expect(step.status).toMatch(/^(pass|fail|warn|skip)$/);
      expect(step.score).toBeGreaterThanOrEqual(0);
      expect(step.duration).toBeGreaterThanOrEqual(0);
    }
  });

  it('should halt at blocking step on unstructured document', async () => {
    const result = await handleValidationPipeline({
      content: 'just some text without any structure',
      pipeline: 'requirements',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.halted).toBe(true);
    expect(result.data!.haltedAt).toBeTruthy();
    expect(result.data!.overall).toBe('fail');
  });

  it('should continue past blocking failures with continueOnFailure', async () => {
    const result = await handleValidationPipeline({
      content: 'just some text without any structure',
      pipeline: 'requirements',
      continueOnFailure: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.halted).toBe(false);
    expect(result.data!.stepsExecuted).toBeGreaterThan(1);
  });

  it('should filter to specific steps', async () => {
    const result = await handleValidationPipeline({
      content: '# Requirements\n\n## Overview\nTest.\n\n## Requirements\nThe system should handle various things properly.\n\n## Scope\nEtc.',
      pipeline: 'requirements',
      steps: ['format-check', 'vague-term-detection'],
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.stepsExecuted).toBe(2);
    expect(result.data!.steps.map(s => s.stepId)).toEqual(
      expect.arrayContaining(['format-check', 'vague-term-detection'])
    );
  });

  it('should produce markdown report', async () => {
    const result = await handleValidationPipeline({
      content: '# Reqs\n\n## Overview\nTest.\n\n## Requirements\n### REQ-001\nAs a user I want X.\n\n## Scope\nX.',
      pipeline: 'requirements',
      format: 'markdown',
    });

    expect(result.success).toBe(true);
    expect(result.data!.report).toBeDefined();
    expect(result.data!.report).toContain('Validation Report');
  });

  it('should reject missing content and filePath', async () => {
    const result = await handleValidationPipeline({
      pipeline: 'requirements',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('filePath');
  });

  it('should reject unknown pipeline type', async () => {
    const result = await handleValidationPipeline({
      content: 'test',
      pipeline: 'nonexistent',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown pipeline type');
  });
});
