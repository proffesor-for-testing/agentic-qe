/**
 * Agent Booster WASM packaging (issue #1241).
 *
 * The glue was required relative to the bundle (dist/mcp/, dist/cli/chunks/),
 * and neither it nor the .wasm was in the published package, so WASM never
 * loaded. The build now copies the runtime files to
 * dist/integrations/agent-booster-wasm/ and the loader finds them through the
 * package root.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { resolveWasmGlue } from '../../../src/integrations/agent-booster-wasm/index.js';

const repoRoot = join(__dirname, '..', '..', '..');
const fakeRoot = mkdtempSync(join(tmpdir(), 'aqe-1241-'));
writeFileSync(join(fakeRoot, 'package.json'), JSON.stringify({ name: 'agentic-qe' }));
const bundleUrl = (rel: string) => pathToFileURL(join(fakeRoot, rel)).href;

afterAll(() => rmSync(fakeRoot, { recursive: true, force: true }));

describe('Agent Booster WASM packaging (#1241)', () => {
  it('returns null when the glue is nowhere in the package', () => {
    expect(resolveWasmGlue(bundleUrl('dist/mcp/bundle.js'))).toBeNull();
  });

  it('finds the glue under dist/integrations from the MCP bundle and a CLI chunk', () => {
    const wasmDir = join(fakeRoot, 'dist', 'integrations', 'agent-booster-wasm');
    mkdirSync(wasmDir, { recursive: true });
    writeFileSync(join(wasmDir, 'agent_booster_wasm.js'), '');
    const expected = join(wasmDir, 'agent_booster_wasm.js');

    expect(resolveWasmGlue(bundleUrl('dist/mcp/bundle.js'))).toBe(expected);
    expect(resolveWasmGlue(bundleUrl('dist/cli/chunks/chunk-ABC.js'))).toBe(expected);
  });

  it('finds the glue next to the unbundled source module', () => {
    const src = join(repoRoot, 'src', 'integrations', 'agent-booster-wasm', 'index.ts');
    expect(resolveWasmGlue(pathToFileURL(src).href)).toBe(
      join(repoRoot, 'src', 'integrations', 'agent-booster-wasm', 'agent_booster_wasm.js'),
    );
  });

  it('ships the .wasm and copies every runtime file in the build', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
    expect(pkg.files).toContain('dist/**/*.wasm');
    expect(pkg.files).toContain('dist/**/*.json');
    expect(pkg.scripts.build).toContain('build:wasm-assets');

    const script = readFileSync(join(repoRoot, 'scripts', 'copy-wasm-assets.mjs'), 'utf-8');
    for (const name of ['agent_booster_wasm.js', 'agent_booster_wasm_bg.wasm', 'package.json']) {
      expect(script).toContain(`'${name}'`);
      expect(existsSync(join(repoRoot, 'src', 'integrations', 'agent-booster-wasm', name)), name).toBe(true);
    }
  });

  it('keeps the glue CommonJS under the root "type": "module"', () => {
    const nested = JSON.parse(
      readFileSync(join(repoRoot, 'src', 'integrations', 'agent-booster-wasm', 'package.json'), 'utf-8'),
    );
    expect(nested.type ?? 'commonjs').toBe('commonjs');
  });
});
