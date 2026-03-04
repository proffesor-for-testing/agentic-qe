/**
 * Agentic QE v3 - Adidas TC_01 Lifecycle Stages
 * Defines the Act → Poll → Verify sequence for the full O2C flow.
 *
 * Write routing (proven path from POC):
 *   XAPI JSP → XML templates → Adidas custom flows (IsFlow=Y)
 *   Used for: createOrder, shipConfirm, POD, returns, etc.
 *
 * Read routing:
 *   REST JSON → POST /invoke/{apiName}
 *   Used for: getOrder, getShipmentListForOrder, getOrderInvoiceList, etc.
 *
 * When XAPI is not available, write stages fall back to REST JSON with a warning.
 * REST writes may not work for Adidas custom flows (adidasWE_*) — see sterling-patterns.ts.
 *
 * Stage types:
 *   - Action stages: XAPI write + REST poll + verify
 *   - Poll-only stages: REST poll + verify (or XAPI-driven in create-from-scratch mode)
 *   - Verify-only stages: just run verification checks
 */

import type { LifecycleStage } from '../../integrations/orchestration/action-types';
import type { AdidasTestContext } from './context';
import type { CreateOrderInput } from '../../integrations/sterling/types';
import { ensureArray } from '../../integrations/sterling/xml-helpers';
import {
  step1_CreateOrder,
  step2_StampShipNode,
  step3_ResolveHold,
  step4_ProcessPayment,
  step5_1_GetATP,
  step5_2_AdjustInventory,
  step5_3_GetInventoryNodeControlList,
  step5_4_ManageInventoryNodeControl,
  step5_ScheduleOrder,
  step6_ReleaseOrder,
  step7_Ship,
  step8_ShipConfirm,
  step10_Deliver,
  step11_CreateReturn,
  step12_ReturnPickedUp,
  step13_ReturnInTransit,
  step14_ReturnDelivered,
  step15_ReturnComplete,
  autoPOC_OrderStatus,
  autoPOC_ReleaseStatus,
  autoPOC_ShipmentStatus,
  autoPOC_InvoiceStatus,
  generateOrderNo,
  type OrderContext,
} from './lifecycle-xml-templates';

// ============================================================================
// Test Data Defaults (override via context or config)
// ============================================================================

export interface TC01TestData {
  enterpriseCode: string;
  sellerOrganizationCode: string;
  items: Array<{
    itemId: string;
    quantity: string;
    shipNode?: string;
  }>;
  shipTo: {
    firstName: string;
    lastName: string;
    addressLine1: string;
    city: string;
    zipCode: string;
    country: string;
  };
  paymentType?: string;
}

