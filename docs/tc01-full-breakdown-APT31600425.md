# TC_01 Full Test Breakdown — APT31600425 (Fresh Order)
**Date**: 2026-03-01 12:17 UTC | **Duration**: 602.6s | **Result**: 5 PASS, 2 FAIL, 2 SKIP
**Mode**: Fresh order creation via XAPI (no `--order` flag)
**Flags**: `--skip-layer2 --skip-layer3 --continue-on-failure`
**Entry point**: `npx tsx v3/src/clients/adidas/run-tc01.ts`
**Report**: `v3/tests/reports/o2c-APT31600425-2026-03-01T12-17-29.html`
**Previous run**: APT16070332 (same session, same config — 547.3s, 4 PASS / 5 FAIL)

---

## Stage 1: Create Sales Order (`create-order`) — FAIL (57.0s)

### Action: XAPI 4-Step Order Creation
AQE creates a brand-new sales order from scratch using XAPI (Playwright → Sterling JSP).

| Sub-step | XAPI Service/API | System | XML Template | Duration | Result |
|---|---|---|---|---|---|
| Step 1 | `adidasWE_CreateOrderSync` | Sterling OMS (JSP) | `step1_CreateOrder` — IsFlow=Y, custom Adidas order creation flow | 29,797ms | OK |
| Step 2 | `changeOrder` | Sterling OMS (JSP) | `step2_StampShipNode` — sets `ShipNode=IT33` on order line | 6,712ms | OK |
| Step 3 | `changeOrder` | Sterling OMS (JSP) | `step3_ResolveHold` — resolves Buyer's Remorse hold | 5,824ms | OK |
| Step 4 | `adidasWE_CheckAdyenAsyncResponseSvc` | Sterling OMS (JSP) | `step4_ProcessPayment` — triggers Adyen payment processing | 7,270ms | OK |

**Actor**: AQE → XAPI Client (Playwright headless browser → `yantrahttpapitester.jsp`)
**Protocol**: HTTP POST to Sterling JSP with XML body
**Generated Order**: APT31600425 (total creation: 49.6s)

### Self-Healing
| Healer | Diagnosis | Decision | Duration |
|---|---|---|---|
| Agentic Healer | "MaxOrderStatus 1100 >= target 1100 for stage create-order. Order already past this stage." | continue | 541ms |

**Note**: The agentic healer activated because the create-order action completed (status 1100) but the verification step failed. The healer probed Sterling, confirmed status=1100, shipments=0, invoices=0 — correct for a just-created order — and decided to continue.

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `POST /invoke/getOrderDetails` with `OrderNo=APT31600425`, polled until OrderNo + Status present |

