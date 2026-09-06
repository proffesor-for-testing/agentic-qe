/**
 * Agentic QE v3 - Quality Gate MCP Tool (ADR-119)
 *
 * qe/quality/gate - fail-closed quality and verification-reach verdict against
 * a pinned ADR-117 checklist. Calls the SAME `runQualityGate` orchestrator as the
 * `aqe quality-gate` CLI subcommand so CLI and MCP stay in exact parity.
 *
 * The frontier judge is built from the forwarded HybridRouter
 * (context.llmRouter). When no provider is configured the judge's preflight
 * fails ⇒ the verdict is `inconclusive` — never a silent pass.
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../base';
import { ToolResult } from '../../types';
import { toErrorMessage } from '../../../shared/error-utils.js';
import { getLLMRouter } from '../base.js';
import {
  runQualityGate,
  type ReachAwareQualityGateResult,
} from '../../../validation/quality-gate-runner.js';
import {
  createRouterFrontierJudge,
  createUnavailableJudge,
} from '../../../validation/frontier-judge.js';
import type { VerificationReachManifest } from '../../../validation/verification-reach.js';

export interface QualityGateParams {
  /** Pinned anchor checklist id (e.g. "A1-inRange"). */
  checklistId: string;
  /** The artifact under judgement (produced test source / spec output). */
  artifact: string;
  /**
   * Mechanical-gate result from the ADR-113 oracle. Omit/null ⇒ oracle did not
   * run ⇒ mechanical fail (a non-executed test can never be a silent pass).
   */
  oracle?: { passed: boolean; baselinePassed: boolean } | null;
  /** Override the frozen anchor path (ADR-117). */
  anchorPath?: string;
  /** Revision-bound evidence proving which failure modes the checks can observe. */
  verificationManifest?: VerificationReachManifest;
  /** Frontier judge model id (ADR-111: always frontier-tier). */
  model?: string;
  [key: string]: unknown;
}

export class QualityGateTool extends MCPToolBase<QualityGateParams, ReachAwareQualityGateResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/quality/gate',
    description:
      'Two-gate, three-valued quality verdict (ADR-119): mechanical oracle gate plus a frontier '
      + 'judge grading plus failure-mode verification reach. Returns pass|fail|inconclusive.',
    domain: 'quality-assessment',
    schema: QUALITY_GATE_SCHEMA,
    streaming: false,
    timeout: 120000,
  };

  async execute(
    params: QualityGateParams,
    context: MCPToolContext,
  ): Promise<ToolResult<ReachAwareQualityGateResult>> {
    try {
      if (!params.checklistId) {
        return { success: false, error: 'checklistId is required' };
      }
      if (typeof params.artifact !== 'string' || params.artifact.length === 0) {
        return { success: false, error: 'artifact (non-empty string) is required' };
      }

      const router = await getLLMRouter(context);
      const judge = router
        ? createRouterFrontierJudge(router, {
            ...(params.model ? { model: params.model } : {}),
            logger: (message) => this.logger.warn(message, { requestId: context.requestId }),
          })
        : createUnavailableJudge('no LLM provider configured — set a frontier provider API key');
      if (!router) {
        this.markAsDemoData(context, 'no LLM router — frontier judge unavailable, verdict will be inconclusive');
      }

      const result = await runQualityGate({
        oracleResult: params.oracle ?? null,
        artifact: params.artifact,
        checklistId: params.checklistId,
        judge,
        anchorPath: params.anchorPath,
        verificationManifest: params.verificationManifest,
      });

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: `Quality gate failed: ${toErrorMessage(error)}` };
    }
  }
}

const QUALITY_GATE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    checklistId: {
      type: 'string',
      description: 'Pinned ADR-117 anchor checklist id (e.g. "A1-inRange")',
    },
    artifact: {
      type: 'string',
      description: 'The artifact under judgement (produced test source / spec output)',
    },
    oracle: {
      type: 'object',
      description: 'ADR-113 mechanical oracle result. Omit ⇒ mechanical fail (test did not execute).',
      properties: {
        passed: { type: 'boolean', description: 'Mutation score met threshold' },
        baselinePassed: { type: 'boolean', description: 'Tests executed against the reference impl' },
      },
    },
    anchorPath: {
      type: 'string',
      description: 'Override the frozen anchor path (ADR-117)',
    },
    verificationManifest: {
      type: 'object',
      description: 'Hashed, revision-bound failure-mode verification reach manifest (#651)',
    },
    model: {
      type: 'string',
      description: 'Frontier judge model id (ADR-111: always frontier-tier)',
    },
  },
  required: ['checklistId', 'artifact'],
};
