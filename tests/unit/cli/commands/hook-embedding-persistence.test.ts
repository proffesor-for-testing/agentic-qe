import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUnifiedMemory: vi.fn(),
  computeRealEmbedding: vi.fn(),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => mocks.getUnifiedMemory(),
  findProjectRoot: () => process.cwd(),
}));

vi.mock('../../../../src/learning/experience-capture-middleware.js', () => ({
  initializeExperienceCapture: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/learning/real-embeddings.js', () => ({
  computeRealEmbedding: (...args: unknown[]) => mocks.computeRealEmbedding(...args),
}));

import {
  persistCommandExperience,
  persistTaskOutcome,
} from '../../../../src/cli/commands/hooks-handlers/hooks-dream-learning.js';

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE captured_experiences (
      id TEXT PRIMARY KEY, task TEXT NOT NULL, agent TEXT, domain TEXT,
      success INTEGER, quality REAL, duration_ms INTEGER, model_tier TEXT,
      started_at TEXT, completed_at TEXT, source TEXT,
      consolidated_into TEXT, embedding BLOB, embedding_dimension INTEGER
    );
    CREATE TABLE experience_applications (
      id TEXT PRIMARY KEY, experience_id TEXT, task TEXT, success INTEGER,
      tokens_saved INTEGER, feedback TEXT, applied_at TEXT
    );
    CREATE TABLE qe_trajectories (
      id TEXT PRIMARY KEY, task TEXT, agent TEXT, domain TEXT,
      started_at TEXT, ended_at TEXT, success INTEGER, steps_json TEXT,
      metadata_json TEXT
    );
    CREATE TABLE qe_patterns (
      id TEXT PRIMARY KEY, pattern_type TEXT, qe_domain TEXT, domain TEXT,
      name TEXT, description TEXT, confidence REAL DEFAULT 0.5,
      usage_count INTEGER DEFAULT 0, successful_uses INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0, quality_score REAL DEFAULT 0,
      tier TEXT DEFAULT 'short-term', last_used_at TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE qe_pattern_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT, success INTEGER,
      metrics_json TEXT, feedback TEXT, recorded_at TEXT
    );
    CREATE TABLE kv_store (
      key TEXT, namespace TEXT, value TEXT, expires_at INTEGER,
      created_at INTEGER, PRIMARY KEY (namespace, key)
    );
    CREATE TABLE dream_insights (
      id TEXT PRIMARY KEY, applied INTEGER DEFAULT 0,
      actionable INTEGER DEFAULT 0, created_at TEXT
    );
  `);
}

describe('hook embedding persistence (#581)', () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-hook-embedding-'));
    db = new Database(path.join(tempDir, 'memory.db'));
    createSchema(db);
    mocks.getUnifiedMemory.mockReturnValue({
      isInitialized: () => true,
      initialize: vi.fn().mockResolvedValue(undefined),
      getDatabase: () => db,
    });
    mocks.computeRealEmbedding.mockReset();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should await command-experience embedding persistence before returning', async () => {
    let resolveEmbedding!: (embedding: number[]) => void;
    mocks.computeRealEmbedding.mockReturnValue(
      new Promise<number[]>((resolve) => {
        resolveEmbedding = resolve;
      })
    );
    let completed = false;

    const operation = persistCommandExperience({
      task: 'edit authentication service',
      agent: 'qe-test-architect',
      domain: 'test-generation',
      success: true,
      source: 'cli-hook-post-edit',
    }).then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(mocks.computeRealEmbedding).toHaveBeenCalledOnce());

    expect(completed).toBe(false);
    resolveEmbedding([0.25, 0.5]);
    await operation;
    const row = db.prepare('SELECT embedding_dimension FROM captured_experiences').get() as {
      embedding_dimension: number;
    };
    expect(row.embedding_dimension).toBe(2);
  });

  it('should await post-task embedding persistence before returning', async () => {
    let resolveEmbedding!: (embedding: number[]) => void;
    mocks.computeRealEmbedding.mockReturnValue(
      new Promise<number[]>((resolve) => {
        resolveEmbedding = resolve;
      })
    );
    let completed = false;

    const operation = persistTaskOutcome({
      taskId: 'task-581',
      agent: 'qe-test-architect',
      domain: 'test-generation',
      success: true,
    }).then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(mocks.computeRealEmbedding).toHaveBeenCalledOnce());

    expect(completed).toBe(false);
    resolveEmbedding([0.25, 0.5]);
    await operation;
    const row = db.prepare('SELECT embedding_dimension FROM captured_experiences').get() as {
      embedding_dimension: number;
    };
    expect(row.embedding_dimension).toBe(2);
  });
});
