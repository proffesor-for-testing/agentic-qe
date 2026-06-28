#!/usr/bin/env tsx
/**
 * List OpenRouter models by price (cheapest first) to pick cheap candidates for
 * the oracle eval lane. Loads .env for OPENROUTER_API_KEY; never prints the key.
 *
 *   tsx scripts/openrouter-models.ts            # cheapest ~40 non-free models
 *   tsx scripts/openrouter-models.ts free       # only $0 / :free models
 *   tsx scripts/openrouter-models.ts code       # filter ids containing "code"
 */

import { readFileSync, existsSync } from 'fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const filter = process.argv[2]?.toLowerCase();

async function main(): Promise<void> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error('OPENROUTER_API_KEY not set (.env or env).');
    process.exit(1);
  }
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`OpenRouter /models failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const data = (await res.json()) as { data: Array<{ id: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }> };

  const wantFree = filter === 'free';
  const rows = data.data
    .map((m) => {
      const inP = Number(m.pricing?.prompt ?? '0') * 1e6; // $ per 1M prompt tokens
      const outP = Number(m.pricing?.completion ?? '0') * 1e6; // $ per 1M completion tokens
      return { id: m.id, inP, outP, blended: inP * 0.3 + outP * 0.7, ctx: m.context_length ?? 0 };
    })
    .filter((r) => (wantFree ? r.inP === 0 && r.outP === 0 : r.outP > 0))
    .filter((r) => (filter && !wantFree ? r.id.toLowerCase().includes(filter) : true))
    .sort((a, b) => (wantFree ? b.ctx - a.ctx : a.blended - b.blended));

  console.log(`OpenRouter ${wantFree ? 'FREE' : 'priced'} models — ${rows.length}${wantFree ? ' (by context)' : ' (cheapest first, blended 30/70)'}\n`);
  console.log('  $/1M in   $/1M out   ctx     model');
  for (const r of rows.slice(0, 40)) {
    console.log(
      `  ${r.inP.toFixed(3).padStart(8)}  ${r.outP.toFixed(3).padStart(8)}  ${String(r.ctx).padStart(7)}  ${r.id}`,
    );
  }
}

main().catch((e) => {
  console.error('error:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
