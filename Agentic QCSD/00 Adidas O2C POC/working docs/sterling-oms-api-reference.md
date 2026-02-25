# Sterling OMS API & Database Reference — Adidas O2C POC

**Date:** 2026-02-25
**Environment:** SIT Omni (stgem.omnihub.3stripes.net)
**Enterprise:** adidasEM_TH (Adidas Thailand)
**Platform:** IBM Sterling Order Management (OmniHub)

---

## 1. REST API

### Base URL
```
https://stgem.omnihub.3stripes.net/smcfs/restapi/invoke/{apiName}
```

### Authentication
- Headers (10 in Postman) — likely includes Bearer token or basic auth
- Content-Type: `application/json`

### Verified Endpoint: `getOrderList`

**Method:** POST
**URL:** `https://stgem.omnihub.3stripes.net/smcfs/restapi/invoke/getOrderList`

**Request:**
```json
{
  "DocumentType": "0001",
  "OrderNo": "ATH90004814",
  "EnterpriseCode": "adidasEM_TH"
}
```

**Response (200 OK, 1.27s, 1.58 KB):**
```json
{
  "Order": [
    {
      "CarrierAccountNo": "",
      "OrderType": "ShipToHome",
      "MinOrderStatus": "3700.0005",
      "InvoicedTotals": {
        "GrandCharges": "100.00",
        "GrandTax": "0.00",
        "HdrTax": "0.00",
        "GrandTotal": "3100.00"
      },
      "MinOrderStatusDesc": "Order Delivered",
      "EnterpriseCode": "adidasEM_TH",
      "NotifyAfterShipmentFlag": "N",
      "PaymentStatus": "PAID",
      "TaxExemptionCertificate": "",
      "Status": "Partially Return Completed",
      "TaxPayerId": "",
      "CarrierServiceCode": "",
      "PriorityNumber": "0",
      "PersonalizeCode": "",
      "TaxJurisdiction": "",
      "CustomerEMailID": "umarani.thirumala@externals.adidas.com",
      "TermsCode": "",
      "NotificationType": "HostIndicator",
      "SellerOrganizationCode": "adidasEM_TH",
      "TaxExemptionFlag": "N",
      "TotalAdjustmentAmount": "0.00",
      "isHistory": "N",
      "OrderName": "V6ICAX8PD5V2WLBS",
      "ScacAndService": "",
      "HoldReasonCode": "",
      "PriorityCode": "",
      "DeliveryCode": "",
      "OrderNo": "ATH90004814",
      "SearchCriteria1": "TOGGLE",
      "OverallTotals": {
        "GrandCharges": "100.00",
        "GrandTax": "0.00",
        "HdrTax": "0.00",
        "LineSubTotal": "3000.00",
        "HdrDiscount": "0.00",
        "GrandTotal": "3100.00",
        "HdrCharges": "100.00",
        "GrandDiscount": "0.00",
        "HdrTotal": "100.00"
      },
      "SearchCriteria2": "",
      "PriceInfo": {
        "ReportingConversionDate": "2026-02-16T05:45:28+00:00",
        "Currency": "THB",
        "TotalAmount": "3100.00",
        "EnterpriseCurrency": "THB",
        "ReportingConversionRate": "1.00"
      },
      "MaxOrderStatus": "3700.03",
      "DraftOrderFlag": "N",
      "SCAC": "",
      "Division": "",
      "EnteredBy": "storefront",
      "OrderHeaderKey": "4026021605452629162782896",
      "OriginalTax": "0.00",
      "DocumentType": "0001",
      "Purpose": "",
      "MaxOrderStatusDesc": "Return Completed",
      "CustomerPONo": "V6ICAX8PD5V2WLBS",
      "OrderDate": "2026-02-16T12:10:45+00:00",
      "EntryType": "web",
      "CustCustPONo": "",
      "NotificationReference": "AEP",
      "AllocationRuleID": "SCH_SEA",
      "ScacAndServiceKey": "",
      "RemainingTotals": {
        "GrandCharges": "0.00",
        "GrandTax": "0.00",
        "HdrTax": "0.00",
        "HdrCharges": "0.00",
        "GrandDiscount": "0.00",
        "HdrTotal": "0.00",
        "GrandTotal": "0.00",
        "LineSubTotal": "0.00",
        "HdrDiscount": "0.00",
        "OtherCharges": "100.00"
      },
      "FreightTerms": "",
      "HoldFlag": "N",
      "ChargeActualFreightFlag": "N"
    }
  ],
  "ReadFromHistory": "",
  "TotalOrderList": "1",
  "LastRecordSet": "Y",
  "LastOrderHeaderKey": "4026021605452629162782896"
}
```

