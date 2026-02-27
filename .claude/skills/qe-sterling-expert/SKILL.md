---
name: qe-sterling-expert
description: "IBM Sterling Order Management System expert. Covers platform architecture, pipeline engine, all core APIs, order/shipment/return lifecycle, status codes, XML schemas, troubleshooting patterns, task queue management, and integration patterns. Helps with debugging Sterling failures, fixing integration code, writing API calls, and guiding developers on Sterling OMS development across any enterprise implementation."
category: domain-expert
priority: high
tokenEstimate: 6000
agents: [qe-sterling-expert, qe-test-architect, qe-code-intelligence]
implementation_status: draft
optimization_version: 2.0
last_optimized: 2026-02-27
dependencies: []
quick_reference_card: true
tags: [sterling, oms, order-management, ibm, troubleshooting, api, xml, integration, fulfillment, shipment, invoice, return, pipeline]
trust_tier: 1

---

# QE Sterling Expert

<default_to_action>
When Sterling OMS help is needed:
1. IDENTIFY DOMAIN: Order lifecycle? API call? Troubleshooting? Code fix? Architecture?
2. DIAGNOSE: Check error codes, status values, XML structure, API response
3. RECOMMEND: Provide exact API call, XML template, or code fix
4. VERIFY: Suggest verification checks to confirm the fix worked

**Quick Domain Selection:**
- **API Help**: Need to call a Sterling API — provide XML input/output, endpoint, parameters
- **Troubleshooting**: Something failed — diagnose from error codes, status, logs
- **Code Fix**: Existing code has Sterling integration issues — fix it
- **Architecture**: Design Sterling integration patterns, flows, customizations
- **Lifecycle**: Understand order/shipment/return status transitions
- **Pipeline**: Understand transaction engine, conditions, actions, user exits
</default_to_action>

## Quick Reference Card

### When to Use
| Context | Appropriate? | Why |
|---------|-------------|-----|
| Sterling API call failing | Yes | Diagnose XML, auth, endpoint issues |
| Order stuck in wrong status | Yes | Status transition + task queue debugging |
| Writing new Sterling integration | Yes | API selection, XML templates, patterns |
| Invoice not generating | Yes | Task queue, manageTaskQueue self-healing |
| Return cycle issues | Yes | DocumentType 0003, return status codes |
| Shipment confirmation failing | Yes | confirmShipment XML, container structure |
| Performance issues with APIs | Yes | Output templates, pagination, batching |
| Pipeline/transaction customization | Yes | User exits, conditions, actions, events |
| Non-Sterling questions | No | Use other domain experts |

---

## 1. Sterling OMS Architecture

### Platform Overview
```
┌─────────────────────────────────────────────────────────────┐
│                  IBM Sterling OMS Platform                    │
├──────────┬──────────┬───────────┬──────────┬────────────────┤
│  Order   │ Shipment │ Inventory │ Invoice  │    Return      │
│ Mgmt     │ Mgmt     │ Mgmt      │ Mgmt     │    Mgmt        │
├──────────┴──────────┴───────────┴──────────┴────────────────┤
│              Pipeline / Transaction Engine                    │
│   ┌──────────┐ ┌────────────┐ ┌─────────┐ ┌─────────────┐  │
│   │ Statuses │ │ Conditions │ │ Actions │ │ User Exits  │  │
│   └──────────┘ └────────────┘ └─────────┘ └─────────────┘  │
├──────────────────────────────────────────────────────────────┤
│           Agent Server (Background Processing)               │
│   Polls YFS_TASK_Q → Executes Transactions → Updates Status  │
├──────────────────────────────────────────────────────────────┤
│              API / Services Layer                             │
│   REST: POST /smcfs/restapi/invoke/{apiName}                 │
│   Flow: POST /smcfs/restapi/executeFlow/{serviceName}        │
│   JSP:  /smcfs/yfshttpapi/yantrahttpapitester.jsp            │
├──────────────────────────────────────────────────────────────┤
│              Database (YFS_* tables)                          │
│   YFS_ORDER_HEADER | YFS_SHIPMENT | YFS_TASK_Q | YFS_STATUS │
│   Extension tables: YFS_ORDER_HEADER_EXTN | YFS_*_EXTN       │
└──────────────────────────────────────────────────────────────┘
```

### Pipeline Engine (Core Concept)
The pipeline engine is the heart of Sterling. It defines **how orders progress through their lifecycle**.

- **Process Type**: Category of pipeline (e.g., ORDER_FULFILLMENT, RETURN_FULFILLMENT)
- **Pipeline**: Named workflow containing ordered transactions (e.g., "Sales Order Pipeline")
- **Transaction**: A discrete business step (e.g., CREATE_ORDER, SCHEDULE, RELEASE, SHIP_CONFIRM)
- **Status**: Each transaction moves the order to a new status. Statuses are stored in `YFS_STATUS` table and are configurable per pipeline
- **Conditions**: Boolean rules evaluated before a transaction executes (e.g., "Has inventory?", "Payment authorized?")
- **Actions**: Operations triggered when a transaction completes (e.g., send email, create shipment, raise event)
- **Events**: Asynchronous notifications raised by transactions. Can trigger downstream services
- **User Exits**: Java extension points (`com.yantra.yfs.japi.ue.*`) that override or extend default transaction logic. User exits can only call read-only APIs (e.g., `getOrderDetails`) — they CANNOT call modifying APIs (e.g., `changeOrder`) within the same transaction to avoid conflicts
- **Agents**: Background JVM processes that poll `YFS_TASK_Q` and execute time-triggered transactions

