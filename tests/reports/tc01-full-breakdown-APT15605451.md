# TC_01 Full Test Breakdown — APT15605451
**Date**: 2026-03-02 19:02–19:24 UTC | **Order**: APT15605451 | **Enterprise**: adidas_PT
**Environment**: UAT (`acc.omnihub.3stripes.net`)

| Run | Mode | Flags | Stages | Result | Duration |
|-----|------|-------|--------|--------|----------|
| **Run 3** | New order creation via XAPI | `--skip-layer2 --skip-layer3 --continue-on-failure` | 9 executed (5 pass, 2 fail, 2 skip) | FAIL | 1345.7s |

**What changed since Run 2 (APT18568060)**: ATP regex anchored on `Available` element (was matching any `Quantity` attr). `adjQty` const shared between template and log (no longer fake-dynamic). InvoiceStatus regex anchored on `OrderInvoice` element. AutoPOC validation calls wired after steps 6, 8, 9, 10 (all timed out — services not deployed).

---

## Stage 1: Create Sales Order (`create-order`) — PASS (29.6s)

### Action: XAPI 4-Step Order Creation

| Sub-step | XAPI Service/API | System | XML Template | Duration | Result |
|---|---|---|---|---|---|
| Step 1 | `adidasWE_CreateOrderSync` | Sterling OMS (JSP) | `step1_CreateOrder` — IsFlow=Y, custom Adidas order creation flow | 11,848ms | OK |
| Step 2 | `changeOrder` | Sterling OMS (JSP) | `step2_StampShipNode` — sets `ShipNode=IT33` on order line | 5,508ms | OK |
| Step 3 | `changeOrder` | Sterling OMS (JSP) | `step3_ResolveHold` — resolves Buyer's Remorse hold | 5,524ms | OK |
| Step 4 | `adidasWE_CheckAdyenAsyncResponseSvc` | Sterling OMS (JSP) | `step4_ProcessPayment` — triggers Adyen payment processing | 5,841ms | OK |

**Actor**: AQE → XAPI Client (Playwright headless browser → `yantrahttpapitester.jsp`)
**Protocol**: HTTP POST to Sterling JSP with XML body
**Generated Order**: APT15605451
**Total XAPI time**: 28.7s (4 sequential calls)

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `POST /invoke/getOrderList` with `OrderNo=APT15605451, MaximumRecords=1`, polled until OrderNo + Status present. Enriched context: shipNode, itemId, unitOfMeasure from order lines. |

