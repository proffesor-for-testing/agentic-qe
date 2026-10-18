/**
 * Agentic QE v3 - task_orchestrate routes for inferred task types (#1125)
 *
 * task_orchestrate infers an abstract task type from a free-text description.
 * Several of those types have no domain handler of their own; the domain runs
 * a concrete handler type with its own payload instead. Each inferred type
 * either maps to that handler with a payload built only from what the caller
 * supplied, or is refused with the input it needs. A payload is never filled
 * with values the request did not contain.
 */

import type { TaskType } from '../../coordination/queen-types.js';
import type { DomainName } from '../../shared/types/index.js';
import { findProjectRoot } from '../../kernel/project-root.js';
import { confineIndexPaths } from '../../domains/code-intelligence/index-path-guard.js';

export interface OrchestrateRequest {
  task: string;
  filePaths?: string[];
}

export type OrchestrateRoute =
  /** Submit `type` to `domain` with `payload`. */
  | { kind: 'route'; type: string; domain: DomainName; payload: Record<string, unknown> }
  /** The request lacks what the handler needs; `error` says what to supply. */
  | { kind: 'needs-input'; error: string }
  /** The inferred type has its own handler; submit it as before. */
  | { kind: 'as-inferred' };

const needs = (type: TaskType, what: string): OrchestrateRoute => ({
  kind: 'needs-input',
  error: `task_orchestrate inferred '${type}' from the description, but ${what}`,
});

/**
 * Confine caller file paths to the project root (the #1096 rule for index
 * paths). A path outside it, missing, or not a regular file is refused by name.
 */
async function projectFiles(type: TaskType, filePaths: string[]): Promise<{ files: string[] } | OrchestrateRoute> {
  const { accepted, skipped } = await confineIndexPaths(filePaths, findProjectRoot());
  if (skipped.length > 0) {
    const list = skipped.map(s => `${s.path} (${s.reason})`).join(', ');
    return needs(type, `these filePaths cannot be read: ${list}. Pass regular files inside the project.`);
  }
  return { files: accepted };
}

/** Decide how task_orchestrate runs an inferred task type. */
export async function routeInferredTask(type: TaskType, request: OrchestrateRequest): Promise<OrchestrateRoute> {
  const filePaths = request.filePaths ?? [];

  switch (type) {
    case 'scan-security': {
      if (filePaths.length === 0) {
        return needs(type, 'no files to scan were given. Pass filePaths with the source files to scan, ' +
          'or use security_scan_comprehensive with a target.');
      }
      const confined = await projectFiles(type, filePaths);
      if ('kind' in confined) return confined;
      return { kind: 'route', type: 'sast-scan', domain: 'security-compliance', payload: { files: confined.files } };
    }

    case 'assess-quality': {
      if (filePaths.length === 0) {
        return needs(type, 'no source files were given. Pass filePaths with the source files to assess, ' +
          'or use quality_assess.');
      }
      const confined = await projectFiles(type, filePaths);
      if ('kind' in confined) return confined;
      return { kind: 'route', type: 'analyze-quality', domain: 'quality-assessment', payload: { sourceFiles: confined.files } };
    }

    case 'test-accessibility':
      // run-accessibility-audit falls back to URL-pattern heuristics when no
      // browser is available, which reports violations nobody measured.
      return needs(type, 'an accessibility audit needs a browser run against the page (axe-core, pa11y or ' +
        'Lighthouse), and the domain task handler cannot guarantee one. Use accessibility_test with the page URL.');

    case 'optimize-learning':
      // The handler takes no input: it optimizes the strategies learned so far.
      return { kind: 'route', type: 'optimize-strategies', domain: 'learning-optimization', payload: {} };

    case 'run-chaos':
      return needs(type, 'a chaos run needs an experiment, or a fault type and target, which a description ' +
        'does not provide. Use chaos_test, or task_submit with type run-experiment (experimentId) or ' +
        'inject-fault (faultType, target) in domain chaos-resilience.');

    case 'validate-contracts':
      return needs(type, 'contract validation needs the API contract itself. Use contract_validate, or ' +
        'task_submit with type validate-contract and payload.contract in domain contract-testing.');

    case 'validate-requirements':
      return needs(type, 'requirement validation needs a structured requirement (title, description, ' +
        'acceptance criteria). Use requirements_validate, or task_submit with type validate and ' +
        'payload.requirement in domain requirements-validation.');

    default:
      return { kind: 'as-inferred' };
  }
}