**Key insight**: Statuses are NOT hardcoded — they are defined per pipeline in `YFS_STATUS`. The same numeric code can mean different things in different pipelines. Always query `YFS_STATUS` with the correct `ProcessTypeKey` to understand what a status means in your implementation.

### Key Concepts
- **Enterprise Code**: Organization identifier (e.g., `ACME_US`, `RETAIL_EU`). Scopes all data.
- **Document Type**: `0001` = Sales Order, `0002` = Purchase Order, `0003` = Return Order, `0006` = Transfer Order
- **Seller Organization Code**: Organization fulfilling the order. Can differ from EnterpriseCode in multi-org setups.
- **Ship Node**: Physical location fulfilling (warehouse, store, DC). Assigned during scheduling/release.
- **Service**: Named orchestration of APIs with conditions and actions (invoked with `IsFlow=Y`)
- **API**: Direct database operation — single CRUD action (invoked with `IsFlow=N`)
- **Output Template**: Configurable XML/JSON template that controls which fields an API returns. Critical for performance.
- **Extension Tables**: Sterling supports custom `_EXTN` tables (e.g., `YFS_ORDER_HEADER_EXTN`) mapped via `<Extn>` XML elements. Used for implementation-specific fields.

### REST API Pattern
```
POST https://{host}/smcfs/restapi/invoke/{apiName}
Content-Type: application/json
Authorization: Basic {base64(user:pass)}

{
  "OrderNo": "ORD-2026-0001",
  "EnterpriseCode": "{YOUR_ENTERPRISE}",
  "DocumentType": "0001"
}
```

### Service Flow Execution
```
POST https://{host}/smcfs/restapi/executeFlow/{serviceName}
Content-Type: application/xml
Authorization: Basic {base64(user:pass)}

<Order OrderNo="ORD-2026-0001" EnterpriseCode="{YOUR_ENTERPRISE}" .../>
```

### XAPI HTTP Tester (Non-Production Only)
```
URL: https://{host}/smcfs/yfshttpapi/yantrahttpapitester.jsp
Fields:
  - YFSEnvironment.userId / YFSEnvironment.password
  - InvokeFlow checkbox (checked = Service, unchecked = API)
  - ServiceName (when InvokeFlow checked)
  - ApiName dropdown
  - InteropApiData textarea (XML input)
Note: Not available in production environments
```

---

## 2. Order Lifecycle & Status Codes

### Sales Order (DocumentType 0001) — Default Pipeline Status Flow
```
Draft Created → Created → Scheduled → Released →
Included in Shipment → Shipped → Delivered →
Return Created → Return Received → Cancelled/Closed
```

### Default Order Fulfillment Statuses (from IBM docs)
These are the out-of-box (OOB) statuses in the standard ORDER_FULFILLMENT pipeline. **Implementations may add custom sub-statuses** (e.g., `3200.03` = "Sent to Fulfillment Center" under Released).

| Status | Description | Notes |
|--------|-------------|-------|
| Draft Order Created | A draft order has been created | Pre-submission |
| Created | An order has been created | Entry point |
| Reserved | Order created but not ready to schedule | Awaiting conditions |
| Scheduled | Node(s) have inventory to fulfill | After scheduleOrder |
| Backordered | Insufficient inventory available | Awaiting replenishment |
| Backordered From Node | Released to node but node lacks inventory | Node-level backorder |
| Released | Released to fulfillment | After releaseOrder |
| Sent To Node | Order release sent to node | Multi-node fulfillment |
| Included In Shipment | Order included in a shipment | After createShipment |
| Shipped | Order has been shipped | After confirmShipment |
| Delivered | Product lines have been delivered | After POD update |
| Return Created | Buyer returning items | After return creation |
| Return Received | Returned items received at return node | After receipt |
| Cancelled | Order has been cancelled | Terminal state |
| Held | Order held — no modifications allowed | Requires hold resolution |

**IMPORTANT**: Numeric status codes (1100, 3200, 3700, etc.) are pipeline-specific and configurable. The values above are descriptions from the OOB pipeline. Always verify status codes against your implementation's `YFS_STATUS` table:
```sql
SELECT STATUS, DESCRIPTION FROM YFS_STATUS
WHERE PROCESS_TYPE_KEY = 'ORDER_FULFILLMENT';
```

Custom statuses use `STATUS_TYPE = 'USER'` and must be sub-statuses under OOB statuses.

