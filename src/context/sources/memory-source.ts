/**
 * Memory Source - Relevant patterns from learning database
 *
 * Queries the SQLite pattern store for patterns relevant to the current task.
 * Falls back to basic task context when the database is unavailable.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { ContextSource, ContextRequest, ContextFragment } from './types.js';

export class MemoryContextSource implements ContextSource {
  id = 'memory';
  name = 'Pattern Memory';
  priority = 80;
  maxTokens = 2000;

  async gather(request: ContextRequest): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = [];

    // Try to query the learning database for relevant patterns
    try {
      const dbPath = join(process.cwd(), '.agentic-qe', 'memory.db');
      if (!existsSync(dbPath)) {
        return this.fallbackGather(request);
      }

      // Dynamic import to avoid hard dependency
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath, { readonly: true });

      try {
        // Query patterns relevant to the task domain
        const domainKeywords = this.extractDomainKeywords(request.taskDescription);

        if (domainKeywords.length > 0) {
          const placeholders = domainKeywords.map(() => 'domain LIKE ?').join(' OR ');
          const likePatterns = domainKeywords.map(k => `%${k}%`);

          const stmt = db.prepare(
            `SELECT name, domain, description, confidence
             FROM qe_patterns
             WHERE ${placeholders}
             ORDER BY confidence DESC
             LIMIT 10`
          );

          const patterns = stmt.all(...likePatterns) as Array<{
            name: string;
            domain: string;
            description: string;
            confidence: number;
          }>;

          if (patterns.length > 0) {
            const content = patterns.map(p =>
              `- **${p.name}** (${p.domain}, confidence: ${(p.confidence * 100).toFixed(0)}%): ${p.description || 'No description'}`
            ).join('\n');

            fragments.push({
              sourceId: this.id,
              title: 'Relevant Patterns from Learning Database',
              content: `Found ${patterns.length} relevant patterns:\n\n${content}`,
              estimatedTokens: Math.ceil(content.length / 3.5),
              relevance: 0.8,
            });
          }
        }
      } finally {
        db.close();
      }
    } catch {
      // Database access failed -- use fallback
      return this.fallbackGather(request);
    }

    if (fragments.length === 0) {
      return this.fallbackGather(request);
    }

    return fragments;
  }

  private fallbackGather(request: ContextRequest): ContextFragment[] {
    const content = [
      `Task: ${request.taskDescription}`,
      `Agent: ${request.agentType}`,
      `Files: ${request.targetFiles.join(', ')}`,
    ].join('\n');

    return [{
      sourceId: this.id,
      title: 'Task Context',
      content,
      estimatedTokens: Math.ceil(content.length / 3.5),
      relevance: 0.5,
    }];
  }

  private extractDomainKeywords(description: string): string[] {
    const keywords: string[] = [];
    const desc = description.toLowerCase();

    const domainMap: Record<string, string[]> = {
      'test-generation': ['test', 'generate', 'create test', 'unit test', 'spec'],
      'coverage-analysis': ['coverage', 'gap', 'branch', 'uncovered'],
      'security-compliance': ['security', 'vulnerability', 'owasp', 'injection', 'auth'],
      'quality-assessment': ['quality', 'review', 'code review', 'assessment'],
      'defect-intelligence': ['defect', 'bug', 'regression', 'root cause'],
    };

    for (const [domain, terms] of Object.entries(domainMap)) {
      if (terms.some(t => desc.includes(t))) {
        keywords.push(domain);
      }
    }

    return keywords.length > 0 ? keywords : ['test-generation']; // default
  }
}
