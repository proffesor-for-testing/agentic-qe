/**
 * #1230: an index run makes every indexed file searchable (it used to stop at
 * 100 files). When the embedding model keeps failing, the run stops asking it,
 * stores the rest as text only, and says so in its warnings (#1231).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodeIntelligenceCoordinator } from '../../../../src/domains/code-intelligence/coordinator';
import { SemanticAnalyzerService } from '../../../../src/domains/code-intelligence/services/semantic-analyzer';
import { EMBEDDING_CONFIG, type IEmbeddingProvider } from '../../../../src/shared/embeddings';
import {
  createCoordinatorTestContext,
  resetTestContext,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';

const FILES = 150;

describe('CodeIntelligenceCoordinator search coverage (#1230)', () => {
  const cwd = process.cwd();
  let project: string;
  let ctx: CoordinatorTestContext;
  let coordinator: CodeIntelligenceCoordinator;
  let paths: string[];

  beforeEach(async () => {
    project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1230-')));
    fs.mkdirSync(path.join(project, 'src'));
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"p"}\n');
    paths = [];
    for (let i = 1; i <= FILES; i++) {
      const file = path.join(project, 'src', `mod${String(i).padStart(3, '0')}.ts`);
      fs.writeFileSync(file, `export function uniqueHandler${i}(x: number) { return x + ${i}; }\n`);
      paths.push(file);
    }
    process.chdir(project);
    vi.stubEnv('AQE_PROJECT_ROOT', project);
    // No embedding model: nothing listens on port 1.
    vi.stubEnv('AQE_OLLAMA_URL', 'http://127.0.0.1:1');

    ctx = createCoordinatorTestContext();
    coordinator = new CodeIntelligenceCoordinator(ctx.eventBus, ctx.memory, ctx.agentCoordinator, {
      enableLearning: false,
      publishEvents: false,
      enableSONA: false,
      enableHypergraph: false,
      enableMinCutAwareness: false,
      enableConsensus: false,
      enableMetricCollector: false,
      enableGNN: false,
    } as never);
    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.dispose();
    resetTestContext(ctx);
    process.chdir(cwd);
    vi.unstubAllEnvs();
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('makes every file of a large index run searchable, without a coverage warning', async () => {
    const summary = await coordinator.indexForSearch(paths);

    expect(summary).toEqual({ searchable: FILES, warnings: [] });
  });

  it.each([
    ['exact', 'uniqueHandler150'],
    ['semantic', 'uniqueHandler150'],
  ] as const)('a %s search finds code in the last file of a 150-file run', async (type, query) => {
    await coordinator.indexForSearch(paths);

    const result = await coordinator.search({ query, type });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.results.map((r) => r.file)).toContain(paths[FILES - 1]);
  });

  it('stops asking a failing embedding model after 3 files in a row and warns', async () => {
    const embed = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const failing: IEmbeddingProvider = {
      embed,
      healthCheck: async () => true,
      getDimensions: () => EMBEDDING_CONFIG.DIMENSIONS,
    };
    (coordinator as unknown as { semanticAnalyzer: SemanticAnalyzerService }).semanticAnalyzer =
      new SemanticAnalyzerService(ctx.memory, { useNomicEmbeddings: false, embeddingProvider: failing });

    const summary = await coordinator.indexForSearch(paths.slice(0, 10));

    expect(embed).toHaveBeenCalledTimes(3);
    expect(summary.searchable).toBe(10);
    expect(summary.warnings).toEqual([
      'The embedding model failed for 3 file(s) (the embedding model failed: connect ECONNREFUSED), ' +
        'so it was not asked for the remaining 7 file(s) of this run. 10 of 10 searchable files have no vector; ' +
        'semantic search matches them by text only. Re-index when the model is available.',
    ]);
  });

  it('warns about files that could not be added to the search index', async () => {
    const summary = await coordinator.indexForSearch([paths[0], path.join(project, 'src', 'missing.ts')]);

    expect(summary).toEqual({
      searchable: 1,
      warnings: [
        'Search covers 1 of 2 indexed files; the other files could not be added to the search index, ' +
          'so code in them is not found by search.',
      ],
    });
  });
});
