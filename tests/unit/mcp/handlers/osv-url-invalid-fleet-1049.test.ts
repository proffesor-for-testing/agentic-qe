/**
 * #1049 review round 2 (B1): an invalid AQE_OSV_API_URL must never break AQE.
 * It used to throw in the OSVClient constructor during domain init, so fleet
 * init failed and every MCP tool returned "Fleet not initialized". Now the URL
 * is resolved lazily: fleet_status and a SAST-only security_scan_comprehensive
 * work, and only a requested dependency scan fails, naming the bad setting.
 * Real in-process fleet (memory backend), no network.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleFleetInit, handleFleetStatus, disposeFleet } from '../../../../src/mcp/handlers/core-handlers';
import { handleSecurityScan, resetTaskExecutor } from '../../../../src/mcp/handlers/domain-handlers';
import { resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence';

describe('B1: invalid AQE_OSV_API_URL leaves the fleet and non-dependency scans working (#1049)', { timeout: 120000 }, () => {
  const saved = { url: process.env.AQE_OSV_API_URL, root: process.env.AQE_PROJECT_ROOT };
  let project: string;

  beforeAll(async () => {
    project = mkdtempSync(path.join(tmpdir(), 'aqe-1049-badurl-'));
    writeFileSync(path.join(project, 'index.ts'), 'export const add = (a: number, b: number) => a + b;\n');
    writeFileSync(path.join(project, 'package.json'), JSON.stringify({ dependencies: { lodash: '4.17.15' } }));
    process.env.AQE_PROJECT_ROOT = project;
    process.env.AQE_OSV_API_URL = 'ftp://evil';
    const init = await handleFleetInit({ memoryBackend: 'memory' });
    expect(init.success).toBe(true);
  });

  afterAll(async () => {
    resetTaskExecutor();
    await disposeFleet();
    resetUnifiedPersistence();
    if (saved.url === undefined) delete process.env.AQE_OSV_API_URL; else process.env.AQE_OSV_API_URL = saved.url;
    if (saved.root === undefined) delete process.env.AQE_PROJECT_ROOT; else process.env.AQE_PROJECT_ROOT = saved.root;
    rmSync(project, { recursive: true, force: true });
  });

  it('fleet_status succeeds', async () => {
    const status = await handleFleetStatus({});
    expect(status.success).toBe(true);
  });

  it('a SAST-only security_scan_comprehensive runs', async () => {
    const result = await handleSecurityScan({ target: project, saveResults: false });
    expect(result.success).toBe(true);
    expect(result.data!.status).not.toBe('unavailable');
    expect(result.data!.dependencyScan).toBeUndefined();
  });

  it('a requested dependency scan fails with the bad setting named, never a clean result', async () => {
    const result = await handleSecurityScan({ target: project, sast: false, dependencies: true, saveResults: false });
    expect(result.success).toBe(true);
    expect(result.data!.dependencyScan).toMatchObject({ status: 'failed', measured: false, packagesChecked: 0 });
    expect(result.data!.dependencyScan!.error).toMatch(/AQE_OSV_API_URL must use https/);
    expect(result.data!.status).not.toBe('completed');
  });
});
