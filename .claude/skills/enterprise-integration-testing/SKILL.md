---
name: enterprise-integration-testing
description: "Test enterprise integrations across SAP (RFC, BAPI, IDoc, OData, Fiori), middleware, and WMS with E2E flow validation and cross-system data consistency checks. Use when testing SAP integrations, validating Order-to-Cash flows, or enforcing enterprise quality gates."
---

# Enterprise Integration Testing

<default_to_action>
When testing enterprise integrations or SAP-connected systems:
1. MAP the end-to-end flow (web -> API -> middleware -> backend -> response)
2. IDENTIFY integration points and protocols (REST, SOAP, RFC, IDoc, OData, EDI)
3. SELECT the right agent for each integration type
4. TEST each integration boundary with contract and data validation
5. VALIDATE cross-system data consistency (SAP <-> WMS <-> middleware)
6. EXERCISE enterprise error handling (compensation, retry, alerting)
7. GATE releases with enterprise-specific quality criteria

**Agent Selection Guide:**
- SAP RFC/BAPI calls -> `qe-sap-rfc-tester`
- SAP IDoc flows -> `qe-sap-idoc-tester`
- OData/Fiori services -> `qe-odata-contract-tester`
- SOAP/ESB endpoints -> `qe-soap-tester`
- Message broker flows -> `qe-message-broker-tester`
- Middleware routing/transformation -> `qe-middleware-validator`
- Authorization / SoD conflicts -> `qe-sod-analyzer`

**Critical Success Factors:**
- Enterprise testing is cross-system: no system is tested in isolation
- Data consistency across systems is the primary quality signal
- Environment access and test data are the biggest bottlenecks
</default_to_action>

## Quick Reference Card

### When to Use
- Testing SAP-connected enterprise systems (S/4HANA, ECC, BW)
- Validating end-to-end business processes (Order-to-Cash, Procure-to-Pay)
- Testing middleware/ESB integrations (IIB, MuleSoft, SAP PI/PO)
- Cross-system data reconciliation (SAP <-> WMS <-> CRM)
- Enterprise release readiness assessment

### Enterprise Integration Types
| Integration | Protocol | Agent | Typical Use |
|-------------|----------|-------|-------------|
| SAP RFC/BAPI | RFC | qe-sap-rfc-tester | Real-time SAP function calls |
| SAP IDoc | ALE/EDI | qe-sap-idoc-tester | Asynchronous document exchange |
| SAP OData | REST/OData | qe-odata-contract-tester | Fiori apps, external APIs |
| SOAP/ESB | SOAP/HTTP | qe-soap-tester | Legacy service integration |
| Message Broker | AMQP/JMS | qe-message-broker-tester | Async messaging (MQ, Kafka) |
| Middleware | Various | qe-middleware-validator | Routing, transformation |
| Authorization | SAP Auth | qe-sod-analyzer | SoD conflicts, role testing |

### Critical Test Scenarios
| Scenario | Must Test | Example |
|----------|----------|---------|
| E2E Order Flow | Full order lifecycle | Web order -> SAP Sales Order -> WMS Pick -> Ship -> Invoice |
| Data Consistency | Cross-system match | SAP inventory = WMS inventory |
| IDoc Processing | Inbound/outbound | Purchase order IDoc -> SAP PO creation |
| Authorization | SoD compliance | User cannot create AND approve PO |
| Error Recovery | Compensation | Failed payment -> reverse inventory reservation |
| Master Data Sync | Replication accuracy | Material master in SAP = Product in WMS |

### Tools
- **SAP**: SAP GUI, Transaction codes (SE37, WE19, SEGW), Eclipse ADT
- **Middleware**: IBM IIB/ACE, MuleSoft, SAP PI/PO/CPI
- **Testing**: SoapUI, Postman, Playwright, custom harnesses
- **Monitoring**: SAP Solution Manager, Splunk, Dynatrace
- **Data**: SAP LSMW, SECATT, eCATT

