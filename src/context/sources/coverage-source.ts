/**
 * Coverage Source - Coverage data for target files
 *
 * Reads coverage reports from standard locations (Istanbul/NYC output)
 * under the project root and extracts per-file and project-level coverage
 * metrics.
 *
 * #1337: the reports are read through the confined reader, so a FIFO at one
 * of these names cannot block context compilation and a report symlinked out
 * of the project is not read into the compiled context.
 */

import { join, basename } from 'path';
import { findProjectRoot } from '../../kernel/project-root.js';
import { readConfinedText } from '../../shared/io/confined-read.js';
import type { ContextSource, ContextRequest, ContextFragment } from './types.js';

/** Report locations, relative to the project root, in lookup order. */
const COVERAGE_REPORTS = [
  join('coverage', 'coverage-summary.json'),
  join('coverage', 'coverage-final.json'),
  join('.coverage', 'coverage-summary.json'),
];

export class CoverageContextSource implements ContextSource {
  id = 'coverage';
  name = 'Coverage Data';
  priority = 50;
  maxTokens = 1000;

  /** @param projectRoot - root the reports are read under; defaults to findProjectRoot() */
  constructor(private readonly projectRoot?: string) {}

  async gather(request: ContextRequest): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = [];
    const projectRoot = this.projectRoot ?? findProjectRoot();

    for (const relative of COVERAGE_REPORTS) {
      const coveragePath = join(projectRoot, relative);
      try {
        // A missing report, or one refused by the confined reader (a FIFO,
        // a symlink out of the project, an oversized file), is skipped.
        const raw = await readConfinedText(coveragePath, { projectRoot, outsideRoot: 'allow' });
        const data = JSON.parse(raw) as Record<string, unknown>;

        // Extract coverage for target files
        const targetCoverage: string[] = [];

        for (const targetFile of request.targetFiles) {
          const fileName = basename(targetFile);

          // Search for matching entries in coverage data
          for (const [filePath, metrics] of Object.entries(data)) {
            if (filePath.includes(fileName) && metrics && typeof metrics === 'object') {
              const m = metrics as Record<string, { pct?: number }>;
              const lines = m.lines?.pct ?? m.statements?.pct;
              const branches = m.branches?.pct;
              const functions = m.functions?.pct;

              if (lines !== undefined) {
                targetCoverage.push(
                  `${fileName}: lines=${lines}%${branches !== undefined ? `, branches=${branches}%` : ''}${functions !== undefined ? `, functions=${functions}%` : ''}`
                );
              }
            }
          }
        }

        if (targetCoverage.length > 0) {
          const content = `Coverage for target files:\n${targetCoverage.join('\n')}`;
          fragments.push({
            sourceId: this.id,
            title: 'File Coverage Data',
            content,
            estimatedTokens: Math.ceil(content.length / 3.5),
            relevance: 0.6,
          });
        }

        // Also extract overall project coverage if available
        if (data.total && typeof data.total === 'object') {
          const total = data.total as Record<string, { pct?: number }>;
          const content = `Project coverage: lines=${total.lines?.pct ?? '?'}%, branches=${total.branches?.pct ?? '?'}%, functions=${total.functions?.pct ?? '?'}%`;
          fragments.push({
            sourceId: this.id,
            title: 'Project Coverage Summary',
            content,
            estimatedTokens: Math.ceil(content.length / 3.5),
            relevance: 0.4,
          });
        }

        break; // Found a coverage file, stop looking
      } catch {
        // Missing, refused, or unparseable: try the next location
        continue;
      }
    }

    return fragments;
  }
}
