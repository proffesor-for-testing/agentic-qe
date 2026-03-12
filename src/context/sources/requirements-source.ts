/**
 * Requirements Source - Linked requirements for target files
 *
 * Queries the learning database for requirements traceability data,
 * mapping target files to their associated requirements and acceptance criteria.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { ContextSource, ContextRequest, ContextFragment } from './types.js';

export class RequirementsContextSource implements ContextSource {
  id = 'requirements';
  name = 'Requirements Traceability';
  priority = 75;
  maxTokens = 2000;

  async gather(request: ContextRequest): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = [];

    try {
      const dbPath = join(process.cwd(), '.agentic-qe', 'memory.db');
      if (!existsSync(dbPath)) {
        return this.fallbackGather(request);
      }

      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath, { readonly: true });

      try {
        // Check if requirements table exists
        const tableCheck = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='qe_patterns'"
        ).get();

        if (!tableCheck) {
          return this.fallbackGather(request);
        }

        // Query patterns in the requirements domain linked to target files
        const filePatterns = request.targetFiles.map(f => `%${f.split('/').pop()}%`);

        if (filePatterns.length > 0) {
          const placeholders = filePatterns.map(() => 'description LIKE ?').join(' OR ');
          const stmt = db.prepare(
            `SELECT name, domain, description, confidence
             FROM qe_patterns
             WHERE domain LIKE '%requirement%'
               AND (${placeholders})
             ORDER BY confidence DESC
             LIMIT 10`
          );

          const requirements = stmt.all(...filePatterns) as Array<{
            name: string;
            domain: string;
            description: string;
            confidence: number;
          }>;

          if (requirements.length > 0) {
            const content = requirements.map(r =>
              `- **${r.name}** (confidence: ${(r.confidence * 100).toFixed(0)}%): ${r.description || 'No description'}`
            ).join('\n');

            fragments.push({
              sourceId: this.id,
              title: 'Linked Requirements',
              content: `Found ${requirements.length} requirements linked to target files:\n\n${content}`,
              estimatedTokens: Math.ceil(content.length / 3.5),
              relevance: 0.75,
            });
          }
        }

        // Also search by task description keywords for broader requirement context
        const keywords = this.extractRequirementKeywords(request.taskDescription);
        if (keywords.length > 0) {
          const kwPlaceholders = keywords.map(() => 'name LIKE ? OR description LIKE ?').join(' OR ');
          const kwPatterns = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);

          const stmt = db.prepare(
            `SELECT DISTINCT name, domain, description, confidence
             FROM qe_patterns
             WHERE domain LIKE '%requirement%'
               AND (${kwPlaceholders})
             ORDER BY confidence DESC
             LIMIT 5`
          );

          const related = stmt.all(...kwPatterns) as Array<{
            name: string;
            domain: string;
            description: string;
            confidence: number;
          }>;

          if (related.length > 0) {
            const content = related.map(r =>
              `- **${r.name}**: ${r.description || 'No description'}`
            ).join('\n');

            fragments.push({
              sourceId: this.id,
              title: 'Related Requirements',
              content: `Requirements related to task:\n\n${content}`,
              estimatedTokens: Math.ceil(content.length / 3.5),
              relevance: 0.6,
            });
          }
        }
      } finally {
        db.close();
      }
    } catch {
      return this.fallbackGather(request);
    }

    if (fragments.length === 0) {
      return this.fallbackGather(request);
    }

    return fragments;
  }

  private fallbackGather(request: ContextRequest): ContextFragment[] {
    // Provide basic file-to-requirement mapping hint
    const fileList = request.targetFiles.join(', ');
    const content = `No requirements traceability data found for: ${fileList}. Consider running requirements validation to establish traceability.`;

    return [{
      sourceId: this.id,
      title: 'Requirements Context',
      content,
      estimatedTokens: Math.ceil(content.length / 3.5),
      relevance: 0.3,
    }];
  }

  private extractRequirementKeywords(description: string): string[] {
    const keywords: string[] = [];
    const desc = description.toLowerCase();

    // Extract requirement-like identifiers (REQ-001, US-123, etc.)
    const reqIds = desc.match(/(?:req|us|story|epic|feat)-?\d+/gi) || [];
    keywords.push(...reqIds);

    // Extract domain terms relevant to requirements
    const domainTerms = [
      'authentication', 'authorization', 'payment', 'registration',
      'notification', 'search', 'api', 'login', 'user', 'admin',
      'report', 'dashboard', 'import', 'export', 'integration',
    ];

    for (const term of domainTerms) {
      if (desc.includes(term)) {
        keywords.push(term);
      }
    }

    return keywords.slice(0, 5); // Cap at 5 keywords
  }
}