### Return Order (DocumentType 0003) — Return Fulfillment Pipeline
Query with: `SELECT * FROM YFS_STATUS WHERE PROCESS_TYPE_KEY = 'RETURN_FULFILLMENT';`

The return lifecycle typically follows: Created → Return Initiated → Return Received → Closed

**Note**: Return tracking codes (e.g., RP=Picked Up, RT=In Transit, RD=Delivered) are typically stored in **extension fields** (`<Extn ExtnStatusCode="RP"/>`) on the Shipment — NOT in the order pipeline status. Do not confuse extension tracking codes with pipeline statuses.

### Key Status Fields on Order
- **MinOrderStatus / MaxOrderStatus**: Lowest/highest numeric status across all order lines
- **MinOrderStatusDesc / MaxOrderStatusDesc**: Human-readable descriptions
- **PaymentStatus**: AUTHORIZED, PAID, SETTLED, INVOICED, AWAIT_PAY_INFO
- **HoldFlag**: Y/N — whether order has active holds blocking the pipeline
- **HoldReasonCode**: Specific hold reason code

---

## 3. Core APIs Reference

### Order APIs
| API | Input | Purpose |
|-----|-------|---------|
| `getOrderList` | `{OrderNo, EnterpriseCode, DocumentType}` | List orders with filtering, pagination |
| `getOrderDetails` | `{OrderNo, EnterpriseCode}` or `{OrderHeaderKey}` | Full order detail including lines |
| `getOrderLineList` | `{OrderNo, EnterpriseCode}` | Order lines only |
| `getOrderReleaseList` | `{OrderNo, EnterpriseCode}` | Release details (ShipNode, ReleaseNo) |
| `getOrderAuditList` | `{OrderNo, EnterpriseCode}` | Audit trail (who changed what, when) |
| `createOrder` | `<Order>` XML with full order structure | Create new order |
| `changeOrder` | `<Order Override="Y">` XML | Modify existing order. **Requires `Override="Y"`** or changes silently ignored |
| `cancelOrder` | `{OrderNo, EnterpriseCode}` | Cancel order |
| `scheduleOrder` | `<ScheduleOrder>` XML | Schedule for fulfillment against inventory |
| `releaseOrder` | `<ReleaseOrder>` XML | Release to ship node for picking/packing |
| `processOrderPayments` | `<Order>` XML (**NOT** `<ProcessOrderPayment>`) | Trigger payment collection |
| `getOrdersForReturn` | `{OrderNo, EnterpriseCode}` | Get returnable order lines |
| `retrieveOrder` | `{OrderNo}` | Retrieve archived order |

### Shipment APIs
| API | Input | Purpose |
|-----|-------|---------|
| `getShipmentListForOrder` | `{OrderNo, EnterpriseCode}` | Shipments for a specific order (joins YFS_ORDER_HEADER) |
| `getShipmentList` | `{ShipmentNo, ShipNode}` | Generic shipment query (no order join) |
| `getShipmentDetails` | `{ShipmentKey}` or `{ShipmentNo}` | Full shipment detail with lines |
| `createShipment` | `<Shipment>` XML | Create shipment manually |
| `changeShipment` | `<Shipment>` XML | Modify shipment attributes |
| `confirmShipment` | `<Shipment ConfirmShip="Y">` XML | Confirm shipment — triggers status update |

**IMPORTANT**: `getShipmentListForOrder` vs `getShipmentList`:
- `getShipmentListForOrder` — Takes OrderNo, joins `YFS_ORDER_HEADER` + `YFS_SHIPMENT`. Use when starting from an order.
- `getShipmentList` — Direct `YFS_SHIPMENT` query. Use when you already have ShipmentNo or ShipmentKey.

### Invoice APIs
| API | Input | Purpose |
|-----|-------|---------|
| `getOrderInvoiceList` | `{OrderNo, EnterpriseCode, DocumentType}` | List invoices for an order |
| `getOrderInvoiceDetails` | `{InvoiceNo}` or `{OrderInvoiceKey}` | Full invoice detail with line items |
| `createOrderInvoice` | `<OrderInvoice>` XML | Create invoice manually |

### Inventory APIs
| API | Input | Purpose |
|-----|-------|---------|
| `getAvailableInventory` | `{ItemID, UnitOfMeasure, OrganizationCode}` | ATP (Available to Promise) check |
| `adjustInventory` | `<Inventory>` XML | Adjust inventory counts at a node |
| `getInventorySupplyList` | `{ItemID, ShipNode}` | Supply details (on-hand, in-transit) |
| `getInventoryDemandList` | `{ItemID, ShipNode}` | Demand details (allocated, reserved) |

### Task Queue APIs (Critical for Troubleshooting)
| API | Input | Purpose |
|-----|-------|---------|
| `manageTaskQueue` | `<TaskQueue DataKey="..." DataType="...">` | Query AND update task queue |
| `getTaskQueueDataList` | `<GetTaskQueueDataInput>` (**NOT** `<TaskQueue>`) | List task queue entries |
| `changeAvailDateInTaskQueue` | `<TaskQueue TaskQKey="..." AvailableDate="...">` | Change when a task becomes eligible |

