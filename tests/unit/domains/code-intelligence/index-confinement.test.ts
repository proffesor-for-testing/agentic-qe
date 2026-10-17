/**
 * #1096: code indexing stays inside the project and reports only files it
 * really indexed. Uses a real temporary project with a real symlink that
 * points to a file outside it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KnowledgeGraphService } from '../../../../src/domains/code-intelligence/services/knowledge-graph';
import { CodeIntelligenceCoordinator } from '../../../../src/domains/code-intelligence/coordinator';
import { InMemoryBackend } from '../../../../src/kernel/memory-backend';
import {
  createCoordinatorTestContext,
  resetTestContext,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';

const SECRET = 'SECRET_TOKEN_1096';

describe('code index confinement (#1096)', () => {
  const cwd = process.cwd();
  let base: string;
  let project: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1096-')));
    project = path.join(base, 'proj');
    fs.mkdirSync(path.join(project, 'src', 'adir.ts'), { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(project, 'src', 'ok.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    fs.writeFileSync(path.join(base, 'outside', 'secret.ts'), `export const ${SECRET} = 'outside-the-project';\n`);
    fs.symlinkSync(path.join('..', '..', 'outside', 'secret.ts'), path.join(project, 'src', 'leak.ts'));
    // As in the reported case, the tools run from inside the project.
    process.chdir(project);
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  const p = (rel: string): string => path.join(project, rel);

  describe('KnowledgeGraphService.index', () => {
    const service = (): KnowledgeGraphService =>
      new KnowledgeGraphService(new InMemoryBackend(), {
        projectRoot: project,
        enableVectorEmbeddings: false,
        enableLLMExtraction: false,
      });

    it('does not index a symlink that points outside the project', async () => {
      const result = await service().index({ paths: [p('src/leak.ts')] });

      expect(result.success).toBe(true);
      expect(result.success && result.value).toMatchObject({
        filesIndexed: 0,
        nodesCreated: 0,
        skipped: [{ path: p('src/leak.ts'), reason: 'outside-project-root' }],
      });
    });

    it('does not count a missing file or a directory as indexed', async () => {
      const result = await service().index({ paths: [p('src/missing.ts'), p('src/adir.ts')] });

      expect(result.success && result.value).toMatchObject({
        filesIndexed: 0,
        nodesCreated: 0,
        skipped: [
          { path: p('src/missing.ts'), reason: 'not-found' },
          { path: p('src/adir.ts'), reason: 'not-a-file' },
        ],
      });
    });

    it('counts only the files it indexed and lists the rest', async () => {
      const result = await service().index({ paths: [p('src/ok.ts'), p('src/leak.ts')] });

      expect(result.success && result.value).toMatchObject({
        filesIndexed: 1,
        skipped: [{ path: p('src/leak.ts'), reason: 'outside-project-root' }],
      });
    });

    it('does not count files removed by the language or test filters', async () => {
      fs.writeFileSync(p('src/ok.test.ts'), 'export const t = 1;\n');
      fs.writeFileSync(p('src/main.py'), 'x = 1\n');

      const result = await service().index({
        paths: [p('src/ok.ts'), p('src/ok.test.ts'), p('src/main.py')],
        includeTests: false,
        languages: ['typescript'],
      });

      expect(result.success && result.value).toMatchObject({
        filesIndexed: 1,
        skipped: [
          { path: p('src/ok.test.ts'), reason: 'excluded-test-file' },
          { path: p('src/main.py'), reason: 'excluded-by-language' },
        ],
      });
    });
  });

  describe('CodeIntelligenceCoordinator.index', () => {
    let ctx: CoordinatorTestContext;
    let coordinator: CodeIntelligenceCoordinator;

    beforeEach(async () => {
      vi.stubEnv('AQE_PROJECT_ROOT', project);
      ctx = createCoordinatorTestContext();
      coordinator = new CodeIntelligenceCoordinator(ctx.eventBus, ctx.memory, ctx.agentCoordinator, {
        enableLearning: false,
        publishEvents: false,
        enableGNN: false,
        enableSONA: false,
        enableHypergraph: false,
        enableMinCutAwareness: false,
        enableConsensus: false,
        enableMetricCollector: false,
      } as never);
      await coordinator.initialize();
    });

    afterEach(async () => {
      await coordinator.dispose();
      resetTestContext(ctx);
    });

    it('fails, naming the reason, when every requested path was skipped', async () => {
      const result = await coordinator.index({ paths: [p('src/leak.ts')] });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Nothing was indexed: 0 of 1 requested path(s) indexed');
        expect(result.error.message).toContain(`${p('src/leak.ts')} (outside-project-root)`);
      }
    });

    it('rejects a non-array paths value before indexing', async () => {
      const result = await coordinator.index({ paths: 'src/ok.ts' as unknown as string[] });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("'paths' must be an array of file paths, got string");
      }
    });

    it('keeps the outside file out of semantic search', async () => {
      const indexed = await coordinator.index({ paths: [p('src/ok.ts'), p('src/leak.ts')] });
      const search = await coordinator.search({ query: SECRET, type: 'exact' });

      expect(JSON.stringify(search)).not.toContain('outside-the-project');
      expect(indexed.success && indexed.value.filesIndexed).toBe(1);
    });
  });
});
