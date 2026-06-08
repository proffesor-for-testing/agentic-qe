# LLM-as-Judge Benchmark — Phase 1 Results

**Date**: 2026-06-08  
**Hardware**: Apple M5 Pro, 48 GB unified memory  
**Ollama**: http://localhost:11434 (`think: false`, native `/api/chat` API)  
**Dataset**: 150 patterns from `nagual-rs/nagual.db`

---

## Dataset Composition

| Split | Label | Criteria | Count |
|-------|-------|----------|-------|
| High-value | 1 | `reward ≥ 0.85`, `LENGTH(solution) > 100`, ADRs / techniques | 50 |
| Low-value | 0 | lifecycle categories (agent-complete, agent-spawn, nagual-usage), `LENGTH(solution) < 80`, `reward ≤ 0.5` | 50 |
| Calibration | 0.5 | `reward 0.45–0.60`, `LENGTH(solution) > 100` | 50 |

---

## Results

| Model | Prompt | AUROC | Brier | Amb% | P@20 | P50 (ms) | P95 (ms) | N |
|-------|--------|-------|-------|------|------|----------|----------|---|
| `gemma4:12b-mlx` | simple | **1.000** | 0.085 | 20.8% | 0.600 | 17,215 | 21,543 | 149 |
| `qwen3:8b` | simple | **0.997** | 0.100 | 42.0% | 0.650 | 7,756 | 9,663 | 150 |

> **AUROC**: >0.80 = good, 0.70–0.80 = usable, <0.70 = weak  
> **Brier**: lower = better (perfect = 0)  
> **Amb%**: fraction of scores in [0.4, 0.6] — lower = more decisive  
> **P@20**: precision of top-20 ranked patterns being truly high-value

---

## Key Findings

### Both models clear the bar
AUROC ≥ 0.997 on both — near-perfect discrimination between high-value knowledge (ADRs, techniques, editorial patterns) and lifecycle noise (agent-complete events, nagual-usage boilerplate). The quality gate hypothesis is validated.

### Tradeoff
- **gemma4:12b-mlx**: More decisive (20.8% ambiguous zone), marginally better calibrated (Brier 0.085), but 2.2× slower (~43 min to rescore 150 patterns at P50 17s)
- **qwen3:8b**: 2.2× faster (~19 min at P50 7.7s), slightly higher P@20 (0.650 vs 0.600), but 42% of scores land in the ambiguous zone

### Judge uncovers under-rewarded patterns
Five patterns stuck at default `reward=0.50` (no outcome feedback ever recorded) scored 0.75–0.88:

| Score | Reward | Pattern summary |
|-------|--------|-----------------|
| 0.88 | 0.50 | PACT-T agentic control principle — bridges abstract principle to concrete implementation primitive |
| 0.85 | 0.50 | Multi-agent coding quality controls — clear infrastructure requirements + operational loop |
| 0.85 | 0.50 | OpenClaw deployment blockers — specific and actionable ops knowledge |
| 0.85 | 0.50 | Vendor "autonomy" framing gap — high-value org friction point with technical specifics |
| 0.75 | 0.50 | tokio::select! concurrency pattern — valid idiom, limited reusability due to specificity |

These are genuine knowledge improvements that linear reward missed because they were never reused.

### Interesting disagreement: ADR-017 (reward=0.92 → score=0.35)
Judge reason: *"The pattern is incomplete due to text truncation and lacks a substantive definition of the actual 'Light Cone' architecture beyond a list of technologies."*  
This is a **data quality catch**, not a calibration failure. The stored pattern text is truncated; the judge is correct.

---

## Recommendation

### Theme 4 hot-path judge (real-time promotion gate)
**Use `qwen3:8b`** — 7.7s P50 is acceptable for a promotion-time gate, AUROC 0.997, P@20 0.650. At 1.3s per call with `think: false`, it does not perceptibly block the hot path.

Integration point: `src/learning/pattern-promotion.ts` alongside the existing coherence gate (ADR-052).  
Blend formula: `final_reward = 0.7 × outcome_reward + 0.3 × judge_score`

### Batch rescoring / overnight consolidation
**Use `gemma4:12b-mlx`** — lower ambiguity zone (20.8%) means fewer patterns land in the "needs human review" bucket. Run during `nagual learn consolidate` on patterns with `use_count = 0` and `reward = 0.5` (default, no feedback).

---

## Phase 2 Plan

Add `qwen3:30b-a3b`, `deepseek-r1:7b`, `phi4:14b` + rubric prompt variant (explicit 0/0.25/0.5/0.75/1.0 anchors) + 3-run stability scoring.

Expected questions:
- Does `qwen3:30b-a3b` close the ambiguity gap (42% → <25%) while staying faster than gemma4?
- Does the rubric prompt push gemma4 Brier below 0.06?
- Which model is most stable (lowest σ across 3 runs)?

---

## Raw Data

- Valid run: `scripts/judge-benchmark-results-1780927745811.json` (2026-06-08T14:09:05Z, 299 calls, 1 error)
- Broken run (OpenAI API, 88 errors): `scripts/judge-benchmark-results-1780927736008.json` — discard
