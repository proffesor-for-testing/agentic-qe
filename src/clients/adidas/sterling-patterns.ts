/** Sterling OMS Patterns — Adidas O2C Knowledge Base */

// ============================================================================
// Types
// ============================================================================

export interface SterlingPattern {
  name: string;
  description: string;
  patternType: 'api-contract' | 'error-signature' | 'recovery-strategy' | 'status-mapping';
  tags: string[];
  content: string;
  confidence: number;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

export const STERLING_PATTERNS: SterlingPattern[] = [
  // --- Recovery Strategies ---
  {
    name: 'invoice-delay-recovery',
    description: 'Self-healing: Invoice not generated after ship confirm due to future AvailableDate in YFS_TASK_Q',
    patternType: 'recovery-strategy',
    tags: ['sterling-oms', 'adidas', 'self-healing', 'invoice', 'task-queue'],
    content: [
      'PROBLEM: After Ship Confirm (Step 8), Sterling queues an invoice task in YFS_TASK_Q.',
      'The AvailableDate is set ~10min in the future, so the Sterling job won\'t pick it up immediately.',
      'Result: No invoice → Collected=0 → Step 11 fails with NaN.',
      '',
      'FIX SEQUENCE:',
      '1. Get ShipmentKey via getShipmentListForOrder(OrderNo)',
      '2. Call manageTaskQueue(DataKey=ShipmentKey, DataType=ShipmentKey) to find task',
      '3. Call manageTaskQueue again to move AvailableDate to past epoch',
      '4. Poll getOrderInvoiceList until invoice appears',
      '5. Call processOrderPayments to collect payment',
      '6. Verify PaymentStatus = INVOICED',
      '',
      'EVIDENCE: Dev team fix on 2026-02-27 for APT92045131.',
      'ShipmentKey=302602271501069280846466 had future AvailableDate.',
      'Confirmed on APT75174909: AvailableDate was 10min ahead.',
    ].join('\n'),
    confidence: 0.95,
  },
  {
    name: 'task-queue-data-key-pattern',
    description: 'manageTaskQueue uses DataKey=ShipmentKey and acts as both query AND update',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'adidas', 'task-queue', 'manage-task-queue'],
    content: [
      'KEY LEARNING: manageTaskQueue with DataKey+DataType acts as both query AND update.',
      'It returns the task record with TaskQKey, which can be used for targeted updates.',
      '',
      'USAGE:',
      '  Query: manageTaskQueue({ DataKey: shipmentKey, DataType: "ShipmentKey" })',
      '  Update: manageTaskQueue({ TaskQKey: taskQKey, AvailableDate: pastDate })',
      '',
      'The DataType field determines what Sterling searches for in YFS_TASK_Q.',
      'ShipmentKey is the most reliable DataKey for invoice-related tasks.',
    ].join('\n'),
    confidence: 0.9,
  },
  {
    name: 'process-order-payments-xml',
    description: 'processOrderPayments uses <Order> root element, not <ProcessOrderPayment>',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'adidas', 'payments', 'xml-template'],
    content: [
      'CRITICAL: processOrderPayments XAPI call uses <Order> as the root XML element.',
      'NOT <ProcessOrderPayment> — Sterling will reject with "Invalid document element".',
      '',
      'Correct XML:',
      '  <Order OrderNo="APTxxxxxxxx" EnterpriseCode="adidas_PT" DocumentType="0001"/>',
      '',
      'This triggers Sterling to collect all outstanding payments on the order.',
      'Called after manageTaskQueue fix to force invoice collection.',
    ].join('\n'),
    confidence: 0.9,
  },
  {
    name: 'browser-crash-recovery',
    description: 'Fresh browser page before return cycle after long polling prevents stale state crashes',
    patternType: 'recovery-strategy',
    tags: ['sterling-oms', 'adidas', 'browser', 'playwright', 'recovery'],
    content: [
      'PROBLEM: After long polling during forward flow (Steps 8-12, up to 5+ minutes),',
      'the browser page becomes stale. Attempting return flow checks causes navigation timeouts.',
      '',
      'FIX: Create a fresh page context before entering the return verification cycle.',
      'Close the existing page, create new one from the same browser context.',
      'This resets all navigation state without requiring full browser restart.',
    ].join('\n'),
    confidence: 0.7,
  },

  // --- Status Mappings ---
  {
    name: 'order-status-codes',
    description: 'Sterling order lifecycle status code progression',
    patternType: 'status-mapping',
    tags: ['sterling-oms', 'adidas', 'status-codes', 'order-lifecycle'],
    content: [
      'ORDER STATUS PROGRESSION:',
      '  1100 → Created (order placed)',
      '  1500 → Scheduled (inventory reserved)',
      '  2000 → Scheduled to Release',
      '  3200 → Released (pick/pack ready)',
      '  3350 → Sent to Node (WMS notified)',
      '  3700 → Shipped (ship confirm received)',
      '  9000 → Delivered (POD received)',
      '',
      'RETURN STATUS PROGRESSION:',
      '  1100 → Return Created',
      '  3700 → Return Shipped',
      '  9000 → Return Received at Warehouse',
      '',
      'Status comparison is STRING-based: "3200" >= "3200" works,',
      'but "9000" > "3700" also works because of lexicographic ordering.',
    ].join('\n'),
    confidence: 0.85,
  },
  {
    name: 'pod-event-reason-codes',
    description: 'POD carrier event detection via Notes array ReasonCode',
    patternType: 'status-mapping',
    tags: ['sterling-oms', 'adidas', 'pod', 'carrier-events', 'notes'],
    content: [
      'CARRIER EVENT DETECTION: Sterling stores POD events as Notes on the order.',
      '',
      'Forward flow:',
      '  IT → In-Transit (carrier picked up)',
      '  DL → Delivered (proof of delivery)',
      '',
      'Return flow:',
      '  RP → Return Picked Up (carrier collected return)',
      '  RT → Return In Transit',
      '  RD → Return Delivered to Warehouse',
      '',
      'Detection: order.Notes.Note array, check n.ReasonCode === "IT"/"DL"/etc.',
      'Also check n.NoteText for fallback detection.',
    ].join('\n'),
    confidence: 0.85,
  },
  {
    name: 'return-document-type',
    description: 'Return orders use DocumentType 0003 vs sales order 0001',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'adidas', 'returns', 'document-type'],
    content: [
      'DOCUMENT TYPES:',
      '  0001 → Sales Order (forward flow)',
      '  0003 → Return Order',
      '',
      'When querying return-related data, ALWAYS pass DocumentType="0003".',
      'Sterling will return the forward order (0001) by default if DocumentType is omitted.',
      'Return order number is typically the same OrderNo with DocumentType=0003.',
    ].join('\n'),
    confidence: 0.9,
  },

  // --- API Contracts ---
  {
    name: 'rest-vs-xapi-routing',
    description: 'When to use REST /invoke/ (reads) vs XAPI JSP (writes/flows)',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'adidas', 'api-routing', 'rest', 'xapi'],
    content: [
      'API ROUTING RULES:',
      '',
      'REST Client (POST /smcfs/restapi/invoke/{apiName}):',
      '  - All READ operations (getOrderList, getShipmentListForOrder, etc.)',
      '  - JSON body with EnterpriseCode auto-injected',
      '  - Returns JSON responses',
      '',
      'XAPI Client (POST /smcfs/yfshttpapi/yantrahttpapitester.jsp):',
      '  - All WRITE/MUTATE operations (createOrder, changeOrder, shipConfirm)',
      '  - Form-encoded body: APIName, IsFlow, InteropType=SYNC, InputXml',
      '  - Returns XML responses',
      '  - Composite services (flows) need IsFlow=Y',
      '',
      'NEVER use REST for writes — Sterling REST API is read-only in most deployments.',
      'NEVER use XAPI for reads — it adds unnecessary XML overhead.',
    ].join('\n'),
    confidence: 0.9,
  },
  {
    name: 'rest-post-not-get',
    description: 'Sterling REST API uses POST with JSON body, not GET with querystring',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'adidas', 'rest', 'http-method'],
    content: [
      'CRITICAL: Sterling REST API uses POST for ALL operations, including reads.',
      '',
      'CORRECT:',
      '  POST /smcfs/restapi/invoke/getOrderList',
      '  Body: { "EnterpriseCode": "adidas_PT", "OrderNo": "APT12345678", "MaximumRecords": "1" }',
      '  Accept: application/json',
      '',
      'WRONG:',
      '  GET /smcfs/restapi/invoke/getOrderList?OrderNo=APT12345678',
      '',
      'This is a common mistake when coming from typical REST API patterns.',
      'Sterling uses POST + JSON body for everything through /invoke/.',
    ].join('\n'),
    confidence: 0.95,
  },
  {
    name: 'xapi-form-encoding',
    description: 'XAPI tester JSP requires specific form-encoded fields',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'adidas', 'xapi', 'form-encoding'],
    content: [
      'XAPI FORM FIELDS (application/x-www-form-urlencoded):',
      '  YFSEnvironment  → empty string',
      '  YantraMessageGroupId → empty string',
      '  APIName         → service/API name (e.g., "adidasWE_CreateOrderSync")',
      '  IsFlow          → "Y" for composite services, "N" for simple APIs',
      '  InteropType     → always "SYNC"',
      '  InputXml        → the XML payload',
      '',
      'KNOWN FLOWS (IsFlow=Y):',
      '  adidasWE_CreateOrderSync, adidasWE_ProcessSHPConfirmation,',
      '  adidasWE_ProcessPODUpdate, adidasWE_CreateReturnFromSSRSvc,',
      '  adidasWE_ProcessReturnPODUpdates, adidasWE_ProcessReturnCompletionUpdateSvc,',
      '  adidasWE_CheckAdyenAsyncResponseSvc, adidas_UpdateSOAcknowledgmentSvc',
      '',
      'SIMPLE APIs (IsFlow=N):',
      '  changeOrder, scheduleOrder, releaseOrder, processOrderPayments',
    ].join('\n'),
    confidence: 0.9,
  },
  {
    name: 'enterprise-code-injection',
    description: 'EnterpriseCode is auto-injected into every REST request body',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'adidas', 'enterprise-code', 'config'],
    content: [
      'The SterlingClient auto-injects EnterpriseCode into every REST request body.',
      'Callers should NOT include EnterpriseCode in their params — it will be overridden.',
      '',
      'For Adidas environments:',
      '  UAT (Portugal): adidas_PT',
      '  Prod: varies by region (adidas_DE, adidas_FR, etc.)',
      '',
      'Set via ADIDAS_ENTERPRISE_CODE env var (default: adidas_PT).',
    ].join('\n'),
    confidence: 0.85,
  },
  {
    name: 'shipment-key-extraction',
    description: 'getShipmentListForOrder returns ShipmentKey needed for downstream task queue calls',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'adidas', 'shipment', 'shipment-key'],
    content: [
      'getShipmentListForOrder returns Shipment objects with ShipmentKey field.',
      'ShipmentKey is a Sterling internal identifier (e.g., "302602271501069280846466").',
      '',
      'ShipmentKey is CRITICAL for:',
      '  1. manageTaskQueue DataKey lookups (invoice recovery)',
      '  2. getShipmentDetails for individual shipment data',
      '  3. Linking shipments to container and tracking data',
      '',
      'Always extract and store ShipmentKey from the first shipment in the list.',
    ].join('\n'),
    confidence: 0.85,
  },
  {
    name: 'shipment-confirmation-sequence',
    description: 'Ship confirm requires two-step sequence: SHPConfirmation then SOAcknowledgment',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'adidas', 'shipment', 'ship-confirm', 'sequence'],
    content: [
      'SHIPMENT CONFIRMATION is a TWO-STEP process:',
      '',
      'Step 7: adidasWE_ProcessSHPConfirmation (IsFlow=Y)',
      '  - Confirms the physical shipment with container/tracking details',
      '  - Creates the Shipment record in Sterling',
      '',
      'Step 8: adidas_UpdateSOAcknowledgmentSvc (IsFlow=Y)',
      '  - Updates the Sales Order acknowledgment status',
      '  - Triggers downstream invoice generation in YFS_TASK_Q',
      '',
      'These MUST be called in order. Skipping Step 8 means no invoice generation.',
      'After Step 8, expect ~10min delay before invoice task becomes available.',
    ].join('\n'),
    confidence: 0.9,
  },

  // --- Error Signatures ---
  {
    name: 'sterling-200-ok-with-error',
    description: 'Sterling returns HTTP 200 OK with error payload in response body',
    patternType: 'error-signature',
    tags: ['sterling-oms', 'adidas', 'error-handling', '200-ok-error'],
    content: [
      'Sterling frequently returns HTTP 200 OK with error information in the body.',
      'You MUST check the response body for errors even on 200 status.',
      '',
      'JSON error patterns (REST API):',
      '  { "Errors": { "Error": { "ErrorCode": "...", "ErrorDescription": "..." } } }',
      '',
      'XML error patterns (XAPI):',
      '  1. <Error ErrorDescription="detailed message" />',
      '  2. <Error ErrorCode="YFS10003" />',
      '  3. <Error>Some error text</Error>',
      '',
      'Both clients (REST and XAPI) have built-in error-in-body detection.',
      'REST: extractSterlingJsonError()',
      'XAPI: extractSterlingXmlError()',
    ].join('\n'),
    confidence: 0.9,
  },
  {
    name: 'xml-template-field-rules',
    description: 'Sterling XML template field requirements and conventions',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'adidas', 'xml', 'templates', 'field-rules'],
    content: [
      'STERLING XML FIELD RULES:',
      '',
      '  UnitOfMeasure → always "PIECE" (not "EA", "EACH", or "PC")',
      '  ProductClass  → always "NEW" (Sterling default)',
      '  ItemID format  → "{ArticleNumber}_{SizeCode}" e.g., "EE6464_530"',
      '  DocumentType   → "0001" for sales, "0003" for returns',
      '  Currency       → "EUR" for European markets',
      '  PrimeLineNo    → starts at "1", auto-increments per line',
      '  SubLineNo      → usually "1" unless split shipments',
      '',
      'OrderNo format for test orders: APT + 8 random digits (e.g., APT26149445)',
      'Real orders use different prefix per channel.',
    ].join('\n'),
    confidence: 0.8,
  },

  // --- Agentic Healing Recovery Strategies (learned from 2026-02-28 debugging) ---
  {
    name: 'status-already-satisfied',
    description: 'Order MaxOrderStatus already past stage target — safe to continue',
    patternType: 'recovery-strategy',
    tags: ['sterling-oms', 'adidas', 'self-healing', 'skip'],
    content: [
      'PATTERN: Stage fails but order MaxOrderStatus already >= stage target.',
      'This happens in --order (validate) mode when the order has already completed.',
      '',
      'Stage targets: create-order=1100, wait-for-release=3200, confirm-shipment=3350,',
      'delivery=3700, create-return=3700, return-delivery=9000.',
      '',
      'RECOVERY: Return "continue" — order is already past this stage.',
      'No action needed. This is the most common agentic healing scenario in validate mode.',
    ].join('\n'),
    confidence: 0.9,
  },
  {
    name: 'transient-network-retry',
    description: 'Transient network error — ECONNRESET, ETIMEDOUT, abort — retry after backoff',
    patternType: 'recovery-strategy',
    tags: ['sterling-oms', 'adidas', 'self-healing', 'retry', 'network'],
    content: [
      'PATTERN: ECONNRESET, ETIMEDOUT, ECONNREFUSED, or "This operation was aborted".',
      'These are transient network errors — VPN flicker, load balancer timeout, etc.',
      '',
      'RECOVERY: Return "retry" to re-execute the stage.',
      'The orchestrator respects maxStageRetries (default 1) so this will retry once.',
      'If the retry also fails, the stage fails normally.',
    ].join('\n'),
    confidence: 0.85,
  },
  {
    name: 'document-type-0003-not-found',
    description: 'Return order DocumentType 0003 query returns "YFS:Invalid Order" — check forward order instead',
    patternType: 'recovery-strategy',
    tags: ['sterling-oms', 'adidas', 'self-healing', 'returns', 'document-type'],
    content: [
      'PATTERN: getOrderList with DocumentType=0003 returns "YFS:Invalid Order".',
      'But forward order MaxOrderStatus >= 3700 (Return Completed or beyond).',
      '',
      'ROOT CAUSE: Adidas processes returns on the forward order (0001) itself.',
      'There is no separate return document (0003) in Adidas PT region.',
      '',
      'RECOVERY: Return "continue" — return processing happened on forward order.',
      'Evidence: APT26149445 (UAT) — Return Completed status on forward order,',
      'but getOrderList(DocumentType=0003) returns YFS:Invalid Order.',
    ].join('\n'),
    confidence: 0.85,
  },
  {
    name: 'credit-note-not-available',
    description: 'Credit note/CREDIT_MEMO invoice not found — data limitation for test orders',
    patternType: 'recovery-strategy',
    tags: ['sterling-oms', 'adidas', 'self-healing', 'credit-note', 'invoice'],
    content: [
      'PATTERN: getOrderInvoiceList returns no CREDIT_MEMO invoice for a return-completed order.',
      'Order status is Return Completed (9000) but no credit note was generated.',
      '',
      'ROOT CAUSE: Test orders in UAT may not trigger full credit note processing.',
      'Sterling credit note generation depends on financial configuration (SAP integration).',
      '',
      'RECOVERY: Return "continue" — this is a known data gap for POC test orders.',
      'In production, credit notes would be generated by the SAP integration layer.',
    ].join('\n'),
    confidence: 0.75,
  },

  // --- Output Template Patterns (added after brutal honesty review) ---
  {
    name: 'output-template-missing-field',
    description: 'Field-presence checks fail because getOrderList default output template omits the field',
    patternType: 'recovery-strategy',
    tags: ['sterling-oms', 'self-healing', 'output-template', 'configuration'],
    content: [
      'PATTERN: Verification checks for field presence (e.g., ShipTo FirstName, OrderLine ItemID)',
      'fail with "missing" or empty values, but order status is satisfied.',
      '',
      'ROOT CAUSE: Sterling getOrderList default output template does NOT return all fields.',
      'Fields like PersonInfoShipTo, OrderLines detail, OrderHeaderKey, OrderLineKey',
      'require a custom output template configured via manageApiTemplate API.',
      '',
      'FIX: Configure a custom output template for getOrderList that includes:',
      '  PersonInfoShipTo (FirstName, LastName, AddressLine1, City, ZipCode, Country)',
      '  OrderLines.OrderLine (ItemID, UnitOfMeasure, OrderedQty, LinePriceInfo)',
      '  OrderHeaderKey, OrderLineKey (required for cross-entity operations)',
      '  ShipNode (at order and line level)',
      '',
      'NEVER use getOrderDetails — it takes a DB row lock (confirmed by Adidas dev Sunil).',
      'Dev confirms getOrderList HAS ItemId and UnitOfMeasure in output.',
    ].join('\n'),
    confidence: 0.9,
  },
  {
    name: 'getOrderList-only-policy',
    description: 'POLICY: Only use getOrderList, never getOrderDetails (DB row lock risk)',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'api-contract', 'getOrderList', 'policy'],
    content: [
      'POLICY (confirmed by Adidas Sterling dev Sunil, 2026-03-02):',
      'ALWAYS use getOrderList. NEVER use getOrderDetails.',
      'getOrderDetails takes a DB row lock — causes contention under load.',
      'getOrderList returns ItemId and UnitOfMeasure in output.',
      '',
      'Our client method getOrder() wraps getOrderList(MaximumRecords=1).',
      'The name getOrderDetails no longer exists in the codebase.',
    ].join('\n'),
    confidence: 0.95,
  },
  {
    name: 'return-invoice-task-queue',
    description: 'Return invoices use same YFS_TASK_Q pattern as forward invoices',
    patternType: 'recovery-strategy',
    tags: ['sterling-oms', 'self-healing', 'return-invoice', 'task-queue'],
    content: [
      'DEV ANSWER (Sunil, 2026-03-02):',
      '"All the payment related actions are performed on Sales order level.',
      'For Return invoice we have to check same way as sales."',
      '',
      'IMPLICATION: Return credit notes use the same YFS_TASK_Q with future AvailableDate.',
      'The same self-healing flow applies:',
      '  1. getShipmentListForOrder → extract ShipmentKey',
      '  2. manageTaskQueue with DataKey=ShipmentKey → find task + TaskQKey',
      '  3. manageTaskQueue with TaskQKey + AvailableDate=yesterday → force-trigger',
      '  4. Poll getOrderInvoiceList until credit note appears',
    ].join('\n'),
    confidence: 0.85,
  },
  {
    name: 'epoch-query-all-transactions',
    description: 'EPOCH GraphQL: omit MsgFlowName to fetch all transactions for an order',
    patternType: 'api-contract',
    tags: ['epoch', 'graphql', 'iib', 'query-pattern'],
    content: [
      'DEV ANSWER (2026-03-02):',
      '"Calling the function without a specific MsgFlow Name should fetch all transactions',
      'with the specified ParentTransactionID"',
      '',
      'QUERY:',
      '  getMessageList(OrderNo: "AZA00032215-1", MsgFlowName: "", LocalTransactionID: "", EventName: "") {',
      '    MSGFLOW_NAME EVENT_NAME LOCAL_TRANSACTION_ID PARENT_TRANSACTION_ID',
      '    GLOBAL_TRANSACTION_ID EVENT_TIMESTAMP Body',
      '  }',
      '',
      'Setting MsgFlowName="" returns ALL IIB message flows for that order.',
    ].join('\n'),
    confidence: 0.9,
  },
  {
    name: 'credit-note-trigger-wms',
    description: 'WMS ReturnConfirmation SOAP triggers credit notes — IIB receives from TIBCO',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'credit-note', 'wms', 'soap', 'tibco'],
    content: [
      'DEV ANSWER (2026-03-02):',
      '"There are SOAP Projects for triggering this data.',
      'For Shipment Confirmations and Return Confirmation that IIB receives from TIBCO."',
      '',
      'IMPLICATION: Credit notes are triggered by WMS ReturnConfirmation SOAP message.',
      'This comes through TIBCO → IIB → Sterling pipeline.',
      'In UAT, Sunil is checking with ServiceHub team if this is active.',
      '',
      'INVOICE_TYPE values (from ERD YFS_ORDER_INVOICE):',
      '  Orders, Returns, Debit Memo, Credit Memo, Info',
      'STATUS values:',
      '  00 = Invoice Created, 01 = Published to external system, 02 = Voided',
    ].join('\n'),
    confidence: 0.8,
  },
  {
    name: 'inventory-node-control-dirty-node',
    description: 'getInventoryNodeControlList / manageInventoryNodeControl for dirty node removal before scheduling',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'api-contract', 'inventory', 'scheduling', 'dirty-node'],
    content: [
      'DEV INSTRUCTIONS (Sunil, v3.1, 2026-03-03):',
      'Before calling scheduleOrder, check for inventory lock at Node+ItemID.',
      '',
      'Step 5.3: getInventoryNodeControlList API',
      'Input: <InventoryNodeControl ItemID="EE6464_530" Node="0625" OrganizationCode="adidas_WE" ProductClass="NEW" UnitOfMeasure="PIECE"/>',
      'If InvPictureIncorrectTillDate is in the FUTURE → node has dirty flag → must clear it.',
      '',
      'Step 5.4: manageInventoryNodeControl API',
      'Input: <InventoryNodeControl ItemID="EE6464_530" Node="0625" ProductClass="NEW" InventoryPictureCorrect="Y" OrganizationCode="adidas_WE" UnitOfMeasure="PIECE"/>',
      'Sets InventoryPictureCorrect="Y" to remove the dirty node flag.',
      '',
      'REASON: If dirty node flag is active, scheduleOrder may return Backorder',
      'even when physical inventory exists. The lock prevents ATP from seeing supply.',
      'SchedFailureReasonCode at /OrderList/Order/OrderLines/OrderLine/@SchedFailureReasonCode',
      'indicates why scheduling failed.',
    ].join('\n'),
    confidence: 0.9,
  },
  {
    name: 'autopoc-custom-services',
    description: 'AutoPOC custom wrapper services replace direct API calls for validation',
    patternType: 'api-contract',
    tags: ['sterling-oms', 'api-contract', 'autopoc', 'custom-service', 'validation'],
    content: [
      'DEV INSTRUCTIONS (Sunil, v3.1, 2026-03-03):',
      'Use custom AutoPOC services INSTEAD of OOB APIs for status validation.',
      'These wrappers include output templates that return required fields.',
      '',
      'OrderStatus_AutoPOC — replaces getOrderList for order status checks',
      '  Input: <Order DocumentType="0001" EnterpriseCode="adidas_PT" OrderNo="APTxxxxxxxx" />',
      '',
      'ReleaseStatus_AutoPOC — for order release details',
      '  Input: <OrderRelease DocumentType="0001" EnterpriseCode="adidas_PT" OrderNo="APTxxxxxxxx" />',
      '  NOTE: Root element is <OrderRelease>, NOT <Order> (v3.1 doc header)',
      '',
      'ShipmentStatus_AutoPOC — for shipment details',
      '  Input: <Shipment DocumentType="0001" EnterpriseCode="adidas_PT" OrderNo="APTxxxxxxxx" />',
      '  NOTE: Root element is <Shipment>, NOT <Order> (v3.1 doc header)',
      '',
      'InvoiceStatus_AutoPOC — for invoice details',
      '  Input: <OrderInvoice DocumentType="0001" EnterpriseCode="adidas_PT" OrderNo="APTxxxxxxxx" />',
      '',
      'Use at validation points: post-schedule (5.6), post-release (6.1/6.2),',
      'post-ship (7.3), post-SOAck (8.2), invoice check (9).',
    ].join('\n'),
    confidence: 0.95,
  },
  {
    name: 'schedule-backorder-detection',
    description: 'Post-schedule backorder detection via SchedFailureReasonCode',
    patternType: 'recovery-strategy',
    tags: ['sterling-oms', 'self-healing', 'scheduling', 'backorder'],
    content: [
      'DEV INSTRUCTIONS (Sunil, v3.1, 2026-03-03):',
      'After calling scheduleOrder (step 5.5), call OrderStatus_AutoPOC (step 5.6).',
      'Check if order went to Backorder status.',
      '',
      'DETECTION: Look for SchedFailureReasonCode at:',
      '  /OrderList/Order/OrderLines/OrderLine/@SchedFailureReasonCode',
      '',
      'If backorder detected: DO NOT proceed to step 6 (releaseOrder).',
      'Flag for developer review — likely inventory or node control issue.',
      '',
      'COMMON CAUSES:',
      '  1. Zero ATP at assigned ShipNode (fix: adjustInventory step 5.2)',
      '  2. Dirty node flag active (fix: manageInventoryNodeControl step 5.4)',
      '  3. Inventory lock via InvPictureIncorrectTillDate (fix: step 5.4)',
      '  4. Wrong ShipNode assignment (fix: verify step 2 changeOrder payload)',
    ].join('\n'),
    confidence: 0.9,
  },
];

// ============================================================================
// Pattern Loader (Idempotent)
// ============================================================================

interface PatternStoreAdapter {
  storePattern(pattern: {
    name: string;
    description: string;
    tags: string[];
    content: string;
    confidence: number;
    metadata: Record<string, string>;
  }): Promise<unknown>;
  getPattern?(name: string): Promise<unknown | null>;
}

/**
 * Load Sterling patterns into the pattern store (idempotent).
 * Checks for existing patterns by name before inserting.
 * Returns the count of newly inserted patterns.
 */
export async function loadSterlingPatterns(store: PatternStoreAdapter): Promise<number> {
  let inserted = 0;

  for (const pattern of STERLING_PATTERNS) {
    // Skip if pattern already exists
    if (store.getPattern) {
      const existing = await store.getPattern(pattern.name);
      if (existing) continue;
    }

    await store.storePattern({
      name: pattern.name,
      description: pattern.description,
      tags: pattern.tags,
      content: pattern.content,
      confidence: pattern.confidence,
      metadata: {
        patternType: pattern.patternType,
        source: 'adidas-o2c-poc',
      },
    });
    inserted++;
  }

  return inserted;
}