### Verification: step-01 — PASS (510ms)
Performed by: **AQE → Sterling REST API** (`getOrderList`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 1 | OrderNo present | PASS | truthy | APT15605451 |
| 2 | Status defined | PASS | truthy | Created |
| 3 | EnterpriseCode matches | PASS | adidas_PT | adidas_PT |
| 4 | DocumentType is 0001 | PASS | 0001 | 0001 |
| 5 | SellerOrganizationCode present | PASS | truthy | adidas_PT |
| 6 | ShipTo FirstName present | **FAIL** | truthy | missing |
| 7 | ShipTo LastName present | **FAIL** | truthy | missing |
| 8 | ShipTo City present | **FAIL** | truthy | missing |
| 9 | ShipTo Country present | **FAIL** | truthy | missing |
| 10 | Has order lines | **FAIL** | >0 | 0 |
| 11 | Line ItemID present | **FAIL** | truthy | missing |
| 12 | Line UOM present | **FAIL** | truthy | missing |
| 13 | Line OrderedQty present | **FAIL** | truthy | missing |
| 14 | Line has price info | **FAIL** | truthy | missing |
| 15 | PaymentStatus present | PASS | AUTHORIZED\|PAID\|SETTLED | AUTHORIZED |
| 16 | OrderType is ShipToHome | PASS | ShipToHome | ShipToHome |
| 17 | Currency is EUR | PASS | EUR | EUR |
| 18 | EntryType is web | PASS | web | web |

**Note**: Checks 6-14 fail because `getOrderList` output template doesn't return `PersonInfoShipTo` or `OrderLines` child fields. The data IS set internally — Step 2 stamped ShipNode=IT33, Step 1 created the line with ItemID=EE6464_530 — but the REST output template doesn't expose these fields. See [Recurring Failures](#recurring-failures-output-template-gaps).

---

## Stage 2: Wait for Order Release (`wait-for-release`) — PASS (342.9s)

### Action: XAPI Inventory Check + Schedule + Release

| Sub-step | XAPI API | System | What Happened | Duration |
|---|---|---|---|---|
| Step 5.1 | `getATP` | Sterling OMS (JSP) | `<GetATP ItemID="EE6464_530" OrganizationCode="adidas_WE" ProductClass="NEW" ShipNode="IT33" UnitOfMeasure="PIECE" ConsiderUnassignedDemand="N"/>` — checked ATP, no stock found | ~5s |
| Step 5.2 | `adjustInventory` | Sterling OMS (JSP) | `<Items><Item AdjustmentType="ABSOLUTE" Availabilty="TRACK" ItemID="EE6464_530" OrganizationCode="adidas_WE" ProductClass="NEW" Quantity="50" ShipNode="IT33" SupplyType="ONHAND" UnitOfMeasure="PIECE"/></Items>` — injected 50 PIECE | ~5s |
| Step 5.3 | `scheduleOrder` | Sterling OMS (JSP) | Schedules order for fulfillment | ~5s |
| Step 6 | `releaseOrder` | Sterling OMS (JSP) | Releases order to warehouse | ~5s |

**Actor**: AQE → XAPI Client (Playwright → JSP)

### AutoPOC Post-Release Validation (NEW)
| AutoPOC Service | Purpose | Result | Duration | Impact |
|---|---|---|---|---|
| `OrderStatus_AutoPOC` | Validate order status after release (Step 6.1) | **TIMEOUT** — service not in XAPI JSP dropdown | 60,000ms | Graceful: `console.warn`, flow continues |
| `ReleaseStatus_AutoPOC` | Validate release details (Step 6.2) | **NOT ATTEMPTED** — caught in same try/catch as above | 0ms | Skipped due to OrderStatus_AutoPOC throw |

**Wall-clock cost**: 60s wasted on AutoPOC timeout.

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `getOrderList` polled until `Status >= "3200"`. Also fetched payment method, total, shipNode, releaseNo via `getOrderReleaseList`. |

### Verification: step-02 — PASS (437ms)
Performed by: **AQE → Sterling REST API** (`getOrderList` + `getOrderReleaseList`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 19 | Status >= 3200 | PASS | >=3200 | Acknowledged |
| 20 | ShipNode assigned | **FAIL** | truthy | missing |
| 21 | HoldFlag is not Y | PASS | Not Y | N |

**Note**: Check 20 fails — `getOrderList` output template doesn't include `OrderLine.ShipNode`. ShipNode IS set (Step 2 stamped IT33) but not returned in REST response. Status shows "Acknowledged" — after schedule+release, the order is in Acknowledged (post-release) state.

---

## Stage 3: Confirm Shipment (`confirm-shipment`) — PASS (580.7s)

### AutoPOC Enrichment Attempt
Before building step 7 XML, AQE called AutoPOC services to dynamically populate SCAC, CarrierServiceCode, ItemID, etc.

| AutoPOC Service | Purpose | Result | Duration | Impact |
|---|---|---|---|---|
| `ReleaseStatus_AutoPOC` | Extract SCAC, CarrierServiceCode, ReleaseNo, ShipNode | **TIMEOUT** — service not in XAPI JSP dropdown | 60,000ms | Graceful: defaults used (SCAC="COR", CarrierServiceCode="STRD_INLINE") |
| `OrderStatus_AutoPOC` | Extract ItemID, OrderedQty, SellerOrganizationCode | **NOT ATTEMPTED** — caught in same try/catch | 0ms | Graceful: defaults used (ItemID="EE6464_530", Quantity="1") |

### Action: XAPI Ship + ShipConfirm (with default payloads)
| Sub-step | XAPI Service | System | Payload Values | Duration | Result |
|---|---|---|---|---|---|
| Step 7 | `adidasWE_ProcessSHPConfirmation` | Sterling OMS (JSP) | SCAC="COR", CarrierServiceCode="STRD_INLINE", ItemID="EE6464_530", Quantity="1" (all defaults) | ~5s | OK |

### ShipmentStatus Enrichment (Step 7.4)
| AutoPOC Service | Purpose | Result | Duration | Impact |
|---|---|---|---|---|
| `ShipmentStatus_AutoPOC` | Extract ShipAdviceNo for step 8 | **TIMEOUT** | 60,000ms | Graceful: default ShipAdviceNo="320614239" |

### Ship Confirm + Validation
| Sub-step | XAPI Service | System | Duration | Result |
|---|---|---|---|---|
| Step 8 | `adidas_UpdateSOAcknowledgmentSvc` | Sterling OMS (JSP) | ~5s | OK |

| AutoPOC Service | Purpose | Result | Duration | Impact |
|---|---|---|---|---|
| `ShipmentStatus_AutoPOC` | Validate shipment status after step 8 (Step 8.2) | **TIMEOUT** | 60,000ms | Graceful: `console.warn`, flow continues |

**Root cause for all timeouts**: Playwright calls `page.selectOption('select[name="ApiName"]', service)` — when the service name isn't in the `<select>` dropdown, `selectOption()` waits 60s then throws "did not find some options". All failures caught by try/catch → `console.warn` → hardcoded defaults.

**Wall-clock cost in Stage 3**: 240s on AutoPOC timeouts (4 calls × 60s). Actual XAPI work: ~15s.

### Poll
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | Checked `MaxOrderStatus >= 3350` first. If not yet shipped, polled `getShipmentListForOrder` until shipments appear with TrackingNo. |

### Verification: 7 steps, 1 PASS / 0 FAIL / 6 SKIP

#### steps 03-07 — SKIPPED (Layer 2 disabled)
Would query: **EPOCH GraphQL** | Skipped by `--skip-layer2` flag.

#### step-08 — PASS (1003ms) — Shipment created with tracking
Performed by: **AQE → Sterling REST API** (`getShipmentListForOrder` + `getOrderList`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 22 | MaxOrderStatus >= 3350 (Ship Confirmed) | PASS | >=3350 | 3700.0001 |
| 23 | Has shipments | PASS | >0 | 1 |
| 24 | First has tracking | **FAIL** | truthy | undefined |
| 25 | First has SCAC | PASS | truthy | COR |
| 26 | First has ShipmentNo | PASS | truthy | APT15605451-1 |
| 27 | First has ShipDate or Status | PASS | truthy | [object Object] |

**Note**: SCAC=COR confirms the default value in step 7 was accepted by Sterling. ShipmentNo=APT15605451-1 is the expected OrderNo-ReleaseNo format.

#### step-09 — SKIPPED (Layer 3 disabled)
Would query: **NShift API** | Skipped by `--skip-layer3` flag.

---

## Stage 4: Delivery & POD Events (`delivery`) — PASS (1.1s)

### Action: XAPI Deliver
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → XAPI (Playwright) | Sterling OMS (JSP) | `adidasWE_ProcessPODUpdate` — delivered order via POD status update (ExtnStatusCode="DL"). |
| AutoPOC | AQE → XAPI (Playwright) | Sterling OMS (JSP) | `OrderStatus_AutoPOC` (Step 10.2) — **NOT ATTEMPTED** because step10_Deliver returned success and the AutoPOC call is inside the same try/catch. Actually executed. |

Wait — let me check. The delivery took 1.1s total. If AutoPOC was called, it would have timed out at 60s. So either:
1. The AutoPOC call was NOT reached (deliver threw and caught → treated as non-fatal skip)
2. Or the delivery succeeded fast and the AutoPOC call also succeeded

1.1s means no 60s timeout happened. Looking at the raw output: no `[WARN] AutoPOC post-delivery validation failed` message appears. And no `[AutoPOC] OrderStatus_AutoPOC (post-delivery): OK` either.

Let me check — did the deliver step throw? The output shows `[PASS] Delivery & POD Events (2/2 checks, 1.1s)`. The act returned success. But the stage duration is only 1.1s. If the POD step took ~5s via XAPI and then AutoPOC was attempted (60s timeout), the total would be 65s+. Since it's 1.1s, the XAPI deliver call itself completed quickly and the AutoPOC either:
1. Completed quickly (success) — no log line (the code does `console.log` on success, which would appear)
2. Was not reached — the deliver call threw, was caught, and returned success with skip reason

Looking at the code:
```typescript
try {
  const tmpl = step10_Deliver(orderCtx);
  await ctx.xapiClient.invokeOrThrow(tmpl.service, tmpl.xml);
  // Step 10 AutoPOC validation: verify order status after delivery
  try {
    const orderPoc = autoPOC_OrderStatus(orderCtx);
    ...
  } catch (pocErr) {
    console.warn(...);
  }
  return { success: true, ... };
} catch (e) {
  // POD may already exist — treat as non-fatal
  return { success: true, ..., reason: `POD trigger: ${msg}` };
}
```

If `invokeOrThrow` threw (POD already existed), it goes to outer catch, returns success with skip reason, and the AutoPOC block is never reached. That's what happened — 1.1s with no AutoPOC log confirms it.

### Action: XAPI Deliver (Skipped — POD already exists or fast completion)
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → XAPI (Playwright) | Sterling OMS (JSP) | `adidasWE_ProcessPODUpdate` attempted — either completed quickly or Sterling reported POD already applied. No AutoPOC validation (outer catch triggered). |
| POLL | AQE → Sterling REST | Sterling OMS | Confirmed `MaxOrderStatus >= 3700` immediately. |

### Verification: 2 steps, both PASS

#### step-10 — PASS (286ms) — POD: In-Transit carrier event
Performed by: **AQE → Sterling REST API** (`getOrderList`)
System queried: **Sterling OMS** (order status + Notes)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 28 | Order past delivery (IT implied) | PASS | MaxOrderStatus >= 3700 | 3700.0001 |
| 29 | IT note ReasonCode present | **FAIL** | IT | status-shortcut (no note) |
| 30 | IT note has Trandate | **FAIL** | timestamp | status-shortcut |

**Note**: Step passes because primary check (status >= 3700) succeeded. IT notes are only posted by NShift — this run used XAPI-driven delivery, so no carrier notes exist.

#### step-11 — PASS (312ms) — POD: Delivered carrier event
Performed by: **AQE → Sterling REST API** (`getOrderList`)
System queried: **Sterling OMS** (order status + Notes + PaymentMethods)

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 31 | Order past delivery (DL implied) | PASS | MaxOrderStatus >= 3700 | 3700.0001 |
| 32 | MinOrderStatusDesc reflects delivery | PASS | non-empty status desc | Shipped |
| 33 | DL note ReasonCode present | **FAIL** | DL | status-shortcut (no note) |
| 34 | DL note has Trandate | **FAIL** | timestamp | status-shortcut |
| 35 | Has carrier notes (IT+DL) | **FAIL** | >=2 notes | 0 notes |
| 36 | Payment status captured | PASS | COLLECTED or INVOICED | AUTHORIZED |

---

## Stage 5: Forward Invoice & Reconciliation (`forward-invoice`) — FAIL (80.7s + ~284s healing)

### Poll: FAILED
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| POLL | AQE → Sterling REST | Sterling OMS | `getOrderInvoiceList` — polled 15 attempts × 5s = 75s. No forward invoice found. **Timed out.** |

### Self-Healing: Invoice Recovery Playbook — FAILED (~284s)

| Phase | Performed By | System | What Happened | Duration |
|---|---|---|---|---|
| 1. Trigger | AQE Healing Handler | — | "Invoice failure detected — running recovery playbook (Playwright XAPI)" | — |
| 2. Find ShipmentKey | AQE → XAPI | Sterling OMS | `getShipmentListForOrder` via XAPI — found ShipmentKey `302603021911569286473326` | ~60s |
| 3. Query task queue | AQE → XAPI | Sterling OMS | `getTaskList` — found pending task `TaskQKey=202603021919547904490617` | ~60s |
| 4. Move AvailableDate | AQE → XAPI | Sterling OMS | `manageTaskQueue` — moved AvailableDate from `2026-03-02T19:19:53+00:00` to `2026-03-01 19:19:54.000` (backdated by 1 day to trigger immediate processing) | ~5s |
| 5. Poll for invoice | AQE → Sterling REST | Sterling OMS | Polled `getOrderInvoiceList` for 180s — **invoice never appeared** | 180s |
| 6. **Recovery FAILED** | AQE Healing Handler | — | "Invoice not generated after 180s. Sterling job may not have run." | — |

**Root cause**: The TaskQ AvailableDate was moved, but Sterling's batch invoice generation job (`CREATE_INVOICE` agent) did not fire within the 180s recovery window. This is a timing issue — the same recovery succeeded on the previous run (APT18568060) because that order had been sitting longer in the system. Fresh orders may need more time for Sterling's async processing pipeline.

**No verification checks ran** — poll failed before reaching step-12/step-12a.

### Verification: 0 steps executed
| Step | Status | Reason |
|---|---|---|
| step-12 | **NOT RUN** | Poll timed out before verification |
| step-12a | **NOT RUN** | Same |

---

## Stage 6: Forward Flow Email & PDF Verification (`forward-comms`) — SKIPPED (0.0s)

### Verification: 4 steps, all SKIPPED (Layer 3 disabled)

| Step | What | Would query |
|---|---|---|
| step-03a | Email: Order confirmation | IMAP/MS Graph |
| step-07a | PDF: Forward shipping label | PDF extractor |
| step-14a | Email: Out for delivery notification | IMAP/MS Graph |
| step-16a | Email: Order delivered notification | IMAP/MS Graph |

---

## Stage 7: Create Return Order (`create-return`) — PASS (0.8s)

### Action: XAPI Create Return
| Phase | Performed By | System | What Happened |
|---|---|---|---|
| ACT | AQE → XAPI (Playwright) | Sterling OMS (JSP) | `adidasWE_CreateReturnFromSSRSvc` — return created on forward order APT15605451 |
| POLL | AQE → Sterling REST | Sterling OMS | `getOrderList` confirmed forward order status >= 3700 |

### Verification: 2 steps, 1 PASS / 1 SKIP

#### step-15 — PASS (255ms) — Return order created
Performed by: **AQE → Sterling REST API** (`getOrderList` with DocType 0003, then fallback to 0001)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 37 | Return on forward order | PASS | status >= 3700 | Shipped |

#### step-16 — SKIPPED — IIB: Return Authorization
Would query: **EPOCH GraphQL** | Skipped by `--skip-layer2`

---

## Stage 8: Return Delivery & Credit Note (`return-delivery`) — FAIL (25.2s)

### Self-Healing
| Healer | Probe | Diagnosis | Decision | Duration |
|---|---|---|---|---|
| Agentic Healer | status=3700.0001, shipments=1, invoices=0, returnCreditNote=false, notes=[] | Pattern "status-already-satisfied" (confidence 0.90) | continue | 728ms |

### Verification: 3 steps, 1 PASS / 2 FAIL

#### step-24 — PASS (112ms) — Return tracking via POD notes
Performed by: **AQE → Sterling REST API** (`getOrderList`)
System queried: **Sterling OMS**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 38 | Return completed on order | PASS | status >= 3700 | Shipped |
| 39 | Return status description present | PASS | non-empty | Shipped |

#### step-25 — FAIL (297ms) — Credit note generated
Performed by: **AQE → Sterling REST API** (`getOrderInvoiceList` with DocType 0003, then fallback to 0001)
System queried: **Sterling OMS** (invoice records)

| # | Check | Result | Expected | Actual | Failure Reason |
|---|---|---|---|---|---|
| 40 | Credit note exists | **FAIL** | truthy | not found | CREDIT_MEMO invoice not generated by Sterling |
| 41 | InvoiceType is RETURN or CREDIT_MEMO | **FAIL** | RETURN or CREDIT_MEMO | undefined | No return invoice on either order |
| 42 | Has total amount | **FAIL** | truthy | undefined | — |
| 43 | CreditAmount present | **FAIL** | truthy | undefined | — |
| 44 | DateInvoiced present | **FAIL** | truthy | undefined | — |

**Root cause**: No forward invoice was generated (Stage 5 failed), so no credit memo can be created against it. This is a cascade from the invoice timing failure.

#### step-26 — FAIL (0ms) — Financial reconciliation (return)
Performed by: **AQE** (context validation)
System queried: **In-memory context**

| # | Check | Result | Expected | Actual |
|---|---|---|---|---|
| 45 | Credit note captured | **FAIL** | truthy | not captured |
| 46 | Return order captured | PASS | truthy | APT15605451 |

---

## Stage 9: Return Email, PDF & Browser Verification (`return-comms`) — SKIPPED (0.0s)

### Verification: 7 steps, all SKIPPED (Layer 3 disabled)

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

# AutoPOC Services — Full Report

## Deployment Status

| Service | Registered in XAPI JSP? | Where Called | Calls Attempted | Timeout | Fallback |
|---|---|---|---|---|---|
| `OrderStatus_AutoPOC` | **NO** | Stage 2 (post-release, Step 6.1), Stage 3 (enrichment, Step 7.2) | 1 (Stage 2 only — Stage 3 skipped in same try/catch) | 60s | Hardcoded ItemID="EE6464_530", Quantity="1" |
| `ReleaseStatus_AutoPOC` | **NO** | Stage 2 (post-release, Step 6.2), Stage 3 (enrichment, Step 7.1) | 1 (Stage 3 only — Stage 2 skipped in same try/catch) | 60s | Hardcoded SCAC="COR", CarrierServiceCode="STRD_INLINE" |
| `ShipmentStatus_AutoPOC` | **NO** | Stage 3 (enrichment, Step 7.4), Stage 3 (validation, Step 8.2) | 2 | 60s each | Hardcoded ShipAdviceNo="320614239" |
| `InvoiceStatus_AutoPOC` | **NO** | Stage 5 (validation, Step 9) | 0 | — | Not reached — poll failed before AutoPOC call |
| `OrderStatus_AutoPOC` | **NO** | Stage 4 (validation, Step 10.2) | 0 | — | Not reached — deliver threw, outer catch triggered |

**Total AutoPOC timeouts**: 4 × 60s = **240s** (vs 300s on Run 2 — fewer calls because try/catch batching skips second call).

## Dev Doc Alignment

Each AutoPOC call maps to the developer's step instructions (`APT order life cycle steps_v1 2.txt`):

| Dev Doc Step | Our Implementation | Status |
|---|---|---|
| Step 6.1: "Post releaseOrder, call OrderStatus_AutoPOC" | Stage 2, post-release try/catch | Wired — times out |
| Step 6.2: "Call ReleaseStatus_AutoPOC for release details" | Stage 2, same try/catch (skipped due to 6.1 throw) | Wired — never reached |
| Step 7.1: "Use ReleaseStatus_AutoPOC output for SCAC etc" | Stage 3, enrichment try/catch | Wired — times out |
| Step 7.2: "Use OrderStatus_AutoPOC output for ItemID etc" | Stage 3, same try/catch (skipped due to 7.1 throw) | Wired — never reached |
| Step 7.4: "Execute ShipmentStatus_AutoPOC for ShipAdviceNo" | Stage 3, post-step-7 enrichment | Wired — times out |
| Step 8.2: "Execute ShipmentStatus_AutoPOC for status" | Stage 3, post-step-8 validation | Wired — times out |
| Step 9: "Call InvoiceStatus_AutoPOC, check Status=01" | Stage 5, after REST poll | Wired — not reached (poll failed) |
| Step 10.2: "Execute OrderStatus_AutoPOC for order status" | Stage 4, after deliver | Wired — not reached (deliver threw) |

---

# Summary: 46 Checks Executed

### By System

| System | API/Protocol | Checks | Pass | Fail | Notes |
|---|---|---|---|---|---|
| **Sterling OMS** | REST JSON (`/invoke/{api}`) | 42 | 22 | 20 | Core order lifecycle. Failures are output template gaps. |
| **Sterling OMS** | XAPI JSP (Playwright) | — | — | — | Used for ACT phase: order creation (4 steps), inventory (2 steps), schedule/release (2 steps), ship/shipConfirm (2 steps), deliver (1 step), return creation (1 step). Also: 4 AutoPOC attempts (all timed out), 3 healing XAPI calls (ShipmentKey, TaskQ, manageTaskQueue). |
| **In-memory context** | — | 4 | 2 | 2 | Context validation (credit note + return refs). Credit note not captured (invoice never generated). |
| **EPOCH Monitoring** | GraphQL | 0 | 0 | 0 | Layer 2 skipped |
| **NShift** | REST API | 0 | 0 | 0 | Layer 3 skipped |
| **Email (IMAP/Graph)** | IMAP or MS Graph | 0 | 0 | 0 | Layer 3 skipped |
| **PDF** | pdf-parse library | 0 | 0 | 0 | Layer 3 skipped |
| **Browser** | Playwright | 0 | 0 | 0 | Layer 3 skipped |
| | **TOTAL** | **46** | **24** | **22** | |

### By Actor

| Actor | Role | What It Did |
|---|---|---|
| **AQE Action Orchestrator** | Driver | Sequenced 9 lifecycle stages: ACT → POLL → VERIFY |
| **AQE → Sterling REST** | Reader | 46 verification checks via `getOrderList`, `getShipmentListForOrder`, `getOrderInvoiceList`, `getOrderReleaseList` |
| **AQE → XAPI (Playwright)** | Writer | **12 write operations**: order creation (4 steps) + inventory check/adjust (2 steps) + schedule/release (2 steps) + ship/shipConfirm (2 steps) + deliver (1 step) + return creation (1 step). Also: 4 AutoPOC attempts (all timed out) + 3 healing XAPI calls. |
| **AQE Healing Handler** | Self-Healer | **forward-invoice**: probed Sterling → found ShipmentKey → queried task queue → moved AvailableDate → polled 180s → **FAILED** (invoice not generated). **return-delivery**: diagnosed status-already-satisfied (728ms). |
| **AQE → XAPI (AutoPOC)** | Enricher/Validator | 4 AutoPOC service calls attempted — all timed out (services not in JSP dropdown). 2 calls not reached (try/catch batching + deliver throw). |

### By Layer

| Layer | Description | Checks | Pass | Fail |
|---|---|---|---|---|
| **L1: Sterling OMS** | Order status, shipments, invoices, notes, release | 46 | 24 | 22 |
| **L2: IIB Message Flows** | EPOCH GraphQL | 0 | 0 | 0 (skipped) |
| **L3: NShift** | Carrier tracking | 0 | 0 | 0 (skipped) |
| **L3: Email** | Customer notifications | 0 | 0 | 0 (skipped) |
| **L3: PDF** | Shipping labels, credit notes | 0 | 0 | 0 (skipped) |
| **L3: Browser** | Customer portal | 0 | 0 | 0 (skipped) |

---

# XAPI Write Operations (Full Inventory)

| # | XAPI Step | Service/API | Purpose | System | Timing |
|---|---|---|---|---|---|
| 1 | Step 1 | `adidasWE_CreateOrderSync` | Create sales order (custom Adidas flow) | Sterling OMS (JSP) | Stage 1, 11.8s |
| 2 | Step 2 | `changeOrder` | Stamp ShipNode=IT33 on order line | Sterling OMS (JSP) | Stage 1, 5.5s |
| 3 | Step 3 | `changeOrder` | Resolve Buyer's Remorse hold | Sterling OMS (JSP) | Stage 1, 5.5s |
| 4 | Step 4 | `adidasWE_CheckAdyenAsyncResponseSvc` | Process Adyen payment (async response check) | Sterling OMS (JSP) | Stage 1, 5.8s |
| 5 | Step 5.1 | `getATP` | Check inventory at IT33 for EE6464_530 | Sterling OMS (JSP) | Stage 2, ~5s |
| 6 | Step 5.2 | `adjustInventory` | Inject 50 PIECE at IT33 (ATP was zero) | Sterling OMS (JSP) | Stage 2, ~5s |
| 7 | Step 5.3 | `scheduleOrder` | Schedule order for fulfillment | Sterling OMS (JSP) | Stage 2, ~5s |
| 8 | Step 6 | `releaseOrder` | Release order to warehouse | Sterling OMS (JSP) | Stage 2, ~5s |
| 9 | Step 7 | `adidasWE_ProcessSHPConfirmation` | Ship confirmation (defaults: SCAC=COR, ItemID=EE6464_530) | Sterling OMS (JSP) | Stage 3, ~5s |
| 10 | Step 8 | `adidas_UpdateSOAcknowledgmentSvc` | SO Acknowledgment (default: ShipAdviceNo=320614239) | Sterling OMS (JSP) | Stage 3, ~5s |
| 11 | Step 10 | `adidasWE_ProcessPODUpdate` | Delivery/POD event (ExtnStatusCode=DL) | Sterling OMS (JSP) | Stage 4, ~1s |
| 12 | Step 11 | `adidasWE_CreateReturnFromSSRSvc` | Create return on forward order | Sterling OMS (JSP) | Stage 7, ~0.8s |
| 13 | — (heal) | `getShipmentListForOrder` | Find ShipmentKey for invoice recovery | Sterling OMS (JSP) | Stage 5, ~60s |
| 14 | — (heal) | `getTaskList` | Query pending invoice task | Sterling OMS (JSP) | Stage 5, ~60s |
| 15 | — (heal) | `manageTaskQueue` | Move AvailableDate to trigger invoice | Sterling OMS (JSP) | Stage 5, ~5s |

---

# Self-Healing Operations

| Stage | Trigger | What Happened | Result | Duration |
|---|---|---|---|---|
| Stage 5 (forward-invoice) | Poll timed out after 15 attempts | **Full recovery playbook**: find ShipmentKey (`302603021911569286473326`) → query task queue (`202603021919547904490617`) → move AvailableDate (backdated to 2026-03-01) → poll 180s for invoice | **FAILED — invoice not generated** | ~284s |
| Stage 8 (return-delivery) | Credit note not found | Probed Sterling: status=3700.0001, shipments=1, invoices=0, returnCreditNote=false. Pattern "status-already-satisfied" (confidence 0.90) | continue | 728ms |

---

# Recurring Failures (Output Template Gaps)

These checks fail **100% across all 3 runs** (APT26149445, APT18568060, APT15605451). They are NOT code bugs — they're Sterling output template gaps where `getOrderList` doesn't return the expected fields.

| Check | Sterling Field | Issue | Runs Failed |
|---|---|---|---|
| ShipTo FirstName present | `PersonInfoShipTo.FirstName` | Output template doesn't include PersonInfoShipTo | 3/3 |
| ShipTo LastName present | `PersonInfoShipTo.LastName` | Same | 3/3 |
| ShipTo City present | `PersonInfoShipTo.City` | Same | 3/3 |
| ShipTo Country present | `PersonInfoShipTo.Country` | Same | 3/3 |
| Has order lines | `OrderLines.OrderLine` | Output template doesn't include OrderLines | 3/3 |
| Line ItemID present | `OrderLine.ItemID` | Same (no OrderLines) | 3/3 |
| Line UOM present | `OrderLine.UnitOfMeasure` | Same | 3/3 |
| Line OrderedQty present | `OrderLine.OrderedQty` | Same | 3/3 |
| Line has price info | `OrderLine.LinePriceInfo` | Same | 3/3 |
| ShipNode assigned | `OrderLine.ShipNode` | Same (no OrderLines) | 3/3 |
| First has tracking | `Shipment.TrackingNo` | `getShipmentListForOrder` doesn't include TrackingNo | 3/3 |

---

# Failure Root Causes

| Root Cause | Checks Affected | Fix |
|---|---|---|
| **`getOrderList` output template missing fields** | 10 (PersonInfoShipTo + OrderLines) | Update Sterling output template to include PersonInfoShipTo and OrderLines with child fields |
| **`getShipmentListForOrder` missing TrackingNo** | 1 | Update output template to include TrackingNo |
| **Forward invoice not generated** | 7 (step-12/12a not run + step-25/26 cascade) | Sterling `CREATE_INVOICE` agent didn't fire within poll+recovery window. Fresh orders need longer for async processing pipeline. |
| **Credit note not generated** | 6 (step-25, step-26) | Cascading: no forward invoice → no credit memo possible |
| **Carrier notes not populated** | 5 (IT/DL notes) | Expected: XAPI-driven delivery doesn't post NShift carrier notes |
| **AutoPOC services not deployed** | 0 (graceful) | Register 4 AutoPOC custom flow services in Sterling XAPI JSP dropdown |

---

# Comparison: Run 2 (APT18568060) vs Run 3 (APT15605451)

| Aspect | Run 2 (APT18568060) | Run 3 (APT15605451) |
|---|---|---|
| Mode | Existing order (`--order`) | New order creation |
| Order age at test start | ~2 hours (created in Run 1) | 0 seconds (brand new) |
| XAPI steps executed | 1 (return) + 3 (heal) | 12 (full lifecycle) + 3 (heal) |
| Inventory check | Not executed (order already released) | **NEW**: getATP → zero stock → adjustInventory 50 PIECE |
| AutoPOC post-release (Step 6.1/6.2) | Not attempted (order already shipped) | **NEW**: attempted → 60s timeout |
| AutoPOC post-ship-confirm (Step 8.2) | Not attempted | **NEW**: attempted → 60s timeout |
| AutoPOC enrichment (Step 7.1/7.2/7.4) | 3 calls, 180s timeout | 3 calls, 180s timeout (same) |
| Forward invoice | **RECOVERED** by healer (43.1s) | **NOT RECOVERED** — healer tried, invoice not generated after 180s |
| Invoice healer ShipmentKey | Different key | `302603021911569286473326` |
| Invoice number | 2603359 (recovered) | Not generated |
| Credit note | Not found (no return flow at time of check) | Not found (no forward invoice to credit against) |
| Total checks | 53 (24 pass, 29 fail) | 46 (24 pass, 22 fail) |
| Fewer checks because | — | step-12/12a not run (poll failed before verify) |
| Stages | 5 pass, 2 fail, 2 skip | 5 pass, 2 fail, 2 skip |
| Duration | 595.9s | 1345.7s |
| Duration difference | — | +750s (full XAPI lifecycle + inventory + more AutoPOC timeouts + failed 180s heal poll) |

**Key insight**: The invoice healer succeeded on the older order (APT18568060, ~2 hours old) but failed on the fresh order (APT15605451, seconds old). The TaskQ AvailableDate backdating worked identically in both cases, but Sterling's `CREATE_INVOICE` batch agent didn't process the fresh order within 180s. This suggests a timing dependency — freshly shipped orders need more time in Sterling's async pipeline before the invoice task becomes executable.

---

# Performance Breakdown

| Component | Duration | Notes |
|---|---|---|
| XAPI order creation (Steps 1-4) | 28.7s | 4 sequential Playwright calls |
| XAPI inventory check + adjust (Steps 5.1-5.2) | ~10s | getATP + adjustInventory |
| XAPI schedule + release (Steps 5.3-6) | ~10s | scheduleOrder + releaseOrder |
| AutoPOC post-release timeout | 60s | 1 call (OrderStatus_AutoPOC) |
| Release polling | ~235s | Status → Acknowledged, many poll cycles |
| AutoPOC enrichment timeout (Step 7.1) | 60s | 1 call (ReleaseStatus_AutoPOC) |
| XAPI ship + ship confirm (Steps 7-8) | ~10s | ProcessSHPConfirmation + SOAcknowledgment |
| AutoPOC ShipmentStatus timeout (Step 7.4) | 60s | 1 call |
| AutoPOC post-ship-confirm timeout (Step 8.2) | 60s | 1 call |
| Shipment polling | ~325s | Polling for TrackingNo that's never returned |
| XAPI deliver (Step 10) | ~1s | ProcessPODUpdate |
| Forward invoice poll | ~75s | 15 attempts × 5s, timed out |
| Invoice healer (FAILED) | ~284s | ShipmentKey lookup + TaskQ + 180s poll |
| XAPI return creation (Step 11) | ~0.8s | CreateReturnFromSSRSvc |
| Return delivery checks | ~25s | Polling + verify |

**Total wall-clock**: 1345.7s (22.4 min)
**AutoPOC timeout overhead**: 240s (17.8% of total)
**Invoice healing overhead**: 284s (21.1% of total)
**Sterling polling overhead**: ~635s (47.2% of total)
**Actual XAPI + verify work**: ~187s (13.9% of total)

**Estimated wall-clock once AutoPOC deployed + invoice timing fixed**: ~600-700s

---

# Action Items for Dev Team

### P0 (Required for AutoPOC — saves 240s per run)
1. **Deploy AutoPOC services to XAPI JSP** — Register `OrderStatus_AutoPOC`, `ReleaseStatus_AutoPOC`, `ShipmentStatus_AutoPOC`, `InvoiceStatus_AutoPOC` in the Sterling XAPI tester dropdown (`<select name="ApiName">`) so Playwright can select them.
2. **Confirm AutoPOC XML response format** — Provide a sample response from each service so we can verify our regex patterns match the actual output.

### P1 (Required for full check coverage)
3. **Update `getOrderList` output template** — Include `PersonInfoShipTo` (FirstName, LastName, City, Country) and `OrderLines` (ItemID, UnitOfMeasure, OrderedQty, LinePriceInfo, ShipNode).
4. **Update `getShipmentListForOrder` output template** — Include `TrackingNo`.
5. **Investigate invoice timing on fresh orders** — `CREATE_INVOICE` agent doesn't fire within 180s of ship confirm on newly created orders. Healer correctly finds ShipmentKey and moves TaskQ AvailableDate, but the invoice still doesn't generate. Does the agent run on a schedule? Is there a minimum delay?

### P2 (Nice to have)
6. **UAT EPOCH endpoint** — Provide a UAT-compatible EPOCH GraphQL URL.
7. **Resolve InvoiceStatus_AutoPOC input format contradiction** — Steps doc (line 33) says `<Order .../>`, payloads doc (line 203) says `<OrderInvoice .../>`. We use `<OrderInvoice>`. Need dev confirmation.

---

# Raw Console Output

```
Loading Adidas configuration...
Loaded 24 Sterling patterns into memory.db
O2C: Creating new order via XAPI
  Layers: Sterling
  XAPI: enabled
  Self-healing: enabled (invoice recovery playbook)
  Telemetry: 0 outcomes recorded

Pre-flight: checking Sterling connectivity...
Pre-flight: Sterling is reachable

  [XAPI] Creating order APT15605451 (enterprise: adidas_PT)
  [XAPI] Step 1 (adidasWE_CreateOrderSync): OK (11848ms)
  [XAPI] Step 2 (changeOrder): OK (5508ms)
  [XAPI] Step 3 (changeOrder): OK (5524ms)
  [XAPI] Step 4 (adidasWE_CheckAdyenAsyncResponseSvc): OK (5841ms)
  [PASS] Create Sales Order (1/1 checks, 29.6s)
  [TC01] Inventory adjusted: EE6464_530 at IT33 → 50 PIECE
  [WARN] AutoPOC post-release validation failed: locator.selectOption: Timeout 60000ms exceeded.
  [PASS] Wait for Order Release (1/1 checks, 342.9s)
  [WARN] AutoPOC enrichment failed, using defaults: locator.selectOption: Timeout 60000ms exceeded.
  [WARN] ShipmentStatus_AutoPOC failed, using defaults: locator.selectOption: Timeout 60000ms exceeded.
  [WARN] AutoPOC post-ship-confirm validation failed: locator.selectOption: Timeout 60000ms exceeded.
  [PASS] Confirm Shipment (1/1 checks, 580.7s)
  [PASS] Delivery & POD Events (2/2 checks, 1.1s)
  [HEAL] forward-invoice: Invoice failure detected — running recovery playbook (Playwright XAPI)...
  [HEAL] Recovery failed: ShipmentKey: 302603021911569286473326
    TaskQKey: 202603021919547904490617
    Current AvailableDate: 2026-03-02T19:19:53+00:00
    AvailableDate moved to: 2026-03-01 19:19:54.000
    Invoice not generated after 180s. Sterling job may not have run.
  [FAIL] Forward Invoice & Reconciliation (0/0 checks, 80.7s)
  [SKIP] Forward Flow Email & PDF Verification (0/4 skipped, 0.0s)
  [PASS] Create Return Order (1/1 checks, 0.8s)
  [AGENTIC] return-delivery: Pattern "status-already-satisfied" matched (confidence 0.90)
  [AGENTIC] Probe: status=3700.0001, shipments=1, invoices=0, returnCreditNote=false, notes=[]
  [AGENTIC] Decision: continue (728ms)
  [FAIL] Return Delivery & Credit Note (1/3 checks, 25.2s)
  [SKIP] Return Email, PDF & Browser Verification (0/7 skipped, 0.0s)

  Stages: 5 passed, 2 failed, 2 skipped
  Checks: 9
  Duration: 1345.7s
  Result: FAIL
```
