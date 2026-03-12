/**
 * Defect Source - Historical defect patterns for target files
 *
 * Queries the learning database for defect intelligence data,
 * providing historical bug patterns and regression hotspots
 * relevant to the files under analysis.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { ContextSource, ContextRequest, ContextFragment } from './types.js';

export class DefectContextSource implements ContextSource {
  id = 'defects';
  name = 'Defect Intelligence';
  priority = 65;
  maxTokens = 1500;

  async gather(request: ContextRequest): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = [];

    try {
      const dbPath = join(process.cwd(), '.agentic-qe', 'memory.db');
      if (!existsSync(dbPath)) {
        return [];
      }

      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath, { readonly: true });

      try {
        // Check if patterns table exists
        const tableCheck = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='qe_patterns'"
        ).get();

        if (!tableCheck) {
          return [];
        }

        // Query defect patterns related to target files
        const filePatterns = request.targetFiles.map(f => `%${f.split('/').pop()}%`);

        if (filePatterns.length > 0) {
          const placeholders = filePatterns.map(() => 'description LIKE ?').join(' OR ');
          const stmt = db.prepare(
            `SELECT name, domain, description, confidence
             FROM qe_patterns
             WHERE domain LIKE '%defect%'
               AND (${placeholders})
             ORDER BY confidence DESC
             LIMIT 8`
          );

          const defects = stmt.all(...filePatterns) as Array<{
            name: string;
            domain: string;
            description: string;
            confidence: number;
          }>;

          if (defects.length > 0) {
            const content = defects.map(d =>
              `- **${d.name}** (confidence: ${(d.confidence * 100).toFixed(0)}%): ${d.description || 'No description'}`
            ).join('\n');

            fragments.push({
              sourceId: this.id,
              title: 'Historical Defect Patterns',
              content: `Found ${defects.length} defect patterns for target files:\n\n${content}`,
              estimatedTokens: Math.ceil(content.length / 3.5),
              relevance: 0.7,
            });
          }
        }

        // Query regression hotspots based on task description
        const regressionKeywords = this.extractDefectKeywords(request.taskDescription);
        if (regressionKeywords.length > 0) {
          const kwPlaceholders = regressionKeywords.map(() => 'description LIKE ?').join(' OR ');
          const kwPatterns = regressionKeywords.map(k => `%${k}%`);

          const stmt = db.prepare(
            `SELECT name, domain, description, confidence
             FROM qe_patterns
             WHERE (domain LIKE '%defect%' OR domain LIKE '%regression%')
               AND (${kwPlaceholders})
             ORDER BY confidence DESC
             LIMIT 5`
          );

          const regressions = stmt.all(...kwPatterns) as Array<{
            name: string;
            domain: string;
            description: string;
            confidence: number;
          }>;

          if (regressions.length > 0) {
            const content = regressions.map(r =>
              `- **${r.name}**: ${r.description || 'No description'}`
            ).join('\n');

            fragments.push({
              sourceId: this.id,
              title: 'Regression Hotspots',
              content: `Known regression patterns:\n\n${content}`,
              estimatedTokens: Math.ceil(content.length / 3.5),
              relevance: 0.6,
            });
          }
        }
      } finally {
        db.close();
      }
    } catch {
      // Database access failed — return empty (defect context is optional)
      return [];
    }

    return fragments;
  }

  private extractDefectKeywords(description: string): string[] {
    const keywords: string[] = [];
    const desc = description.toLowerCase();

    const defectTerms = [
      'bug', 'defect', 'regression', 'fix', 'crash', 'error',
      'null', 'undefined', 'timeout', 'race condition', 'deadlock',
      'memory leak', 'overflow', 'injection', 'broken',
    ];

    for (const term of defectTerms) {
      if (desc.includes(term)) {
        keywords.push(term);
      }
    }

    return keywords.slice(0, 5);
  }
}
