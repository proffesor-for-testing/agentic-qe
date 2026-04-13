#!/usr/bin/env python3
"""
ADR-092 H2 Fix: Statistical significance test on Phase 0a trial data.

Runs a Wilcoxon signed-rank test (paired, non-parametric) on the per-file
test_fn_count and assertion_count data from baseline vs. Opus advisor.

Output: p-values and whether the quality improvement is statistically significant
at alpha=0.05.
"""

import json
import sys
from pathlib import Path

try:
    from scipy.stats import wilcoxon
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

REPORT_PATH = Path(__file__).parent / "adr-092-phase0a-report.json"

def main():
    if not REPORT_PATH.exists():
        print(f"ERROR: Report not found at {REPORT_PATH}")
        sys.exit(1)

    with open(REPORT_PATH) as f:
        data = json.load(f)

    results = data.get("results", [])
    valid = [r for r in results if r.get("baseline") and r.get("advisor")]

    if len(valid) < 5:
        print(f"ERROR: Need at least 5 paired results, got {len(valid)}")
        sys.exit(1)

    baseline_tests = [r["baseline"]["test_fn_count"] for r in valid]
    advisor_tests = [r["advisor"]["test_fn_count"] for r in valid]
    baseline_asserts = [r["baseline"]["assertion_count"] for r in valid]
    advisor_asserts = [r["advisor"]["assertion_count"] for r in valid]
    baseline_mocks = [r["baseline"]["mock_count"] for r in valid]
    advisor_mocks = [r["advisor"]["mock_count"] for r in valid]

    print("ADR-092 Phase 0a — Statistical Significance Test")
    print("=" * 60)
    print(f"Paired samples: {len(valid)} files")
    print()

    # Per-file deltas
    print("Per-file deltas (advisor - baseline):")
    print(f"  {'File':<42} Tests  Asserts  Mocks")
    print(f"  {'-'*42} -----  -------  -----")
    for r in valid:
        dt = r["advisor"]["test_fn_count"] - r["baseline"]["test_fn_count"]
        da = r["advisor"]["assertion_count"] - r["baseline"]["assertion_count"]
        dm = r["advisor"]["mock_count"] - r["baseline"]["mock_count"]
        print(f"  {r['file']:<42} {dt:+5d}  {da:+7d}  {dm:+5d}")

    print()
    avg_dt = sum(advisor_tests[i] - baseline_tests[i] for i in range(len(valid))) / len(valid)
    avg_da = sum(advisor_asserts[i] - baseline_asserts[i] for i in range(len(valid))) / len(valid)
    avg_dm = sum(advisor_mocks[i] - baseline_mocks[i] for i in range(len(valid))) / len(valid)
    print(f"  Mean delta: tests={avg_dt:+.1f}  asserts={avg_da:+.1f}  mocks={avg_dm:+.1f}")
    print()

    if not HAS_SCIPY:
        print("WARNING: scipy not installed. Cannot run Wilcoxon test.")
        print("Install with: pip install scipy")
        print()
        # Manual sign test as fallback
        positive_tests = sum(1 for i in range(len(valid)) if advisor_tests[i] > baseline_tests[i])
        negative_tests = sum(1 for i in range(len(valid)) if advisor_tests[i] < baseline_tests[i])
        ties_tests = sum(1 for i in range(len(valid)) if advisor_tests[i] == baseline_tests[i])
        print(f"Sign test (tests): {positive_tests} positive, {negative_tests} negative, {ties_tests} ties")

        positive_asserts = sum(1 for i in range(len(valid)) if advisor_asserts[i] > baseline_asserts[i])
        negative_asserts = sum(1 for i in range(len(valid)) if advisor_asserts[i] < baseline_asserts[i])
        ties_asserts = sum(1 for i in range(len(valid)) if advisor_asserts[i] == baseline_asserts[i])
        print(f"Sign test (asserts): {positive_asserts} positive, {negative_asserts} negative, {ties_asserts} ties")

        positive_mocks = sum(1 for i in range(len(valid)) if advisor_mocks[i] > baseline_mocks[i])
        negative_mocks = sum(1 for i in range(len(valid)) if advisor_mocks[i] < baseline_mocks[i])
        ties_mocks = sum(1 for i in range(len(valid)) if advisor_mocks[i] == baseline_mocks[i])
        print(f"Sign test (mocks): {positive_mocks} positive, {negative_mocks} negative, {ties_mocks} ties")
        print()
        print("VERDICT: Without scipy, use the sign test as a directional indicator.")
        print("The improvement is NOT statistically validated without a proper test.")
        return

    alpha = 0.05
    print(f"Wilcoxon signed-rank test (alpha={alpha}):")
    print()

    for metric, bl, adv in [
        ("test_fn_count", baseline_tests, advisor_tests),
        ("assertion_count", baseline_asserts, advisor_asserts),
        ("mock_count", baseline_mocks, advisor_mocks),
    ]:
        diffs = [adv[i] - bl[i] for i in range(len(valid))]
        nonzero = [d for d in diffs if d != 0]

        if len(nonzero) < 5:
            print(f"  {metric}: too few non-zero differences ({len(nonzero)}) for Wilcoxon test")
            continue

        try:
            stat, p = wilcoxon(bl, adv, alternative='less')
            sig = "SIGNIFICANT" if p < alpha else "NOT SIGNIFICANT"
            print(f"  {metric}: W={stat:.1f}, p={p:.4f} — {sig} at alpha={alpha}")
        except Exception as e:
            print(f"  {metric}: Wilcoxon test failed — {e}")

    print()
    print("INTERPRETATION:")
    print("  If p < 0.05: advisor improves this metric with 95% confidence")
    print("  If p >= 0.05: improvement may be noise — cannot reject null hypothesis")
    print()
    print("NOTE: N=10 is small. These results are directional, not definitive.")
    print("A production evaluation with N>=30 tasks would give stronger evidence.")

if __name__ == "__main__":
    main()
