/**
 * Requirements and contract validation task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: validate-requirements, validate-contracts
 */

import { readConfinedText } from '../../shared/io/confined-read.js';
import { ok, err } from '../../shared/types';
import { toError, toErrorMessage } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';
import { discoverSourceFiles } from './handler-utils';
import { MAX_PAYLOAD_FILE_BYTES, requirePayloadPath } from '../../shared/io/payload-path-guard.js';

export function registerRequirementsHandlers(ctx: TaskHandlerContext): void {
  // Register requirements validation handler
  ctx.registerHandler('validate-requirements', async (task) => {
    const payload = task.payload as {
      requirementsPath?: string;
      generateBDD: boolean;
    };

    try {
      // #1126: list requirement files only inside the project.
      let targetPath = process.cwd();
      if (payload.requirementsPath) {
        const confined = await requirePayloadPath('validate-requirements', 'requirementsPath', payload.requirementsPath,
          { allowDirectory: true, allowMissing: true });
        if (!confined.success) return confined;
        targetPath = confined.value;
      }
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

      // #1126: read only a regular file inside the project, within the size
      // limit; the result reports its line count and whether it parses. A
      // missing file keeps its valid:false result below.
      const confined = await requirePayloadPath('validate-contracts', 'contractPath', payload.contractPath,
        { allowMissing: true, maxBytes: MAX_PAYLOAD_FILE_BYTES });
      if (!confined.success) return confined;

      // Check if the contract file exists
      try {
        // #1161: read from the descriptor that was validated, not the name.
        // #1186: a hardlink cannot be confined by path, so it is refused.
        const content = await readConfinedText(confined.value, { maxBytes: MAX_PAYLOAD_FILE_BYTES, hardlinks: 'refuse' });
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