### Agent Coordination
- `qe-sap-rfc-tester`: SAP RFC/BAPI function module testing
- `qe-sap-idoc-tester`: IDoc inbound/outbound processing validation
- `qe-odata-contract-tester`: OData service contract and Fiori app testing
- `qe-soap-tester`: SOAP/WSDL contract validation and WS-Security
- `qe-message-broker-tester`: Message broker flows, DLQ, ordering
- `qe-middleware-validator`: ESB routing, transformation, EIP patterns
- `qe-sod-analyzer`: Segregation of Duties and authorization testing

---

## E2E Enterprise Flow Testing

### Order-to-Cash Flow
```javascript
describe('Order-to-Cash E2E Flow', () => {
  it('processes web order through SAP to warehouse fulfillment', async () => {
    // Step 1: Create order via web API
    const webOrder = await api.post('/orders', {
      customerId: 'CUST-1000',
      items: [{ materialNumber: 'MAT-500', quantity: 10 }],
      shippingAddress: { city: 'Portland', state: 'OR' }
    });
    expect(webOrder.status).toBe(201);
    const webOrderId = webOrder.body.orderId;

    // Step 2: Verify SAP Sales Order created via middleware
    const sapOrder = await sapClient.call('BAPI_SALESORDER_GETLIST', {
      CUSTOMER_NUMBER: 'CUST-1000',
      SALES_ORGANIZATION: '1000'
    });
    const matchingSapOrder = sapOrder.find(o => o.PURCHASE_ORDER_NO === webOrderId);
    expect(matchingSapOrder).toBeDefined();
    const sapOrderId = matchingSapOrder.SD_DOC;

    // Step 3: Verify WMS received pick instruction
    const wmsPickTask = await wmsApi.get(`/pick-tasks?externalRef=${sapOrderId}`);
    expect(wmsPickTask.status).toBe(200);
    expect(wmsPickTask.body.status).toBe('PENDING');

    // Step 4: Complete pick in WMS
    await wmsApi.post(`/pick-tasks/${wmsPickTask.body.taskId}/complete`, {
      pickedItems: [{ sku: 'MAT-500', quantity: 10, location: 'A-01-03' }]
    });

    // Step 5: Verify SAP delivery created (via IDoc confirmation)
    await waitFor(async () => {
      const delivery = await sapClient.call('BAPI_DELIVERYPROCESSING_GETLIST', {
        SALES_ORDER: sapOrderId
      });
      return delivery.length > 0 && delivery[0].DELVRY_STATUS === 'C';
    }, { timeout: 30000, interval: 3000 });

    // Step 6: Verify invoice posted in SAP
    await waitFor(async () => {
      const invoice = await sapClient.call('BAPI_BILLINGDOC_GETLIST', {
        REFDOCNUMBER: sapOrderId
      });
      return invoice.length > 0;
    }, { timeout: 30000, interval: 3000 });
  });
});
```

---

## SAP-Specific Testing Patterns

### RFC/BAPI Testing
```javascript
describe('SAP RFC/BAPI Testing', () => {
  it('validates BAPI return structure and error handling', async () => {
    // Test with valid input
    const result = await sapClient.call('BAPI_MATERIAL_GETDETAIL', {
      MATERIAL: 'MAT-EXIST'
    });
    expect(result.RETURN.TYPE).not.toBe('E');
    expect(result.MATERIAL_GENERAL_DATA.MATL_DESC).toBeDefined();

    // Test with invalid material
    const errorResult = await sapClient.call('BAPI_MATERIAL_GETDETAIL', {
      MATERIAL: 'MAT-NONEXIST'
    });
    expect(errorResult.RETURN.TYPE).toBe('E');
    expect(errorResult.RETURN.MESSAGE).toContain('does not exist');
  });

  it('handles BAPI commit correctly', async () => {
    const createResult = await sapClient.call('BAPI_SALESORDER_CREATEFROMDAT2', {
      ORDER_HEADER_IN: {
        DOC_TYPE: 'OR',
        SALES_ORG: '1000',
        DISTR_CHAN: '10',
        DIVISION: '00'
      },
      ORDER_PARTNERS: [{ PARTN_ROLE: 'AG', PARTN_NUMB: 'CUST-1000' }],
      ORDER_ITEMS_IN: [{ MATERIAL: 'MAT-500', TARGET_QTY: 10 }]
    });

    // Must call BAPI_TRANSACTION_COMMIT to persist
    await sapClient.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });

    // Verify order exists after commit
    const getResult = await sapClient.call('BAPI_SALESORDER_GETDETAIL', {
      SALESDOCUMENT: createResult.SALESDOCUMENT
    });
    expect(getResult.ORDER_HEADER_OUT.SD_DOC_CAT).toBe('C');
  });
});
```