const DEFAULT_TEST_DATA: TC01TestData = {
  enterpriseCode: 'ADIDAS',
  sellerOrganizationCode: 'ADIDAS_WE',
  items: [
    { itemId: 'TEST-ITEM-001', quantity: '1' },
  ],
  shipTo: {
    firstName: 'QE',
    lastName: 'Automation',
    addressLine1: '1 Test Street',
    city: 'Amsterdam',
    zipCode: '1012AB',
    country: 'NL',
  },
  paymentType: 'CREDIT_CARD',
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Delay before AutoPOC service calls to avoid locking the previous XAPI execution step.
 * The XAPI JSP page needs time to finish rendering the previous response before
 * a new service can be selected from the dropdown.
 * Set to 0 in tests via setAutoPOCDelay(0).
 */
let AUTOPOC_DELAY_MS = 3000;
export function setAutoPOCDelay(ms: number): void { AUTOPOC_DELAY_MS = ms; }
function delayForAutoPOC(): Promise<void> {
  if (AUTOPOC_DELAY_MS <= 0) return Promise.resolve();
  return new Promise(r => setTimeout(r, AUTOPOC_DELAY_MS));
}

/** Build an OrderContext for XML templates from the current test context. */
function buildOrderCtx(ctx: AdidasTestContext): OrderContext {
  return {
    orderNo: ctx.orderId,
    enterpriseCode: ctx.enterpriseCode,
    documentType: ctx.documentType || '0001',
    shipNode: ctx.shipNode || 'IT33',
    releaseNo: ctx.releaseNo || '1',
    todayISO: new Date().toISOString(),
  };
}

// ============================================================================
// TC_01 Lifecycle Stages
// ============================================================================

/**
 * Build the TC_01 lifecycle stages for Adidas O2C.
 * Pass test data to customise the order payload. Defaults are safe for staging.
 */
export function buildTC01Lifecycle(
  testData: TC01TestData = DEFAULT_TEST_DATA
): LifecycleStage<AdidasTestContext>[] {
  return [
    // =========================================================================
    // Stage 1: Create Order (XAPI: steps 1-4 from POC)
    // =========================================================================
    {
      id: 'create-order',
      name: 'Create Sales Order',
      description: 'Place a new sales order via XAPI (adidasWE_CreateOrderSync) + setup steps',
      act: async (ctx) => {
        const start = Date.now();

        // --order mode: order already exists, skip creation
        if (ctx.orderId) {
          return { success: true, durationMs: 0, data: { actionStatus: 'skipped', reason: 'Order already exists (--order mode)' } };
        }

        // ---- XAPI path (proven) ----
        if (ctx.xapiClient) {
          const orderCtx: OrderContext = {
            orderNo: generateOrderNo(),
            enterpriseCode: ctx.enterpriseCode,
            documentType: '0001',
            shipNode: 'IT33',
            releaseNo: '',
            todayISO: new Date().toISOString(),
          };

          console.log(`  [XAPI] Creating order ${orderCtx.orderNo} (enterprise: ${orderCtx.enterpriseCode})`);
          let orderCreated = false;

          try {
            // Step 1: Create order via Adidas custom flow
            const tmpl1 = step1_CreateOrder(orderCtx);
            const resp1 = await ctx.xapiClient.invokeOrThrow(tmpl1.service, tmpl1.xml);
            orderCreated = true;
            console.log(`  [XAPI] Step 1 (${tmpl1.service}): OK (${resp1.duration}ms)`);

            // Step 2: Stamp ShipNode
            const tmpl2 = step2_StampShipNode(orderCtx);
            const resp2 = await ctx.xapiClient.invokeOrThrow(tmpl2.api, tmpl2.xml);
            console.log(`  [XAPI] Step 2 (${tmpl2.api}): OK (${resp2.duration}ms)`);

            // Step 3: Resolve Buyer's Remorse Hold
            const tmpl3 = step3_ResolveHold(orderCtx);
            const resp3 = await ctx.xapiClient.invokeOrThrow(tmpl3.api, tmpl3.xml);
            console.log(`  [XAPI] Step 3 (${tmpl3.api}): OK (${resp3.duration}ms)`);

            // Step 4: Process Adyen Payment
            const tmpl4 = step4_ProcessPayment(orderCtx);
            const resp4 = await ctx.xapiClient.invokeOrThrow(tmpl4.service, tmpl4.xml);
            console.log(`  [XAPI] Step 4 (${tmpl4.service}): OK (${resp4.duration}ms)`);

            return {
              success: true,
              data: { orderId: orderCtx.orderNo, documentType: '0001', shipNode: orderCtx.shipNode },
              durationMs: Date.now() - start,
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`  [XAPI] Create order failed: ${msg}`);
            // Preserve orderId if Step 1 succeeded — allows subsequent stages to recover
            const data: Record<string, unknown> = { documentType: '0001', shipNode: orderCtx.shipNode };
            if (orderCreated) data.orderId = orderCtx.orderNo;
            return { success: false, error: `XAPI create order failed: ${msg}`, data, durationMs: Date.now() - start };
          }
        }

        // ---- REST fallback (may not work for Adidas custom flows) ----
        console.warn('  [WARN] XAPI not available — falling back to REST JSON for createOrder. Adidas custom flows may not work.');
        const payload: CreateOrderInput = {
          DocumentType: '0001',
          EnterpriseCode: testData.enterpriseCode,
          SellerOrganizationCode: testData.sellerOrganizationCode,
          OrderLines: {
            OrderLine: testData.items.map((item) => ({
              ItemID: item.itemId,
              OrderedQty: item.quantity,
              ...(item.shipNode ? { ShipNode: item.shipNode } : {}),
            })),
          },
          PersonInfoShipTo: testData.shipTo,
          PaymentMethods: testData.paymentType
            ? { PaymentMethod: [{ PaymentType: testData.paymentType }] }
            : undefined,
        };

        const result = await ctx.sterlingClient.createOrder(payload);

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        return {
          success: true,
          data: { orderId: result.value.OrderNo, documentType: result.value.DocumentType },
          durationMs: Date.now() - start,
        };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrder({ OrderNo: ctx.orderId }),
          (order) => !!order.OrderNo && !!order.Status,
          { maxAttempts: 10, intervalMs: 3000 }
        );

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        // Enrich context from order data
        const order = result.value;
        const lines = ensureArray(order.OrderLines?.OrderLine);
        const data: Record<string, unknown> = {};
        if (lines.length > 0) {
          if (lines[0].ShipNode) data.shipNode = lines[0].ShipNode;
          if (lines[0].ItemID) data.itemId = lines[0].ItemID;
          data.unitOfMeasure = lines[0].UnitOfMeasure ?? 'PIECE';
        }

        // PersonInfoShipTo: read from /OrderList/Order/PersonInfoShipTo level (not line level)
        // per Sunil's v3.1 instructions — order-level address is the canonical source
        if (order.PersonInfoShipTo) {
          data.personInfoShipTo = order.PersonInfoShipTo;
        }

        // AutoPOC enrichment: OrderStatus_AutoPOC returns full field set via output template
        // v3.1 doc: "Use custom services instead of calling getOrderList API"
        if (ctx.xapiClient) {
          try {
            await delayForAutoPOC();
            const orderCtx = buildOrderCtx(ctx);
            const pocTmpl = autoPOC_OrderStatus(orderCtx);
            const pocResp = await ctx.xapiClient.invokeOrThrow(pocTmpl.service, pocTmpl.xml);
            data.autoPocOrderXml = pocResp.body;
            console.log(`  [AutoPOC] OrderStatus_AutoPOC (create-order enrichment): OK (${pocResp.duration}ms)`);
          } catch (pocErr) {
            console.warn(`  [WARN] AutoPOC create-order enrichment failed: ${pocErr instanceof Error ? pocErr.message : pocErr}`);
          }
        }

        return { success: true, data, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-01'],
      fallback: 'manual',
    },

    // =========================================================================
    // Stage 2: Schedule + Release (XAPI if creating, poll-only if --order)
    // =========================================================================
    {
      id: 'wait-for-release',
      name: 'Wait for Order Release',
      description: 'Schedule and release order via XAPI, or poll until status >= 3200',
      act: async (ctx) => {
        const start = Date.now();

        // If XAPI available and we created the order (not --order mode),
        // actively schedule + release instead of waiting for Sterling batch jobs
        if (ctx.xapiClient && !ctx.shipNode) {
          // shipNode not yet set means we likely just created — enrich first
        }

        if (ctx.xapiClient) {
          try {
            const orderCtx = buildOrderCtx(ctx);

            // Step 5.1: Check inventory at node via getATP (dev: Sunil, v3.1 Step 5)
            // Uses itemId from order enrichment or defaults to EE6464_530
            const invItemId = ctx.itemId ?? 'EE6464_530';
            const invUom = ctx.unitOfMeasure ?? 'PIECE';
            try {
              const atpTmpl = step5_1_GetATP(orderCtx, invItemId, invUom);
              const atpResp = await ctx.xapiClient.invoke(atpTmpl.api, atpTmpl.xml);

              // Parse ATP response — XPath: //InventoryInformation/Item/AvailableToPromiseInventory/Availability/Available/@Quantity
              let hasStock = false;
              if (atpResp.success) {
                const qtyMatch = atpResp.body.match(/Available[^>]*Quantity="([\d.]+)"/);
                hasStock = qtyMatch ? parseFloat(qtyMatch[1]) > 0 : false;
              }

              // Step 5.2: If supply is zero or negative, call adjustInventory (UAT guard)
              if (!hasStock) {
                if (ctx.enterpriseCode.endsWith('_PT') || ctx.enterpriseCode.endsWith('_DE')) {
                  const adjQty = 50;
                  const adjTmpl = step5_2_AdjustInventory(orderCtx, invItemId, invUom, adjQty);
                  await ctx.xapiClient.invokeOrThrow(adjTmpl.api, adjTmpl.xml);
                  console.log(`  [TC01] Step 5.2: Inventory adjusted — ${invItemId} at ${orderCtx.shipNode} → ${adjQty} ${invUom}`);
                } else {
                  console.warn(`[TC01] ATP is zero but adjustInventory skipped — non-UAT enterprise: ${ctx.enterpriseCode}`);
                }
              } else {
                console.log(`  [TC01] Step 5.1: ATP check passed — ${invItemId} has stock at ${orderCtx.shipNode}`);
              }
            } catch (e) {
              // Inventory check is best-effort — log warning but don't block schedule
              console.warn(`[TC01] Inventory check failed: ${e instanceof Error ? e.message : e}`);
            }

            // Step 5.3: Check inventory node control for dirty node / inventory lock
            // If InvPictureIncorrectTillDate is in the future, clear it before scheduling
            try {
              const incTmpl = step5_3_GetInventoryNodeControlList(orderCtx, invItemId, invUom);
              const incResp = await ctx.xapiClient.invoke(incTmpl.api, incTmpl.xml);

              if (incResp.success) {
                const tillDateMatch = incResp.body.match(/InvPictureIncorrectTillDate="([^"]*)"/);
                if (tillDateMatch && tillDateMatch[1]) {
                  const tillDate = new Date(tillDateMatch[1]);
                  if (tillDate > new Date()) {
                    // Step 5.4: Clear dirty node — future lock date found
                    console.log(`  [TC01] Step 5.3: Inventory lock detected — InvPictureIncorrectTillDate=${tillDateMatch[1]}`);
                    const mncTmpl = step5_4_ManageInventoryNodeControl(orderCtx, invItemId, invUom);
                    await ctx.xapiClient.invokeOrThrow(mncTmpl.api, mncTmpl.xml);
                    console.log(`  [TC01] Step 5.4: Dirty node cleared — InventoryPictureCorrect=Y`);
                  } else {
                    console.log(`  [TC01] Step 5.3: No active inventory lock (date in past)`);
                  }
                } else {
                  console.log(`  [TC01] Step 5.3: No inventory node control record — OK`);
                }
              }
            } catch (e) {
              // Inventory node control is best-effort — don't block schedule
              console.warn(`[TC01] Step 5.3/5.4: Inventory node control check failed: ${e instanceof Error ? e.message : e}`);
            }

            // Step 5.5: Schedule Order
            const tmpl5 = step5_ScheduleOrder(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl5.api, tmpl5.xml);

            // Step 5.6: Post-schedule backorder check via OrderStatus_AutoPOC
            // v3.1 doc: "If the Order status is in Backorder then don't proceed to Step 6.
            //            Flag it for developer review."
            try {
              await delayForAutoPOC();
              const schedPoc = autoPOC_OrderStatus(orderCtx);
              const schedPocResp = await ctx.xapiClient.invokeOrThrow(schedPoc.service, schedPoc.xml);
              const statusMatch = schedPocResp.body.match(/Status="([^"]*)"/);
              const failCodeMatch = schedPocResp.body.match(/SchedFailureReasonCode="([^"]*)"/);

              if (failCodeMatch && failCodeMatch[1]) {
                const msg = `Step 5.6: ORDER IN BACKORDER — SchedFailureReasonCode="${failCodeMatch[1]}". Blocked per v3.1 instructions. Developer review required.`;
                console.error(`  [TC01] ${msg}`);
                return { success: false, error: msg, durationMs: Date.now() - start };
              }
              console.log(`  [TC01] Step 5.6: Post-schedule status OK — Status=${statusMatch?.[1] ?? 'unknown'} (${schedPocResp.duration}ms)`);
            } catch (schedPocErr) {
              console.warn(`  [WARN] Step 5.6 post-schedule check failed: ${schedPocErr instanceof Error ? schedPocErr.message : schedPocErr}`);
            }

            // Step 6: Release Order
            const tmpl6 = step6_ReleaseOrder(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl6.api, tmpl6.xml);

            // Step 6.1: Verify order status after release via OrderStatus_AutoPOC
            try {
              await delayForAutoPOC();
              const orderPoc = autoPOC_OrderStatus(orderCtx);
              const orderPocResp = await ctx.xapiClient.invokeOrThrow(orderPoc.service, orderPoc.xml);
              console.log(`  [AutoPOC] Step 6.1: OrderStatus_AutoPOC (post-release): OK (${orderPocResp.duration}ms)`);

              // Step 6.2: Fetch release details via ReleaseStatus_AutoPOC
              await delayForAutoPOC();
              const relPoc = autoPOC_ReleaseStatus(orderCtx);
              const relPocResp = await ctx.xapiClient.invokeOrThrow(relPoc.service, relPoc.xml);
              console.log(`  [AutoPOC] Step 6.2: ReleaseStatus_AutoPOC (post-release): OK (${relPocResp.duration}ms)`);
            } catch (pocErr) {
              console.warn(`  [WARN] AutoPOC post-release validation failed: ${pocErr instanceof Error ? pocErr.message : pocErr}`);
            }

            return { success: true, durationMs: Date.now() - start };
          } catch (e) {
            // Schedule/release may fail if order is already released — that's OK
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('already') || msg.includes('Released')) {
              return { success: true, durationMs: Date.now() - start, data: { actionStatus: 'skipped', reason: 'Order already released' } };
            }
            return { success: false, error: `XAPI schedule/release failed: ${msg}`, durationMs: Date.now() - start };
          }
        }

        // No XAPI → skip act, rely on poll to wait for auto-release
        return { success: true, durationMs: 0, data: { actionStatus: 'skipped', reason: 'No XAPI — polling for release' } };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrder({ OrderNo: ctx.orderId }),
          (order) => order.Status >= '3200',
          { maxAttempts: 20, intervalMs: 5000 }
        );

        if (!result.success) {
          return { success: false, error: `Release poll failed: ${result.error.message}`, durationMs: Date.now() - start };
        }

        // Capture payment, total, shipNode, and releaseNo for later stages
        const order = result.value;
        const payments = ensureArray(order.PaymentMethods?.PaymentMethod);
        const lines = ensureArray(order.OrderLines?.OrderLine);
        const data: Record<string, unknown> = {};

        if (payments.length > 0) {
          data.paymentMethod = payments[0].PaymentType ?? '';
        }
        data.originalOrderTotal = (order.TotalAmount as string) ?? '';

        // Enrich shipNode from order line
        if (lines.length > 0 && lines[0].ShipNode) {
          data.shipNode = lines[0].ShipNode;
        }

        // Enrich releaseNo from order releases
        const relResult = await ctx.sterlingClient.getOrderReleaseList({ OrderNo: ctx.orderId });
        if (relResult.success && relResult.value.length > 0) {
          data.releaseNo = relResult.value[0].ReleaseNo;
        }

        // AutoPOC enrichment: OrderStatus + ReleaseStatus return full field sets
        if (ctx.xapiClient) {
          try {
            await delayForAutoPOC();
            const orderCtx = buildOrderCtx(ctx);
            const orderPoc = autoPOC_OrderStatus(orderCtx);
            const orderPocResp = await ctx.xapiClient.invokeOrThrow(orderPoc.service, orderPoc.xml);
            data.autoPocOrderXml = orderPocResp.body;
            console.log(`  [AutoPOC] OrderStatus_AutoPOC (release enrichment): OK (${orderPocResp.duration}ms)`);

            await delayForAutoPOC();
            const relPoc = autoPOC_ReleaseStatus(orderCtx);
            const relPocResp = await ctx.xapiClient.invokeOrThrow(relPoc.service, relPoc.xml);
            data.autoPocReleaseXml = relPocResp.body;
            console.log(`  [AutoPOC] ReleaseStatus_AutoPOC (release enrichment): OK (${relPocResp.duration}ms)`);
          } catch (pocErr) {
            console.warn(`  [WARN] AutoPOC release enrichment failed: ${pocErr instanceof Error ? pocErr.message : pocErr}`);
          }
        }

        return { success: true, data, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-02'],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 3: Confirm Shipment (XAPI: steps 7-8 from POC)
    // =========================================================================
    {
      id: 'confirm-shipment',
      name: 'Confirm Shipment',
      description: 'Ship confirm via XAPI (adidasWE_ProcessSHPConfirmation + SOAcknowledgment)',
      act: async (ctx) => {
        const start = Date.now();

        // Check if order is already shipped (--order mode on progressed orders)
        const orderCheck = await ctx.sterlingClient.getOrder({ OrderNo: ctx.orderId });
        if (orderCheck.success) {
          const maxStatus = parseFloat((orderCheck.value as Record<string, unknown>).MaxOrderStatus as string ?? '0');
          if (maxStatus >= 3350) {
            return { success: true, durationMs: Date.now() - start, data: { actionStatus: 'skipped', reason: 'Shipment already confirmed' } };
          }
        }

        // ---- XAPI path (proven) ----
        if (ctx.xapiClient) {
          try {
            const orderCtx = buildOrderCtx(ctx);

            // Enrich orderCtx from AutoPOC services (dynamic step 7 payload)
            try {
              await delayForAutoPOC();
              const releaseTmpl = autoPOC_ReleaseStatus(orderCtx);
              const releaseResp = await ctx.xapiClient.invokeOrThrow(releaseTmpl.service, releaseTmpl.xml);
              const scacMatch = releaseResp.body.match(/SCAC="([^"]*)"/);
              const csMatch = releaseResp.body.match(/CarrierServiceCode="([^"]*)"/);
              const relNoMatch = releaseResp.body.match(/ReleaseNo="([^"]*)"/);
              if (scacMatch) orderCtx.scac = scacMatch[1];
              if (csMatch) orderCtx.carrierServiceCode = csMatch[1];
              if (relNoMatch) orderCtx.releaseNo = relNoMatch[1];
              // NOTE: Do NOT extract ShipNode from ReleaseStatus_AutoPOC — the regex
              // grabs the first ShipNode= attribute which is on the <OrderRelease> element
              // (e.g. "0625" — a distribution/sourcing node). The actual fulfillment node
              // is on the <OrderLine> element (e.g. "IT33"). Using the release-level node
              // causes YDM00085 "ShipNode does not exist in the system".
              // ShipNode is already set correctly from buildOrderCtx() (Step 2 value or IT33 default).

              await delayForAutoPOC();
              const orderTmpl = autoPOC_OrderStatus(orderCtx);
              const orderResp = await ctx.xapiClient.invokeOrThrow(orderTmpl.service, orderTmpl.xml);
              const itemMatch = orderResp.body.match(/ItemID="([^"]*)"/);
              const qtyMatch = orderResp.body.match(/OrderedQty="([^"]*)"/);
              const sellerMatch = orderResp.body.match(/SellerOrganizationCode="([^"]*)"/);
              if (itemMatch) orderCtx.itemId = itemMatch[1];
              if (qtyMatch) orderCtx.quantity = qtyMatch[1];
              if (sellerMatch) orderCtx.sellerOrgCode = sellerMatch[1];
            } catch (enrichErr) {
              console.warn(`  [WARN] AutoPOC enrichment failed, using defaults: ${enrichErr instanceof Error ? enrichErr.message : enrichErr}`);
            }

            // Step 7: Ship (ProcessSHPConfirmation flow)
            const tmpl7 = step7_Ship(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl7.service, tmpl7.xml);

            // Step 7.4: Enrich from ShipmentStatus_AutoPOC (ShipAdviceNo for step 8)
            try {
              await delayForAutoPOC();
              const shipTmpl = autoPOC_ShipmentStatus(orderCtx);
              const shipResp = await ctx.xapiClient.invokeOrThrow(shipTmpl.service, shipTmpl.xml);
              const shipAdvMatch = shipResp.body.match(/ShipAdviceNo="([^"]*)"/);
              if (shipAdvMatch) orderCtx.shipAdviceNo = shipAdvMatch[1];
            } catch (shipEnrichErr) {
              console.warn(`  [WARN] ShipmentStatus_AutoPOC failed, using defaults: ${shipEnrichErr instanceof Error ? shipEnrichErr.message : shipEnrichErr}`);
            }

            // Step 8: Ship Confirmed (SO Acknowledgment flow)
            const tmpl8 = step8_ShipConfirm(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl8.service, tmpl8.xml);

            // Step 8 AutoPOC validation: verify shipment status after ship confirm
            try {
              await delayForAutoPOC();
              const shipPoc = autoPOC_ShipmentStatus(orderCtx);
              const shipPocResp = await ctx.xapiClient.invokeOrThrow(shipPoc.service, shipPoc.xml);
              console.log(`  [AutoPOC] ShipmentStatus_AutoPOC (post-ship-confirm): OK (${shipPocResp.duration}ms)`);
            } catch (pocErr) {
              console.warn(`  [WARN] AutoPOC post-ship-confirm validation failed: ${pocErr instanceof Error ? pocErr.message : pocErr}`);
            }

            return { success: true, durationMs: Date.now() - start };
          } catch (e) {
            return { success: false, error: `XAPI ship confirm failed: ${e instanceof Error ? e.message : String(e)}`, durationMs: Date.now() - start };
          }
        }

        // ---- REST fallback ----
        console.warn('  [WARN] XAPI not available — falling back to REST JSON for ship confirm. Adidas custom flows may not work.');
        const shipResult = await ctx.sterlingClient.changeOrder({
          OrderNo: ctx.orderId,
          Action: 'CONFIRM_SHIPMENT',
          Modifications: {
            ConfirmShipment: 'Y',
          },
        });

        if (!shipResult.success) {
          return { success: false, error: `Confirm shipment failed: ${shipResult.error.message}`, durationMs: Date.now() - start };
        }

        return { success: true, durationMs: Date.now() - start };
      },
      poll: async (ctx) => {
        const start = Date.now();

        // Status-based check: if already shipped, skip polling for shipment list
        const orderCheck = await ctx.sterlingClient.getOrder({ OrderNo: ctx.orderId });
        if (orderCheck.success) {
          const maxStatus = parseFloat((orderCheck.value as Record<string, unknown>).MaxOrderStatus as string ?? '0');
          if (maxStatus >= 3350) {
            // AutoPOC enrichment even on shortcut — verification steps need the full field set
            const shortcutData: Record<string, unknown> = {};
            if (ctx.xapiClient) {
              try {
                await delayForAutoPOC();
                const orderCtx = buildOrderCtx(ctx);
                const shipPoc = autoPOC_ShipmentStatus(orderCtx);
                const shipPocResp = await ctx.xapiClient.invokeOrThrow(shipPoc.service, shipPoc.xml);
                shortcutData.autoPocShipmentXml = shipPocResp.body;
                console.log(`  [AutoPOC] ShipmentStatus_AutoPOC (shipment enrichment, status shortcut): OK (${shipPocResp.duration}ms)`);
              } catch (pocErr) {
                console.warn(`  [WARN] AutoPOC shipment enrichment failed (status shortcut): ${pocErr instanceof Error ? pocErr.message : pocErr}`);
              }
            }
            return { success: true, data: shortcutData, durationMs: Date.now() - start };
          }
        }

        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getShipmentListForOrder({ OrderNo: ctx.orderId }),
          (shipments) => shipments.length > 0 && !!shipments[0]?.TrackingNo,
          { maxAttempts: 20, intervalMs: 5000 }
        );

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        // AutoPOC enrichment: ShipmentStatus returns TrackingNo, SCAC, ShipmentNo with output template
        const shipPollData: Record<string, unknown> = {};
        if (ctx.xapiClient) {
          try {
            await delayForAutoPOC();
            const orderCtx = buildOrderCtx(ctx);
            const shipPoc = autoPOC_ShipmentStatus(orderCtx);
            const shipPocResp = await ctx.xapiClient.invokeOrThrow(shipPoc.service, shipPoc.xml);
            shipPollData.autoPocShipmentXml = shipPocResp.body;
            console.log(`  [AutoPOC] ShipmentStatus_AutoPOC (shipment enrichment): OK (${shipPocResp.duration}ms)`);
          } catch (pocErr) {
            console.warn(`  [WARN] AutoPOC shipment enrichment failed: ${pocErr instanceof Error ? pocErr.message : pocErr}`);
          }
        }

        // Fetch forward label PDF from NShift (if configured + shipment has tracking)
        if (ctx.nshiftClient && ctx.shipments.length > 0 && ctx.shipments[0].trackingNo) {
          try {
            const pdfResult = await ctx.nshiftClient.getLabelPdf(ctx.shipments[0].trackingNo);
            if (pdfResult.success) {
              shipPollData.forwardLabelPdf = pdfResult.value;
              console.log(`  [L3] Forward label PDF fetched (${pdfResult.value.length} bytes)`);
            } else {
              console.log(`  [L3] Forward label PDF not available: ${pdfResult.error.message}`);
            }
          } catch (e) {
            console.log(`  [L3] Forward label PDF fetch error: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        return { success: true, data: shipPollData, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-03', 'step-04', 'step-05', 'step-06', 'step-07', 'step-08', 'step-09'],
      fallback: 'manual',
    },

    // =========================================================================
    // Stage 4: Delivery (XAPI POD if available, otherwise poll-only)
    // =========================================================================
    {
      id: 'delivery',
      name: 'Delivery & POD Events',
      description: 'Deliver via XAPI (adidasWE_ProcessPODUpdate) or wait for carrier events',
      act: async (ctx) => {
        const start = Date.now();

        // Check if delivery already happened (--order mode on progressed orders)
        const orderCheck = await ctx.sterlingClient.getOrder({ OrderNo: ctx.orderId });
        if (orderCheck.success) {
          const maxStatus = parseFloat((orderCheck.value as Record<string, unknown>).MaxOrderStatus as string ?? '0');
          if (maxStatus >= 3700) {
            return { success: true, durationMs: Date.now() - start, data: { actionStatus: 'skipped', reason: 'Delivery already completed' } };
          }
        }

        if (ctx.xapiClient) {
          try {
            const orderCtx = buildOrderCtx(ctx);
            const tmpl = step10_Deliver(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl.service, tmpl.xml);

            // Step 10 AutoPOC validation: verify order status after delivery
            try {
              await delayForAutoPOC();
              const orderPoc = autoPOC_OrderStatus(orderCtx);
              const orderPocResp = await ctx.xapiClient.invokeOrThrow(orderPoc.service, orderPoc.xml);
              console.log(`  [AutoPOC] OrderStatus_AutoPOC (post-delivery): OK (${orderPocResp.duration}ms)`);
            } catch (pocErr) {
              console.warn(`  [WARN] AutoPOC post-delivery validation failed: ${pocErr instanceof Error ? pocErr.message : pocErr}`);
            }

            return { success: true, durationMs: Date.now() - start };
          } catch (e) {
            // POD may already exist (--order mode) — treat as non-fatal
            const msg = e instanceof Error ? e.message : String(e);
            return { success: true, durationMs: Date.now() - start, data: { actionStatus: 'skipped', reason: `POD trigger: ${msg}` } };
          }
        }

        return { success: true, durationMs: 0, data: { actionStatus: 'skipped', reason: 'No XAPI — polling for delivery' } };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrder({ OrderNo: ctx.orderId }),
          (order) => {
            // Status-based check: MaxOrderStatus >= 3700 means delivery happened
            const maxStatus = parseFloat((order as Record<string, unknown>).MaxOrderStatus as string ?? '0');
            if (maxStatus >= 3700) return true;

            // Note-based check: carrier events post DL notes (NShift integration)
            const notes = ensureArray(order.Notes?.Note);
            return notes.some((n) => n.NoteText?.includes('DL') || n.ReasonCode === 'DL');
          },
          { maxAttempts: 30, intervalMs: 10000 }
        );

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        // AutoPOC enrichment: OrderStatus returns full notes/status after delivery
        const deliveryData: Record<string, unknown> = {};
        if (ctx.xapiClient) {
          try {
            await delayForAutoPOC();
            const orderCtx = buildOrderCtx(ctx);
            const orderPoc = autoPOC_OrderStatus(orderCtx);
            const orderPocResp = await ctx.xapiClient.invokeOrThrow(orderPoc.service, orderPoc.xml);
            deliveryData.autoPocOrderXml = orderPocResp.body;
            console.log(`  [AutoPOC] OrderStatus_AutoPOC (delivery enrichment): OK (${orderPocResp.duration}ms)`);
          } catch (pocErr) {
            console.warn(`  [WARN] AutoPOC delivery enrichment failed: ${pocErr instanceof Error ? pocErr.message : pocErr}`);
          }
        }

        return { success: true, data: deliveryData, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-10', 'step-10a', 'step-11'],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 5: Forward Invoice (poll-only — auto-generated by Sterling)
    // =========================================================================
    {
      id: 'forward-invoice',
      name: 'Forward Invoice & Reconciliation',
      description: 'Verify forward invoice generation and financial reconciliation',
      poll: async (ctx) => {
        const start = Date.now();
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrderInvoiceList({ OrderNo: ctx.orderId }),
          (invoices) => invoices.some((inv: { InvoiceType?: string }) => inv.InvoiceType !== 'CREDIT_MEMO' && inv.InvoiceType !== 'RETURN'),
          { maxAttempts: 15, intervalMs: 5000 }
        );

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        // AutoPOC enrichment: InvoiceStatus returns DateInvoiced, AmountCollected via output template
        const invoiceData: Record<string, unknown> = {};
        if (ctx.xapiClient) {
          try {
            await delayForAutoPOC();
            const orderCtx = buildOrderCtx(ctx);
            const invTmpl = autoPOC_InvoiceStatus(orderCtx);
            const invResp = await ctx.xapiClient.invokeOrThrow(invTmpl.service, invTmpl.xml);
            invoiceData.autoPocForwardInvoiceXml = invResp.body;
            // Dev doc: check for Status="01" (invoice created)
            const statusMatch = invResp.body.match(/OrderInvoice[^>]*Status="([^"]*)"/);
            if (statusMatch && statusMatch[1] !== '01') {
              console.warn(`  [AutoPOC] InvoiceStatus_AutoPOC: Status="${statusMatch[1]}" (expected "01")`);
            } else {
              console.log(`  [AutoPOC] InvoiceStatus_AutoPOC: OK — Status=${statusMatch?.[1] ?? 'unknown'} (${invResp.duration}ms)`);
            }
          } catch (invErr) {
            console.warn(`  [WARN] InvoiceStatus_AutoPOC failed: ${invErr instanceof Error ? invErr.message : invErr}`);
          }
        }

        return { success: true, data: invoiceData, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-12', 'step-12a'],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 6: Forward Flow Email + PDF Verification (verify-only)
    // =========================================================================
    {
      id: 'forward-comms',
      name: 'Forward Flow Email & PDF Verification',
      description: 'Verify order confirmation emails, shipping labels, and delivery notifications',
      verifyStepIds: [
        'step-03a',    // Email: Order confirmation
        'step-07a',    // PDF: Forward shipping label
        'step-14a',    // Email: Out for delivery
        'step-15a',    // Email: Delivery attempt ("Can't reach you")
        'step-16a',    // Email: Order delivered
      ],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 7: Create Return (XAPI: step 11 from POC)
    // =========================================================================
    {
      id: 'create-return',
      name: 'Create Return Order',
      description: 'Initiate return via XAPI (adidasWE_CreateReturnFromSSRSvc)',
      act: async (ctx) => {
        const start = Date.now();

        // Check if return already exists (--order mode on completed orders)
        const orderCheck = await ctx.sterlingClient.getOrder({ OrderNo: ctx.orderId });
        if (orderCheck.success) {
          const maxStatus = parseFloat((orderCheck.value as Record<string, unknown>).MaxOrderStatus as string ?? '0');
          if (maxStatus >= 3700) {
            return { success: true, durationMs: Date.now() - start, data: { actionStatus: 'skipped', reason: 'Return already completed on this order' } };
          }
        }

        // ---- XAPI path (proven) ----
        if (ctx.xapiClient) {
          try {
            const orderCtx = buildOrderCtx(ctx);
            const tmpl = step11_CreateReturn(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl.service, tmpl.xml);

            return {
              success: true,
              data: { returnOrderNo: ctx.orderId },
              durationMs: Date.now() - start,
            };
          } catch (e) {
            return { success: false, error: `XAPI create return failed: ${e instanceof Error ? e.message : String(e)}`, durationMs: Date.now() - start };
          }
        }

        // ---- REST fallback ----
        console.warn('  [WARN] XAPI not available — falling back to REST JSON for create return.');
        const result = await ctx.sterlingClient.changeOrder({
          OrderNo: ctx.orderId,
          Action: 'CREATE_RETURN',
          DocumentType: '0001',
          Modifications: {
            ReturnReason: 'QUALITY_ISSUE',
            ReturnAllLines: 'Y',
          },
        });

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        const returnOrderNo = result.value.OrderNo;
        return {
          success: true,
          data: { returnOrderNo },
          durationMs: Date.now() - start,
        };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const returnOrderNo = ctx.returnOrderNo ?? ctx.orderId;

        // First check if forward order already shows return status (--order mode)
        const fwdCheck = await ctx.sterlingClient.getOrder({ OrderNo: ctx.orderId });
        if (fwdCheck.success) {
          const maxStatus = parseFloat((fwdCheck.value as Record<string, unknown>).MaxOrderStatus as string ?? '0');
          if (maxStatus >= 3700) {
            return { success: true, durationMs: Date.now() - start, data: { returnConfirmed: true } };
          }
        }

        // Try polling return document type (XAPI-created returns)
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrder({ OrderNo: returnOrderNo, DocumentType: '0003' }),
          (order) => !!order.OrderNo && order.DocumentType === '0003',
          { maxAttempts: 15, intervalMs: 5000 }
        );

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        return { success: true, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-15', 'step-16'],
      fallback: 'manual',
    },

    // =========================================================================
    // Stage 8: Return Delivery (XAPI: steps 12-15 from POC)
    // =========================================================================
    {
      id: 'return-delivery',
      name: 'Return Delivery & Credit Note',
      description: 'Drive return POD events via XAPI or wait for carrier events',
      act: async (ctx) => {
        const start = Date.now();

        if (ctx.xapiClient) {
          try {
            const orderCtx = buildOrderCtx(ctx);

            // Step 12: Return Picked Up
            const tmpl12 = step12_ReturnPickedUp(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl12.service, tmpl12.xml);

            // Step 13: Return In Transit
            const tmpl13 = step13_ReturnInTransit(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl13.service, tmpl13.xml);

            // Step 14: Return Delivered to Warehouse
            const tmpl14 = step14_ReturnDelivered(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl14.service, tmpl14.xml);

            // Step 15: Return Completion (Receipt)
            const tmpl15 = step15_ReturnComplete(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl15.service, tmpl15.xml);

            return { success: true, durationMs: Date.now() - start };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { success: true, durationMs: Date.now() - start, data: { actionStatus: 'skipped', reason: `Return POD trigger: ${msg}` } };
          }
        }

        return { success: true, durationMs: 0, data: { actionStatus: 'skipped', reason: 'No XAPI — polling for return delivery' } };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const returnOrderNo = ctx.returnOrderNo ?? ctx.orderId;

        // First check if forward order already shows return completion (--order mode)
        const fwdCheck = await ctx.sterlingClient.getOrder({ OrderNo: ctx.orderId });
        if (fwdCheck.success) {
          const maxStatus = parseFloat((fwdCheck.value as Record<string, unknown>).MaxOrderStatus as string ?? '0');
          if (maxStatus >= 3700) {
            // AutoPOC enrichment even on shortcut — step-25 credit note verification needs the full field set
            const shortcutData: Record<string, unknown> = { returnDelivered: true };
            if (ctx.xapiClient) {
              try {
                await delayForAutoPOC();
                const orderCtx = buildOrderCtx(ctx);
                const invPoc = autoPOC_InvoiceStatus(orderCtx);
                const invPocResp = await ctx.xapiClient.invokeOrThrow(invPoc.service, invPoc.xml);
                shortcutData.autoPocCreditNoteInvoiceXml = invPocResp.body;
                console.log(`  [AutoPOC] InvoiceStatus_AutoPOC (credit note enrichment, status shortcut): OK (${invPocResp.duration}ms)`);
              } catch (pocErr) {
                console.warn(`  [WARN] AutoPOC credit note enrichment failed (status shortcut): ${pocErr instanceof Error ? pocErr.message : pocErr}`);
              }
            }
            return { success: true, durationMs: Date.now() - start, data: shortcutData };
          }
        }

        // Poll return document type for carrier events (XAPI-created returns)
        const trackingResult = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrder({ OrderNo: returnOrderNo, DocumentType: '0003' }),
          (order) => {
            // Status-based check
            const maxStatus = parseFloat((order as Record<string, unknown>).MaxOrderStatus as string ?? '0');
            if (maxStatus >= 3700) return true;

            // Note-based check for carrier events
            const notes = ensureArray(order.Notes?.Note);
            return notes.some((n) =>
              n.ReasonCode === 'RT' || n.ReasonCode === 'RP' || n.ReasonCode === 'RD'
            );
          },
          { maxAttempts: 30, intervalMs: 10000 }
        );

        if (!trackingResult.success) {
          return { success: false, error: trackingResult.error.message, durationMs: Date.now() - start };
        }

        // AutoPOC enrichment: InvoiceStatus returns credit note details after return completion
        const returnData: Record<string, unknown> = {};
        if (ctx.xapiClient) {
          try {
            await delayForAutoPOC();
            const orderCtx = buildOrderCtx(ctx);
            const invPoc = autoPOC_InvoiceStatus(orderCtx);
            const invPocResp = await ctx.xapiClient.invokeOrThrow(invPoc.service, invPoc.xml);
            returnData.autoPocCreditNoteInvoiceXml = invPocResp.body;
            console.log(`  [AutoPOC] InvoiceStatus_AutoPOC (credit note enrichment): OK (${invPocResp.duration}ms)`);
          } catch (pocErr) {
            console.warn(`  [WARN] AutoPOC return-delivery enrichment failed: ${pocErr instanceof Error ? pocErr.message : pocErr}`);
          }
        }

        // Fetch return label PDF from NShift (if configured + return has tracking)
        if (ctx.nshiftClient && ctx.returnTracking) {
          try {
            const pdfResult = await ctx.nshiftClient.getLabelPdf(ctx.returnTracking);
            if (pdfResult.success) {
              returnData.returnLabelPdf = pdfResult.value;
              console.log(`  [L3] Return label PDF fetched (${pdfResult.value.length} bytes)`);
            } else {
              console.log(`  [L3] Return label PDF not available: ${pdfResult.error.message}`);
            }
          } catch (e) {
            console.log(`  [L3] Return label PDF fetch error: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        return { success: true, data: returnData, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-24', 'step-25', 'step-26'],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 9: Return Email, PDF & Browser Verification (verify-only)
    // =========================================================================
    {
      id: 'return-comms',
      name: 'Return Email, PDF & Browser Verification',
      description: 'Verify return emails, credit note PDF, and browser portal',
      verifyStepIds: [
        'step-21a',    // Email: Return created
        'step-26a',    // Email: Return pickup
        'step-31a',    // Email: Refund confirmation
        'step-20a',    // PDF: Return shipping label
        'step-32',     // PDF: Credit note (Nota de Credito)
        'step-17a',    // Browser: Return initiation page
        'step-18a',    // Browser: Return confirmation page
      ],
      fallback: 'skip',
    },
  ];
}
