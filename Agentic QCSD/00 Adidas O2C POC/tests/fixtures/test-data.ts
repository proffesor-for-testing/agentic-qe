/**
 * Sterling OMS Test Data Fixtures — Adidas O2C POC
 *
 * Known test data from SIT Omni environment.
 * Source: Verified via Postman + curl against stgem.omnihub.3stripes.net
 */

// ============================================================================
// Known Orders
// ============================================================================

export const KNOWN_ORDERS = {
  /**
   * ATH90004814 — ShipToHome, Partially Return Completed
   * Verified: 2026-02-25 via curl + Postman
   */
  DELIVERED_WITH_RETURN: {
    orderNo: 'ATH90004814',
    documentType: '0001',
    enterpriseCode: 'adidasEM_TH',
    orderHeaderKey: '4026021605452629162782896',
    status: 'Partially Return Completed',
    minOrderStatus: '3700.0005',
    minOrderStatusDesc: 'Order Delivered',
    maxOrderStatus: '3700.03',
    maxOrderStatusDesc: 'Return Completed',
    paymentStatus: 'PAID',
    orderType: 'ShipToHome',
    entryType: 'web',
    enteredBy: 'storefront',
    currency: 'THB',
    grandTotal: '3100.00',
    lineSubTotal: '3000.00',
    grandCharges: '100.00',
    grandTax: '0.00',
    grandDiscount: '0.00',
    customerEmail: 'umarani.thirumala@externals.adidas.com',
    customerPONo: 'V6ICAX8PD5V2WLBS',
    orderName: 'V6ICAX8PD5V2WLBS',
    orderDate: '2026-02-16T12:10:45+00:00',
    allocationRuleID: 'SCH_SEA',
    notificationReference: 'AEP',
  },
} as const;

// ============================================================================
// Document Types
// ============================================================================

export const DOCUMENT_TYPES = {
  SALES_ORDER: '0001',
  PLANNED_ORDER: '0002',
  RETURN_ORDER: '0003',
  PURCHASE_ORDER: '0005',
} as const;

// ============================================================================
// Order Status Codes (Sterling OMS lifecycle)
// ============================================================================

export const ORDER_STATUS_CODES = {
  // Standard Sterling OMS status milestones
  CREATED: '1100',
  SCHEDULED: '2000',
  RELEASED: '3200',
  SHIPPED: '3700',
  DELIVERED: '3700.0005',
  RETURN_CREATED: '3700.01',
  RETURN_COMPLETED: '3700.03',
  CANCELLED: '9000',
} as const;

// ============================================================================
// Enterprise Codes
// ============================================================================

export const ENTERPRISES = {
  ADIDAS_TH: 'adidasEM_TH',
  // Add other enterprise codes as discovered
} as const;

// ============================================================================
// API Endpoints
// ============================================================================

export const STERLING_APIS = {
  // Order Management
  getOrderList: 'getOrderList',
  getOrderDetails: 'getOrderDetails',
  getOrderLineList: 'getOrderLineList',
  getOrderLineDetails: 'getOrderLineDetails',
  getOrderReleaseList: 'getOrderReleaseList',
  getOrderReleaseDetails: 'getOrderReleaseDetails',
  getOrderAuditList: 'getOrderAuditList',
  changeOrder: 'changeOrder',
  changeOrderStatus: 'changeOrderStatus',

  // Shipment
  getShipmentListForOrder: 'getShipmentListForOrder',
  getShipmentDetails: 'getShipmentDetails',

  // Invoice
  getOrderInvoiceList: 'getOrderInvoiceList',
  getOrderInvoiceDetails: 'getOrderInvoiceDetails',

  // Inventory
  getAvailableInventory: 'getAvailableInventory',
  getStoreAvailability: 'getStoreAvailability',

  // Returns
  getOrdersForReturn: 'getOrdersForReturn',
  processReturnOrder: 'processReturnOrder',
} as const;

// ============================================================================
// Primary Database Tables
// ============================================================================

export const PRIMARY_TABLES = {
  transaction: [
    'YFS_ORDER_HEADER',
    'YFS_ORDER_LINE',
    'YFS_ORDER_RELEASE',
    'YFS_ORDER_RELEASE_STATUS',
    'YFS_SHIPMENT',
    'YFS_SHIPMENT_LINE',
    'YFS_ORDER_INVOICE',
    'YFS_ORDER_INVOICE_DETAIL',
    'YFS_INVENTORY_SUPPLY',
    'YFS_INVENTORY_DEMAND',
    'YFS_SHIPMENT_CONTAINER',
    'YFS_TAX_BREAKUP',
    'YFS_HEADER_CHARGES',
    'YFS_LINE_CHARGES',
    'YFS_NOTES',
    'YFS_RECEIPT_HEADER',
    'YFS_RECEIPT_LINE',
  ],
  master: [
    'YFS_ITEM',
    'YFS_INVENTORY_ITEM',
  ],
  configuration: [
    'YFS_COMMON_CODE',
    'YFS_SHIP_NODE',
    'YFS_STATUS',
    'YFS_PIPELINE',
    'YFS_ERROR_CODE',
    'YFS_ERROR_CAUSE_ACTION',
  ],
} as const;

// ============================================================================
// Expected Response Fields (for schema validation)
// ============================================================================

export const ORDER_RESPONSE_REQUIRED_FIELDS = [
  'OrderHeaderKey',
  'OrderNo',
  'DocumentType',
  'EnterpriseCode',
  'Status',
  'MinOrderStatus',
  'MaxOrderStatus',
  'PaymentStatus',
  'OrderDate',
  'EntryType',
  'OrderType',
  'InvoicedTotals',
  'OverallTotals',
  'PriceInfo',
] as const;

export const FINANCIAL_TOTALS_FIELDS = [
  'GrandCharges',
  'GrandTax',
  'HdrTax',
  'GrandTotal',
] as const;

export const PRICE_INFO_FIELDS = [
  'Currency',
  'TotalAmount',
  'EnterpriseCurrency',
  'ReportingConversionRate',
  'ReportingConversionDate',
] as const;