**CRITICAL**: `manageTaskQueue` with `DataKey` + `DataType` acts as BOTH query AND update. To force a queued task to execute immediately, set `AvailableDate` to a past date.

**CRITICAL**: `getTaskQueueDataList` requires `<GetTaskQueueDataInput>` as root element — NOT `<TaskQueue>`. This is a common mistake.

### API Response Structure
All Sterling APIs return JSON (via REST) or XML (via XAPI) with this general pattern:
```json
// getOrderList response
{
  "Order": [
    {
      "OrderHeaderKey": "20260115...",
      "OrderNo": "ORD-001",
      "DocumentType": "0001",
      "EnterpriseCode": "ACME_US",
      "MinOrderStatus": "3200",
      "MinOrderStatusDesc": "Released",
      "MaxOrderStatus": "3200",
      "PaymentStatus": "AUTHORIZED",
      "HoldFlag": "N",
      "OverallTotals": { "GrandTotal": "150.00" },
      "PriceInfo": { "Currency": "USD" }
    }
  ],
  "TotalOrderList": "1",
  "LastRecordSet": "Y"
}
```

---

## 4. XML Templates & Patterns

All examples use generic placeholders. Replace `{ENTERPRISE}`, `{ORDER_NO}`, `{ITEM_ID}`, `{SHIP_NODE}` with your implementation values.

### Create Order
```xml
<Order CustomerEMailID="customer@example.com"
       EnterpriseCode="{ENTERPRISE}"
       OrderDate="{ISO_DATE}"
       OrderNo="{ORDER_NO}"
       DocumentType="0001"
       EntryType="web"
       SellerOrganizationCode="{ENTERPRISE}">
  <OrderLines>
    <OrderLine OrderedQty="1" PrimeLineNo="1"
               CarrierServiceCode="{CARRIER_SVC_CODE}" SCAC="{CARRIER_CODE}">
      <Item ItemID="{ITEM_ID}" ProductClass="{PRODUCT_CLASS}" UnitOfMeasure="{UOM}"/>
      <LinePriceInfo UnitPrice="{UNIT_PRICE}" IsPriceLocked="Y"/>
    </OrderLine>
  </OrderLines>
  <PersonInfoBillTo AddressLine1="{ADDR}" City="{CITY}" Country="{COUNTRY}"/>
  <PersonInfoShipTo AddressLine1="{ADDR}" City="{CITY}" Country="{COUNTRY}"/>
  <PriceInfo Currency="{CURRENCY}"/>
  <PaymentMethods>
    <PaymentMethod PaymentType="CREDIT_CARD" CreditCardType="{CC_TYPE}"
                   CreditCardNo="{CC_LAST4}" CreditCardExpDate="{CC_EXP}">
      <PaymentDetails RequestAmount="{AMOUNT}" ChargeType="AUTHORIZATION"/>
    </PaymentMethod>
  </PaymentMethods>
</Order>
```

### Change Order (Assign ShipNode)
```xml
<Order Override="Y" DocumentType="0001" EnterpriseCode="{ENTERPRISE}" OrderNo="{ORDER_NO}">
  <OrderLines>
    <OrderLine PrimeLineNo="1" SubLineNo="1" ShipNode="{SHIP_NODE}"/>
  </OrderLines>
</Order>
```

### Resolve Hold
```xml
<Order OrderNo="{ORDER_NO}" EnterpriseCode="{ENTERPRISE}" DocumentType="0001">
  <OrderHoldTypes>
    <OrderHoldType Status="1300" HoldType="{HOLD_TYPE_CODE}"/>
  </OrderHoldTypes>
</Order>
```

### Schedule Order
```xml
<ScheduleOrder CheckInventory="Y" DocumentType="0001"
               EnterpriseCode="{ENTERPRISE}"
               IgnoreTransactionDependencies="Y"
               OrderNo="{ORDER_NO}"/>
```

### Release Order
```xml
<ReleaseOrder DocumentType="0001" EnterpriseCode="{ENTERPRISE}"
              IgnoreTransactionDependencies="Y"
              OrderNo="{ORDER_NO}"/>
```

### Ship Confirmation
```xml
<Shipment SCAC="{CARRIER_CODE}" CarrierServiceCode="{CARRIER_SVC}" ConfirmShip="Y"
          EnterpriseCode="{ENTERPRISE}" OrderNo="{ORDER_NO}"
          ReleaseNo="{RELEASE_NO}" ShipNode="{SHIP_NODE}"
          ShipmentNo="{SHIPMENT_NO}" DocumentType="0001">
  <Containers>
    <Container ContainerNo="{CONTAINER_NO}" TrackingNo="{TRACKING_NO}">
      <ContainerDetails>
        <ContainerDetail>
          <ShipmentLine ItemID="{ITEM_ID}" Quantity="{QTY}"
                        ReleaseNo="{RELEASE_NO}" PrimeLineNo="1"/>
        </ContainerDetail>
      </ContainerDetails>
    </Container>
  </Containers>
  <ShipmentLines>
    <ShipmentLine ItemID="{ITEM_ID}" Quantity="{QTY}"
                  ReleaseNo="{RELEASE_NO}" PrimeLineNo="1"/>
  </ShipmentLines>
</Shipment>
```