### IDoc Testing
```javascript
describe('SAP IDoc Processing', () => {
  it('validates inbound IDoc creates correct SAP document', async () => {
    // Send IDoc via middleware
    const idocPayload = {
      IDOCTYP: 'ORDERS05',
      MESTYP: 'ORDERS',
      SNDPOR: 'SAPEXT',
      SNDPRT: 'LS',
      SNDPRN: 'EXTERN',
      RCVPOR: 'SAPSI1',
      RCVPRT: 'LS',
      RCVPRN: 'SAPCLNT100',
      segments: {
        E1EDK01: { BELNR: 'EXT-PO-001' },
        E1EDK14: [{ QUESSION: '001', ORGID: '1000' }],
        E1EDP01: [{ POSEX: '000010', MENGE: '100', MENEE: 'EA', MATNR: 'MAT-500' }]
      }
    };

    const idocNumber = await middlewareClient.sendIDoc(idocPayload);

    // Wait for IDoc processing in SAP
    await waitFor(async () => {
      const status = await sapClient.call('IDOC_STATUS_READ', { DOCNUM: idocNumber });
      return status.STATUS === '53'; // Application document posted successfully
    }, { timeout: 60000, interval: 5000 });

    // Verify SAP document was created
    const sapDoc = await sapClient.call('BAPI_SALESORDER_GETLIST', {
      PURCHASE_ORDER_NO: 'EXT-PO-001'
    });
    expect(sapDoc).toHaveLength(1);
  });

  it('handles IDoc error status correctly', async () => {
    // Send IDoc with invalid material
    const idocPayload = buildIdocPayload({ materialNumber: 'INVALID-MAT' });
    const idocNumber = await middlewareClient.sendIDoc(idocPayload);

    await waitFor(async () => {
      const status = await sapClient.call('IDOC_STATUS_READ', { DOCNUM: idocNumber });
      return ['51', '56'].includes(status.STATUS); // Error statuses
    }, { timeout: 60000 });

    const status = await sapClient.call('IDOC_STATUS_READ', { DOCNUM: idocNumber });
    expect(status.STATUS_TEXT).toContain('Material');
  });
});
```

### OData Service Testing
```javascript
describe('SAP OData Service Testing', () => {
  it('validates OData entity CRUD operations', async () => {
    // CREATE
    const createResponse = await odataClient.post('/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder', {
      SalesOrderType: 'OR',
      SalesOrganization: '1000',
      DistributionChannel: '10',
      OrganizationDivision: '00',
      SoldToParty: 'CUST-1000'
    });
    expect(createResponse.status).toBe(201);
    const salesOrder = createResponse.body.d.SalesOrder;

    // READ with $expand
    const readResponse = await odataClient.get(
      `/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('${salesOrder}')?$expand=to_Item`
    );
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.d.SalesOrder).toBe(salesOrder);

    // READ collection with $filter
    const listResponse = await odataClient.get(
      `/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder?$filter=SoldToParty eq 'CUST-1000'&$top=10`
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.d.results.length).toBeGreaterThan(0);
  });

  it('validates OData $metadata contract', async () => {
    const metadata = await odataClient.get(
      '/sap/opu/odata/sap/API_SALES_ORDER_SRV/$metadata'
    );
    expect(metadata.status).toBe(200);

    const parsedMetadata = parseEdmx(metadata.body);
    expect(parsedMetadata.entityTypes).toContain('A_SalesOrder');
    expect(parsedMetadata.entityTypes).toContain('A_SalesOrderItem');

    // Validate required properties exist
    const salesOrderType = parsedMetadata.getEntityType('A_SalesOrder');
    expect(salesOrderType.properties).toContain('SalesOrder');
    expect(salesOrderType.properties).toContain('SalesOrderType');
    expect(salesOrderType.navigationProperties).toContain('to_Item');
  });
});
```

