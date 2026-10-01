/** Real, loopback-only regressions. Explicit opt-in fails if setup is missing. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { VibiumClientImpl } from '../../../src/integrations/vibium/client.js';
import { loadVibium, isVibiumReady } from '../../../src/integrations/vibium/runtime.js';
import { AccessibilityAuditor } from '../../../src/domains/visual-accessibility/services/axe-core-audit.js';
import { runAxeAudit } from '../../../src/domains/visual-accessibility/services/axe-core-integration.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { E2EExecuteTool } from '../../../src/mcp/tools/test-execution/e2e-execute.js';

const html = `<!doctype html><html lang="en"><head><title>AQE browser fixture</title></head>
<body><main><h1>Browser contract</h1><label for="name">Name</label><input id="name">
<button id="save" onclick="document.getElementById('result').textContent=document.getElementById('name').value">Save</button>
<p id="result">Waiting</p><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></main></body></html>`;

describe.skipIf(process.env.VIBIUM_REAL_TESTS !== 'true')('Modern Vibium: real browser, CLI and MCP', () => {
  let server: Server;
  let url: string;
  beforeAll(async () => {
    expect(isVibiumReady(), 'Run aqe init --browser-engine before opting into real tests').toBe(true);
    await loadVibium();
    server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No fixture address');
    url = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

  it('runs the supported upstream browser.start/page/stop API', async () => {
    const { browser } = await loadVibium();
    const instance = await browser.start({ headless: true });
    try {
      const page = await instance.page();
      await page.go(url);
      expect(await page.evaluate('document.title')).toBe('AQE browser fixture');
    } finally { await instance.stop(); }
  });

  it('launches, interacts, evaluates function bodies, screenshots and disposes through AQE', async () => {
    const client = new VibiumClientImpl({ enabled: true, headless: true });
    try {
      expect(await client.isAvailable()).toBe(true);
      expect((await client.launch()).success).toBe(true);
      expect((await client.navigate({ url })).success).toBe(true);
      expect((await client.findElement({ selector: '#save' })).success).toBe(true);
      expect((await client.type({ selector: '#name', text: 'Ada' })).success).toBe(true);
      expect((await client.click({ selector: '#save' })).success).toBe(true);
      expect(await client.getText('#result')).toEqual({ success: true, value: 'Ada' });
      expect(await client.evaluate('const title = await Promise.resolve(document.title); return title;')).toEqual({ success: true, value: 'AQE browser fixture' });
      await client.evaluate(readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8'));
      const audit = await runAxeAudit(client);
      expect(audit.success, JSON.stringify(audit)).toBe(true);
      if (audit.success) expect(audit.value.violations.some(v => v.id === 'image-alt')).toBe(true);
      const shot = await client.screenshot({});
      expect(shot.success).toBe(true);
      if (shot.success) expect(Buffer.from(shot.value.base64!, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect((await client.quit()).success).toBe(true);
      expect(await client.getSession()).toBeNull();
    } finally { await client.dispose(); }
  });

  it('runs real axe-core and detects the seeded missing image alternative', async () => {
    const result = await new AccessibilityAuditor({ url }).audit();
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.toolInfo.vibiumAvailable).toBe(true);
    expect(result.violations.some(v => v.id === 'image-alt')).toBe(true);
  });

  it('uses the same modern CLI against the loopback fixture', async () => {
    const run = promisify(execFile);
    const cli = resolve('node_modules/vibium/bin/cli.js');
    try {
      await run(process.execPath, [cli, '--headless', 'go', url]);
      const result = await run(process.execPath, [cli, 'eval', 'document.title']);
      expect(result.stdout).toContain('AQE browser fixture');
    } finally { await run(process.execPath, [cli, 'daemon', 'stop']).catch(() => {}); }
  });

  it('executes a real browser navigation through the MCP E2E tool', async () => {
    const tool = new E2EExecuteTool();
    const result = await tool.execute({
      testCase: {
        id: 'modern-vibium', name: 'Browser dependency contract', description: 'Navigate loopback', baseUrl: url,
        steps: [{ id: 'go', type: 'navigate', description: 'Open fixture', target: url, required: true }, { id: 'assert-title', type: 'assert', description: 'Verify actual page', required: true, options: { assertion: 'title-equals', expected: 'AQE browser fixture' } }],
        retries: 0,
      },
      config: { defaultRetries: 0, screenshotOnFailure: false },
    }, { requestId: 'real-browser-regression', startTime: Date.now() });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data?.testResult?.success).toBe(true);
  });
});
