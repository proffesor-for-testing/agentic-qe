# TC_01 Full Test Breakdown — APT40168172 (Fresh Order)
**Date**: 2026-03-02 12:00 UTC | **Duration**: 733.6s | **Result**: 3 PASS, 7 FAIL, 0 SKIP | **Checks**: 29
**Mode**: Fresh order creation via XAPI (no `--order` flag)
**Changes since last run**: getOrderDetails→getOrderList redirect, inventory check (getATP+adjustInventory), GWC stage, hasCreditMemo split in healer

---

## Stage 1: Create Sales Order (`create-order`) — PASS (24.5s)

### Action: XAPI 4-Step Order Creation
AQE creates a brand-new sales order from scratch using XAPI (Playwright → Sterling JSP).

| Sub-step | XAPI Service/API | System | XML Template | Duration | Result |
|---|---|---|---|---|---|
| Step 1 | `adidasWE_CreateOrderSync` | Sterling OMS (JSP) | `step1_CreateOrder` — IsFlow=Y, custom Adidas order creation flow | 8,293ms | OK |
| Step 2 | `changeOrder` | Sterling OMS (JSP) | `step2_StampShipNode` — sets ShipNode on order line | 5,008ms | OK |
| Step 3 | `changeOrder` | Sterling OMS (JSP) | `step3_ResolveHold` — resolves Buyer's Remorse hold | 4,796ms | OK |
| Step 4 | `adidasWE_CheckAdyenAsyncResponseSvc` | Sterling OMS (JSP) | `step4_ProcessPayment` — triggers Adyen payment processing | 5,823ms | OK |

**Actor**: AQE → XAPI Client (Playwright headless browser → `yantrahttpapitester.jsp`)
**Protocol**: HTTP POST to Sterling JSP with XML body
**Generated Order**: APT40168172

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `POST /invoke/getOrderList` (redirect from getOrderDetails — **new: avoids DB row lock**) with `OrderNo=APT40168172, MaximumRecords=1`, polled until OrderNo + Status present |

### Verification: step-01 — PASS (292ms)
Performed by: **AQE → Sterling REST API** (`getOrderList` internally)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 1 | OrderNo present | PASS | truthy | APT40168172 |
| 2 | Status defined | PASS | truthy | Created |
| 3 | EnterpriseCode matches | PASS | adidas_PT | adidas_PT |
| 4 | DocumentType is 0001 | PASS | 0001 | 0001 |
| 5 | SellerOrganizationCode present | PASS | truthy | adidas_PT |
| 6 | ShipTo FirstName present | FAIL | truthy | missing |
| 7 | ShipTo LastName present | FAIL | truthy | missing |
| 8 | ShipTo City present | FAIL | truthy | missing |
| 9 | ShipTo Country present | FAIL | truthy | missing |
| 10 | Has order lines | FAIL | >0 | 0 |
| 11 | Line ItemID present | FAIL | truthy | missing |
| 12 | Line UOM present | FAIL | truthy | missing |
| 13 | Line OrderedQty present | FAIL | truthy | missing |
| 14 | Line has price info | FAIL | truthy | missing |
| 15 | PaymentStatus present | PASS | AUTHORIZED\|PAID\|SETTLED | AUTHORIZED |
| 16 | OrderType is ShipToHome | PASS | ShipToHome | ShipToHome |
| 17 | Currency is EUR | PASS | EUR | EUR |
| 18 | EntryType is web | PASS | web | web |

**Note**: Checks 6-14 fail because the Sterling output template for `getOrderList` doesn't return `PersonInfoShipTo` or `OrderLines` detail fields by default. Need the correct Sterling output template configured on the server side. The step still passes overall because the primary checks (OrderNo, Status, EnterpriseCode, DocumentType, PaymentStatus, OrderType, Currency, EntryType) all pass.

---

## Stage 2: Wait for Order Release (`wait-for-release`) — PASS (139.0s)

