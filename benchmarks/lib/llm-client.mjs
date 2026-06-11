/**
 * Minimal multi-provider LLM client for benchmark/eval runners (ADR-106/109).
 * Raw fetch, zero deps — deliberately independent of src/ so eval harnesses
 * run without the project build. Reads keys from process.env (load .env first).
 *
 * Providers: anthropic (native ADR-026 tiers), openai, gemini.
 */

const ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: (model, key) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
};

/** Retry transient failures (network blips, 429/5xx) with backoff. */
export async function chat(opts) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await chatOnce(opts);
    } catch (e) {
      lastErr = e;
      const msg = e.message || '';
      const transient = /fetch failed|ECONN|ETIMEDOUT|network| 429| 5\d\d/.test(msg);
      if (!transient || attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** Single attempt. Returns { text, usage } or throws. */
async function chatOnce({ provider, model, system, messages, maxTokens = 512, temperature = 0 }) {
  if (provider === 'anthropic') {
    const r = await fetch(ENDPOINTS.anthropic, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, ...(system ? { system } : {}), messages }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${JSON.stringify(j.error || j).slice(0, 160)}`);
    return { text: j.content?.map(b => b.text ?? '').join('') ?? '', usage: j.usage };
  }
  if (provider === 'openai') {
    const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
    const r = await fetch(ENDPOINTS.openai, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: msgs, max_tokens: maxTokens, temperature }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`openai ${r.status}: ${JSON.stringify(j.error || j).slice(0, 160)}`);
    return { text: j.choices?.[0]?.message?.content ?? '', usage: j.usage };
  }
  if (provider === 'gemini') {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const body = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature },
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    };
    const r = await fetch(ENDPOINTS.gemini(model, process.env.GEMINI_API_KEY), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`gemini ${r.status}: ${JSON.stringify(j.error || j).slice(0, 160)}`);
    return { text: j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '', usage: j.usageMetadata };
  }
  throw new Error(`unknown provider: ${provider}`);
}

/** Cheap dollar estimate per provider/model (rough, for budget guarding). */
export function estimateCostUsd(provider, model, usage) {
  if (!usage) return 0;
  const inTok = usage.prompt_tokens ?? usage.promptTokenCount ?? 0;
  const outTok = usage.completion_tokens ?? usage.candidatesTokenCount ?? 0;
  // Rough public rates ($/1M tokens), conservative high side.
  const rates = {
    'gpt-4o-mini': [0.15, 0.6],
    'gpt-4o': [2.5, 10],
    'gemini-2.5-flash': [0.075, 0.3],
    'claude-haiku-4-5-20251001': [1, 5],
    'claude-sonnet-4-6': [3, 15],
    'claude-opus-4-1-20250805': [15, 75],
  };
  const [ri, ro] = rates[model] ?? [3, 15];
  // Anthropic uses input_tokens/output_tokens; OpenAI/Gemini handled above.
  const inFinal = usage.input_tokens ?? inTok;
  const outFinal = usage.output_tokens ?? outTok;
  return (inFinal * ri + outFinal * ro) / 1e6;
}
