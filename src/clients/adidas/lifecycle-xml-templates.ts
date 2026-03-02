/**
 * Minimal XML Templates — Adidas O2C Lifecycle (SLSQ)
 *
 * Each step uses the MINIMUM fields Sterling needs.
 * Dynamic values (OrderNo, ReleaseNo, etc.) are injected at runtime.
 *
 * Reference: APT order life cycle payloads_v1.xml
 * Enterprise: adidas_PT (Portugal, UAT)
 */

// ============================================================================
// Types
// ============================================================================

export interface OrderContext {
  /** Generated order number: APT + 8 random digits */
  orderNo: string;
  /** Enterprise code (default: adidas_PT) */
  enterpriseCode: string;
  /** Document type (default: 0001 for sales order) */
  documentType: string;
  /** Ship node assigned in Step 2 */
  shipNode: string;
  /** Release number from Step 6 response */
  releaseNo: string;
  /** Today's date in ISO format */
  todayISO: string;

  // Dynamic fields — populated from AutoPOC enrichment, with hardcoded fallbacks
  scac?: string;
  carrierServiceCode?: string;
  itemId?: string;
  quantity?: string;
  primeLineNo?: string;
  shipmentLineNo?: string;
  shipAdviceNo?: string;
  sellerOrgCode?: string;
}

// ============================================================================
// Helpers
// ============================================================================

export function generateOrderNo(): string {
  const suffix = Math.floor(10000000 + Math.random() * 90000000).toString();
  return `APT${suffix}`;
}

function today(): string {
  return new Date().toISOString();
}

// ============================================================================
// Step 1 — Create Order
// ============================================================================

