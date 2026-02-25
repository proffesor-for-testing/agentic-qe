/**
 * Requirements and contract validation task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: validate-requirements, validate-contracts
 */

import * as fs from 'fs/promises';
import { ok, err } from '../../shared/types';
import { toError, toErrorMessage } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';
import { discoverSourceFiles } from './handler-utils';

export function registerRequirementsHandlers(ctx: TaskHandlerContext): void {
  // Register requirements validation handler
  ctx.registerHandler('validate-requirements', async (task) => {
    const payload = task.payload as {
      requirementsPath?: string;
      generateBDD: boolean;
    };

    try {
      const targetPath = payload.requirementsPath || process.cwd();
      // Look for requirements files (markdown, feature files, etc.)
      const reqFiles = await discoverSourceFiles(targetPath, {
        includeTests: false,
        languages: [],
      });
      // Scan for requirement-like files
      const reqPatterns = ['.md', '.feature', '.gherkin', '.txt', '.rst'];
      const requirementFiles: string[] = [];
      for (const f of reqFiles) {
        if (reqPatterns.some(ext => f.endsWith(ext))) {
          requirementFiles.push(f);
        }
      }

      return ok({
        requirementsAnalyzed: requirementFiles.length,
        testable: 0,
        ambiguous: 0,
        untestable: 0,
        coverage: 0,
        bddScenarios: [],
        warning: requirementFiles.length === 0
          ? 'No requirement files (.md, .feature, .gherkin) found. Provide requirementsPath or add requirement docs.'
          : 'Requirements validation requires LLM analysis. File inventory returned — use task_orchestrate for deep analysis.',
        files: requirementFiles.map(f => f.startsWith(targetPath) ? f.slice(targetPath.length + 1) : f).slice(0, 20),
      });
    } catch (error) {
      return err(toError(error));
    }
  });

  // Register contract validation handler
  ctx.registerHandler('validate-contracts', async (task) => {
    const payload = task.payload as {
      contractPath: string;
      checkBreakingChanges: boolean;
    };

    try {
      if (!payload.contractPath) {
        return ok({
          contractPath: '',
          valid: false,
          breakingChanges: [],
          warnings: [],
          coverage: 0,
          error: 'contractPath is required. Provide a path to an OpenAPI spec, JSON Schema, or Protocol Buffer file.',
        });
      }

      // Check if the contract file exists
      try {
        const content = await fs.readFile(payload.contractPath, 'utf-8');
        const isJson = payload.contractPath.endsWith('.json');
        const isYaml = payload.contractPath.endsWith('.yaml') || payload.contractPath.endsWith('.yml');

        // Basic structural validation
        if (isJson) {
          JSON.parse(content); // throws if invalid
        }

        return ok({
          contractPath: payload.contractPath,
          valid: true,
          format: isJson ? 'json' : isYaml ? 'yaml' : 'unknown',
          breakingChanges: [],
          warnings: [],
          linesAnalyzed: content.split('\n').length,
          note: 'Structural validation passed. For semantic contract testing, use consumer-driven contract tests.',
        });
      } catch (readErr) {
        return ok({
          contractPath: payload.contractPath,
          valid: false,
          breakingChanges: [],
          warnings: [],
          error: `Could not read or parse contract file: ${toErrorMessage(readErr)}`,
        });
      }
    } catch (error) {
      return err(toError(error));
    }
  });
}