### Delivery / POD Update
```xml
<Shipment ExpectedDeliveryDate="{ISO_DATE}"
          TrackingNo="{TRACKING_NO}"
          SourceSystem="{SOURCE_SYSTEM}" OrderNo="{ORDER_NO}">
  <AdditionalDates>
    <AdditionalDate ActualDate="{ISO_DATE}" DateTypeId="Delivered"/>
  </AdditionalDates>
  <Extn ExtnStatusCode="DL" ExtnStatusDesc="Delivered"/>
</Shipment>
```

### Create Return (DocumentType 0003)
```xml
<Order OrderNo="{ORDER_NO}">
  <OrderLines>
    <OrderLine Quantity="1" PrimeLineNo="1"
               ReturnReasonCode="{REASON_CODE}" ReturnReasonText="{REASON_TEXT}">
      <Item ItemID="{ITEM_ID}"/>
    </OrderLine>
  </OrderLines>
</Order>
```

### Return POD Updates
```xml
<!-- Same service call, different ExtnStatusCode per stage -->
<Shipment ExpectedDeliveryDate="{ISO_DATE}"
          TrackingNo="{RETURN_TRACKING_NO}"
          OrderNo="{ORDER_NO}" SCAC="{CARRIER}" SourceSystem="{SOURCE}">
  <Extn ExtnStatusCode="{STATUS}" ExtnStatusDesc="{DESC}"/>
  <!-- ExtnStatusCode values vary by implementation. Common pattern: -->
  <!-- RP=Picked Up, RT=In Transit, RD=Delivered to Destination -->
  <AdditionalDates>
    <AdditionalDate ActualDate="{ISO_DATE}" DateTypeId="{DATE_TYPE}"/>
    <!-- DateTypeId values: ReturnPickedUp, ReturnInTransit, ReturnedToWarehouse -->
  </AdditionalDates>
</Shipment>
```

### Return Completion (Receipt)
```xml
<Receipt DocumentType="0003" ReceivingNode="{RECEIVING_NODE}"
         ReceiptDate="{ISO_DATE}">
  <Shipment OrderNo="{ORDER_NO}" ReceivingNode="{RECEIVING_NODE}"
            EnterpriseCode="{ENTERPRISE}"/>
  <ReceiptLines>
    <ReceiptLine PrimeLineNo="1" Quantity="1" OrderNo="{ITEM_ID}"/>
    <!-- WARNING: OrderNo attribute on ReceiptLine = ItemID, NOT the order number -->
  </ReceiptLines>
</Receipt>
```

### Extension Elements (`<Extn>`)
Sterling supports custom extension fields via `<Extn>` elements. These map to `_EXTN` tables in the database (e.g., `YFS_ORDER_HEADER_EXTN`).
```xml
<Order OrderNo="{ORDER_NO}" EnterpriseCode="{ENTERPRISE}">
  <Extn ExtnCustomField1="value1" ExtnCustomField2="value2"/>
  <OrderLines>
    <OrderLine PrimeLineNo="1">
      <Extn ExtnLineCustomField="value"/>
    </OrderLine>
  </OrderLines>
</Order>
```

---

## 5. Troubleshooting Guide

### Error Code Patterns
Sterling error codes use prefixes that indicate the subsystem. Below are **verified error patterns** from IBM support documentation. Actual codes and descriptions vary by Sterling version — always check your server logs for the exact error.

| Prefix | Subsystem | Examples |
|--------|-----------|----------|
| `YFC` | Foundation Classes (core platform) | `YFC0001` — duplicate key violation on insert (e.g., duplicate order) |
| `YFS` | Fulfillment Suite (order/shipment) | `YFS10137` — duplicate order number, `YFS10424` — record not found |
| `YCP` | Core Platform (auth/config) | `YCP0045` — user not authorized for transaction |
| `YDM` | Data Model (catalog/items) | Item-related validation failures |
| `YCD` | Configuration Deployment | Deployment and migration errors |

**HTTP-Level Errors**:
| Code | Meaning | Resolution |
|------|---------|------------|
| 401 | Unauthorized | Missing or invalid auth headers |
| 403 | Forbidden | User lacks API permissions or IP not whitelisted |
| 500 + `SRVE0295E` | Server error | Application server issue — check WebSphere/Liberty logs |

**Best practice**: Search your Sterling server logs for the exact error code. IBM Knowledge Center documents errors in context of specific APIs rather than as a master list.

### Invoice Not Generating (Most Common Issue)
**Symptom**: Order shipped but no invoice appears.
**Root Cause**: Sterling queues invoice generation in `YFS_TASK_Q` with `AvailableDate` set to a future time (typically ~10 minutes). The agent server picks up the task only when `AvailableDate` has passed.

