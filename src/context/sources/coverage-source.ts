/**
 * Coverage Source - Coverage data for target files
 *
 * Reads coverage reports from standard locations (Istanbul/NYC output)
 * and extracts per-file and project-level coverage metrics.
 */

import { existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import type { ContextSource, ContextRequest, ContextFragment } from './types.js';

export class CoverageContextSource implements ContextSource {
  id = 'coverage';
  name = 'Coverage Data';
  priority = 50;
  maxTokens = 1000;

  async gather(request: ContextRequest): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = [];

    // Look for coverage reports in standard locations
    const coveragePaths = [
      join(process.cwd(), 'coverage', 'coverage-summary.json'),
      join(process.cwd(), 'coverage', 'coverage-final.json'),
      join(process.cwd(), '.coverage', 'coverage-summary.json'),
    ];

    for (const coveragePath of coveragePaths) {
      if (!existsSync(coveragePath)) continue;

      try {
        const raw = readFileSync(coveragePath, 'utf-8');
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
        // Failed to parse coverage file
        continue;
      }
    }

    return fragments;
  }
}