---

## Cross-System Data Validation

```javascript
describe('Cross-System Data Consistency', () => {
  it('SAP inventory matches WMS inventory', async () => {
    const materials = ['MAT-100', 'MAT-200', 'MAT-300'];

    for (const material of materials) {
      // Get SAP stock
      const sapStock = await sapClient.call('BAPI_MATERIAL_STOCK_REQ_LIST', {
        MATERIAL: material,
        PLANT: '1000'
      });
      const sapQuantity = parseFloat(sapStock.TOTAL_STOCK);

      // Get WMS inventory
      const wmsInventory = await wmsApi.get(`/inventory/${material}`);
      const wmsQuantity = wmsInventory.body.availableQuantity;

      expect(wmsQuantity).toBe(sapQuantity);
    }
  });

  it('customer master data is consistent across systems', async () => {
    const customerId = 'CUST-1000';

    const sapCustomer = await sapClient.call('BAPI_CUSTOMER_GETDETAIL', {
      CUSTOMERNO: customerId
    });

    const crmCustomer = await crmApi.get(`/customers/${customerId}`);
    const wmsCustomer = await wmsApi.get(`/customers/${customerId}`);

    // Core fields must match
    expect(crmCustomer.body.name).toBe(sapCustomer.CUSTOMER_GENERAL_DATA.NAME);
    expect(wmsCustomer.body.name).toBe(sapCustomer.CUSTOMER_GENERAL_DATA.NAME);
    expect(crmCustomer.body.taxId).toBe(sapCustomer.CUSTOMER_GENERAL_DATA.TAX_NUMBER);
  });

  it('order status is synchronized across all systems', async () => {
    const orderId = 'ORD-SYNC-TEST';

    // Create order and wait for propagation
    await api.post('/orders', { orderId, customerId: 'CUST-1000', items: [{ sku: 'MAT-100', qty: 5 }] });
    await sleep(10000); // Allow for async propagation

    const webStatus = (await api.get(`/orders/${orderId}`)).body.status;
    const sapStatus = (await sapClient.call('BAPI_SALESORDER_GETDETAIL', {
      SALESDOCUMENT: orderId
    })).ORDER_HEADER_OUT.DOC_STATUS;
    const wmsStatus = (await wmsApi.get(`/orders/${orderId}`)).body.status;

    // All systems should reflect same logical status
    expect(mapSapStatus(sapStatus)).toBe(webStatus);
    expect(mapWmsStatus(wmsStatus)).toBe(webStatus);
  });
});
```

---

## Enterprise Test Data Management

**Key pattern**: Create test data in SAP (source of truth) via BAPIs, wait for replication to downstream systems, then teardown by setting deletion flags (SAP does not hard delete).

```javascript
// Setup: Create in SAP, wait for replication
const customer = await sapClient.call('BAPI_CUSTOMER_CREATE', { /* ... */ });
await sapClient.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });
await waitFor(async () => (await wmsApi.get(`/customers/${customer.CUSTOMERNO}`)).status === 200, { timeout: 60000 });

// Teardown: Mark for deletion
await sapClient.call('BAPI_CUSTOMER_CHANGEFROMDATA', { CUSTOMERNO: id, PI_PERSONALDATA: { DELETION_FLAG: 'X' } });
await sapClient.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });
```

---

## Environment Strategy

| Environment | Purpose | SAP Client | Test Data |
|-------------|---------|------------|-----------|
| Integration (INT) | Cross-system testing | 300 | Synthetic (create/teardown) |
| Quality (QAS) | Release validation | 400 | Pre-allocated reserved sets |
| Pre-Production (PRE) | Final verification | 500 | Masked production copy |

---

## Enterprise Quality Gates

### Release Readiness Criteria

