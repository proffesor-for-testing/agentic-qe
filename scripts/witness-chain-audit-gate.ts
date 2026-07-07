/**
 * ADR-070 Phase 6.2 / A13: CI gate for the `src/audit/witness-chain.ts` audit
 * trail — the SHAKE-256/Ed25519 chain recording pattern/dream/routing/review
 * decisions, distinct from the 29-row governance receipt chain.
 *
 * There's no committed `.agentic-qe/memory.db` for CI to check (it's
 * gitignored, dev-machine state) — so this gate seeds a throwaway chain in a
 * temp project root, then exercises the REAL CLI path (`aqe audit verify
 * --chain=audit`) end-to-end: append -> archive -> verify, over the same
 * code every user's CI would call. That's what regresses if `verify()` or
 * the CLI wiring breaks, not any specific historical data.
 *
 * Run: npx tsx scripts/witness-chain-audit-gate.ts
 * Exit: 0 clean, 1 on any check failure.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

export interface GateResult { checks: string[]; failures: string[]; }

export async function runGate(): Promise<GateResult> {
  const checks: string[] = [];
  const failures: string[] = [];
  const record = (name: string, pass: boolean, detail?: string): void => {
    checks.push(name);
    if (!pass) failures.push(detail ? `${name}: ${detail}` : name);
  };

  const tmpRoot = mkdtempSync(join(tmpdir(), 'witness-chain-gate-'));
  const prevRoot = process.env.AQE_PROJECT_ROOT;
  try {
    mkdirSync(join(tmpRoot, '.agentic-qe'), { recursive: true });
    process.env.AQE_PROJECT_ROOT = tmpRoot;

    const { clearProjectRootCache } = await import('../src/kernel/project-root.js');
    clearProjectRootCache();

    const { createWitnessChain } = await import('../src/audit/witness-chain.js');
    const { handleAuditChainVerify } = await import('../src/cli/commands/audit.js');

    const dbPath = join(tmpRoot, '.agentic-qe', 'memory.db');
    const db = new Database(dbPath);
    const chain = createWitnessChain(db);
    await chain.initialize();
    chain.append('PATTERN_CREATE', { patternId: 'gate-check-1' }, 'ci-gate');
    chain.append('PATTERN_UPDATE', { patternId: 'gate-check-1', confidence: 0.9 }, 'ci-gate');
    chain.append('QUALITY_GATE_PASS', { gate: 'ci-smoke' }, 'ci-gate');
    // Archive everything eligible, then append one more — the exact shape
    // that broke verify() before the archival fix (a live entry whose
    // predecessor moved to witness_chain_archive).
    chain.archiveEntries(new Date(Date.now() + 60 * 60 * 1000).toISOString());
    chain.append('ROUTING_DECISION', { agent: 'ci-gate' }, 'ci-gate');
    db.close();

    const clean = await handleAuditChainVerify({ format: 'json' });
    record('clean chain verifies as valid', clean.integrity === true, `integrity=${clean.integrity}`);
    record('clean chain reports all 4 entries', clean.chainLength === 4, `chainLength=${clean.chainLength}`);

    // Tamper directly with the live table (bypassing the API) and confirm
    // the gate actually catches it — a gate that always reports "valid" is
    // worse than no gate.
    const tamperDb = new Database(dbPath);
    tamperDb.prepare("UPDATE witness_chain SET action_data = '{\"tampered\":true}' WHERE id = (SELECT MAX(id) FROM witness_chain)").run();
    tamperDb.close();

    const tampered = await handleAuditChainVerify({ format: 'json' });
    record('tampered chain is detected as broken', tampered.integrity === false, `integrity=${tampered.integrity}`);
  } finally {
    if (prevRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = prevRoot;
    const { clearProjectRootCache } = await import('../src/kernel/project-root.js');
    clearProjectRootCache();
    rmSync(tmpRoot, { recursive: true, force: true });
  }

  return { checks, failures };
}

async function main(): Promise<void> {
  const { checks, failures } = await runGate();
  console.log(`Witness chain audit gate: ${checks.length - failures.length}/${checks.length} checks passed.`);
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

if (process.argv[1]?.endsWith('witness-chain-audit-gate.ts')) main();