export function step1_CreateOrder(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'adidasWE_CreateOrderSync',
    isFlow: true,
    xml: `<Order CustomerEMailID="meenuga.sunil.kumar@accenture.com" EnterpriseCode="${ctx.enterpriseCode}" ValidateItem="N" OrderDate="${today()}" OrderName="${ctx.orderNo}" DocumentType="${ctx.documentType}" EnteredBy="storefront" OrderNo="${ctx.orderNo}" SellerOrganizationCode="${ctx.enterpriseCode}" EntryType="web" CustomerContactID="${ctx.orderNo}" CustomerPONo="${ctx.orderNo}" CustomerLastName="kumar" CustomerFirstName="sunil" ValidatePromotionAward="N" PaymentStatus="AUTHORIZED" SearchCriteria1="RETROFIT">
  <Extn ExtnOrderNo="${ctx.orderNo}" ExtnInvoiceNo="${ctx.orderNo.replace('APT', '')}" ExtnLocaleCode="pt_PT" ExtnOrderStatus="NEW" ExtnSellerOrgCode="adidas" ExtnCustPONo="${ctx.orderNo}" ExtnBrand="adidas" ExtnPaymentMethod="CREDIT_CARD" ExtnTaxCalculated="Y" ExtnCustomerEUCI="${ctx.orderNo}">
    <ADSHeaderDetailsList>
      <ADSHeaderDetails CustomAttributeValue="false" CustomAttributeKey="agreeForSubscription" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="true" CustomAttributeKey="billingAddressSanity" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="READY_FOR_EXPORT" CustomAttributeKey="carrierStatus" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="true" CustomAttributeKey="shippingAddressSanity" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="${ctx.orderNo}a" CustomAttributeKey="subOrderNo" CustomAttributeHeader="shipment"/>
      <ADSHeaderDetails CustomAttributeValue="COR" CustomAttributeKey="carrierName" CustomAttributeHeader="shipment"/>
      <ADSHeaderDetails CustomAttributeValue="STRD" CustomAttributeKey="carrierCode" CustomAttributeHeader="shipping-lineitem"/>
      <ADSHeaderDetails CustomAttributeValue="COR000PT10407851" CustomAttributeKey="carrierServiceCode" CustomAttributeHeader="shipping-lineitem"/>
      <ADSHeaderDetails CustomAttributeValue="Standard-CS-2" CustomAttributeKey="shippingMethod" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="inline" CustomAttributeKey="deliveryMessage" CustomAttributeHeader="shipment"/>
      <ADSHeaderDetails CustomAttributeValue="inline" CustomAttributeKey="type" CustomAttributeHeader="shipping-lineitem"/>
      <ADSHeaderDetails CustomAttributeValue="Lisboa" CustomAttributeKey="city" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="IT33" CustomAttributeKey="node" CustomAttributeHeader="shipping-lineitem"/>
      <ADSHeaderDetails CustomAttributeValue="FullTax" CustomAttributeKey="taxClassID" CustomAttributeHeader="shipping-lineitem"/>
      <ADSHeaderDetails CustomAttributeValue="inline" CustomAttributeKey="type" CustomAttributeHeader="shipment"/>
      <ADSHeaderDetails CustomAttributeValue="adidas-PT" CustomAttributeKey="siteId" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="false" CustomAttributeKey="isCCOrder" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="${ctx.orderNo.replace('APT', '')}" CustomAttributeKey="invoiceNumber" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="Web" CustomAttributeKey="orderSource" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="false" CustomAttributeKey="taxCalculationMissing" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="${ctx.orderNo}" CustomAttributeKey="customerEUCI" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="web" CustomAttributeKey="ChannelNo" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="CREDIT_CARD" CustomAttributeKey="paymentMethod" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="adidas" CustomAttributeKey="brand" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="false" CustomAttributeKey="isPostamatDelivery" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="false" CustomAttributeKey="isHypeOrder" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="Y" CustomAttributeKey="isTransactionHub" CustomAttributeHeader="custom-attributes"/>
      <ADSHeaderDetails CustomAttributeValue="false" CustomAttributeKey="SettlementComplete" CustomAttributeHeader="shipment"/>
      <ADSHeaderDetails CustomAttributeValue="${today()}" CustomAttributeKey="ThubOrderDate" CustomAttributeHeader="custom-attributes"/>
    </ADSHeaderDetailsList>
  </Extn>
  <OrderLines>
    <OrderLine LineType="inline" GiftFlag="N" OrderedQty="1" PrimeLineNo="1" CarrierServiceCode="COR000PT10407851" SCAC="COR">
      <Item ItemDesc="Sapatos OZWEEGO" ItemID="EE6464_530" ItemShortDesc="Sapatos OZWEEGO" ProductClass="NEW" UnitOfMeasure="PIECE"/>
      <LinePriceInfo UnitPrice="120.0" ListPrice="120.0" IsPriceLocked="Y" TaxableFlag="Y" PricingUOM="PIECE"/>
      <LineTaxes>
        <LineTax ChargeCategory="LineTax" ChargeName="OrderLineTax" TaxName="OrderLineTax" TaxPercentage="23.0" Tax="22.44" Reference1="FullTax"/>
      </LineTaxes>
      <PersonInfoShipTo AddressLine1="Rua Marques de Fronteira" City="Lisboa" Country="PT" EMailID="meenuga.sunil.kumar@accenture.com" FirstName="sunil" LastName="kumar" ZipCode="1050-999" IsAddressVerified="Y">
        <Extn ExtnCustomerEUCI="${ctx.orderNo}"/>
      </PersonInfoShipTo>
      <Extn ExtnArticleNumber="EE6464" ExtnColor="Cloud White / Cloud White / Core Black" ExtnModelNo="EE6464" ExtnSizeCode="530" ExtnSubOrderNo="${ctx.orderNo}a" ExtnLineType="inline" ExtnLocalSizeCode="36"/>
    </OrderLine>
  </OrderLines>
  <PersonInfoBillTo AddressLine1="Rua Marques de Fronteira" City="Lisboa" Country="PT" EMailID="meenuga.sunil.kumar@accenture.com" FirstName="sunil" LastName="kumar" ZipCode="1050-999">
    <Extn ExtnCustomerEUCI="${ctx.orderNo}"/>
  </PersonInfoBillTo>
  <PersonInfoShipTo AddressLine1="Rua Marques de Fronteira" City="Lisboa" Country="PT" EMailID="meenuga.sunil.kumar@accenture.com" FirstName="sunil" LastName="kumar" ZipCode="1050-999" IsAddressVerified="Y">
    <Extn ExtnCustomerEUCI="${ctx.orderNo}"/>
  </PersonInfoShipTo>
  <PriceInfo Currency="EUR" EnterpriseCurrency="EUR"/>
  <References>
    <Reference Name="taxation" Value="gross"/>
  </References>
  <HeaderCharges>
    <HeaderCharge ChargeCategory="ShippingCharge" ChargeName="Shipping_Inline" ChargeAmount="0.0"/>
  </HeaderCharges>
  <PaymentMethods>
    <PaymentMethod CreditCardExpDate="03/30" CreditCardNo="1111" CreditCardType="VISA" PaymentReference2="ACI" PaymentReference3="${ctx.orderNo}" PaymentReference4="Adidas_PT" PaymentType="CREDIT_CARD" UnlimitedCharges="N" PaymentReference9="8ac7a4a19c9931ec019c99d4202c6ce7" PaymentReference1="${ctx.orderNo}">
      <PaymentDetails RequestAmount="120.0" AuthCode="000.100.112" AuthorizationExpirationDate="2500-01-01" ProcessedAmount="120.0" ChargeType="AUTHORIZATION" AuthAvs="8ac7a4a19c9931ec019c99d4202c6ce7" RequestId="8ac7a4a19c9931ec019c99d4202c6ce7"/>
    </PaymentMethod>
  </PaymentMethods>
</Order>`,
  };
}