### Document Types
| Code | Type |
|------|------|
| `0001` | Sales Order |
| `0002` | Planned Order |
| `0003` | Return Order |
| `0005` | Purchase Order |

### Order Status Codes (MinOrderStatus / MaxOrderStatus)
| Status | Description |
|--------|-------------|
| `3700.0005` | Order Delivered |
| `3700.03` | Return Completed |

### Key Query Parameters (getOrderList)
- `DocumentType`, `OrderNo`, `EnterpriseCode` (verified)
- `OrderDate`, `Status`, `PaymentStatus`, `EntryType`
- `CustomerEMailID`, `CustomerPONo`, `OrderName`
- `ShipNode`, `SellerOrganizationCode`, `BuyerOrganizationCode`
- `HoldFlag`, `DraftOrderFlag`, `AllocationRuleID`
- `SearchCriteria1`, `SearchCriteria2` (custom fields)
- `MaximumRecords`, `Range` (pagination)

---

## 2. Available Sterling OMS API Methods (84 Order APIs)

### Create Operations
| API | Description |
|-----|-------------|
| `createOrder` | Create new order |
| `createOrderFromQuote` | Create from quote |
| `createOrderFromMasterOrder` | Create from master |
| `createChainedOrder` | Create chained order |
| `createDerivedOrder` | Create derived order |
| `importOrder` | Import order |

### Read Operations
| API | Description |
|-----|-------------|
| `getOrderList` | Get filtered order list (**verified working**) |
| `getOrderDetails` | Get order details by key |
| `getOrderLineDetails` | Get order line details |
| `getOrderLineList` | Get order lines |
| `getOrderLineStatusList` | Get order line statuses |
| `getOrderReleaseDetails` | Get release details |
| `getOrderReleaseList` | Get release list |
| `getOrderInvoiceList` | Get invoices |
| `getOrderInvoiceDetails` | Get invoice details |
| `getOrderAuditList` | Get audit trail |
| `getShipmentListForOrder` | Get shipments for order |

### Modify Operations
| API | Description |
|-----|-------------|
| `changeOrder` | Modify order |
| `changeOrderStatus` | Change status |
| `changeOrderSchedule` | Change schedule |
| `changeRelease` | Change release |
| `changeOrderInvoice` | Change invoice |
| `addLineToOrder` | Add line |
| `deleteOrder` | Delete order |
| `splitLine` | Split order line |
| `scheduleOrder` | Schedule order |
| `releaseOrder` | Release order |
| `shortOrder` | Mark order short |
| `repriceOrder` | Reprice order |

### Return Operations
| API | Description |
|-----|-------------|
| `getOrdersForReturn` | Get return-eligible orders |
| `executeReturnPolicy` | Execute return policy |
| `processReturnOrder` | Process return |
| `sendReturnReleaseToDCS` | Send return to DCS |

### Inventory Operations
| API | Description |
|-----|-------------|
| `getAvailableInventory` | Check available inventory |
| `getStoreAvailability` | Check store availability |
| `reserveAvailableInventory` | Reserve inventory |
| `monitorItemAvailability` | Monitor availability |

### Invoice Operations
| API | Description |
|-----|-------------|
| `createOrderInvoice` | Create invoice |
| `updateMasterInvoiceNo` | Update master invoice |
| `recordInvoiceCreation` | Record invoice |

---

## 3. Primary Database Tables

### Transaction Tables

| Table | Primary Key | Description |
|-------|-------------|-------------|
| `YFS_ORDER_HEADER` | ORDER_HEADER_KEY (Char 24) | Root order entity — all orders, returns, POs |
| `YFS_ORDER_LINE` | ORDER_LINE_KEY (Char 24) | Order line items with pricing, quantities |
| `YFS_ORDER_RELEASE` | ORDER_RELEASE_KEY (Char 24) | Fulfillment releases from orders |
| `YFS_ORDER_RELEASE_STATUS` | ORDER_RELEASE_STATUS_KEY (Char 24) | Status tracking per release/line |
| `YFS_SHIPMENT` | SHIPMENT_KEY (Char 24) | Physical shipments with carrier, tracking |
| `YFS_SHIPMENT_LINE` | SHIPMENT_LINE_KEY (Char 24) | Items within a shipment |
| `YFS_ORDER_INVOICE` | ORDER_INVOICE_KEY (Char 24) | Invoices (Orders, Returns, Credit, Debit) |
| `YFS_ORDER_INVOICE_DETAIL` | ORDER_INVOICE_DETAIL_KEY (Char 24) | Invoice line items |
| `YFS_INVENTORY_SUPPLY` | INVENTORY_SUPPLY_KEY (Char 24) | Available inventory at nodes |
| `YFS_INVENTORY_DEMAND` | INVENTORY_DEMAND_KEY (Char 24) | Inventory demand/reservations |

