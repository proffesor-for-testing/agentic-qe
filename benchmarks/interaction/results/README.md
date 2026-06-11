# ADR-109 interaction benchmark — run records

`results-<stamp>.jsonl` — one comparison row per (scenario, pass): the judge's
winner verdict, the X/Y transcripts, rubric hash. `summary-<stamp>.json` — the
scenario-clustered sign test (judge) PLUS the independent ground-truth fix-rate
(did the developer's post-conversation fix pass the hidden test — computed
separately from any judge verdict).

## Latest run (2026-06-11) — cross-family, real
- agent-under-test: OpenAI gpt-4o-mini · judge: Gemini 2.5-flash (non-same-family)
- 2 scenarios × 2 arms (bare vs QE-guided) × 3 turns × 2 judge passes
- Ground truth: A(bare)=0.50, B(QE)=0.00 · Judge clustered: A=1 B=1 tie=0, p=1.0
- **No arm signal at n=2 — honestly underpowered, not a result.** Scaling the
  scenario corpus (n→20+) is the path to a statistical claim, per the ADR.
- Judge verdict parsed on 3/4 passes; the unparseable one is excluded by
  isGoodRow in code (never silently counted).