// ============================================================================
// Step 2 — Stamp ShipNode
// ============================================================================

export function step2_StampShipNode(ctx: OrderContext): { api: string; isFlow: false; xml: string } {
  return {
    api: 'changeOrder',
    isFlow: false,
    xml: `<Order Override="Y" DocumentType="${ctx.documentType}" EnterpriseCode="${ctx.enterpriseCode}" OrderNo="${ctx.orderNo}">
  <OrderLines>
    <OrderLine PrimeLineNo="1" SubLineNo="1" ShipNode="${ctx.shipNode}"/>
  </OrderLines>
</Order>`,
  };
}

// ============================================================================
// Step 3 — Resolve Buyer's Remorse Hold
// ============================================================================

export function step3_ResolveHold(ctx: OrderContext): { api: string; isFlow: false; xml: string } {
  return {
    api: 'changeOrder',
    isFlow: false,
    xml: `<Order OrderNo="${ctx.orderNo}" EnterpriseCode="${ctx.enterpriseCode}" DocumentType="${ctx.documentType}">
  <OrderHoldTypes>
    <OrderHoldType Status="1300" HoldType="BuyerRemorseHold"/>
  </OrderHoldTypes>
</Order>`,
  };
}

// ============================================================================
// Step 4 — Process Adyen Payment
// ============================================================================

export function step4_ProcessPayment(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'adidasWE_CheckAdyenAsyncResponseSvc',
    isFlow: true,
    xml: `<RecordExternalCharges EnterpriseCode="${ctx.enterpriseCode}" type="PAYMENT" PSSCapture="true" CaptureOnAllShipped="false" DocumentType="${ctx.documentType}" OrderNo="${ctx.orderNo}" PaymentStatus="SUCCESS" reason="PSS_PMNT_NOTFY">
  <PaymentMethod PaymentReference4="${ctx.enterpriseCode}" PaymentReference2="ACI" CreditCardType="VISA" PaymentReference3="${ctx.orderNo}" PaymentReference1="${ctx.orderNo}" UnlimitedCharges="Y" PaymentType="CREDIT_CARD" CreditCardNo="1111" CreditCardExpDate="03/2030" PaymentReference9="8ac7a4a19c9931ec019c99d4202c6ce7">
    <PaymentDetailsList>
      <PaymentDetails Status="1300" HoldType="PSS_PMNT_NOTFY_HLD" Flow="LATE_CAPTURE" AuthorizationExpirationDate="2500-01-01" ChargeType="AUTHORIZATION" AuthAvs="${ctx.orderNo}" ProcessedAmount="120.00" RequestAmount="120.00" RequestId="8ac7a4a19c9931ec019c99d4202c6ce7"/>
    </PaymentDetailsList>
  </PaymentMethod>
  <OrderHoldTypes>
    <OrderHoldType Status="1300" HoldType="PSS_PMNT_NOTFY_HLD"/>
  </OrderHoldTypes>
</RecordExternalCharges>`,
  };
}

// ============================================================================
// Step 5 — Schedule Order
// ============================================================================