**Self-Healing Recovery**:
```
1. getShipmentListForOrder → extract ShipmentKey
2. manageTaskQueue(DataKey=ShipmentKey, DataType=ShipmentKey)
   → Returns TaskQKey + AvailableDate
3. manageTaskQueue(TaskQKey=xxx, AvailableDate={past_date})
   → Moves AvailableDate to past, agent picks up immediately
4. Poll getOrderInvoiceList every 10s (invoice appears in ~50-80s)
5. processOrderPayments(OrderNo=xxx, EnterpriseCode=xxx)
   → Collect payment, PaymentStatus → INVOICED
```

### Order Stuck in Status
**Diagnosis Steps**:
1. `getOrderList` — check MinOrderStatus, MaxOrderStatus, HoldFlag
2. `getOrderAuditList` — check last modification, who changed it, when
3. Check for holds: `HoldFlag="Y"` means active hold blocking the pipeline
4. Check task queue: `manageTaskQueue(DataKey=OrderHeaderKey)` — any pending tasks?
5. Check pipeline configuration — is the next transaction configured? Are conditions met?
6. Check agent server — is the relevant agent running and processing tasks?

### Shipment Issues
| Problem | Check | Fix |
|---------|-------|-----|
| No shipment created | `getShipmentListForOrder` returns empty | Verify `releaseOrder` was called and succeeded |
| Shipment stuck | `getShipmentDetails` → check Status | Verify `confirmShipment` XML structure |
| Wrong ShipNode | `getOrderDetails` → OrderLine.ShipNode | `changeOrder` with `Override="Y"` to reassign |
| Missing TrackingNo | `getShipmentDetails` | `changeShipment` to add TrackingNo |
| Container errors | Check Container XML | Ensure ContainerNo is unique, ContainerDetails contains ShipmentLine |

### Payment Issues
| Problem | Check | Fix |
|---------|-------|-----|
| PaymentStatus stuck at AUTHORIZED | processOrderPayments not called | Call `processOrderPayments` with `<Order>` root |
| AWAIT_PAY_INFO | Payment method or details invalid | Verify PaymentMethod, PaymentDetails, ChargeType |
| Payment hold blocking pipeline | HoldType includes payment hold | Resolve via `changeOrder` with OrderHoldTypes |

### Return Cycle Issues
| Problem | Check | Fix |
|---------|-------|-----|
| Return order not created | `getOrderList(DocumentType=0003)` empty | Verify service name and XML structure |
| Return tracking not updating | Check Extn fields on Shipment | Verify ExtnStatusCode values match implementation |
| Receipt failing | Check ReceiptLine XML | **ReceiptLine.OrderNo = ItemID**, NOT the order number |
| Credit invoice missing | Async processing via task queue | Poll `getOrderInvoiceList(DocumentType=0003)` |

---

## 6. Services vs APIs

### Understanding the Distinction
- **Service** (IsFlow=Y): Orchestrated workflow — may call multiple APIs, evaluate conditions, trigger actions and events. Invoked via `/smcfs/restapi/executeFlow/{serviceName}`
- **API** (IsFlow=N): Direct database operation — single CRUD action. Invoked via `/smcfs/restapi/invoke/{apiName}`
- On XAPI Tester: check "Is a Service?" checkbox for flows, uncheck for direct APIs

### Common Service Naming Patterns
Implementations typically name services with a prefix identifying the enterprise or module:
```
{enterprise}_{function}Svc          — e.g., ACME_CreateOrderSync
{enterprise}_{function}Service      — e.g., RETAIL_ProcessShipConfirmation
{enterprise}WE_{function}Svc        — Western Europe variant
{enterprise}_Process{Entity}Update  — e.g., ACME_ProcessPODUpdate
```

### Typical O2C Lifecycle Step-to-API Mapping
| Step | Action | Typically API or Service? | Standard API Name |
|------|--------|--------------------------|-------------------|
| Create Order | Create | Service (custom flow) | `createOrder` (base API) |
| Assign ShipNode | Modify | API | `changeOrder` |
| Resolve Holds | Modify | API | `changeOrder` |
| Process Payment | Payment | Service (custom flow) | `processOrderPayments` (base API) |
| Schedule | Schedule | API | `scheduleOrder` |
| Release | Release | API | `releaseOrder` |
| Ship | Confirm | Service (custom flow) | `confirmShipment` (base API) |
| Ship Confirm / SOA | Acknowledge | Service (custom flow) | Implementation-specific |
| Invoice | Generate | Agent (automatic) | Via `YFS_TASK_Q` agent |
| Deliver | POD Update | Service (custom flow) | Implementation-specific |
| Create Return | Return | Service (custom flow) | Implementation-specific |
| Return Tracking | POD Update | Service (custom flow) | Implementation-specific |
| Return Complete | Receipt | Service (custom flow) | Implementation-specific |

---

## 7. Integration Patterns