| Gate | Threshold |
|------|-----------|
| Cross-System Data Consistency | All reconciled materials match |
| IDoc Processing Success Rate | >= 99% in last 24h |
| Middleware Error Rate | < 10 errors in 24h |
| SoD Violations | 0 critical violations |
| E2E Order Flow | Completes in < 2 minutes |

---

## Best Practices

### Do This
- Map the full E2E flow before writing any tests
- Test each integration boundary separately AND end-to-end
- Use SAP-aware test data management (create, use, teardown with BAPIs)
- Validate data consistency across all systems after each integration event
- Include IDoc status monitoring in your test assertions
- Test authorization (SoD) as part of every enterprise release gate
- Use service virtualization for systems that are hard to provision

### Avoid This
- Testing SAP only through the UI (Fiori/SAP GUI) without API-level tests
- Ignoring IDoc error statuses (51, 56) and only checking happy path
- Sharing test data between teams without reservation mechanisms
- Testing enterprise flows only in sandbox environments
- Skipping BAPI_TRANSACTION_COMMIT after create/update BAPIs
- Assuming cross-system data is immediately consistent (allow for async propagation)
- Deploying without verifying SoD compliance for changed authorization roles

---

## Agent-Assisted Enterprise Testing

```typescript
// SAP RFC/BAPI function testing
await Task("SAP BAPI Validation", {
  bapis: ['BAPI_SALESORDER_CREATEFROMDAT2', 'BAPI_SALESORDER_GETDETAIL'],
  testScenarios: ['valid-input', 'missing-required', 'invalid-customer', 'commit-rollback'],
  validateReturnStructure: true
}, "qe-sap-rfc-tester");

// IDoc processing validation
await Task("IDoc Flow Validation", {
  idocType: 'ORDERS05',
  direction: 'inbound',
  testStatuses: ['53-success', '51-application-error', '56-syntax-error'],
  validateSapDocument: true
}, "qe-sap-idoc-tester");

// OData contract testing
await Task("OData Service Contract Test", {
  serviceUrl: '/sap/opu/odata/sap/API_SALES_ORDER_SRV',
  validateMetadata: true,
  testCrud: true,
  testFilters: ['$filter', '$expand', '$orderby', '$top', '$skip'],
  checkBackwardCompatibility: true
}, "qe-odata-contract-tester");

// SOAP service validation
await Task("SOAP Service Validation", {
  wsdl: 'services/OrderService.wsdl',
  operations: ['CreateOrder', 'GetOrderStatus'],
  testWsSecurity: true,
  testFaultCodes: true
}, "qe-soap-tester");

// Middleware flow validation
await Task("Middleware Integration Test", {
  flow: 'order-to-cash',
  stages: ['web-api', 'esb-routing', 'sap-rfc', 'wms-api'],
  testDLQ: true,
  testCompensation: true,
  validateCorrelationIds: true
}, "qe-middleware-validator");

// Message broker testing
await Task("Message Broker Validation", {
  broker: 'ibm-mq',
  queues: ['orders.inbound', 'orders.sap', 'orders.wms', 'orders.dlq'],
  testOrdering: true,
  testRetry: true
}, "qe-message-broker-tester");

// Segregation of Duties analysis
await Task("SoD Conflict Analysis", {
  scope: 'changed-roles',
  ruleSet: 'sap-standard',
  criticalTransactions: ['ME21N', 'ME29N', 'MIRO', 'FB60'],
  reportFormat: 'matrix'
}, "qe-sod-analyzer");
```

---

## Related Skills
- [api-testing-patterns](../api-testing-patterns/) - REST/GraphQL API testing
- [contract-testing](../contract-testing/) - Consumer-driven contracts
- [middleware-testing-patterns](../middleware-testing-patterns/) - ESB, routing, DLQ
- [wms-testing-patterns](../wms-testing-patterns/) - Warehouse management
- [security-testing](../security-testing/) - Authorization testing

---

## Remember

Enterprise integration testing verifies that independently correct systems work correctly together. The biggest risks are in the seams between systems. Test each boundary with protocol-appropriate tools, validate cross-system data consistency, and always include SoD checks.