export function step5_ScheduleOrder(ctx: OrderContext): { api: string; isFlow: false; xml: string } {
  return {
    api: 'scheduleOrder',
    isFlow: false,
    xml: `<ScheduleOrder CheckInventory="Y" DocumentType="${ctx.documentType}" EnterpriseCode="${ctx.enterpriseCode}" IgnoreTransactionDependencies="Y" OrderNo="${ctx.orderNo}"/>`,
  };
}

// ============================================================================
// Step 5.0 — Inventory Check (UAT pre-scheduling)
// ============================================================================

export function step5_0_GetATP(ctx: OrderContext, itemId: string, uom: string): { api: string; xml: string } {
  return {
    api: 'getAvailableToPromiseSummary',
    xml: `<AvailableToPromise DistributionRuleId="adidas_WE_ATP" DemandType="FORECAST" OrganizationCode="${ctx.enterpriseCode}">
  <AvailableToPromiseLines>
    <AvailableToPromiseLine ItemID="${itemId}" UnitOfMeasure="${uom}" ShipNode="${ctx.shipNode}"/>
  </AvailableToPromiseLines>
</AvailableToPromise>`,
  };
}

/**
 * UAT-only: Inject inventory when ATP is zero.
 * @param quantity - Amount to inject (default: 100). This is test data injection, not a production pattern.
 */
export function step5_0_AdjustInventory(
  ctx: OrderContext, itemId: string, uom: string, quantity: number = 100,
): { api: string; xml: string } {
  return {
    api: 'adjustInventory',
    xml: `<AdjustInventory ShipNode="${ctx.shipNode}">
  <Inventory ItemID="${itemId}" UnitOfMeasure="${uom}" ProductClass="NEW" SupplyType="ONHAND">
    <InventoryItem Quantity="${quantity}"/>
  </Inventory>
</AdjustInventory>`,
  };
}

// ============================================================================
// Step 6 — Release Order
// ============================================================================

export function step6_ReleaseOrder(ctx: OrderContext): { api: string; isFlow: false; xml: string } {
  return {
    api: 'releaseOrder',
    isFlow: false,
    xml: `<ReleaseOrder DocumentType="${ctx.documentType}" EnterpriseCode="${ctx.enterpriseCode}" IgnoreTransactionDependencies="Y" OrderNo="${ctx.orderNo}"/>`,
  };
}

// ============================================================================
// Step 7 — Ship (Process Shipment Confirmation)
// ============================================================================

export function step7_Ship(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  const scac = ctx.scac ?? 'COR';
  const carrierService = ctx.carrierServiceCode ?? 'STRD_INLINE';
  const itemId = ctx.itemId ?? 'EE6464_530';
  const qty = ctx.quantity ?? '1';
  const primeLineNo = ctx.primeLineNo ?? '1';
  const shipmentLineNo = ctx.shipmentLineNo ?? '1';
  const shipAdvNo = ctx.shipAdviceNo ?? '320614239';
  const sellerOrg = ctx.sellerOrgCode ?? ctx.enterpriseCode;
  const shipmentNo = `${ctx.orderNo}-${ctx.releaseNo}`;
  const trackingNo = `${ctx.orderNo}TR${ctx.releaseNo}`;
  const containerNo = `${ctx.orderNo}C01`;

  return {
    service: 'adidasWE_ProcessSHPConfirmation',
    isFlow: true,
    xml: `<Shipment SCAC="${scac}" CarrierServiceCode="${carrierService}" ConfirmShip="Y" EnterpriseCode="${ctx.enterpriseCode}" OrderNo="${ctx.orderNo}" ReleaseNo="${ctx.releaseNo}" ShipNode="${ctx.shipNode}" ShipmentNo="${shipmentNo}" DocumentType="${ctx.documentType}" SellerOrganizationCode="${sellerOrg}" ProNo="" ManifestNo="">
  <Containers>
    <Container ContainerNo="${containerNo}" TrackingNo="${trackingNo}" AppliedWeight="0" ContainerLength="0" ContainerHeight="0" ContainerWidth="0">
      <ContainerDetails>
        <ContainerDetail>
          <ShipmentLine ProductClass="NEW" SubLineNo="1" UnitOfMeasure="PIECE" ItemID="${itemId}" Quantity="${qty}" ReleaseNo="${ctx.releaseNo}" PrimeLineNo="${primeLineNo}" OrderNo="${ctx.orderNo}"/>
        </ContainerDetail>
      </ContainerDetails>
    </Container>
  </Containers>
  <ShipmentLines>
    <ShipmentLine ItemID="${itemId}" ProductClass="NEW" ShipmentLineNo="${shipmentLineNo}" Quantity="${qty}" ReleaseNo="${ctx.releaseNo}" PrimeLineNo="${primeLineNo}" SubLineNo="1" UnitOfMeasure="PIECE"/>
  </ShipmentLines>
  <Instructions>
    <Instruction InstructionText="${shipAdvNo}" InstructionType="ShipAdvNo"/>
  </Instructions>
</Shipment>`,
  };
}

