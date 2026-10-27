/**
 * Unit tests for trajectory-judge.ts (patch 420).
 *
 * Covers the env-var gate, schema-presence check, happy path, parse fault
 * tolerance, and batch cap. Uses an in-memory better-sqlite3 instance plus
 * a mocked global fetch — never reaches the real Anthropic API.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { scoreUnjudgedTrajectories } from '../../../../src/mcp/handlers/trajectory-judge';

// ---------------------------------------------------------------------------
// Test scaffolding: stand up a fake unified memory the helper can resolve to.
// ---------------------------------------------------------------------------

let db: Database.Database;
let originalEnvKey: string | undefined;
let originalEnvBaseUrl: string | undefined;

vi.mock('../../../../src/kernel/unified-memory', () => ({
  getUnifiedMemory: () => ({
    isInitialized: () => true,
    getDatabase: () => db,
    writeWhenUnlocked: async <T>(fn: () => T) => fn(),
  }),
}));

function makeRow(id: string, ended = true) {
  db.prepare(`
    INSERT INTO qe_trajectories (id, task, agent, domain, started_at, ended_at, success, steps_json, feedback)
    VALUES (?, ?, 'tester', 'test-generation', datetime('now', '-5 minutes'), ?, 1, '[]', NULL)
  `).run(id, `task ${id}`, ended ? new Date().toISOString() : null);
}

beforeEach(() => {
  originalEnvKey = process.env.ANTHROPIC_API_KEY;
  originalEnvBaseUrl = process.env.ANTHROPIC_BASE_URL;

  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE qe_trajectories (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      agent TEXT,
      domain TEXT,
      started_at TEXT,
      ended_at TEXT,
      success INTEGER,
      steps_json TEXT,
      feedback TEXT
    );
  `);

  // @ts-expect-error — install a vi.fn fetch on the global
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  if (originalEnvKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalEnvKey;
  if (originalEnvBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
  else process.env.ANTHROPIC_BASE_URL = originalEnvBaseUrl;
  db.close();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('trajectory-judge', () => {
  it('no-ops when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    makeRow('a');
    await scoreUnjudgedTrajectories();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const row = db.prepare('SELECT feedback FROM qe_trajectories WHERE id = ?').get('a') as { feedback: string | null };
    expect(row.feedback).toBeNull();
  });

  it('no-ops when feedback column is absent', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    db.exec('ALTER TABLE qe_trajectories DROP COLUMN feedback');
    db.prepare(`INSERT INTO qe_trajectories (id, task, agent, domain, started_at, ended_at, success, steps_json) VALUES ('a', 't', 'tester', 'd', datetime('now'), datetime('now'), 1, '[]')`).run();
    await scoreUnjudgedTrajectories();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('writes structured feedback for an unscored row', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    makeRow('happy');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: '{"quality": 0.85, "reasoning": "ok", "improvement": "tighten assertions"}' }],
      }),
    });

    await scoreUnjudgedTrajectories();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const row = db.prepare('SELECT feedback FROM qe_trajectories WHERE id = ?').get('happy') as { feedback: string };
    const verdict = JSON.parse(row.feedback);
    expect(verdict.quality).toBe(0.85);
    expect(verdict.reasoning).toBe('ok');
    expect(verdict.improvement).toBe('tighten assertions');
  });

  it('clamps quality outside [0,1] and tolerates fenced JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    makeRow('clamp');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: 'Sure, here it is:\n```json\n{"quality": 1.4, "reasoning": "x"}\n```\nThanks.' }],
      }),
    });

    await scoreUnjudgedTrajectories();
    const row = db.prepare('SELECT feedback FROM qe_trajectories WHERE id = ?').get('clamp') as { feedback: string };
    const verdict = JSON.parse(row.feedback);
    expect(verdict.quality).toBe(1); // clamped
  });

  it('skips rows with malformed responses without writing partial feedback', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    makeRow('bad');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'no json here just chatter' }] }),
    });

    await scoreUnjudgedTrajectories();
    const row = db.prepare('SELECT feedback FROM qe_trajectories WHERE id = ?').get('bad') as { feedback: string | null };
    expect(row.feedback).toBeNull();
  });

  it('caps the batch at 5 rows even when more are available', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    for (let i = 0; i < 8; i++) makeRow(`row-${i}`);

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: '{"quality": 0.5, "reasoning": "fine"}' }] }),
    });

    await scoreUnjudgedTrajectories();
    expect(globalThis.fetch).toHaveBeenCalledTimes(5);

    const remaining = db.prepare("SELECT COUNT(*) AS c FROM qe_trajectories WHERE feedback IS NULL").get() as { c: number };
    expect(remaining.c).toBe(3);
  });

  it('respects ANTHROPIC_BASE_URL for the fetch target (patch 380 wiring)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.ANTHROPIC_BASE_URL = 'https://proxy.example.com';
    makeRow('proxy');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: '{"quality": 0.5, "reasoning": "fine"}' }] }),
    });

    await scoreUnjudgedTrajectories();
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toBe('https://proxy.example.com/v1/messages');
  });
});
