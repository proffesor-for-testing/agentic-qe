#!/usr/bin/env node
// MCP policy gate (plan 05 / A1) — AQE's own "npm audit for agent tools".
//
// Self-contained mirror of MetaHarness `mcp-scan`'s HIGH-severity checks (ADR-022),
// so AQE governs its own ~90-tool MCP surface without a cross-repo dependency.
// Reads .harness/mcp-policy.json + .claude/settings.json + .mcp.json and exits 1
// on ANY high finding. MEDIUM/LOW are printed but non-blocking (the gate criterion
// is HIGH, matching the upstream scanner's exit semantics).
//
// Why it reads .mcp.json too: the upstream scanner only inspects
// .claude/settings.json `mcpServers`; AQE declares its server in .mcp.json, so a
// naive scan false-negatives ("No MCP surface"). This gate closes that gap.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? process.cwd());
const readJson = (p) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined; } catch { return undefined; } };

const policy = readJson(join(ROOT, '.harness', 'mcp-policy.json'));
const settings = readJson(join(ROOT, '.claude', 'settings.json'));
const dotMcp = readJson(join(ROOT, '.mcp.json'));

const serverCount =
  Object.keys(settings?.mcpServers ?? {}).length + Object.keys(dotMcp?.mcpServers ?? {}).length;
const mcpEnabled = !!policy || serverCount > 0;

const findings = [];
const add = (severity, id, title) => findings.push({ severity, id, title });

if (!mcpEnabled) {
  add('info', 'mcp-disabled', 'No MCP surface — nothing to scan.');
} else {
  // --- policy (HIGH gate) ---
  if (!policy) {
    add('high', 'no-policy', `MCP server registered (${serverCount}) but .harness/mcp-policy.json is missing — ungoverned.`);
  } else {
    if (policy.defaultDeny !== true) add('high', 'no-default-deny', 'Policy is not default-deny (defaultDeny must be true).');
    if (policy.allowShell === true) add('high', 'allow-shell', 'Shell access granted (allowShell=true) — gate behind approval or disable.');
    if (policy.allowNetwork === true) add('medium', 'allow-network', 'Network access granted (allowNetwork=true).');
    if (policy.allowFileWrite === true) add('medium', 'allow-file-write', 'File-write access granted (allowFileWrite=true).');
    if (policy.auditLog !== true) add('medium', 'no-audit-log', 'Audit log disabled (auditLog must be true).');
    if (!(Number(policy.toolTimeoutMs) > 0)) add('medium', 'no-timeout', 'No positive toolTimeoutMs.');
  }
  // --- host permissions (HIGH gate) ---
  const allow = settings?.permissions?.allow ?? [];
  const deny = settings?.permissions?.deny ?? [];
  for (const a of allow) {
    if (a === '*' || a === 'mcp__*' || a === 'mcp__*__*') add('high', 'wildcard-tool-perm', `Over-broad tool permission: ${a} — scope to mcp__<server>__*.`);
  }
  if (!deny.some((d) => /\.env/.test(d))) add('medium', 'no-secret-guard', 'permissions.deny should block Read(./.env*).');
}

const order = { high: 0, medium: 1, low: 2, info: 3 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);
const highs = findings.filter((f) => f.severity === 'high');

console.log(`MCP policy gate — ${ROOT}`);
console.log(`  mcpEnabled=${mcpEnabled} servers=${serverCount} findings=${findings.length} high=${highs.length}`);
for (const f of findings) console.log(`  [${f.severity.toUpperCase()}] ${f.id} — ${f.title}`);

if (highs.length > 0) {
  console.error(`\n✖ MCP policy gate FAILED: ${highs.length} HIGH finding(s).`);
  process.exit(1);
}
console.log('\n✓ MCP policy gate passed (0 HIGH).');
