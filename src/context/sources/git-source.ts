/**
 * Git Source - Recent commit context for target files
 */

import { execFileSync } from 'node:child_process';
import type { ContextSource, ContextRequest, ContextFragment } from './types.js';

export class GitContextSource implements ContextSource {
  id = 'git';
  name = 'Git History';
  priority = 60;
  maxTokens = 1500;

  constructor(private readonly cwd?: string) {}

  async gather(request: ContextRequest): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = [];

    for (const file of request.targetFiles.slice(0, 5)) { // Cap at 5 files
      try {
        // filePaths can originate from MCP tool arguments. Pass each path as
        // one argv element; interpolating it into a shell command would allow
        // command execution via quotes or shell metacharacters.
        const log = execFileSync(
          'git', ['log', '--oneline', '-5', '--', file],
          { cwd: this.cwd ?? process.cwd(), encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
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
