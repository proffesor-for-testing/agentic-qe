# Questions for Adidas Dev Team — Monday 3 March 2026

Context: AQE automated O2C TC_01 achieves **6/9 stages PASS, 2 SKIP, 1 FAIL** on order APT26149445 (UAT).
The only failing stage is **Return Delivery & Credit Note** (step-25).
Our agentic healer attempted recovery but could not generate the credit note.

---

## 1. WMS ReturnConfirmation in UAT

**What we found**: The TC_01-APT93030618 SSR document shows credit notes are triggered by the `MF_ADS_WMS_ReturnConfirmation_SYNC` SOAP message from the warehouse (WMS), not by a Sterling task queue job.

**Question**: Is the WMS ReturnConfirmation flow active in UAT? If not, how do testers trigger credit note generation for test orders?

- Is there a manual way to trigger `MF_ADS_WMS_ReturnConfirmation_SYNC` in UAT?
- Or is there an XAPI/API call that simulates the WMS confirmation?
- Does it require a specific warehouse (ShipNode) to be configured?

## 2. Credit Note Order Number

**What we found**: In the SSR doc, the credit note (InvoiceType="RETURN") exists on a separate **return order** (e.g., `6000081596` with DocumentType="0003"), NOT on the sales order (e.g., `APT93030618` with DocumentType="0001").

**Question**: For order APT26149445, what is the return order number?

- Our code queries `getOrderInvoiceList` with the sales order number — is the return invoice always on a separate return order?
- How is the return order number linked to the sales order? Is it via `DerivedFromOrderHeaderKey` or `OrderReferences`?
- Can we get the return order number via `getOrderList` with a filter like `DerivedFromOrder/@OrderNo = "APT26149445"`?

## 3. InvoiceType Values

**What we found**: Sterling uses `InvoiceType="RETURN"` for credit notes (per the SSR doc), not `"CREDIT_MEMO"` as we initially assumed.

**Question**: Can you confirm the full set of InvoiceType values used in Adidas PT?

- `SHIPMENT` — forward invoice (confirmed)
- `RETURN` — credit note (per SSR doc)
- Are there others? (`DEBIT_MEMO`, `ADJUSTMENT`, etc.)

## 4. Task Queue for Return Invoices

**What we found**: Forward invoices have a pending task in `YFS_TASK_Q` (TransactionKey = ShipmentKey, AvailableDate in the future). Our agentic healer moves the AvailableDate to trigger immediate invoice generation — this works for forward flow.

**Question**: Does the same task queue pattern apply to return invoices?

- We found the forward ShipmentKey task (`302602271646439280975288`) but no return-specific task.
- Is the return invoice generation purely event-driven (WMS SOAP call) with no task queue involvement?
- Or is there a separate task type for return invoices that we should search for?

## 5. Sterling API Output Templates

**What we found**: `getOrderDetails` for APT26149445 returns order lines without `ItemID` or `UnitOfMeasure` — these fields show as "missing" in our checks.

**Question**: What Output Template is configured for the `getOrderDetails` API in UAT?

- Do we need to specify an explicit `<OutputTemplate>` in the API input XML to get `ItemID`, `UnitOfMeasure`, and `DateInvoiced` back?
- Which template name should we use? (e.g., `getCompleteOrderDetails`)

## 6. Payment Status

**What we found**: Order APT26149445 shows `PaymentStatus="AWAIT_PAY_INFO"` even after forward invoice generation. The SSR doc for APT93030618 shows `PaymentStatus="INVOICED"`.

**Question**: Is `AWAIT_PAY_INFO` expected for test orders in UAT?

- Does payment status transition require Adyen sandbox integration?
- Does the forward invoice generation (`InvoiceType="SHIPMENT"`) normally trigger payment collection?

## 7. EPOCH GraphQL — UAT Endpoint

**What we found**: EPOCH is reachable from our environment at `http://10.146.28.234:8082/graphqlmdsit`. Schema works — `getMessageList(OrderNo, MsgFlowName, LocalTransactionID, EventName)` returns `MSGFLOW_NAME, EVENT_NAME, EVENT_TIMESTAMP, Body`.

**Problem**: All UAT orders (APT26149445, APT75174909, APT92045131) return **empty results**. The endpoint path contains `mdsit` — this appears to be SIT-only.

**Dev response so far**: "You can utilize any order no that is created by automation."

**Follow-up question**: We tried UAT automation orders and got empty results. Is `/graphqlmdsit` SIT-only?

- Is there a UAT EPOCH endpoint (e.g., `/graphqlmduat` or a different host)?
- Or should we create orders in SIT to get IIB payload data from EPOCH?
- If the same endpoint serves both environments, is there a delay before messages appear, or do UAT flows not route through the EPOCH-monitored IIB instance?

This matters because EPOCH GraphQL is our **preferred Layer 2 strategy** — it returns actual IIB message payloads (XML bodies) for validating message flow execution end-to-end.

---

## Summary of What's Working

| Stage | Status | Notes |
|---|---|---|
| Create Sales Order | PASS | Validates order structure, address, lines |
| Wait for Release | PASS | Polls until status >= 3200 |
| Confirm Shipment | PASS | ShipmentNo, tracking, SCAC confirmed |
| Delivery & POD | PASS | MaxOrderStatus = 3700.03 |
| Forward Invoice | PASS | InvoiceNo=2602529, Type=SHIPMENT, Amount=120.00 |
| Forward Email/PDF | SKIP | Needs email/browser config |
| Create Return | PASS | Return confirmed on forward order |
| **Return Credit Note** | **FAIL** | No InvoiceType="RETURN" on either sales or return order |
| Return Email/PDF | SKIP | Needs email/browser config |

**Self-healing attempted**: Probed Sterling state, tried task queue recovery, diagnosed WMS dependency.
Answering questions 1-4 above will likely unblock the 9th stage.
