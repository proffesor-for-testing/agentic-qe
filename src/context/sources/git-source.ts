/**
 * Git Source - Recent commit context for target files
 */

import { execSync } from 'child_process';
import type { ContextSource, ContextRequest, ContextFragment } from './types.js';

export class GitContextSource implements ContextSource {
  id = 'git';
  name = 'Git History';
  priority = 60;
  maxTokens = 1500;

  async gather(request: ContextRequest): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = [];

    for (const file of request.targetFiles.slice(0, 5)) { // Cap at 5 files
      try {
        const log = execSync(
          `git log --oneline -5 -- "${file}" 2>/dev/null || true`,
          { encoding: 'utf-8', timeout: 5000 }
        ).trim();

        if (log) {
          const content = `Recent commits for ${file}:\n${log}`;
          fragments.push({
            sourceId: this.id,
            title: `Git history: ${file}`,
            content,
            estimatedTokens: Math.ceil(content.length / 3.5),
            relevance: 0.5,
          });
        }
      } catch {
        // Git command failed — skip this file
      }
    }

    return fragments;
  }
}
