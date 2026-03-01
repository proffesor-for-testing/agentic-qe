# TC_01 Full Test Breakdown — APT16070332 (Fresh Order)
**Date**: 2026-03-01 10:52 UTC | **Duration**: 547.3s | **Result**: 4 PASS, 5 FAIL, 0 SKIP
**Mode**: Fresh order creation via XAPI (no `--order` flag)

---

## Stage 1: Create Sales Order (`create-order`) — PASS (49.2s)

### Action: XAPI 4-Step Order Creation
AQE creates a brand-new sales order from scratch using XAPI (Playwright → Sterling JSP).

| Sub-step | XAPI Service/API | System | XML Template | Duration | Result |
|---|---|---|---|---|---|
| Step 1 | `adidasWE_CreateOrderSync` | Sterling OMS (JSP) | `step1_CreateOrder` — IsFlow=Y, custom Adidas order creation flow | 27,544ms | OK |
| Step 2 | `changeOrder` | Sterling OMS (JSP) | `step2_StampShipNode` — sets `ShipNode=IT33` on order line | 7,208ms | OK |
| Step 3 | `changeOrder` | Sterling OMS (JSP) | `step3_ResolveHold` — resolves Buyer's Remorse hold | 5,247ms | OK |
| Step 4 | `adidasWE_CheckAdyenAsyncResponseSvc` | Sterling OMS (JSP) | `step4_ProcessPayment` — triggers Adyen payment processing | 7,505ms | OK |

**Actor**: AQE → XAPI Client (Playwright headless browser → `yantrahttpapitester.jsp`)
**Protocol**: HTTP POST to Sterling JSP with XML body
**Generated Order**: APT16070332

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `POST /invoke/getOrderDetails` with `OrderNo=APT16070332`, polled until OrderNo + Status present |

