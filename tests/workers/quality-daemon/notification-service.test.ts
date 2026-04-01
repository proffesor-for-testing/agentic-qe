/**
 * Tests for the QE Quality Daemon Notification Service (IMP-10).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { NotificationService } from '../../../src/workers/quality-daemon/notification-service';

describe('NotificationService', () => {
  let service: NotificationService;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `aqe-notif-test-${Date.now()}`);
    service = new NotificationService({
      notificationsDir: testDir,
      maxNotifications: 10,
    });
    service.initialize();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // send
  // -------------------------------------------------------------------------

  it('sends a notification and writes to file', async () => {
    const notif = await service.send({
      type: 'gate_failure',
      title: 'Quality Gate Failed',
      message: 'Score 45 below threshold 70',
      severity: 'critical',
    });

    expect(notif.id).toMatch(/^notif-/);
    expect(notif.timestamp).toBeGreaterThan(0);
    expect(notif.read).toBe(false);
    expect(service.sentCount).toBe(1);
  });

  it('increments sentCount for each notification', async () => {
    await service.send({ type: 'ci_failure', title: 'CI Failed', message: 'test', severity: 'high' });
    await service.send({ type: 'coverage_drop', title: 'Coverage Drop', message: 'test', severity: 'medium' });
    expect(service.sentCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  it('lists notifications in reverse chronological order', async () => {
    await service.send({ type: 'gate_failure', title: 'First', message: 'msg', severity: 'high' });
    // Small delay to ensure different timestamps in filenames
    await new Promise((r) => setTimeout(r, 10));
    await service.send({ type: 'ci_failure', title: 'Second', message: 'msg', severity: 'medium' });

    const list = service.list();
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('Second');
    expect(list[1].title).toBe('First');
  });

  it('filters by type', async () => {
    await service.send({ type: 'gate_failure', title: 'Gate', message: 'msg', severity: 'critical' });
    await service.send({ type: 'ci_failure', title: 'CI', message: 'msg', severity: 'high' });

    const gateOnly = service.list({ type: 'gate_failure' });
    expect(gateOnly).toHaveLength(1);
    expect(gateOnly[0].type).toBe('gate_failure');
  });

  it('limits result count', async () => {
    for (let i = 0; i < 5; i++) {
      await service.send({ type: 'daemon_health', title: `N${i}`, message: 'msg', severity: 'info' });
    }

    const limited = service.list({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('returns empty array when no notifications exist', () => {
    const emptyDir = join(tmpdir(), `aqe-empty-${Date.now()}`);
    const emptySvc = new NotificationService({ notificationsDir: emptyDir });
    const list = emptySvc.list();
    expect(list).toEqual([]);
  });

  it('unreadOnly filter returns only unread when mixed states exist', async () => {
    const n1 = await service.send({ type: 'gate_failure', title: 'First', message: 'msg', severity: 'high' });
    await new Promise((r) => setTimeout(r, 10));
    const n2 = await service.send({ type: 'ci_failure', title: 'Second', message: 'msg', severity: 'high' });
    await new Promise((r) => setTimeout(r, 10));
    const n3 = await service.send({ type: 'coverage_drop', title: 'Third', message: 'msg', severity: 'medium' });

    // Mark middle notification as read
    service.markRead(n2.id);

    const unread = service.list({ unreadOnly: true });
    expect(unread).toHaveLength(2);
    const unreadIds = unread.map((n) => n.id);
    expect(unreadIds).toContain(n1.id);
    expect(unreadIds).toContain(n3.id);
    expect(unreadIds).not.toContain(n2.id);

    // Full list still has all 3
    const all = service.list();
    expect(all).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // markRead
  // -------------------------------------------------------------------------

  it('marks a notification as read', async () => {
    const notif = await service.send({ type: 'gate_failure', title: 'Test', message: 'msg', severity: 'high' });
    const result = service.markRead(notif.id);
    expect(result).toBe(true);

    const list = service.list({ unreadOnly: true });
    expect(list).toHaveLength(0);
  });

  it('returns false for non-existent notification id', () => {
    const result = service.markRead('nonexistent');
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------------

  it('clears all notifications', async () => {
    await service.send({ type: 'gate_failure', title: 'A', message: 'msg', severity: 'high' });
    await service.send({ type: 'ci_failure', title: 'B', message: 'msg', severity: 'medium' });

    const cleared = service.clear();
    expect(cleared).toBe(2);
    expect(service.list()).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // pruning
  // -------------------------------------------------------------------------

  it('prunes oldest notifications when exceeding max', async () => {
    const smallService = new NotificationService({
      notificationsDir: testDir,
      maxNotifications: 3,
    });
    smallService.initialize();

    for (let i = 0; i < 5; i++) {
      await smallService.send({ type: 'daemon_health', title: `N${i}`, message: 'msg', severity: 'info' });
      // Ensure distinct timestamps
      await new Promise((r) => setTimeout(r, 10));
    }

    const list = smallService.list({ limit: 100 });
    expect(list.length).toBeLessThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // SSRF guard
  // -------------------------------------------------------------------------

  it('blocks webhook when URL validator rejects', async () => {
    const guardedService = new NotificationService({
      notificationsDir: testDir,
      webhookUrl: 'http://169.254.169.254/metadata',
      urlValidator: (url) => !url.includes('169.254'),
    });
    guardedService.initialize();

    // Should not throw — webhook is silently blocked
    const notif = await guardedService.send({
      type: 'gate_failure',
      title: 'Test',
      message: 'msg',
      severity: 'high',
    });
    expect(notif).toBeDefined();
  });
});
