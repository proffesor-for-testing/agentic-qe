// cognitum.mjs — a thin, transparent client for api.cognitum.one's inference API.
// Deliberately a DIRECT fetch (not AQE's CognitumProvider) so the benchmark
// measures the raw API surface, not a wrapper's behavior — the same choice
// ruflo's own benchmark-models.mjs makes. It reads the ground-truth cost off the
// `x_cognitum.price_usd` receipt (the provider never estimates; the receipt is
// the truth — confirmed in src/shared/llm/providers/cognitum.ts).
//
// mock mode returns SYNTHETIC tokens/price/latency per tier for pipeline
// validation only — clearly not real model output (mirrors AQE's MockLLMExecutor
// honesty label). Real quality numbers require a live run.

const DEFAULT_BASE = process.env.COGNITUM_BASE_URL || 'https://api.cognitum.one';

// Synthetic per-tier unit costs for --mock, so the cost axis is exercised in a
// dry-run. Order-of-magnitude only; NOT real Cognitum prices. Real runs read
// price_usd off the receipt and ignore these entirely.
const MOCK_TIER = {
  low:  { inPerM: 0.10, outPerM: 0.30, latMs: 700 },
  mid:  { inPerM: 0.60, outPerM: 1.80, latMs: 1400 },
  high: { inPerM: 3.00, outPerM: 15.0, latMs: 3200 },
};

export function makeClient({ baseUrl = DEFAULT_BASE, mock = false } = {}) {
  return { complete, baseUrl, mock };

  async function complete({ key, tier, messages, maxTokens = 1024, temperature = 0 }) {
    if (mock) return mockComplete({ tier, messages, maxTokens });

    if (!key) throw new Error(`cognitum.complete: no API key for tier ${tier} (set the worker/judge key)`);
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify({ model: `cognitum-${tier}`, messages, max_tokens: maxTokens, temperature }),
      });
    } catch (e) {
      return { ok: false, error: `network: ${e.message}`, tier, latencyMs: performance.now() - t0 };
    }
    const latencyMs = performance.now() - t0;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // 402 = server-side budget cap reached (the subscription hard cap did its job).
      return { ok: false, status: res.status, error: `http ${res.status}: ${body.slice(0, 200)}`, tier, latencyMs };
    }
    const j = await res.json();
    const text = j.choices?.[0]?.message?.content ?? '';
    const usage = j.usage ?? {};
    const rc = j.x_cognitum ?? {};
    return {
      ok: true,
      text,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      // Ground-truth cost from the receipt; null if the API omitted it (we then
      // fall back to null rather than a fabricated number — honest gap).
      priceUsd: typeof rc.price_usd === 'number' ? rc.price_usd : null,
      costSource: typeof rc.price_usd === 'number' ? 'provider-receipt' : 'missing',
      resolvedModel: rc.resolved_model ?? j.model ?? `cognitum-${tier}`,
      resolvedTier: rc.resolved_tier ?? tier,
      // The id that keys usage_ledger/{requestId} — lets a row reconcile 1:1
      // against the server billing record.
      requestId: rc.request_id ?? j.id ?? null,
      escalated: !!rc.escalated,
      capDegraded: !!rc.cap_degraded,
      latencyMs,
    };
  }

  function mockComplete({ tier, messages, maxTokens }) {
    const m = MOCK_TIER[tier] || MOCK_TIER.low;
    // Deterministic synthetic token counts from prompt length (no RNG — scripts
    // must be reproducible; ruflo's benches seed everything for the same reason).
    const promptChars = messages.map((x) => x.content || '').join(' ').length;
    const promptTokens = Math.ceil(promptChars / 4);
    const completionTokens = Math.min(maxTokens, 120 + (promptChars % 200));
    const priceUsd = (promptTokens * m.inPerM + completionTokens * m.outPerM) / 1_000_000;
    return {
      ok: true,
      text: `[mock:${tier}] SYNTHETIC — not real model output`,
      promptTokens, completionTokens,
      priceUsd, costSource: 'mock-synthetic',
      resolvedModel: `mock-${tier}`, resolvedTier: tier,
      requestId: `mock-${tier}-${promptTokens}`,
      escalated: false, capDegraded: false,
      latencyMs: m.latMs,
    };
  }
}

// A deterministic synthetic quality signal for --mock, so a dry-run produces a
// plausible-SHAPED Pareto (quality rising with tier) to validate the readout —
// explicitly NOT a real measurement. Real quality comes from the task oracles.
export function mockQuality(sampleId, tier) {
  const base = { low: 0.55, mid: 0.78, high: 0.94 }[tier] ?? 0.5;
  // stable per-sample jitter in [-0.12, +0.12] from a hash, no RNG
  let h = 0;
  const s = `${sampleId}:${tier}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  const jitter = (h / 0xffff - 0.5) * 0.24;
  return Math.max(0, Math.min(1, base + jitter)) >= 0.5 ? 1 : 0; // pass/fail
}