### Verification: step-01 — PASS (1011ms)
Performed by: **AQE → Sterling REST API** (`getOrderDetails`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 1 | OrderNo present | PASS | truthy | APT16070332 |
| 2 | Status defined | PASS | truthy | Created |
| 3 | EnterpriseCode matches | PASS | adidas_PT | adidas_PT |
| 4 | DocumentType is 0001 | PASS | 0001 | 0001 |
| 5 | SellerOrganizationCode present | PASS | truthy | adidas_PT |
| 6 | ShipTo FirstName present | PASS | truthy | sunil |
| 7 | ShipTo LastName present | PASS | truthy | kumar |
| 8 | ShipTo City present | PASS | truthy | Lisboa |
| 9 | ShipTo Country present | PASS | truthy | PT |
| 10 | Has order lines | PASS | >0 | 1 |
| 11 | Line ItemID present | **FAIL** | truthy | missing |
| 12 | Line UOM present | **FAIL** | truthy | missing |
| 13 | Line OrderedQty present | PASS | truthy | 1 |
| 14 | Line has price info | PASS | truthy | 120.00 |

**Note**: Checks 11-12 fail because the Sterling output template doesn't return `ItemID`/`UnitOfMeasure` on order lines. Need to ask devs about the correct output template (Question #5).

---

## Stage 2: Wait for Order Release (`wait-for-release`) — PASS (44.1s)

### Action: XAPI Schedule + Release
| Sub-step | XAPI API | System | What Happened |
|---|---|---|---|
| Step 5 | `scheduleOrder` | Sterling OMS (JSP) | Schedules order for fulfillment |
| Step 6 | `releaseOrder` | Sterling OMS (JSP) | Releases order to warehouse for picking/shipping |

**Actor**: AQE → XAPI Client (Playwright → JSP)

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `getOrderDetails`, polled until `Status >= "3200"` (Released). Also fetched payment method, total, shipNode, releaseNo via `getOrderReleaseList`. |

### Verification: step-02 — PASS (396ms)
Performed by: **AQE → Sterling REST API** (`getOrderDetails` + `pollUntil`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 15 | Status >= 3200 | PASS | >=3200 | ResrvSO Acknowledged |

---

## Stage 3: Confirm Shipment (`confirm-shipment`) — FAIL (16.4s)

### Action: XAPI Ship + ShipConfirm (Skipped — already shipped)
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → Sterling REST | Sterling OMS | Checked `MaxOrderStatus` — found `3700.0001 >= 3350`. Shipment already confirmed, XAPI ship steps skipped. |
| POLL | AQE → Sterling REST | Sterling OMS | Same status check — already past target, poll returned immediately. |

**Key observation**: Between Stage 2 (release) and Stage 3 (ship confirm), Sterling automatically processed the shipment. The order reached `MaxOrderStatus=3700.0001` within ~44 seconds of creation. This means the XAPI ship/deliver/return POD steps submitted earlier were picked up and processed by Sterling's batch jobs before this stage ran.

### Verification: 7 steps, 1 PASS / 6 FAIL

#### step-03 — FAIL (495ms) — IIB: ShipmentRequest to WMS
Performed by: **AQE → EPOCH GraphQL** (`getMessageList`)
System queried: **EPOCH Monitoring DB** (via GraphQL at `http://10.146.28.234:8082/graphqlmdsit`)
Flow: `MF_ADS_OMS_ShipmentRequest_WMS_SYNC`

| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| 16 | Has transactions | **FAIL** | >0 | 0 | EPOCH endpoint is SIT-only, UAT orders return empty |

#### step-04 — FAIL (97ms) — IIB: WMS Ship Confirmation
Performed by: **AQE → EPOCH GraphQL**
System queried: **EPOCH Monitoring DB**
Flow: `MF_ADS_WMS_ShipmentConfirm_SYNC`

| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| 17 | Has ShipConfirm txns | **FAIL** | >0 | 0 | EPOCH SIT-only |

#### step-05 — FAIL (57ms) — IIB: AFS Sales Order Creation
Performed by: **AQE → EPOCH GraphQL**
System queried: **EPOCH Monitoring DB**
Flow: `MF_ADS_OMS_AFS_SalesOrderCreation`

| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| 18 | Has AFS SO Creation txns | **FAIL** | >0 | 0 | EPOCH SIT-only |

#### step-06 — FAIL (59ms) — IIB: NShift Label Request/Response
Performed by: **AQE → EPOCH GraphQL**
System queried: **EPOCH Monitoring DB**
Flow: `MF_ADS_OMS_NShift_ShippingAndReturnLabel_SYNC`

| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| 19 | Has NShift label txns | **FAIL** | >0 | 0 | EPOCH SIT-only |

#### step-07 — FAIL (62ms) — IIB: AFS Sales Order Acknowledgment
Performed by: **AQE → EPOCH GraphQL**
System queried: **EPOCH Monitoring DB**
Flow: `MF_ADS_AFS_OMS_PPSalesOrderAck_SYNC`

| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| 20 | Has AFS SO Ack txns | **FAIL** | >0 | 0 | EPOCH SIT-only |

#### step-08 — PASS (765ms) — Shipment created with tracking
Performed by: **AQE → Sterling REST API** (`getShipmentListForOrder` + `getOrderDetails`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 21 | MaxOrderStatus >= 3350 (Ship Confirmed) | PASS | >=3350 | 3700.0001 |
| 22 | Has shipments | PASS | >0 | 1 |
| 23 | First has tracking | **FAIL** | truthy | undefined |
| 24 | First has SCAC | PASS | truthy | COR |
| 25 | First has ShipmentNo | PASS | truthy | APT16070332-1 |
| 26 | First has ShipDate or Status | PASS | truthy | [object Object] |

**Note**: Check 23 (tracking number) fails — this fresh order's shipment has no `TrackingNo`. Unlike the pre-existing APT26149445 which had `APT26149445TR1`, a newly created order's shipment doesn't automatically get a tracking number in UAT.

#### step-09 — FAIL (0ms) — NShift: Carrier tracking details
Would query: **NShift API** (`getShipmentDetails`)
System queried: **NShift** (not available)

| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| — | (no checks) | **FAIL** | — | — | NShift client not available or no shipments |

---

## Stage 4: Delivery & POD Events (`delivery`) — PASS (2.2s)

### Action: XAPI Deliver (Skipped — already delivered)
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → Sterling REST | Sterling OMS | Checked `MaxOrderStatus` — found `3700.0001 >= 3700`. Delivery already completed, XAPI deliver step skipped. |
| POLL | AQE → Sterling REST | Sterling OMS | Confirmed `MaxOrderStatus >= 3700` immediately. |

### Verification: 2 steps, both PASS

#### step-10 — PASS (366ms) — POD: In-Transit carrier event
Performed by: **AQE → Sterling REST API** (`getOrderDetails`)
System queried: **Sterling OMS** (order status + Notes)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 27 | Order past delivery (IT implied) | PASS | MaxOrderStatus >= 3700 | 3700.0001 |
| 28 | IT note ReasonCode present | **FAIL** | IT | status-shortcut (no note) |
| 29 | IT note has Trandate | **FAIL** | timestamp | status-shortcut |

**Note**: Step passes because primary check (status >= 3700) succeeded. IT/DL note details are informational — the order is past delivery but carrier notes aren't in the output template.

#### step-11 — PASS (222ms) — POD: Delivered carrier event
Performed by: **AQE → Sterling REST API** (`getOrderDetails`)
System queried: **Sterling OMS** (order status + Notes + PaymentMethods)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 30 | Order past delivery (DL implied) | PASS | MaxOrderStatus >= 3700 | 3700.0001 |
| 31 | DL note ReasonCode present | **FAIL** | DL | status-shortcut (no note) |
| 32 | DL note has Trandate | **FAIL** | timestamp | status-shortcut |
| 33 | Has carrier notes (IT+DL) | **FAIL** | >=2 notes | 0 notes |
| 34 | Payment status captured | PASS | COLLECTED or INVOICED | AUTHORIZED |

**Note**: Payment status is `AUTHORIZED` on this fresh order (vs `AWAIT_PAY_INFO` on APT26149445). This is a better state — means Adyen processed the authorization. Still not `INVOICED` or `COLLECTED`.

---

## Stage 5: Forward Invoice & Reconciliation (`forward-invoice`) — PASS (0.7s)

### Self-Healing: Invoice Recovery Playbook — SUCCESS (45.4s)

This is the key highlight of the fresh order run. The forward invoice was NOT immediately available — the self-healing system kicked in and **successfully recovered** it.

| Phase | Performed By | System | What Happened | Duration |
|---|---|---|---|---|
| 1. Initial poll | AQE → Sterling REST | Sterling OMS | `getOrderInvoiceList` — no forward invoice yet | — |
| 2. **HEAL triggered** | AQE Healing Handler | — | "Invoice failure detected — running recovery playbook (Playwright XAPI)" | — |
| 3. Find ShipmentKey | AQE → XAPI | Sterling OMS | `getShipmentListForOrder` via XAPI — found ShipmentKey for APT16070332-1 | ~5s |
| 4. Query task queue | AQE → XAPI | Sterling OMS | `getTaskList` — found pending task with `TransactionKey = ShipmentKey` | ~5s |
| 5. Move AvailableDate | AQE → XAPI | Sterling OMS | `manageTaskQueue` — moved `AvailableDate` to NOW to trigger immediate invoice generation | ~5s |
| 6. Poll for invoice | AQE → Sterling REST | Sterling OMS | Polled `getOrderInvoiceList` — invoice generated! | ~25s |
| 7. **Recovery succeeded** | AQE Healing Handler | — | "Recovery succeeded (45395ms) — retrying stage" | 45.4s |
| 8. Re-verify | AQE → Sterling REST | Sterling OMS | Stage re-ran verification — invoice found and validated | 0.7s |

**Actor**: AQE Healing Handler → Recovery Playbook → XAPI (Playwright) + Sterling REST
**Significance**: First time self-healing has worked on a BRAND NEW order created in the same run. Proves the invoice recovery playbook works end-to-end, not just on pre-existing orders.

### Verification: 2 steps, both PASS

#### step-12 — PASS (345ms) — Forward invoice generated
Performed by: **AQE → Sterling REST API** (`getOrderInvoiceList`)
System queried: **Sterling OMS** (invoice records)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 35 | Forward invoice exists | PASS | truthy | 2602925 |
| 36 | InvoiceType is forward (not CREDIT_MEMO) | PASS | not CREDIT_MEMO | SHIPMENT |
| 37 | Has total amount | PASS | truthy | 120.00 |
| 38 | AmountCollected present | PASS | truthy | 0.00 |
| 39 | DateInvoiced present | **FAIL** | truthy | undefined |

#### step-12a — PASS (0ms) — Financial reconciliation (forward)
Performed by: **AQE** (context validation — no API call)
System queried: **In-memory context** (values captured in earlier steps)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 40 | Forward invoice captured | PASS | truthy | 2602925 |
| 41 | Payment method captured | PASS | truthy | CREDIT_CARD |

---

## Stage 6: Forward Flow Email & PDF Verification (`forward-comms`) — FAIL (0.0s)

### Action
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | — | — | Verify-only stage (no action/poll) |

### Self-Healing
| Healer | Diagnosis | Decision |
|---|---|---|
| Agentic Healer | "No recovery pattern for stage forward-comms" | continue |

### Verification: 4 steps, all FAIL (missing providers)

#### step-03a — FAIL (0ms) — Email: Order confirmation
Would query: **IMAP/MS Graph** (customer email inbox)
**Error**: Email provider not available (no `ADIDAS_EMAIL_*` env vars)

#### step-07a — FAIL (0ms) — PDF: Forward shipping label
Would query: **PDF extractor** (parse label PDF from NShift/Sterling)
**Error**: PDF extractor or forward label not available (no label PDF in context)

#### step-14a — FAIL (0ms) — Email: Out for delivery notification
Would query: **IMAP/MS Graph** (customer email inbox)
**Error**: Email provider not available

#### step-16a — FAIL (0ms) — Email: Order delivered notification
Would query: **IMAP/MS Graph** (customer email inbox)
**Error**: Email provider not available

---

## Stage 7: Create Return Order (`create-return`) — FAIL (4.9s)

### Action: XAPI Create Return (Skipped — status already past)
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → Sterling REST | Sterling OMS | Checked `MaxOrderStatus` — found `3700.0001 >= 3700`. Return already completed, XAPI return creation skipped. |
| POLL | AQE → Sterling REST | Sterling OMS | Confirmed forward order status >= 3700, return exists. |

### Verification: 2 steps, 1 PASS / 1 FAIL

#### step-15 — PASS (3585ms) — Return order created
Performed by: **AQE → Sterling REST API** (`getOrderDetails` with DocType 0003, then fallback to 0001)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 42 | Return on forward order | PASS | status >= 3700 | Shipped |

**Note**: The forward order status reports "Shipped" as the `Status` text even though `MaxOrderStatus=3700.0001`. DocType 0003 query didn't find a separate return order — return is processed on the forward order itself.

#### step-16 — FAIL (409ms) — IIB: Return Authorization
Performed by: **AQE → EPOCH GraphQL** (`getMessageList`)
System queried: **EPOCH Monitoring DB**
Flow: `MF_ADS_EPOCH_ReturnAuthorization_WE`

| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| 43 | Has return auth txns | **FAIL** | >0 | 0 | EPOCH SIT-only |

---

## Stage 8: Return Delivery & Credit Note (`return-delivery`) — FAIL (32.5s)

### Action: XAPI Return POD (4 steps attempted)
| Sub-step | XAPI Service | System | What Happened |
|---|---|---|---|
| Step 12 | `adidasWE_ProcessPODUpdate` | Sterling OMS (JSP) | Return picked up — POD event XML |
| Step 13 | `adidasWE_ProcessPODUpdate` | Sterling OMS (JSP) | Return in transit — POD event XML |
| Step 14 | `adidasWE_ProcessPODUpdate` | Sterling OMS (JSP) | Return delivered to warehouse — POD event XML |
| Step 15 | `adidasWE_ProcessPODUpdate` | Sterling OMS (JSP) | Return completion — receipt XML |

**Actor**: AQE → XAPI Client (Playwright → JSP)
**Note**: These XAPI steps may have executed but didn't trigger credit note generation — credit notes require the WMS ReturnConfirmation SOAP flow (`MF_ADS_WMS_ReturnConfirmation_SYNC`) which is not active in UAT.

### Self-Healing
| Healer | Diagnosis | Decision |
|---|---|---|
| Agentic Healer | Probed Sterling state, attempted recovery, diagnosed WMS dependency | continue |

### Verification: 3 steps, 1 PASS / 2 FAIL

#### step-24 — PASS (1375ms) — Return tracking via POD notes
Performed by: **AQE → Sterling REST API** (`getOrderDetails`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 44 | Return completed on order | PASS | status >= 3700 | Return Completed |

#### step-25 — FAIL (95ms) — Credit note generated
Performed by: **AQE → Sterling REST API** (`getOrderInvoiceList` with DocType 0003, then fallback to 0001)
System queried: **Sterling OMS** (invoice records)

| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| 45 | Credit note exists | **FAIL** | truthy | not found | WMS ReturnConfirmation not triggered in UAT |
| 46 | InvoiceType is RETURN or CREDIT_MEMO | **FAIL** | RETURN or CREDIT_MEMO | undefined | No return invoice on either order |
| 47 | Has total amount | **FAIL** | truthy | undefined | — |
| 48 | CreditAmount present | **FAIL** | truthy | undefined | — |
| 49 | DateInvoiced present | **FAIL** | truthy | undefined | — |

#### step-26 — FAIL (0ms) — Financial reconciliation (return)
Performed by: **AQE** (context validation)
System queried: **In-memory context**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 50 | Credit note captured | **FAIL** | truthy | not captured |
| 51 | Return order captured | PASS | truthy | APT16070332 |

---

## Stage 9: Return Email, PDF & Browser Verification (`return-comms`) — FAIL (0.0s)

### Action
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | — | — | Verify-only stage (no action/poll) |

### Self-Healing
| Healer | Diagnosis | Decision |
|---|---|---|
| Agentic Healer | "No recovery pattern for stage return-comms" | continue |

### Verification: 7 steps, all FAIL (missing providers)

#### step-21a — FAIL (0ms) — Email: Return created notification
Would query: **IMAP/MS Graph** | **Error**: Email provider not available

#### step-26a — FAIL (0ms) — Email: Return pickup notification
Would query: **IMAP/MS Graph** | **Error**: Email provider not available

#### step-31a — FAIL (0ms) — Email: Refund confirmation
Would query: **IMAP/MS Graph** | **Error**: Email provider not available

#### step-20a — FAIL (0ms) — PDF: Return shipping label
Would query: **PDF extractor** | **Error**: PDF extractor or return label not available

#### step-32 — FAIL (0ms) — PDF: Credit note (Nota de Credito)
Would query: **PDF extractor** | **Error**: PDF extractor or credit note not available

#### step-17a — FAIL (0ms) — Browser: Return initiation page
Would query: **Playwright browser** (Adidas customer portal) | **Error**: Browser provider not available

#### step-18a — FAIL (0ms) — Browser: Return confirmation page
Would query: **Playwright browser** | **Error**: Not yet implemented (needs shared browser session with step-17a)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 52 | Confirmation page shown | **FAIL** | confirmation content | skipped — needs shared session with step-17a |
| 53 | Refund method shown | **FAIL** | refund method | skipped — needs shared session with step-17a |
| 54 | Order reference shown | **FAIL** | APT16070332 | skipped — needs shared session with step-17a |

---

## Summary: 54 Checks Executed

### By System

| System | API/Protocol | Checks | Pass | Fail | Notes |
|---|---|---|---|---|---|
| **Sterling OMS** | REST JSON (`/invoke/{api}`) | 34 | 24 | 10 | Core order lifecycle — works |
| **Sterling OMS** | XAPI JSP (Playwright) | — | — | — | Used for ACT phase only (write ops): order creation (4 steps), schedule/release (2 steps), return POD (4 steps). Also used by healing (task queue recovery). |
| **EPOCH Monitoring** | GraphQL (`getMessageList`) | 6 | 0 | 6 | SIT-only endpoint, UAT orders return empty |
| **NShift** | REST API | 0 | 0 | 0 | Client not configured (no API key) |
| **Email (IMAP/Graph)** | IMAP or MS Graph API | 0 | 0 | 0 | Provider not configured |
| **PDF** | pdf-parse library | 0 | 0 | 0 | No PDFs available in context |
| **Browser** | Playwright | 3 | 0 | 3 | Provider not configured / not implemented |
| **In-memory context** | — | 4 | 3 | 1 | Context validation (invoice/payment refs) |
| | **TOTAL** | **54** | **27** | **27** | |

### By Actor (Who Performed It)

| Actor | Role | What It Did |
|---|---|---|
| **AQE Action Orchestrator** | Driver | Sequenced 9 lifecycle stages: ACT → POLL → VERIFY |
| **AQE → Sterling REST** | Reader | 34 verification checks via `getOrderDetails`, `getShipmentListForOrder`, `getOrderInvoiceList` |
| **AQE → XAPI (Playwright)** | Writer | **10 write operations**: order creation (4 steps: CreateOrderSync, StampShipNode, ResolveHold, ProcessPayment), schedule/release (2 steps), return POD (4 steps: pickup, in-transit, delivered, complete) |
| **AQE → EPOCH GraphQL** | Reader | 6 IIB flow transaction queries — all returned empty (SIT-only) |
| **AQE Healing Handler** | Self-Healer | **Recovered forward invoice**: probed Sterling → found ShipmentKey → queried task queue → moved AvailableDate → polled until invoice appeared. **45.4s recovery, SUCCESS.** |
| **NShift / Email / PDF / Browser** | Not available | 14 checks couldn't execute — providers not configured |

### By Layer

| Layer | Description | Checks | Pass | Fail |
|---|---|---|---|---|
| **L1: Sterling OMS** | Order status, shipments, invoices, notes | 38 | 27 | 11 |
| **L2: IIB Message Flows** | EPOCH GraphQL (SIT-only) | 6 | 0 | 6 |
| **L3: NShift** | Carrier tracking details | 0 | 0 | 0 |
| **L3: Email** | Customer notifications | 0 | 0 | 0 |
| **L3: PDF** | Shipping labels, credit notes | 0 | 0 | 0 |
| **L3: Browser** | Customer portal verification | 3 | 0 | 3 |

### XAPI Write Operations (Full Inventory)

All 10 XAPI write operations executed during this run:

| # | XAPI Step | Service/API | Purpose | System | Timing |
|---|---|---|---|---|---|
| 1 | Step 1 | `adidasWE_CreateOrderSync` | Create sales order (custom Adidas flow) | Sterling OMS (JSP) | Stage 1, 27.5s |
| 2 | Step 2 | `changeOrder` | Stamp ShipNode=IT33 on order line | Sterling OMS (JSP) | Stage 1, 7.2s |
| 3 | Step 3 | `changeOrder` | Resolve Buyer's Remorse hold | Sterling OMS (JSP) | Stage 1, 5.2s |
| 4 | Step 4 | `adidasWE_CheckAdyenAsyncResponseSvc` | Process Adyen payment (async response check) | Sterling OMS (JSP) | Stage 1, 7.5s |
| 5 | Step 5 | `scheduleOrder` | Schedule order for fulfillment | Sterling OMS (JSP) | Stage 2 |
| 6 | Step 6 | `releaseOrder` | Release order to warehouse | Sterling OMS (JSP) | Stage 2 |
| 7 | Step 12 | `adidasWE_ProcessPODUpdate` | Return picked up (carrier POD) | Sterling OMS (JSP) | Stage 8 |
| 8 | Step 13 | `adidasWE_ProcessPODUpdate` | Return in transit (carrier POD) | Sterling OMS (JSP) | Stage 8 |
| 9 | Step 14 | `adidasWE_ProcessPODUpdate` | Return delivered to warehouse (carrier POD) | Sterling OMS (JSP) | Stage 8 |
| 10 | Step 15 | `adidasWE_ProcessPODUpdate` | Return completion/receipt (carrier POD) | Sterling OMS (JSP) | Stage 8 |

**Note**: XAPI steps 7-8 (Ship/ShipConfirm) and step 10 (Deliver) were **skipped** because Sterling auto-processed the order to status 3700.0001 before those stages ran.

### Self-Healing Operations

| Stage | Trigger | What Happened | Result | Duration |
|---|---|---|---|---|
| Stage 3 (confirm-shipment) | MaxOrderStatus 3700.0001 >= target 3350 | Agentic healer diagnosed "order already past this stage" | continue | <1s |
| Stage 5 (forward-invoice) | Invoice poll timed out — no forward invoice | **Full recovery playbook**: find ShipmentKey → query task queue → move AvailableDate → poll for invoice | **SUCCESS — invoice 2602925 generated** | 45.4s |
| Stage 6 (forward-comms) | All email/PDF providers missing | "No recovery pattern for stage forward-comms" | continue | <1s |
| Stage 7 (create-return) | MaxOrderStatus 3700.0001 >= target 3700 | Agentic healer diagnosed "order already past this stage" | continue | <1s |
| Stage 8 (return-delivery) | Credit note not found | Probed Sterling, diagnosed WMS ReturnConfirmation dependency | continue | ~30s |
| Stage 9 (return-comms) | All email/PDF/browser providers missing | "No recovery pattern for stage return-comms" | continue | <1s |

### Failure Root Causes

| Root Cause | Checks Affected | Fix |
|---|---|---|
| **EPOCH endpoint is SIT-only** | 6 (steps 03-07, 16) | Need UAT EPOCH endpoint (Question #7) |
| **WMS ReturnConfirmation not triggered in UAT** | 7 (steps 25, 26 + 5 credit note fields) | Need devs to explain UAT credit note flow (Question #1) |
| **Missing output template fields** | 2 (ItemID, UOM) | Need correct Sterling output template (Question #5) |
| **No tracking number on fresh order** | 1 (step-08 check 23) | TrackingNo not populated for UAT-created shipments |
| **Carrier notes not in output** | 4 (IT/DL notes) | Same output template issue or notes not populated for this order |
| **DateInvoiced missing** | 1 (step-12) | Output template doesn't return DateInvoiced field |
| **NShift not configured** | 1 (step-09) | Need `ADIDAS_NSHIFT_API_KEY` |
| **Email not configured** | 6 (steps 03a, 14a, 16a, 21a, 26a, 31a) | Need `ADIDAS_EMAIL_*` IMAP/Graph config |
| **PDF not available** | 3 (steps 07a, 20a, 32) | Need shipping label + credit note PDFs retrieved first |
| **Browser not configured** | 3 (steps 17a, 18a + checks 52-54) | Need Playwright + portal URL config |

### Differences: Fresh Order (APT16070332) vs Existing Order (APT26149445)

| Aspect | APT16070332 (Fresh) | APT26149445 (Existing) |
|---|---|---|
| Mode | Created from scratch via XAPI | Validated with `--order` flag |
| Order status at start | Created (new) | Return Completed (3700.03) |
| XAPI steps executed | 10 (create + schedule + release + return POD) | 0-4 (some skipped — already progressed) |
| Self-healing invoice | **SUCCESS** — recovered in 45.4s | SUCCESS — recovered in 95s |
| Tracking number | Missing (not auto-assigned) | APT26149445TR1 (pre-existing) |
| Payment status | AUTHORIZED | AWAIT_PAY_INFO |
| Order status text | Created → ResrvSO Acknowledged → Return Completed | Return Completed (throughout) |
| Duration | 547.3s | 307.8s |
| Result | 4 PASS, 5 FAIL | 4 PASS, 5 FAIL |

### Coverage: 54 of 207 (26%)

The full TC_01 spec has 207 verification points. This run executed 54 checks.
Breakdown of what's not covered:

| Gap | Checks | What's Needed |
|---|---|---|
| EPOCH IIB payloads (SIT-only, returned 0 txns) | ~63 | UAT EPOCH endpoint |
| Email verification | ~26 | IMAP/MS Graph credentials |
| PDF content validation | ~17 | Label + credit note PDFs |
| Browser portal | ~4 | Playwright + portal config |
| SAPCAR/WMS ReturnConfirmation flows | ~23 | Not coded (out of current scope) |
| LAM flow | ~7 | Not coded |
| EmailTrigger ASYNC | ~3 | Not coded |
| Misc (multi-shipment conditionals) | ~10 | Need orders with 2+ shipments |
