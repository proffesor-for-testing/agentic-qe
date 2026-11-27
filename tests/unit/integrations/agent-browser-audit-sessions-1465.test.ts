/**
 * #1465 review round 2: agent-browser daemons outlive the MCP server and carry
 * their session only in their environment. Audit sessions are tracked per
 * process, closed on shutdown, killed on 'exit', and reaped by the next audit
 * when their owning process is dead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runAgentBrowser = vi.hoisted(() => vi.fn());
vi.mock('../../../src/integrations/browser/agent-browser/command-executor.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runAgentBrowser,
}));

const sessions = await import('../../../src/integrations/browser/agent-browser/audit-sessions.js');
const {
  newAuditSessionName, auditSessionOwner, registerAuditSession, unregisterAuditSession, liveAuditSessions,
  closeLiveAuditSessions, findDaemonPids, killLiveAuditSessionsSync, reapOrphanedAuditSessions, listAgentBrowserSessions,
} = sessions;

const UUID = '078e2207-0e77-4c3c-8e21-9a83b777d4ca';

afterEach(() => {
  for (const name of liveAuditSessions()) unregisterAuditSession(name);
  runAgentBrowser.mockReset();
  vi.restoreAllMocks();
});

describe('audit session names', () => {
  it('embeds this process pid', () => {
    const name = newAuditSessionName();

    expect(name).toMatch(new RegExp(`^aqe-a11y-${process.pid}-[0-9a-f-]{36}$`));
    expect(auditSessionOwner(name)).toBe(process.pid);
  });

  it.each(['default', 'aqe-a11y-' + UUID, 'my-aqe-a11y-12-' + UUID, 'aqe-a11y-12-notauuid'])(
    'does not claim an owner for %s', (name) => {
      expect(auditSessionOwner(name)).toBeNull();
    });
});

describe('registry and shutdown close', () => {
  it('registers only aqe-a11y sessions', () => {
    registerAuditSession(`aqe-a11y-1-${UUID}`);
    registerAuditSession('default');
    registerAuditSession('e2e-login');

    expect(liveAuditSessions()).toEqual([`aqe-a11y-1-${UUID}`]);
  });

  it('closes every live session in parallel with a bounded timeout, then forgets them', async () => {
    runAgentBrowser.mockResolvedValue({ status: 0, stdout: '', stderr: '' });
    const a = newAuditSessionName();
    const b = newAuditSessionName();
    registerAuditSession(a);
    registerAuditSession(b);

    const closed = await closeLiveAuditSessions(1500);

    expect(closed.sort()).toEqual([a, b].sort());
    expect(runAgentBrowser).toHaveBeenCalledWith(['--session', a, 'close'], 1500);
    expect(runAgentBrowser).toHaveBeenCalledWith(['--session', b, 'close'], 1500);
    expect(liveAuditSessions()).toEqual([]);
  });

  it('does not throw when a close fails', async () => {
    runAgentBrowser.mockRejectedValue(new Error('spawn npx ENOENT'));
    registerAuditSession(newAuditSessionName());

    await expect(closeLiveAuditSessions()).resolves.toHaveLength(1);
  });

  it('keeps a session registered when its close fails, so the exit fallback still reaches it', async () => {
    const ok = newAuditSessionName();
    const slow = newAuditSessionName();
    runAgentBrowser.mockImplementation(async (args: string[]) => {
      if (args[1] === slow) throw Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
      return { status: 0, stdout: '', stderr: '' };
    });
    registerAuditSession(ok);
    registerAuditSession(slow);

    await closeLiveAuditSessions(1500);

    expect(liveAuditSessions()).toEqual([slow]);
  });
});

describe('daemon lookup through /proc (Linux)', () => {
  function fakeProc(entries: Record<string, string[]>): string {
    const dir = mkdtempSync(join(tmpdir(), 'aqe-1465-proc-'));
    for (const [pid, env] of Object.entries(entries)) {
      mkdirSync(join(dir, pid));
      writeFileSync(join(dir, pid, 'environ'), env.join('\0') + '\0');
    }
    mkdirSync(join(dir, 'self'));
    return dir;
  }

  it.runIf(process.platform === 'linux')('finds the daemons of the named sessions only', () => {
    const mine = `aqe-a11y-1-${UUID}`;
    const proc = fakeProc({
      '101': ['PATH=/bin', `AGENT_BROWSER_SESSION=${mine}`],
      '102': ['AGENT_BROWSER_SESSION=default'],
      '103': [`AGENT_BROWSER_SESSION=${mine}x`],
      '104': ['HOME=/home/u'],
    });

    expect(findDaemonPids([mine], proc)).toEqual([101]);
  });

  it('SIGTERMs the daemons of registered sessions on exit and never throws', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    registerAuditSession(`aqe-a11y-1-${UUID}`);

    expect(() => killLiveAuditSessionsSync()).not.toThrow();
    // On Linux the real /proc has no daemon for this made-up session.
    expect(kill).not.toHaveBeenCalledWith(expect.any(Number), 'SIGTERM');
    expect(liveAuditSessions()).toEqual([]);
  });
});

describe('reaping orphaned sessions', () => {
  const DEAD = 999_991;
  const ALIVE = 999_992;
  const alive = (pid: number) => pid === ALIVE || pid === process.pid;

  it('closes only aqe-a11y sessions whose owner pid is dead', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue([
      `aqe-a11y-${DEAD}-${UUID}`,
      `aqe-a11y-${ALIVE}-${UUID}`,
      `aqe-a11y-${process.pid}-${UUID}`,
      'default',
      'e2e-checkout',
      `aqe-a11y-${UUID}`,
    ]);

    const reaped = await reapOrphanedAuditSessions({ force: true, list, close, alive });

    expect(reaped).toEqual([`aqe-a11y-${DEAD}-${UUID}`]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(`aqe-a11y-${DEAD}-${UUID}`);
  });

  it('is throttled unless forced', async () => {
    const list = vi.fn().mockResolvedValue([]);
    await reapOrphanedAuditSessions({ force: true, list, alive });

    await reapOrphanedAuditSessions({ list, alive });

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('never throws when listing fails', async () => {
    const list = vi.fn().mockRejectedValue(new Error('agent-browser missing'));

    await expect(reapOrphanedAuditSessions({ force: true, list, alive })).resolves.toEqual([]);
  });

  it('reads session names from `agent-browser --json session list`', async () => {
    runAgentBrowser.mockResolvedValue({
      status: 0, stderr: '',
      stdout: JSON.stringify({ success: true, data: { sessions: [`aqe-a11y-1-${UUID}`, 'default'] } }),
    });

    await expect(listAgentBrowserSessions()).resolves.toEqual([`aqe-a11y-1-${UUID}`, 'default']);
    expect(runAgentBrowser).toHaveBeenCalledWith(['--json', 'session', 'list'], expect.any(Number));
  });
});