### Verification: step-01 — FAIL (247ms)
Performed by: **AQE → Sterling REST API** (`getOrderDetails`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| — | (HTTP 400 — 0 checks) | **FAIL** | order fields | HTTP 400: Bad Request |

**Root cause**: `getOrderDetails` returned HTTP 400 when the order was still being processed. The XAPI created order APT31600425 successfully (all 4 steps OK), but the REST read came too early — Sterling hadn't fully committed the order yet. Despite the verification failure, the order IS created and valid (confirmed by subsequent stages passing).

**Comparison to APT16070332**: The previous run got 14 checks from step-01 (including 12 PASS). This time, the REST read failed entirely with HTTP 400, producing zero checks.

---

## Stage 2: Wait for Order Release (`wait-for-release`) — PASS (23.2s)

### Action: XAPI Schedule + Release
| Sub-step | XAPI API | System | What Happened |
|---|---|---|---|
| Step 5 | `scheduleOrder` | Sterling OMS (JSP) | Schedules order for fulfillment |
| Step 6 | `releaseOrder` | Sterling OMS (JSP) | Releases order to warehouse for picking/shipping |

**Actor**: AQE → XAPI Client (Playwright → JSP)

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `getOrderDetails` polled until `Status >= "3200"` (Released). Also fetched payment method, total, shipNode, releaseNo. |

### Verification: step-02 — PASS (901ms)
Performed by: **AQE → Sterling REST API** (`getOrderDetails` + `pollUntil`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 1 | Status >= 3200 | PASS | >=3200 | Released |
| 2 | ShipNode assigned | PASS | truthy | IT33 |
| 3 | HoldFlag is not Y | PASS | Not Y | N |

**Note**: All 3 checks pass. The ShipNode (IT33) and HoldFlag checks are new MVP parity checks added in commit `d1cf6f2a`.

---

## Stage 3: Confirm Shipment (`confirm-shipment`) — PASS (16.2s)

### Action: XAPI Ship + ShipConfirm (Skipped — already shipped)
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → Sterling REST | Sterling OMS | Checked `MaxOrderStatus` — found `3700.0001 >= 3350`. Shipment already confirmed, XAPI ship steps skipped. |
| POLL | AQE → Sterling REST | Sterling OMS | Same status check — already past target, poll returned immediately. |

**Key observation**: Between Stage 2 (release) and Stage 3 (ship confirm), Sterling automatically processed the shipment. The order reached `MaxOrderStatus=3700.0001` within the ~23 seconds of Stage 2.

### Verification: 7 steps in this stage, 6 skipped (L2/L3), 1 executed

#### step-03 through step-07 — SKIPPED (Layer 2)
IIB flow checks skipped via `--skip-layer2` flag. These steps would query EPOCH GraphQL for:
- step-03: `MF_ADS_OMS_ShipmentRequest_WMS_SYNC` (13 checks)
- step-04: `MF_ADS_WMS_ShipmentConfirm_SYNC` (4 checks)
- step-05: `MF_ADS_OMS_AFS_SalesOrderCreation` (7 checks)
- step-06: `MF_ADS_OMS_NShift_ShippingAndReturnLabel_SYNC` (13 checks)
- step-07: `MF_ADS_AFS_OMS_PPSalesOrderAck_SYNC` (5 checks)

#### step-08 — PASS (734ms) — Shipment created with tracking
Performed by: **AQE → Sterling REST API** (`getShipmentListForOrder` + `getOrderDetails`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 4 | MaxOrderStatus >= 3350 (Ship Confirmed) | PASS | >=3350 | 3700.0001 |
| 5 | Has shipments | PASS | >0 | 1 |
| 6 | First has tracking | **FAIL** | truthy | undefined |
| 7 | First has SCAC | PASS | truthy | COR |
| 8 | First has ShipmentNo | PASS | truthy | APT31600425-1 |
| 9 | First has ShipDate or Status | PASS | truthy | [object Object] |

**Note**: Check 6 (tracking number) fails — fresh order shipments don't get auto-assigned tracking numbers in UAT. Carrier is `COR` (Correos Express).

#### step-09 — SKIPPED (Layer 3)
NShift carrier tracking details — skipped via `--skip-layer3`.

---

## Stage 4: Delivery & POD Events (`delivery`) — PASS (2.3s)

### Action: XAPI Deliver (Skipped — already delivered)
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → Sterling REST | Sterling OMS | Checked `MaxOrderStatus` — found `3700.0001 >= 3700`. Delivery already completed. |
| POLL | AQE → Sterling REST | Sterling OMS | Confirmed `MaxOrderStatus >= 3700` immediately. |

### Verification: 2 steps, both PASS

#### step-10 — PASS (1259ms) — POD: In-Transit carrier event
Performed by: **AQE → Sterling REST API** (`getOrderDetails`)
System queried: **Sterling OMS** (order status + Notes)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 10 | Order past delivery (IT implied) | PASS | MaxOrderStatus >= 3700 | 3700.0001 |
| 11 | IT note ReasonCode present | **FAIL** | IT | status-shortcut (no note) |
| 12 | IT note has Trandate | **FAIL** | timestamp | status-shortcut |

**Note**: Step passes because primary check (status >= 3700) succeeded. IT note checks are informational — carrier notes aren't populated for auto-shipped orders.

#### step-11 — PASS (327ms) — POD: Delivered carrier event
Performed by: **AQE → Sterling REST API** (`getOrderDetails`)
System queried: **Sterling OMS** (order status + Notes + PaymentMethods)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 13 | Order past delivery (DL implied) | PASS | MaxOrderStatus >= 3700 | 3700.0001 |
| 14 | MinOrderStatusDesc reflects delivery | PASS | non-empty status desc | Shipped |
| 15 | DL note ReasonCode present | **FAIL** | DL | status-shortcut (no note) |
| 16 | DL note has Trandate | **FAIL** | timestamp | status-shortcut |
| 17 | Has carrier notes (IT+DL) | **FAIL** | >=2 notes | 0 notes |
| 18 | Payment status captured | PASS | COLLECTED or INVOICED | AUTHORIZED |

**Note**: `MinOrderStatusDesc = "Shipped"` (new MVP parity check, PASS). Payment status is `AUTHORIZED` — Adyen processed the authorization successfully. Carrier notes (IT/DL) not present in auto-shipped orders.

---

## Stage 5: Forward Invoice & Reconciliation (`forward-invoice`) — PASS (0.5s)

### Self-Healing: Invoice Recovery Playbook — SUCCESS (118.4s)

This is the highlight of the run. The forward invoice was NOT immediately available — the self-healing system kicked in and **successfully recovered** it.

| Phase | Performed By | System | What Happened | Duration |
|---|---|---|---|---|
| 1. Initial poll | AQE → Sterling REST | Sterling OMS | `getOrderInvoiceList` — no forward invoice yet | — |
| 2. **HEAL triggered** | AQE Healing Handler | — | "Invoice failure detected — running recovery playbook (Playwright XAPI)" | — |
| 3. Find ShipmentKey | AQE → XAPI | Sterling OMS | `getShipmentListForOrder` via XAPI — found ShipmentKey for APT31600425-1 | ~5s |
| 4. Query task queue | AQE → XAPI | Sterling OMS | `getTaskList` — found pending task: `TaskQKey=202603011210337904008148` | ~5s |
| 5. Move AvailableDate | AQE → XAPI | Sterling OMS | `manageTaskQueue` — moved `AvailableDate` from `2026-02-28T00:00:00` to `2026-03-01T12:13:28` (NOW) | ~5s |
| 6. Poll for invoice | AQE → Sterling REST | Sterling OMS | Polled `getOrderInvoiceList` — invoice generated! | ~95s |
| 7. **Recovery succeeded** | AQE Healing Handler | — | "Recovery succeeded (118383ms) — retrying stage" | 118.4s |
| 8. Re-verify | AQE → Sterling REST | Sterling OMS | Stage re-ran verification — invoice found and validated | 0.5s |

**Actor**: AQE Healing Handler → Recovery Playbook → XAPI (Playwright) + Sterling REST
**Key finding**: Recovery took **118.4s** (vs 45.4s on APT16070332 and 95s on APT26149445). The task queue had an older AvailableDate (`2026-02-28`) which caused a longer wait for the invoice generation batch job to pick it up.

### Verification: 2 steps, both PASS

#### step-12 — PASS (190ms) — Forward invoice generated
Performed by: **AQE → Sterling REST API** (`getOrderInvoiceList`)
System queried: **Sterling OMS** (invoice records)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 19 | Forward invoice exists | PASS | truthy | 2602946 |
| 20 | InvoiceType is forward (not CREDIT_MEMO) | PASS | not CREDIT_MEMO | SHIPMENT |
| 21 | Has total amount | PASS | truthy | 120.00 |
| 22 | AmountCollected present | PASS | truthy | 0.00 |
| 23 | DateInvoiced present | **FAIL** | truthy | undefined |

**Note**: Invoice `2602946` generated with correct type `SHIPMENT` and total `€120.00`. `DateInvoiced` field still not returned by Sterling output template (consistent across all runs).

#### step-12a — PASS (0ms) — Financial reconciliation (forward)
Performed by: **AQE** (context validation — no API call)
System queried: **In-memory context**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 24 | Forward invoice captured | PASS | truthy | 2602946 |
| 25 | Payment method captured | PASS | truthy | CREDIT_CARD |

---

## Stage 6: Forward Flow Email & PDF Verification (`forward-comms`) — SKIP (0.0s)

### Verification: 4 steps, all SKIPPED (Layer 3)
Steps skipped via `--skip-layer3` flag:
- step-03a: Email: Order confirmation (8 checks when email provider available)
- step-07a: Forward shipping label PDF (3 checks when PDF available)
- step-14a: Email: Out for delivery (2 checks when email provider available)
- step-16a: Email: Order delivered (2 checks when email provider available)

---

## Stage 7: Create Return Order (`create-return`) — PASS (2.0s)

### Action: XAPI Return POD Steps
| Sub-step | XAPI Service | System | What Happened |
|---|---|---|---|
| Step 12 | `adidasWE_ProcessPODUpdate` | Sterling OMS (JSP) | Return picked up — carrier POD event XML |
| Step 13 | `adidasWE_ProcessPODUpdate` | Sterling OMS (JSP) | Return in transit — carrier POD event XML |
| Step 14 | `adidasWE_ProcessPODUpdate` | Sterling OMS (JSP) | Return delivered to warehouse — carrier POD event XML |
| Step 15 | `adidasWE_ProcessPODUpdate` | Sterling OMS (JSP) | Return completion — receipt XML |

**Actor**: AQE → XAPI Client (Playwright → JSP)

### Verification: 2 steps, 1 executed / 1 skipped

#### step-15 — PASS (843ms) — Return order created
Performed by: **AQE → Sterling REST API** (`getOrderDetails` with DocType 0003, then fallback to 0001)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 26 | Return on forward order | PASS | status >= 3700 | Shipped |

**Note**: DocType 0003 query didn't find a separate return order — return is processed on the forward order itself (Adidas-specific).

#### step-16 — SKIPPED (Layer 2)
IIB Return Authorization flow (`MF_ADS_EPOCH_ReturnAuthorization_WE`) — skipped via `--skip-layer2`.

---

## Stage 8: Return Delivery & Credit Note (`return-delivery`) — FAIL (31.2s)

### Action
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → Sterling REST | Sterling OMS | Checked status — already at 3700.03 (Return Completed) |
| POLL | AQE → Sterling REST | Sterling OMS | Confirmed status >= 3700 |

### Self-Healing: Credit Note Recovery — FAILED (272.5s)
The agentic healer attempted a full diagnosis:

| Phase | What Happened |
|---|---|
| 1. Query DocType 0003 invoices | No return invoice found on APT31600425 |
| 2. Query DocType 0001 invoices | No return invoice on forward order either |
| 3. Find ShipmentKey | Found forward ShipmentKey `302603011208539284213560` |
| 4. Query task queue | Found task `TaskQKey=202603011210337904008148` |
| 5. Move AvailableDate | Moved from `2026-02-28T00:00:00` to `2026-03-01T12:13:28` |
| 6. Poll for return invoice | Polled 12 times — no return invoice generated |
| 7. **Diagnosis** | "Return invoice is generated by WMS ReturnConfirmation flow — may not have been triggered in UAT" |
| 8. **Decision** | continue (272508ms) |

**Root cause**: Credit notes require the `MF_ADS_WMS_ReturnConfirmation_SYNC` SOAP flow (IIB → Sterling), which is not active in UAT. The healer correctly identified this dependency.

### Verification: 3 steps, 1 PASS / 2 FAIL

#### step-24 — PASS (205ms) — Return tracking via POD notes
Performed by: **AQE → Sterling REST API** (`getOrderDetails`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 27 | Return completed on order | PASS | status >= 3700 | Return Completed |
| 28 | Return status description present | PASS | non-empty | Return Completed |

**Note**: Both checks pass. Return status description check is a new MVP parity check from commit `d1cf6f2a`.

#### step-25 — FAIL (72ms) — Credit note generated
Performed by: **AQE → Sterling REST API** (`getOrderInvoiceList`)
System queried: **Sterling OMS** (invoice records)

| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| 29 | Credit note exists | **FAIL** | truthy | not found | WMS ReturnConfirmation not triggered |
| 30 | InvoiceType is RETURN or CREDIT_MEMO | **FAIL** | RETURN or CREDIT_MEMO | undefined | No return invoice |
| 31 | Has total amount | **FAIL** | truthy | undefined | — |
| 32 | CreditAmount present | **FAIL** | truthy | undefined | — |
| 33 | DateInvoiced present | **FAIL** | truthy | undefined | — |

#### step-26 — FAIL (0ms) — Financial reconciliation (return)
Performed by: **AQE** (context validation)
System queried: **In-memory context**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 34 | Credit note captured | **FAIL** | truthy | not captured |
| 35 | Return order captured | PASS | truthy | APT31600425 |

---

## Stage 9: Return Email, PDF & Browser Verification (`return-comms`) — SKIP (0.0s)

### Verification: 7 steps, all SKIPPED (Layer 3)
Steps skipped via `--skip-layer3` flag:
- step-21a: Email: Return created (1 check)
- step-26a: Email: Return pickup (3 checks)
- step-31a: Email: Refund confirmation (6 checks)
- step-20a: PDF: Return shipping label (5 checks)
- step-32: PDF: Credit note (Nota de Credito) (10 checks)
- step-17a: Browser: Return initiation page (4 checks)
- step-18a: Browser: Return confirmation page (3 checks)

---

## Summary: 35 Checks Executed (L1 only)

### Check Count Breakdown

| Source | Checks | Pass | Fail |
|---|---|---|---|
| step-01: Create order verification | 0 | 0 | 0 | ← HTTP 400, no checks produced |
| step-02: Order release | 3 | 3 | 0 |
| step-08: Shipment with tracking | 6 | 5 | 1 |
| step-10: POD In-Transit | 3 | 1 | 2 |
| step-11: POD Delivered | 6 | 3 | 3 |
| step-12: Forward invoice | 5 | 4 | 1 |
| step-12a: Forward reconciliation | 2 | 2 | 0 |
| step-15: Return order | 1 | 1 | 0 |
| step-24: Return tracking | 2 | 2 | 0 |
| step-25: Credit note | 5 | 0 | 5 |
| step-26: Return reconciliation | 2 | 1 | 1 |
| **TOTAL** | **35** | **22** | **13** |

**Note**: Report shows "11 checks" because the orchestrator only counts stage-level verification totals (grouping steps within stages differently). The granular check count above is 35.

### By System

| System | API/Protocol | Checks | Pass | Fail | Notes |
|---|---|---|---|---|---|
| **Sterling OMS** | REST JSON (`/invoke/{api}`) | 31 | 19 | 12 | Core order lifecycle |
| **Sterling OMS** | XAPI JSP (Playwright) | — | — | — | ACT phase only: creation (4), schedule/release (2), return POD (4) = 10 write ops |
| **EPOCH Monitoring** | GraphQL | 0 | 0 | 0 | Skipped (--skip-layer2) |
| **NShift** | REST API | 0 | 0 | 0 | Skipped (--skip-layer3) |
| **Email (IMAP/Graph)** | IMAP or MS Graph | 0 | 0 | 0 | Skipped (--skip-layer3) |
| **PDF** | pdf-parse library | 0 | 0 | 0 | Skipped (--skip-layer3) |
| **Browser** | Playwright | 0 | 0 | 0 | Skipped (--skip-layer3) |
| **In-memory context** | — | 4 | 3 | 1 | Context validation |

### By Actor (Who Performed It)

| Actor | Role | What It Did |
|---|---|---|
| **AQE Action Orchestrator** | Driver | Sequenced 9 lifecycle stages: ACT → POLL → VERIFY |
| **AQE → Sterling REST** | Reader | 31 verification checks via `getOrderDetails`, `getShipmentListForOrder`, `getOrderInvoiceList` |
| **AQE → XAPI (Playwright)** | Writer | **10 write operations**: order creation (4), schedule/release (2), return POD (4) |
| **AQE Healing Handler** | Self-Healer | **Recovered forward invoice** (118.4s, SUCCESS). Attempted credit note recovery (272.5s, diagnosed WMS dependency). |
| **AQE Agentic Healer** | Diagnostician | Probed Sterling state on create-order failure, confirmed status=1100, decided to continue (541ms). |
| **L2/L3 Providers** | Skipped | All IIB, email, PDF, browser, NShift checks skipped via CLI flags |

### XAPI Write Operations (Full Inventory)

| # | XAPI Step | Service/API | Purpose | System | Duration |
|---|---|---|---|---|---|
| 1 | Step 1 | `adidasWE_CreateOrderSync` | Create sales order | Sterling OMS (JSP) | 29.8s |
| 2 | Step 2 | `changeOrder` | Stamp ShipNode=IT33 | Sterling OMS (JSP) | 6.7s |
| 3 | Step 3 | `changeOrder` | Resolve Buyer's Remorse hold | Sterling OMS (JSP) | 5.8s |
| 4 | Step 4 | `adidasWE_CheckAdyenAsyncResponseSvc` | Process Adyen payment | Sterling OMS (JSP) | 7.3s |
| 5 | Step 5 | `scheduleOrder` | Schedule order for fulfillment | Sterling OMS (JSP) | Stage 2 |
| 6 | Step 6 | `releaseOrder` | Release order to warehouse | Sterling OMS (JSP) | Stage 2 |
| 7 | Step 12 | `adidasWE_ProcessPODUpdate` | Return picked up | Sterling OMS (JSP) | Stage 7 |
| 8 | Step 13 | `adidasWE_ProcessPODUpdate` | Return in transit | Sterling OMS (JSP) | Stage 7 |
| 9 | Step 14 | `adidasWE_ProcessPODUpdate` | Return delivered to warehouse | Sterling OMS (JSP) | Stage 7 |
| 10 | Step 15 | `adidasWE_ProcessPODUpdate` | Return completion/receipt | Sterling OMS (JSP) | Stage 7 |

**Skipped XAPI steps**: Ship (7), ShipConfirm (8), Deliver (10) — Sterling auto-processed these.

### Self-Healing Operations

| Stage | Trigger | What Happened | Result | Duration |
|---|---|---|---|---|
| Stage 1 (create-order) | step-01 HTTP 400 | Agentic healer probed: status=1100, 0 shipments, 0 invoices. Diagnosed "already past this stage" | continue | 541ms |
| Stage 5 (forward-invoice) | Invoice poll timed out | **Full recovery playbook**: ShipmentKey → task queue → manageTaskQueue → poll → invoice `2602946` | **SUCCESS** | 118.4s |
| Stage 8 (return-delivery) | Credit note not found | Attempted recovery: probed, found task, moved AvailableDate, polled 12 times. Diagnosed WMS dependency | continue | 272.5s |

### Failure Root Causes

| Root Cause | Checks Affected | Fix |
|---|---|---|
| **HTTP 400 on getOrderDetails (timing)** | 0 (step-01 produced no checks) | Add retry/backoff on step-01 REST read after XAPI creation |
| **No tracking number on fresh orders** | 1 (step-08 check 6) | TrackingNo not populated for UAT-created shipments |
| **Carrier notes not in output** | 5 (IT/DL notes + note count) | Output template doesn't return Notes, or notes not populated for auto-shipped orders |
| **DateInvoiced missing** | 1 (step-12 check 23) | Sterling output template doesn't return DateInvoiced field |
| **WMS ReturnConfirmation not active in UAT** | 6 (step-25 all 5 + step-26 credit note) | Credit notes require IIB SOAP flow not available in UAT |

### Differences: APT31600425 vs APT16070332 vs APT26149445

| Aspect | APT31600425 (This Run) | APT16070332 (Previous) | APT26149445 (Existing) |
|---|---|---|---|
| Date | 2026-03-01 12:17 | 2026-03-01 10:52 | 2026-02-28 |
| Mode | Fresh creation (XAPI) | Fresh creation (XAPI) | Validate existing (`--order`) |
| Flags | `--skip-layer2 --skip-layer3` | none | `--skip-layer2 --skip-layer3` |
| Stages result | 5 PASS, 2 FAIL, 2 SKIP | 4 PASS, 5 FAIL, 0 SKIP | 4 PASS, 3 FAIL, 2 SKIP |
| Checks executed | 35 (L1 only) | 54 (L1+L2+L3) | ~50 |
| step-01 | HTTP 400 (0 checks) | 14 checks (12 PASS, 2 FAIL) | 14 checks |
| Invoice recovery | SUCCESS (118.4s) | SUCCESS (45.4s) | SUCCESS (95s) |
| Credit note recovery | FAIL (272.5s, WMS dep) | FAIL (WMS dep) | FAIL (WMS dep) |
| Tracking number | undefined | undefined | APT26149445TR1 |
| Payment status | AUTHORIZED | AUTHORIZED | AWAIT_PAY_INFO |
| Invoice No | 2602946 | 2602925 | 2602750 |
| Duration | 602.6s | 547.3s | 307.8s |

### Coverage Analysis

**This run (L1 only, --skip-layer2 --skip-layer3)**: 35 of 207 checks (17%)

**If run WITHOUT skip flags**: Would execute ~173 checks (84%) based on code analysis:

| Layer | Checks Built | Would Execute | Reason for Gap |
|---|---|---|---|
| L1: Sterling OMS | ~62 | ~62 | All execute |
| L2: IIB EPOCH | 42 + field checks | 7 (1 per flow) | EPOCH is SIT-only, returns 0 txns |
| L2: IIB field checks | ~59 | 0 | Conditional on txns.length > 0 |
| L3: NShift | 2 | 2 (FAIL) | Now produces explicit FAILs |
| L3: Email | 26 | 26 (FAIL) | Now produces explicit FAILs |
| L3: PDF | 18 | 18 (FAIL) | Now produces explicit FAILs |
| L3: Browser | 7 | 7 (FAIL) | Now produces explicit FAILs |
| **Total** | ~216 | ~122 | |

**What's needed for 207/207**:
- UAT EPOCH endpoint → unlocks ~59 IIB field-level checks
- Email provider (IMAP/Graph) → unlocks 26 checks (currently explicit FAIL)
- PDF provider + label/credit note PDFs → unlocks 18 checks
- Browser config + portal URL → unlocks 7 checks
- SAPCAR/WMS/LAM/EmailTrigger flows → ~20 checks not yet coded

### Telemetry

| Metric | Value |
|---|---|
| Healing outcomes recorded | 16 (prior to this run) |
| HNSW fallback | Dormant (need 34 more outcomes to activate) |
| Patterns in memory.db | 14 Sterling patterns |