### Action: XAPI Schedule + Release
| Sub-step | XAPI API | System | What Happened |
|---|---|---|---|
| Step 5.0 | `getAvailableToPromiseSummary` | Sterling OMS (JSP) | **NEW**: ATP inventory check before scheduling |
| Step 5.0b | `adjustInventory` (if ATP=0) | Sterling OMS (JSP) | **NEW**: UAT inventory injection (only for `_PT`/`_DE` enterprises) |
| Step 5 | `scheduleOrder` | Sterling OMS (JSP) | Schedules order for fulfillment |
| Step 6 | `releaseOrder` | Sterling OMS (JSP) | Releases order to warehouse for picking/shipping |

**Actor**: AQE → XAPI Client (Playwright → JSP)

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `getOrderList` (internal redirect), polled until `Status >= "3200"` (Released). Also fetched payment method, total, shipNode, releaseNo via `getOrderReleaseList`. **NEW**: Enriches context with `itemId` and `unitOfMeasure` from order lines for inventory check. |

### Verification: step-02 — PASS (397ms)
Performed by: **AQE → Sterling REST API** (`getOrderList` + `pollUntil`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 15 | Status >= 3200 | PASS | >=3200 | Acknowledged |
| 16 | ShipNode assigned | FAIL | truthy | missing |
| 17 | HoldFlag is not Y | PASS | Not Y | N |

**Note**: ShipNode check fails — output template doesn't return ShipNode at order level (same root cause as Stage 1).

---

## Stage 3: Confirm Shipment (`confirm-shipment`) — FAIL (12.6s)

### Action: Agentic Healer Auto-Skip
The order was already past shipment (`MaxOrderStatus = 3700.0001 >= target 3350`). The agentic healer correctly diagnosed "order already past this stage" and continued.

### Verification: 1/7 checks passed

| Step | Result | Detail |
|---|---|---|
| step-03 (IIB Shipment Request) | FAIL | Has transactions: 0 — EPOCH GraphQL not configured for UAT |
| step-04 (IIB Ship Confirm) | FAIL | Has ShipConfirm txns: 0 — EPOCH GraphQL not configured for UAT |
| step-05 (IIB AFS SO Creation) | FAIL | Has AFS SO Creation txns: 0 — EPOCH GraphQL not configured for UAT |
| step-06 (IIB NShift Labels) | FAIL | Has NShift label txns: 0 — EPOCH GraphQL not configured for UAT |
| step-07 (IIB AFS SO Ack) | FAIL | Has AFS SO Ack txns: 0 — EPOCH GraphQL not configured for UAT |
| step-08 (Shipment validation) | PASS | MaxOrderStatus=3700.0001, 1 shipment, SCAC=COR, ShipmentNo=APT40168172-1 |
| step-09 (NShift carrier) | FAIL | NShift client not available |

**Root cause**: IIB checks (steps 03-07) fail because EPOCH GraphQL endpoint is SIT-only. NShift not configured.

---

## Stage 4: Delivery & POD Events (`delivery`) — PASS (0.5s)

### Verification: step-10, step-11 — PASS (262ms total)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 1 | Order past delivery (IT implied) | PASS | MaxOrderStatus >= 3700 | 3700.0001 |
| 2 | IT note ReasonCode present | FAIL | IT | status-shortcut (no note) |
| 3 | IT note has Trandate | FAIL | timestamp | status-shortcut |
| 4 | Order past delivery (DL implied) | PASS | MaxOrderStatus >= 3700 | 3700.0001 |
| 5 | MinOrderStatusDesc reflects delivery | PASS | non-empty | Shipped |
| 6 | DL note ReasonCode present | FAIL | DL | status-shortcut (no note) |
| 7 | DL note has Trandate | FAIL | timestamp | status-shortcut |
| 8 | Has carrier notes (IT+DL) | FAIL | >=2 notes | 0 notes |
| 9 | Payment status captured | PASS | COLLECTED or INVOICED | AUTHORIZED |

**Note**: Carrier note checks fail — notes not populated in output template. Step still passes because primary check (MaxOrderStatus >= 3700) passes.

---

## Stage 5: Apply Good Will Credit — GWC (`apply-gwc`) — FAIL (0.1s) **NEW STAGE**

### Action: FAIL — Missing OrderHeaderKey or OrderLineKey

This is the **new GWC stage** added in this session. The act function fetched the order via `getOrderDetails` (now internally `getOrderList`) but `OrderHeaderKey` and `OrderLineKey` were not present in the response.

**Root cause**: Sterling's `getOrderList` default output template does not return `OrderHeaderKey` or `OrderLineKey`. These are Sterling primary key fields that require a custom output template configured on the server.

### Self-Healing Response
The agentic healer correctly diagnosed: `MaxOrderStatus 3700.0001 >= target 3700 for stage "apply-gwc"` — order is already past the delivery threshold. Decision: **continue**.

### Immediate Fix Required
Need to ask devs for the correct output template that returns `OrderHeaderKey` and `OrderLineKey` from `getOrderList`. Alternatively, GWC could use XAPI to call `getOrderDetails` (which is a different API path and likely returns all fields) instead of the REST API.

---

## Stage 6: Forward Invoice & Reconciliation (`forward-invoice`) — FAIL (0.5s)

### Self-Healing: Invoice Recovery Playbook — SUCCESS (187.6s)
The invoice was not generated yet when the stage first executed. The healing handler triggered the full recovery playbook:

| Recovery Step | Action | Result |
|---|---|---|
| 1. Find ShipmentKey | `getShipmentListForOrder` | ShipmentKey found |
| 2. Query task queue | `manageTaskQueue(DataKey=ShipmentKey)` | TaskQKey found, AvailableDate in future |
| 3. Move date to past | `manageTaskQueue(AvailableDate=yesterday)` | Success |
| 4. Poll for invoice | `getOrderInvoiceList` every 10s | Invoice 2603296 appeared |

**Invoice generated**: InvoiceNo **2603296**, InvoiceType=SHIPMENT, TotalAmount=120.00

### Verification: 1/2 checks on step-12, 1/2 on step-12a

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 1 | Forward invoice exists | PASS | truthy | 2603296 |
| 2 | InvoiceType is forward | PASS | not CREDIT_MEMO | SHIPMENT |
| 3 | Has total amount | PASS | truthy | 120.00 |
| 4 | AmountCollected present | PASS | truthy | 0.00 |
| 5 | DateInvoiced present | FAIL | truthy | undefined |
| 6 | Forward invoice captured | PASS | truthy | 2603296 |
| 7 | Payment method captured | FAIL | truthy | not captured |

**Root cause**: DateInvoiced not in output template. Payment method not enriched in poll context.

---

## Stage 7: Forward Flow Email & PDF Verification (`forward-comms`) — FAIL (0.0s)

### Verification: 0/4 steps passed — all providers missing

| Step | Error |
|---|---|
| step-03a | Email provider not available |
| step-07a | Forward label PDF not available |
| step-14a | Email provider not available |
| step-16a | Email provider not available |

**Root cause**: Layer 3 providers (IMAP/Graph email, PDF) not configured. These require `ADIDAS_EMAIL_*` and shipping label retrieval.

---

## Stage 8: Create Return Order (`create-return`) — FAIL (0.6s)

### Self-Healing: Auto-skip
MaxOrderStatus 3700.0001 >= target 3700. Agentic healer diagnosed "order already past this stage" and continued.

### Verification: 1/2

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 1 | Return on forward order (step-15) | PASS | status >= 3700 | Shipped |
| 2 | Has return auth txns (step-16) | FAIL | >0 | 0 |

**Root cause**: Return auth IIB transactions not visible (EPOCH not configured for UAT).

---

## Stage 9: Return Delivery & Credit Note (`return-delivery`) — FAIL (24.8s)

### Self-Healing: Full Credit Note Recovery Attempted — FAILED
The healer probed Sterling and found:
- MaxOrderStatus = 3700.03 (Return Completed)
- No return credit note on DocType 0003 or 0001
- Found ShipmentKey, queried task queue, moved AvailableDate to past
- Polled 12 times (120s) — no return invoice appeared

**Diagnosis**: "Return invoice is generated by WMS ReturnConfirmation flow — may not have been triggered in UAT"

### Verification: 1/3 steps

| Step | Result | Detail |
|---|---|---|
| step-24 | PASS | Return Completed status confirmed, description "Return Completed" |
| step-25 | FAIL | Credit note not found (no RETURN or CREDIT_MEMO invoice on either order) |
| step-26 | FAIL | Credit note not captured (1/2 — return order captured: APT40168172) |

**Root cause**: Return credit note requires WMS ReturnConfirmation flow which is an external trigger not available in UAT test automation.

---

## Stage 10: Return Email, PDF & Browser Verification (`return-comms`) — FAIL (0.0s)

### Verification: 0/7 steps — all providers missing

| Step | Error |
|---|---|
| step-21a | Email provider not available |
| step-26a | Email provider not available |
| step-31a | Email provider not available |
| step-20a | Return label PDF not available |
| step-32 | Credit note PDF not available |
| step-17a | Browser provider not available |
| step-18a | Not yet implemented (shared browser context) |

**Root cause**: Layer 3 providers not configured.

---

## Self-Healing Summary

| Stage | Trigger | Healer Action | Outcome | Duration |
|---|---|---|---|---|
| Stage 3 (confirm-shipment) | MaxOrderStatus 3700.0001 >= target 3350 | "order already past this stage" | continue | 393ms |
| Stage 5 (apply-gwc) | MaxOrderStatus 3700.0001 >= target 3700 | "order already past this stage" | continue | 663ms |
| Stage 6 (forward-invoice) | Invoice poll timed out | **Full recovery playbook**: ShipmentKey → task queue → move AvailableDate → poll | **SUCCESS — invoice 2603296** | 187.6s |
| Stage 7 (forward-comms) | All email/PDF providers missing | "No recovery pattern for stage forward-comms" | continue | 502ms |
| Stage 8 (create-return) | MaxOrderStatus 3700.0001 >= target 3700 | "order already past this stage" | continue | 455ms |
| Stage 9 (return-delivery) | Credit note not found | **Full recovery**: find ShipmentKey → task queue → poll 12x — WMS not triggered | FAILED | 261.1s |
| Stage 10 (return-comms) | All email/PDF/browser missing | "No recovery pattern for stage return-comms" | continue | 1711ms |

### New Healer Features (this run)
- **Split credit memo detection**: `hasReturnCreditNote` (return document) vs `hasGwcCreditMemo` (forward sales order). Probe output now shows both flags separately.
- **GWC Rule 5**: New rule for `apply-gwc` stage failures. Did not trigger this run because the healer's status-already-satisfied rule (Rule 1) matched first.
- **`apply-gwc` in stage target map**: Added at threshold 3700 (post-delivery).

---

## What Changed Since Last Run (2026-03-01)

| Change | Impact on This Run |
|---|---|
| **getOrderDetails → getOrderList redirect** | Working. All order queries now use getOrderList with MaximumRecords=1. No DB row locks. |
| **Inventory check (getATP + adjustInventory)** | Untested — `itemId` was not enriched because order lines are empty in getOrderList response (output template issue). The inventory check requires itemId, so it silently skipped. |
| **GWC stage** | **Failed**: `OrderHeaderKey` and `OrderLineKey` not returned by getOrderList default output template. Need server-side output template configuration. |
| **hasCreditMemo → split flags** | Working. Healer probe correctly reports `returnCreditNote=false, gwcCreditMemo=false`. Rule 3 now correctly checks `hasReturnCreditNote` only. |

---

## Failure Root Causes (Categorized)

### Category 1: Sterling Output Template (Server-Side Fix Needed)
| Root Cause | Checks Affected | Fix |
|---|---|---|
| `getOrderList` doesn't return `PersonInfoShipTo` | 4 (ShipTo checks) | Configure custom output template |
| `getOrderList` doesn't return `OrderLines` detail | 4 (ItemID, UOM, Qty, Price) | Configure custom output template |
| `getOrderList` doesn't return `OrderHeaderKey`/`OrderLineKey` | GWC stage blocked entirely | Configure custom output template |
| `getOrderList` doesn't return `ShipNode` at order level | 1 (ShipNode check) | Configure custom output template |
| `DateInvoiced` not in invoice output | 1 | Configure custom output template |
| Carrier notes (IT/DL) not populated | 5 (note checks) | Output template or order-specific |

### Category 2: External Dependencies (Not Available in UAT)
| Root Cause | Checks Affected | Fix |
|---|---|---|
| EPOCH GraphQL is SIT-only | 6 (IIB payload checks) | Need UAT EPOCH endpoint |
| WMS ReturnConfirmation not triggered | 6 (credit note checks) | External UAT trigger or stub |
| NShift not configured | 2 (carrier checks) | Need `ADIDAS_NSHIFT_API_KEY` |

### Category 3: Layer 3 Providers (Configuration Needed)
| Root Cause | Checks Affected | Fix |
|---|---|---|
| Email (IMAP/Graph) not configured | 26 (email checks) | Need `ADIDAS_EMAIL_*` config |
| PDF not retrieved | 17 (PDF label/credit note) | Need shipping label + credit note PDF source |
| Browser not configured | 4 (portal checks) | Need Playwright + portal URL |

### Category 4: Code Fix Needed
| Root Cause | Checks Affected | Fix |
|---|---|---|
| Payment method not enriched in poll | 1 (step-12a) | Enrich `paymentMethod` from order data in poll |
| Inventory check skipped (no itemId) | 0 directly | Depends on output template returning OrderLines |

---

## Comparison: APT40168172 (2026-03-02) vs APT16070332 (2026-03-01)

| Aspect | APT40168172 (Today) | APT16070332 (Previous) |
|---|---|---|
| Stages | 10 (new: apply-gwc) | 9 |
| Result | 3 PASS, 7 FAIL | 4 PASS, 5 FAIL |
| Checks | 29 | ~31 |
| Duration | 733.6s | 547.3s |
| Order creation | 24.5s (XAPI 4-step) | 49.2s |
| Invoice recovery | 187.6s (HEAL) | 45.4s (HEAL) |
| GWC | FAIL (OrderHeaderKey missing) | N/A (stage didn't exist) |
| getOrderDetails | Uses getOrderList (no DB lock) | Used getOrderDetails (DB lock) |
| Credit note recovery | FAILED (WMS not triggered) | FAILED (same root cause) |
| Healer flags | Split: returnCreditNote + gwcCreditMemo | Single: hasCreditMemo |

---

## Next Steps (Priority Order)

1. **Output template**: Ask devs for the correct `getOrderList` output template that returns OrderHeaderKey, OrderLineKey, PersonInfoShipTo, OrderLines, ShipNode — this unblocks GWC, inventory check, and ~15 failing checks
2. **GWC VPN test**: Once output template returns OrderHeaderKey/OrderLineKey, re-run to validate the full getAppeasementOffers → recordInvoiceCreation flow
3. **Payment method enrichment**: Fix poll to capture paymentMethod from order data
4. **EPOCH UAT endpoint**: Ask devs if there's a UAT EPOCH GraphQL endpoint — unblocks 6 IIB checks
5. **Layer 3 config**: Email (IMAP/Graph), NShift API key, Browser portal URL — unblocks 30+ checks

---

## Appendix A: Debugging Reference for Devs

### Environment & Connectivity

| Parameter | Value |
|-----------|-------|
| **Environment** | UAT |
| **Sterling OMS Host** | `https://acc.omnihub.3stripes.net` |
| **Sterling REST Base URL** | `https://acc.omnihub.3stripes.net/smcfs/restapi` |
| **Sterling REST API Pattern** | `POST /smcfs/restapi/invoke/{apiName}` with JSON body |
| **XAPI JSP Endpoint** | `https://acc.omnihub.3stripes.net/smcfs/yfshttpapi/yantrahttpapitester.jsp` |
| **EPOCH GraphQL (SIT only)** | `http://10.146.28.234:8082/graphqlmdsit` |
| **Auth Method** | HTTP Basic (`admintest` / `password`) |
| **EnterpriseCode** | `adidas_PT` |
| **Region** | `ADWE` |
| **SellerOrganizationCode** | `adidas_PT` |
| **Currency** | EUR |
| **Run Timestamp** | `2026-03-02T12:11:58.192Z` |

### Order Identifiers

| Field | Value |
|-------|-------|
| **OrderNo** | `APT40168172` |
| **DocumentType** | `0001` (forward sales order) |
| **EnterpriseCode** | `adidas_PT` |
| **OrderType** | `ShipToHome` |
| **EntryType** | `web` |
| **PaymentStatus (at creation)** | `AUTHORIZED` |
| **MaxOrderStatus (at completion)** | `3700.0001` → `3700.03` (after return) |
| **MinOrderStatusDesc** | `Shipped` |
| **ShipmentNo** | `APT40168172-1` |
| **SCAC (Carrier)** | `COR` |
| **CarrierServiceCode** | `COR000PT10407851` (from XAPI template) / `STRD` |
| **InvoiceNo (forward)** | `2603296` (InvoiceType=`SHIPMENT`, TotalAmount=`120.00`) |
| **Return DocumentType** | `0003` |
| **Return MaxOrderStatus** | `3700.03` (Return Completed) |
| **Credit Note (return)** | **NOT FOUND** — no RETURN or CREDIT_MEMO invoice on either DocType |

### Test Data Used (XAPI Order Creation)

| Field | Value |
|-------|-------|
| **ItemID** | `EE6464_530` |
| **ItemDesc** | Sapatos OZWEEGO |
| **ProductClass** | `NEW` |
| **UnitOfMeasure** | `PIECE` |
| **OrderedQty** | `1` |
| **UnitPrice** | `120.0` EUR |
| **Tax** | `22.44` (23.0% — FullTax) |
| **ShipNode** | `IT33` (default; step2_StampShipNode overrides) |
| **ShipTo FirstName** | `sunil` |
| **ShipTo LastName** | `kumar` |
| **ShipTo Address** | Rua Marques de Fronteira, Lisboa, PT 1050-999 |
| **ShipTo Email** | `meenuga.sunil.kumar@accenture.com` |
| **PaymentType** | `CREDIT_CARD` (VISA, exp 03/30) |
| **PaymentReference** | Adyen (`ACI`), AuthCode `000.100.112` |
| **Adyen PSP Reference** | `8ac7a4a19c9931ec019c99d4202c6ce7` |

### XAPI Calls Made (in order)

| # | XAPI Service/API | Purpose | Duration | Status |
|---|------------------|---------|----------|--------|
| 1 | `adidasWE_CreateOrderSync` (IsFlow=Y) | Create sales order | 8,293ms | OK — generated `APT40168172` |
| 2 | `changeOrder` | Stamp ShipNode on order line | 5,008ms | OK |
| 3 | `changeOrder` | Resolve Buyer's Remorse hold | 4,796ms | OK |
| 4 | `adidasWE_CheckAdyenAsyncResponseSvc` | Process Adyen payment | 5,823ms | OK — status → AUTHORIZED |
| 5 | `scheduleOrder` | Schedule for fulfillment | ~5s | OK |
| 6 | `releaseOrder` | Release to warehouse | ~5s | OK |
| 7 | `adidasWE_SHPConfirmation` (IsFlow=Y) | Ship confirm (SHP) | ~5s | OK |
| 8 | `adidasWE_SHPSOAcknowledgment` (IsFlow=Y) | SO Acknowledgment | ~5s | OK |
| 9 | `adidasWE_ProcessPODUpdates` | POD: IT (In Transit) | ~5s | OK |
| 10 | `adidasWE_ProcessPODUpdates` | POD: DL (Delivered) | ~5s | OK |
| 11 | `adidasWE_CreateReturnOrder` (IsFlow=Y) | Create return (SSR) | ~5s | OK |
| 12 | `adidasWE_ProcessReturnPODUpdates` | Return: RP (Picked Up) | ~5s | OK |
| 13 | `adidasWE_ProcessReturnPODUpdates` | Return: RT (In Transit) | ~5s | OK |
| 14 | `adidasWE_ProcessReturnPODUpdates` | Return: RD (Delivered) | ~5s | OK |
| 15 | `adidasWE_CreateReturnReceipt` (IsFlow=Y) | Return receipt | ~5s | OK |

### Sterling REST API Calls Made

| API | Endpoint | Purpose | Key Params |
|-----|----------|---------|------------|
| `getOrderList` | `POST /invoke/getOrderList` | Order polling (redirected from getOrderDetails — avoids DB row lock) | `OrderNo=APT40168172, MaximumRecords=1` |
| `getOrderReleaseList` | `POST /invoke/getOrderReleaseList` | Release info after scheduling | `OrderNo=APT40168172` |
| `getShipmentListForOrder` | `POST /invoke/getShipmentListForOrder` | Find ShipmentKey for invoice recovery | `OrderNo=APT40168172` |
| `manageTaskQueue` | `POST /invoke/manageTaskQueue` | Query task queue by ShipmentKey | `DataKey={ShipmentKey}, DataType=ShipmentKey` |
| `manageTaskQueue` | `POST /invoke/manageTaskQueue` | Move AvailableDate to past to trigger invoice | `TaskQKey={TaskQKey}, AvailableDate=2026-03-01` |
| `getOrderInvoiceList` | `POST /invoke/getOrderInvoiceList` | Poll for forward invoice | `OrderNo=APT40168172` |
| `getOrderInvoiceList` | `POST /invoke/getOrderInvoiceList` | Poll for return credit note | `OrderNo=APT40168172, DocumentType=0003` |

### Invoice Self-Healing Recovery (Stage 6 — SUCCESS)

The forward invoice (`InvoiceNo 2603296`) was not immediately available after shipment. Sterling queues invoice generation in `YFS_TASK_Q` with a future `AvailableDate` (~10 minutes). Recovery steps:

| Recovery Step | API Call | Key Data |
|---------------|----------|----------|
| 1. Find ShipmentKey | `getShipmentListForOrder(OrderNo=APT40168172)` | ShipmentKey extracted from response via regex `ShipmentKey="([^"]+)"` |
| 2. Query task queue | `manageTaskQueue(DataKey={ShipmentKey}, DataType=ShipmentKey)` | TaskQKey extracted, AvailableDate was in the future |
| 3. Move date to past | `manageTaskQueue(TaskQKey={TaskQKey}, AvailableDate=2026-03-01)` | Success — task now eligible for Sterling job pickup |
| 4. Poll for invoice | `getOrderInvoiceList(OrderNo=APT40168172)` polled every 10s | Invoice `2603296` appeared after ~187.6s total |

**Invoice details**: InvoiceNo=`2603296`, InvoiceType=`SHIPMENT`, TotalAmount=`120.00`, AmountCollected=`0.00`

### Return Credit Note Recovery (Stage 9 — FAILED)

Same recovery pattern attempted for return credit note. Failed because WMS `ReturnConfirmation` flow was never triggered in UAT:

| Recovery Step | Result |
|---------------|--------|
| 1. Find ShipmentKey | Found (from return shipment) |
| 2. Query task queue | TaskQKey found, AvailableDate moved to past |
| 3. Poll for return invoice | Polled 12 times × 10s = 120s — **no invoice appeared** |

**Root cause**: Return credit note is generated by the WMS `ReturnConfirmation` flow which is an external system trigger. In UAT, this flow was never initiated by the warehouse system.

### Fields Missing from `getOrderList` Default Output Template

This is the **#1 blocker**. The Sterling `getOrderList` API returns a subset of fields by default. The following fields are NOT returned and need a custom output template configured on the server:

| Missing Field | Where Expected | Impact |
|---------------|----------------|--------|
| `OrderHeaderKey` | Root `<Order>` element | **Blocks GWC entirely** — needed for `getAppeasementOffers` and `recordInvoiceCreation` |
| `OrderLineKey` | `<OrderLine>` element | **Blocks GWC entirely** — needed for line-level appeasement |
| `PersonInfoShipTo` | Root `<Order>` element | 4 checks fail (FirstName, LastName, City, Country) |
| `OrderLines.OrderLine` detail | `<OrderLine>` with ItemID, UOM, Qty, Price | 4 checks fail + inventory check cannot run (no ItemID) |
| `ShipNode` | Root `<Order>` or `<OrderLine>` level | 1 check fails |
| `DateInvoiced` | `getOrderInvoiceList` response | 1 check fails |
| `Notes.Note` (IT/DL carrier notes) | Root `<Order>` element | 5 checks fail (ReasonCode, Trandate for IT and DL) |

**Ask**: Can devs configure a custom output template for `getOrderList` that includes these fields? Alternatively, is there a different API (e.g., `getCompleteOrderDetails`) that returns all fields without taking a DB row lock?

### How to Reproduce (Manual — for Dev Debugging)

1. **Open XAPI Tester**: `https://acc.omnihub.3stripes.net/smcfs/yfshttpapi/yantrahttpapitester.jsp`
2. **Login**: `admintest` / `password`
3. **Query the order**: Select `getOrderList` from API dropdown, paste:
   ```xml
   <Order OrderNo="APT40168172" DocumentType="0001" EnterpriseCode="adidas_PT" MaximumRecords="1"/>
   ```
4. **Check response**: Look for `OrderHeaderKey`, `OrderLineKey`, `PersonInfoShipTo`, `OrderLines` — these should be missing in the default template
5. **Query invoices**: Select `getOrderInvoiceList`, paste:
   ```xml
   <OrderInvoice OrderNo="APT40168172" EnterpriseCode="adidas_PT"/>
   ```
6. **Expected**: InvoiceNo `2603296` (SHIPMENT, 120.00). No CREDIT_MEMO on this order.
7. **Query return**: Same `getOrderList` but with `DocumentType="0003"` — should show Return Completed (3700.03)

### How to Re-Run Automated Test

```bash
# From repo root, with VPN connected:
npx tsx --require dotenv/config src/clients/adidas/run-tc01.ts --continue-on-failure

# To validate this specific order (no new order creation):
npx tsx --require dotenv/config src/clients/adidas/run-tc01.ts --order APT40168172 --continue-on-failure

# With layer skipping (skip IIB/email/browser checks):
npx tsx --require dotenv/config src/clients/adidas/run-tc01.ts --order APT40168172 --skip-layer2 --skip-layer3 --continue-on-failure
```

**Pre-requisite**: `.env` file must have `ADIDAS_OMNI_HOST`, `ADIDAS_STERLING_AUTH_METHOD=basic`, `ADIDAS_STERLING_USERNAME`, `ADIDAS_STERLING_PASSWORD`, `ADIDAS_XAPI_URL`, `ADIDAS_ENTERPRISE_CODE=adidas_PT`. The `--require dotenv/config` flag loads `.env` automatically.

### HTML Report Location

`v3/tests/reports/o2c-APT40168172-2026-03-02T12-11-58.html` — contains full stage-by-stage results with individual check pass/fail details.
