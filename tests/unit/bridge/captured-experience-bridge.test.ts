/**
 * Issue #479 — bridge that drains captured_experiences (written by hook
 * subprocesses) into the kernel-side eventBus, where the 13 domain plugins'
 * subscribeToEvents() handlers actually live.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { CapturedExperienceBridge } from '../../../src/bridge/captured-experience-bridge';
import { InMemoryEventBus } from '../../../src/kernel/event-bus';
import { InMemoryBackend } from '../../../src/kernel/memory-backend';
import {
  initializeUnifiedMemory,
  resetUnifiedMemory,
  getUnifiedMemory,
} from '../../../src/kernel/unified-memory';
import type { DomainEvent } from '../../../src/shared/types/index';

function freshDbPath(): string {
  return path.join(
    os.tmpdir(),
    `aqe-bridge-test-${Date.now()}-${randomUUID().slice(0, 8)}.db`
  );
}

function createExperiencesTable() {
  const db = getUnifiedMemory().getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS captured_experiences (
      id TEXT PRIMARY KEY,
      task TEXT,
      agent TEXT,
      domain TEXT NOT NULL DEFAULT '',
      success INTEGER NOT NULL DEFAULT 0,
      quality REAL NOT NULL DEFAULT 0.5,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function insertRow(opts: {
  id: string;
  domain: string;
  success?: boolean;
  agent?: string;
  task?: string;
  quality?: number;
  source?: string;
}) {
  const db = getUnifiedMemory().getDatabase();
  db.prepare(`
    INSERT INTO captured_experiences
      (id, task, agent, domain, success, quality, duration_ms, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.id,
    opts.task ?? 'test task',
    opts.agent ?? 'test-agent',
    opts.domain,
    opts.success === false ? 0 : 1,
    opts.quality ?? 0.8,
    100,
    opts.source ?? 'cli-hook-post-task'
  );
}

describe('Issue #479 — CapturedExperienceBridge', () => {
  let dbPath: string;
  let eventBus: InMemoryEventBus;
  let memory: InMemoryBackend;
  let bridge: CapturedExperienceBridge;

  beforeEach(async () => {
    dbPath = freshDbPath();
    await initializeUnifiedMemory({ dbPath });
    createExperiencesTable();
    eventBus = new InMemoryEventBus();
    memory = new InMemoryBackend();
    await memory.initialize();
  });

  afterEach(async () => {
    if (bridge) await bridge.stop();
    await eventBus.dispose();
    resetUnifiedMemory();
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
  });

  it('publishes learning.ExperienceCaptured for every drained row', async () => {
    insertRow({ id: 'e1', domain: 'test-execution' });
    insertRow({ id: 'e2', domain: 'test-generation' });
    insertRow({ id: 'e3', domain: 'coverage-analysis' });

    const learningEvents: DomainEvent[] = [];
    eventBus.subscribe('learning.ExperienceCaptured', async (event) => {
      learningEvents.push(event);
    });

    bridge = new CapturedExperienceBridge(eventBus, memory);
    const published = await bridge.drainOnce();

    // 3 rows × (1 universal + 1 domain-specific each) = 6 events.
    expect(published).toBe(6);
    expect(learningEvents).toHaveLength(3);
    expect(learningEvents[0].source).toBe('learning-optimization');
  });

  it('uses the canonical nested payload shape ' +
     '({ experience: TaskExperience, reward }) — ' +
     'the shape handleExperienceCaptured destructures', async () => {
    insertRow({
      id: 'shape-1',
      domain: 'requirements-validation', // not in any fan-out list
      agent: 'qe-bdd-generator',
      task: 'validate testability',
      success: true,
      quality: 0.85,
    });

    let captured: DomainEvent | undefined;
    eventBus.subscribe('learning.ExperienceCaptured', async (event) => {
      captured = event;
    });

    bridge = new CapturedExperienceBridge(eventBus, memory);
    await bridge.drainOnce();

    expect(captured).toBeDefined();
    const payload = captured!.payload as {
      experience: { id: string; agent: string; domain: string; success: boolean; quality: number };
      reward: number;
    };
    expect(payload.experience).toBeDefined();
    expect(payload.experience.id).toBe('shape-1');
    expect(payload.experience.agent).toBe('qe-bdd-generator');
    expect(payload.experience.domain).toBe('requirements-validation');
    expect(payload.experience.success).toBe(true);
    expect(payload.experience.quality).toBe(0.85);
    expect(payload.reward).toBe(1);
  });

  it('fans out domain-specific events for known domains (legacy flat shape)', async () => {
    insertRow({ id: 'tg-1', domain: 'test-generation' });
    insertRow({ id: 'te-1', domain: 'test-execution' });
    insertRow({ id: 'cov-ok', domain: 'coverage-analysis', success: true });
    insertRow({ id: 'cov-bad', domain: 'coverage-analysis', success: false });

    const seen: string[] = [];
    for (const type of [
      'test-generation.TestGenerated',
      'test-execution.TestRunCompleted',
      'coverage-analysis.CoverageReportCreated',
      'coverage-analysis.CoverageGapDetected',
    ]) {
      eventBus.subscribe(type, async (event) => {
        seen.push(event.type);
      });
    }

    bridge = new CapturedExperienceBridge(eventBus, memory);
    await bridge.drainOnce();

    expect(seen).toContain('test-generation.TestGenerated');
    expect(seen).toContain('test-execution.TestRunCompleted');
    expect(seen).toContain('coverage-analysis.CoverageReportCreated');
    expect(seen).toContain('coverage-analysis.CoverageGapDetected');
  });

  // Parametrized regression — Jordi's #484 suggestion. Catches the
  // class of bug where a domain WITHOUT a domain-specific fan-out would
  // expose the universal-event path being broken (test-execution masked
  // it via the fan-out handler in v3.9.28).
  describe.each([
    'test-execution',           // has fan-out — passes via two paths
    'requirements-validation',  // no fan-out — universal-only path
    'security-compliance',      // no fan-out — universal-only path
    'visual-accessibility',     // no fan-out — universal-only path
  ])(
    'learning.ExperienceCaptured payload for domain=%s',
    (domain) => {
      it('uses the canonical nested { experience, reward } shape', async () => {
        insertRow({ id: `e-${domain}`, domain });

        let captured: DomainEvent | undefined;
        eventBus.subscribe('learning.ExperienceCaptured', async (event) => {
          captured = event;
        });

        bridge = new CapturedExperienceBridge(eventBus, memory);
        await bridge.drainOnce();

        expect(captured).toBeDefined();
        const payload = captured!.payload as {
          experience: { id: string; domain: string };
          reward: number;
        };
        expect(payload.experience).toBeDefined();
        expect(payload.experience.id).toBe(`e-${domain}`);
        expect(payload.experience.domain).toBe(domain);
        expect(payload.reward).toBeTypeOf('number');
      });
    }
  );

  it('persists the cursor and does not republish on the next drain', async () => {
    insertRow({ id: 'e1', domain: 'test-execution' });
    bridge = new CapturedExperienceBridge(eventBus, memory);

    const seen: string[] = [];
    eventBus.subscribe('learning.ExperienceCaptured', async (event) => {
      seen.push((event.payload as { experience: { id: string } }).experience.id);
    });

    await bridge.drainOnce();
    await bridge.drainOnce();

    // Same row must not be republished even when the bridge runs again.
    expect(seen).toEqual(['e1']);
  });

  it('picks up rows inserted between drains', async () => {
    bridge = new CapturedExperienceBridge(eventBus, memory);

    const seen: string[] = [];
    eventBus.subscribe('learning.ExperienceCaptured', async (event) => {
      seen.push((event.payload as { experience: { id: string } }).experience.id);
    });

    insertRow({ id: 'first', domain: 'test-execution' });
    await bridge.drainOnce();
    expect(seen).toEqual(['first']);

    insertRow({ id: 'second', domain: 'test-execution' });
    await bridge.drainOnce();
    expect(seen).toEqual(['first', 'second']);
  });

  it('survives missing captured_experiences table without throwing', async () => {
    getUnifiedMemory().getDatabase().exec('DROP TABLE captured_experiences');
    bridge = new CapturedExperienceBridge(eventBus, memory);
    await expect(bridge.drainOnce()).resolves.toBe(0);
  });

  it('resumes from stored cursor across instances', async () => {
    insertRow({ id: 'e1', domain: 'test-execution' });
    insertRow({ id: 'e2', domain: 'test-execution' });

    const firstBridge = new CapturedExperienceBridge(eventBus, memory);
    await firstBridge.drainOnce();

    // New bridge instance, same memory backend — cursor must persist.
    const secondBridge = new CapturedExperienceBridge(eventBus, memory);
    const seen: string[] = [];
    eventBus.subscribe('learning.ExperienceCaptured', async (event) => {
      seen.push((event.payload as { experience: { id: string } }).experience.id);
    });
    await secondBridge.start();
    await secondBridge.stop();

    // The two pre-existing rows must NOT be republished by the second bridge.
    expect(seen).toEqual([]);
  });
});
