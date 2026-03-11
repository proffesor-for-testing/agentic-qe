/**
 * Test Source - Existing tests for target files
 */

import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import type { ContextSource, ContextRequest, ContextFragment } from './types.js';

export class TestContextSource implements ContextSource {
  id = 'tests';
  name = 'Existing Tests';
  priority = 70;
  maxTokens = 2000;

  async gather(request: ContextRequest): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = [];

    for (const file of request.targetFiles.slice(0, 3)) {
      const testPaths = this.findTestPaths(file);

      for (const testPath of testPaths) {
        if (existsSync(testPath)) {
          try {
            const content = readFileSync(testPath, 'utf-8');
            // Extract test names only (not full bodies) to save tokens
            const testNames = content.match(/(?:it|test|describe)\s*\(\s*['"`]([^'"`]+)['"`]/g) || [];

            if (testNames.length > 0) {
              const summary = `Tests for ${basename(file)} (${testPath}):\n${testNames.join('\n')}`;
              fragments.push({
                sourceId: this.id,
                title: `Tests: ${basename(file)}`,
                content: summary,
                estimatedTokens: Math.ceil(summary.length / 3.5),
                relevance: 0.8,
              });
            }
          } catch {
            // File read failed — skip
          }
        }
      }
    }

    return fragments;
  }

  private findTestPaths(filePath: string): string[] {
    const base = basename(filePath).replace(/\.(ts|js|tsx|jsx)$/, '');
    const dir = dirname(filePath);
    const extensions = ['.test.ts', '.spec.ts', '.test.js', '.spec.js'];

    const paths: string[] = [];
    for (const ext of extensions) {
      paths.push(join(dir, `${base}${ext}`));
      paths.push(join(dir, '__tests__', `${base}${ext}`));
      paths.push(join(dir, '..', 'tests', `${base}${ext}`));
    }

    return paths;
  }
}
