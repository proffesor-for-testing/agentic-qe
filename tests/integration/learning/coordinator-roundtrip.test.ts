/**
 * Issue #491 Bug 2 + Bug 3 — LearningCoordinator write→read round trip.
 *
 * This is the test that was missing. The existing bridge-end-to-end test
 * exercises only the *write* side and queries the DB directly via SQLite,
 * so it never noticed that:
 *
 *   - Bug 2: LearningCoordinator writes with `namespace:'learning-optimization'`
 *     but HybridBackend's `get`/`search` hard-coded `defaultNamespace='default'`.
 *     The coordinator could not read back its own writes — `mineExperiences`
 *     returned 0 for every domain on installs with hundreds of indexed
 *     experiences.
 *
 *   - Bug 3: kv stores `Date` via JSON.stringify (→ ISO string), but
 *     deserialization returns the string verbatim. `TimeRange.contains`
 *     compares `date >= start`; in `string >= Date`, the string coerces to
 *     NaN — so every window check returned false even after Bug 2 was
 *     fixed.
 *
 * This test runs the full path: same kernel, same HybridBackend instance,
 * recordExperience → mineExperiences. If either bug regresses, this fails.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { QEKernelImpl } from '../../../src/kernel/kernel';
import {
  initializeUnifiedMemory,
  resetUnifiedMemory,
} from '../../../src/kernel/unified-memory';
import { createLearningCoordinatorService } from '../../../src/domains/learning-optimization/services/learning-coordinator';
import { TimeRange } from '../../../src/shared/value-objects/index.js';
import type { ExperienceResult, StateSnapshot } from '../../../src/domains/learning-optimization/interfaces.js';

describe('Issue #491 Bug 2 + Bug 3 — LearningCoordinator round trip', () => {
  let dataDir: string;
  let kernel: QEKernelImpl;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-roundtrip-'));
    fs.mkdirSync(path.join(dataDir, '.agentic-qe'), { recursive: true });
    await initializeUnifiedMemory({
      dbPath: path.join(dataDir, '.agentic-qe', 'memory.db'),
    });

    kernel = new QEKernelImpl({
      memoryBackend: 'hybrid',
      dataDir: path.join(dataDir, '.agentic-qe'),
      enabledDomains: ['learning-optimization'],
    });
    await kernel.initialize();
  });

  afterEach(async () => {
    if (kernel) await kernel.dispose();
    resetUnifiedMemory();
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('recordExperience followed by mineExperiences finds the experience back', async () => {
    const coordinator = createLearningCoordinatorService(kernel.memory);

    const state: StateSnapshot = {
      context: { task: 'integration-test' },
      metrics: { latencyMs: 12 },
    };
    const result: ExperienceResult = {
      success: true,
      outcome: { latencyMs: 12 },
      duration: 12,
    };

    const recorded = await coordinator.recordExperience({
      agentId: { value: 'agent-1', domain: 'learning-optimization', type: 'tester' },
      domain: 'learning-optimization',
      action: 'run-test',
      state,
      result,
      reward: 1,
    });
    expect(recorded.success).toBe(true);

    // Window centered on now, generous enough to catch the just-written
    // experience even with sub-second clock skew between writes and the
    // TimeRange construction.
    const now = Date.now();
    const window = TimeRange.create(new Date(now - 60_000), new Date(now + 60_000));

    const mined = await coordinator.mineExperiences('learning-optimization', window);
    expect(mined.success).toBe(true);
    if (mined.success) {
      // Pre-fix: experienceCount was always 0 here (Bug 2: read in wrong
      // namespace → no keys found at all). Even with namespaces aligned,
      // Bug 3 would still drop every row because the string timestamp
      // fails the TimeRange contains() check.
      expect(mined.value.experienceCount).toBeGreaterThan(0);
    }
  });

  it('mined experience has a real Date timestamp (not a serialized string)', async () => {
    const coordinator = createLearningCoordinatorService(kernel.memory);

    await coordinator.recordExperience({
      agentId: { value: 'agent-1', domain: 'learning-optimization', type: 'tester' },
      domain: 'learning-optimization',
      action: 'run-test',
      state: { context: {}, metrics: {} },
      result: { success: true, outcome: {}, duration: 1 },
      reward: 1,
    });

    // Reach behind the public API to verify the timestamp re-hydration at
    // the kv boundary. We rely on the internal helper exposed for tests
    // through structural access, since mineExperiences aggregates and
    // doesn't return raw experiences.
    const now = Date.now();
    const window = TimeRange.create(new Date(now - 60_000), new Date(now + 60_000));
    const internal = coordinator as unknown as {
      getExperiencesByDomainAndTime: (
        d: string,
        r: TimeRange
      ) => Promise<Array<{ timestamp: unknown }>>;
    };
    const rows = await internal.getExperiencesByDomainAndTime('learning-optimization', window);

    expect(rows.length).toBeGreaterThan(0);
    // Bug 3 regression marker: this MUST be a real Date object after the
    // kv round-trip. Before the fix it would be a string here, which made
    // every downstream TimeRange.contains() comparison return false.
    expect(rows[0]!.timestamp).toBeInstanceOf(Date);
  });

  it('time window EXCLUDES experiences recorded outside it (sanity)', async () => {
    const coordinator = createLearningCoordinatorService(kernel.memory);

    await coordinator.recordExperience({
      agentId: { value: 'agent-1', domain: 'learning-optimization', type: 'tester' },
      domain: 'learning-optimization',
      action: 'run-test',
      state: { context: {}, metrics: {} },
      result: { success: true, outcome: {}, duration: 1 },
      reward: 1,
    });

    // Window deliberately in the past — must return zero hits, proving the
    // window filter still works (we want to fix Bug 3 without making
    // TimeRange.contains a no-op).
    const pastWindow = TimeRange.create(
      new Date(Date.now() - 2 * 86400_000),
      new Date(Date.now() - 86400_000)
    );

    const mined = await coordinator.mineExperiences('learning-optimization', pastWindow);
    expect(mined.success).toBe(true);
    if (mined.success) {
      expect(mined.value.experienceCount).toBe(0);
    }
  });
});
