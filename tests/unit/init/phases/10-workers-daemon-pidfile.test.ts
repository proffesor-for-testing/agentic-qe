/**
 * Issue #488 B.1 — daemon pidfile points at the npx wrapper, not the
 * long-lived MCP server.
 *
 * Root cause: `start-daemon.cjs` falls back to `npx --yes agentic-qe mcp`
 * when neither the local `.bin/aqe-mcp` nor the local
 * `node_modules/agentic-qe/dist/mcp/bundle.js` exists. `npx` exits as soon
 * as it has forked the real bundle, so `child.pid` is the wrapper PID and
 * the pidfile becomes stale within seconds — `aqe daemon status` and the
 * idempotency check at the top of the script both misbehave.
 *
 * The fix: add `require.resolve('agentic-qe/dist/mcp/bundle.js')` as a 3rd
 * candidate before the npx fallback. Global installs (`npm install -g`)
 * are now found directly; `child.pid` is the real long-lived process.
 *
 * This test asserts the candidate is present in the generated daemon
 * script template inside `10-workers.ts` and that the npx fallback now
 * emits a warning so operators can spot the degraded case.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PHASE_FILE = path.resolve(
  __dirname,
  '../../../../src/init/phases/10-workers.ts',
);

describe('start-daemon.cjs generator (#488 B.1)', () => {
  const source = readFileSync(PHASE_FILE, 'utf-8');

  it('the generated script probes for a global install via require.resolve', () => {
    // Catches the case where someone removes the require.resolve probe —
    // which would silently re-introduce the npx-wrapper-PID bug for users
    // who installed agentic-qe globally.
    expect(source).toContain(
      "require.resolve('agentic-qe/dist/mcp/bundle.js')",
    );
  });

  it('the require.resolve probe is guarded by try/catch (so missing global install does not crash)', () => {
    // Use a regex anchored on the candidates.push line so we know the
    // try/catch surrounds the actual probe, not some unrelated code.
    const probeBlock =
      /try\s*\{\s*candidates\.push\(require\.resolve\('agentic-qe\/dist\/mcp\/bundle\.js'\)\);\s*\}\s*catch\s*\{[\s\S]*?\}/;
    expect(source).toMatch(probeBlock);
  });

  it('the npx fallback now warns operators about the pidfile limitation', () => {
    // The npx path remains as a last resort, but operators must be able
    // to spot it in daemon.log so they can fix their install.
    expect(source).toMatch(/WARNING.*npx fallback/);
    expect(source).toMatch(/daemon\.pid will point at the npx wrapper/);
  });

  it('candidate ordering: bundle.js paths come before npx fallback', () => {
    // The require.resolve probe must run BEFORE the existsSync(c) call
    // that picks the first candidate, otherwise the npx fallback wins
    // even when a global install is reachable.
    const requireResolveIdx = source.indexOf(
      "candidates.push(require.resolve('agentic-qe/dist/mcp/bundle.js'))",
    );
    const binCandidateIdx = source.indexOf(
      'const binCandidate = candidates.find',
    );
    const npxFallbackIdx = source.indexOf("'--yes', 'agentic-qe', 'mcp'");

    expect(requireResolveIdx).toBeGreaterThan(0);
    expect(binCandidateIdx).toBeGreaterThan(requireResolveIdx);
    expect(npxFallbackIdx).toBeGreaterThan(binCandidateIdx);
  });
});
