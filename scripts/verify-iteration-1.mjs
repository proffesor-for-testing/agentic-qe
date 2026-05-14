#!/usr/bin/env node
/**
 * Verify iteration 1 fixes against the freshly-built MCP bundle via JSON-RPC.
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(__dirname, '..', 'dist', 'mcp', 'bundle.js');

function startServer() {
  const child = spawn('node', [BUNDLE], {
    env: {
      ...process.env,
      AQE_LEARNING_ENABLED: 'false',
      AQE_WORKERS_ENABLED: 'false',
      NODE_ENV: 'test',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return child;
}

function rpcCall(child, method, params, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        let parsed;
        try { parsed = JSON.parse(line); } catch { continue; }
        if (parsed.id === id) {
          child.stdout.off('data', onData);
          if (parsed.error) reject(new Error(JSON.stringify(parsed.error)));
          else resolve(parsed.result);
          return;
        }
      }
    };
    child.stdout.on('data', onData);
    child.stdin.write(msg);
    setTimeout(() => {
      child.stdout.off('data', onData);
      reject(new Error(`timeout: ${method}`));
    }, timeoutMs);
  });
}

async function waitForReady(child) {
  return new Promise((resolve) => {
    const onErr = (chunk) => {
      if (chunk.toString().includes('[MCP] Ready')) {
        child.stderr.off('data', onErr);
        resolve();
      }
    };
    child.stderr.on('data', onErr);
    setTimeout(resolve, 10000);
  });
}

function unwrap(rpcResult) {
  // MCP tools/call returns { content: [{type:'text', text: JSON_string}] } OR {data, ...}
  if (rpcResult?.content?.[0]?.text) {
    try { return JSON.parse(rpcResult.content[0].text); } catch { return rpcResult.content[0].text; }
  }
  return rpcResult;
}

async function main() {
  const child = startServer();
  await waitForReady(child);

  // Initialize MCP session
  await rpcCall(child, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'verify', version: '1.0.0' },
  });
  await new Promise(r => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n', r));

  // List tools to confirm we have the right names
  const list = await rpcCall(child, 'tools/list', {});
  const toolNames = new Set((list.tools || []).map(t => t.name));

  const results = [];

  async function call(label, name, args, validate) {
    if (!toolNames.has(name)) {
      results.push({ label, ok: false, detail: `tool not found: ${name}` });
      return;
    }
    try {
      const r = await rpcCall(child, 'tools/call', { name, arguments: args });
      const parsed = unwrap(r);
      const v = validate(parsed);
      results.push({ label, ok: v.ok, detail: v.detail });
    } catch (e) {
      results.push({ label, ok: false, detail: String(e.message).slice(0, 200) });
    }
  }

  await call('#467 quality-criteria', 'qe/requirements/quality-criteria',
    { assessmentName: 'verify', action: 'analyze', epicContent: 'a simple feature' },
    (p) => {
      const err = String(p?.error || '');
      return { ok: !err.includes('__dirname'), detail: p?.success === false ? `err='${err.slice(0, 150)}'` : 'no __dirname error' };
    });

  await call('#467 browser-load', 'qe/workflows/browser-load',
    { templateName: 'login-flow' },
    (p) => {
      const err = String(p?.error || '');
      return { ok: !err.includes('__dirname'), detail: p?.success === false ? `err='${err.slice(0, 150)}'` : 'OK' };
    });

  await call('#470 coherence_collapse', 'qe/coherence/collapse',
    { swarmState: { agents: [
        { id: 'o', status: 'running', taskCount: 5 },
        { id: 'v', status: 'degraded', taskCount: 12 },
      ]}, riskThreshold: 0.5 },
    (p) => {
      const data = p?.data || p;
      const lvl = data?.riskLevel;
      const at = data?.isAtRisk;
      const contradiction = (lvl === 'high' || lvl === 'critical') && at === false;
      return {
        ok: !contradiction && typeof data?.risk === 'number',
        detail: `riskLevel=${lvl}, isAtRisk=${at}, risk=${data?.risk}`,
      };
    });

  await call('#472 tests_schedule', 'qe/tests/schedule',
    { cwd: '/workspaces/agentic-qe', useGitAware: false, trackFlaky: false },
    (p) => {
      const err = String(p?.error || '');
      return {
        ok: !err.includes('not iterable'),
        detail: p?.success === false ? `err='${err.slice(0, 200)}'` : `phases=${p?.data?.phases?.length}, ran=${p?.data?.ranAllTests}`,
      };
    });

  // #474 — unsupported language must produce a clear error, not JS leakage
  await call('#474 unsupported lang', 'test_generate_enhanced',
    { sourceCode: 'function Get-Foo {}', filePath: 'x.ps1', language: 'powershell', testType: 'unit' },
    (p) => {
      const err = String(p?.error || '');
      const ok = p?.success === false && /Unsupported language|powershell/i.test(err);
      return { ok, detail: `success=${p?.success}, err='${err.slice(0, 200)}'` };
    });

  // #474 — python language should produce pytest (not vitest JS)
  await call('#474 python+pytest', 'test_generate_enhanced',
    { sourceCode: 'def add(a, b):\n    return a + b\n', filePath: 'add.py', language: 'python', testType: 'unit' },
    (p) => {
      const code = p?.data?.tests?.[0]?.testCode || '';
      const looksPython = /import pytest|def test_|class Test/.test(code);
      const looksJs = /from ['"]vitest['"]|describe\(/.test(code);
      return {
        ok: p?.success && looksPython && !looksJs,
        detail: `success=${p?.success}, looksPython=${looksPython}, looksJs=${looksJs}, first50='${code.slice(0, 50)}'`,
      };
    });

  // #474 — language+framework mismatch should be rejected
  await call('#474 lang/framework mismatch', 'test_generate_enhanced',
    { sourceCode: 'def f(): pass', filePath: 'f.py', language: 'python', framework: 'vitest', testType: 'unit' },
    (p) => {
      const err = String(p?.error || '');
      const ok = p?.success === false && /Framework.*vitest.*python|targets/i.test(err);
      return { ok, detail: `success=${p?.success}, err='${err.slice(0, 200)}'` };
    });

  // #469 — embeddings: store + search should return the stored doc
  const ns = `verify-${Date.now()}`;
  await call('#469 embedding store', 'qe/embeddings/store',
    { text: 'apple pie recipe with cinnamon', namespace: ns }, (p) => ({
      ok: p?.success !== false && (p?.data?.id || p?.id),
      detail: `id=${p?.data?.id || p?.id}`,
    }));
  await call('#469 embedding search', 'qe/embeddings/search',
    { query: 'apple cinnamon dessert', namespace: ns, topK: 3, threshold: 0 }, (p) => {
      const results = p?.data?.results || [];
      const top = results[0];
      return {
        ok: results.length > 0 && top?.text?.includes('apple'),
        detail: `found=${results.length}, topScore=${top?.score}, topText='${(top?.text || '').slice(0, 50)}'`,
      };
    });
  await call('#469 embedding compare semantic', 'qe/embeddings/compare',
    { text1: 'apple pie', text2: 'apple fruit pie recipe' }, (p) => {
      const sim = p?.data?.similarity;
      // Real MiniLM-L6-v2 on semantically-related text should be > 0.4
      return {
        ok: typeof sim === 'number' && sim > 0.4,
        detail: `similarity=${sim}`,
      };
    });

  // #473 — replicate user's exact reproduction: 5x memory_query then stats
  const cnsArgs = { pattern: 'cache-warm-test*', namespace: 'patterns' };
  for (let i = 0; i < 5; i++) {
    await call(`#473 memory_query x${i + 1}`, 'memory_query', cnsArgs,
      (p) => ({ ok: p?.success !== false, detail: `entries=${p?.data?.entries?.length ?? 0}` }));
  }
  await call('#473 session_cache_stats', 'session_cache_stats', {}, (p) => {
    const stats = p?.data;
    const hits = stats?.hits ?? 0;
    const size = stats?.size ?? 0;
    const hitRate = stats?.hitRate ?? 0;
    // User claim: 0% hit rate. After fix: at least some hits after redundant calls.
    return {
      ok: hits >= 1 && size >= 1 && hitRate > 0,
      detail: `size=${size}, hits=${hits}, misses=${stats?.misses}, hitRate=${(hitRate * 100).toFixed(0)}%`,
    };
  });

  child.kill();

  console.log('\n=== Verification Results ===');
  let allOk = true;
  for (const r of results) {
    console.log(`${r.ok ? '✅ PASS' : '❌ FAIL'} ${r.label} — ${r.detail}`);
    if (!r.ok) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