// ============================================================================
// Step 8 — Ship Confirmed (SO Acknowledgment)
// ============================================================================

export function step8_ShipConfirm(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  const shipmentNo = `${ctx.orderNo}-${ctx.releaseNo}`;
  const trackingNo = `${ctx.orderNo}TR${ctx.releaseNo}`;
  const itemId = ctx.itemId ?? 'EE6464_530';
  const qty = ctx.quantity ?? '1';
  const shipAdvNo = ctx.shipAdviceNo ?? '320614239';
  const sellerOrg = ctx.sellerOrgCode ?? ctx.enterpriseCode;

  return {
    service: 'adidas_UpdateSOAcknowledgmentSvc',
    isFlow: true,
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<Shipment ActualShipmentDate="${ctx.todayISO}" Country="PT" Currency="EUR" CustomerPONo="" DepartmentCode="" DocumentType="${ctx.documentType}" EntryType="web" OrderNo="${ctx.orderNo}" SellerOrganizationCode="${sellerOrg}" ShipAdviceNo="${shipAdvNo}" ShipNode="${ctx.shipNode}" ShipmentNo="${shipmentNo}">
  <ShipmentLines>
    <ShipmentLine ItemID="${itemId}" Quantity="${qty}">
      <OrderLine ClrDiscount="0.00" OrderedQty="${qty}">
        <LinePriceInfo UnitPrice="120.0"/>
        <Extn ExtnDivision="01"/>
      </OrderLine>
      <Order EntryType="web"/>
    </ShipmentLine>
  </ShipmentLines>
  <OrganizationList>
    <Organization CatalogOrganizationCode="Adidas_PT" ResourceIdentifier="" XrefOrganizationCode=""/>
  </OrganizationList>
</Shipment>`,
  };
}

// ============================================================================
// Step 9 — Wait for Invoice (no action — just poll)
// ============================================================================

// No XML template — this step polls getOrderInvoiceList via REST API

// ============================================================================
// Step 10 — Deliver (POD Update)
// ============================================================================

export function step10_Deliver(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  const trackingNo = `${ctx.orderNo}TR${ctx.releaseNo}`;

  return {
    service: 'adidasWE_ProcessPODUpdate',
    isFlow: true,
    xml: `<Shipment ExpectedDeliveryDate="${ctx.todayISO}" TrackingNo="${trackingNo}" SourceSystem="nShift" OrderNo="${ctx.orderNo}">
  <AdditionalDates>
    <AdditionalDate ActualDate="${ctx.todayISO}" DateTypeId="Delivered"/>
  </AdditionalDates>
  <Extn ExtnCarrierWeight="0" ExtnStatusCode="DL" ExtnStatusDesc="Delivered"/>
</Shipment>`,
  };
}

// ============================================================================
// Step 11 — Create Self-Serve Return
// ============================================================================

export function step11_CreateReturn(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'adidasWE_CreateReturnFromSSRSvc',
    isFlow: true,
    xml: `<Order OrderNo="${ctx.orderNo}">
  <OrderLines>
    <OrderLine Quantity="1" PrimeLineNo="1" ReturnReasonCode="115" ReturnReasonText="Item Arrived Late">
      <Item ItemID="EE6464_530"/>
    </OrderLine>
  </OrderLines>
</Order>`,
  };
}

// ============================================================================
// Step 12 — Return Picked Up
// ============================================================================

export function step12_ReturnPickedUp(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'adidasWE_ProcessReturnPODUpdates',
    isFlow: true,
    xml: `<Shipment ExpectedDeliveryDate="${ctx.todayISO}" TrackingNo="0008180060109800010092001" OrderNo="${ctx.orderNo}" SCAC="CTT" SourceSystem="nShift">
  <Extn ExtnStatusCode="RP" ExtnStatusDesc="ReturnPickedUp"/>
  <AdditionalDates>
    <AdditionalDate ActualDate="${ctx.todayISO}" DateTypeId="ReturnPickedUp"/>
  </AdditionalDates>
</Shipment>`,
  };
}

// ============================================================================
// Step 13 — Return In Transit
// ============================================================================

export function step13_ReturnInTransit(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'adidasWE_ProcessReturnPODUpdates',
    isFlow: true,
    xml: `<Shipment ExpectedDeliveryDate="${ctx.todayISO}" TrackingNo="0008180060109800010092001" OrderNo="${ctx.orderNo}" SCAC="CTT" SourceSystem="nShift">
  <Extn ExtnStatusCode="RT" ExtnStatusDesc="ReturnInTransit"/>
  <AdditionalDates>
    <AdditionalDate ActualDate="${ctx.todayISO}" DateTypeId="ReturnInTransit"/>
  </AdditionalDates>
</Shipment>`,
  };
}

// ============================================================================
// Step 14 — Return Delivered to Warehouse
// ============================================================================

export function step14_ReturnDelivered(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'adidasWE_ProcessReturnPODUpdates',
    isFlow: true,
    xml: `<Shipment ExpectedDeliveryDate="${ctx.todayISO}" TrackingNo="0008180060109800010092001" OrderNo="${ctx.orderNo}" SCAC="CTT" SourceSystem="nShift">
  <Extn ExtnStatusCode="RD" ExtnStatusDesc="Returned DeliveredtoDestination"/>
  <AdditionalDates>
    <AdditionalDate ActualDate="${ctx.todayISO}" DateTypeId="ReturnedToWarehouse"/>
  </AdditionalDates>
</Shipment>`,
  };
}

// ============================================================================
// Step 15 — Return Completion (Receipt)
// ============================================================================

export function step15_ReturnComplete(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'adidasWE_ProcessReturnCompletionUpdateSvc',
    isFlow: true,
    xml: `<Receipt DocumentType="0003" ReceivingNode="CZ31" ReceiptDate="${ctx.todayISO.replace(/\.\d+Z$/, '')}">
  <Shipment OrderNo="${ctx.orderNo}" ReceivingNode="CZ31" EnterpriseCode="${ctx.enterpriseCode}"/>
  <ReceiptLines>
    <ReceiptLine PrimeLineNo="1" Quantity="1" OrderNo="EE6464_530"/>
  </ReceiptLines>
</Receipt>`,
  };
}

// ============================================================================
// AutoPOC Custom Assertion Services (developer-created for POC validation)
// ============================================================================

export function autoPOC_OrderStatus(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'OrderStatus_AutoPOC',
    isFlow: true,
    xml: `<Order DocumentType="${ctx.documentType}" EnterpriseCode="${ctx.enterpriseCode}" OrderNo="${ctx.orderNo}" />`,
  };
}

export function autoPOC_ReleaseStatus(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'ReleaseStatus_AutoPOC',
    isFlow: true,
    xml: `<Order DocumentType="${ctx.documentType}" EnterpriseCode="${ctx.enterpriseCode}" OrderNo="${ctx.orderNo}" />`,
  };
}

export function autoPOC_ShipmentStatus(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'ShipmentStatus_AutoPOC',
    isFlow: true,
    xml: `<Order DocumentType="${ctx.documentType}" EnterpriseCode="${ctx.enterpriseCode}" OrderNo="${ctx.orderNo}" />`,
  };
}

export function autoPOC_InvoiceStatus(ctx: OrderContext): { service: string; isFlow: true; xml: string } {
  return {
    service: 'InvoiceStatus_AutoPOC',
    isFlow: true,
    xml: `<OrderInvoice DocumentType="${ctx.documentType}" EnterpriseCode="${ctx.enterpriseCode}" OrderNo="${ctx.orderNo}" />`,
  };
}