### REST API Client (TypeScript)
```typescript
export class SterlingOMSClient {
  constructor(
    private baseUrl: string,     // e.g., "https://oms.example.com"
    private authHeaders: Record<string, string>,
    private enterpriseCode: string,
  ) {}

  async invoke<T>(apiName: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/smcfs/restapi/invoke/${apiName}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders },
      body: JSON.stringify({ EnterpriseCode: this.enterpriseCode, ...body }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} from ${apiName}: ${text.slice(0, 200)}`);
    }
    return response.json();
  }
}
```

### Playwright JSP Automation
```typescript
// For Services (IsFlow=Y)
async function invokeService(page: Page, serviceName: string, xml: string) {
  await page.goto(XAPI_URL, { waitUntil: 'networkidle' });
  await page.locator('input[name="YFSEnvironment.userId"]').fill(userId);
  await page.locator('input[name="YFSEnvironment.password"]').fill(password);
  const checkbox = page.locator('input[name="InvokeFlow"]');
  if (!(await checkbox.isChecked())) await checkbox.check();
  await page.locator('input[name="ServiceName"]').fill(serviceName);
  await page.locator('textarea[name="InteropApiData"]').fill(xml);
  await page.locator('input[name="btnTest"]').click();
  await page.waitForLoadState('networkidle', { timeout: 60_000 });
  return page.evaluate(() => document.body.innerText);
}

// For APIs (IsFlow=N) — same pattern but uncheck InvokeFlow and use dropdown
async function invokeAPI(page: Page, apiName: string, xml: string) {
  // ... same setup, then:
  const checkbox = page.locator('input[name="InvokeFlow"]');
  if (await checkbox.isChecked()) await checkbox.uncheck();
  await page.locator('select[name="ApiName"]').selectOption(apiName);
  // ... same submit
}
```

### Retry Pattern
```typescript
// Sterling retryable HTTP status codes: 429, 502, 503, 504
// Use exponential backoff: baseDelay * 2^(attempt-1) + random(0-500ms)
// Non-retryable: 400, 401, 403, 404, 500 (application errors)
```

### Output Template Optimization
- Default API output includes ALL fields — causes performance issues on large orders
- Use `manageApiTemplate` API to create custom output templates
- Templates are stored in the database and referenced by template name
- Always tune output templates for high-volume API calls
- Example: `getOrderList` default returns 200+ fields per order — a custom template returning only OrderNo, Status, and OrderDate cuts response size by 90%

### Pagination
- Use `MaximumRecords` attribute to limit results per call
- Response includes `LastRecordSet` ("Y"/"N") and `LastOrderHeaderKey` for cursor-based pagination
- Iterate by passing `LastOrderHeaderKey` from previous response as input to next call

---

## 8. Database Tables Reference

### Core Tables
| Table | Purpose | Key Column |
|-------|---------|-----------|
| `YFS_ORDER_HEADER` | Order master | OrderHeaderKey |
| `YFS_ORDER_HEADER_EXTN` | Custom order header fields | OrderHeaderKey (FK) |
| `YFS_ORDER_LINE` | Order lines | OrderLineKey |
| `YFS_ORDER_LINE_EXTN` | Custom order line fields | OrderLineKey (FK) |
| `YFS_ORDER_RELEASE` | Releases to ship nodes | OrderReleaseKey |
| `YFS_ORDER_HOLD_TYPE` | Active holds on orders | OrderHoldTypeKey |
| `YFS_SHIPMENT` | Shipments | ShipmentKey |
| `YFS_SHIPMENT_LINE` | Shipment lines | ShipmentLineKey |
| `YFS_ORDER_INVOICE` | Invoices | OrderInvoiceKey |
| `YFS_ORDER_AUDIT` | Audit trail | OrderAuditKey |
| `YFS_TASK_Q` | Background task queue | TaskQKey |
| `YFS_PAYMENT` | Payment records | PaymentKey |
| `YFS_INVENTORY_ITEM` | Inventory items | InventoryItemKey |
| `YFS_PERSON_INFO` | Address records | PersonInfoKey |
| `YFS_STATUS` | Pipeline status definitions | StatusKey |
| `YFS_COMMON_CODE` | Lookup codes and types | CommonCodeKey |

### Extension Tables (`_EXTN`)
Sterling supports custom extension tables for every core entity. These are mapped via `<Extn>` elements in XML. Column names must start with `Extn` prefix (e.g., `ExtnBrand`, `ExtnCustomField1`).

### Task Queue (YFS_TASK_Q) — Critical for Troubleshooting
| Column | Purpose |
|--------|---------|
| TaskQKey | Primary key |
| DataKey | Entity key the task relates to (e.g., ShipmentKey) |
| DataType | Type of entity (e.g., "ShipmentKey", "OrderHeaderKey") |
| AvailableDate | When the task becomes eligible for agent pickup |
| TransactionKey | Which pipeline transaction to execute |
| Status | 0=Pending, 1=InProgress, 2=Completed |

Background agents poll this table on a configured interval. Tasks only execute when `AvailableDate <= NOW()` and `Status = 0`.

---

## 9. Environment Patterns

### Typical Sterling Environment Setup
| Env | Purpose | Auth Pattern | XAPI Tester? |
|-----|---------|-------------|--------------|
| DEV | Development | Basic auth or none (VPN-gated) | Yes |
| SIT | System Integration Testing | Basic auth or VPN-gated | Yes |
| UAT | User Acceptance Testing | Basic auth | Yes |
| PERF | Performance testing | Basic auth | Yes |
| PRD | Production | OAuth/SSO/certificate | **No** |

### Environment-Specific Considerations
- **Non-prod**: XAPI HTTP Tester available. Enterprise codes and catalogs may differ between environments.
- **Production**: No XAPI tester. Use REST clients or customized UIs only. Agent server configurations may have different polling intervals.
- **Credentials**: Never hardcode in source files. Use environment configuration or secrets management.
- **Base URL**: Pass just `https://{host}` to REST clients — the `/smcfs/restapi/invoke/` path is appended by the client.
- **Enterprise codes**: Often differ between environments (e.g., `ACME_DEV` vs `ACME_US`). Always parameterize.

