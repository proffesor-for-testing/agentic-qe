# RCA Accuracy Comparison: AQE vs. Known Root Cause

**Date**: 2026-02-11
**Defect**: Finance Tool — Mismatch in financial status between ordering system handover tile and financial tile

---

## How Close Did AQE Get?

Working with only a defect title, description, and severity — no access to source code, business rules, or historical defect data — AQE correctly identified the defect as a **data-integrity** issue and pointed the investigation toward state consistency between two components. That is the right neighborhood.

The actual root cause was a specific business logic flaw: the Finance tool incorrectly reverted contract status to "Not Approved" when a Payment Splits amendment was received, rather than only on a new Proposal Version. AQE could not reach that level of specificity. Its Five-Whys chain stayed at the architectural level (transactional guarantees, multi-writer coordination) instead of drilling into the conditional logic that triggered the incorrect state change.

In short: **correct category, correct symptom framing, wrong depth**. AQE acts as a useful triage signal — it narrows the search space — but it cannot substitute for domain investigation.

## What Would Improve RCA Quality

| Information Source | What It Enables |
|--------------------|-----------------|
| **Source code access** | Trace the actual logic path that updates contract status, identify the conditional that fires on Payment Split amendments |
| **Business rule glossary** | Distinguish between amendment types (Payment Split vs. Proposal Version) and their expected effects on contract state |
| **Historical defects from the same module** | Learn recurring patterns — if Finance tool status-revert bugs have occurred before, weight that pattern higher |
| **Defect comments and investigation notes** | Real investigation trails (as demonstrated with the automotive demo's comment analysis) narrow root cause faster than description text alone |
| **System architecture map** | Understand which services write to contract status and through which events, enabling accurate data-flow analysis instead of generic multi-writer assumptions |
| **Test results and logs** | Correlate the defect with specific test failures or log entries that reveal the exact code path executed |

## How Easy Is It to Close Each Gap?

| Information Source | Effort | How to Provide It |
|--------------------|--------|-------------------|
| **Source code access** | Low | Point AQE at the repository or relevant service. AQE already has code analysis agents (code-intelligence, knowledge graph) that can index and trace logic paths. This is the single highest-impact improvement. |
| **Business rule glossary** | Low | Supply a structured document or wiki export listing domain terms, amendment types, and their expected state transitions. Can be as simple as a markdown table or JSON file fed into AQE's memory store. |
| **Historical defects from the same module** | Medium | Export past defects from JIRA/ALM as CSV or JSON. AQE's defect-intelligence domain already has a `learnPatterns` API designed for this — the data just needs to be connected. Requires a one-time JIRA adapter (currently missing, as noted in the JIRA readiness analysis). |
| **Defect comments and investigation notes** | Medium | Include comment threads when exporting defect data. The demo already demonstrates comment analysis (see the automotive cluster RCA). For live use, this requires the same JIRA adapter to pull comment history. |
| **System architecture map** | Medium | Provide a C4 model, service dependency diagram, or even a text description of which services write to contract status and through which events. AQE's code-intelligence domain supports C4 model ingestion. |
| **Test results and logs** | High | Requires integration with the CI/test execution environment to pull test run results and application logs correlated to the defect timeframe. Most valuable but most complex to connect. |

### Summary

Three of the six gaps (source code, business rules, architecture map) can be closed with **low-to-medium effort** by providing static artifacts that already exist in most organizations. The remaining three (historical defects, comments, logs) require **integration plumbing** — primarily the JIRA adapter and CI/log pipeline connectors that are architecturally designed in AQE but not yet implemented.
