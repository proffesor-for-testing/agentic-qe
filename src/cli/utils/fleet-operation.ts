/**
 * Agentic QE v3 - `aqe fleet run` operation tasks (#1125)
 *
 * Each fleet operation runs a real domain handler with the payload it
 * requires, built from the target on disk:
 *   - test    -> test-generation `generate-tests` with the target's source files
 *   - scan    -> security-compliance `sast-scan` with the target's JS/TS files
 *   - analyze -> coverage-analysis `analyze-coverage` with the coverage report
 *                that already exists for the target
 * When the target cannot supply that input the operation is refused with what
 * is missing. Nothing is estimated or made up to fill a payload.
 */

import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { DomainName } from '../../shared/types/index.js';
import { walkSourceFiles } from './file-discovery.js';
import { summarizeCoverage } from './coverage-data.js';
import { describeNoData, resolveExistingCoverage } from '../../coordination/handlers/coverage-target.js';

export const FLEET_OPERATIONS = ['test', 'analyze', 'scan'] as const;
export type FleetOperation = typeof FLEET_OPERATIONS[number];

export interface FleetOperationTask {
  domain: DomainName;
  type: string;
  payload: Record<string, unknown>;
}

export type FleetOperationPlan =
  | { success: true; task: FleetOperationTask }
  | { success: false; error: string };

/** Extensions the built-in SAST patterns cover (sast-scanner.ts). */
const SAST_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const refuse = (error: string): FleetOperationPlan => ({ success: false, error });

/** Build the domain task for a fleet operation on `target`, or say why it cannot run. */
export async function planFleetOperation(operation: FleetOperation, target: string): Promise<FleetOperationPlan> {
  const targetPath = resolve(target);
  if (!existsSync(targetPath)) return refuse(`Target does not exist: ${target}`);

  switch (operation) {
    case 'test': {
      const sourceFiles = walkSourceFiles(targetPath, { includeTests: false });
      if (sourceFiles.length === 0) return refuse(`No source files under ${target} to generate tests for.`);
      return { success: true, task: { domain: 'test-generation', type: 'generate-tests', payload: { sourceFiles } } };
    }

    case 'scan': {
      const files = walkSourceFiles(targetPath, { includeTests: true })
        .filter(file => SAST_EXTENSIONS.has(extname(file).toLowerCase()));
      if (files.length === 0) {
        return refuse(`No files under ${target} that the SAST scanner covers (${[...SAST_EXTENSIONS].join(' ')}).`);
      }
      return { success: true, task: { domain: 'security-compliance', type: 'sast-scan', payload: { files } } };
    }

    case 'analyze': {
      const existing = await resolveExistingCoverage(targetPath);
      if (existing.status === 'no-report') {
        return refuse(`No coverage report for project ${existing.projectRoot}, so there is no coverage to ` +
          'analyze. Run your tests with coverage first (e.g. `npm test -- --coverage`), or pass the report ' +
          'file as --target.');
      }
      if (existing.status === 'target-missing') return refuse(describeNoData('target-missing', target, null));
      const { evaluation, projectRoot } = existing;
      if (evaluation.status !== 'measured') return refuse(describeNoData(evaluation.reason, target, projectRoot));
      const coverageData = { files: evaluation.files, summary: summarizeCoverage(evaluation.files) };
      return { success: true, task: { domain: 'coverage-analysis', type: 'analyze-coverage', payload: { coverageData } } };
    }
  }
}
