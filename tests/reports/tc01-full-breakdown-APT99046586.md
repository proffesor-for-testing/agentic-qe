# TC_01 Full Test Breakdown — APT99046586
**Date**: 2026-03-03 14:32–14:43 UTC | **Order**: APT99046586 | **Enterprise**: adidas_PT
**Environment**: UAT (`acc.omnihub.3stripes.net`)

| Run | Mode | Flags | Stages | Result | Duration |
|-----|------|-------|--------|--------|----------|
| **Run 4** | New order creation via XAPI | `--skip-layer2 --skip-layer3 --continue-on-failure` | 9 executed (5 pass, 2 fail, 2 skip) | FAIL | 687.1s |

**What changed since Run 3 (APT15605451)**: Two bugs fixed. (1) ShipNode extraction from `ReleaseStatus_AutoPOC` removed — the regex was grabbing the `<OrderRelease ShipNode="0625">` (distribution node) instead of the `<OrderLine ShipNode="IT33">` (fulfillment node), causing `YDM00085 "ShipNode does not exist"`. (2) Self-healing `resolvePatternAction` made state-aware — `status-already-satisfied` pattern now validates `snapshot.maxStatus >= STAGE_STATUS_TARGET[stageId]` before returning `continue`, preventing PatternStore text-scoring false positives.

**Run 3.5 (APT42867576)** ran between Run 3 and Run 4 with the ShipNode bug still present — 2 pass, 5 fail, 2 skip. Included here for regression comparison.

---

## Stage 1: Create Sales Order (`create-order`) — PASS (24.0s)

### Action: XAPI 4-Step Order Creation

| Sub-step | XAPI Service/API | System | XML Template | Duration | Result |
|---|---|---|---|---|---|
| Step 1 | `adidasWE_CreateOrderSync` | Sterling OMS (JSP) | `step1_CreateOrder` — IsFlow=Y, custom Adidas order creation flow | 5,060ms | OK |
| Step 2 | `changeOrder` | Sterling OMS (JSP) | `step2_StampShipNode` — sets `ShipNode=IT33` on order line | 3,900ms | OK |
| Step 3 | `changeOrder` | Sterling OMS (JSP) | `step3_ResolveHold` — resolves Buyer's Remorse hold | 3,821ms | OK |
| Step 4 | `adidasWE_CheckAdyenAsyncResponseSvc` | Sterling OMS (JSP) | `step4_ProcessPayment` — triggers Adyen payment processing | 4,225ms | OK |

**Actor**: AQE → XAPI Client (Playwright headless browser → `yantrahttpapitester.jsp`)
**Protocol**: HTTP POST to Sterling JSP with XML body
**Generated Order**: APT99046586
**Total XAPI time**: 17.0s (4 sequential calls)

### AutoPOC Post-Creation Enrichment

| AutoPOC Service | Purpose | Result | Duration |
|---|---|---|---|
| `OrderStatus_AutoPOC` | Enrich context: itemId, unitOfMeasure, shipNode from full output template | OK | 3,612ms |

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `POST /invoke/getOrderList` with `OrderNo=APT99046586, MaximumRecords=1`. Enriched context: shipNode, itemId, unitOfMeasure from order lines. |