### Master/Configuration Tables

| Table | Type | Description |
|-------|------|-------------|
| `YFS_ITEM` | Master | Item master data |
| `YFS_INVENTORY_ITEM` | Master | Inventory item master |
| `YFS_COMMON_CODE` | Config | System-wide code lookups |
| `YFS_SHIP_NODE` | Config | Ship node/warehouse config |
| `YFS_STATUS` | Config | Status definitions |
| `YFS_PIPELINE` | Config | Pipeline/workflow definitions |
| `YFS_ERROR_CODE` | Config | Error code definitions |
| `YFS_ERROR_CAUSE_ACTION` | Config | Error cause-action mappings |
| `YFS_SHIPMENT_CONTAINER` | Transaction | Containers within shipments |
| `YFS_TAX_BREAKUP` | Transaction | Tax breakup per line/header |
| `YFS_HEADER_CHARGES` | Transaction | Header-level charges |
| `YFS_LINE_CHARGES` | Transaction | Line-level charges |
| `YFS_NOTES` | Transaction | Order/line notes |
| `YFS_RECEIPT_HEADER` | Transaction | Receiving headers |
| `YFS_RECEIPT_LINE` | Transaction | Receiving line items |

---

## 4. Entity Relationships

```
YFS_ORDER_HEADER (1) ──── (N) YFS_ORDER_LINE
       │                           │
       │                           ├── (N) YFS_ORDER_RELEASE_STATUS
       │                           │
       │                           └── (N) YFS_ORDER_INVOICE_DETAIL
       │
       ├── (N) YFS_ORDER_RELEASE
       │           │
       │           └── (N) YFS_ORDER_RELEASE_STATUS
       │
       ├── (N) YFS_ORDER_INVOICE ──── (N) YFS_ORDER_INVOICE_DETAIL
       │           │
       │           └── (1) YFS_SHIPMENT (optional)
       │
       └── (N) YFS_HEADER_CHARGES

YFS_SHIPMENT (1) ──── (N) YFS_SHIPMENT_LINE
       │                      │
       │                      ├── → YFS_ORDER_LINE (FK)
       │                      └── → YFS_ORDER_RELEASE (FK)
       │
       └── (N) YFS_SHIPMENT_CONTAINER

YFS_INVENTORY_ITEM (1) ──── (N) YFS_INVENTORY_SUPPLY
                       └── (N) YFS_INVENTORY_DEMAND
```

---

## 5. Key Fields for Testing

### Order Identification
- `OrderHeaderKey` — Internal unique key (24-char)
- `OrderNo` — Business order number (e.g., ATH90004814)
- `CustomerPONo` — Customer-facing PO number
- `EnterpriseCode` — Enterprise identifier (e.g., adidasEM_TH)
- `DocumentType` — 0001 (Sales), 0003 (Return)

### Status Tracking
- `MinOrderStatus` / `MaxOrderStatus` — Range of statuses across all lines
- `Status` — Overall order status text
- `PaymentStatus` — PAID, AUTHORIZED, etc.
- `HoldFlag` / `HoldReasonCode` — Hold state

### Financial
- `OverallTotals.GrandTotal` — Grand total
- `OverallTotals.LineSubTotal` — Line subtotal
- `OverallTotals.GrandCharges` — Charges
- `OverallTotals.GrandTax` — Tax
- `PriceInfo.Currency` — Currency (THB for Thailand)
- `PriceInfo.TotalAmount` — Total amount

### Customer
- `CustomerEMailID` — Customer email
- `EnteredBy` — "storefront" for web orders
- `EntryType` — "web" for online orders
- `OrderName` — Customer-facing order name

### Fulfillment
- `OrderType` — "ShipToHome" for direct-to-consumer
- `AllocationRuleID` — Scheduling rule (e.g., SCH_SEA)
- `NotificationReference` — Notification system (e.g., AEP)

---

## 6. Sample Test Data

**Known Working Order:**
- OrderNo: `ATH90004814`
- EnterpriseCode: `adidasEM_TH`
- DocumentType: `0001` (Sales Order)
- Status: `Partially Return Completed`
- MinOrderStatus: `3700.0005` (Order Delivered)
- MaxOrderStatus: `3700.03` (Return Completed)
- GrandTotal: `3100.00 THB`
- PaymentStatus: `PAID`
- OrderDate: `2026-02-16T12:10:45+00:00`
- EntryType: `web` (storefront)
- Customer: `umarani.thirumala@externals.adidas.com`