---

## 10. Verification Patterns

### After Each Lifecycle Step, Verify:
| Step | What to Verify | API | Key Fields |
|------|---------------|-----|-----------|
| Create Order | Order exists | `getOrderList` | OrderNo, DocumentType, PaymentStatus |
| Assign ShipNode | ShipNode set | `getOrderDetails` | OrderLine.ShipNode |
| Resolve Hold | Hold cleared | `getOrderList` | HoldFlag != "Y" |
| Process Payment | Payment updated | `getOrderList` | PaymentStatus in [AUTHORIZED, PAID, SETTLED] |
| Schedule | Status progressed | `getOrderList` | MinOrderStatus >= Scheduled |
| Release | Status progressed | `getOrderList` | MinOrderStatus >= Released |
| Ship | Shipment created | `getShipmentListForOrder` | ShipmentNo, TrackingNo, SCAC |
| Ship Confirm | Status progressed | `getOrderList` | MinOrderStatus >= Shipped |
| Invoice | Invoice generated | `getOrderInvoiceList` | InvoiceNo, TotalAmount > 0 |
| Deliver | Delivery recorded | `getOrderList` | MinOrderStatusDesc contains "Deliver" |
| Create Return | Return order exists | `getOrderList(DocType=0003)` | DocumentType=0003 |
| Return Tracking | Status progressed | `getOrderList(DocType=0003)` | MinOrderStatus |
| Return Complete | Terminal status | `getOrderList(DocType=0003)` + `getOrderInvoiceList(DocType=0003)` | Credit invoice |

### Batch Verification Pattern (1 call per step)
```typescript
// Extract all field checks from a single API response
const res = await oms.getOrderList({ OrderNo, EnterpriseCode });
const order = res.Order[0];

const checks = [
  { field: 'OrderNo', expected: orderNo, actual: order.OrderNo },
  { field: 'DocumentType', expected: '0001', actual: order.DocumentType },
  { field: 'PaymentStatus', expected: 'AUTHORIZED', actual: order.PaymentStatus },
  { field: 'HoldFlag', expected: 'N', actual: order.HoldFlag },
];
```

---

## 11. Common Pitfalls

1. **`ReceiptLine.OrderNo` = ItemID, NOT order number** — The `OrderNo` attribute on `<ReceiptLine>` in return receipt XML must contain the ItemID
2. **`manageTaskQueue` root element** — Use `<TaskQueue>` for `manageTaskQueue`, but `<GetTaskQueueDataInput>` for `getTaskQueueDataList`
3. **`processOrderPayments` root element** — Use `<Order>`, NOT `<ProcessOrderPayment>`
4. **`changeOrder` requires `Override="Y"`** — Without it, changes are silently ignored
5. **Invoice generation is async** — Sterling queues in `YFS_TASK_Q` with a future `AvailableDate`. Background agents pick it up later.
6. **UOM/ProductClass mismatch between environments** — Item catalog attributes (UnitOfMeasure, ProductClass) may differ between SIT/UAT/PRD. Always verify against the target environment's catalog.
7. **Enterprise code differs per environment** — Never hardcode. Always parameterize.
8. **REST base URL** — Pass just `https://{host}`, NOT `https://{host}/smcfs/restapi`. The client appends the path.
9. **Status codes are pipeline-specific** — Numeric status values are configured per pipeline in `YFS_STATUS`. Never assume a status code means the same thing across implementations.
10. **Extension fields require `<Extn>` wrapper** — Custom fields must be nested inside `<Extn>` elements and map to `_EXTN` database tables. Column names must start with `Extn` prefix.
11. **User exits cannot modify data** — User exit code can only call read-only APIs. Calling modifying APIs (like `changeOrder`) inside a user exit will cause transaction conflicts.
12. **Output templates affect response shape** — Default templates return everything. Custom implementations may have templates that omit fields you expect. Always verify which template is active.
13. **Browser crash during long polling** — If automating via Playwright/JSP, long polling loops (e.g., waiting for invoice) can crash the browser tab. Open a fresh page before continuing.