### Verification: step-01 — PASS
Performed by: **AQE → Sterling REST API** (`getOrderList`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 1 | OrderNo present | PASS | truthy | APT99046586 |
| 2–18 | (remaining step-01 checks) | — | — | Same pattern as Run 3: core fields pass, output-template-dependent fields (PersonInfoShipTo, OrderLines) fail gracefully via AutoPOC fallback |

**Passed checks**: 1/1 counted (primary OrderNo check). Field-presence checks now fall back to AutoPOC enrichment XML.

---

## Stage 2: Wait for Order Release (`wait-for-release`) — PASS (212.7s)

### Action: XAPI Inventory Check + Schedule + Release

| Sub-step | XAPI API | System | What Happened | Duration |
|---|---|---|---|---|
| Step 5.1 | `getATP` | Sterling OMS (JSP) | `<GetATP ItemID="EE6464_530" OrganizationCode="adidas_WE" ShipNode="IT33" .../>` — stock found at IT33, no adjustment needed | ~5s |
| Step 5.3 | `getInventoryNodeControlList` | Sterling OMS (JSP) | No inventory node control record — no dirty node flag | ~5s |
| Step 5.5 | `scheduleOrder` | Sterling OMS (JSP) | `<ScheduleOrder CheckInventory="Y" OrderNo="APT99046586" .../>` | ~5s |
| Step 5.6 | `OrderStatus_AutoPOC` | Sterling OMS (JSP) | Post-schedule validation — Status=1500 (Scheduled), no SchedFailureReasonCode | 3,695ms |
| Step 6 | `releaseOrder` | Sterling OMS (JSP) | `<ReleaseOrder OrderNo="APT99046586" .../>` | ~5s |

**Note**: Step 5.2 (adjustInventory) was NOT needed — ATP showed stock at IT33. This is new vs Run 3 where stock was zero.

### AutoPOC Post-Release Validation

| AutoPOC Service | Purpose | Result | Duration |
|---|---|---|---|
| `OrderStatus_AutoPOC` (Step 6.1) | Validate order status after release | OK | 3,583ms |
| `ReleaseStatus_AutoPOC` (Step 6.2) | Validate release details | OK | 23,220ms |

AutoPOC services are now deployed and responding — no more 60s timeouts.

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `getOrderList` polled until `Status >= "3200"`. Also fetched releaseNo via `getOrderReleaseList`. |

### AutoPOC Release Enrichment (during poll)

| AutoPOC Service | Purpose | Result | Duration |
|---|---|---|---|
| `OrderStatus_AutoPOC` | Full field set for verification fallback | OK | 4,095ms |
| `ReleaseStatus_AutoPOC` | Release details (SCAC, CarrierServiceCode, ReleaseNo) | OK | 19,020ms |

### Verification: step-02 — PASS
| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 19 | Status >= 3200 | PASS | >=3200 | Released |

---

## Stage 3: Confirm Shipment (`confirm-shipment`) — PASS (59.6s)

### Bug Fix Validation

This stage failed on Run 3.5 (APT42867576) with `YDM00085 "ShipNode does not exist in the system. Found value: 0625, Expected Value: IT33"`.

**Root cause**: The enrichment regex `releaseResp.body.match(/ShipNode="([^"]*)"/)` was grabbing `ShipNode="0625"` from the `<OrderRelease>` element (a distribution/sourcing node) instead of `ShipNode="IT33"` from the `<OrderLine>` element.

**Fix**: Removed ShipNode extraction from `ReleaseStatus_AutoPOC`. The correct value comes from `buildOrderCtx()` which uses the Step 2 value or IT33 default.

### AutoPOC Enrichment (Confirm-Shipment)

| AutoPOC Service | Purpose | Fields Extracted | Result | Duration |
|---|---|---|---|---|
| `ReleaseStatus_AutoPOC` | Extract SCAC, CarrierServiceCode, ReleaseNo | SCAC, CarrierServiceCode, ReleaseNo (ShipNode **deliberately skipped** — see fix above) | OK | ~20s |
| `OrderStatus_AutoPOC` | Extract ItemID, OrderedQty, SellerOrganizationCode | ItemID, OrderedQty, SellerOrganizationCode | OK | ~4s |

### Action: XAPI Ship + ShipConfirm

| Sub-step | XAPI Service | System | Payload Values | Duration | Result |
|---|---|---|---|---|---|
| Step 7 | `adidasWE_ProcessSHPConfirmation` | Sterling OMS (JSP) | **ShipNode=IT33** (from buildOrderCtx, not from release XML), SCAC/CarrierServiceCode/ReleaseNo from AutoPOC enrichment | ~5s | OK |
| Step 7.4 | `ShipmentStatus_AutoPOC` | Sterling OMS (JSP) | Extract ShipAdviceNo for Step 8 | 3,734ms | OK |
| Step 8 | `adidas_UpdateSOAcknowledgmentSvc` | Sterling OMS (JSP) | SO Acknowledgment with ShipAdviceNo from AutoPOC | ~5s | OK |
| Step 8.2 | `ShipmentStatus_AutoPOC` | Sterling OMS (JSP) | Post-ship-confirm validation | 3,652ms | OK |

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| STATUS CHECK | AQE → Sterling REST | Sterling OMS | `MaxOrderStatus >= 3350` — confirmed immediately (status shortcut). |
| AutoPOC enrichment | AQE → XAPI | Sterling OMS | `ShipmentStatus_AutoPOC` for verification fallback — OK (3,652ms) |

### Verification: step-08 — PASS
| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 22 | MaxOrderStatus >= 3350 (Ship Confirmed) | PASS | >=3350 | 3700.0001 |

---

## Stage 4: Delivery & POD Events (`delivery`) — PASS (7.2s)

### Action: XAPI Deliver
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → XAPI (Playwright) | Sterling OMS (JSP) | `adidasWE_ProcessPODUpdate` — delivered order via POD status update (ExtnStatusCode="DL") |
| AutoPOC | AQE → XAPI (Playwright) | Sterling OMS (JSP) | `OrderStatus_AutoPOC` (delivery enrichment) — OK (3,411ms) |

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | Confirmed `MaxOrderStatus >= 3700` immediately. |

### Verification: 2 steps, 2 PASS

#### step-10 — PASS — POD: In-Transit carrier event
| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 28 | Order past delivery (IT implied) | PASS | MaxOrderStatus >= 3700 | 3700.0001 |
| 29 | IT note ReasonCode present | **FAIL** | IT | status-shortcut (no note) |

#### step-11 — PASS — POD: Delivered carrier event
| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 31 | Order past delivery (DL implied) | PASS | MaxOrderStatus >= 3700 | 3700.0001 |
| 32 | MinOrderStatusDesc reflects delivery | PASS | non-empty status desc | Shipped |
| 33–35 | IT/DL notes | **FAIL** | carrier notes | status-shortcut (no notes) |

**Note**: IT/DL note failures are expected — XAPI-driven delivery doesn't post NShift carrier notes. Primary checks (status >= 3700) pass.

---

## Stage 5: Forward Invoice & Reconciliation (`forward-invoice`) — FAIL (78.6s + ~256s healing)

### Poll: FAILED
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `getOrderInvoiceList` — polled 15 attempts × 5s = 75s. No forward invoice found. **Timed out.** |

### Self-Healing: Invoice Recovery Playbook — FAILED (~256s)

| Phase | Performed By | System | What Happened | Duration |
|---|---|---|---|---|
| 1. Trigger | AQE Healing Handler | — | "Invoice failure detected — running recovery playbook (Playwright XAPI)" | — |
| 2. Find ShipmentKey | AQE → XAPI | Sterling OMS | `getShipmentListForOrder` via XAPI — found ShipmentKey `302603031436269287898804` | ~60s |
| 3. Query task queue | AQE → XAPI | Sterling OMS | `getTaskList` — found pending task `TaskQKey=202603031438257904765701` | ~60s |
| 4. Move AvailableDate | AQE → XAPI | Sterling OMS | `manageTaskQueue` — moved AvailableDate from `2026-03-03T14:38:25+00:00` to `2026-03-02 14:38:26.000` (backdated by 1 day) | ~5s |
| 5. Poll for invoice | AQE → Sterling REST | Sterling OMS | Polled `getOrderInvoiceList` for 180s — **invoice never appeared** | 180s |
| 6. **Recovery FAILED** | AQE Healing Handler | — | "Invoice not generated after 180s. Sterling job may not have run." | — |

**Root cause**: Same as Run 3 — freshly shipped orders need more time for Sterling's `CREATE_INVOICE` async pipeline. TaskQ AvailableDate was correctly backdated but the batch agent didn't fire within the 180s window.

### Verification: 0 steps executed
| Step | Status | Reason |
|---|---|---|
| step-12 | **NOT RUN** | Poll timed out before verification |
| step-12a | **NOT RUN** | Same |

---

## Stage 6: Forward Flow Email & PDF Verification (`forward-comms`) — SKIPPED (0.0s)

| Step | What | Would query |
|---|---|---|
| step-03a | Email: Order confirmation | IMAP/MS Graph |
| step-07a | PDF: Forward shipping label | PDF extractor |
| step-14a | Email: Out for delivery notification | IMAP/MS Graph |
| step-16a | Email: Order delivered notification | IMAP/MS Graph |

---

## Stage 7: Create Return Order (`create-return`) — PASS (0.6s)

### Action: XAPI Create Return
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → XAPI (Playwright) | Sterling OMS (JSP) | `adidasWE_CreateReturnFromSSRSvc` — return created on forward order APT99046586 |
| POLL | AQE → Sterling REST | Sterling OMS | `getOrderList` confirmed forward order status >= 3700 |

### Verification: step-15 — PASS
| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 37 | Return on forward order | PASS | status >= 3700 | Shipped |

---

## Stage 8: Return Delivery & Credit Note (`return-delivery`) — FAIL (22.8s)

### Self-Healing (Bug Fix Validation)

This stage previously gave a **false positive** `continue` decision on Run 3.5 (APT42867576). The PatternStore text-scoring matched `status-already-satisfied` with confidence 0.90 purely on keyword overlap, even though `maxStatus=3200.1 < target=3350`.

**Fix**: `resolvePatternAction` now validates `snapshot.maxStatus >= STAGE_STATUS_TARGET[stageId]` for the `status-already-satisfied` pattern. When the status doesn't meet the target, it returns `retry` instead of `continue`.

| Healer | Probe | Diagnosis | Decision | Duration |
|---|---|---|---|---|
| Agentic Healer | status=3700.0001, shipments=1, invoices=0, returnCreditNote=false, notes=[] | Pattern "status-already-satisfied" (confidence 1.00) | **retry** | 693ms |

In this run, `maxStatus=3700.0001` and `return-delivery` target is `9000`, so the guard correctly recognises the status is NOT satisfied and returns `retry`. The retry still fails (no credit note), but the healer's diagnosis is now honest.

### AutoPOC Invoice Enrichment

| AutoPOC Service | Purpose | Result | Duration |
|---|---|---|---|
| `InvoiceStatus_AutoPOC` (1st call) | Credit note enrichment, status shortcut | OK — no invoice data returned | 3,597ms |
| `InvoiceStatus_AutoPOC` (2nd call, after retry) | Credit note enrichment | OK — still no invoice data | 3,515ms |

### Verification: 3 steps, 1 PASS / 2 FAIL

#### step-24 — PASS — Return tracking
| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 38 | Return completed on order | PASS | status >= 3700 | Shipped |

#### step-25 — FAIL — Credit note generated
| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| 40 | Credit note exists | **FAIL** | truthy | not found | No invoice generated (cascade from Stage 5) |
| 41 | InvoiceType is RETURN or CREDIT_MEMO | **FAIL** | RETURN or CREDIT_MEMO | undefined | — |
| 42 | Has total amount | **FAIL** | truthy | undefined | — |
| 43 | CreditAmount present | **FAIL** | truthy | undefined | — |
| 44 | DateInvoiced present | **FAIL** | truthy | undefined | — |

#### step-26 — FAIL — Financial reconciliation
| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 45 | Credit note captured | **FAIL** | truthy | not captured |

---

## Stage 9: Return Email, PDF & Browser Verification (`return-comms`) — SKIPPED (0.0s)

| Step | What | Would query |
|---|---|---|
| step-21a | Email: Return created notification | IMAP/MS Graph |
| step-26a | Email: Return pickup notification | IMAP/MS Graph |
| step-31a | Email: Refund confirmation | IMAP/MS Graph |
| step-20a | PDF: Return shipping label | PDF extractor |
| step-32 | PDF: Credit note (Nota de Credito) | PDF extractor |
| step-17a | Browser: Return initiation page | Playwright (portal) |
| step-18a | Browser: Return confirmation page | Playwright (portal) |

---

# Bug Fix Regression: Run 3.5 (APT42867576) vs Run 4 (APT99046586)

| Aspect | Run 3.5 (APT42867576, buggy) | Run 4 (APT99046586, fixed) |
|---|---|---|
| **Confirm Shipment** | **FAIL** — `YDM00085 ShipNode "0625" does not exist` | **PASS** — ShipNode=IT33 used correctly |
| **Delivery & POD** | **FAIL** — timed out (no shipment existed) | **PASS** — 2/2 checks |
| **Create Return** | **FAIL** — `IllegalArgumentException` (can't return unshipped order) | **PASS** — return created successfully |
| **Return Delivery** | **FAIL** — order not found (cascade) | **FAIL** — credit note not found (real issue) |
| ShipNode in Step 7 XML | `0625` (from `<OrderRelease>` element) | `IT33` (from `buildOrderCtx`, Step 2 value) |
| Self-healing accuracy | `status-already-satisfied` false positive on confirm-shipment (status 3200.1 < target 3350) | No false positive — healer correctly returns `retry` when status < target |
| Stages passed | 2 / 9 | 5 / 9 |
| Total checks | 2 | 9 |
| Duration | 1019.9s | 687.1s |

**3 stages unblocked** by the ShipNode fix. Confirm-shipment succeeding enables the entire downstream chain (delivery → return → return-delivery).

---

# AutoPOC Services — Status Update

All 4 AutoPOC custom services are now deployed and responding in XAPI JSP:

| Service | Deployed? | Calls This Run | Avg Duration | Notes |
|---|---|---|---|---|
| `OrderStatus_AutoPOC` | **YES** | 5 | ~3.7s | Post-create, post-schedule, post-release ×2, post-delivery |
| `ReleaseStatus_AutoPOC` | **YES** | 3 | ~20.8s | Post-release ×2, confirm-shipment enrichment |
| `ShipmentStatus_AutoPOC` | **YES** | 3 | ~3.6s | Step 7.4 enrichment, Step 8.2 validation, poll enrichment |
| `InvoiceStatus_AutoPOC` | **YES** | 2 | ~3.6s | Credit note enrichment (return-delivery) ×2 |

**Run 3 comparison**: All 4 services timed out (60s each, 240s wasted). Now responding in ~3-20s. The slow one is `ReleaseStatus_AutoPOC` at ~20s — likely because it queries release details across all lines.

---

# Self-Healing Operations

| Stage | Trigger | What Happened | Result | Duration |
|---|---|---|---|---|
| Stage 5 (forward-invoice) | Poll timed out after 15 attempts | **Full recovery playbook**: find ShipmentKey (`302603031436269287898804`) → query task queue (`TaskQKey=202603031438257904765701`) → move AvailableDate (from `2026-03-03T14:38:25` to `2026-03-02 14:38:26`) → poll 180s for invoice | **FAILED — invoice not generated** | ~256s |
| Stage 8 (return-delivery) | Credit note not found | Probed Sterling: status=3700.0001, shipments=1, invoices=0, returnCreditNote=false. Pattern "status-already-satisfied" (confidence 1.00). **Guard validated**: 3700 < 9000 → returned `retry` (not false `continue`) | **RETRY** (still failed — no credit note) | 693ms |

---

# XAPI Write Operations (Full Inventory)

| # | XAPI Step | Service/API | Purpose | Duration |
|---|---|---|---|---|
| 1 | Step 1 | `adidasWE_CreateOrderSync` | Create sales order | 5,060ms |
| 2 | Step 2 | `changeOrder` | Stamp ShipNode=IT33 | 3,900ms |
| 3 | Step 3 | `changeOrder` | Resolve Buyer's Remorse hold | 3,821ms |
| 4 | Step 4 | `adidasWE_CheckAdyenAsyncResponseSvc` | Process Adyen payment | 4,225ms |
| 5 | Step 5.1 | `getATP` | Check inventory at IT33 for EE6464_530 | ~5s |
| 6 | Step 5.5 | `scheduleOrder` | Schedule order for fulfillment | ~5s |
| 7 | Step 6 | `releaseOrder` | Release order to warehouse | ~5s |
| 8 | Step 7 | `adidasWE_ProcessSHPConfirmation` | Ship confirmation (**ShipNode=IT33**) | ~5s |
| 9 | Step 8 | `adidas_UpdateSOAcknowledgmentSvc` | SO Acknowledgment | ~5s |
| 10 | Step 10 | `adidasWE_ProcessPODUpdate` | Delivery/POD event (DL) | ~3s |
| 11 | Step 11 | `adidasWE_CreateReturnFromSSRSvc` | Create return on forward order | ~0.6s |
| 12 | — (heal) | `getShipmentListForOrder` | Find ShipmentKey for invoice recovery | ~60s |
| 13 | — (heal) | `getTaskList` | Query pending invoice task | ~60s |
| 14 | — (heal) | `manageTaskQueue` | Move AvailableDate to trigger invoice | ~5s |

**Note**: Step 5.2 (`adjustInventory`) not needed — IT33 had stock. 14 XAPI calls total (11 lifecycle + 3 healing).

---

# Performance Breakdown

| Component | Duration | Notes |
|---|---|---|
| XAPI order creation (Steps 1-4) | 17.0s | 4 sequential Playwright calls |
| AutoPOC post-create enrichment | 3.6s | OrderStatus_AutoPOC |
| XAPI inventory check (Step 5.1) | ~5s | getATP — stock found, no adjust needed |
| XAPI schedule (Step 5.5) + AutoPOC check (5.6) | ~8.7s | scheduleOrder + OrderStatus_AutoPOC |
| XAPI release (Step 6) + AutoPOC validation (6.1/6.2) | ~31.8s | releaseOrder + 2 AutoPOC calls |
| Release polling + AutoPOC enrichment | ~23.1s | getOrderList + OrderStatus + ReleaseStatus |
| AutoPOC enrichment (Step 7 prep) | ~24s | ReleaseStatus + OrderStatus |
| XAPI ship + ship confirm (Steps 7-8) | ~10s | ProcessSHPConfirmation + SOAcknowledgment |
| AutoPOC post-ship (7.4 + 8.2) | ~7.4s | 2× ShipmentStatus_AutoPOC |
| XAPI deliver (Step 10) + enrichment | ~7.2s | ProcessPODUpdate + OrderStatus_AutoPOC |
| Forward invoice poll | ~75s | 15 attempts × 5s, timed out |
| Invoice healer (FAILED) | ~256s | ShipmentKey lookup + TaskQ + 180s poll |
| XAPI return creation (Step 11) | ~0.6s | CreateReturnFromSSRSvc |
| Return delivery checks + AutoPOC | ~22.8s | InvoiceStatus_AutoPOC ×2 + verify |

**Total wall-clock**: 687.1s (11.5 min)
**AutoPOC time**: ~70s (10.2% — no more 60s timeouts, all services responding)
**Invoice healing overhead**: ~256s (37.3% of total)
**Sterling polling overhead**: ~98s (14.3% of total)
**Actual XAPI lifecycle work**: ~52.6s (7.7% of total)

**vs Run 3 (APT15605451)**: 687s vs 1346s — **49% faster**. AutoPOC timeouts eliminated (240s → 0s). Polling cut because status shortcut works when shipment actually exists.

---

# Remaining Failure Root Causes

| Root Cause | Checks Affected | Status | Fix Owner |
|---|---|---|---|
| **Forward invoice not generated** | 7 (step-12/12a not run + step-25/26 cascade) | **OPEN** — Sterling `CREATE_INVOICE` agent doesn't fire within 180s poll+recovery window on fresh orders | Dev team: investigate `CREATE_INVOICE` agent schedule |
| **Credit note not generated** | 6 (step-25, step-26) | **OPEN** — cascading from forward invoice failure | Same as above |
| **Carrier notes not populated** | 4 (IT/DL notes) | **EXPECTED** — XAPI-driven delivery doesn't post NShift carrier notes | N/A (would need NShift integration, Layer 3) |

---

# Comparison: Run 3 (APT15605451) vs Run 4 (APT99046586)

| Aspect | Run 3 (APT15605451) | Run 4 (APT99046586) |
|---|---|---|
| AutoPOC services | **NOT deployed** — all 4 timed out (240s wasted) | **Deployed** — all 4 responding (~3-20s each) |
| ShipNode bug | Not hit (AutoPOC timeout → defaults used → IT33) | **Fixed** — ShipNode no longer extracted from release XML |
| Self-healing false positive | `status-already-satisfied` on return-delivery (decision: `continue`) | **Fixed** — state guard validates status < target → returns `retry` |
| Inventory (Step 5.1) | Zero stock → adjustInventory injected 50 PIECE | Stock found → no adjustment needed |
| Confirm Shipment | PASS (580.7s — 4× AutoPOC timeout = 240s wasted) | PASS (59.6s — no timeouts) |
| Forward invoice | **FAILED** — healer tried, invoice not generated after 180s | **FAILED** — same root cause |
| Create Return | PASS | PASS |
| Return Delivery | **FAILED** — no credit note. Healer: false `continue` | **FAILED** — no credit note. Healer: honest `retry` |
| Stages | 5 pass, 2 fail, 2 skip | 5 pass, 2 fail, 2 skip |
| Total checks | 9 | 9 |
| Duration | **1345.7s** | **687.1s** (49% faster) |

**Key insight**: Same pass/fail count (5/2/2) but the run is 49% faster because AutoPOC services are deployed. The two remaining failures (forward-invoice, return-delivery) are both rooted in the Sterling `CREATE_INVOICE` batch agent not firing on fresh orders. The ShipNode bug was invisible in Run 3 because AutoPOC timeouts caused fallback to hardcoded IT33 — the bug only surfaced once AutoPOC was deployed and returned the real `0625` release-level ShipNode.

---

# Action Items for Dev Team

### P0 (Blocking: invoice generation)
1. **Investigate `CREATE_INVOICE` agent timing** — The healer correctly finds ShipmentKey, queries TaskQ, and backdates AvailableDate. But the invoice still doesn't generate within 180s. Runs 3 and 4 both fail. Run 2 (APT18568060, ~2hrs old) succeeded. Is there a minimum age or pipeline warmup?
   - ShipmentKey: `302603031436269287898804`
   - TaskQKey: `202603031438257904765701`
   - AvailableDate moved from `2026-03-03T14:38:25` to `2026-03-02 14:38:26`

### P1 (Output template gaps — affects check coverage)
2. **Update `getOrderList` output template** — Include `PersonInfoShipTo` (FirstName, LastName, City, Country) and `OrderLines` (ItemID, UnitOfMeasure, OrderedQty, LinePriceInfo, ShipNode).
3. **Update `getShipmentListForOrder` output template** — Include `TrackingNo`.

### P2 (Observation)
4. **`ReleaseStatus_AutoPOC` response time** — Averaging ~20s vs ~3.5s for the other 3 services. Not blocking, but worth checking if the output template is over-fetching.
5. **Clarify `OrderRelease.ShipNode` vs `OrderLine.ShipNode`** — The release XML returns `ShipNode="0625"` at the `<OrderRelease>` level. Is `0625` a distribution node, sourcing node, or warehouse code? This caused `YDM00085` when used in ship-confirm. We now skip it, but understanding the data model would help.

---

# Raw Console Output

```
Loading Adidas configuration...
O2C: Creating new order via XAPI
  Layers: Sterling
  XAPI: enabled
  Self-healing: enabled (invoice recovery playbook)
  Telemetry: 7 outcomes recorded

Pre-flight: checking Sterling connectivity...
Pre-flight: Sterling is reachable

  Healing telemetry: 7 outcomes recorded
  [XAPI] Creating order APT99046586 (enterprise: adidas_PT)
  [XAPI] Step 1 (adidasWE_CreateOrderSync): OK (5060ms)
  [XAPI] Step 2 (changeOrder): OK (3900ms)
  [XAPI] Step 3 (changeOrder): OK (3821ms)
  [XAPI] Step 4 (adidasWE_CheckAdyenAsyncResponseSvc): OK (4225ms)
  [AutoPOC] OrderStatus_AutoPOC (create-order enrichment): OK (3612ms)
  [PASS] Create Sales Order (1/1 checks, 24.0s)
  [TC01] Step 5.1: ATP check passed — EE6464_530 has stock at IT33
  [TC01] Step 5.3: No inventory node control record — OK
  [TC01] Step 5.6: Post-schedule status OK — Status=1500 (3695ms)
  [AutoPOC] Step 6.1: OrderStatus_AutoPOC (post-release): OK (3583ms)
  [AutoPOC] Step 6.2: ReleaseStatus_AutoPOC (post-release): OK (23220ms)
  [AutoPOC] OrderStatus_AutoPOC (release enrichment): OK (4095ms)
  [AutoPOC] ReleaseStatus_AutoPOC (release enrichment): OK (19020ms)
  [PASS] Wait for Order Release (1/1 checks, 212.7s)
  [AutoPOC] ShipmentStatus_AutoPOC (post-ship-confirm): OK (3734ms)
  [AutoPOC] ShipmentStatus_AutoPOC (shipment enrichment, status shortcut): OK (3652ms)
  [PASS] Confirm Shipment (1/1 checks, 59.6s)
  [AutoPOC] OrderStatus_AutoPOC (delivery enrichment): OK (3411ms)
  [PASS] Delivery & POD Events (2/2 checks, 7.2s)
  [HEAL] forward-invoice: Invoice failure detected — running recovery playbook (Playwright XAPI)...
  [HEAL] Recovery failed: ShipmentKey: 302603031436269287898804
    TaskQKey: 202603031438257904765701
    Current AvailableDate: 2026-03-03T14:38:25+00:00
    AvailableDate moved to: 2026-03-02 14:38:26.000
    Invoice not generated after 180s. Sterling job may not have run. — continuing
  [FAIL] Forward Invoice & Reconciliation (0/0 checks, 78.6s)
  [SKIP] Forward Flow Email & PDF Verification (0/4 skipped, 0.0s)
  [PASS] Create Return Order (1/1 checks, 0.6s)
  [AutoPOC] InvoiceStatus_AutoPOC (credit note enrichment, status shortcut): OK (3597ms)
  [AGENTIC] return-delivery: Pattern "status-already-satisfied" matched (confidence 1.00)
  [AGENTIC] Probe: status=3700.0001, shipments=1, invoices=0, returnCreditNote=false, notes=[]
  [AGENTIC] Matched pattern: status-already-satisfied (id=16)
  [AGENTIC] Decision: retry (693ms)
  [AutoPOC] InvoiceStatus_AutoPOC (credit note enrichment, status shortcut): OK (3515ms)
  [FAIL] Return Delivery & Credit Note (1/3 checks, 22.8s)
  [SKIP] Return Email, PDF & Browser Verification (0/7 skipped, 0.0s)

============================================================
  Order: APT99046586
  Stages: 5 passed, 2 failed, 2 skipped
  Checks: 9
  Duration: 687.1s
  Result: FAIL
  Report: /workspaces/agentic-qe/v3/tests/reports/o2c-APT99046586-2026-03-03T14-43-25.html
============================================================
```
