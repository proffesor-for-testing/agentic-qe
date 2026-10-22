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

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TaskType } from '../../coordination/queen-types.js';
import type { DomainName } from '../../shared/types/index.js';
import { findProjectRoot } from '../../kernel/project-root.js';
import { confineIndexPaths } from '../../domains/code-intelligence/index-path-guard.js';
import { requirePayloadPath } from '../../shared/io/payload-path-guard.js';

export interface OrchestrateRequest {
  task: string;
  filePaths?: string[];
}

export type OrchestrateRoute =
  /**
   * Submit `type` to `domain` with `payload`. `executionOwner: 'caller'` runs
   * the task through the MCP task executor, as the domain's own tool does,
   * instead of the domain plugin.
   */
  | { kind: 'route'; type: string; domain: DomainName; payload: Record<string, unknown>; executionOwner?: 'caller' }
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

/** Source and report extensions that mark a bare word in a description as a file. */
const PATH_EXTENSION = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|cs|rb|php|swift|info|lcov|json|xml)$/i;
/** Words after which a description names what to measure ("coverage for src"). */
const TARGET_PREPOSITION = /^(?:for|of|in|under|on)$/i;

/**
 * The paths a description names: words with a path separator or a source /
 * report extension, else a word after "for/of/in/under/on" that exists
 * (`analyze coverage for src`). Anything else is prose.
 */
function pathsInDescription(task: string): string[] {
  const words = task.split(/\s+/).map(w => w.replace(/^[`'"(]+|[`'",;:!?)]+$|\.$/g, '')).filter(Boolean);
  const pathLike = words.filter(w => !/^https?:/i.test(w) && (/[\\/]/.test(w) || PATH_EXTENSION.test(w)));
  if (pathLike.length > 0) return [...new Set(pathLike)];
  // Resolved as the coverage handler resolves its target: from the cwd.
  const named = words.filter((w, i) => i > 0 && TARGET_PREPOSITION.test(words[i - 1]) &&
    /^[\w.-]+$/.test(w) && existsSync(resolve(w)));
  return [...new Set(named)];
}

/**
 * #1200: the one target an orchestrated coverage task measures — the single
 * filePath, else the one path the description names, else '.' (the default
 * of coverage_analyze_sublinear).
 * The task then runs the handler coverage_analyze_sublinear runs, so it
 * resolves the target, reads the report and judges its evidence the same way.
 */
async function coverageRoute(request: OrchestrateRequest): Promise<OrchestrateRoute> {
  const type: TaskType = 'analyze-coverage';
  const given = request.filePaths ?? [];
  const candidates = given.length > 0 ? given : pathsInDescription(request.task);
  if (candidates.length > 1) {
    return needs(type, `coverage is analyzed for one target, and ${given.length > 0 ? 'filePaths' : 'the description'} ` +
      `names ${candidates.length} (${candidates.join(', ')}). Pass one file or directory, or use ` +
      'coverage_analyze_sublinear with a target.');
  }
  const target = candidates[0] ?? '.';
  if (target !== '.') {
    const confined = await requirePayloadPath(type, 'target', target, { allowDirectory: true, allowMissing: true });
    if (!confined.success) return needs(type, `the ${confined.error.message.replace(/^Invalid [\w-]+ payload: /, '')}`);
  }
  return {
    kind: 'route', type, domain: 'coverage-analysis', executionOwner: 'caller',
    payload: { target, detectGaps: true },
  };
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

    case 'index-code':
      // #1134: indexing reads exactly the files it is given; without them the
      // task could only fail after it was accepted. The indexer confines the
      // paths to the project itself (#1096).
      if (filePaths.length === 0) {
        return needs(type, 'no files to index were given. Pass filePaths with the files to index, ' +
          'or use code_index with a target.');
      }
      return { kind: 'as-inferred' };

    case 'assess-quality': {
      if (filePaths.length === 0) {
        return needs(type, 'no source files were given. Pass filePaths with the source files to assess, ' +
          'or use quality_assess.');
      }
      const confined = await projectFiles(type, filePaths);
      if ('kind' in confined) return confined;
      return { kind: 'route', type: 'analyze-quality', domain: 'quality-assessment', payload: { sourceFiles: confined.files } };
    }

    case 'analyze-coverage':
      // #1200: the domain plugin's handler needs coverageData, which a
      // description never carries; the coverage tool's handler finds it.
      return coverageRoute(request);

    case 'test-accessibility':
      // run-accessibility-audit falls back to URL-pattern heuristics when no
      // browser is available, which reports violations nobody measured.
      return needs(type, 'an accessibility audit needs a browser run against the page (axe-core, pa11y or ' +
        'Lighthouse), and the domain task handler cannot guarantee one. Use accessibility_test with the page URL.');

    case 'optimize-learning':
      // optimize-strategies overwrites the stored learned strategies
      // (persist: true). Words like "improve" or "optimize" in a description
      // must not change learning data as a side effect.
      return needs(type, 'learning optimization overwrites the stored learned strategies, so it is not run from ' +
        'a description. Use task_submit with type optimize-strategies in domain learning-optimization.');

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
