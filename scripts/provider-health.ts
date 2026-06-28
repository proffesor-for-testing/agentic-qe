#!/usr/bin/env tsx
/**
 * LLM provider health check (ADR-043 multi-provider). For each of AQE's 7 provider
 * routers: report whether credentials are present and, if so, do a minimal live
 * `generate` and report ok/latency. Loads .env; never prints key values.
 *
 *   tsx scripts/provider-health.ts
 */

import { readFileSync, existsSync } from 'fs';
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { ClaudeProvider } from '../src/shared/llm/providers/claude.js';
import { OpenAIProvider } from '../src/shared/llm/providers/openai.js';
import { OllamaProvider } from '../src/shared/llm/providers/ollama.js';
import { OpenRouterProvider } from '../src/shared/llm/providers/openrouter.js';
import { GeminiProvider } from '../src/shared/llm/providers/gemini.js';
import type { LLMProvider } from '../src/shared/llm/interfaces.js';

const has = (...keys: string[]) => keys.some((k) => !!process.env[k]);
const PROMPT = 'Reply with exactly: OK';

interface Check { name: string; type: string; cred: boolean; result: string }

async function tryGen(p: LLMProvider): Promise<string> {
  const t = Date.now();
  try {
    const res = await p.generate(PROMPT, { maxTokens: 16, temperature: 0, skipCache: true, timeoutMs: 20000 } as never);
    const dt = ((Date.now() - t) / 1000).toFixed(1);
    const content = (res.content ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return `✓ WORKS (${dt}s, type=${res.provider}, "${content}")`;
  } catch (e) {
    return `✗ ERROR: ${(e instanceof Error ? e.message : String(e)).slice(0, 70)}`;
  }
}

async function main(): Promise<void> {
  const cfg = { maxRetries: 1, timeoutMs: 20000 } as never;
  const checks: Check[] = [];

  // Claude
  {
    const cred = has('ANTHROPIC_API_KEY');
    const p = new ClaudeProvider({ model: 'claude-haiku-4-5-20251001', ...cfg } as never);
    checks.push({ name: 'claude', type: 'claude', cred, result: cred ? await tryGen(p) : 'no ANTHROPIC_API_KEY — skipped' });
  }
  // OpenAI
  {
    const cred = has('OPENAI_API_KEY');
    const p = new OpenAIProvider({ model: 'gpt-4o-mini', ...cfg } as never);
    checks.push({ name: 'openai', type: 'openai', cred, result: cred ? await tryGen(p) : 'no OPENAI_API_KEY — skipped' });
  }
  // OpenRouter
  {
    const cred = has('OPENROUTER_API_KEY');
    const p = new OpenRouterProvider({ model: 'mistralai/mistral-small-3.2-24b-instruct', ...cfg } as never);
    checks.push({ name: 'openrouter', type: 'openrouter', cred, result: cred ? await tryGen(p) : 'no OPENROUTER_API_KEY — skipped' });
  }
  // Gemini
  {
    const cred = has('GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY');
    const p = new GeminiProvider({ ...cfg } as never); // uses provider default model
    checks.push({ name: 'gemini', type: 'gemini', cred, result: cred ? await tryGen(p) : 'no GEMINI/GOOGLE_AI_API_KEY — skipped' });
  }
  // Ollama (local, no key)
  {
    const base = process.env.OLLAMA_BASE_URL ?? 'http://host.docker.internal:11434';
    const p = new OllamaProvider({ model: 'qwen3:8b', baseUrl: base, ...cfg } as never);
    checks.push({ name: 'ollama', type: 'ollama', cred: true, result: await tryGen(p) });
  }
  // Azure / Bedrock — config-heavy; report credential presence only
  checks.push({ name: 'azure-openai', type: 'azure-openai', cred: has('AZURE_OPENAI_API_KEY'), result: has('AZURE_OPENAI_API_KEY') ? 'creds present (needs deployment config to test)' : 'no AZURE_OPENAI_* — skipped' });
  checks.push({ name: 'bedrock', type: 'bedrock', cred: has('AWS_ACCESS_KEY_ID'), result: has('AWS_ACCESS_KEY_ID') ? 'creds present (needs region/model config to test)' : 'no AWS_* — skipped' });

  console.log('\nAQE LLM provider health\n');
  console.log('provider        cred   result');
  for (const c of checks) {
    console.log(`${c.name.padEnd(14)} ${(c.cred ? 'yes' : 'no').padEnd(5)}  ${c.result}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error('health error:', e instanceof Error ? e.message : String(e)); process.exit(1); });
