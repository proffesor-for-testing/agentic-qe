/**
 * Regression (#797): the SHIPPED CLI bundle must resolve the opt-in Vibium
 * runtime's `browser` API.
 *
 * vibium used to be listed in the build scripts' `nativeModules`, which
 * rewrote `import('vibium')` into a createRequire shim that only re-exported
 * `default` plus a fixed name list. `browser` was not on that list, so the
 * bundled `loadVibium()` rejected a correctly installed vibium@26 as
 * "Unsupported Vibium API" while the source-level code (and its unit tests)
 * passed. These tests therefore exercise dist/, never src/.
 *
 * Requires `npm run build`. Skips only for local unbuilt checkouts; in CI the
 * bundle MUST exist, so a missing build fails loudly instead of skipping.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = resolve(__dirname, '..', '..', '..');
const DIST_CLI = join(ROOT, 'dist', 'cli');
const DIST_MCP = join(ROOT, 'dist', 'mcp', 'bundle.js');
const BUILT = existsSync(join(DIST_CLI, 'bundle.js')) && existsSync(DIST_MCP);
const SKIP = !BUILT && !process.env.CI;
const UNSUPPORTED = 'Unsupported Vibium API';

function vibiumInstalled(): boolean {
  try { createRequire(join(ROOT, 'package.json')).resolve('vibium'); return true; } catch { return false; }
}

function bundleFiles(): string[] {
  const chunks = join(DIST_CLI, 'chunks');
  const chunkFiles = existsSync(chunks) ? readdirSync(chunks).filter(f => f.endsWith('.js')).map(f => join(chunks, f)) : [];
  return [join(DIST_CLI, 'bundle.js'), DIST_MCP, ...chunkFiles];
}

function runtimeChunk(distCli: string): string {
  const chunks = join(distCli, 'chunks');
  const found = readdirSync(chunks).map(f => join(chunks, f))
    .filter(f => f.endsWith('.js') && readFileSync(f, 'utf8').includes(UNSUPPORTED));
  expect(found, 'exactly one CLI chunk should contain the bundled Vibium loader').toHaveLength(1);
  return found[0];
}

/**
 * Child-process probe (kept out of vitest so no module mocking applies):
 * import the bundled runtime chunk, run its esbuild lazy initialisers, build
 * the bundled VibiumClientImpl and call isAvailable(). The client logs
 * "[Vibium] Failed to load vibium package: <reason>" when loadVibium() throws,
 * which separates "API resolved" from "browser payload ready".
 */
const PROBE = `
const mod = await import(process.env.AQE_PROBE_CHUNK);
const isLazyInit = (v) => typeof v === 'function' && !v.prototype && /&&\\(\\w+=\\w+\\(\\w+=0\\)\\)/.test(String(v));
for (const v of Object.values(mod)) if (isLazyInit(v)) v();
const Client = Object.values(mod).find((v) => typeof v === 'function' && v.prototype &&
  typeof v.prototype.isAvailable === 'function' && typeof v.prototype.launch === 'function');
if (!Client) throw new Error('bundled VibiumClientImpl not found in runtime chunk');
const warnings = [];
console.warn = (...args) => warnings.push(args.map((a) => a instanceof Error ? a.message : String(a)).join(' '));
const available = await new Client({ enabled: true }).isAvailable();
const loadFailure = warnings.find((w) => w.includes('Failed to load vibium package')) ?? null;
process.stdout.write(JSON.stringify({ available, loadFailure }));
`;

function probe(chunk: string, cwd: string, env: NodeJS.ProcessEnv = {}): { available: boolean; loadFailure: string | null } {
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', PROBE], {
    cwd, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, ...env, AQE_PROBE_CHUNK: chunk },
  });
  expect(res.error).toBeUndefined();
  expect(res.status, `probe failed: ${res.stderr}`).toBe(0);
  return JSON.parse(res.stdout);
}

describe.skipIf(SKIP)('#797 bundled Vibium runtime resolution', () => {
  it('keeps vibium a plain lazy ESM external (no createRequire shim, no static import)', () => {
    const files = bundleFiles();
    let dynamicImports = 0;
    for (const file of files) {
      const code = readFileSync(file, 'utf8');
      // A static import would crash every CLI command when the optional peer is absent.
      expect(code, `${file} statically imports vibium`).not.toMatch(/from\s*["']vibium["']/);
      // Every call taking "vibium" as its sole argument must be import() or
      // require.resolve(); a bare `x("vibium")` is the native-require shim.
      for (const m of code.matchAll(/([\w$.]+)\(\s*["']vibium["']\s*\)/g)) {
        const callee = m[1];
        expect(callee === 'import' || callee.endsWith('.resolve'), `${file}: ${m[0]}`).toBe(true);
        if (callee === 'import') dynamicImports++;
      }
    }
    expect(dynamicImports, 'bundled loadVibium() should keep import("vibium")').toBeGreaterThan(0);
  }, 30000);

  it.skipIf(!vibiumInstalled() && !process.env.CI)('resolves browser.start from an installed vibium via the bundled loader', () => {
    const result = probe(runtimeChunk(DIST_CLI), ROOT);
    // API resolution is the regression; payload readiness depends on the host.
    expect(result.loadFailure).toBeNull();
  }, 45000);

  it('reports a missing vibium honestly instead of crashing at bundle load', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'aqe-797-no-vibium-'));
    try {
      // Copy dist/cli outside any node_modules tree and point `npm root -g`
      // at an empty prefix so no local, project or global vibium is visible.
      const isolated = join(scratch, 'cli');
      cpSync(DIST_CLI, isolated, { recursive: true });
      const prefix = join(scratch, 'empty-prefix');
      mkdirSync(prefix);
      const result = probe(runtimeChunk(isolated), scratch, { npm_config_prefix: prefix });
      expect(result.available).toBe(false);
      expect(result.loadFailure).toContain('Vibium is not installed; run aqe init --browser-engine');
      expect(result.loadFailure).not.toContain(UNSUPPORTED);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 45000);
});
